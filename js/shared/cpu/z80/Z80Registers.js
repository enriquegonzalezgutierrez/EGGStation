/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/Z80Registers.js
 * 
 * Role:
 * Domain Layer: Z80 CPU Registers Model.
 * Encapsulates the complete internal state of the Z80 registers,
 * including primary, alternate (shadow), index, and special-purpose registers.
 * Following DDD and SOLID (SRP), it removes the burden of register state 
 * manipulation and 16-bit bitwise packing/unpacking from the main CPU class.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively manages internal CPU register 
 *    states, 16-bit packing/unpacking, and atomic register exchange routines (EX, EXX).
 *    It has no knowledge of system memory maps or execution timings.
 */

// Global constant defining the Z80 Flag Register (F) bitmasks
const Z80Flags = {
    FLAG_C:  0x01, // Bit 0: Carry Flag (C)
    FLAG_N:  0x02, // Bit 1: Add/Subtract Flag (N)
    FLAG_PV: 0x04, // Bit 2: Parity / Overflow Flag (P/V)
    FLAG_F3: 0x08, // Bit 3: Undocumented Flag (Copy of bit 3)
    FLAG_H:  0x10, // Bit 4: Half Carry Flag (H)
    FLAG_F5: 0x20, // Bit 5: Undocumented Flag (Copy of bit 5)
    FLAG_Z:  0x40, // Bit 6: Zero Flag (Z)
    FLAG_S:  0x80  // Bit 7: Sign Flag (S)
};

class Z80Registers {
    constructor() {
        // ========================================================================
        // PRIMARY 8-BIT REGISTERS
        // ========================================================================
        this.a = 0;    // Accumulator
        this.b = 0;    // General purpose
        this.c = 0;    // General purpose
        this.d = 0;    // General purpose
        this.e = 0;    // General purpose
        this.h = 0;    // General purpose (High byte of HL)
        this.l = 0;    // General purpose (Low byte of HL)
        this.f = 0x40; // Flags Register (Initialized with the Zero Flag set)

        // ========================================================================
        // 16-BIT INDEX REGISTERS (Split into 8-bit halves for IXH/IXL operations)
        // ========================================================================
        this.ixh = 0xff;
        this.ixl = 0xff;
        this.iyh = 0xff;
        this.iyl = 0xff;

        // ========================================================================
        // SPECIAL PURPOSE REGISTERS
        // ========================================================================
        this.pc = 0;      // Program Counter (16-bit)
        this.sp = 0xdff0; // Stack Pointer (16-bit, typically targets RAM limits at boot)
        this.r = 0;       // Memory Refresh Register (8-bit)
        this.i = 0;       // Interrupt Vector Register (8-bit)
        
        // Interrupt Enable Flip-Flops
        this.iff1 = 0;    // Primary interrupt enable flag
        this.iff2 = 0;    // Temporary storage for iff1 during Non-Maskable Interrupts (NMI)

        // ========================================================================
        // SHADOW / ALTERNATE REGISTERS (AF', BC', DE', HL')
        // ========================================================================
        this.shadow = {
            a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0
        };
    }

    // ========================================================================
    // 16-BIT VIRTUAL REGISTER GETTERS & SETTERS
    // These methods securely pack and unpack 8-bit registers into 16-bit pairs.
    // ========================================================================

    get bc() {
        return (this.b << 8) | this.c;
    }

    set bc(val) {
        this.b = (val >> 8) & 0xff;
        this.c = val & 0xff;
    }

    get de() {
        return (this.d << 8) | this.e;
    }

    set de(val) {
        this.d = (val >> 8) & 0xff;
        this.e = val & 0xff;
    }

    get hl() {
        return (this.h << 8) | this.l;
    }

    set hl(val) {
        this.h = (val >> 8) & 0xff;
        this.l = val & 0xff;
    }

    get af() {
        return (this.a << 8) | this.f;
    }

    set af(val) {
        this.a = (val >> 8) & 0xff;
        this.f = val & 0xff;
    }

    get ix() {
        return (this.ixh << 8) | this.ixl;
    }

    set ix(val) {
        this.ixh = (val >> 8) & 0xff;
        this.ixl = val & 0xff;
    }

    get iy() {
        return (this.iyh << 8) | this.iyl;
    }

    set iy(val) {
        this.iyh = (val >> 8) & 0xff;
        this.iyl = val & 0xff;
    }

    // ========================================================================
    // DOMAIN BEHAVIORS (EXCHANGE ALGORITHMS)
    // ========================================================================

    /**
     * Executes the EX AF, AF' instruction.
     * Swaps the primary accumulator and flags with their alternate (shadow) counterparts.
     */
    exchangeAF() {
        const tempA = this.a;
        const tempF = this.f;

        this.a = this.shadow.a;
        this.f = this.shadow.f;

        this.shadow.a = tempA;
        this.shadow.f = tempF;
    }

    /**
     * Executes the EXX instruction.
     * Swaps primary BC, DE, and HL pairings with their alternate (shadow) counterparts.
     */
    exchangeBC_DE_HL() {
        const tempB = this.b;
        const tempC = this.c;
        const tempD = this.d;
        const tempE = this.e;
        const tempH = this.h;
        const tempL = this.l;

        this.b = this.shadow.b;
        this.c = this.shadow.c;
        this.d = this.shadow.d;
        this.e = this.shadow.e;
        this.h = this.shadow.h;
        this.l = this.shadow.l;

        this.shadow.b = tempB;
        this.shadow.c = tempC;
        this.shadow.d = tempD;
        this.shadow.e = tempE;
        this.shadow.h = tempH;
        this.shadow.l = tempL;
    }

    /**
     * Executes the EX DE, HL instruction.
     * Exchanges the values inside the DE and HL register pairs.
     */
    exchangeDE_HL() {
        const tempD = this.d;
        const tempE = this.e;

        this.d = this.h;
        this.e = this.l;

        this.h = tempD;
        this.l = tempE;
    }
}