/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesApu (Audio Processing Unit Orchestrator)
 * 
 * ROLE:
 * Synchronizes execution clocks between the SPC700 sound processor,
 * the DSP audio synthesizer, and the internal hardware timers.
 * 
 * SOLID PRINCIPLES:
 * - Open/Closed Principle (OCP): Dynamic peripheral structures can be added or 
 *   modified without altering core APU cycle synchronization structures.
 */

{
    class SnesApu {
        /**
         * @param {Snes} snes - Unified system main controller context.
         */
        constructor(snes) {
            this.snes = snes;

            // 1. Allocate memory buffers and registers first (GC Free)
            this.ram = new Uint8Array(0x10000);
            this.spcWritePorts = new Uint8Array(4);
            this.spcReadPorts = new Uint8Array(6);

            // 2. Initialize modular hardware timers
            this.timer1 = new SnesApuTimer(128); // Timer 1: 8kHz interval divisor
            this.timer2 = new SnesApuTimer(128); // Timer 2: 8kHz interval divisor
            this.timer3 = new SnesApuTimer(16);  // Timer 3: 64kHz interval divisor

            // 3. Set up the Boot ROM binary
            this.bootRom = new Uint8Array([
                0xcd, 0xef, 0xbd, 0xe8, 0x00, 0xc6, 0x1d, 0xd0, 0xfc, 0x8f, 0xaa, 0xf4, 0x8f, 0xbb, 0xf5, 0x78,
                0xcc, 0xf4, 0xd0, 0xfb, 0x2f, 0x19, 0xeb, 0xf4, 0xd0, 0xfc, 0x7e, 0xf4, 0xd0, 0x0b, 0xe4, 0xf5,
                0xcb, 0xf4, 0xd7, 0x00, 0xfc, 0xd0, 0xf3, 0xab, 0x01, 0x10, 0xef, 0x7e, 0xf4, 0x10, 0xeb, 0xba,
                0xf6, 0xda, 0x00, 0xba, 0xf4, 0xc4, 0xf4, 0xdd, 0x5d, 0xd0, 0xdb, 0x1f, 0x00, 0x00, 0xc0, 0xff
            ]);

            this.dspAdr = 0;
            this.dspRomReadable = true;
            this.cycles = 0;

            // 4. Instantiate sound CPU and DSP after all dependency structures are ready
            this.spc = new SnesSpc(this);
            this.dsp = new Dsp(this);

            this.reset();
        }

        reset() {
            this.ram.fill(0);
            this.spcWritePorts.fill(0);
            this.spcReadPorts.fill(0);

            this.dspAdr = 0;
            this.dspRomReadable = true;

            this.spc.reset();
            this.dsp.reset();

            this.timer1.reset();
            this.timer2.reset();
            this.timer3.reset();

            this.cycles = 0;
        }

        /**
         * Standard core sound cycle synchronization tick.
         */
        cycle() {
            this.spc.cycle();

            // DSP coordinates updates once every 32 audio cycles
            if ((this.cycles & 0x1f) === 0) {
                this.dsp.cycle();
            }

            // Sync high-speed modular timers
            this.timer1.tick();
            this.timer2.tick();
            this.timer3.tick();

            this.cycles++;
        }

        /**
         * Read routine mapping SPC700 physical control registers.
         */
        read(address) {
            const adr = address & 0xffff;

            switch (adr) {
                case 0xf0:
                case 0xf1:
                case 0xfa:
                case 0xfb:
                case 0xfc: {
                    return 0;
                }
                case 0xf2: {
                    return this.dspAdr;
                }
                case 0xf3: {
                    return this.dsp.read(this.dspAdr & 0x7f);
                }
                case 0xf4:
                case 0xf5:
                case 0xf6:
                case 0xf7:
                case 0xf8:
                case 0xf9: {
                    return this.spcReadPorts[adr - 0xf4];
                }
                case 0xfd: {
                    return this.timer1.readCounter();
                }
                case 0xfe: {
                    return this.timer2.readCounter();
                }
                case 0xff: {
                    return this.timer3.readCounter();
                }
            }

            if (adr >= 0xffc0 && this.dspRomReadable) {
                return this.bootRom[adr & 0x3f];
            }

            return this.ram[adr];
        }

        /**
         * Write routine mapping SPC700 physical control registers.
         */
        write(address, value) {
            const adr = address & 0xffff;

            switch (adr) {
                case 0xf0: {
                    break;
                }
                case 0xf1: {
                    this.timer1.setEnabled((value & 0x01) > 0);
                    this.timer2.setEnabled((value & 0x02) > 0);
                    this.timer3.setEnabled((value & 0x04) > 0);
                    
                    this.dspRomReadable = (value & 0x80) > 0;
                    
                    if ((value & 0x10) > 0) {
                        this.spcReadPorts[0] = 0;
                        this.spcReadPorts[1] = 0;
                    }
                    if ((value & 0x20) > 0) {
                        this.spcReadPorts[2] = 0;
                        this.spcReadPorts[3] = 0;
                    }
                    break;
                }
                case 0xf2: {
                    this.dspAdr = value;
                    break;
                }
                case 0xf3: {
                    if (this.dspAdr < 0x80) {
                        this.dsp.write(this.dspAdr, value);
                    }
                    break;
                }
                case 0xf4:
                case 0xf5:
                case 0xf6:
                case 0xf7: {
                    this.spcWritePorts[adr - 0xf4] = value;
                    break;
                }
                case 0xf8:
                case 0xf9: {
                    this.spcReadPorts[adr - 0xf4] = value;
                    break;
                }
                case 0xfa: {
                    this.timer1.target = value;
                    break;
                }
                case 0xfb: {
                    this.timer2.target = value;
                    break;
                }
                case 0xfc: {
                    this.timer3.target = value;
                    break;
                }
            }

            this.ram[adr] = value;
        }

        /**
         * Direct output transfer function copying audio samples into the sound pipeline.
         */
        setSamples(left, right, sampleCount) {
            const add = 534 / sampleCount;
            let total = 0;
            for (let i = 0; i < sampleCount; i++) {
                left[i] = this.dsp.samplesL[total & 0xffff];
                right[i] = this.dsp.samplesR[total & 0xffff];
                total += add;
            }
            this.dsp.sampleOffset = 0;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesApu;
    } else if (typeof window !== 'undefined') {
        window.SnesApu = SnesApu;
        window.Apu = SnesApu; // Backward compatibility alias
    }
}