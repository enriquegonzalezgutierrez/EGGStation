/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: M68K CPU Shift and Rotate Instruction Registry
 * 
 * Implements the registration and execution logic for the entire M68K 
 * shift and rotate instruction family (LSL, LSR, ASL, ASR, ROL, ROR, ROXL, ROXR).
 * Aligned with MDTracer reference standards to ensure proper cycle consumption,
 * iterative bit rotation, and correct CCR updates.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates register shift, sign extension, 
 *   bit rotation calculations, and X/C flag mechanics cleanly into its own domain file.
 * - Open/Closed Principle (OCP): Dynamically populates the CPU's opcode dispatch 
 *   table on startup without modifying core CPU execution code.
 */

class M68kShiftRotate {
    /**
     * Registers all Shift and Rotate opcodes onto the provided 16-bit instruction dispatch table.
     * @param {M68000} cpu - The CPU Orchestrator instance.
     * @param {Array<Function>} opcodeTable - Unified 65,536-size dispatch table.
     */
    static register(cpu, opcodeTable) {
        
        for (let opcode = 0; opcode < 65536; opcode++) {
            
            // Format check: [1110] indicates Shift/Rotate instructions
            if (((opcode >> 12) & 0xF) === 0xE) {
                const sizeRaw = (opcode >> 6) & 3;
                const opType = (opcode >> 3) & 3; // 0=AS, 1=LS, 2=ROX, 3=RO
                const dir = (opcode >> 8) & 1;    // 0=Right, 1=Left
                
                // --- 1. MEMORY SHIFTS ---
                // If size is 3, it's a memory shift (Always Word sized, always 1 bit shift)
                if (sizeRaw === 3) {
                    // Memory shifts have opType in bits 9-10 instead of 3-4
                    const memOpType = (opcode >> 9) & 3;
                    const mode = (opcode >> 3) & 7;
                    const reg = opcode & 7;

                    // Exclude invalid Effective Addresses (Direct Registers, Immediate, etc.)
                    if (mode === 0 || mode === 1 || mode === 7) continue;

                    opcodeTable[opcode] = () => {
                        const ea = cpu.resolveEA(mode, reg, 2);
                        let val = cpu.readEA(ea, 2) & 0xFFFF;
                        let lastBit = 0;
                        let overflow = 0;

                        if (dir === 1) { // LEFT
                            lastBit = (val >> 15) & 1;
                            const oldSign = lastBit;
                            
                            if (memOpType === 0) { // ASL
                                val = (val << 1) & 0xFFFF;
                                overflow = oldSign !== ((val >> 15) & 1) ? 1 : 0;
                            } else if (memOpType === 1) { // LSL
                                val = (val << 1) & 0xFFFF;
                            } else if (memOpType === 2) { // ROXL
                                const oldX = cpu.fX;
                                val = ((val << 1) | oldX) & 0xFFFF;
                            } else if (memOpType === 3) { // ROL
                                val = ((val << 1) | lastBit) & 0xFFFF;
                            }
                        } else { // RIGHT
                            lastBit = val & 1;
                            
                            if (memOpType === 0) { // ASR
                                const sign = val & 0x8000;
                                val = ((val >>> 1) | sign) & 0xFFFF; // Explicit logical right shift
                            } else if (memOpType === 1) { // LSR
                                val = (val >>> 1) & 0xFFFF; // Logical shift right (zero fill)
                            } else if (memOpType === 2) { // ROXR
                                const oldX = cpu.fX;
                                val = ((val >>> 1) | (oldX << 15)) & 0xFFFF;
                            } else if (memOpType === 3) { // ROR
                                val = ((val >>> 1) | (lastBit << 15)) & 0xFFFF;
                            }
                        }

                        cpu.writeEA(ea, val, 2);

                        // Update CCR Status Register Flags
                        cpu.fZ = val === 0 ? 1 : 0;
                        cpu.fN = (val & 0x8000) !== 0 ? 1 : 0;
                        cpu.fV = overflow;
                        cpu.fC = lastBit;
                        if (memOpType !== 3) cpu.fX = lastBit; // ROL/ROR do not update the X (Extend) flag

                        return 16; // Memory shifts consume 16 cycles
                    };
                    continue;
                }

                // --- 2. REGISTER SHIFTS ---
                // Format: [1110][count_reg:3][dir:1][size_raw:2][isReg:1][opType:2][reg_dx:3]
                const countReg = (opcode >> 9) & 7;
                const isReg = (opcode & 0x0020) !== 0;
                const regDx = opcode & 7;

                opcodeTable[opcode] = () => {
                    const size = sizeRaw === 0 ? 1 : (sizeRaw === 1 ? 2 : 3);
                    
                    // Shift count resolution
                    let shiftCount = 0;
                    if (isReg) {
                        shiftCount = cpu.d[countReg] & 63; // Modulo 64
                    } else {
                        shiftCount = countReg === 0 ? 8 : countReg; // Immediate 0 maps to 8
                    }
                    
                    const mask = size === 1 ? 0xFF : (size === 2 ? 0xFFFF : 0xFFFFFFFF);
                    const signBit = size === 1 ? 0x80 : (size === 2 ? 0x8000 : 0x80000000);
                    const msbShift = size === 1 ? 7 : (size === 2 ? 15 : 31);
                    
                    let val = cpu.d[regDx] & mask;
                    let lastBit = 0;
                    let overflow = 0;

                    if (shiftCount > 0) {
                        // Iterative shift guarantees 100% hardware accuracy for ASL overflow detection
                        for (let i = 0; i < shiftCount; i++) {
                            if (dir === 1) { // LEFT
                                lastBit = (val >>> msbShift) & 1;
                                const oldSign = lastBit;
                                
                                if (opType === 0) { // ASL
                                    val = (val << 1) & mask;
                                    if (oldSign !== ((val >>> msbShift) & 1)) overflow = 1;
                                } else if (opType === 1) { // LSL
                                    val = (val << 1) & mask;
                                } else if (opType === 2) { // ROXL
                                    const oldX = cpu.fX;
                                    cpu.fX = lastBit;
                                    val = ((val << 1) | oldX) & mask;
                                } else if (opType === 3) { // ROL
                                    val = ((val << 1) | lastBit) & mask;
                                }
                            } else { // RIGHT
                                lastBit = val & 1;
                                
                                if (opType === 0) { // ASR
                                    const sign = val & signBit;
                                    val = ((val >>> 1) | sign) & mask;
                                } else if (opType === 1) { // LSR
                                    val = (val >>> 1) & mask;
                                } else if (opType === 2) { // ROXR
                                    const oldX = cpu.fX;
                                    cpu.fX = lastBit;
                                    val = ((val >>> 1) | (oldX << msbShift)) & mask;
                                } else if (opType === 3) { // ROR
                                    val = ((val >>> 1) | (lastBit << msbShift)) & mask;
                                }
                            }
                        }

                        cpu.fC = lastBit;
                        if (opType !== 3) cpu.fX = lastBit; // ROL/ROR bypass X flag updates
                    } else {
                        // FIX: Aligned with Motorola 68000 ISA standards.
                        // If shift count is 0: C is cleared, X is unaffected.
                        // EXCEPTION: ROXL/ROXR copy X flag into C flag instead of clearing it.
                        cpu.fC = (opType === 2) ? cpu.fX : 0;
                    }

                    // Write back to register (strictly masked with unsigned 32-bit cast)
                    val = val >>> 0;
                    if (size === 1) cpu.d[regDx] = (cpu.d[regDx] & 0xFFFFFF00) | val;
                    else if (size === 2) cpu.d[regDx] = (cpu.d[regDx] & 0xFFFF0000) | val;
                    else cpu.d[regDx] = val;

                    // Update standard CCR flags
                    cpu.fZ = val === 0 ? 1 : 0;
                    cpu.fN = (val & signBit) !== 0 ? 1 : 0;
                    cpu.fV = overflow; // V is only potentially set by ASL. Others default to 0.

                    // Timing depends on shift count
                    const baseCycles = size === 3 ? 8 : 6;
                    return baseCycles + (shiftCount * 2);
                };
                continue;
            }
        }
    }
}