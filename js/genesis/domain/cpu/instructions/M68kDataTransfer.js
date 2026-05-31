/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Data Transfer Instruction Registry
 * 
 * Implements the registration and execution logic for the entire M68K 
 * data movement instruction family (MOVE, MOVEA, MOVEQ, MOVEM, LEA, PEA, 
 * EXG, SWAP, LINK, UNLK, and Status Register transfers).
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates register and memory data transfer 
 *   mechanics cleanly into its own domain file.
 * - Open/Closed Principle (OCP): Dynamically populates the CPU's opcode dispatch 
 *   table on startup without modifying core CPU execution code.
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

                // Map the specific instruction to its execution closure
                opcodeTable[opcode] = () => {
                    // Size mapping: 1 = Byte, 3 = Word, 2 = Long
                    const size = moveSize === 3 ? 2 : (moveSize === 2 ? 3 : 1);
                    const srcEa = cpu.resolveEA(srcMode, srcReg, size);
                    let value = cpu.readEA(srcEa, size);

                    if (destMode === 1) {
                        // MOVEA: Destination is Address Register Direct
                        // Word-sized loads to address registers are always sign-extended to 32 bits
                        if (size === 2) {
                            value = (value << 16) >> 16;
                        }
                        cpu.a[destReg] = value & 0xFFFFFFFF;
                    } else {
                        // Standard MOVE
                        const destEa = cpu.resolveEA(destMode, destReg, size);
                        cpu.writeEA(destEa, value, size);

                        // Update CCR Status Flags
                        cpu.fV = 0;
                        cpu.fC = 0;
                        cpu.fZ = (value & (size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF))) === 0 ? 1 : 0;
                        cpu.fN = size === 1 ? ((value & 0x80) !== 0 ? 1 : 0) : (size === 2 ? ((value & 0x8000) !== 0 ? 1 : 0) : ((value & 0x80000000) !== 0 ? 1 : 0));
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

                    let ea = cpu.resolveEA(mode, reg, size);
                    let cycles = 12;

                    if (toMemory) {
                        // Pre-decrement mode (mode === 4) registers are stored in reverse order
                        const reverseOrder = (mode === 4);
                        for (let i = 0; i < 16; i++) {
                            const regIdx = reverseOrder ? (15 - i) : i;
                            if (regMask & (1 << i)) {
                                const val = regIdx < 8 ? cpu.d[regIdx] : cpu.a[regIdx - 8];
                                cpu.writeEA(ea, val, size);
                                ea += reverseOrder ? (size === 2 ? -2 : -4) : (size === 2 ? 2 : 4);
                                cycles += isWord ? 4 : 8;
                            }
                        }
                    } else {
                        // Post-increment/Absolute modes read registers in standard order
                        for (let i = 0; i < 16; i++) {
                            if (regMask & (1 << i)) {
                                let val = cpu.readEA(ea, size);
                                if (i < 8) {
                                    cpu.d[i] = isWord ? ((val << 16) >> 16) : val;
                                } else {
                                    cpu.a[i - 8] = isWord ? ((val << 16) >> 16) : val;
                                }
                                ea += (size === 2 ? 2 : 4);
                                cycles += isWord ? 4 : 8;
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
                    return 8; // Average cycles, actual depends on addressing mode
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
            // Safe filter: We only process if mode is not 0 (which is reserved for SWAP)
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
                // Valid EXG opmodes: 0x08 (Dx, Dy), 0x09 (Ax, Ay), 0x11 (Dx, Ay)
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
                    const ea = cpu.resolveEA(mode, reg, 2); // Reads Word size (16-bit)
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
                    
                    // Instruction is privileged, verify Supervisor mode
                    if ((cpu.sr & 0x2000) === 0) {
                        cpu.triggerException(8); // Privilege violation vector
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
                    // Note: In 68000 this is NOT privileged (only in 68010+)
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