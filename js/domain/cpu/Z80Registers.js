/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 Registers Entity
 * 
 * This class encapsulates the complete internal state of the Z80 registers,
 * including primary, alternate (shadow), and special-purpose registers.
 * Following DDD and SOLID (SRP), it removes the burden of register state 
 * manipulation and 16-bit bitwise packing/unpacking from the main CPU class.
 */

const z80flags = {
    FLAG_C:  0x01, // Carry Flag
    FLAG_N:  0x02, // Add/Subtract Flag
    FLAG_PV: 0x04, // Parity / Overflow Flag
    FLAG_F3: 0x08, // Undocumented Bit 3 Flag
    FLAG_H:  0x10, // Half Carry Flag
    FLAG_F5: 0x20, // Undocumented Bit 5 Flag
    FLAG_Z:  0x40, // Zero Flag
    FLAG_S:  0x80  // Sign Flag
};

class Z80Registers {
    constructor() {
        // Primary 8-bit registers
        this.a = 0;
        this.b = 0;
        this.c = 0;
        this.d = 0;
        this.e = 0;
        this.h = 0;
        this.l = 0;
        this.f = 0x40; // Initialized with Zero Flag set

        // 16-bit Index registers (accessible as split 8-bit halves for backward compatibility)
        this.ixh = 0xff;
        this.ixl = 0xff;
        this.iyh = 0xff;
        this.iyl = 0xff;

        // Special-purpose counters
        this.pc = 0;      // Program Counter
        this.sp = 0xdff0; // Stack Pointer (typically targets RAM mirror limits at boot)
        this.r = 0;       // Memory Refresh Register
        this.i = 0;       // Interrupt Vector Register
        
        // Interrupt Enable Flip-Flops
        this.iff1 = 0;
        this.iff2 = 0;

        // Shadow/Alternate registers (AF', BC', DE', HL')
        this.shadow = {
            a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0
        };
    }

    // ========================================================================
    // 16-BIT VIRTUAL REGISTER GETTERS & SETTERS
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
    // DOMAIN BEHAVIOR (EXCHANGE ALGORITHMS)
    // ========================================================================

    /**
     * EX AF, AF'
     * Swaps the primary accumulator and flags with their alternate counterparts.
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
     * EXX
     * Swaps primary BC, DE, and HL pairings with their alternate counterparts.
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
     * EX DE, HL
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