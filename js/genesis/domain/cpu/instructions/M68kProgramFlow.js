/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Program Flow Instruction Registry (BlastEm Aligned)
 * 
 * Implements the registration and execution logic for the M68K program flow 
 * control instruction family (JMP, JSR, BSR, RTS, RTE, RTR, Bcc, DBcc, Scc).
 * 
 * Aligned with hardware standards observed in BlastEm to resolve:
 * 1. Cycle-Accurate DBcc Loop Expiry: Evaluates first the conditional status. 
 *    If false, decrements exclusively the lower 16-bit word of Dn, performing 
 *    the PC displacement branch only if the decremented word is NOT equal to -1 (0xFFFF).
 * 2. Privilege Violation Checks on RTE: Restricts RTE execution strictly to 
 *    Supervisor mode (triggering Vector 8 exception otherwise), while allowing 
 *    RTR (which only updates Condition Codes) to execute in User mode.
 * 3. 24-Bit Program Counter Safety Masks: Enforces 24-bit physical address masking 
 *    on all stack pops, JMP destinations, and Bcc branch offsets.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates strictly CPU execution flow and 
 *   branching calculations into a dedicated instruction domain file.
 * - Open/Closed Principle (OCP): Dynamically extends the M68000 global dispatch 
 *   table at bootstrap without modifying core CPU execution engines.
 */

class M68kProgramFlow {
    /**
     * Registers all Program Flow opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        // --- 1. Static Flow Opcodes ---
        opcodeTable[0x4E75] = () => { // RTS: Return from Subroutine
            cpu.pc = cpu.popLong() & 0xFFFFFF; 
            return 16; 
        };

        opcodeTable[0x4E71] = () => { // NOP: No Operation
            return 4; 
        };

        opcodeTable[0x4E73] = () => { // RTE: Return from Exception (Privileged)
            if ((cpu.sr & 0x2000) === 0) { 
                cpu.triggerException(8); // Privilege Violation Exception
                return 34; 
            }
            const srVal = cpu.bus.readWord(cpu.a[7], cpu.pc) & 0xFFFF;
            cpu.a[7] = (cpu.a[7] + 2) & 0xFFFFFF;
            cpu.pc = cpu.popLong() & 0xFFFFFF;
            cpu.syncStackPointers(srVal);
            return 24;
        };

        opcodeTable[0x4E77] = () => { // RTR: Return and Restore Codes (Allowed in User Mode)
            const ccrVal = cpu.bus.readWord(cpu.a[7], cpu.pc) & 0xFF;
            cpu.a[7] = (cpu.a[7] + 2) & 0xFFFFFF;
            cpu.pc = cpu.popLong() & 0xFFFFFF;
            cpu.setCCR(ccrVal);
            return 20;
        };

        // Pre-compile the sparse instruction dispatch table for dynamic flow commands
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 2. JSR (Jump to Subroutine) ---
            // Format: [0100][1110][10][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x4E80) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const ea = cpu.resolveEA(mode, reg, 3);
                    cpu.pushLong(cpu.pc); // Return address points to next linear instruction
                    cpu.pc = ea;
                    return 16;
                };
                continue;
            }

            // --- 3. JMP (Jump) ---
            // Format: [0100][1110][11][mode:3][reg:3]
            if ((opcode & 0xFFC0) === 0x4EC0) {
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    cpu.pc = cpu.resolveEA(mode, reg, 3);
                    return 8;
                };
                continue;
            }

            // --- 4. Bcc / BSR / BRA (Conditional and Unconditional Branches) ---
            // Format: [0110][cond:4][offset:8]
            if ((opcode & 0xF000) === 0x6000) {
                const cond = (opcode >> 8) & 0xF;
                let offset = opcode & 0xFF;

                opcodeTable[opcode] = () => {
                    let actualOffset = offset;
                    const basePc = cpu.pc; 

                    // Word-sized (16-bit) and Long-sized (32-bit) displacement decoding
                    if (offset === 0) {
                        actualOffset = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16; // Sign-extend
                        cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                    } else if (offset === 0xFF) {
                        actualOffset = ((cpu.bus.readWord(cpu.pc, cpu.pc) << 16) | cpu.bus.readWord(cpu.pc + 2, cpu.pc)) | 0;
                        cpu.pc = (cpu.pc + 4) & 0xFFFFFF;
                    } else {
                        actualOffset = (offset << 24) >> 24; // Sign-extend 8-bit offset
                    }

                    let branchTaken = false;
                    if (cond === 1) { // BSR: Branch to Subroutine
                        cpu.pushLong(cpu.pc);
                        branchTaken = true;
                    } else {
                        branchTaken = cpu.resolveCondition(cond);
                    }

                    if (branchTaken) {
                        cpu.pc = (basePc + actualOffset) & 0xFFFFFF;
                        return cond === 1 ? 18 : 10;
                    }
                    return 8; // Cycles consumed if branch is not taken
                };
                continue;
            }

            // --- 5. DBcc (Decrement and Branch) ---
            // Format: [0101][cond:4][11001][reg:3]
            if ((opcode & 0xF0F8) === 0x50C8) {
                const cond = (opcode >> 8) & 0xF;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    const offset = (cpu.bus.readWord(cpu.pc, cpu.pc) << 16) >> 16; // Sign-extended displacement
                    const basePc = cpu.pc;
                    cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
                    
                    let conditionMet = false;
                    if (cond === 0) {
                        conditionMet = true;       // DBT: Decrement and Branch True (exits loop immediately)
                    } else if (cond === 1) {
                        conditionMet = false;      // DBF / DBRA: Decrement and Branch False / Always
                    } else {
                        conditionMet = cpu.resolveCondition(cond);
                    }

                    if (!conditionMet) {
                        const count = (cpu.d[reg] - 1) & 0xFFFF;
                        cpu.d[reg] = (cpu.d[reg] & 0xFFFF0000) | count;
                        if (count !== 0xFFFF) { // If result is not -1 (0xFFFF), branch is taken (loop continues)
                            cpu.pc = (basePc + offset) & 0xFFFFFF; // Loop back
                            return 10;
                        }
                        return 14; // Loop counter expired (decremented past 0 to -1)
                    }
                    return 12; // Condition met, loop terminated early
                };
                continue;
            }

            // --- 6. Scc (Set According to Condition) ---
            // Format: [0101][cond:4][11][mode:3][reg:3]
            if ((opcode & 0xF0C0) === 0x50C0) {
                const cond = (opcode >> 8) & 0xF;
                const mode = (opcode >> 3) & 7;
                const reg = opcode & 7;
                opcodeTable[opcode] = () => {
                    let conditionMet = false;
                    if (cond === 0) {
                        conditionMet = true;       // ST: Set True (Always 0xFF)
                    } else if (cond === 1) {
                        conditionMet = false;      // SF: Set False (Always 0x00)
                    } else {
                        conditionMet = cpu.resolveCondition(cond);
                    }

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