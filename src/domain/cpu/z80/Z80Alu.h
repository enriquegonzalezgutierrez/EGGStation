/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/Z80Alu.h
 * 
 * Domain Layer: Z80 Arithmetic Logic Unit (ALU)
 * 
 * Role:
 * Isolates all mathematical, bitwise, and flag-setting operations
 * of the Z80 CPU. It encapsulates the parity lookup table calculation, 
 * leaving the CPU purely in charge of execution control.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively handles mathematical 
 *    operations, logical gates, bit shifts, and register flags updates.
 *    It has no knowledge of memory, instruction fetching, or system buses.
 * 2. Open/Closed Principle (OCP): Flag equations and parity logic are 
 *    encapsulated; optimizations can be made here without affecting the 
 *    processor's fetch-decode loop.
 */

#ifndef Z80_ALU_H
#define Z80_ALU_H

#include <stdint.h>
#include "Z80Registers.h"

class Z80Alu {
private:
    // Pre-computed 256-byte parity flag lookup table.
    // The Z80 uses parity to indicate if the number of set bits (1s) is even.
    bool parityLookUp[256];

    /**
     * Initializes the parity table during object construction.
     */
    void buildParityLookUp();

public:
    Z80Alu();
    ~Z80Alu() = default;

    // ========================================================================
    // 8-BIT ARITHMETIC OPERATIONS
    // ========================================================================
    uint8_t add_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t adc_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t sub_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t sbc_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t inc_8bit(Z80Registers& regs, uint8_t value);
    uint8_t dec_8bit(Z80Registers& regs, uint8_t value);
    uint8_t daa_8bit(Z80Registers& regs, uint8_t value);
    uint8_t cpl_8bit(Z80Registers& regs, uint8_t value);

    // ========================================================================
    // 8-BIT LOGICAL OPERATIONS
    // ========================================================================
    uint8_t and_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t or_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    uint8_t xor_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2);
    void    bit_8bit(Z80Registers& regs, uint8_t value, uint8_t bitMask);

    // ========================================================================
    // 16-BIT ARITHMETIC OPERATIONS
    // ========================================================================
    uint16_t add_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2);
    uint16_t adc_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2);
    uint16_t sbc_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2);

    // ========================================================================
    // SHIFT & ROTATE OPERATIONS
    // ========================================================================
    uint8_t rlca_8bit(Z80Registers& regs, uint8_t value);
    uint8_t rra_8bit(Z80Registers& regs, uint8_t value);
    uint8_t rlc_8bit(Z80Registers& regs, uint8_t value);
    uint8_t rrc_8bit(Z80Registers& regs, uint8_t value, bool isA = false);
    uint8_t rl_8bit(Z80Registers& regs, uint8_t value, bool isA = false);
    uint8_t rr_8bit(Z80Registers& regs, uint8_t value);
    uint8_t sla_8bit(Z80Registers& regs, uint8_t value);
    uint8_t sra_8bit(Z80Registers& regs, uint8_t value);
    uint8_t sll_8bit(Z80Registers& regs, uint8_t value);
    uint8_t srl_8bit(Z80Registers& regs, uint8_t value);

    // Helper for decimal instructions needing parity access
    inline bool getParity(uint8_t val) const { return parityLookUp[val]; }
};

#endif // Z80_ALU_H