/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sony SPC700 APU Registers Entity
 * 
 * Encapsulates the core register state of the 8-bit SPC700 sound processor.
 * Manages the Accumulator (A), Index Registers (X, Y), Stack Pointer (SP),
 * Program Counter (PC), and Processor Status Word (PSW) status flags.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates register storage and PSW
 *   packing/unpacking logic from CPU execution and instruction decoding.
 */

// Processor Status Word Flag Bitmasks
const Spc700Flags = {
    N: 0x80, // Bit 7: Negative (Sign)
    V: 0x40, // Bit 6: Overflow
    P: 0x20, // Bit 5: Direct Page Select (0 = 0x0000, 1 = 0x0100)
    B: 0x10, // Bit 4: Break
    H: 0x08, // Bit 3: Half Carry
    I: 0x04, // Bit 2: Interrupt Enable
    Z: 0x02, // Bit 1: Zero
    C: 0x01  // Bit 0: Carry
};

class Spc700Registers {
    constructor() {
        // --- Core 8-bit registers ---
        this.a = 0;  // Accumulator
        this.x = 0;  // Index Register X
        this.y = 0;  // Index Register Y
        this.sp = 0; // Stack Pointer (always refers to Page 1: 0x0100 - 0x01FF)

        // --- Core 16-bit register ---
        this.pc = 0; // 16-bit Program Counter

        // --- Processor Status Word Flags ---
        this.n = false;
        this.v = false;
        this.p = false;
        this.b = false;
        this.h = false;
        this.i = false;
        this.z = false;
        this.c = false;
    }

    /**
     * Resets registers to cold-boot defaults.
     * Default entry PC point is latched on boot from IPL vectors (0xFFFE-0xFFFF).
     */
    reset() {
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.sp = 0;
        this.pc = 0;

        this.n = false;
        this.v = false;
        this.p = false;
        this.b = false;
        this.h = false;
        this.i = false;
        this.z = false;
        this.c = false;
    }

    // ========================================================================
    // PROCESSOR STATUS WORD (PSW) ACCESSORS
    // ========================================================================

    /**
     * Packs individual status flags into an 8-bit PSW byte.
     * @returns {number} 8-bit status byte
     */
    get psw() {
        let value = 0;
        value |= this.n ? Spc700Flags.N : 0;
        value |= this.v ? Spc700Flags.V : 0;
        value |= this.p ? Spc700Flags.P : 0;
        value |= this.b ? Spc700Flags.B : 0;
        value |= this.h ? Spc700Flags.H : 0;
        value |= this.i ? Spc700Flags.I : 0;
        value |= this.z ? Spc700Flags.Z : 0;
        value |= this.c ? Spc700Flags.C : 0;
        return value;
    }

    /**
     * Unpacks an 8-bit status byte into individual flags.
     * @param {number} value - 8-bit status byte
     */
    set psw(value) {
        this.n = (value & Spc700Flags.N) > 0;
        this.v = (value & Spc700Flags.V) > 0;
        this.p = (value & Spc700Flags.P) > 0;
        this.b = (value & Spc700Flags.B) > 0;
        this.h = (value & Spc700Flags.H) > 0;
        this.i = (value & Spc700Flags.I) > 0;
        this.z = (value & Spc700Flags.Z) > 0;
        this.c = (value & Spc700Flags.C) > 0;
    }

    // ========================================================================
    // STATE SNAPSHOTS (MEMENTO)
    // ========================================================================

    exportState() {
        return {
            a: this.a,
            x: this.x,
            y: this.y,
            sp: this.sp,
            pc: this.pc,
            n: this.n,
            v: this.v,
            p: this.p,
            b: this.b,
            h: this.h,
            i: this.i,
            z: this.z,
            c: this.c
        };
    }

    importState(state) {
        this.a = state.a & 0xFF;
        this.x = state.x & 0xFF;
        this.y = state.y & 0xFF;
        this.sp = state.sp & 0xFF;
        this.pc = state.pc & 0xFFFF;

        this.n = !!state.n;
        this.v = !!state.v;
        this.p = !!state.p;
        this.b = !!state.b;
        this.h = !!state.h;
        this.i = !!state.i;
        this.z = !!state.z;
        this.c = !!state.c;
    }
}