/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Arithmetic Logic Unit (ALU)
 * 
 * Implements mathematical, logical, and bit-shift execution pathways.
 * Handles both 8-bit and 16-bit operation modes with full flag updates (N, V, Z, C).
 * Supports standard binary addition/subtraction and BCD (Binary Coded Decimal) mode.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines mathematical and flag evaluation
 *   rules to a dedicated stateless class, decoupling it from instruction decoding.
 */

class CpuAlu {
    // ========================================================================
    // 8-BIT & 16-BIT BINARY/DECIMAL ADDITION (ADC)
    // ========================================================================

    /**
     * Executes 8-bit Addition with Carry.
     * @param {CpuRegisters} regs - Current registers state.
     * @param {number} op1 - Left operand (8-bit)
     * @param {number} op2 - Right operand (8-bit)
     * @returns {number} 8-bit result
     */
    static adc8(regs, op1, op2) {
        op1 &= 0xFF;
        op2 &= 0xFF;
        const carry = regs.cFlag ? 1 : 0;
        let result;

        if (regs.d) {
            // Decimal (BCD) Mode 8-bit
            let low = (op1 & 0x0F) + (op2 & 0x0F) + carry;
            if (low > 9) {
                low = (low + 6) & 0x0F;
                low |= 0x10; // Carry to high nibble
            }
            result = (op1 & 0xF0) + (op2 & 0xF0) + (low & 0xF0) + (low & 0x0F);
            
            // Decimal carry evaluation
            regs.cFlag = result > 0x99;
            if (regs.cFlag) {
                result += 0x60;
            }
        } else {
            // Binary Mode 8-bit
            result = op1 + op2 + carry;
            regs.cFlag = result > 0xFF;
        }

        const maskedResult = result & 0xFF;

        // V Flag (Signed Overflow): Set if inputs have same sign, but result has a different sign
        regs.v = ((op1 & 0x80) === (op2 & 0x80)) && ((op1 & 0x80) !== (maskedResult & 0x80));
        
        regs.n = (maskedResult & 0x80) > 0;
        regs.z = maskedResult === 0;

        return maskedResult;
    }

    /**
     * Executes 16-bit Addition with Carry.
     * @param {CpuRegisters} regs - Current registers state.
     * @param {number} op1 - Left operand (16-bit)
     * @param {number} op2 - Right operand (16-bit)
     * @returns {number} 16-bit result
     */
    static adc16(regs, op1, op2) {
        op1 &= 0xFFFF;
        op2 &= 0xFFFF;
        const carry = regs.cFlag ? 1 : 0;
        let result;

        if (regs.d) {
            // Decimal (BCD) Mode 16-bit
            let low = (op1 & 0x0F) + (op2 & 0x0F) + carry;
            if (low > 9) {
                low = (low + 6) & 0x0F;
                low |= 0x10;
            }
            let midLow = ((op1 >> 4) & 0x0F) + ((op2 >> 4) & 0x0F) + ((low & 0x10) >> 4);
            if (midLow > 9) {
                midLow = (midLow + 6) & 0x0F;
                midLow |= 0x10;
            }
            let midHigh = ((op1 >> 8) & 0x0F) + ((op2 >> 8) & 0x0F) + ((midLow & 0x10) >> 4);
            if (midHigh > 9) {
                midHigh = (midHigh + 6) & 0x0F;
                midHigh |= 0x10;
            }
            let high = ((op1 >> 12) & 0x0F) + ((op2 >> 12) & 0x0F) + ((midHigh & 0x10) >> 4);
            if (high > 9) {
                high = (high + 6) & 0x0F;
                high |= 0x10;
            }

            result = (high & 0x0F) << 12 | (midHigh & 0x0F) << 8 | (midLow & 0x0F) << 4 | (low & 0x0F);
            regs.cFlag = (high & 0x10) > 0;
        } else {
            // Binary Mode 16-bit
            result = op1 + op2 + carry;
            regs.cFlag = result > 0xFFFF;
        }

        const maskedResult = result & 0xFFFF;

        regs.v = ((op1 & 0x8000) === (op2 & 0x8000)) && ((op1 & 0x8000) !== (maskedResult & 0x8000));
        regs.n = (maskedResult & 0x8000) > 0;
        regs.z = maskedResult === 0;

        return maskedResult;
    }

    // ========================================================================
    // 8-BIT & 16-BIT BINARY/DECIMAL SUBTRACTION (SBC)
    // ========================================================================

    /**
     * Executes 8-bit Subtraction with Borrow (Carry).
     * @param {CpuRegisters} regs - Current registers state.
     * @param {number} op1 - Accumulator (8-bit)
     * @param {number} op2 - Subtrahend (8-bit)
     * @returns {number} 8-bit result
     */
    static sbc8(regs, op1, op2) {
        op1 &= 0xFF;
        op2 &= 0xFF;
        const carry = regs.cFlag ? 1 : 0;
        let result;

        if (regs.d) {
            // Decimal (BCD) Mode 8-bit
            let low = (op1 & 0x0F) - (op2 & 0x0F) - (1 - carry);
            if (low < 0) {
                low = (low - 6) & 0x0F;
                low -= 0x10; // Borrow
            }
            result = (op1 & 0xF0) - (op2 & 0xF0) + low;
            if (result < 0) {
                result = (result - 0x60) & 0xFFFF;
            }
            regs.cFlag = result <= 0xFF; // Carry set if no borrow occurred
        } else {
            // Binary Mode 8-bit (reconstructed via inverted addition)
            const invertedOp2 = op2 ^ 0xFF;
            result = op1 + invertedOp2 + carry;
            regs.cFlag = result > 0xFF;
        }

        const maskedResult = result & 0xFF;

        regs.v = ((op1 & 0x80) !== (op2 & 0x80)) && ((op1 & 0x80) !== (maskedResult & 0x80));
        regs.n = (maskedResult & 0x80) > 0;
        regs.z = maskedResult === 0;

        return maskedResult;
    }

    /**
     * Executes 16-bit Subtraction with Borrow (Carry).
     * @param {CpuRegisters} regs - Current registers state.
     * @param {number} op1 - Accumulator (16-bit)
     * @param {number} op2 - Subtrahend (16-bit)
     * @returns {number} 16-bit result
     */
    static sbc16(regs, op1, op2) {
        op1 &= 0xFFFF;
        op2 &= 0xFFFF;
        const carry = regs.cFlag ? 1 : 0;
        let result;

        if (regs.d) {
            // Decimal (BCD) Mode 16-bit
            let low = (op1 & 0x0F) - (op2 & 0x0F) - (1 - carry);
            if (low < 0) {
                low = (low - 6) & 0x0F;
                low -= 0x10;
            }
            let midLow = ((op1 >> 4) & 0x0F) - ((op2 >> 4) & 0x0F) + (low < 0 ? -1 : 0);
            if (midLow < 0) {
                midLow = (midLow - 6) & 0x0F;
                midLow -= 0x10;
            }
            let midHigh = ((op1 >> 8) & 0x0F) - ((op2 >> 8) & 0x0F) + (midLow < 0 ? -1 : 0);
            if (midHigh < 0) {
                midHigh = (midHigh - 6) & 0x0F;
                midHigh -= 0x10;
            }
            let high = ((op1 >> 12) & 0x0F) - ((op2 >> 12) & 0x0F) + (midHigh < 0 ? -1 : 0);
            if (high < 0) {
                high = (high - 6) & 0x0F;
                high -= 0x10;
            }

            result = (high & 0x0F) << 12 | (midHigh & 0x0F) << 8 | (midLow & 0x0F) << 4 | (low & 0x0F);
            regs.cFlag = high >= 0;
        } else {
            // Binary Mode 16-bit
            const invertedOp2 = op2 ^ 0xFFFF;
            result = op1 + invertedOp2 + carry;
            regs.cFlag = result > 0xFFFF;
        }

        const maskedResult = result & 0xFFFF;

        regs.v = ((op1 & 0x8000) !== (op2 & 0x8000)) && ((op1 & 0x8000) !== (maskedResult & 0x8000));
        regs.n = (maskedResult & 0x8000) > 0;
        regs.z = maskedResult === 0;

        return maskedResult;
    }

    // ========================================================================
    // LOGICAL OPERATIONS (AND, ORA, EOR, BIT)
    // ========================================================================

    static and(regs, op1, op2, is8Bit) {
        const result = op1 & op2;
        regs.n = (result & (is8Bit ? 0x80 : 0x8000)) > 0;
        regs.z = is8Bit ? (result & 0xFF) === 0 : (result & 0xFFFF) === 0;
        return is8Bit ? result & 0xFF : result & 0xFFFF;
    }

    static or(regs, op1, op2, is8Bit) {
        const result = op1 | op2;
        regs.n = (result & (is8Bit ? 0x80 : 0x8000)) > 0;
        regs.z = is8Bit ? (result & 0xFF) === 0 : (result & 0xFFFF) === 0;
        return is8Bit ? result & 0xFF : result & 0xFFFF;
    }

    static eor(regs, op1, op2, is8Bit) {
        const result = op1 ^ op2;
        regs.n = (result & (is8Bit ? 0x80 : 0x8000)) > 0;
        regs.z = is8Bit ? (result & 0xFF) === 0 : (result & 0xFFFF) === 0;
        return is8Bit ? result & 0xFF : result & 0xFFFF;
    }

    /**
     * Executes the BIT (Bit Test) instruction.
     * Updates N and V directly from memory flags, and sets Z on (A & Mem).
     */
    static bit(regs, accumulator, operand, is8Bit) {
        if (is8Bit) {
            regs.z = ((accumulator & operand) & 0xFF) === 0;
            regs.n = (operand & 0x80) > 0;
            regs.v = (operand & 0x40) > 0;
        } else {
            regs.z = ((accumulator & operand) & 0xFFFF) === 0;
            regs.n = (operand & 0x8000) > 0;
            regs.v = (operand & 0x4000) > 0;
        }
    }

    // ========================================================================
    // SHIFT & ROTATE OPERATIONS (ASL, LSR, ROL, ROR)
    // ========================================================================

    static asl(regs, value, is8Bit) {
        if (is8Bit) {
            value &= 0xFF;
            regs.cFlag = (value & 0x80) > 0;
            const res = (value << 1) & 0xFF;
            regs.n = (res & 0x80) > 0;
            regs.z = res === 0;
            return res;
        } else {
            value &= 0xFFFF;
            regs.cFlag = (value & 0x8000) > 0;
            const res = (value << 1) & 0xFFFF;
            regs.n = (res & 0x8000) > 0;
            regs.z = res === 0;
            return res;
        }
    }

    static lsr(regs, value, is8Bit) {
        if (is8Bit) {
            value &= 0xFF;
            regs.cFlag = (value & 0x01) > 0;
            const res = (value >> 1) & 0xFF;
            regs.n = false; // ASL/LSR shift out sign, sign is always 0
            regs.z = res === 0;
            return res;
        } else {
            value &= 0xFFFF;
            regs.cFlag = (value & 0x0001) > 0;
            const res = (value >> 1) & 0xFFFF;
            regs.n = false;
            regs.z = res === 0;
            return res;
        }
    }

    static rol(regs, value, is8Bit) {
        const carryIn = regs.cFlag ? 1 : 0;
        if (is8Bit) {
            value &= 0xFF;
            regs.cFlag = (value & 0x80) > 0;
            const res = ((value << 1) | carryIn) & 0xFF;
            regs.n = (res & 0x80) > 0;
            regs.z = res === 0;
            return res;
        } else {
            value &= 0xFFFF;
            regs.cFlag = (value & 0x8000) > 0;
            const res = ((value << 1) | carryIn) & 0xFFFF;
            regs.n = (res & 0x8000) > 0;
            regs.z = res === 0;
            return res;
        }
    }

    static ror(regs, value, is8Bit) {
        const carryIn = regs.cFlag ? 1 : 0;
        if (is8Bit) {
            value &= 0xFF;
            const carryOut = (value & 0x01) > 0;
            const res = ((value >> 1) | (carryIn << 7)) & 0xFF;
            regs.cFlag = carryOut;
            regs.n = (res & 0x80) > 0;
            regs.z = res === 0;
            return res;
        } else {
            value &= 0xFFFF;
            const carryOut = (value & 0x0001) > 0;
            const res = ((value >> 1) | (carryIn << 15)) & 0xFFFF;
            regs.cFlag = carryOut;
            regs.n = (res & 0x8000) > 0;
            regs.z = res === 0;
            return res;
        }
    }
}