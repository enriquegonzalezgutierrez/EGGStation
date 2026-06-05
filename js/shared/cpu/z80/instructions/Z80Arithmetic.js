/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/instructions/Z80Arithmetic.js
 * 
 * Role:
 * Domain Layer: Z80 Arithmetic and Logical Instruction Registry.
 * This class encapsulates all Z80 CPU instructions designed for arithmetic and 
 * logical operations on 8-bit and 16-bit operands. It delegates heavy mathematical 
 * calculations and flag updates directly to the Z80Alu instance (SRP).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    registration and routing of the arithmetic/logical instruction subset. 
 *    Specific mathematical evaluations and flag equations are delegated to the Z80Alu.
 * 2. Interface Segregation Principle (ISP): Depends on a thin, unified opcode 
 *    mapping dictionary (registry) instead of relying on the complete, heavy 
 *    execution loop of the ZilogZ80 class.
 */

class Z80Arithmetic {
    /**
     * Registers all Arithmetic and Logical opcodes onto the provided CPU opcode maps.
     * @param {ZilogZ80} cpu - The CPU Orchestrator instance.
     * @param {Z80Registers} registers - The CPU Registers state object.
     * @param {Z80Alu} alu - The Arithmetic Logic Unit for flag/math processing.
     * @param {Object} registry - The categorized opcode mapping arrays.
     */
    static register(cpu, registers, alu, registry) {

        /**
         * Helper for displacement address computation used in index-relative 
         * addressing (e.g., ADD A,(IX+d)).
         * @param {number} indexValue - Base 16-bit index (IX or IY).
         * @returns {number} The absolute 16-bit memory offset.
         */
        const getDisplacement = (indexValue) => {
            const d = cpu.theMMU.readAddr(registers.pc + 2);
            const incr = (d & 0x80) === 0x80 ? -0x80 + (d & 0x7F) : d;
            return (indexValue + incr) & 0xffff;
        };

        // ========================================================================
        // 1. STANDARD UNPREFIXED ARITHMETIC / LOGICAL OPERATIONS
        // ========================================================================

        // --- 16-Bit Increment / Decrement ---
        registry.standard[0x03] = [() => { registers.bc = (registers.bc + 1) & 0xffff; cpu.incPc(1); }, "INC BC", 6, 0, false];
        registry.standard[0x0b] = [() => { registers.bc = (registers.bc - 1) & 0xffff; cpu.incPc(1); }, "DEC BC", 6, 0, false];
        registry.standard[0x13] = [() => { registers.de = (registers.de + 1) & 0xffff; cpu.incPc(1); }, "INC DE", 6, 0, false];
        registry.standard[0x1b] = [() => { registers.de = (registers.de - 1) & 0xffff; cpu.incPc(1); }, "DEC DE", 6, 0, false];
        registry.standard[0x23] = [() => { registers.hl = (registers.hl + 1) & 0xffff; cpu.incPc(1); }, "INC HL", 6, 0, false];
        registry.standard[0x2b] = [() => { registers.hl = (registers.hl - 1) & 0xffff; cpu.incPc(1); }, "DEC HL", 6, 0, false];
        registry.standard[0x33] = [() => { registers.sp = (registers.sp + 1) & 0xffff; cpu.incPc(1); }, "INC SP", 6, 0, false];
        registry.standard[0x3b] = [() => { registers.sp = (registers.sp - 1) & 0xffff; cpu.incPc(1); }, "DEC SP", 6, 0, false];

        // --- 16-Bit Addition ---
        registry.standard[0x09] = [() => { registers.hl = alu.add_16bit(registers, registers.hl, registers.bc); cpu.incPc(1); }, "ADD HL,BC", 11, 0, false];
        registry.standard[0x19] = [() => { registers.hl = alu.add_16bit(registers, registers.hl, registers.de); cpu.incPc(1); }, "ADD HL,DE", 11, 0, false];
        registry.standard[0x29] = [() => { registers.hl = alu.add_16bit(registers, registers.hl, registers.hl); cpu.incPc(1); }, "ADD HL,HL", 11, 0, false];
        registry.standard[0x39] = [() => { registers.hl = alu.add_16bit(registers, registers.hl, registers.sp); cpu.incPc(1); }, "ADD HL,SP", 11, 0, false];

        // --- 8-Bit Increment / Decrement ---
        registry.standard[0x04] = [() => { registers.b = alu.inc_8bit(registers, registers.b); cpu.incPc(1); }, "INC B", 4, 0, false];
        registry.standard[0x05] = [() => { registers.b = alu.dec_8bit(registers, registers.b); cpu.incPc(1); }, "DEC B", 4, 0, false];
        registry.standard[0x0c] = [() => { registers.c = alu.inc_8bit(registers, registers.c); cpu.incPc(1); }, "INC C", 4, 0, false];
        registry.standard[0x0d] = [() => { registers.c = alu.dec_8bit(registers, registers.c); cpu.incPc(1); }, "DEC C", 4, 0, false];
        registry.standard[0x14] = [() => { registers.d = alu.inc_8bit(registers, registers.d); cpu.incPc(1); }, "INC D", 4, 0, false];
        registry.standard[0x15] = [() => { registers.d = alu.dec_8bit(registers, registers.d); cpu.incPc(1); }, "DEC D", 4, 0, false];
        registry.standard[0x1c] = [() => { registers.e = alu.inc_8bit(registers, registers.e); cpu.incPc(1); }, "INC E", 4, 0, false];
        registry.standard[0x1d] = [() => { registers.e = alu.dec_8bit(registers, registers.e); cpu.incPc(1); }, "DEC E", 4, 0, false];
        registry.standard[0x24] = [() => { registers.h = alu.inc_8bit(registers, registers.h); cpu.incPc(1); }, "INC H", 4, 0, false];
        registry.standard[0x25] = [() => { registers.h = alu.dec_8bit(registers, registers.h); cpu.incPc(1); }, "DEC H", 4, 0, false];
        registry.standard[0x2c] = [() => { registers.l = alu.inc_8bit(registers, registers.l); cpu.incPc(1); }, "INC L", 4, 0, false];
        registry.standard[0x2d] = [() => { registers.l = alu.dec_8bit(registers, registers.l); cpu.incPc(1); }, "DEC L", 4, 0, false];
        registry.standard[0x3c] = [() => { registers.a = alu.inc_8bit(registers, registers.a); cpu.incPc(1); }, "INC A", 4, 0, false];
        registry.standard[0x3d] = [() => { registers.a = alu.dec_8bit(registers, registers.a); cpu.incPc(1); }, "DEC A", 4, 0, false];

        registry.standard[0x34] = [() => {
            const hl = registers.hl;
            let b = cpu.theMMU.readAddr(hl);
            b = alu.inc_8bit(registers, b);
            cpu.theMMU.writeAddr(hl, b);
            cpu.incPc(1);
        }, "INC (HL)", 11, 0, false];

        registry.standard[0x35] = [() => {
            const hl = registers.hl;
            let b = cpu.theMMU.readAddr(hl);
            b = alu.dec_8bit(registers, b);
            cpu.theMMU.writeAddr(hl, b);
            cpu.incPc(1);
        }, "DEC (HL)", 11, 0, false];

        // --- Decimal / Negation / Complement ---
        registry.standard[0x27] = [() => { registers.a = alu.daa_8bit(registers, registers.a); cpu.incPc(1); }, "DAA", 4, 0, false];
        registry.standard[0x2f] = [() => { registers.a = alu.cpl_8bit(registers, registers.a); cpu.incPc(1); }, "CPL", 4, 0, false];

        // --- Carry Flag Operations ---
        registry.standard[0x37] = [() => { 
            registers.f &= 0xc4; 
            registers.f |= Z80Flags.FLAG_C;
            cpu.incPc(1); 
        }, "SCF", 4, 0, false];

        registry.standard[0x3f] = [() => { 
            const oldC = registers.f & Z80Flags.FLAG_C;
            registers.f &= 0xc4;
            if (!oldC) {
                registers.f |= Z80Flags.FLAG_C;
            }
            if (oldC) {
                registers.f |= Z80Flags.FLAG_H;
            }
            cpu.incPc(1); 
        }, "CCF", 4, 0, false];

        // --- 8-Bit Addition / Subtraction with Registers ---
        registry.standard[0x80] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "ADD A,B", 4, 0, false];
        registry.standard[0x81] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "ADD A,C", 4, 0, false];
        registry.standard[0x82] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "ADD A,D", 4, 0, false];
        registry.standard[0x83] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "ADD A,E", 4, 0, false];
        registry.standard[0x84] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "ADD A,H", 4, 0, false];
        registry.standard[0x85] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "ADD A,L", 4, 0, false];
        registry.standard[0x86] = [() => { registers.a = alu.add_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "ADD A,(HL)", 7, 0, false];
        registry.standard[0x87] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "ADD A,A", 4, 0, false];

        registry.standard[0x88] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "ADC A,B", 4, 0, false];
        registry.standard[0x89] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "ADC A,C", 4, 0, false];
        registry.standard[0x8a] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "ADC A,D", 4, 0, false];
        registry.standard[0x8b] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "ADC A,E", 4, 0, false];
        registry.standard[0x8c] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "ADC A,H", 4, 0, false];
        registry.standard[0x8d] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "ADC A,L", 4, 0, false];
        registry.standard[0x8e] = [() => { registers.a = alu.adc_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "ADC A,(HL)", 7, 0, false];
        registry.standard[0x8f] = [() => { registers.a = alu.adc_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "ADC A,A", 4, 0, false];

        registry.standard[0x90] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "SUB B", 4, 0, false];
        registry.standard[0x91] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "SUB C", 4, 0, false];
        registry.standard[0x92] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "SUB D", 4, 0, false];
        registry.standard[0x93] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "SUB E", 4, 0, false];
        registry.standard[0x94] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "SUB H", 4, 0, false];
        registry.standard[0x95] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "SUB L", 4, 0, false];
        registry.standard[0x96] = [() => { registers.a = alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "SUB (HL)", 7, 0, false];
        registry.standard[0x97] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "SUB A", 4, 0, false];

        registry.standard[0x98] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "SBC A,B", 4, 0, false];
        registry.standard[0x99] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "SBC A,C", 4, 0, false];
        registry.standard[0x9a] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "SBC A,D", 4, 0, false];
        registry.standard[0x9b] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "SBC A,E", 4, 0, false];
        registry.standard[0x9c] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "SBC A,H", 4, 0, false];
        registry.standard[0x9d] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "SBC A,L", 4, 0, false];
        registry.standard[0x9e] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "SBC A,(HL)", 7, 0, false];
        registry.standard[0x9f] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "SBC A,A", 4, 0, false];

        // --- Logical Operations with Registers ---
        registry.standard[0xa0] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.b); cpu.incPc(1); },"AND B", 4, 0, false];
        registry.standard[0xa1] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.c); cpu.incPc(1); },"AND C", 4, 0, false];
        registry.standard[0xa2] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.d); cpu.incPc(1); },"AND D", 4, 0, false];
        registry.standard[0xa3] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.e); cpu.incPc(1); },"AND E", 4, 0, false];
        registry.standard[0xa4] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.h); cpu.incPc(1); },"AND H", 4, 0, false];
        registry.standard[0xa5] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.l); cpu.incPc(1); },"AND L", 4, 0, false];
        registry.standard[0xa6] = [() => { registers.a = alu.and_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); },"AND (HL)", 7, 0, false];
        registry.standard[0xa7] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.a); cpu.incPc(1); },"AND A", 4, 0, false];

        registry.standard[0xa8] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "XOR B", 4, 0, false];
        registry.standard[0xa9] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "XOR C", 4, 0, false];
        registry.standard[0xaa] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "XOR D", 4, 0, false];
        registry.standard[0xab] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "XOR E", 4, 0, false];
        registry.standard[0xac] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "XOR H", 4, 0, false];
        registry.standard[0xad] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "XOR L", 4, 0, false];
        registry.standard[0xae] = [() => { registers.a = alu.xor_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "XOR (HL)", 7, 0, false];
        registry.standard[0xaf] = [() => { registers.a = alu.xor_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "XOR A", 4, 0, false];

        registry.standard[0xb0] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "OR B", 4, 0, false];
        registry.standard[0xb1] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "OR C", 4, 0, false];
        registry.standard[0xb2] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "OR D", 4, 0, false];
        registry.standard[0xb3] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "OR E", 4, 0, false];
        registry.standard[0xb4] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "OR H", 4, 0, false];
        registry.standard[0xb5] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "OR L", 4, 0, false];
        registry.standard[0xb6] = [() => { registers.a = alu.or_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "OR (HL)", 7, 0, false];
        registry.standard[0xb7] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "OR A", 4, 0, false];

        // --- Comparisons ---
        registry.standard[0xb8] = [() => { alu.sub_8bit(registers, registers.a, registers.b); cpu.incPc(1); }, "CP B", 4, 0, false];
        registry.standard[0xb9] = [() => { alu.sub_8bit(registers, registers.a, registers.c); cpu.incPc(1); }, "CP C", 4, 0, false];
        registry.standard[0xba] = [() => { alu.sub_8bit(registers, registers.a, registers.d); cpu.incPc(1); }, "CP D", 4, 0, false];
        registry.standard[0xbb] = [() => { alu.sub_8bit(registers, registers.a, registers.e); cpu.incPc(1); }, "CP E", 4, 0, false];
        registry.standard[0xbc] = [() => { alu.sub_8bit(registers, registers.a, registers.h); cpu.incPc(1); }, "CP H", 4, 0, false];
        registry.standard[0xbd] = [() => { alu.sub_8bit(registers, registers.a, registers.l); cpu.incPc(1); }, "CP L", 4, 0, false];
        registry.standard[0xbe] = [() => { alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.hl)); cpu.incPc(1); }, "CP (HL)", 7, 0, false];
        registry.standard[0xbf] = [() => { alu.sub_8bit(registers, registers.a, registers.a); cpu.incPc(1); }, "CP A", 4, 0, false];

        // --- Immediate Arithmetic / Logical Group ---
        registry.standard[0xc6] = [() => { registers.a = alu.add_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "ADD A,%d", 7, 1, false];
        registry.standard[0xce] = [() => { registers.a = alu.adc_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "ADC A,%d", 7, 1, false];
        registry.standard[0xd6] = [() => { registers.a = alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "SUB %d", 7, 1, false];
        registry.standard[0xde] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "SBC A,%d", 7, 0, false];
        registry.standard[0xe6] = [() => { registers.a = alu.and_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); },"AND %d", 7, 1, false];
        registry.standard[0xee] = [() => { registers.a = alu.xor_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "XOR %d", 7, 1, false];
        registry.standard[0xf6] = [() => { registers.a = alu.or_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "OR %d", 7, 1, false];
        registry.standard[0xfe] = [() => { alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "CP %d", 7, 1, false];


        // ========================================================================
        // 2. EXTENDED ED-PREFIXED ARITHMETIC OPERATIONS
        // ========================================================================

        // --- 16-Bit Subtract with Carry ---
        registry.extended[0x42] = [() => { registers.hl = alu.sbc_16bit(registers, registers.hl, registers.bc); cpu.incPc(2); }, "SBC HL,BC", 15, 0, false];
        registry.extended[0x52] = [() => { registers.hl = alu.sbc_16bit(registers, registers.hl, registers.de); cpu.incPc(2); }, "SBC HL,DE", 15, 0, false];
        registry.extended[0x62] = [() => { registers.hl = alu.sbc_16bit(registers, registers.hl, registers.hl); cpu.incPc(2); }, "SBC HL,HL", 15, 0, false];

        // --- 16-Bit Add with Carry ---
        registry.extended[0x4a] = [() => { registers.hl = alu.adc_16bit(registers, registers.hl, registers.bc); cpu.incPc(2); }, "ADC HL,BC", 15, 0, false];
        registry.extended[0x5a] = [() => { registers.hl = alu.adc_16bit(registers, registers.hl, registers.de); cpu.incPc(2); }, "ADC HL,DE", 15, 0, false];
        registry.extended[0x6a] = [() => { registers.hl = alu.adc_16bit(registers, registers.hl, registers.hl); cpu.incPc(2); }, "ADC HL,HL", 15, 0, false];

        // --- Negation ---
        registry.extended[0x44] = [() => { registers.a = alu.sub_8bit(registers, 0, registers.a); cpu.incPc(2); }, "NEG", 8, 0, false];


        // ========================================================================
        // 3. INDEXED DD-PREFIXED ARITHMETIC OPERATIONS (IX Register math)
        // ========================================================================

        // --- IX Increment / Decrement ---
        registry.indexedIX[0x23] = [() => { registers.ix = (registers.ix + 1) & 0xffff; cpu.incPc(2); }, "INC IX", 10, 0, false];
        registry.indexedIX[0x2b] = [() => { registers.ix = (registers.ix - 1) & 0xffff; cpu.incPc(2); }, "DEC IX", 10, 0, false];
        registry.indexedIX[0x24] = [() => { registers.ixh = alu.inc_8bit(registers, registers.ixh); cpu.incPc(2); }, "INC IXH", 8, 0, true];
        registry.indexedIX[0x25] = [() => { registers.ixh = alu.dec_8bit(registers, registers.ixh); cpu.incPc(2); }, "DEC IXH", 8, 0, true];
        registry.indexedIX[0x2c] = [() => { registers.ixl = alu.inc_8bit(registers, registers.ixl); cpu.incPc(2); }, "INC IXL", 8, 0, true];
        registry.indexedIX[0x2d] = [() => { registers.ixl = alu.dec_8bit(registers, registers.ixl); cpu.incPc(2); }, "DEC IXL", 8, 0, true];

        registry.indexedIX[0x34] = [() => {
            const addr = getDisplacement(registers.ix);
            const mem = cpu.theMMU.readAddr(addr);
            cpu.theMMU.writeAddr(addr, alu.inc_8bit(registers, mem));
            cpu.incPc(3); 
        }, "INC (IX+%d)", 23, 1, false];

        registry.indexedIX[0x35] = [() => {
            const addr = getDisplacement(registers.ix);
            const mem = cpu.theMMU.readAddr(addr);
            cpu.theMMU.writeAddr(addr, alu.dec_8bit(registers, mem));
            cpu.incPc(3); 
        }, "DEC (IX+%d)", 23, 1, false];

        // --- 16-Bit IX Additions ---
        registry.indexedIX[0x09] = [() => { registers.ix = alu.add_16bit(registers, registers.ix, registers.bc); cpu.incPc(2); }, "ADD IX,BC", 15, 0, false];
        registry.indexedIX[0x19] = [() => { registers.ix = alu.add_16bit(registers, registers.ix, registers.de); cpu.incPc(2); }, "ADD IX,DE", 15, 0, false];
        registry.indexedIX[0x29] = [() => { registers.ix = alu.add_16bit(registers, registers.ix, registers.ix); cpu.incPc(2); }, "ADD IX,IX", 15, 0, false];
        registry.indexedIX[0x39] = [() => { registers.ix = alu.add_16bit(registers, registers.ix, registers.sp); cpu.incPc(2); }, "ADD IX,SP", 15, 0, false];

        // --- 8-Bit Index Add/Sub/Logical Operations (IXH / IXL) ---
        registry.indexedIX[0x84] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.ixh); cpu.incPc(2); }, "ADD A,IXH", 8, 0, false];
        registry.indexedIX[0x85] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.ixl); cpu.incPc(2); }, "ADD A,IXL", 8, 0, false];
        registry.indexedIX[0x94] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.ixh); cpu.incPc(2); }, "SUB IXH", 8, 0, false];
        registry.indexedIX[0xa5] = [() => { registers.a = alu.and_8bit(registers, registers.a, registers.ixl); cpu.incPc(2); },"AND IXL", 8, 0, false];
        registry.indexedIX[0xb5] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.ixl); cpu.incPc(2); }, "OR IXL", 8, 0, true];
        registry.indexedIX[0xbc] = [() => { alu.sub_8bit(registers, registers.a, registers.ixh); cpu.incPc(2); }, "CP IXH", 8, 0, true];
        registry.indexedIX[0xbd] = [() => { alu.sub_8bit(registers, registers.a, registers.ixl); cpu.incPc(2); }, "CP IXL", 8, 0, true];

        // --- 8-Bit Indirect IX-relative Operations (IX + d) ---
        registry.indexedIX[0x86] = [() => { registers.a = alu.add_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "ADD A,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x8e] = [() => { registers.a = alu.adc_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "ADC A,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x96] = [() => { registers.a = alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "SUB (IX+%d)", 19, 1, false];
        registry.indexedIX[0x9e] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "SBC A,(IX+%d)", 19, 1, false];
        registry.indexedIX[0xa6] = [() => { registers.a = alu.and_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); },"AND (IX+%d)", 19, 1, false];
        registry.indexedIX[0xae] = [() => { registers.a = alu.xor_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "XOR (IX+%d)", 19, 1, false];
        registry.indexedIX[0xb6] = [() => { registers.a = alu.or_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "OR (IX+%d)", 19, 1, false];
        registry.indexedIX[0xbe] = [() => { alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.ix))); cpu.incPc(3); }, "CP (IX+%d)", 19, 1, false];


        // ========================================================================
        // 4. INDEXED FD-PREFIXED ARITHMETIC OPERATIONS (IY Register math)
        // ========================================================================

        // --- IY Increment / Decrement ---
        registry.indexedIY[0x23] = [() => { registers.iy = (registers.iy + 1) & 0xffff; cpu.incPc(2); }, "INC IY", 10, 0, false];
        registry.indexedIY[0x2b] = [() => { registers.iy = (registers.iy - 1) & 0xffff; cpu.incPc(2); }, "DEC IY", 10, 0, false];
        registry.indexedIY[0x24] = [() => { registers.iyh = alu.inc_8bit(registers, registers.iyh); cpu.incPc(2); }, "INC IYH", 8, 0, true];
        registry.indexedIY[0x25] = [() => { registers.iyh = alu.dec_8bit(registers, registers.iyh); cpu.incPc(2); }, "DEC IYH", 8, 0, true];
        registry.indexedIY[0x2c] = [() => { registers.iyl = alu.inc_8bit(registers, registers.iyl); cpu.incPc(2); }, "INC IYL", 8, 0, true];
        registry.indexedIY[0x2d] = [() => { registers.iyl = alu.dec_8bit(registers, registers.iyl); cpu.incPc(2); }, "DEC IYL", 8, 0, true];

        registry.indexedIY[0x34] = [() => {
            const addr = getDisplacement(registers.iy);
            let val = cpu.theMMU.readAddr(addr);
            val = alu.inc_8bit(registers, val);
            cpu.theMMU.writeAddr(addr, val);
            cpu.incPc(3); 
        }, "INC (IY+%d)", 23, 0, false];

        registry.indexedIY[0x35] = [() => {
            const addr = getDisplacement(registers.iy);
            const mem = cpu.theMMU.readAddr(addr);
            cpu.theMMU.writeAddr(addr, alu.dec_8bit(registers, mem));
            cpu.incPc(3); 
        }, "DEC (IY+%d)", 23, 1, false];

        // --- 16-Bit IY Additions ---
        registry.indexedIY[0x09] = [() => { registers.iy = alu.add_16bit(registers, registers.iy, registers.bc); cpu.incPc(2); }, "ADD IY,BC", 15, 0, false];
        registry.indexedIY[0x19] = [() => { registers.iy = alu.add_16bit(registers, registers.iy, registers.de); cpu.incPc(2); }, "ADD IY,DE", 15, 0, false];
        registry.indexedIY[0x29] = [() => { registers.iy = alu.add_16bit(registers, registers.iy, registers.iy); cpu.incPc(2); }, "ADD IY,IY", 15, 0, false];
        registry.indexedIY[0x39] = [() => { registers.iy = alu.add_16bit(registers, registers.iy, registers.sp); cpu.incPc(2); }, "ADD IY,SP", 15, 0, false];

        // --- 8-Bit Index Add/Sub/Logical Operations (IYH / IYL) ---
        registry.indexedIY[0x84] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.iyh); cpu.incPc(2); }, "ADD A,IYH", 8, 0, true];
        registry.indexedIY[0x85] = [() => { registers.a = alu.add_8bit(registers, registers.a, registers.iyl); cpu.incPc(2); }, "ADD A,IYL", 8, 0, true];
        registry.indexedIY[0x94] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.iyh); cpu.incPc(2); }, "SUB IYH", 8, 0, true];
        registry.indexedIY[0x95] = [() => { registers.a = alu.sub_8bit(registers, registers.a, registers.iyl); cpu.incPc(2); }, "SUB IYL", 8, 0, true];
        registry.indexedIY[0xb4] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.iyh); cpu.incPc(2); }, "OR IYH", 8, 0, true];
        registry.indexedIY[0xb5] = [() => { registers.a = alu.or_8bit(registers, registers.a, registers.iyl); cpu.incPc(2); }, "OR IYL", 8, 0, true];
        registry.indexedIY[0xbc] = [() => { alu.sub_8bit(registers, registers.a, registers.iyh); cpu.incPc(2); }, "CP IYH", 8, 0, false];

        // --- 8-Bit Indirect IY-relative Operations (IY + d) ---
        registry.indexedIY[0x86] = [() => { registers.a = alu.add_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "ADD A,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x8e] = [() => { registers.a = alu.adc_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "ADC A,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x96] = [() => { registers.a = alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "SUB (IY+%d)", 19, 1, false];
        registry.indexedIY[0x9e] = [() => { registers.a = alu.sbc_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "SBC A,(IY+%d)", 19, 1, false];
        registry.indexedIY[0xa6] = [() => { registers.a = alu.and_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); },"AND (IY+%d)", 19, 1, false];
        registry.indexedIY[0xae] = [() => { registers.a = alu.xor_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "XOR (IY+%d)", 19, 1, false];
        registry.indexedIY[0xb6] = [() => { registers.a = alu.or_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "OR (IY+%d)", 19, 1, false];
        registry.indexedIY[0xbe] = [() => { alu.sub_8bit(registers, registers.a, cpu.theMMU.readAddr(getDisplacement(registers.iy))); cpu.incPc(3); }, "CP (IY+%d)", 19, 1, false];

    }
}