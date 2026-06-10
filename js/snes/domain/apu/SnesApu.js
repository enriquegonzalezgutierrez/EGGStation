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

            this.ram = new Uint8Array(0x10000);
            this.spcWritePorts = new Uint8Array(4);
            this.spcReadPorts = new Uint8Array(6);

            this.timer1 = new SnesApuTimer(128); 
            this.timer2 = new SnesApuTimer(128); 
            this.timer3 = new SnesApuTimer(16);  

            this.bootRom = new Uint8Array([
                0xcd, 0xef, 0xbd, 0xe8, 0x00, 0xc6, 0x1d, 0xd0, 0xfc, 0x8f, 0xaa, 0xf4, 0x8f, 0xbb, 0xf5, 0x78,
                0xcc, 0xf4, 0xd0, 0xfb, 0x2f, 0x19, 0xeb, 0xf4, 0xd0, 0xfc, 0x7e, 0xf4, 0xd0, 0x0b, 0xe4, 0xf5,
                0xcb, 0xf4, 0xd7, 0x00, 0xfc, 0xd0, 0xf3, 0xab, 0x01, 0x10, 0xef, 0x7e, 0xf4, 0x10, 0xeb, 0xba,
                0xf6, 0xda, 0x00, 0xba, 0xf4, 0xc4, 0xf4, 0xdd, 0x5d, 0xd0, 0xdb, 0x1f, 0x00, 0x00, 0xc0, 0xff
            ]);

            this.dspAdr = 0;
            this.dspRomReadable = true;
            this.cycles = 0;

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

            if ((this.cycles & 0x1f) === 0) {
                this.dsp.cycle();
            }

            this.timer1.tick();
            this.timer2.tick();
            this.timer3.tick();

            // Periodic telemetry check (Outputs SPC700 PC once every ~50,000 ticks)
            if (this.cycles % 50000 === 0) {
                const pc = this.spc.br[0]; // SPC700 PC Register
                const sp = this.spc.r[3];  // SPC700 SP Register
                const iplActive = this.dspRomReadable;
            }

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

        // ========================================================================
        // ENCAPSULATED STATE SERIALIZATION (SOLID SRP / MEMENTO PATTERN)
        // ========================================================================

        /**
         * Serializes the entire physical APU, SPC700 registers, and DSP memory states.
         * Removes structural state-mapping burdens from the Orchestrator (SRP).
         * 
         * @returns {Object} Packed APU state object.
         */
        serializeState() {
            return {
                ram: Array.from(this.ram),
                spc_r: Array.from(this.spc.r),
                spc_br: Array.from(this.spc.br),
                spc_flags: {
                    n: this.spc.n,
                    v: this.spc.v,
                    p: this.spc.p,
                    b: this.spc.b,
                    h: this.spc.h,
                    i: this.spc.i,
                    z: this.spc.z,
                    c: this.spc.c
                },
                dsp_ram: Array.from(this.dsp.ram)
            };
        }

        /**
         * Restores the physical APU sound states back to a saved state.
         * 
         * @param {Object} state - Saved APU state.
         */
        deserializeState(state) {
            if (!state) return;
            this.ram.set(state.ram);
            
            // Restore SPC700 Registers
            this.spc.r.set(state.spc_r);
            this.spc.br.set(state.spc_br);
            this.spc.n = state.spc_flags.n;
            this.spc.v = state.spc_flags.v;
            this.spc.p = state.spc_flags.p;
            this.spc.b = state.spc_flags.b;
            this.spc.h = state.spc_flags.h;
            this.spc.i = state.spc_flags.i;
            this.spc.z = state.spc_flags.z;
            this.spc.c = state.spc_flags.c;

            // Restore WASM DSP Registers
            this.dsp.ram.set(state.dsp_ram);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesApu;
    } else if (typeof window !== 'undefined') {
        window.SnesApu = SnesApu;
        window.Apu = SnesApu; 
    }
}