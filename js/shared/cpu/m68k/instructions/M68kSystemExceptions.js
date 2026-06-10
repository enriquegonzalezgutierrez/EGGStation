/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/m68k/instructions/M68kSystemExceptions.js
 * 
 * Role:
 * Domain Layer: M68K CPU System Exceptions & Control Registry.
 * Implements hardware exceptions (ILLEGAL, TRAPV), system halts (STOP), 
 * and the privileged hardware RESET instruction.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    definition, registration, and execution of CPU system control and exceptions, 
 *    having successfully dispatched unrelated instructions (MOVEP, TAS, NBCD, CHK, and TRAP) 
 *    to their cohesive, correct modules (SRP Efficacy!).
 */

class M68kSystemExceptions {
    /**
     * Registers System Control and Exception opcodes onto the dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        // --- 1. ILLEGAL & TRAPV (Static Opcodes) ---
        opcodeTable[0x4AFC] = () => { 
            cpu.triggerException(4); // Vector 4: Illegal Instruction
            return 34; 
        }; 
        
        opcodeTable[0x4E76] = () => { 
            if (cpu.fV) { 
                cpu.triggerException(7); // Vector 7: TRAPV (Overflow)
                return 34; 
            } 
            return 4; 
        }; 

        // --- 2. RESET (Assert Peripheral Reset Line - Static Opcode) ---
        // Format: [0100][1110][0111][0000] -> 0x4E70
        opcodeTable[0x4E70] = () => {
            if ((cpu.sr & 0x2000) === 0) { // Privilege check (RESET is a privileged instruction)
                cpu.triggerException(8); // Vector 8: Privilege Violation Exception
                return 34;
            }
            // Aligned with authentic hardware: resets external co-processors and buses,
            // but does NOT reset the M68K registers or PC itself.
            if (cpu.bus) {
                cpu.bus.initialise(); 
            }
            return 132; // Standard RESET execution penalty cycles
        };

        // --- 3. STOP (Load SR and Stop - Static Opcode) ---
        // Format: [0100][1110][0111][0012] -> 0x4E72
        opcodeTable[0x4E72] = () => {
            if ((cpu.sr & 0x2000) === 0) { // Privilege check
                cpu.triggerException(8); // Vector 8: Privilege Violation Exception
                return 34;
            }
            const imm = cpu.bus.readWord(cpu.pc, cpu.pc);
            cpu.pc = (cpu.pc + 2) & 0xFFFFFF;
            cpu.syncStackPointers(imm);
            cpu.isHalted = true; // CPU freezes until an interrupt wakes it up
            return 4;
        };
    }
}