/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Program Flow Instruction Registry
 * 
 * Implements exclusively the M68K program flow control instruction family 
 * (JMP, JSR, BSR, RTS, RTE, RTR, Bcc, DBcc, Scc).
 */

class M68kProgramFlow {
    static register(cpu, opcodeTable) {
        
        // --- 1. Static Flow Opcodes ---
        opcodeTable[0x4E75] = () => { cpu.pc = cpu.popLong() & 0xFFFFFF; return 16; }; // RTS
        opcodeTable[0x4E71] = () => { return 4; }; // NOP

        opcodeTable[0x4E73] = () => { // RTE
            if ((cpu.sr & 0x2000) === 0) { cpu.triggerException(8); return 34; }
            const srVal = cpu.bus.readWord(cpu.a[7], cpu.pc) & 0xFFFF;
            cpu.a[7] = (cpu.a[7] + 2) & 0xFFFFFF;
            cpu.pc = cpu.popLong() & 0xFFFFFF;
            cpu.syncStackPointers(srVal);
            return 24;
        };

        opcodeTable[0x4E77] = () => { // RTR
            const ccrVal = cpu.bus.readWord(cpu.a[7], cpu.pc) & 0xFF;
            cpu.a[7] = (cpu.a[7] + 2) & 0xFFFFFF;
            cpu.pc = cpu.popLong() & 0xFFFFFF;
            cpu.setCCR(ccrVal);
            return 20;
        };

        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 2. JSR (Jump to Subroutine) ---
            if ((opcode & 0xFFC0) === 0x4E80) {
                const mode = (opcode >> 3) & 7, reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 3);
                    cpu.pushLong(cpu.pc);
                    cpu.pc = ea;
                    return 16;
                };
                continue;
            }

            // --- 3. JMP (Jump) ---
            if ((opcode & 0xFFC0) === 0x4EC0) {
                const mode = (opcode >> 3) & 7, reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    cpu.pc = cpu.resolveEA(mode, reg, 3);
                    return 8;
                };
                continue;
            }

            // --- 4. Bcc / BSR / BRA (Branches) ---
            if ((opcode & 0xF000) === 0x6000) {
                const cond = (opcode >> 8) & 0xF;
                let offset = opcode & 0xFF;

                opcodeTable[opcode] = () => {
                    let actualOffset = offset;
                    const basePc = cpu.pc; 

                    if (offset === 0) {
                        actualOffset = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16;
                        cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                    } else if (offset === 0xFF) {
                        actualOffset = ((cpu.bus.readWord(cpu.pc, cpu.pc) << 16) | cpu.bus.readWord(cpu.pc + 2, cpu.pc)) | 0;
                        cpu.pc = (cpu.pc + 4) & 0xFFFFFF;
                    } else {
                        actualOffset = (offset << 24) >> 24;
                    }

                    let branchTaken = false;
                    if (cond === 1) { 
                        cpu.pushLong(cpu.pc);
                        branchTaken = true;
                    } else {
                        branchTaken = cpu.resolveCondition(cond);
                    }

                    if (branchTaken) {
                        cpu.pc = (basePc + actualOffset) & 0xFFFFFF;
                        return cond === 1 ? 18 : 10;
                    }
                    return 8; 
                };
                continue;
            }

            // --- 5. DBcc (Decrement and Branch) ---
            if ((opcode & 0xF0F8) === 0x50C8) {
                const cond = (opcode >> 8) & 0xF, reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const offset = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16;
                    const basePc = cpu.pc;
                    cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                    
                    let conditionMet = false;
                    if (cond === 14) conditionMet = false; 
                    else if (cond === 15) conditionMet = true;  
                    else conditionMet = cpu.resolveCondition(cond);

                    if (!conditionMet) {
                        const count = (cpu.d[reg] - 1) & 0xFFFF;
                        cpu.d[reg] = (cpu.d[reg] & 0xFFFF0000) | count;
                        if (count !== 0xFFFF) {
                            cpu.pc = (basePc + offset) & 0xFFFFFF;
                            return 10;
                        }
                        return 14; 
                    }
                    return 12; 
                };
                continue;
            }

            // --- 6. Scc (Set According to Condition) ---
            if ((opcode & 0xF0C0) === 0x50C0) {
                const cond = (opcode >> 8) & 0xF, mode = (opcode >> 3) & 7, reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    let conditionMet = false;
                    if (cond === 0) conditionMet = true;       
                    else if (cond === 1) conditionMet = false; 
                    else conditionMet = cpu.resolveCondition(cond);

                    const result = conditionMet ? 0xFF : 0x00;
                    if (mode === 0) {
                        cpu.d[reg] = (cpu.d[reg] & 0xFFFFFF00) | result;
                        return conditionMet ? 6 : 4;
                    } else {
                        cpu.writeEA(cpu.resolveEA(mode, reg, 1), result, 1);
                        return 8;
                    }
                };
                continue;
            }
        }
    }
}