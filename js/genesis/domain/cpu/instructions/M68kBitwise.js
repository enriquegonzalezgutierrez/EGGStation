/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Bitwise Instruction Registry (BlastEm Aligned)
 * 
 * Implements the registration and execution logic for the entire M68K 
 * bitwise manipulation instruction family (BTST, BSET, BCLR, BCHG).
 * 
 * Aligned with hardware standards observed in BlastEm to resolve:
 * 1. Modulo 32 vs Modulo 8 Bit Selection: Restricts the active bit mask to 
 *    modulo 32 for register direct targets, and modulo 8 for memory targets.
 * 2. Strict Z-Flag Isolation: Updates only the Zero (Z) flag to the complement 
 *    of the tested bit, keeping Negative (N), Overflow (V), Carry (C), and 
 *    Extend (X) flags completely unaffected.
 * 3. Exact Immediate Offset Decoders: Decodes the static immediate bit offset 
 *    using sequential 16-bit word fetches from the program counter.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates direct single-bit testing 
 *   and bitwise modification logic cleanly into its own domain file.
 * - Open/Closed Principle (OCP): Dynamically populates the CPU's opcode dispatch 
 *   table on startup without modifying core CPU execution code.
 */

class M68kBitwise {
    /**
     * Registers all Bitwise opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        // Loop through all 65,536 possible 16-bit instructions to pre-compile the table
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // --- 1. Dynamic Bit Operations (bit number stored in Data Register) ---
            // Format: [0000][src_reg:3][1][opType:2][mode:3][dest_reg:3]
            // opType: 0 = BTST, 1 = BCHG, 2 = BCLR, 3 = BSET
            if ((opcode & 0xF100) === 0x0100) {
                const srcReg = (opcode >> 9) & 7;
                const opType = (opcode >> 6) & 3;
                const mode = (opcode >> 3) & 7;
                const destReg = opcode & 7;

                opcodeTable[opcode] = () => {
                    const bitNum = cpu.d[srcReg];
                    const isRegister = (mode === 0); // 0 = Data Register Direct
                    
                    // Hardware rule: 32-bit operations on registers, 8-bit on memory
                    const size = isRegister ? 3 : 1; 

                    const destEa = cpu.resolveEA(mode, destReg, size);
                    let val = cpu.readEA(destEa, size);
                    
                    // Explicitly mask data to align registers to 32-bit and memory to 8-bit
                    const maskLimit = isRegister ? 0xFFFFFFFF : 0xFF;
                    val &= maskLimit;
                    
                    // Register bit offset is modulo 32, Memory bit offset is modulo 8
                    const mask = 1 << (bitNum & (isRegister ? 31 : 7));

                    // Test bit: Z flag is set to the complement of the tested bit
                    cpu.fZ = (val & mask) === 0 ? 1 : 0;

                    // Note: CCR N, V, C, X flags are entirely UNAFFECTED by bitwise operations

                    if (opType === 1) { // BCHG (Bit Change - Toggle)
                        cpu.writeEA(destEa, (val ^ mask) & maskLimit, size);
                    } else if (opType === 2) { // BCLR (Bit Clear - Force 0)
                        cpu.writeEA(destEa, (val & ~mask) & maskLimit, size);
                    } else if (opType === 3) { // BSET (Bit Set - Force 1)
                        cpu.writeEA(destEa, (val | mask) & maskLimit, size);
                    }

                    // Timing cycles derived from BlastEm/Motorola standards
                    if (opType === 0) { // BTST
                        return isRegister ? 6 : 8;
                    } else { // BCHG, BCLR, BSET
                        return isRegister ? 8 : 12;
                    }
                };
                continue;
            }

            // --- 2. Static Bit Operations (Immediate bit number value) ---
            // Format: [0000][1000][00][opType:2][mode:3][dest_reg:3]
            // opType: 0 = BTST, 1 = BCHG, 2 = BCLR, 3 = BSET
            if ((opcode & 0xFF00) === 0x0800) {
                const opType = (opcode >> 6) & 3;
                const mode = (opcode >> 3) & 7;
                const destReg = opcode & 7;

                opcodeTable[opcode] = () => {
                    // Read immediate 16-bit extension word containing the static bit offset
                    const bitNumWord = cpu.bus.readWord(cpu.pc, cpu.pc) & 0xFFFF;
                    cpu.pc = (cpu.pc + 2) & 0xFFFFFF;

                    const bitNum = bitNumWord & 0xFF; // Only lowest byte is relevant
                    const isRegister = (mode === 0);
                    const size = isRegister ? 3 : 1;

                    const destEa = cpu.resolveEA(mode, destReg, size);
                    let val = cpu.readEA(destEa, size);

                    const maskLimit = isRegister ? 0xFFFFFFFF : 0xFF;
                    val &= maskLimit;

                    const mask = 1 << (bitNum & (isRegister ? 31 : 7));

                    // Test bit: Z flag is set to the complement of the tested bit
                    cpu.fZ = (val & mask) === 0 ? 1 : 0;

                    if (opType === 1) { // BCHG (Bit Change - Toggle)
                        cpu.writeEA(destEa, (val ^ mask) & maskLimit, size);
                    } else if (opType === 2) { // BCLR (Bit Clear - Force 0)
                        cpu.writeEA(destEa, (val & ~mask) & maskLimit, size);
                    } else if (opType === 3) { // BSET (Bit Set - Force 1)
                        cpu.writeEA(destEa, (val | mask) & maskLimit, size);
                    }

                    if (opType === 0) { // BTST
                        return isRegister ? 10 : 12;
                    } else { // BCHG, BCLR, BSET
                        return isRegister ? 12 : 16;
                    }
                };
                continue;
            }
        }
    }
}