/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 Program Flow Instruction Registry
 * 
 * This class encapsulates all Z80 CPU instructions that modify the Program Counter (PC),
 * controlling branching, loops, subroutine calls, software restarts, and interrupt returns.
 * The logic follows the Command Pattern, mapping branches onto the CPU registers (SRP).
 */

class Z80ProgramFlow {
    /**
     * Registers all Program Flow opcodes onto the provided CPU opcode maps.
     * @param {ZilogZ80} cpu - The CPU Orchestrator instance.
     * @param {Z80Registers} registers - The CPU Registers state object.
     * @param {Z80Alu} alu - The Arithmetic Logic Unit for flag/math processing.
     * @param {Object} registry - The categorized opcode mapping arrays.
     */
    static register(cpu, registers, alu, registry) {

        // ========================================================================
        // 1. STANDARD UNPREFIXED PROGRAM FLOW OPERATIONS
        // ========================================================================

        // --- Relative Jumps & Loops ---
        registry.standard[0x10] = [() => {  
            registers.b = (registers.b - 1) & 0xff;
            const jq = cpu.theMMU.readAddr(registers.pc + 1);
            cpu.incPc(2);
            if (registers.b !== 0) {
                cpu.jumpRel(jq); 
                cpu.additionalCycles = 5; // Extra T-state penalty when branching occurs
            } 
        }, "DJNZ %d", 8, 1, false];

        registry.standard[0x18] = [() => { const jq = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); cpu.jumpRel(jq); }, "JR %d", 12, 1, false];

        registry.standard[0x20] = [() => { 
            const jq = cpu.theMMU.readAddr(registers.pc + 1); 
            cpu.incPc(2); 
            if (!(registers.f & Z80Flags.FLAG_Z)) {
                cpu.additionalCycles = 5;
                cpu.jumpRel(jq); 
            }
        }, "JR NZ,%d", 7, 1, false];

        registry.standard[0x28] = [() => { 
            const jq = cpu.theMMU.readAddr(registers.pc + 1); 
            cpu.incPc(2); 
            if (registers.f & Z80Flags.FLAG_Z) {
                cpu.additionalCycles = 5;
                cpu.jumpRel(jq); 
            }
        }, "JR Z,%d", 7, 1, false];

        registry.standard[0x30] = [() => { 
            const jq = cpu.theMMU.readAddr(registers.pc + 1); 
            cpu.incPc(2); 
            if (!(registers.f & Z80Flags.FLAG_C)) {
                cpu.additionalCycles = 5;
                cpu.jumpRel(jq); 
            }
        }, "JR NC,%d", 7, 1, false];

        registry.standard[0x38] = [() => { 
            const jq = cpu.theMMU.readAddr(registers.pc + 1); 
            cpu.incPc(2); 
            if (registers.f & Z80Flags.FLAG_C) {
                cpu.additionalCycles = 5;
                cpu.jumpRel(jq); 
            }
        }, "JR C,%d", 7, 1, false];

        // --- Returns ---
        registry.standard[0xc0] = [() => {
            if (!(registers.f & Z80Flags.FLAG_Z)) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET NZ", 5, 0, false];

        registry.standard[0xc8] = [() => {
            if (registers.f & Z80Flags.FLAG_Z) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET Z", 5, 0, false];

        registry.standard[0xc9] = [() => {
            registers.pc = cpu.popWord();
        }, "RET", 10, 0, false];

        registry.standard[0xd0] = [() => {
            if (!(registers.f & Z80Flags.FLAG_C)) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET NC", 5, 0, false];

        registry.standard[0xd8] = [() => {
            if (registers.f & Z80Flags.FLAG_C) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET C", 5, 0, false];

        registry.standard[0xe0] = [() => {
            if (!(registers.f & Z80Flags.FLAG_PV)) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET PO", 5, 0, false];

        registry.standard[0xe8] = [() => {
            if (registers.f & Z80Flags.FLAG_PV) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET PE", 5, 0, false];

        registry.standard[0xf0] = [() => {
            if (!(registers.f & Z80Flags.FLAG_S)) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET P", 5, 0, false];

        registry.standard[0xf8] = [() => {
            if (registers.f & Z80Flags.FLAG_S) {
                registers.pc = cpu.popWord();
                cpu.additionalCycles = 6;
            } else {
                cpu.incPc(1);
            }
        }, "RET M", 5, 0, false];

        // --- Absolute Jumps ---
        registry.standard[0xc2] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (!(registers.f & Z80Flags.FLAG_Z)) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP NZ,%d", 10, 2, false];

        registry.standard[0xc3] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            registers.pc = (m2 << 8) | m1;
        }, "JP %d", 10, 2, false];

        registry.standard[0xca] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if ((registers.f & Z80Flags.FLAG_Z) !== 0) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP Z,%d", 10, 2, false];

        registry.standard[0xd2] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (!(registers.f & Z80Flags.FLAG_C)) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP NC,%d", 10, 2, false];

        registry.standard[0xda] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (registers.f & Z80Flags.FLAG_C) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP C,%d", 10, 2, false];

        registry.standard[0xe2] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (!(registers.f & Z80Flags.FLAG_PV)) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP PO,%d", 10, 2, false];

        registry.standard[0xea] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (registers.f & Z80Flags.FLAG_PV) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP PE,%d", 10, 2, false];

        registry.standard[0xf2] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if ((registers.f & Z80Flags.FLAG_S) === 0) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP P,%d", 10, 2, false];

        registry.standard[0xfa] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            if (registers.f & Z80Flags.FLAG_S) {
                registers.pc = (m2 << 8) | m1;
            } else {
                cpu.incPc(3);
            }
        }, "JP M,%d", 10, 2, false];

        // --- Indirect Jumps ---
        registry.standard[0xe9] = [() => {
            registers.pc = registers.hl;
        }, "JP (HL)", 4, 0, false];

        // --- Call Subroutines ---
        registry.standard[0xc4] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (!(registers.f & Z80Flags.FLAG_Z)) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL NZ,%d", 10, 2, false];

        registry.standard[0xcc] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (registers.f & Z80Flags.FLAG_Z) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL Z,%d", 10, 2, false];

        registry.standard[0xcd] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            cpu.pushWord(registers.pc + 3);
            registers.pc = newaddr;
        }, "CALL %d", 17, 2, false];

        registry.standard[0xd4] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (!(registers.f & Z80Flags.FLAG_C)) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL NC,%d", 10, 2, false];

        registry.standard[0xdc] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (registers.f & Z80Flags.FLAG_C) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);                
            }
        }, "CALL C,%d", 10, 2, false];

        registry.standard[0xe4] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (!(registers.f & Z80Flags.FLAG_PV)) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL PO,%d", 10, 2, false];

        registry.standard[0xec] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (registers.f & Z80Flags.FLAG_PV) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL PE,%d", 10, 2, false];

        registry.standard[0xf4] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (!(registers.f & Z80Flags.FLAG_S)) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL P,%d", 10, 2, false];

        registry.standard[0xfc] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const newaddr = m1 | (m2 << 8);
            if (registers.f & Z80Flags.FLAG_S) {
                cpu.pushWord(registers.pc + 3);
                registers.pc = newaddr;
                cpu.additionalCycles = 7;
            } else {
                cpu.incPc(3);
            }
        }, "CALL M,%d", 10, 2, false];

        // --- Software Restarts (RST) ---
        registry.standard[0xc7] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x00; }, "RST 00h", 11, 0, false];
        registry.standard[0xcf] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x08; }, "RST 8h", 11, 0, false];
        registry.standard[0xd7] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x10; }, "RST 10h", 11, 0, false];
        registry.standard[0xdf] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x18; }, "RST 18h", 11, 0, false];
        registry.standard[0xe7] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x20; }, "RST 20h", 11, 0, false];
        registry.standard[0xef] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x28; }, "RST 28h", 11, 0, false];
        registry.standard[0xf7] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x30; }, "RST 30h", 11, 0, false];
        registry.standard[0xff] = [() => { cpu.pushWord(registers.pc + 1); registers.pc = 0x38; }, "RST 38h", 11, 0, false];


        // ========================================================================
        // 2. EXTENDED ED-PREFIXED INTERRUPT RETURNS (RETI / RETN)
        // ========================================================================

        registry.extended[0x45] = [() => {
            registers.pc = cpu.popWord();
            registers.iff1 = registers.iff2;
        }, "RETN", 14, 0, false];

        registry.extended[0x4d] = [() => {
            registers.pc = cpu.popWord();
            registers.iff1 = registers.iff2;
        }, "RETI", 14, 0, false];


        // ========================================================================
        // 3. INDEXED DD-PREFIXED INDIRECT JUMPS (JP (IX))
        // ========================================================================

        registry.indexedIX[0xe9] = [() => {
            registers.pc = registers.ix;
        }, "JP (IX)", 8, 0, false];


        // ========================================================================
        // 4. INDEXED FD-PREFIXED INDIRECT JUMPS (JP (IY))
        // ========================================================================

        registry.indexedIY[0xe9] = [() => {
            registers.pc = registers.iy;
        }, "JP (IY)", 8, 0, false];

    }
}