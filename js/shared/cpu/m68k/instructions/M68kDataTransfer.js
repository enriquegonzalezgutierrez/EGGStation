/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/m68k/instructions/M68kDataTransfer.js
 * 
 * Role:
 * Domain Layer: M68K CPU Data Transfer Instructions.
 * Implements the registration and execution logic for the entire M68K 
 * data movement instruction family (MOVE, MOVEA, MOVEQ, MOVEM, LEA, PEA, 
 * EXG, SWAP, LINK, UNLK, and Status Register transfers).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    definition, registration, and execution of the data movement instruction subset.
 * 2. Interface Segregation Principle (ISP): Depends on a thin, unified opcode 
 *    mapping dictionary (registry) instead of relying on the complete, heavy 
 *    execution loop of the M68000 class.
 */

class M68kDataTransfer {
    /**
     * Registers all Data Transfer opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        // Loop through all 65,536 possible 16-bit instructions to pre-compile the table
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 1. MOVE / MOVEA Group ---
            // Format: [00][size:2][dest_reg:3][dest_mode:3][src_mode:3][src_reg:3]
            const opClass = (opcode >> 14) & 3;
            const moveSize = (opcode >> 12) & 3;

            if (opClass === 0 && moveSize !== 0) {
                const destReg  = (opcode >> 9) & 7;
                const destMode = (opcode >> 6) & 7;
                const srcMode  = (opcode >> 3) & 7;
                const srcReg   = opcode & 7;

                // MOVE.B (moveSize === 1) cannot target address registers directly (destMode === 1)
                if (destMode === 1 && moveSize === 1) {
                    continue;
                }

                opcodeTable[opcode] = () => {
                    // Size mapping: 1 = Byte, 3 = Word, 2 = Long
                    const size = moveSize === 3 ? 2 : (moveSize === 2 ? 3 : 1);
                    const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                    let value = cpu.readEA(srcEa, size);

                    // Ensure value is properly masked to its logical size before operating
                    const sizeMask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                    value &= sizeMask;

                    if (destMode === 1) {
                        // MOVEA: Destination is Address Register Direct (An)
                        // Word-sized loads to address registers are always sign-extended to 32 bits.
                        // Important: MOVEA does NOT modify any CCR flags.
                        if (size === 2) {
                            value = (value << 16) >> 16;
                        }
                        cpu.a[destReg] = value & 0xFFFFFFFF;
                    } else {
                        // Standard MOVE: Destination is data register or memory
                        const destEa = cpu.resolveEA(destMode, destReg, size);
                        cpu.writeEA(destEa, value, size);

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = value === 0 ? 1 : 0;
                        cpu.fN = size === 1 ? ((value & 0x80) !== 0 ? 1 : 0) : 
                                 (size === 2 ? ((value & 0x8000) !== 0 ? 1 : 0) : 
                                 ((value & 0x80000000) !== 0 ? 1 : 0));
                    }

                    return size === 3 ? 12 : 8; // Return baseline execution cycles
                };
                continue;
            }

            // --- 2. MOVEQ (Move Quick) Group ---
            // Format: [0111][reg:3][0][data:8]
            if ((opcode & 0xF100) === 0x7000) {
                const reg = (opcode >> 9) & 7;
                const data = (opcode & 0xFF) << 24 >> 24; // Sign-extend 8-bit value to 32-bit

                opcodeTable[opcode] = () => {
                    cpu.d[reg] = data;
                    
                    // Update CCR Status Flags
                    cpu.fN = data < 0 ? 1 : 0;
                    cpu.fZ = data === 0 ? 1 : 0;
                    cpu.fV = 0;
                    cpu.fC = 0;
                    
                    return 4; // MOVEQ executes in 4 cycles
                };
                continue;
            }

            // --- 3. MOVEM (Move Multiple Registers) Group ---
            // Format: [0100][1000][dir:1][0][0][1][size:1][mode:3][reg:3]
            if ((opcode & 0xFB80) === 0x4880) {
                const isWord = (opcode & 0x0040) === 0;
                const size = isWord ? 2 : 3;
                const toMemory = (opcode & 0x0400) === 0;
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;

                opcodeTable[opcode] = () => {
                    // Fetch the 16-bit register mask word from the program stream
                    const regMask = cpu.bus.readWord(cpu.pc, cpu.pc) & 0xFFFF;
                    cpu.pc = (cpu.pc + 2) & 0xFFFFFF;

                    // Calculate total number of registers to transfer
                    let count = 0;
                    for (let i = 0; i < 16; i++) {
                        if (regMask & (1 << i)) count++;
                    }

                    const step = size === 2 ? 2 : 4;
                    let ea = 0;
                    let cycles = 12;

                    // 1:1 hardware-accurate register mapping aligned with BlastEm's memory sequencing
                    if (mode === 4) { // Pre-decrement -(An)
                        // In pre-decrement mode, registers are stored from A7-A0, then D7-D0.
                        // Puntero is decremented BEFORE each write.
                        let currentEa = cpu.a[reg];
                        for (let i = 0; i < 16; i++) {
                            const regIdx = 15 - i; // Reverse order (A7 down to D0)
                            if (regMask & (1 << i)) {
                                const val = regIdx < 8 ? cpu.d[regIdx] : cpu.a[regIdx - 8];
                                currentEa = (currentEa - step) & 0xFFFFFF;
                                cpu.writeEA(currentEa, val, size);
                                cycles += isWord ? 4 : 8;
                            }
                        }
                        cpu.a[reg] = currentEa; // Update base register with the final address
                    } else {
                        // Post-increment (An)+ or other standard addressing modes
                        if (mode === 3) { 
                            ea = cpu.a[reg];
                            cpu.a[reg] = (cpu.a[reg] + (count * step)) & 0xFFFFFF;
                        } else {
                            ea = cpu.resolveEA(mode, reg, size);
                        }

                        if (toMemory) {
                            let currentEa = ea;
                            for (let i = 0; i < 16; i++) {
                                if (regMask & (1 << i)) {
                                    const val = i < 8 ? cpu.d[i] : cpu.a[i - 8];
                                    cpu.writeEA(currentEa, val, size);
                                    currentEa += step; 
                                    cycles += isWord ? 4 : 8;
                                }
                            }
                        } else {
                            let currentEa = ea;
                            for (let i = 0; i < 16; i++) {
                                if (regMask & (1 << i)) {
                                    let val = cpu.readEA(currentEa, size);
                                    if (i < 8) {
                                        cpu.d[i] = isWord ? ((val << 16) >> 16) : val;
                                    } else {
                                        cpu.a[i - 8] = isWord ? ((val << 16) >> 16) : val;
                                    }
                                    currentEa += step;
                                    cycles += isWord ? 4 : 8;
                                }
                            }
                        }
                    }
                    return cycles;
                };
                continue;
            }

            // --- 4. LEA (Load Effective Address) Group ---
            // Format: [0100][aReg:3][111][mode:3][reg:3]
            if ((opcode & 0xF1C0) === 0x41C0) {
                const aReg = (opcode >> 9) & 7;
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;

                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 3); // Resolve long address
                    cpu.a[aReg] = ea;
                    return 8; 
                };
                continue;
            }

            // --- 5. SWAP (Swap Register Halves) Group ---
            // Format: [0100][1000][0100][0][reg:3]
            if ((opcode & 0xFFF8) === 0x4840) {
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const val = cpu.d[reg];
                    const upper = (val >> 16) & 0xFFFF;
                    const lower = val & 0xFFFF;
                    const result = ((lower << 16) | upper) >>> 0;
                    
                    cpu.d[reg] = result;
                    
                    // Update CCR Status Flags
                    cpu.fV = 0;
                    cpu.fC = 0;
                    cpu.fZ = result === 0 ? 1 : 0;
                    cpu.fN = (result & 0x80000000) !== 0 ? 1 : 0;
                    
                    return 4;
                };
                continue;
            }

            // --- 6. PEA (Push Effective Address) Group ---
            // Format: [0100][1000][01][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x4840 && ((opcode >> 3) & 7) !== 0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;

                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 3); // EA is 32-bit (Long)
                    cpu.pushLong(ea);
                    return 16; 
                };
                continue;
            }

            // --- 7. EXG (Exchange Registers) Group ---
            // Format: [1100][rx:3][1][opmode:5][ry:3]
            if ((opcode & 0xF100) === 0xC100) {
                const opmode = (opcode >> 3) & 0x1F;
                if (opmode === 0x08 || opmode === 0x09 || opmode === 0x11) {
                    const rx = (opcode >> 9) & 7;
                    const ry = opcode & 7;
                    
                    opcodeTable[opcode] = () => {
                        let temp;
                        if (opmode === 0x08) { // Data vs Data
                            temp = cpu.d[rx]; 
                            cpu.d[rx] = cpu.d[ry]; 
                            cpu.d[ry] = temp;
                        } else if (opmode === 0x09) { // Address vs Address
                            temp = cpu.a[rx]; 
                            cpu.a[rx] = cpu.a[ry]; 
                            cpu.a[ry] = temp;
                        } else if (opmode === 0x11) { // Data vs Address
                            temp = cpu.d[rx]; 
                            cpu.d[rx] = cpu.a[ry]; 
                            cpu.a[ry] = temp;
                        }
                        return 6;
                    };
                    continue;
                }
            }

            // --- 8. LINK (Link and Allocate) Group ---
            // Format: [0100][1110][0101][0][reg:3]
            if ((opcode & 0xFFF8) === 0x4E50) {
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const offset = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16; // Sign-extended
                    cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                    
                    cpu.pushLong(cpu.a[reg]);
                    cpu.a[reg] = cpu.a[7];
                    cpu.a[7] = (cpu.a[7] + offset) & 0xFFFFFF;
                    return 16;
                };
                continue;
            }

            // --- 9. UNLK (Unlink) Group ---
            // Format: [0100][1110][0101][1][reg:3]
            if ((opcode & 0xFFF8) === 0x4E58) {
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    cpu.a[7] = cpu.a[reg];
                    cpu.a[reg] = cpu.popLong();
                    return 12;
                };
                continue;
            }

            // --- 10. MOVE to CCR (Condition Code Register) ---
            // Format: [0100][0100][11][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x44C0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 2); 
                    const val = cpu.readEA(ea, 2);
                    cpu.setCCR(val & 0xFF); // Only lower byte affects CCR
                    return 12;
                };
                continue;
            }

            // --- 11. MOVE to SR (Status Register) ---
            // Format: [0100][0110][11][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x46C0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 2);
                    const val = cpu.readEA(ea, 2);
                    
                    // Privilege check (MOVE to SR is privileged)
                    if ((cpu.sr & 0x2000) === 0) {
                        cpu.triggerException(8); 
                        return 34;
                    }
                    cpu.syncStackPointers(val);
                    return 12;
                };
                continue;
            }

            // --- 12. MOVE from SR (Status Register) ---
            // Format: [0100][0000][11][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x40C0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 2);
                    cpu.writeEA(ea, cpu.sr, 2);
                    return mode === 0 ? 6 : 8; 
                };
                continue;
            }

            // --- 13. MOVE USP (User Stack Pointer) ---
            // MOVE USP, An -> [0100][1110][0110][0][reg:3]
            if ((opcode & 0xFFF8) === 0x4E60) {
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    if ((cpu.sr & 0x2000) === 0) {
                        cpu.triggerException(8);
                        return 34;
                    }
                    cpu.a[reg] = cpu.usp;
                    return 4;
                };
                continue;
            }
            
            // MOVE An, USP -> [0100][1110][0110][1][reg:3]
            if ((opcode & 0xFFF8) === 0x4E68) {
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    if ((cpu.sr & 0x2000) === 0) {
                        cpu.triggerException(8);
                        return 34;
                    }
                    cpu.usp = cpu.a[reg];
                    return 4;
                };
                continue;
            }

        }
    }
}