/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/Z80Alu.js
 * 
 * Role:
 * Domain Layer: Z80 Arithmetic Logic Unit (ALU).
 * This class isolates all mathematical, bitwise, and flag-setting operations
 * of the Z80 CPU. By extracting the ALU, we adhere to the Single Responsibility 
 * Principle (SRP). It encapsulates the parity lookup table calculation, leaving 
 * the CPU purely in charge of execution control.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively handles mathematical 
 *    operations, logical gates, bit shifts, and register flags (CCR) updates.
 *    It has no knowledge of memory, instruction fetching, or system buses.
 * 2. Open/Closed Principle (OCP): The pre-calculated parity table or flag equations 
 *    can be modified/extended without altering the execution logic of the Z80 CPU loop.
 */

class Z80Alu {
    constructor() {
        this.parityLookUp = [];
        this.buildParityLookUp();
    }

    /**
     * Pre-computes the 256-byte parity flag lookup table.
     * The Z80 uses parity to indicate if the number of set bits (1s) is even.
     */
    buildParityLookUp() {
        for (let i = 0; i <= 0xff; i++) {
            let bitCount = 0;
            for (let j = 0; j < 8; j++) {
                if ((i & (1 << j)) !== 0) {
                    bitCount++;
                }
            }
            this.parityLookUp[i] = (bitCount % 2 === 0);
        }
    }

    // ========================================================================
    // 8-BIT ARITHMETIC OPERATIONS
    // ========================================================================

    add_8bit(registers, operand1, operand2) {
        const rawNewValue = operand1 + operand2;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue > 0xff) registers.f |= Z80Flags.FLAG_C;
        
        // Overflow (P/V) check
        if ((operand1 & 0x80) === (operand2 & 0x80) && (operand1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        // Half-carry check (bit 3 to bit 4)
        if ((operand1 & 0x0f) + (operand2 & 0x0f) > 0x0f) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    adc_8bit(registers, operand1, operand2) {
        const carry = (registers.f & Z80Flags.FLAG_C) ? 1 : 0;
        const rawNewValue = operand1 + operand2 + carry;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue > 0xff) registers.f |= Z80Flags.FLAG_C;

        if ((operand1 & 0x80) === (operand2 & 0x80) && (operand1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        if ((operand1 & 0x0f) + (operand2 & 0x0f) + carry > 0x0f) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;	
    }

    sub_8bit(registers, operand1, operand2) {
        const rawNewValue = operand1 - operand2;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue < 0) registers.f |= Z80Flags.FLAG_C;

        registers.f |= Z80Flags.FLAG_N; // Always set for subtraction

        if ((operand1 & 0x80) !== (operand2 & 0x80) && (operand1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;

        if ((operand1 & 0x0f) - (operand2 & 0x0f) < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }    

    sbc_8bit(registers, operand1, operand2) {
        const carry = (registers.f & Z80Flags.FLAG_C) ? 1 : 0;
        const rawNewValue = operand1 - operand2 - carry;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;
	
        if (rawNewValue < 0) registers.f |= Z80Flags.FLAG_C;

        registers.f |= Z80Flags.FLAG_N; // Always set for subtraction

        if ((operand1 & 0x80) !== (operand2 & 0x80) && (operand1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        if ((operand1 & 0x0f) - (operand2 & 0x0f) - carry < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    inc_8bit(registers, value) {
        const newValue = (value + 1) & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((value & 0x80) === 0 && (newValue & 0x80)) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        
        if ((value & 0x0f) + 1 > 0x0f) registers.f |= Z80Flags.FLAG_H;
        
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    dec_8bit(registers, value) {
        const newValue = (value - 1) & 0xff;

        registers.f &= 0x01; // Preserve C flag
        registers.f |= Z80Flags.FLAG_N; // Set subtraction flag

        if ((value & 0x80) && (newValue & 0x80) === 0) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        
        if ((value & 0x0f) - 1 < 0) registers.f |= Z80Flags.FLAG_H;
        
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;        

        return newValue;
    }

    daa_8bit(registers, value) {
        let correctionFactor = 0;
        const carryFlagWasSet = (registers.f & Z80Flags.FLAG_C) > 0;
        const halfCarryFlagWasSet = (registers.f & Z80Flags.FLAG_H) > 0;
        const subtractionFlagWasSet = (registers.f & Z80Flags.FLAG_N) > 0;

        registers.f &= 0x02; // Preserve N flag

        if (value > 0x99 || carryFlagWasSet) {
            correctionFactor |= 0x60;
            registers.f |= Z80Flags.FLAG_C;
        }

        if ((value & 0x0f) > 9 || halfCarryFlagWasSet) {
            correctionFactor |= 0x06;
        }

        let newValue = value;
        if (!subtractionFlagWasSet) {
            newValue += correctionFactor;
        } else {
            newValue -= correctionFactor;
        }

        newValue &= 0xff;

        if ((value & 0x10) ^ (newValue & 0x10)) registers.f |= Z80Flags.FLAG_H;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    cpl_8bit(registers, value) {
        value ^= 0xff; // One's complement
        registers.f |= Z80Flags.FLAG_N;
        registers.f |= Z80Flags.FLAG_H;
        return value;
    }    

    // ========================================================================
    // 8-BIT LOGICAL OPERATIONS
    // ========================================================================

    and_8bit(registers, operand1, operand2) {
        const newValue = operand1 & operand2;
        registers.f = 0;
        
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        
        registers.f |= Z80Flags.FLAG_H; // AND always sets the H flag
        
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }    

    or_8bit(registers, operand1, operand2) {
        const newValue = operand1 | operand2;
        registers.f = 0;

        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }    

    xor_8bit(registers, operand1, operand2) {
        const newValue = operand1 ^ operand2;
        registers.f = 0;

        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }    

    bit_8bit(registers, value, bitMask) {
        const bitSet = (value & bitMask) !== 0;

        registers.f &= 0x01; // Preserve C flag

        if (!bitSet) registers.f |= Z80Flags.FLAG_PV;
        
        registers.f |= Z80Flags.FLAG_H;

        if (!bitSet) registers.f |= Z80Flags.FLAG_Z;
        if (bitMask === 0x80 && (value & 0x80)) registers.f |= Z80Flags.FLAG_S;
    }

    // ========================================================================
    // 16-BIT ARITHMETIC OPERATIONS
    // ========================================================================

    add_16bit(registers, operand1, operand2) {
        const rawNewValue = operand1 + operand2;
        const newValue = rawNewValue & 0xffff;

        registers.f &= 0xec; // Preserve S, Z, P/V

        if (rawNewValue > 0xffff) registers.f |= Z80Flags.FLAG_C;
        
        if ((operand1 & 0x0fff) + (operand2 & 0x0fff) > 0x0fff) {
            registers.f |= Z80Flags.FLAG_H;
        }

        return newValue;
    }    

    adc_16bit(registers, operand1, operand2) {
        const carry = (registers.f & Z80Flags.FLAG_C) ? 1 : 0;
        const rawNewValue = operand1 + operand2 + carry;
        const newValue = rawNewValue & 0xffff;

        registers.f = 0;

        if (rawNewValue > 0xffff) registers.f |= Z80Flags.FLAG_C;

        if ((operand1 & 0x8000) === (operand2 & 0x8000) && (operand1 & 0x8000) !== (newValue & 0x8000)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        if ((operand1 & 0x0fff) + (operand2 & 0x0fff) + carry > 0x0fff) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x8000) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    sbc_16bit(registers, operand1, operand2) {
        const carry = (registers.f & Z80Flags.FLAG_C) ? 1 : 0;
        const rawNewValue = operand1 - operand2 - carry;
        const newValue = rawNewValue & 0xffff;

        registers.f = 0;

        if (rawNewValue < 0) registers.f |= Z80Flags.FLAG_C;

        registers.f |= Z80Flags.FLAG_N; // Always set for subtraction

        if ((operand1 & 0x8000) !== (operand2 & 0x8000) && (operand1 & 0x8000) !== (newValue & 0x8000)) {
            registers.f |= Z80Flags.FLAG_PV;
        }

        if ((operand1 & 0x0fff) - (operand2 & 0x0fff) - carry < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x8000) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    // ========================================================================
    // SHIFT & ROTATE OPERATIONS
    // ========================================================================

    rlca_8bit(registers, value) {
        const bit7Set = (value & 0x80) > 0;
        let newValue = (value << 1) & 0xff;
        
        if (bit7Set) newValue |= 0x01;

        registers.f &= 0xc4; // Preserve S, Z, P/V

        if (bit7Set) registers.f |= Z80Flags.FLAG_C;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;

        return newValue;
    }

    rra_8bit(registers, value) {
        const bit0Set = (value & 0x01) > 0;
        const carryFlagSet = (registers.f & Z80Flags.FLAG_C) > 0;

        let newValue = (value >> 1) & 0xff;
        if (carryFlagSet) newValue |= 0x80;

        registers.f &= 0xc4; // Preserve S, Z, P/V

        if (bit0Set) registers.f |= Z80Flags.FLAG_C;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;

        return newValue;
    }

    rlc_8bit(registers, value) {
        const bit7Set = (value & 0x80) > 0;
        let newValue = (value << 1) & 0xff;
        
        if (bit7Set) newValue |= 0x01;

        registers.f = 0x00;

        if (bit7Set) registers.f |= Z80Flags.FLAG_C;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;	
    }

    rrc_8bit(registers, value, isA = false) {
        const bit0Set = (value & 0x01) > 0;
        let newValue = (value >> 1) & 0xff;
        
        if (bit0Set) newValue |= 0x80;

        if (isA) {
            registers.f &= Z80Flags.FLAG_PV | Z80Flags.FLAG_S | Z80Flags.FLAG_Z;
        } else {
            registers.f = 0x00;
        }

        if (bit0Set) {
            registers.f |= Z80Flags.FLAG_C;
        } else {
            registers.f &= ~Z80Flags.FLAG_C;
        }

        if (!isA) {
            if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        }

        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;

        if (!isA) {
            if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
            if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;
        }

        return newValue;	
    }

    rl_8bit(registers, value, isA = false) {
        const bit7Set = (value & 0x80) > 0;
        let newValue = (value << 1) & 0xff;
        
        if (registers.f & Z80Flags.FLAG_C) newValue |= 0x01;

        if (isA) {
            registers.f &= Z80Flags.FLAG_PV | Z80Flags.FLAG_S | Z80Flags.FLAG_Z;
        } else {
            registers.f = 0x00;
        }

        if (bit7Set) {
            registers.f |= Z80Flags.FLAG_C;
        } else {
            registers.f &= ~Z80Flags.FLAG_C;
        }

        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;

        if (!isA) {
            if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
            if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
            if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;
        }

        return newValue;	
    }

    rr_8bit(registers, value) {
        const bit0Set = (value & 0x01) > 0;
        let newValue = (value >> 1) & 0xff;
        
        if (registers.f & Z80Flags.FLAG_C) newValue |= 0x80;

        registers.f = 0x00;

        if (bit0Set) registers.f |= Z80Flags.FLAG_C;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;	
    }

    sla_8bit(registers, value) {
        const newValue = (value << 1) & 0xff;

        registers.f = 0;

        if (value & 0x80) registers.f |= Z80Flags.FLAG_C;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }

    sra_8bit(registers, value) {
        let newValue = (value >> 1) & 0xff;
        if (value & 0x80) newValue |= 0x80; // Keep sign bit

        registers.f = 0;

        if (value & 0x01) registers.f |= Z80Flags.FLAG_C;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;
    }    

    sll_8bit(registers, value) {
        registers.f = 0x00;

        if ((value & 0x80) !== 0) registers.f |= Z80Flags.FLAG_C;

        const newValue = ((value << 1) | 0x01) & 0xff;

        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;        

        return newValue;
    }

    srl_8bit(registers, value) {
        const bit0Set = (value & 0x01) > 0;
        const newValue = (value >> 1) & 0xff;

        registers.f = 0x00;

        if (bit0Set) registers.f |= Z80Flags.FLAG_C;
        if (this.parityLookUp[newValue]) registers.f |= Z80Flags.FLAG_PV;
        if (newValue & 0x08) registers.f |= Z80Flags.FLAG_F3;
        if (newValue & 0x20) registers.f |= Z80Flags.FLAG_F5;
        if (newValue === 0) registers.f |= Z80Flags.FLAG_Z;
        if (newValue & 0x80) registers.f |= Z80Flags.FLAG_S;

        return newValue;	
    }
}