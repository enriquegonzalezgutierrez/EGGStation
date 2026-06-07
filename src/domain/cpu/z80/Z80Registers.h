/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/Z80Registers.h
 * 
 * Domain Layer: Z80 CPU Registers Model
 * 
 * Role:
 * Encapsulates the complete internal state of the Z80 registers,
 * including primary, alternate (shadow), index, and special-purpose registers.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively manages internal CPU register 
 *    states, 16-bit packing/unpacking, and atomic register exchange routines (EX, EXX).
 *    It has no knowledge of system memory maps or execution timings.
 */

#ifndef Z80_REGISTERS_H
#define Z80_REGISTERS_H

#include <stdint.h>

// ========================================================================
// Z80 FLAG MASKS CONSTANTS
// ========================================================================
namespace Z80Flags {
    constexpr uint8_t FLAG_C  = 0x01; // Bit 0: Carry Flag (C)
    constexpr uint8_t FLAG_N  = 0x02; // Bit 1: Add/Subtract Flag (N)
    constexpr uint8_t FLAG_PV = 0x04; // Bit 2: Parity / Overflow Flag (P/V)
    constexpr uint8_t FLAG_F3 = 0x08; // Bit 3: Undocumented Flag (Copy of bit 3)
    constexpr uint8_t FLAG_H  = 0x10; // Bit 4: Half Carry Flag (H)
    constexpr uint8_t FLAG_F5 = 0x20; // Bit 5: Undocumented Flag (Copy of bit 5)
    constexpr uint8_t FLAG_Z  = 0x40; // Bit 6: Zero Flag (Z)
    constexpr uint8_t FLAG_S  = 0x80; // Bit 7: Sign Flag (S)
}

struct ShadowRegisters {
    uint8_t a, b, c, d, e, h, l, f;
};

class Z80Registers {
public:
    // ========================================================================
    // PRIMARY 8-BIT REGISTERS
    // ========================================================================
    uint8_t a;    // Accumulator
    uint8_t b;    // General purpose
    uint8_t c;    // General purpose
    uint8_t d;    // General purpose
    uint8_t e;    // General purpose
    uint8_t h;    // General purpose (High byte of HL)
    uint8_t l;    // General purpose (Low byte of HL)
    uint8_t f;    // Flags Register

    // ========================================================================
    // 16-BIT INDEX REGISTERS (Split into 8-bit halves for IXH/IXL operations)
    // ========================================================================
    uint8_t ixh;
    uint8_t ixl;
    uint8_t iyh;
    uint8_t iyl;

    // ========================================================================
    // SPECIAL PURPOSE REGISTERS
    // ========================================================================
    uint16_t pc;  // Program Counter (16-bit)
    uint16_t sp;  // Stack Pointer (16-bit)
    uint8_t r;    // Memory Refresh Register (8-bit)
    uint8_t i;    // Interrupt Vector Register (8-bit)
    
    // Interrupt Enable Flip-Flops
    uint8_t iff1; // Primary interrupt enable flag (0 or 1)
    uint8_t iff2; // Temporary storage for iff1 during Non-Maskable Interrupts (NMI)

    // ========================================================================
    // SHADOW / ALTERNATE REGISTERS (AF', BC', DE', HL')
    // ========================================================================
    ShadowRegisters shadow;

    // Constructor
    Z80Registers();

    // Reset registers to cold-boot states
    void reset();

    // ========================================================================
    // 16-BIT VIRTUAL REGISTER GETTERS & SETTERS
    // Inline definitions for zero-overhead JIT-style execution in C++
    // ========================================================================

    inline uint16_t getBC() const { return (b << 8) | c; }
    inline void setBC(uint16_t val) { b = (val >> 8) & 0xFF; c = val & 0xFF; }

    inline uint16_t getDE() const { return (d << 8) | e; }
    inline void setDE(uint16_t val) { d = (val >> 8) & 0xFF; e = val & 0xFF; }

    inline uint16_t getHL() const { return (h << 8) | l; }
    inline void setHL(uint16_t val) { h = (val >> 8) & 0xFF; l = val & 0xFF; }

    inline uint16_t getAF() const { return (a << 8) | f; }
    inline void setAF(uint16_t val) { a = (val >> 8) & 0xFF; f = val & 0xFF; }

    inline uint16_t getIX() const { return (ixh << 8) | ixl; }
    inline void setIX(uint16_t val) { ixh = (val >> 8) & 0xFF; ixl = val & 0xFF; }

    inline uint16_t getIY() const { return (iyh << 8) | iyl; }
    inline void setIY(uint16_t val) { iyh = (val >> 8) & 0xFF; iyl = val & 0xFF; }

    // ========================================================================
    // DOMAIN BEHAVIORS (EXCHANGE ALGORITHMS)
    // ========================================================================

    /**
     * Executes the EX AF, AF' instruction.
     * Swaps the primary accumulator and flags with their alternate (shadow) counterparts.
     */
    void exchangeAF();

    /**
     * Executes the EXX instruction.
     * Swaps primary BC, DE, and HL pairings with their alternate (shadow) counterparts.
     */
    void exchangeBC_DE_HL();

    /**
     * Executes the EX DE, HL instruction.
     * Exchanges the values inside the DE and HL register pairs.
     */
    void exchangeDE_HL();
};

#endif // Z80_REGISTERS_H