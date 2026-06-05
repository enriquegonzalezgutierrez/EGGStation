/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/m68k/instructions/M68kArithmetic.js
 * 
 * Role:
 * Domain Layer: M68K CPU Arithmetic Instructions.
 * Implements the registration and execution logic for the entire M68K 
 * arithmetic instruction family (ADD, ADDA, SUB, SUBA, ADDQ, SUBQ, ADDX, SUBX, 
 * MULS, MULU, DIVS, DIVU, CMP, CMPA, CMPI, CMPM, NEG, NEGX, EXT).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    definition, registration, and execution of the math/arithmetic instruction subset.
 * 2. Interface Segregation Principle (ISP): Depends on a thin, unified opcode 
 *    mapping dictionary (registry) instead of relying on the complete, heavy 
 *    execution loop of the M68000 class.
 */

class M68kArithmetic {
    /**
     * Registers all Arithmetic opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 1. ADD / ADDA / SUB / SUBA Group ---
            // Format: [opType:4][reg:3][opMode:3][src_mode:3][src_reg:3]
            const opType = (opcode >> 12) & 0xF;
            const opMode = (opcode >> 6) & 7;
            
            // Safe Hardware Filter: ADDX/SUBX strictly require bit 8 as 1 and bits 4-5 as 0
            const isAddxSubx = (opType === 0xD || opType === 0x9) && (opMode !== 3 && opMode !== 7) && (opcode & 0x0130) === 0x0100;

            if ((opType === 0xD || opType === 0x9) && !isAddxSubx) { 
                const reg = (opcode >> 9) & 7;
                const srcMode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;
                
                const isAdd = (opType === 0xD);

                if (opMode === 3 || opMode === 7) {
                    // ADDA / SUBA: Destination is always an Address Register (An)
                    // Does NOT modify any status flags (CCR).
                    opcodeTable[opcode] = () => {
                        const size = (opMode === 3) ? 2 : 3;
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        let srcVal = cpu.readEA(srcEa, size);
                        
                        if (size === 2) srcVal = (srcVal << 16) >> 16; // Sign-extend 16 to 32-bit
                        
                        const destVal = cpu.a[reg];
                        const result = isAdd ? (destVal + srcVal) : (destVal - srcVal);
                        cpu.a[reg] = result & 0xFFFFFFFF;
                        
                        return size === 3 ? 8 : 6;
                    };
                } else {
                    // Standard ADD / SUB: Destination is a data register or memory
                    opcodeTable[opcode] = () => {
                        const size = (opMode === 0 || opMode === 4) ? 1 : ((opMode === 1 || opMode === 5) ? 2 : 3);
                        const toRegister = (opMode < 3);
                        
                        let srcEa, destEa, srcVal, destVal;

                        if (toRegister) {
                            srcEa = cpu.resolveEA(srcMode, srcReg, size);
                            srcVal = cpu.readEA(srcEa, size);
                            destVal = cpu.d[reg];
                        } else {
                            destEa = cpu.resolveEA(srcMode, srcReg, size);
                            destVal = cpu.readEA(destEa, size);
                            srcVal = cpu.d[reg];
                        }

                        // Explicitly mask operands to their logical size to prevent 32-bit register leakage
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;
                        
                        const result = isAdd ? (destVal + srcVal) : (destVal - srcVal);
                        const resMasked = result & mask;

                        // Aligned Boolean algebraic solvers for CCR Flags (SMC, DMC, RMC)
                        const SMC = (srcVal & signBit) !== 0;
                        const DMC = (destVal & signBit) !== 0;
                        const RMC = (resMasked & signBit) !== 0;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = RMC ? 1 : 0;
                        
                        if (isAdd) {
                            cpu.fV = ((SMC ^ RMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && DMC) || (!RMC && DMC) || (SMC && !RMC)) ? 1 : 0;
                        } else {
                            cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;
                        }
                        cpu.fX = cpu.fC;
                        
                        if (toRegister) {
                            if (size === 1) cpu.d[reg] = (cpu.d[reg] & 0xFFFFFF00) | resMasked;
                            else if (size === 2) cpu.d[reg] = (cpu.d[reg] & 0xFFFF0000) | resMasked;
                            else cpu.d[reg] = resMasked;
                        } else {
                            cpu.writeEA(destEa, resMasked, size);
                        }
                        
                        return size === 3 ? 8 : 4;
                    };
                }
            }

            // --- 2. CMP / CMPA / CMPM (Compare) Group ---
            else if (opType === 0xB) {
                const reg = (opcode >> 9) & 7;
                const srcMode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;

                if (opMode === 3 || opMode === 7) {
                    // CMPA (Compare Address): Updates flags based on (An - Source)
                    opcodeTable[opcode] = () => {
                        const size = (opMode === 3) ? 2 : 3;
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        let srcVal = cpu.readEA(srcEa, size);
                        
                        if (size === 2) srcVal = (srcVal << 16) >> 16;
                        const destVal = cpu.a[reg];
                        const result = destVal - srcVal;

                        const resMasked = result & 0xFFFFFFFF;

                        const SMC = (srcVal & 0x80000000) !== 0;
                        const DMC = (destVal & 0x80000000) !== 0;
                        const RMC = (resMasked & 0x80000000) !== 0;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = RMC ? 1 : 0;
                        cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                        cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;
                        
                        return 6;
                    };
                } else if ((opcode & 0x0138) === 0x0108) {
                    // CMPM (Compare Memory): Compare memory post-increment (An)+ vs (Am)+
                    const sizeRaw = (opcode >> 6) & 3;
                    if (sizeRaw !== 3) {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        opcodeTable[opcode] = () => {
                            const srcEa = cpu.resolveEA(3, srcReg, size); 
                            const destEa = cpu.resolveEA(3, reg, size);
                            let srcVal = cpu.readEA(srcEa, size);
                            let destVal = cpu.readEA(destEa, size);

                            const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                            const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                            srcVal &= mask;
                            destVal &= mask;

                            const result = destVal - srcVal;
                            const resMasked = result & mask;

                            const SMC = (srcVal & signBit) !== 0;
                            const DMC = (destVal & signBit) !== 0;
                            const RMC = (resMasked & signBit) !== 0;

                            cpu.fZ = resMasked === 0 ? 1 : 0;
                            cpu.fN = RMC ? 1 : 0;
                            cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;

                            return size === 3 ? 20 : 12;
                        };
                    }
                } else {
                    // Standard CMP
                    const size = opMode === 0 ? 1 : (opMode === 1 ? 2 : 3);
                    opcodeTable[opcode] = () => {
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        let srcVal = cpu.readEA(srcEa, size);
                        let destVal = cpu.d[reg];

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;

                        const result = destVal - srcVal;
                        const resMasked = result & mask;

                        const SMC = (srcVal & signBit) !== 0;
                        const DMC = (destVal & signBit) !== 0;
                        const RMC = (resMasked & signBit) !== 0;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = RMC ? 1 : 0;
                        cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                        cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;

                        return size === 3 ? 6 : 4;
                    };
                }
            }

            // --- 3. CMPI (Compare Immediate) Group ---
            else if ((opcode & 0xFF00) === 0x0C00) {
                const sizeRaw = (opcode >> 6) & 3;
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);

                    opcodeTable[opcode] = () => {
                        const immEa = cpu.resolveEA(7, 4, size);
                        let srcVal = cpu.readEA(immEa, size);
                        
                        const destEa = cpu.resolveEA(mode, reg, size);
                        let destVal = cpu.readEA(destEa, size);

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;

                        const result = destVal - srcVal;
                        const resMasked = result & mask;

                        const SMC = (srcVal & signBit) !== 0;
                        const DMC = (destVal & signBit) !== 0;
                        const RMC = (resMasked & signBit) !== 0;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = RMC ? 1 : 0;
                        cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                        cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;

                        return size === 3 ? 14 : 8;
                    };
                }
            }

            // --- 4. ADDQ / SUBQ (Add/Subtract Quick) Group ---
            else if (opType === 0x5) {
                const valRaw = (opcode >> 9) & 7;
                const value = valRaw === 0 ? 8 : valRaw;
                const isSub = (opcode & 0x0100) !== 0;
                const sizeRaw = (opcode >> 6) & 3;

                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        const destIsAddressReg = (mode === 1);
                        const eaSize = destIsAddressReg ? 3 : size;
                        
                        const destEa = cpu.resolveEA(mode, reg, eaSize);
                        let destVal = cpu.readEA(destEa, eaSize);

                        const mask = eaSize === 1 ? 0xFF : (eaSize === 2 ? 0xFFFF : 0xFFFFFFFF);
                        destVal &= mask;
                        
                        const result = isSub ? (destVal - value) : (destVal + value);
                        const resMasked = result & mask;
                        
                        cpu.writeEA(destEa, resMasked, eaSize);
                        
                        if (!destIsAddressReg) {
                            const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                            const SMC = (value & signBit) !== 0; 
                            const DMC = (destVal & signBit) !== 0;
                            const RMC = (resMasked & signBit) !== 0;

                            cpu.fZ = resMasked === 0 ? 1 : 0;
                            cpu.fN = RMC ? 1 : 0;
                            
                            if (isSub) {
                                cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                                cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;
                            } else {
                                cpu.fV = ((SMC ^ RMC) && (DMC ^ RMC)) ? 1 : 0;
                                cpu.fC = ((SMC && DMC) || (!RMC && DMC) || (SMC && !RMC)) ? 1 : 0;
                            }
                            cpu.fX = cpu.fC;
                        }
                        return size === 3 ? 8 : 4;
                    };
                }
            }

            // --- 5. ADDX / SUBX (Add/Subtract with Extend) Group ---
            else if ((opcode & 0xF130) === 0xD100 || (opcode & 0xF130) === 0x9100) {
                const isSub = ((opcode >> 12) & 0xF) === 0x9;
                const rx = (opcode >> 9) & 7;
                const sizeRaw = (opcode >> 6) & 3;
                const isMemory = (opcode & 0x0008) !== 0;
                const ry = opcode & 7;

                if (sizeRaw !== 3) {
                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        let srcVal, destVal, destEa;

                        if (isMemory) {
                            const srcEa = cpu.resolveEA(4, ry, size);
                            destEa = cpu.resolveEA(4, rx, size);
                            srcVal = cpu.readEA(srcEa, size);
                            destVal = cpu.readEA(destEa, size);
                        } else {
                            srcVal = cpu.d[ry];
                            destVal = cpu.d[rx];
                        }

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;

                        const result = isSub ? (destVal - srcVal - cpu.fX) : (destVal + srcVal + cpu.fX);
                        const resMasked = result & mask;

                        // Critical Hardware Rule: Z flag is only cleared if result is non-zero,
                        // otherwise it remains unaffected (does not reset to 1).
                        if (resMasked !== 0) cpu.fZ = 0; 
                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;

                        const SMC = (srcVal & signBit) !== 0;
                        const DMC = (destVal & signBit) !== 0;
                        const RMC = (resMasked & signBit) !== 0;

                        if (isSub) {
                            cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;
                        } else {
                            cpu.fV = ((SMC ^ RMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && DMC) || (!RMC && DMC) || (SMC && !RMC)) ? 1 : 0;
                        }
                        cpu.fX = cpu.fC;

                        if (isMemory) {
                            cpu.writeEA(destEa, resMasked, size);
                        } else {
                            if (size === 1) cpu.d[rx] = (cpu.d[rx] & 0xFFFFFF00) | resMasked;
                            else if (size === 2) cpu.d[rx] = (cpu.d[rx] & 0xFFFF0000) | resMasked;
                            else cpu.d[rx] = resMasked;
                        }

                        return isMemory ? (size === 3 ? 30 : 18) : (size === 3 ? 8 : 4);
                    };
                }
            }

            // --- 6. MULU / MULS (Multiply) Group ---
            else if (opType === 0xC) {
                const reg = (opcode >> 9) & 7;
                const isSigned = (opcode & 0x0100) !== 0;
                const opMode = (opcode >> 6) & 7;

                if (opMode === 3 || opMode === 7) { 
                    const mode = (opcode >> 3) & 7;
                    const srcReg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const srcEa = cpu.resolveEA(mode, srcReg, 2); 
                        let srcVal = cpu.readEA(srcEa, 2) & 0xFFFF;
                        let destVal = cpu.d[reg] & 0xFFFF;

                        let result = 0;
                        if (isSigned) {
                            result = ((srcVal << 16) >> 16) * ((destVal << 16) >> 16);
                        } else {
                            result = srcVal * destVal;
                        }

                        cpu.d[reg] = result & 0xFFFFFFFF;

                        cpu.fZ = (result === 0) ? 1 : 0;
                        cpu.fN = (result < 0 || (result & 0x80000000) !== 0) ? 1 : 0;
                        cpu.fV = 0;
                        cpu.fC = 0;

                        return 70; 
                    };
                }
            }

            // --- 7. DIVU / DIVS (Divide) Group ---
            else if (opType === 0x8) {
                const reg = (opcode >> 9) & 7;
                const isSigned = (opcode & 0x0100) !== 0;
                const opMode = (opcode >> 6) & 7;

                if (opMode === 3 || opMode === 7) { 
                    const mode = (opcode >> 3) & 7;
                    const srcReg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const srcEa = cpu.resolveEA(mode, srcReg, 2); 
                        let divisor = cpu.readEA(srcEa, 2) & 0xFFFF;
                        let dividend = cpu.d[reg] & 0xFFFFFFFF;

                        // 1. Division by Zero: Triggers Vector 5 Exception
                        if (divisor === 0) {
                            cpu.triggerException(5);
                            return 4; 
                        }

                        let quotient = 0;
                        let remainder = 0;

                        if (isSigned) {
                            divisor = (divisor << 16) >> 16;
                            dividend = dividend | 0; 
                            quotient = Math.trunc(dividend / divisor);
                            remainder = dividend % divisor;

                            // 2. Division Overflow (Signed): Quotient exceeds signed 16-bit boundaries
                            // Destination register must remain completely unmodified
                            if (quotient > 32767 || quotient < -32768) {
                                cpu.fV = 1; 
                                cpu.fC = 0;
                                return 140;
                            }
                        } else {
                            dividend = dividend >>> 0;
                            quotient = Math.floor(dividend / divisor);
                            remainder = dividend % divisor;

                            // 3. Division Overflow (Unsigned): Quotient exceeds unsigned 16-bit boundaries
                            if (quotient > 0xFFFF) {
                                cpu.fV = 1; 
                                cpu.fC = 0;
                                return 140; 
                            }
                        }

                        cpu.d[reg] = ((remainder & 0xFFFF) << 16) | (quotient & 0xFFFF);

                        cpu.fZ = (quotient === 0) ? 1 : 0;
                        cpu.fN = isSigned ? (quotient < 0 ? 1 : 0) : ((quotient & 0x8000) !== 0 ? 1 : 0);
                        cpu.fV = 0;
                        cpu.fC = 0;

                        return 140; 
                    };
                }
            }

            // --- 8. EXT (Sign Extend) Group ---
            else if ((opcode & 0xFEF8) === 0x4880) { // EXT.W (Extend Byte to Word)
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const val = cpu.d[reg] & 0xFF;
                    const extended = (val << 24) >> 24; 
                    cpu.d[reg] = (cpu.d[reg] & 0xFFFF0000) | (extended & 0xFFFF);
                    
                    cpu.fZ = ((extended & 0xFFFF) === 0) ? 1 : 0;
                    cpu.fN = (extended & 0x8000) !== 0 ? 1 : 0;
                    cpu.fV = 0;
                    cpu.fC = 0;
                    return 4;
                };
            }
            else if ((opcode & 0xFEF8) === 0x48C0) { // EXT.L (Extend Word to Longword)
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const val = cpu.d[reg] & 0xFFFF;
                    const extended = (val << 16) >> 16; 
                    cpu.d[reg] = extended;
                    
                    cpu.fZ = (extended === 0) ? 1 : 0;
                    cpu.fN = (extended < 0) ? 1 : 0;
                    cpu.fV = 0;
                    cpu.fC = 0;
                    return 4;
                };
            }

            // --- 9. ADDI / SUBI (Add/Subtract Immediate) Group ---
            else if ((opcode & 0xFF00) === 0x0600 || (opcode & 0xFF00) === 0x0400) {
                const isSub = (opcode & 0x0200) === 0;
                const sizeRaw = (opcode >> 6) & 3;
                
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);

                    opcodeTable[opcode] = () => {
                        const immEa = cpu.resolveEA(7, 4, size);
                        let srcVal = cpu.readEA(immEa, size);

                        const destEa = cpu.resolveEA(mode, reg, size);
                        let destVal = cpu.readEA(destEa, size);

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;

                        const result = isSub ? (destVal - srcVal) : (destVal + srcVal);
                        const resMasked = result & mask;

                        const SMC = (srcVal & signBit) !== 0;
                        const DMC = (destVal & signBit) !== 0;
                        const RMC = (resMasked & signBit) !== 0;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = RMC ? 1 : 0;

                        if (isSub) {
                            cpu.fV = ((SMC ^ DMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && !DMC) || (RMC && !DMC) || (SMC && RMC)) ? 1 : 0;
                        } else {
                            cpu.fV = ((SMC ^ RMC) && (DMC ^ RMC)) ? 1 : 0;
                            cpu.fC = ((SMC && DMC) || (!RMC && DMC) || (SMC && !RMC)) ? 1 : 0;
                        }
                        cpu.fX = cpu.fC;

                        cpu.writeEA(destEa, resMasked, size);

                        return size === 3 ? 16 : 8;
                    };
                }
            }
        }
    }
}