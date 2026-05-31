/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Arithmetic Instruction Registry
 * 
 * Implements the registration and execution logic for the entire M68K 
 * arithmetic instruction family. Now includes high-precision ADDI and SUBI 
 * modules fully aligned with MDTracer's boolean algebraic flag solvers.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates mathematical operations 
 *   and status flag (CCR) updates cleanly into its own domain file.
 * - Open/Closed Principle (OCP): Dynamically populates the CPU's opcode dispatch 
 *   table on startup without modifying core CPU execution code.
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
            if (opType === 0xD || opType === 0x9) { // ADD = 0xD, SUB = 0x9
                const reg = (opcode >> 9) & 7;
                const opMode = (opcode >> 6) & 7;
                const srcMode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;
                
                const isAdd = (opType === 0xD);

                // Safe Hardware Filter: ADDX/SUBX strictly require bit 8 as 1 and bits 4-5 as 0
                const isAddxSubx = (opcode & 0x0130) === 0x0100;

                if (isAddxSubx) {
                    continue; // Skip and let the specialized ADDX/SUBX block handle this opcode
                }
                
                if (opMode === 3 || opMode === 7) {
                    // ADDA / SUBA: Destination is always an Address Register
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
                    continue;
                } else {
                    // Standard ADD / SUB
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
                        
                        const result = isAdd ? (destVal + srcVal) : (destVal - srcVal);
                        
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const resMasked = result & mask;

                        // Update CCR Status Flags
                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                        
                        if (isAdd) {
                            cpu.fV = ((destVal & signBit) === (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                            cpu.fC = result > mask ? 1 : 0;
                        } else {
                            cpu.fV = ((destVal & signBit) !== (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                            cpu.fC = destVal < srcVal ? 1 : 0; // Borrow
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
                    continue;
                }
            }

            // --- 2. CMP / CMPA / CMPM (Compare) Group ---
            if (opType === 0xB) {
                const reg = (opcode >> 9) & 7;
                const opMode = (opcode >> 6) & 7;
                const srcMode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;

                if (opMode === 3 || opMode === 7) {
                    // CMPA (Compare Address)
                    opcodeTable[opcode] = () => {
                        const size = (opMode === 3) ? 2 : 3;
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        let srcVal = cpu.readEA(srcEa, size);
                        
                        if (size === 2) srcVal = (srcVal << 16) >> 16;
                        const destVal = cpu.a[reg];
                        const result = destVal - srcVal;

                        const resMasked = result & 0xFFFFFFFF;
                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = (resMasked & 0x80000000) !== 0 ? 1 : 0;
                        cpu.fV = ((destVal & 0x80000000) !== (srcVal & 0x80000000)) && ((resMasked & 0x80000000) !== (destVal & 0x80000000)) ? 1 : 0;
                        cpu.fC = destVal < srcVal ? 1 : 0;
                        
                        return 6;
                    };
                    continue;
                } else if ((opcode & 0x0138) === 0x0108) {
                    // CMPM (Compare Memory)
                    const sizeRaw = (opcode >> 6) & 3;
                    if (sizeRaw !== 3) {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        opcodeTable[opcode] = () => {
                            const srcEa = cpu.resolveEA(3, srcReg, size); 
                            const destEa = cpu.resolveEA(3, reg, size);
                            const srcVal = cpu.readEA(srcEa, size);
                            const destVal = cpu.readEA(destEa, size);
                            const result = destVal - srcVal;

                            const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                            const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                            const resMasked = result & mask;

                            cpu.fZ = resMasked === 0 ? 1 : 0;
                            cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                            cpu.fV = ((destVal & signBit) !== (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                            cpu.fC = destVal < srcVal ? 1 : 0;

                            return size === 3 ? 20 : 12;
                        };
                        continue;
                    }
                } else {
                    // Standard CMP
                    const size = opMode === 0 ? 1 : (opMode === 1 ? 2 : 3);
                    opcodeTable[opcode] = () => {
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        const srcVal = cpu.readEA(srcEa, size);
                        const destVal = cpu.d[reg] & (size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF));
                        const result = destVal - srcVal;

                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const resMasked = result & mask;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                        cpu.fV = ((destVal & signBit) !== (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                        cpu.fC = destVal < srcVal ? 1 : 0;

                        return size === 3 ? 6 : 4;
                    };
                    continue;
                }
            }

            // --- 3. CMPI (Compare Immediate) Group ---
            if ((opcode & 0xFF00) === 0x0C00) {
                const sizeRaw = (opcode >> 6) & 3;
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);

                    opcodeTable[opcode] = () => {
                        const immEa = cpu.resolveEA(7, 4, size);
                        const srcVal = cpu.readEA(immEa, size);
                        
                        const destEa = cpu.resolveEA(mode, reg, size);
                        const destVal = cpu.readEA(destEa, size);

                        const result = destVal - srcVal;

                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const resMasked = result & mask;

                        cpu.fZ = resMasked === 0 ? 1 : 0;
                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                        cpu.fV = ((destVal & signBit) !== (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                        cpu.fC = destVal < srcVal ? 1 : 0;

                        return size === 3 ? 14 : 8;
                    };
                    continue;
                }
            }

            // --- 4. ADDQ / SUBQ (Add/Subtract Quick) Group ---
            if (opType === 0x5) {
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
                        const destVal = cpu.readEA(destEa, eaSize);
                        
                        const result = isSub ? (destVal - value) : (destVal + value);
                        cpu.writeEA(destEa, result, eaSize);
                        
                        if (!destIsAddressReg) {
                            const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                            const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                            const resMasked = result & mask;

                            cpu.fZ = resMasked === 0 ? 1 : 0;
                            cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                            
                            if (isSub) {
                                cpu.fV = ((destVal & signBit) !== 0) && ((resMasked & signBit) === 0) ? 1 : 0;
                                cpu.fC = destVal < value ? 1 : 0;
                            } else {
                                cpu.fV = ((destVal & signBit) === 0) && ((resMasked & signBit) !== 0) ? 1 : 0;
                                cpu.fC = result > mask ? 1 : 0;
                            }
                            cpu.fX = cpu.fC;
                        }
                        return size === 3 ? 8 : 4;
                    };
                }
                continue;
            }

            // --- 5. ADDX / SUBX (Add/Subtract with Extend) Group ---
            if ((opcode & 0xF130) === 0xD100 || (opcode & 0xF130) === 0x9100) {
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
                            srcVal = cpu.d[ry] & (size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF));
                            destVal = cpu.d[rx] & (size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF));
                        }

                        const result = isSub ? (destVal - srcVal - cpu.fX) : (destVal + srcVal + cpu.fX);
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                        const resMasked = result & mask;

                        if (resMasked !== 0) cpu.fZ = 0; 
                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;

                        if (isSub) {
                            cpu.fC = result < 0 ? 1 : 0;
                            cpu.fV = ((destVal & signBit) !== (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
                        } else {
                            cpu.fC = result > mask ? 1 : 0;
                            cpu.fV = ((destVal & signBit) === (srcVal & signBit)) && ((resMasked & signBit) !== (destVal & signBit)) ? 1 : 0;
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
                    continue;
                }
            }

            // --- 6. MULU / MULS (Multiply) Group ---
            if (opType === 0xC) {
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
                    continue;
                }
            }

            // --- 7. DIVU / DIVS (Divide) Group ---
            if (opType === 0x8) {
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

                            if (quotient > 32767 || quotient < -32768) {
                                cpu.fV = 1; 
                                cpu.fC = 0;
                                return 140;
                            }
                        } else {
                            dividend = dividend >>> 0;
                            quotient = Math.floor(dividend / divisor);
                            remainder = dividend % divisor;

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
                    continue;
                }
            }

            // --- 8. EXT (Sign Extend) Group ---
            if ((opcode & 0xFEF8) === 0x4880) { // EXT.W
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
                continue;
            }
            if ((opcode & 0xFEF8) === 0x48C0) { // EXT.L
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
                continue;
            }

            // --- 9. ABCD / SBCD (Binary Coded Decimal Math) Group ---
            if ((opcode & 0xF1F0) === 0xC100 || (opcode & 0xF1F0) === 0x8100) {
                const isSub = ((opcode >> 12) & 0xF) === 0x8;
                const rx = (opcode >> 9) & 7;
                const isMemory = (opcode & 0x0008) !== 0;
                const ry = opcode & 7;

                opcodeTable[opcode] = () => {
                    let srcVal, destVal, destEa;

                    if (isMemory) {
                        const srcEa = cpu.resolveEA(4, ry, 1);
                        destEa = cpu.resolveEA(4, rx, 1);
                        srcVal = cpu.readEA(srcEa, 1);
                        destVal = cpu.readEA(destEa, 1);
                    } else {
                        srcVal = cpu.d[ry] & 0xFF;
                        destVal = cpu.d[rx] & 0xFF;
                    }

                    let srcLow = srcVal & 0x0F, srcHigh = srcVal >> 4;
                    let destLow = destVal & 0x0F, destHigh = destVal >> 4;
                    let result = 0;
                    let carry = cpu.fX;

                    if (isSub) { // SBCD
                        let low = destLow - srcLow - carry;
                        let high = destHigh - srcHigh;
                        let newCarry = 0;

                        if (low < 0) {
                            low += 10;
                            high -= 1;
                        }
                        if (high < 0) {
                            high += 10;
                            newCarry = 1;
                        }

                        result = (high << 4) | low;
                        cpu.fC = newCarry;
                        cpu.fX = newCarry;
                    } else { // ABCD
                        let low = destLow + srcLow + carry;
                        let high = destHigh + srcHigh;
                        let newCarry = 0;

                        if (low > 9) {
                            low -= 10;
                            high += 1;
                        }
                        if (high > 9) {
                            high -= 10;
                            newCarry = 1;
                        }

                        result = (high << 4) | low;
                        cpu.fC = newCarry;
                        cpu.fX = newCarry;
                    }

                    if (result !== 0) cpu.fZ = 0; 
                    cpu.fN = (result & 0x80) !== 0 ? 1 : 0; 
                    cpu.fV = 0;

                    if (isMemory) {
                        cpu.writeEA(destEa, result, 1);
                    } else {
                        cpu.d[rx] = (cpu.d[rx] & 0xFFFFFF00) | result;
                    }

                    return isMemory ? 18 : 6;
                };
                continue;
            }

            // --- 10. ADDI / SUBI (Add/Subtract Immediate) Group ---
            // Format ADDI: [0000][0110][size:2][mode:3][reg:3] -> 0x0600
            // Format SUBI: [0000][0100][size:2][mode:3][reg:3] -> 0x0400
            if ((opcode & 0xFF00) === 0x0600 || (opcode & 0xFF00) === 0x0400) {
                const isSub = (opcode & 0x0200) === 0; // Bit 9 is 1 for ADDI, 0 for SUBI
                const sizeRaw = (opcode >> 6) & 3;
                
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);

                    opcodeTable[opcode] = () => {
                        // 1. Fetch immediate value (Source)
                        const immEa = cpu.resolveEA(7, 4, size);
                        const srcVal = cpu.readEA(immEa, size);

                        // 2. Fetch destination value
                        const destEa = cpu.resolveEA(mode, reg, size);
                        const destVal = cpu.readEA(destEa, size);

                        // 3. Perform addition/subtraction
                        const result = isSub ? (destVal - srcVal) : (destVal + srcVal);

                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const resMasked = result & mask;

                        // 4. Update Flags using MDTracer's verified Boolean logic (SMC, DMC, RMC)
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

                        // 5. Write back to destination
                        cpu.writeEA(destEa, resMasked, size);

                        return size === 3 ? 16 : 8; // Cycle count matching MDTracer
                    };
                    continue;
                }
            }
        }
    }
}