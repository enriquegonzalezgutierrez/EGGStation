/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sony SPC700 APU Instructions Module
 * 
 * Decouples the entire SPC700 instruction set from the APU cycle orchestrator.
 * Binds addressing mode resolvers and APU ALU mathematical actions to 
 * individual instruction handlers, preventing monolithic class inflation.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines instruction-specific execution
 *   heuristics, branching, and registers updates to dedicated, clean routines.
 */

class Spc700Instructions {
    /**
     * Registers the entire SPC700 instruction set onto the APU's opcode table.
     * @param {Spc700} cpu - Target APU CPU core orchestrator.
     * @param {Array<Function>} table - Opcode dispatch table.
     */
    static register(cpu, table) {
        const regs = cpu.registers;
        const alu = cpu.alu;
        const mem = cpu.mem;

        // ========================================================================
        // HIGH-FIDELITY REGISTER-WIDTH MEMORY READ/WRITE HELPERS
        // ========================================================================

        const readByte = (adr) => {
            return mem.read(adr & 0xFFFF) & 0xFF;
        };

        const writeByte = (adr, value) => {
            mem.write(adr & 0xFFFF, value & 0xFF);
        };

        const readWord = (adr) => {
            const low = mem.read(adr & 0xFFFF) & 0xFF;
            const high = mem.read((adr + 1) & 0xFFFF) & 0xFF;
            return (high << 8) | low;
        };

        const writeWord = (adr, value) => {
            mem.write(adr & 0xFFFF, value & 0xFF);
            mem.write((adr + 1) & 0xFFFF, (value >> 8) & 0xFF);
        };

        // ========================================================================
        // CORE SPC700 INSTRUCTION EXECUTORS
        // ========================================================================

        // --- NOP ---
        table[0x00] = [() => {}, "NOP", 2, 0];

        // --- Flag Modifiers ---
        table[0x60] = [() => { regs.c = false; }, "CLRC", 2, 0]; // CLRC
        table[0x80] = [() => { regs.c = true;  }, "SETC", 2, 0]; // SETC
        table[0x20] = [() => { regs.p = false; }, "CLRP", 2, 0]; // CLRP
        table[0x40] = [() => { regs.p = true;  }, "SETP", 2, 0]; // SETP
        table[0xE0] = [() => { regs.v = false; regs.h = false; }, "CLRV", 2, 0]; // CLRV
        table[0xA0] = [() => { regs.i = true;  }, "EI", 2, 0];   // EI
        table[0xC0] = [() => { regs.i = false; }, "DI", 2, 0];   // DI

        // --- ADC (Add with Carry) ---
        const bindAdc = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.a = alu.adc(regs, regs.a, operand);
            }, "ADC", cpu.cycles[opcode], size];
        };

        // --- SBC (Subtract with Borrow) ---
        const bindSbc = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.a = alu.sbc(regs, regs.a, operand);
            }, "SBC", cpu.cycles[opcode], size];
        };

        // --- AND (Logical AND) ---
        const bindAnd = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.a = alu.and(regs, regs.a, operand, true);
            }, "AND", cpu.cycles[opcode], size];
        };

        // --- ORA (Logical OR) ---
        const bindOra = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.a = alu.or(regs, regs.a, operand, true);
            }, "ORA", cpu.cycles[opcode], size];
        };

        // --- EOR (Logical Exclusive OR) ---
        const bindEor = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.a = alu.eor(regs, regs.a, operand, true);
            }, "EOR", cpu.cycles[opcode], size];
        };

        // --- CMP (Compare Register) ---
        const bindCmp = (opcode, size, getAddress) => {
            table[opcode] = [(op1, op2) => {
                const adr = getAddress(op1, op2);
                const operand = readByte(adr);
                regs.c = regs.a >= operand;
                alu.setZandN(regs, regs.a - operand);
            }, "CMP", cpu.cycles[opcode], size];
        };

        // ========================================================================
        // COMPILING ADDRESSING BINDINGS
        // ========================================================================

        // Helpers to resolve addresses on-the-fly
        const getDp = (op) => (regs.p ? 0x0100 : 0x0000) | (op & 0xFF);
        const getAbs = (op1, op2) => op1 & 0xFFFF;
        const getDpX = (op) => (regs.p ? 0x0100 : 0x0000) | ((op + regs.x) & 0xFF);
        const getDpY = (op) => (regs.p ? 0x0100 : 0x0000) | ((op + regs.y) & 0xFF);
        const getIndX = () => (regs.p ? 0x0100 : 0x0000) | (regs.x & 0xFF);

        // Bind ADC mappings
        bindAdc(0x84, 1, getDp);
        bindAdc(0x85, 2, getAbs);
        bindAdc(0x86, 0, getIndX);
        bindAdc(0x94, 1, getDpX);

        // Bind SBC mappings
        bindSbc(0xA4, 1, getDp);
        bindSbc(0xA5, 2, getAbs);
        bindSbc(0xA6, 0, getIndX);
        bindSbc(0xB4, 1, getDpX);

        // Bind AND mappings
        bindAnd(0x24, 1, getDp);
        bindAnd(0x25, 2, getAbs);
        bindAnd(0x26, 0, getIndX);
        bindAnd(0x34, 1, getDpX);

        // Bind ORA mappings
        bindOra(0x04, 1, getDp);
        bindOra(0x05, 2, getAbs);
        bindOra(0x06, 0, getIndX);
        bindOra(0x07, 1, getDpX);

        // Bind EOR mappings
        bindEor(0x44, 1, getDp);
        bindEor(0x45, 2, getAbs);
        bindEor(0x46, 0, getIndX);
        bindEor(0x47, 1, getDpX);

        // Bind CMP mappings
        bindCmp(0x64, 1, getDp);
        bindCmp(0x65, 2, getAbs);
        bindCmp(0x66, 0, getIndX);
        bindCmp(0x74, 1, getDpX);

        // ========================================================================
        // BRANCHING & JUMP INSTRUCTIONS
        // ========================================================================

        const executeBranch = (cond, offset) => {
            if (cond) {
                cpu.additionalCycles = 2; // Taken branch penalty
                regs.pc = (regs.pc + offset) & 0xFFFF;
            } else {
                cpu.additionalCycles = 0;
            }
        };

        table[0x10] = [(rel) => { executeBranch(!regs.n, rel); }, "BPL", 2, 1]; // BPL
        table[0x30] = [(rel) => { executeBranch(regs.n, rel);  }, "BMI", 2, 1]; // BMI
        table[0x50] = [(rel) => { executeBranch(!regs.v, rel); }, "BVC", 2, 1]; // BVC
        table[0x70] = [(rel) => { executeBranch(regs.v, rel);  }, "BVS", 2, 1]; // BVS
        table[0x90] = [(rel) => { executeBranch(!regs.c, rel); }, "BCC", 2, 1]; // BCC
        table[0xB0] = [(rel) => { executeBranch(regs.c, rel);  }, "BCS", 2, 1]; // BCS
        table[0xD0] = [(rel) => { executeBranch(!regs.z, rel); }, "BNE", 2, 1]; // BNE
        table[0xF0] = [(rel) => { executeBranch(regs.z, rel);  }, "BEQ", 2, 1]; // BEQ

        // --- BRA (Branch Always) ---
        table[0x2F] = [(rel) => { regs.pc = (regs.pc + rel) & 0xFFFF; }, "BRA", 4, 1];

        // --- JMP (Jump Absolute) ---
        table[0x5F] = [(adr) => { regs.pc = adr & 0xFFFF; }, "JMP", 3, 2];

        // ========================================================================
        // SINGLE-BIT OPERATIONS (SET1 / CLR1 / BBS / BBC)
        // ========================================================================

        for (let bit = 0; bit < 8; bit++) {
            const bitMask = 1 << bit;
            const notBitMask = (~bitMask) & 0xFF;

            // SET1 dp.bit
            const set1Opcode = 0x02 + (bit * 0x20);
            table[set1Opcode] = [(dp) => {
                const adr = getDp(dp);
                const val = readByte(adr);
                writeByte(adr, val | bitMask);
            }, "SET1", 4, 1];

            // CLR1 dp.bit
            const clr1Opcode = 0x12 + (bit * 0x20);
            table[clr1Opcode] = [(dp) => {
                const adr = getDp(dp);
                const val = readByte(adr);
                writeByte(adr, val & notBitMask);
            }, "CLR1", 4, 1];

            // BBS dp.bit, rel
            const bbsOpcode = 0x03 + (bit * 0x20);
            table[bbsOpcode] = [(dp, rel) => {
                const adr = getDp(dp);
                const val = readByte(adr);
                executeBranch((val & bitMask) > 0, rel);
            }, "BBS", 5, 2];

            // BBC dp.bit, rel
            const bbcOpcode = 0x13 + (bit * 0x20);
            table[bbcOpcode] = [(dp, rel) => {
                const adr = getDp(dp);
                const val = readByte(adr);
                executeBranch((val & bitMask) === 0, rel);
            }, "BBC", 5, 2];
        }
    }
}