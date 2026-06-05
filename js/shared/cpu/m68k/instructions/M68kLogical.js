/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/m68k/instructions/M68kLogical.js
 * 
 * Role:
 * Domain Layer: M68K CPU Logical Instructions.
 * Implements the registration and execution logic for the entire M68K 
 * logical instruction family (AND, OR, EOR, NOT, TST, CLR, NEG, NEGX, ANDI, ORI, EORI).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    definition, registration, and execution of the logical and clear instruction subset.
 * 2. Interface Segregation Principle (ISP): Depends on a thin, unified opcode 
 *    mapping dictionary (registry) instead of relying on the complete, heavy 
 *    execution loop of the M68000 class.
 */

class M68kLogical {
    /**
     * Registers all Logical opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 1. Immediate to CCR / SR (ORI, ANDI, EORI to Status Registers) ---
            // Format ORI/ANDI/EORI to CCR = 0x003C, 0x023C, 0x0A3C (Byte size)
            // Format ORI/ANDI/EORI to SR  = 0x007C, 0x027C, 0x0A7C (Word size)
            if (opcode === 0x003C || opcode === 0x007C || opcode === 0x023C || opcode === 0x027C || opcode === 0x0A3C || opcode === 0x0A7C) {
                const isSR = (opcode & 0x0040) !== 0; // Bit 6 determines if it targets SR (1) or CCR (0)
                const immediateOpType = (opcode >> 8) & 0xF; // 0=ORI, 2=ANDI, A=EORI

                opcodeTable[opcode] = () => {
                    const size = isSR ? 2 : 1;
                    
                    // Fetch immediate operand directly following the instruction word
                    const immEa = cpu.resolveEA(7, 4, size); 
                    const srcVal = cpu.readEA(immEa, size);

                    // Writing to the Status Register (SR) is a privileged operation
                    if (isSR && (cpu.sr & 0x2000) === 0) {
                        cpu.triggerException(8); // Privilege violation exception
                        return 34;
                    }

                    let currentVal = isSR ? cpu.sr : cpu.getCCR();
                    let result = 0;

                    if (immediateOpType === 0x0) result = currentVal | srcVal;      // ORI to SR/CCR
                    else if (immediateOpType === 2) result = currentVal & srcVal; // ANDI to SR/CCR
                    else if (immediateOpType === 0xA) result = currentVal ^ srcVal; // EORI to SR/CCR

                    if (isSR) {
                        // Updates stack pointers if supervisor mode status changed
                        cpu.syncStackPointers(result);
                    } else {
                        cpu.setCCR(result & 0xFF);
                    }

                    return 20; // Word-size immediate to SR consumes 20 cycles
                };
                continue;
            }

            // --- 2. AND / OR Group ---
            // Format: [opType:4][reg:3][opMode:3][src_mode:3][src_reg:3]
            const opType = (opcode >> 12) & 0xF;
            if (opType === 0xC || opType === 0x8) { // AND = 0xC, OR = 0x8
                const reg = (opcode >> 9) & 7;
                const opMode = (opcode >> 6) & 7;
                const srcMode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;

                // Exclude only modes 3 and 7 (which belong to MUL, DIV, ABCD, SBCD instruction groups)
                if (opMode === 3 || opMode === 7) {
                    continue; 
                }
                
                // Extra protection: EXG (Exchange) overlaps with opType 0xC (AND) when opMode is 5 or 6 and srcMode is 1.
                if (opType === 0xC && srcMode === 1 && (opMode === 5 || opMode === 6)) {
                    continue;
                }

                opcodeTable[opcode] = () => {
                    const size = (opMode === 0 || opMode === 4) ? 1 : ((opMode === 1 || opMode === 5) ? 2 : 3);
                    const toRegister = (opMode < 3);
                    const isAnd = (opType === 0xC);

                    const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                    const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                    if (toRegister) {
                        const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                        let srcVal = cpu.readEA(srcEa, size) & mask;
                        let destVal = cpu.d[reg] & mask;

                        const result = isAnd ? (destVal & srcVal) : (destVal | srcVal);

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = result === 0 ? 1 : 0;
                        cpu.fN = (result & signBit) !== 0 ? 1 : 0;

                        if (size === 1) cpu.d[reg] = (cpu.d[reg] & 0xFFFFFF00) | result;
                        else if (size === 2) cpu.d[reg] = (cpu.d[reg] & 0xFFFF0000) | result;
                        else cpu.d[reg] = result;
                    } else {
                        const destEa = cpu.resolveEA(srcMode, srcReg, size);
                        let destVal = cpu.readEA(destEa, size) & mask;
                        let srcVal = cpu.d[reg] & mask;

                        const result = isAnd ? (destVal & srcVal) : (destVal | srcVal);

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = result === 0 ? 1 : 0;
                        cpu.fN = (result & signBit) !== 0 ? 1 : 0;

                        cpu.writeEA(destEa, result, size);
                    }

                    return size === 3 ? 8 : 4;
                };
                continue;
            }

            // --- 3. EOR (Exclusive OR) Group ---
            // Format: [1011][reg:3][1][size_raw:2][mode:3][reg:3]
            if ((opcode & 0xF100) === 0xB100) {
                const reg = (opcode >> 9) & 7;
                const sizeRaw = (opcode >> 6) & 3;
                const mode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;

                // Protect CMPM overlapping with EOR
                if (sizeRaw !== 3 && mode !== 1) { 
                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        const destEa = cpu.resolveEA(mode, srcReg, size);
                        
                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        let destVal = cpu.readEA(destEa, size) & mask;
                        let srcVal = cpu.d[reg] & mask;

                        const result = destVal ^ srcVal;

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = result === 0 ? 1 : 0;
                        cpu.fN = (result & signBit) !== 0 ? 1 : 0;

                        cpu.writeEA(destEa, result, size);

                        return size === 3 ? 12 : 8;
                    };
                }
                continue;
            }

            // --- 4. Immediate Logicals (ANDI, ORI, EORI) to Data/Memory ---
            // Format: [0000][opType:2][00][size:2][mode:3][reg:3]
            if ((opcode & 0xFF00) === 0x0200 || (opcode & 0xFF00) === 0x0000 || (opcode & 0xFF00) === 0x0A00) {
                const immediateOpType = (opcode >> 9) & 7; // 0=ORI, 1=ANDI, 5=EORI (0x0A)
                const sizeRaw = (opcode >> 6) & 3;
                
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);

                    opcodeTable[opcode] = () => {
                        // Fetch Immediate Operand
                        const immEa = cpu.resolveEA(7, 4, size);
                        let srcVal = cpu.readEA(immEa, size);
                        
                        // Fetch Destination Operand
                        const destEa = cpu.resolveEA(mode, reg, size);
                        let destVal = cpu.readEA(destEa, size);

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        srcVal &= mask;
                        destVal &= mask;

                        let result = 0;
                        if (immediateOpType === 0) result = destVal | srcVal;      // ORI
                        else if (immediateOpType === 1) result = destVal & srcVal; // ANDI
                        else result = destVal ^ srcVal;                            // EORI

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = result === 0 ? 1 : 0;
                        cpu.fN = (result & signBit) !== 0 ? 1 : 0;

                        cpu.writeEA(destEa, result, size);

                        return size === 3 ? 16 : 8;
                    };
                    continue;
                }
            }

            // --- 5. TST (Test Operand) Group ---
            // Format: [0100][1010][size:2][mode:3][reg:3]
            if ((opcode & 0xFF00) === 0x4A00) {
                const sizeRaw = (opcode >> 6) & 3;
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    // Standard 68000 Rule: TST does NOT support Address Register Direct (An) mode (mode === 1).
                    // If mode === 1, we skip registration to let the core throw an Illegal Instruction exception.
                    if (mode !== 1) {
                        opcodeTable[opcode] = () => {
                            const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                            const ea = cpu.resolveEA(mode, reg, size);
                            let val = cpu.readEA(ea, size);

                            const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                            const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                            val &= mask;

                            // Update CCR Status Flags
                            cpu.fV = 0;
                            cpu.fC = 0;
                            cpu.fZ = val === 0 ? 1 : 0;
                            cpu.fN = (val & signBit) !== 0 ? 1 : 0;
                            
                            return 4;
                        };
                    }
                }
                continue;
            }

            // --- 6. CLR (Clear Operand) Group ---
            // Format: [0100][0010][size:2][mode:3][reg:3]
            if ((opcode & 0xFF00) === 0x4200) {
                const sizeRaw = (opcode >> 6) & 3;
                if (sizeRaw !== 3) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        const ea = cpu.resolveEA(mode, reg, size);
                        cpu.writeEA(ea, 0, size);

                        // Update CCR Status Flags
                        cpu.fN = 0;
                        cpu.fZ = 1;
                        cpu.fV = 0;
                        cpu.fC = 0;
                        
                        return size === 3 ? 10 : 6;
                    };
                }
                continue;
            }

            // --- 7. NEG / NEGX (Negate Operand) Group ---
            if ((opcode & 0xFF00) === 0x4400 || (opcode & 0xFF00) === 0x4000) {
                const isNegx = (opcode & 0x0400) === 0; 
                const sizeRaw = (opcode >> 6) & 3;

                if (sizeRaw !== 3 && !((opcode & 0xFFC0) === 0x40C0)) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        const ea = cpu.resolveEA(mode, reg, size);
                        let val = cpu.readEA(ea, size);

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        val &= mask;

                        const result = isNegx ? (0 - val - cpu.fX) : (0 - val);
                        const resMasked = result & mask;
                        
                        cpu.writeEA(ea, resMasked, size);

                        if (isNegx) {
                            if (resMasked !== 0) cpu.fZ = 0; 
                        } else {
                            cpu.fZ = resMasked === 0 ? 1 : 0;
                        }

                        cpu.fN = (resMasked & signBit) !== 0 ? 1 : 0;
                        
                        if (isNegx) {
                            cpu.fV = ((val & signBit) !== 0) && ((resMasked & signBit) !== 0) ? 1 : 0;
                            cpu.fC = (val | resMasked) !== 0 ? 1 : 0;
                        } else {
                            cpu.fV = (val & signBit) !== 0 && resMasked === 0 ? 1 : 0; 
                            cpu.fC = val !== 0 ? 1 : 0;
                        }
                        
                        cpu.fX = cpu.fC;

                        return size === 3 ? 10 : 6;
                    };
                }
                continue;
            }

            // --- 8. NOT (Logical One's Complement) Group ---
            if ((opcode & 0xFF00) === 0x4600) {
                const sizeRaw = (opcode >> 6) & 3;
                
                if (sizeRaw !== 3 && !((opcode & 0xFFC0) === 0x46C0)) {
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    opcodeTable[opcode] = () => {
                        const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                        const ea = cpu.resolveEA(mode, reg, size);
                        let val = cpu.readEA(ea, size);

                        const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                        const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);

                        val &= mask;

                        const result = (~val) & mask;
                        cpu.writeEA(ea, result, size);

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = result === 0 ? 1 : 0;
                        cpu.fN = (result & signBit) !== 0 ? 1 : 0;

                        return size === 3 ? 10 : 6;
                    };
                }
                continue;
            }
        }
    }
}