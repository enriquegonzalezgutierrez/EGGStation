/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 ALU
 * 
 * This class isolates all mathematical, bitwise, and flag-setting operations
 * of the Z80 CPU. By extracting the ALU, we adhere to the Single Responsibility 
 * Principle (SRP). It encapsulates the parity lookup table calculation, leaving 
 * the CPU purely in charge of execution control.
 */

class Z80Alu {
    constructor() {
        this.parityLookUp = [];
        this.buildParityLookUp();
    }

    /**
     * Pre-computes the 256-byte parity flag lookup table.
     */
    buildParityLookUp() {
        for (let i = 0; i <= 0xff; i++) {
            let bitCount = 0;
            for (let j = 0; j < 8; j++) {
                if ((i & (1 << j)) !== 0) {
                    bitCount++;
                }
            }
            this.parityLookUp[i] = bitCount % 2 === 0;
        }
    }

    // ========================================================================
    // SHIFT, ROTATE & SPECIAL ALU ALGORITHMS
    // ========================================================================

    sll_8bit(registers, v) {
        registers.f = 0x00;

        if ((v & 0x80) !== 0) {
            registers.f |= z80flags.FLAG_C;
        }

        const result = ((v << 1) | 0x01) & 0xff;

        if (this.parityLookUp[result]) {
            registers.f |= z80flags.FLAG_PV;
        }        

        if (result === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (result & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }        

        return result;
    }

    rlc_8bit(registers, v) {
        const bit7Set = (v & 0x80) > 0;
        let newValue = (v << 1) & 0xff;
        
        if (bit7Set) {
            newValue |= 0x01;
        }

        registers.f = 0x00;

        if (bit7Set) {
            registers.f |= z80flags.FLAG_C;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;	
    }

    adc_16bit(registers, v1, v2) {
        const v3 = (registers.f & z80flags.FLAG_C) ? 1 : 0;
        const rawNewValue = v1 + v2 + v3;
        const newValue = rawNewValue & 0xffff;

        registers.f = 0;

        if (rawNewValue > 0xffff) {
            registers.f |= z80flags.FLAG_C;
        }

        if ((v1 & 0x8000) === (v2 & 0x8000) && (v1 & 0x8000) !== (newValue & 0x8000)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if ((v1 & 0x0fff) + (v2 & 0x0fff) + v3 > 0x0fff) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x8000) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    daa_8bit(registers, v) {
        let correctionFactor = 0;
        const carryFlagWasSet = (registers.f & z80flags.FLAG_C) > 0;
        const halfCarryFlagWasSet = (registers.f & z80flags.FLAG_H) > 0;
        const subtractionFlagWasSet = (registers.f & z80flags.FLAG_N) > 0;

        registers.f &= 0x02; // Preserve N flag

        if (v > 0x99 || carryFlagWasSet) {
            correctionFactor |= 0x60;
            registers.f |= z80flags.FLAG_C;
        }

        if ((v & 0x0f) > 9 || halfCarryFlagWasSet) {
            correctionFactor |= 0x06;
        }

        let newValue = v;

        if (!subtractionFlagWasSet) {
            newValue += correctionFactor;
        } else {
            newValue -= correctionFactor;
        }

        newValue &= 0xff;

        if ((v & 0x10) ^ (newValue & 0x10)) {
            registers.f |= z80flags.FLAG_H;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    sbc_8bit(registers, v1, v2) {
        const v3 = (registers.f & z80flags.FLAG_C) ? 1 : 0;
        const rawNewValue = v1 - v2 - v3;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;
	
        if (rawNewValue < 0) {
            registers.f |= z80flags.FLAG_C;
        }

        registers.f |= z80flags.FLAG_N;

        if ((v1 & 0x80) !== (v2 & 0x80) && (v1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if ((v1 & 0x0f) - (v2 & 0x0f) - v3 < 0) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    rr_8bit(registers, v) {
        const bit0Set = (v & 0x01) > 0;
        let newValue = (v >> 1) & 0xff;
        
        if (registers.f & z80flags.FLAG_C) {
            newValue |= 0x80;
        }

        registers.f = 0x00;

        if (bit0Set) {
            registers.f |= z80flags.FLAG_C;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;	
    }

    srl_8bit(registers, v) {
        const bit0Set = (v & 0x01) > 0;
        const newValue = (v >> 1) & 0xff;

        registers.f = 0x00;

        if (bit0Set) {
            registers.f |= z80flags.FLAG_C;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;	
    }

    rl_8bit(registers, v, isA = false) {
        const bit7Set = (v & 0x80) > 0;
        let newValue = (v << 1) & 0xff;
        
        if (registers.f & z80flags.FLAG_C) {
            newValue |= 0x01;
        }

        if (isA) {
            registers.f &= z80flags.FLAG_PV | z80flags.FLAG_S | z80flags.FLAG_Z;
        } else {
            registers.f = 0x00;
        }

        if (bit7Set) {
            registers.f |= z80flags.FLAG_C;
        } else {
            registers.f &= ~z80flags.FLAG_C;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (!isA) {
            if (this.parityLookUp[newValue]) {
                registers.f |= z80flags.FLAG_PV;
            }

            if (newValue === 0) {
                registers.f |= z80flags.FLAG_Z;
            }

            if (newValue & 0x80) {
                registers.f |= z80flags.FLAG_S;
            }
        }

        return newValue;	
    }

    sbc_16bit(registers, v1, v2) {
        const v3 = (registers.f & z80flags.FLAG_C) ? 1 : 0;
        const rawNewValue = v1 - v2 - v3;
        const newValue = rawNewValue & 0xffff;

        registers.f = 0;

        if (rawNewValue < 0) {
            registers.f |= z80flags.FLAG_C;
        }

        registers.f |= z80flags.FLAG_N;

        if ((v1 & 0x8000) !== (v2 & 0x8000) && (v1 & 0x8000) !== (newValue & 0x8000)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if ((v1 & 0x0fff) - (v2 & 0x0fff) - v3 < 0) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x8000) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    rra_8bit(registers, v) {
        const bit0Set = (v & 0x01) > 0;
        const carryFlagSet = (registers.f & z80flags.FLAG_C) > 0;

        let newValue = (v >> 1) & 0xff;
        if (carryFlagSet) {
            newValue |= 0x80;
        }

        registers.f &= 0xc4;

        if (bit0Set) {
            registers.f |= z80flags.FLAG_C;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        return newValue;
    }

    adc_8bit(registers, v1, v2) {
        const v3 = (registers.f & z80flags.FLAG_C) ? 1 : 0;
        const rawNewValue = v1 + v2 + v3;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue > 0xff) {
            registers.f |= z80flags.FLAG_C;
        }

        if ((v1 & 0x80) === (v2 & 0x80) && (v1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if ((v1 & 0x0f) + (v2 & 0x0f) + v3 > 0x0f) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;	
    }

    rrc_8bit(registers, v, isA = false) {
        const bit0Set = (v & 0x01) > 0;
        let newValue = (v >> 1) & 0xff;
        
        if (bit0Set) {
            newValue |= 0x80;
        }

        if (isA) {
            registers.f &= z80flags.FLAG_PV | z80flags.FLAG_S | z80flags.FLAG_Z;
        } else {
            registers.f = 0x00;
        }

        if (bit0Set) {
            registers.f |= z80flags.FLAG_C;
        } else {
            registers.f &= ~z80flags.FLAG_C;
        }

        if (!isA) {
            if (this.parityLookUp[newValue]) {
                registers.f |= z80flags.FLAG_PV;
            }
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (!isA) {
            if (newValue === 0) {
                registers.f |= z80flags.FLAG_Z;
            }

            if (newValue & 0x80) {
                registers.f |= z80flags.FLAG_S;
            }
        }

        return newValue;	
    }

    rlca_8bit(registers, v) {
        const bit7Set = (v & 0x80) > 0;
        let newValue = (v << 1) & 0xff;
        
        if (bit7Set) {
            newValue |= 0x01;
        }

        registers.f &= 0xc4;

        if (bit7Set) {
            registers.f |= z80flags.FLAG_C;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        return newValue;
    }

    add_8bit(registers, v1, v2) {
        const rawNewValue = v1 + v2;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue > 0xff) {
            registers.f |= z80flags.FLAG_C;
        }

        if ((v1 & 0x80) === (v2 & 0x80) && (v1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if ((v1 & 0x0f) + (v2 & 0x0f) > 0x0f) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    sra_8bit(registers, v) {
        let newValue = (v >> 1) & 0xff;
        if (v & 0x80) {
            newValue |= 0x80;
        }

        registers.f = 0;

        if (v & 0x01) {
            registers.f |= z80flags.FLAG_C;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }    

    sla_8bit(registers, v) {
        const newValue = (v << 1) & 0xff;

        registers.f = 0;

        if (v & 0x80) {
            registers.f |= z80flags.FLAG_C;
        }

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    bit_8bit(registers, v, bitMask) {
        const bitSet = (v & bitMask) !== 0;

        registers.f &= 0x01; // Preserve C flag

        if (!bitSet) {
            registers.f |= z80flags.FLAG_PV;
        }

        registers.f |= z80flags.FLAG_H;

        if (!bitSet) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (bitMask === 0x80 && (v & 0x80)) {
            registers.f |= z80flags.FLAG_S;
        }
    }

    inc_8bit(registers, v) {
        const newValue = (v + 1) & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((v & 0x80) === 0 && (newValue & 0x80)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if ((v & 0x0f) + 1 > 0x0f) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }

    dec_8bit(registers, v) {
        const newValue = (v - 1) & 0xff;

        registers.f &= 0x01; // Preserve C flag

        registers.f |= z80flags.FLAG_N;

        if ((v & 0x80) && (newValue & 0x80) === 0) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if ((v & 0x0f) - 1 < 0) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }        

        return newValue;
    }

    sub_8bit(registers, v1, v2) {
        const rawNewValue = v1 - v2;
        const newValue = rawNewValue & 0xff;

        registers.f = 0;

        if (rawNewValue < 0) {
            registers.f |= z80flags.FLAG_C;
        }

        registers.f |= z80flags.FLAG_N;

        if ((v1 & 0x80) !== (v2 & 0x80) && (v1 & 0x80) !== (newValue & 0x80)) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }

        if ((v1 & 0x0f) - (v2 & 0x0f) < 0) {
            registers.f |= z80flags.FLAG_H;
        }

        if (newValue & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }    

    or_8bit(registers, v1, v2) {
        const newValue = v1 | v2;

        registers.f = 0;

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }    

    xor_8bit(registers, v1, v2) {
        const newValue = v1 ^ v2;

        registers.f = 0;

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }    

    cpl_8bit(registers, v) {
        v ^= 0xff;

        registers.f |= z80flags.FLAG_N;
        registers.f |= z80flags.FLAG_H;

        return v;
    }    

    add_16bit(registers, v1, v2) {
        const rawNewValue = v1 + v2;
        const newValue = rawNewValue & 0xffff;

        registers.f &= 0xec;

        if (rawNewValue > 0xffff) {
            registers.f |= z80flags.FLAG_C;
        }

        if ((v1 & 0x0fff) + (v2 & 0x0fff) > 0x0fff) {
            registers.f |= z80flags.FLAG_H;
        }

        return newValue;
    }    

    and_8bit(registers, v1, v2) {
        const newValue = v1 & v2;

        registers.f = 0;

        if (this.parityLookUp[newValue]) {
            registers.f |= z80flags.FLAG_PV;
        }

        registers.f |= z80flags.FLAG_H;

        if (newValue === 0) {
            registers.f |= z80flags.FLAG_Z;
        }

        if (newValue & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }

        return newValue;
    }    
}