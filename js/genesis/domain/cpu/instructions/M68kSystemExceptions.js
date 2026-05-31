/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU System Exceptions & Peripherals Registry
 * 
 * Implements hardware exceptions (TRAP, CHK, ILLEGAL, TRAPV), system halts (STOP),
 * atomic synchronization (TAS), peripheral memory dumps (MOVEP), and the privileged 
 * hardware RESET instruction, adhering strictly to the Single Responsibility Principle.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates CPU exception triggers, privilege 
 *   checks, and hardware reset delegations cleanly into its own domain file.
 * - Open/Closed Principle (OCP): Dynamically populates the CPU's opcode dispatch 
 *   table on startup without modifying core CPU execution code.
 */

class M68kSystemExceptions {
    /**
     * Registers System and Exception opcodes onto the dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        // --- 1. ILLEGAL & TRAPV (Static Opcodes) ---
        opcodeTable[0x4AFC] = () => { cpu.triggerException(4); return 34; }; // ILLEGAL Instruction
        opcodeTable[0x4E76] = () => { if (cpu.fV) { cpu.triggerException(7); return 34; } return 4; }; // TRAPV

        // --- 2. RESET (Assert Peripheral Reset Line - Static Opcode) ---
        // Format: [0100][1110][0111][0000] -> 0x4E70
        opcodeTable[0x4E70] = () => {
            if ((cpu.sr & 0x2000) === 0) { // Privilege check (RESET is a privileged instruction)
                cpu.triggerException(8); // Privilege Violation
                return 34;
            }
            // Aligned with authentic hardware: resets external co-processors and buses,
            // but does NOT reset the M68K registers or PC itself.
            if (cpu.bus) {
                cpu.bus.initialise(); 
            }
            return 132; // Standard M68000 RESET instruction execution penalty cycles
        };

        // --- 3. STOP (Load SR and Stop - Static Opcode) ---
        // Format: [0100][1110][0111][0010] -> 0x4E72
        opcodeTable[0x4E72] = () => {
            if ((cpu.sr & 0x2000) === 0) { // Privilege check
                cpu.triggerException(8);
                return 34;
            }
            const imm = cpu.bus.readWord(cpu.pc, cpu.pc);
            cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
            cpu.syncStackPointers(imm);
            cpu.isHalted = true; // CPU freezes until an interrupt wakes it up
            return 4;
        };

        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 4. TRAP (Software Exception Vector) ---
            // Format: [0100][1110][0100][vector:4]
            if ((opcode & 0xFFF0) === 0x4E40) {
                const trapVector = opcode & 0xF;
                opcodeTable[opcode] = () => {
                    cpu.triggerException(32 + trapVector); // Vectors 32 to 47 are TRAPs
                    return 34;
                };
                continue;
            }

            // --- 5. CHK (Check Register Against Bounds) ---
            // Format: [0100][reg:3][110][mode:3][reg:3]
            if ((opcode & 0xF1C0) === 0x4180) {
                const reg = (opcode >> 9) & 7;
                const mode = (opcode >> 3) & 7;
                const srcReg = opcode & 7;
                
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, srcReg, 2);
                    const limit = (cpu.readEA(ea, 2) << 16) >> 16; // Sign extended Word
                    const val = (cpu.d[reg] & 0xFFFF) << 16 >> 16;

                    if (val < 0 || val > limit) {
                        cpu.fN = val < 0 ? 1 : 0;
                        cpu.triggerException(6); // CHK Exception Vector
                        return 40;
                    }
                    return 10;
                };
                continue;
            }

            // --- 6. TAS (Test and Set) ---
            // Format: [0100][1010][11][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x4AC0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 1);
                    let val = cpu.readEA(ea, 1);
                    
                    cpu.fZ = val === 0 ? 1 : 0;
                    cpu.fN = (val & 0x80) !== 0 ? 1 : 0;
                    cpu.fV = 0;
                    cpu.fC = 0;

                    val |= 0x80; // Set MSB atomically
                    cpu.writeEA(ea, val, 1);
                    
                    return mode === 0 ? 4 : 14;
                };
                continue;
            }

            // --- 7. NBCD (Negate Decimal with Extend) ---
            // Format: [0100][1000][00][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x4800) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 1);
                    const val = cpu.readEA(ea, 1);
                    
                    let low = 0 - (val & 0x0F) - cpu.fX;
                    let high = 0 - (val >> 4);
                    let newCarry = 0;

                    if (low < 0) {
                        low += 10;
                        high -= 1;
                    }
                    if (high < 0) {
                        high += 10;
                        newCarry = 1;
                    }

                    const result = (high << 4) | low;
                    
                    if (result !== 0) cpu.fZ = 0;
                    cpu.fC = newCarry;
                    cpu.fX = newCarry;
                    
                    cpu.writeEA(ea, result, 1);
                    return mode === 0 ? 6 : 8;
                };
                continue;
            }

            // --- 8. MOVEP (Move Peripheral Data) ---
            // Format: [0000][dReg:3][opmode:3][001][aReg:3]
            if ((opcode & 0xF138) === 0x0108) {
                const dReg = (opcode >> 9) & 7;
                const opmode = (opcode >> 6) & 7;
                const aReg = opcode & 7;

                if (opmode >= 4) {
                    opcodeTable[opcode] = () => {
                        const displacement = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16;
                        cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                        let ea = (cpu.a[aReg] + displacement) & 0xFFFFFF;
                        
                        const isLong = (opmode & 1) !== 0;
                        const toMemory = (opmode & 2) !== 0;

                        if (toMemory) {
                            if (isLong) {
                                cpu.bus.writeByte(ea, (cpu.d[dReg] >> 24) & 0xFF, cpu.pc); ea += 2;
                                cpu.bus.writeByte(ea, (cpu.d[dReg] >> 16) & 0xFF, cpu.pc); ea += 2;
                            }
                            cpu.bus.writeByte(ea, (cpu.d[dReg] >> 8) & 0xFF, cpu.pc); ea += 2;
                            cpu.bus.writeByte(ea, cpu.d[dReg] & 0xFF, cpu.pc);
                        } else {
                            let res = 0;
                            if (isLong) {
                                res |= cpu.bus.readByte(ea, cpu.pc) << 24; ea += 2;
                                res |= cpu.bus.readByte(ea, cpu.pc) << 16; ea += 2;
                            }
                            res |= cpu.bus.readByte(ea, cpu.pc) << 8; ea += 2;
                            res |= cpu.bus.readByte(ea, cpu.pc);
                            
                            if (isLong) cpu.d[dReg] = res;
                            else cpu.d[dReg] = (cpu.d[dReg] & 0xFFFF0000) | (res & 0xFFFF);
                        }
                        return isLong ? 24 : 16;
                    };
                    continue;
                }
            }
        }
    }
}