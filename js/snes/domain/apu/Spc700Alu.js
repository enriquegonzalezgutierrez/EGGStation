/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sony SPC700 APU Arithmetic Logic Unit (ALU)
 * 
 * Implements mathematical, logical, and bit-shift execution pathways for the APU CPU.
 * Handles standard 8-bit operations and SPC700-specific 16-bit word operations.
 * Manages standard flag sets, including the half-carry (H) and signed overflow (V) flags.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines mathematical and flag evaluation
 *   rules to a dedicated stateless class, decoupling it from instruction decoding.
 */

class Spc700Alu {
    /**
     * Sets Zero (Z) and Negative (N) flags based on an 8-bit result.
     * @param {Spc700Registers} regs
     * @param {number} value
     */
    static setZandN(regs, value) {
        value &= 0xFF;
        regs.z = value === 0;
        regs.n = (value & 0x80) > 0;
    }

    // ========================================================================
    // 8-BIT & 16-BIT ADDITION & SUBTRACTION
    // ========================================================================

    static adc(regs, op1, op2) {
        op1 &= 0xFF;
        op2 &= 0xFF;
        const carry = regs.c ? 1 : 0;
        const result = op1 + op2 + carry;

        regs.v = ((op1 & 0x80) === (op2 & 0x80)) && ((op1 & 0x80) !== (result & 0x80));
        regs.h = ((op1 & 0x0F) + (op2 & 0x0F) + carry) > 0x0F;
        regs.c = result > 0xFF;
        
        const maskedResult = result & 0xFF;
        Spc700Alu.setZandN(regs, maskedResult);
        return maskedResult;
    }

    static sbc(regs, op1, op2) {
        op1 &= 0xFF;
        op2 &= 0xFF;
        const invertedOp2 = op2 ^ 0xFF;
        const carry = regs.c ? 1 : 0;
        const result = op1 + invertedOp2 + carry;

        regs.v = ((op1 & 0x80) === (invertedOp2 & 0x80)) && ((op1 & 0x80) !== (result & 0x80));
        regs.h = ((op1 & 0x0F) + (invertedOp2 & 0x0F) + carry) > 0x0F;
        regs.c = result > 0xFF; // Inverted borrow

        const maskedResult = result & 0xFF;
        Spc700Alu.setZandN(regs, maskedResult);
        return maskedResult;
    }

    static addw(regs, op1, op2) {
        op1 &= 0xFFFF;
        op2 &= 0xFFFF;
        const result = op1 + op2;

        regs.v = ((op1 & 0x8000) === (op2 & 0x8000)) && ((op1 & 0x8000) !== (result & 0x8000));
        regs.h = ((op1 & 0x0FFF) + (op2 & 0x0FFF)) > 0x0FFF;
        regs.c = result > 0xFFFF;

        const maskedResult = result & 0xFFFF;
        regs.z = maskedResult === 0;
        regs.n = (maskedResult & 0x8000) > 0;
        return maskedResult;
    }

    static subw(regs, op1, op2) {
        op1 &= 0xFFFF;
        op2 &= 0xFFFF;
        const invertedOp2 = op2 ^ 0xFFFF;
        const result = op1 + invertedOp2 + 1; // Direct 16-bit borrow sub

        regs.v = ((op1 & 0x8000) === (invertedOp2 & 0x8000)) && ((op1 & 0x8000) !== (result & 0x8000));
        regs.h = ((op1 & 0x0FFF) + (invertedOp2 & 0x0FFF) + 1) > 0x0FFF;
        regs.c = result > 0xFFFF;

        const maskedResult = result & 0xFFFF;
        regs.z = maskedResult === 0;
        regs.n = (maskedResult & 0x8000) > 0;
        return maskedResult;
    }

    // ========================================================================
    // SHIFT & ROTATE OPERATIONS
    // ========================================================================

    static asl(regs, value) {
        value &= 0xFF;
        regs.c = (value & 0x80) > 0;
        const result = (value << 1) & 0xFF;
        Spc700Alu.setZandN(regs, result);
        return result;
    }

    static lsr(regs, value) {
        value &= 0xFF;
        regs.c = (value & 0x01) > 0;
        const result = value >> 1;
        Spc700Alu.setZandN(regs, result);
        return result;
    }

    static rol(regs, value) {
        value &= 0xFF;
        const carryIn = regs.c ? 1 : 0;
        regs.c = (value & 0x80) > 0;
        const result = ((value << 1) | carryIn) & 0xFF;
        Spc700Alu.setZandN(regs, result);
        return result;
    }

    static ror(regs, value) {
        value &= 0xFF;
        const carryIn = regs.c ? 1 : 0;
        regs.c = (value & 0x01) > 0;
        const result = (value >> 1) | (carryIn << 7);
        Spc700Alu.setZandN(regs, result);
        return result;
    }

    // ========================================================================
    // LOGICAL AND BIT TESTS
    // ========================================================================

    static bitTest(regs, value, bitMask) {
        const result = value & bitMask;
        regs.z = result === 0;
        regs.n = (value & 0x80) > 0;
    }

    // ========================================================================
    // DECIMAL ADJUSTMENTS (BCD MODE)
    // ========================================================================

    static daa(regs, accumulator) {
        let value = accumulator & 0xFF;
        if (value > 0x99 || regs.c) {
            value += 0x60;
            regs.c = true;
        }
        if ((value & 0x0F) > 9 || regs.h) {
            value += 6;
        }
        const result = value & 0xFF;
        Spc700Alu.setZandN(regs, result);
        return result;
    }

    static das(regs, accumulator) {
        let value = accumulator & 0xFF;
        if (value > 0x99 || !regs.c) {
            value -= 0x60;
            regs.c = false;
        }
        if ((value & 0x0F) > 9 || !regs.h) {
            value -= 6;
        }
        const result = value & 0xFF;
        Spc700Alu.setZandN(regs, result);
        return result;
    }
}