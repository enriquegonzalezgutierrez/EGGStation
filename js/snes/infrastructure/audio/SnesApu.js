/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES APU Container & Hardware Timers
 * 
 * Wraps the 8-bit SPC700 CPU, DSP sound mixer registers, and 64KB APU RAM.
 * Emulates the 64-byte IPL Boot ROM sitting at 0xFFC0-0xFFFF, and the 
 * three hardware interval timers (Timer 1/2 at 8KHz, Timer 3 at 64KHz).
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on APU-side 
 *   hardware address decodings, communication ports ($2140-$2143), and timer ticks.
 */

class SnesApu {
    constructor() {
        // Dedicated 64KB APU Local RAM
        this.ram = new Uint8Array(0x10000);

        // Standard 64-byte IPL (Initial Program Load) Boot ROM
        this.bootRom = new Uint8Array([
            0xCD, 0xEF, 0xBD, 0xE8, 0x00, 0xC6, 0x1D, 0xD0, 0xFC, 0x8F, 0xAA, 0xf4, 0x8F, 0xBB, 0xf5, 0x78,
            0xCC, 0xf4, 0xD0, 0xFB, 0x2F, 0x19, 0xEB, 0xf4, 0xD0, 0xFC, 0x7E, 0xf4, 0xD0, 0x0B, 0xE4, 0xf5,
            0xCB, 0xf4, 0xD7, 0x00, 0xFC, 0xD0, 0xF3, 0xAB, 0x01, 0x10, 0xEF, 0x7E, 0xf4, 0x10, 0xEB, 0xBA,
            0xF6, 0xDA, 0x00, 0xBA, 0xf4, 0xC4, 0xf4, 0xDD, 0x5D, 0xD0, 0xDB, 0x1F, 0x00, 0x00, 0xC0, 0xff
        ]);

        // Decoupled SPC700 CPU Orchestrator & DSP Mixer references (bound at setup)
        this.spc = null;
        this.dsp = null;

        // Shared CPU communication ports
        this.writePorts = new Uint8Array(4); // Master CPU to APU (written by Master, read by APU)
        this.readPorts = new Uint8Array(6);  // APU to Master CPU (written by APU, read by Master)

        // Sound state flags
        this.dspAddress = 0;
        this.dspRomReadable = true;

        // Timer 1 (Ticks every 128 APU clocks)
        this.t1Int = 0;
        this.t1Div = 0;
        this.t1Target = 0;
        this.t1Counter = 0;
        this.t1Enabled = false;

        // Timer 2 (Ticks every 128 APU clocks)
        this.t2Int = 0;
        this.t2Div = 0;
        this.t2Target = 0;
        this.t2Counter = 0;
        this.t2Enabled = false;

        // Timer 3 (Ticks every 16 APU clocks)
        this.t3Int = 0;
        this.t3Div = 0;
        this.t3Target = 0;
        this.t3Counter = 0;
        this.t3Enabled = false;
        
        // Global APU cycle tracker
        this.cycles = 0;
    }

    /**
     * Resets APU, registers, timers, and connected co-processors.
     */
    reset() {
        this.ram.fill(0);
        this.writePorts.fill(0);
        this.readPorts.fill(0);

        this.dspAddress = 0;
        this.dspRomReadable = true;

        // Reset Timers
        this.t1Int = 0; this.t1Div = 0; this.t1Target = 0; this.t1Counter = 0; this.t1Enabled = false;
        this.t2Int = 0; this.t2Div = 0; this.t2Target = 0; this.t2Counter = 0; this.t2Enabled = false;
        this.t3Int = 0; this.t3Div = 0; this.t3Target = 0; this.t3Counter = 0; this.t3Enabled = false;
        
        this.cycles = 0;

        if (this.spc) this.spc.reset();
        if (this.dsp) this.dsp.reset();
    }

    /**
     * Binds CPU and DSP references (Dependency Injection).
     * @param {Spc700} spc 
     * @param {SnesDsp} dsp 
     */
    bindModules(spc, dsp) {
        this.spc = spc;
        this.dsp = dsp;
    }

    /**
     * Master cycle of the sound unit. Synchronizes CPU, DSP, and timers.
     */
    cycle() {
        // Step the SPC700 CPU
        if (this.spc) {
            if (this.spc.cyclesLeft <= 0) {
                this.spc.executeOne();
            }
            this.spc.cyclesLeft--;
        }

        // The SNES DSP runs at 1/32 of the APU speed (ticks once every 32 APU cycles)
        if ((this.cycles & 0x1F) === 0) {
            if (this.dsp) this.dsp.cycle();
        }

        // Step hardware interval timers
        this.tickTimers();
        
        this.cycles++;
    }

    // ========================================================================
    // COUPLING PORT GETTERS/SETTERS (For Master CPU Bus interface)
    // ========================================================================

    /**
     * Invoked by SnesBus.js to read APU output registers ($2140-$2143).
     * @param {number} index - 0 to 3
     */
    readPort(index) {
        return this.readPorts[index & 3];
    }

    /**
     * Invoked by SnesBus.js to write APU input registers ($2140-$2143).
     * @param {number} index - 0 to 3
     * @param {number} value - 8-bit byte
     */
    writePort(index, value) {
        this.writePorts[index & 3] = value & 0xFF;
    }

    // ========================================================================
    // APU-SIDE ADDRESS PORT DECODERS (Internal 64KB Map)
    // ========================================================================

    read(adr) {
        adr &= 0xFFFF;

        switch (adr) {
            case 0xF2: return this.dspAddress;
            case 0xF3: return this.dsp ? this.dsp.read(this.dspAddress & 0x7F) : 0;
            
            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7:
            case 0xF8:
            case 0xF9:
                return this.writePorts[adr - 0xF4]; // SPC reads bytes written by Master CPU

            case 0xFD: {
                const val = this.t1Counter;
                this.t1Counter = 0; // Reading a timer counter clears it
                return val;
            }
            case 0xFE: {
                const val = this.t2Counter;
                this.t2Counter = 0;
                return val;
            }
            case 0xFF: {
                const val = this.t3Counter;
                this.t3Counter = 0;
                return val;
            }
        }

        // Map IPL Boot ROM if active
        if (adr >= 0xFFC0 && this.dspRomReadable) {
            return this.bootRom[adr & 0x3F];
        }

        return this.ram[adr];
    }

    write(adr, value) {
        adr &= 0xFFFF;
        value &= 0xFF;

        switch (adr) {
            case 0xF1: {
                // Timer enables and IPL ROM read status
                if (!this.t1Enabled && (value & 0x01) > 0) { this.t1Div = 0; this.t1Counter = 0; }
                if (!this.t2Enabled && (value & 0x02) > 0) { this.t2Div = 0; this.t2Counter = 0; }
                if (!this.t3Enabled && (value & 0x04) > 0) { this.t3Div = 0; this.t3Counter = 0; }

                this.t1Enabled = (value & 0x01) > 0;
                this.t2Enabled = (value & 0x02) > 0;
                this.t3Enabled = (value & 0x04) > 0;
                this.dspRomReadable = (value & 0x80) > 0;
                
                // Clear port status flags
                if ((value & 0x10) > 0) { this.readPorts[0] = 0; this.readPorts[1] = 0; }
                if ((value & 0x20) > 0) { this.readPorts[2] = 0; this.readPorts[3] = 0; }
                break;
            }

            case 0xF2: {
                this.dspAddress = value;
                break;
            }

            case 0xF3: {
                if (this.dsp && this.dspAddress < 0x80) {
                    this.dsp.write(this.dspAddress, value);
                }
                break;
            }

            case 0xF4:
            case 0xF5:
            case 0xF6:
            case 0xF7: {
                // SPC writes bytes to readPorts (read by Master CPU)
                this.readPorts[adr - 0xF4] = value;
                break;
            }

            case 0xFA: this.t1Target = value; break;
            case 0xFB: this.t2Target = value; break;
            case 0xFC: this.t3Target = value; break;
        }

        this.ram[adr] = value;
    }

    // ========================================================================
    // HARDWARE TIMER CLOCK INTERFACES
    // ========================================================================

    /**
     * Steps the physical APU timers on each CPU cycle.
     */
    tickTimers() {
        // --- Timer 1 (Ticks every 128 APU cycles) ---
        if (this.t1Int === 0) {
            this.t1Int = 128;
            if (this.t1Enabled) {
                this.t1Div = (this.t1Div + 1) & 0xFF;
                if (this.t1Div === this.t1Target) {
                    this.t1Div = 0;
                    this.t1Counter = (this.t1Counter + 1) & 0x0F;
                }
            }
        }
        this.t1Int--;

        // --- Timer 2 (Ticks every 128 APU cycles) ---
        if (this.t2Int === 0) {
            this.t2Int = 128;
            if (this.t2Enabled) {
                this.t2Div = (this.t2Div + 1) & 0xFF;
                if (this.t2Div === this.t2Target) {
                    this.t2Div = 0;
                    this.t2Counter = (this.t2Counter + 1) & 0x0F;
                }
            }
        }
        this.t2Int--;

        // --- Timer 3 (Ticks every 16 APU cycles) ---
        if (this.t3Int === 0) {
            this.t3Int = 16;
            if (this.t3Enabled) {
                this.t3Div = (this.t3Div + 1) & 0xFF;
                if (this.t3Div === this.t3Target) {
                    this.t3Div = 0;
                    this.t3Counter = (this.t3Counter + 1) & 0x0F;
                }
            }
        }
        this.t3Int--;
    }
}