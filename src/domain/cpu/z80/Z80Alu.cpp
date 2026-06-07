/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/Z80Alu.cpp
 * 
 * Domain Layer: Z80 Arithmetic Logic Unit (ALU)
 * 
 * Role:
 * Implementation of all mathematical, logical, and bit-shifting operations.
 * It reads values, computes the results, natively applies the hardware flag 
 * equations (Carry, Overflow, Half-carry, Sign, Zero), and returns the payload.
 */

#include "Z80Alu.h"

Z80Alu::Z80Alu() {
    buildParityLookUp();
}

void Z80Alu::buildParityLookUp() {
    for (int i = 0; i <= 0xFF; i++) {
        int bitCount = 0;
        for (int j = 0; j < 8; j++) {
            if (i & (1 << j)) {
                bitCount++;
            }
        }
        parityLookUp[i] = (bitCount % 2 == 0);
    }
}

// ========================================================================
// 8-BIT ARITHMETIC OPERATIONS
// ========================================================================

uint8_t Z80Alu::add_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint32_t rawNewValue = (uint32_t)op1 + (uint32_t)op2;
    uint8_t newValue = rawNewValue & 0xFF;

    regs.f = 0;

    if (rawNewValue > 0xFF) regs.f |= Z80Flags::FLAG_C;
    
    // Overflow (P/V) check: Occurs if two numbers of the same sign are added and produce a different sign
    if ((op1 & 0x80) == (op2 & 0x80) && (op1 & 0x80) != (newValue & 0x80)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    // Half-carry check (bit 3 carrying over to bit 4)
    if (((op1 & 0x0F) + (op2 & 0x0F)) > 0x0F) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::adc_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint8_t carry = (regs.f & Z80Flags::FLAG_C) ? 1 : 0;
    uint32_t rawNewValue = (uint32_t)op1 + (uint32_t)op2 + carry;
    uint8_t newValue = rawNewValue & 0xFF;

    regs.f = 0;

    if (rawNewValue > 0xFF) regs.f |= Z80Flags::FLAG_C;

    if ((op1 & 0x80) == (op2 & 0x80) && (op1 & 0x80) != (newValue & 0x80)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    if (((op1 & 0x0F) + (op2 & 0x0F) + carry) > 0x0F) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::sub_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    int32_t rawNewValue = (int32_t)op1 - (int32_t)op2;
    uint8_t newValue = rawNewValue & 0xFF;

    regs.f = 0;

    if (rawNewValue < 0) regs.f |= Z80Flags::FLAG_C;

    regs.f |= Z80Flags::FLAG_N; // Always set for subtraction

    // Overflow (P/V) check for subtraction
    if ((op1 & 0x80) != (op2 & 0x80) && (op1 & 0x80) != (newValue & 0x80)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;

    if (((op1 & 0x0F) - (op2 & 0x0F)) < 0) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::sbc_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint8_t carry = (regs.f & Z80Flags::FLAG_C) ? 1 : 0;
    int32_t rawNewValue = (int32_t)op1 - (int32_t)op2 - carry;
    uint8_t newValue = rawNewValue & 0xFF;

    regs.f = 0;

    if (rawNewValue < 0) regs.f |= Z80Flags::FLAG_C;

    regs.f |= Z80Flags::FLAG_N; // Always set for subtraction

    if ((op1 & 0x80) != (op2 & 0x80) && (op1 & 0x80) != (newValue & 0x80)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    if (((op1 & 0x0F) - (op2 & 0x0F) - carry) < 0) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::inc_8bit(Z80Registers& regs, uint8_t value) {
    uint8_t newValue = (value + 1) & 0xFF;

    regs.f &= 0x01; // Preserve C flag

    // Overflow from 0x7F to 0x80
    if ((value & 0x80) == 0 && (newValue & 0x80) != 0) regs.f |= Z80Flags::FLAG_PV;
    
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (((value & 0x0F) + 1) > 0x0F) regs.f |= Z80Flags::FLAG_H;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::dec_8bit(Z80Registers& regs, uint8_t value) {
    uint8_t newValue = (value - 1) & 0xFF;

    regs.f &= 0x01; // Preserve C flag
    regs.f |= Z80Flags::FLAG_N; // Set subtraction flag

    // Overflow from 0x80 to 0x7F
    if ((value & 0x80) != 0 && (newValue & 0x80) == 0) regs.f |= Z80Flags::FLAG_PV;
    
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (((value & 0x0F) - 1) < 0) regs.f |= Z80Flags::FLAG_H;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    
    // FIXED: Corrected scope resolution from . to ::
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;        

    return newValue;
}

uint8_t Z80Alu::daa_8bit(Z80Registers& regs, uint8_t value) {
    uint8_t correctionFactor = 0;
    bool carryFlagWasSet = (regs.f & Z80Flags::FLAG_C) != 0;
    bool halfCarryFlagWasSet = (regs.f & Z80Flags::FLAG_H) != 0;
    bool subtractionFlagWasSet = (regs.f & Z80Flags::FLAG_N) != 0;

    regs.f &= 0x02; // Preserve N flag

    if (value > 0x99 || carryFlagWasSet) {
        correctionFactor |= 0x60;
        regs.f |= Z80Flags::FLAG_C;
    }

    if ((value & 0x0F) > 9 || halfCarryFlagWasSet) {
        correctionFactor |= 0x06;
    }

    int32_t tempValue = value;
    if (!subtractionFlagWasSet) {
        tempValue += correctionFactor;
    } else {
        tempValue -= correctionFactor;
    }

    uint8_t newValue = tempValue & 0xFF;

    if ((value & 0x10) ^ (newValue & 0x10)) regs.f |= Z80Flags::FLAG_H;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::cpl_8bit(Z80Registers& regs, uint8_t value) {
    value ^= 0xFF; // One's complement
    regs.f |= Z80Flags::FLAG_N;
    regs.f |= Z80Flags::FLAG_H;
    return value;
}

// ========================================================================
// 8-BIT LOGICAL OPERATIONS
// ========================================================================

uint8_t Z80Alu::and_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint8_t newValue = op1 & op2;
    regs.f = 0;
    
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    
    regs.f |= Z80Flags::FLAG_H; // AND always sets the H flag
    
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::or_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint8_t newValue = op1 | op2;
    regs.f = 0;

    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::xor_8bit(Z80Registers& regs, uint8_t op1, uint8_t op2) {
    uint8_t newValue = op1 ^ op2;
    regs.f = 0;

    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

void Z80Alu::bit_8bit(Z80Registers& regs, uint8_t value, uint8_t bitMask) {
    bool bitSet = (value & bitMask) != 0;

    regs.f &= 0x01; // Preserve C flag

    if (!bitSet) regs.f |= Z80Flags::FLAG_PV;
    
    regs.f |= Z80Flags::FLAG_H;

    if (!bitSet) regs.f |= Z80Flags::FLAG_Z;
    if (bitMask == 0x80 && (value & 0x80)) regs.f |= Z80Flags::FLAG_S;
}

// ========================================================================
// 16-BIT ARITHMETIC OPERATIONS
// ========================================================================

uint16_t Z80Alu::add_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2) {
    uint32_t rawNewValue = (uint32_t)op1 + (uint32_t)op2;
    uint16_t newValue = rawNewValue & 0xFFFF;

    regs.f &= 0xEC; // Preserve S, Z, P/V

    if (rawNewValue > 0xFFFF) regs.f |= Z80Flags::FLAG_C;
    
    if (((op1 & 0x0FFF) + (op2 & 0x0FFF)) > 0x0FFF) {
        regs.f |= Z80Flags::FLAG_H;
    }

    return newValue;
}

uint16_t Z80Alu::adc_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2) {
    uint16_t carry = (regs.f & Z80Flags::FLAG_C) ? 1 : 0;
    uint32_t rawNewValue = (uint32_t)op1 + (uint32_t)op2 + carry;
    uint16_t newValue = rawNewValue & 0xFFFF;

    regs.f = 0;

    if (rawNewValue > 0xFFFF) regs.f |= Z80Flags::FLAG_C;

    if ((op1 & 0x8000) == (op2 & 0x8000) && (op1 & 0x8000) != (newValue & 0x8000)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    if (((op1 & 0x0FFF) + (op2 & 0x0FFF) + carry) > 0x0FFF) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x8000) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint16_t Z80Alu::sbc_16bit(Z80Registers& regs, uint16_t op1, uint16_t op2) {
    uint16_t carry = (regs.f & Z80Flags::FLAG_C) ? 1 : 0;
    int32_t rawNewValue = (int32_t)op1 - (int32_t)op2 - carry;
    uint16_t newValue = rawNewValue & 0xFFFF;

    regs.f = 0;

    if (rawNewValue < 0) regs.f |= Z80Flags::FLAG_C;

    regs.f |= Z80Flags::FLAG_N; // Always set for subtraction

    if ((op1 & 0x8000) != (op2 & 0x8000) && (op1 & 0x8000) != (newValue & 0x8000)) {
        regs.f |= Z80Flags::FLAG_PV;
    }

    if (((op1 & 0x0FFF) - (op2 & 0x0FFF) - carry) < 0) {
        regs.f |= Z80Flags::FLAG_H;
    }

    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x8000) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

// ========================================================================
// SHIFT & ROTATE OPERATIONS
// ========================================================================

uint8_t Z80Alu::rlca_8bit(Z80Registers& regs, uint8_t value) {
    bool bit7Set = (value & 0x80) != 0;
    uint8_t newValue = (value << 1) & 0xFF;
    
    if (bit7Set) newValue |= 0x01;

    regs.f &= 0xC4; // Preserve S, Z, P/V

    if (bit7Set) regs.f |= Z80Flags::FLAG_C;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;

    return newValue;
}

uint8_t Z80Alu::rra_8bit(Z80Registers& regs, uint8_t value) {
    bool bit0Set = (value & 0x01) != 0;
    bool carryFlagSet = (regs.f & Z80Flags::FLAG_C) != 0;

    uint8_t newValue = (value >> 1) & 0xFF;
    if (carryFlagSet) newValue |= 0x80;

    regs.f &= 0xC4; // Preserve S, Z, P/V

    if (bit0Set) regs.f |= Z80Flags::FLAG_C;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;

    return newValue;
}

// --- Dynamic CB-prefixed Shift Operations ---

uint8_t Z80Alu::rlc_8bit(Z80Registers& regs, uint8_t value) {
    bool bit7Set = (value & 0x80) != 0;
    uint8_t newValue = (value << 1) & 0xFF;
    
    if (bit7Set) newValue |= 0x01;

    regs.f = 0x00;

    if (bit7Set) regs.f |= Z80Flags::FLAG_C;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;	
}

uint8_t Z80Alu::rrc_8bit(Z80Registers& regs, uint8_t value, bool isA) {
    bool bit0Set = (value & 0x01) != 0;
    uint8_t newValue = (value >> 1) & 0xFF;
    
    if (bit0Set) newValue |= 0x80;

    if (isA) {
        regs.f &= Z80Flags::FLAG_PV | Z80Flags::FLAG_S | Z80Flags::FLAG_Z;
    } else {
        regs.f = 0x00;
    }

    if (bit0Set) {
        regs.f |= Z80Flags::FLAG_C;
    } else {
        regs.f &= ~Z80Flags::FLAG_C;
    }

    if (!isA) {
        if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    }

    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;

    if (!isA) {
        if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
        if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;
    }

    return newValue;	
}

uint8_t Z80Alu::rl_8bit(Z80Registers& regs, uint8_t value, bool isA) {
    bool bit7Set = (value & 0x80) != 0;
    uint8_t newValue = (value << 1) & 0xFF;
    
    if (regs.f & Z80Flags::FLAG_C) newValue |= 0x01;

    if (isA) {
        regs.f &= Z80Flags::FLAG_PV | Z80Flags::FLAG_S | Z80Flags::FLAG_Z;
    } else {
        regs.f = 0x00;
    }

    if (bit7Set) {
        regs.f |= Z80Flags::FLAG_C;
    } else {
        regs.f &= ~Z80Flags::FLAG_C;
    }

    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;

    if (!isA) {
        if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
        if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
        if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;
    }

    return newValue;	
}

uint8_t Z80Alu::rr_8bit(Z80Registers& regs, uint8_t value) {
    bool bit0Set = (value & 0x01) != 0;
    uint8_t newValue = (value >> 1) & 0xFF;
    
    if (regs.f & Z80Flags::FLAG_C) newValue |= 0x80;

    regs.f = 0x00;

    if (bit0Set) regs.f |= Z80Flags::FLAG_C;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;	
}

uint8_t Z80Alu::sla_8bit(Z80Registers& regs, uint8_t value) {
    uint8_t newValue = (value << 1) & 0xFF;

    regs.f = 0;

    if (value & 0x80) regs.f |= Z80Flags::FLAG_C;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::sra_8bit(Z80Registers& regs, uint8_t value) {
    uint8_t newValue = (value >> 1) & 0xFF;
    if (value & 0x80) newValue |= 0x80; // Keep sign bit

    regs.f = 0;

    if (value & 0x01) regs.f |= Z80Flags::FLAG_C;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;
}

uint8_t Z80Alu::sll_8bit(Z80Registers& regs, uint8_t value) {
    regs.f = 0x00;

    if ((value & 0x80) != 0) regs.f |= Z80Flags::FLAG_C;

    uint8_t newValue = ((value << 1) | 0x01) & 0xFF;

    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    
    // FIXED: Corrected scope resolution from . to ::
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;        

    return newValue;
}

uint8_t Z80Alu::srl_8bit(Z80Registers& regs, uint8_t value) {
    bool bit0Set = (value & 0x01) != 0;
    uint8_t newValue = (value >> 1) & 0xFF;

    regs.f = 0x00;

    if (bit0Set) regs.f |= Z80Flags::FLAG_C;
    if (parityLookUp[newValue]) regs.f |= Z80Flags::FLAG_PV;
    if (newValue & 0x08) regs.f |= Z80Flags::FLAG_F3;
    if (newValue & 0x20) regs.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) regs.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) regs.f |= Z80Flags::FLAG_S;

    return newValue;	
}