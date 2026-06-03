/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesApu (Sony Audio Processing Unit - JIT-Optimized)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the SNES Audio Processing Unit (APU). It acts as the local system bus 
 * for sound components, orchestrating execution rates between the Sony SPC700 CPU,
 * the mixing DSP, and the three internal hardware Timers.
 * 
 * SOLID Principles:
 * - SRP: Exclusively coordinates execution timing and register mappings.
 * - DIP: Injects sub-processors and handles memory initialization safely.
 */

class SnesApu {
    /**
     * Pre-compiled SNES SPC700 IPL Boot ROM (64 bytes).
     * Allocated once in the module scope.
     */
    static get BOOT_ROM() {
        return new Uint8Array([
            0xcd, 0xef, 0xbd, 0xe8, 0x00, 0xc6, 0x1d, 0xd0, 0xfc, 0x8f, 0xaa, 0xf4, 0x8f, 0xbb, 0xf5, 0x78,
            0xcc, 0xf4, 0xd0, 0xfb, 0x2f, 0x19, 0xeb, 0xf4, 0xd0, 0xfc, 0x7e, 0xf4, 0xd0, 0x0b, 0xe4, 0xf5,
            0xcb, 0xf4, 0xd7, 0x00, 0xfc, 0xd0, 0xf3, 0xab, 0x01, 0x10, 0xef, 0x7e, 0xf4, 0x10, 0xeb, 0xba,
            0xf6, 0xda, 0x00, 0xba, 0xf4, 0xc4, 0xf4, 0xdd, 0x5d, 0xd0, 0xdb, 0x1f, 0x00, 0x00, 0xc0, 0xff
        ]);
    }

    /**
     * @param {Object} snes - Parent system aggregate (Snes).
     */
    constructor(snes) {
        this.snes = snes;

        // CRITICAL: Initialize RAM and communications ports FIRST before instantiating sub-processors
        this.ram = new Uint8Array(0x10000);
        this.spcWritePorts = new Uint8Array(4);
        this.spcReadPorts = new Uint8Array(6);

        // Encapsulate hardware timers
        this.timers = {
            t1: { interval: 0, divider: 0, target: 0, counter: 0, enabled: false },
            t2: { interval: 0, divider: 0, target: 0, counter: 0, enabled: false },
            t3: { interval: 0, divider: 0, target: 0, counter: 0, enabled: false }
        };

        this.dspAdr = 0;
        this.dspRomReadable = true;
        this.cycles = 0;

        // Now safe to instantiate: SnesSpc will read fffe/ffff safely from the initialized this.ram
        this.spc = new SnesSpc(this);
        this.dsp = new SnesDsp(this);

        this.reset();
    }

    /**
     * System APU reset. Clears RAM and structures.
     */
    reset() {
        this.ram.fill(0);
        this.spcWritePorts.fill(0);
        this.spcReadPorts.fill(0);

        this.dspAdr = 0;
        this.dspRomReadable = true;
        this.cycles = 0;

        // Reset sub-components
        this.spc.reset();
        this.dsp.reset();

        // Zero out timers structure
        for (const key in this.timers) {
            const t = this.timers[key];
            t.interval = 0;
            t.divider = 0;
            t.target = 0;
            t.counter = 0;
            t.enabled = false;
        }
    }

    /**
     * Executes one master clock step of the audio system.
     * GC-FREE & High-Performance: Timer processing is fully inlined.
     */
    cycle() {
        this.spc.cycle();

        // DSP runs at 1/32 rate of the master clock (32000Hz approx)
        if ((this.cycles & 0x1f) === 0) {
            this.dsp.cycle();
        }

        // Inline T1 processing (prevents 1,000,000+ function calls per second)
        const t1 = this.timers.t1;
        if (t1.interval === 0) {
            t1.interval = 128;
            if (t1.enabled) {
                t1.divider = (t1.divider + 1) & 0xff;
                if (t1.divider === t1.target) {
                    t1.divider = 0;
                    t1.counter = (t1.counter + 1) & 0xf;
                }
            }
        }
        t1.interval--;

        // Inline T2 processing (prevents 1,000,000+ function calls per second)
        const t2 = this.timers.t2;
        if (t2.interval === 0) {
            t2.interval = 128;
            if (t2.enabled) {
                t2.divider = (t2.divider + 1) & 0xff;
                if (t2.divider === t2.target) {
                    t2.divider = 0;
                    t2.counter = (t2.counter + 1) & 0xf;
                }
            }
        }
        t2.interval--;

        // Inline T3 processing (prevents 1,000,000+ function calls per second)
        const t3 = this.timers.t3;
        if (t3.interval === 0) {
            t3.interval = 16;
            if (t3.enabled) {
                t3.divider = (t3.divider + 1) & 0xff;
                if (t3.divider === t3.target) {
                    t3.divider = 0;
                    t3.counter = (t3.counter + 1) & 0xf;
                }
            }
        }
        t3.interval--;

        this.cycles++;
    }

    /**
     * Reads from the APU bus address space (called by SPC700 or main CPU).
     */
    read(adr) {
        const addr = adr & 0xffff;

        switch (addr) {
            case 0xf0:
            case 0xf1:
            case 0xfa:
            case 0xfb:
            case 0xfc:
                return 0; // Not readable registers
            case 0xf2:
                return this.dspAdr;
            case 0xf3:
                return this.dsp.read(this.dspAdr & 0x7f);
            case 0xf4:
            case 0xf5:
            case 0xf6:
            case 0xf7:
            case 0xf8:
            case 0xf9:
                return this.spcReadPorts[addr - 0xf4];
            case 0xfd: {
                const val = this.timers.t1.counter;
                this.timers.t1.counter = 0;
                return val;
            }
            case 0xfe: {
                const val = this.timers.t2.counter;
                this.timers.t2.counter = 0;
                return val;
            }
            case 0xff: {
                const val = this.timers.t3.counter;
                this.timers.t3.counter = 0;
                return val;
            }
        }

        // Map Boot ROM over RAM space if active
        if (addr >= 0xffc0 && this.dspRomReadable) {
            return SnesApu.BOOT_ROM[addr & 0x3f];
        }

        return this.ram[addr];
    }

    /**
     * Writes to the APU bus address space.
     */
    write(adr, value) {
        const addr = adr & 0xffff;

        switch (addr) {
            case 0xf0: // Test register (Not emulated)
                break;
            case 0xf1: {
                // Handle timer resets upon toggling enable states
                if (!this.timers.t1.enabled && (value & 0x01) > 0) {
                    this.timers.t1.divider = 0;
                    this.timers.t1.counter = 0;
                }
                if (!this.timers.t2.enabled && (value & 0x02) > 0) {
                    this.timers.t2.divider = 0;
                    this.timers.t2.counter = 0;
                }
                if (!this.timers.t3.enabled && (value & 0x04) > 0) {
                    this.timers.t3.divider = 0;
                    this.timers.t3.counter = 0;
                }

                this.timers.t1.enabled = (value & 0x01) > 0;
                this.timers.t2.enabled = (value & 0x02) > 0;
                this.timers.t3.enabled = (value & 0x04) > 0;
                
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
            case 0xf2:
                this.dspAdr = value;
                break;
            case 0xf3:
                if (this.dspAdr < 0x80) {
                    this.dsp.write(this.dspAdr, value);
                }
                break;
            case 0xf4:
            case 0xf5:
            case 0xf6:
            case 0xf7:
                this.spcWritePorts[addr - 0xf4] = value;
                break;
            case 0xf8:
            case 0xf9:
                this.spcReadPorts[addr - 0xf4] = value;
                break;
            case 0xfa:
                this.timers.t1.target = value;
                break;
            case 0xfb:
                this.timers.t2.target = value;
                break;
            case 0xfc:
                this.timers.t3.target = value;
                break;
        }

        this.ram[addr] = value;
    }

    /**
     * Resamples generated DSP audio samples into EGGStation standard output channels.
     */
    setSamples(left, right, sampleCount) {
        const step = 534 / sampleCount;
        let totalOffset = 0;
        
        for (let i = 0; i < sampleCount; i++) {
            left[i]  = this.dsp.samplesL[totalOffset & 0xffff];
            right[i] = this.dsp.samplesR[totalOffset & 0xffff];
            totalOffset += step;
        }
        
        this.dsp.sampleOffset = 0;
    }
}

// Backward Compatibility Alias
window.Apu = SnesApu;