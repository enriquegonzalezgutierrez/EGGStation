/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAlu (Arithmetic Logic Unit Value Object)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles 8-bit and 16-bit binary/decimal mathematics for the 65816 CPU.
 * It manipulates CPU status flags (Carry, Overflow, Negative, Zero) directly 
 * on the CPU instance to maintain zero GC allocations.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles ALU logic (Addition, Subtraction, Comparisons, Sign extensions).
 */

class SnesCpuAlu {
    /**
     * Helper to update Zero (Z) and Negative (N) flags.
     * @param {SnesCpu} cpu 
     * @param {number} value 
     * @param {boolean} is8Bit 
     */
    static setZandN(cpu, value, is8Bit) {
        if (is8Bit) {
            cpu.z = (value & 0xff) === 0;
            cpu.n = (value & 0x80) > 0;
        } else {
            cpu.z = (value & 0xffff) === 0;
            cpu.n = (value & 0x8000) > 0;
        }
    }

    /**
     * Converts unsigned byte/word to signed representation.
     */
    static getSigned(value, is8Bit) {
        if (is8Bit) {
            return (value & 0xff) > 127 ? -(256 - (value & 0xff)) : (value & 0xff);
        }
        return value > 32767 ? -(65536 - value) : value;
    }

    /**
     * Add with Carry (ADC)
     */
    static adc(cpu, value, is8Bit) {
        const regA = cpu.br[0]; // CPU_REG_A

        if (is8Bit) {
            let result;
            if (cpu.d) { // Decimal mode
                result = (regA & 0xf) + (value & 0xf) + (cpu.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((regA & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
            } else {
                result = (regA & 0xff) + value + (cpu.c ? 1 : 0);
            }
            cpu.v = ((regA & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
            result += (cpu.d && result > 0x9f) ? 0x60 : 0;
            cpu.c = result > 0xff;
            this.setZandN(cpu, result, true);
            cpu.br[0] = (regA & 0xff00) | (result & 0xff);
        } else {
            cpu.cyclesLeft++; // 16-bit operations add 1 cycle overhead
            let result;
            if (cpu.d) {
                result = (regA & 0xf) + (value & 0xf) + (cpu.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((regA & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
                result += result > 0x9f ? 0x60 : 0;
                result = ((regA & 0xf00) + (value & 0xf00) + (result > 0xff ? 0x100 : 0) + (result & 0xff));
                result += result > 0x9ff ? 0x600 : 0;
                result = ((regA & 0xf000) + (value & 0xf000) + (result > 0xfff ? 0x1000 : 0) + (result & 0xfff));
            } else {
                result = regA + value + (cpu.c ? 1 : 0);
            }
            cpu.v = ((regA & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
            result += (cpu.d && result > 0x9fff) ? 0x6000 : 0;
            cpu.c = result > 0xffff;
            this.setZandN(cpu, result, false);
            cpu.br[0] = result;
        }
    }

    /**
     * Subtract with Carry (SBC)
     */
    static sbc(cpu, value, is8Bit) {
        const regA = cpu.br[0];

        if (is8Bit) {
            const invertedVal = value ^ 0xff;
            let result;
            if (cpu.d) {
                result = (regA & 0xf) + (invertedVal & 0xf) + (cpu.c ? 1 : 0);
                result -= result <= 0xf ? 6 : 0;
                result = ((regA & 0xf0) + (invertedVal & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
            } else {
                result = (regA & 0xff) + invertedVal + (cpu.c ? 1 : 0);
            }
            cpu.v = ((regA & 0x80) === (invertedVal & 0x80) && (invertedVal & 0x80) !== (result & 0x80));
            result -= (cpu.d && result <= 0xff) ? 0x60 : 0;
            cpu.c = result > 0xff;
            this.setZandN(cpu, result, true);
            cpu.br[0] = (regA & 0xff00) | (result & 0xff);
        } else {
            const invertedVal = value ^ 0xffff;
            cpu.cyclesLeft++;
            let result;
            if (cpu.d) {
                result = (regA & 0xf) + (invertedVal & 0xf) + (cpu.c ? 1 : 0);
                result -= result <= 0x0f ? 6 : 0;
                result = ((regA & 0xf0) + (invertedVal & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
                result -= result <= 0xff ? 0x60 : 0;
                result = ((regA & 0xf00) + (invertedVal & 0xf00) + (result > 0xff ? 0x100 : 0) + (result & 0xff));
                result -= result <= 0xfff ? 0x600 : 0;
                result = ((regA & 0xf000) + (invertedVal & 0xf000) + (result > 0xfff ? 0x1000 : 0) + (result & 0xfff));
            } else {
                result = regA + invertedVal + (cpu.c ? 1 : 0);
            }
            cpu.v = ((regA & 0x8000) === (invertedVal & 0x8000) && (invertedVal & 0x8000) !== (result & 0x8000));
            result -= (cpu.d && result <= 0xffff) ? 0x6000 : 0;
            cpu.c = result > 0xffff;
            this.setZandN(cpu, result, false);
            cpu.br[0] = result;
        }
    }

    /**
     * General Comparison (CMP)
     */
    static compare(cpu, regValue, memValue, is8Bit) {
        if (is8Bit) {
            const result = (regValue & 0xff) + (memValue ^ 0xff) + 1;
            cpu.c = result > 0xff;
            this.setZandN(cpu, result, true);
        } else {
            cpu.cyclesLeft++;
            const result = regValue + (memValue ^ 0xffff) + 1;
            cpu.c = result > 0xffff;
            this.setZandN(cpu, result, false);
        }
    }
}

// Global alias for transitional microphases compatibility
window.SnesCpuAlu = SnesCpuAlu;