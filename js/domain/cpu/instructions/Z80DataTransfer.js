/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 Data Transfer Instruction Registry
 * 
 * This class encapsulates all Z80 CPU instructions designed for moving and copying 
 * data (LD, PUSH, POP, EX, EXX). Refactored to accept a clean 'opcodeRegistry' object
 * instead of a long parameter list of arrays.
 */

class Z80DataTransfer {
    static register(cpu, registers, alu, registry) {

        // Helper for displacement address
        const getDisplacement = (indexValue) => {
            const d = cpu.theMMU.readAddr(cpu.registers.pc + 2);
            const incr = (d & 0x80) === 0x80 ? -0x80 + (d & 0x7F) : d;
            return (indexValue + incr) & 0xffff;
        };

        // ========================================================================
        // 1. STANDARD UNPREFIXED DATA TRANSFER OPERATIONS (8-Bit & 16-Bit LD)
        // ========================================================================

        // --- 16-Bit Load Group ---
        registry.standard[0x01] = [() => { 
            const m1 = cpu.theMMU.readAddr(registers.pc + 1); 
            const m2 = cpu.theMMU.readAddr(registers.pc + 2); 
            registers.b = m2; 
            registers.c = m1; 
            cpu.incPc(3); 
        }, "LD BC,%d", 10, 2, false];

        registry.standard[0x11] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            registers.d = m2;
            registers.e = m1;
            cpu.incPc(3); 
        }, "LD DE,%d", 10, 2, false];

        registry.standard[0x21] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            registers.h = m2;
            registers.l = m1;
            cpu.incPc(3); 
        }, "LD HL,%d", 10, 2, false];

        registry.standard[0x31] = [() => { 
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            registers.sp = (m2 << 8) | m1;
            cpu.incPc(3); 
        }, "LD SP,%d", 10, 2, false];

        registry.standard[0x22] = [() => {
            const m1 = cpu.theMMU.readAddr((registers.pc + 1) & 0xffff);
            const m2 = cpu.theMMU.readAddr((registers.pc + 2) & 0xffff);
            const addr = (m2 << 8) | m1;
            cpu.theMMU.writeAddr(addr, registers.l);
            cpu.theMMU.writeAddr(addr + 1, registers.h);
            cpu.incPc(3);
        }, "LD (%d),HL", 16, 2, false];

        registry.standard[0x2a] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            const addr = (m2 << 8) | m1;
            registers.hl = cpu.theMMU.readAddr16bit(addr);
            cpu.incPc(3); 
        }, "LD HL,(%d)", 16, 2, false];

        registry.standard[0xf9] = [() => {
            registers.sp = registers.hl;
            cpu.incPc(1); 
        }, "LD SP,HL", 6, 0, false];

        // --- Indirect 8-Bit Load Group ---
        registry.standard[0x02] = [() => { cpu.theMMU.writeAddr(registers.bc, registers.a); cpu.incPc(1); }, "LD (BC),A", 7, 0, false];
        registry.standard[0x0a] = [() => { registers.a = cpu.theMMU.readAddr(registers.bc); cpu.incPc(1); }, "LD A,(BC)", 7, 0, false];
        registry.standard[0x12] = [() => { cpu.theMMU.writeAddr(registers.de, registers.a); cpu.incPc(1); }, "LD (DE),A", 7, 0, false];
        registry.standard[0x1a] = [() => { registers.a = cpu.theMMU.readAddr(registers.de); cpu.incPc(1); }, "LD A,(DE)", 7, 0, false];
        
        registry.standard[0x32] = [() => { 
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            cpu.theMMU.writeAddr((m2 << 8) | m1, registers.a);
            cpu.incPc(3); 
        }, "LD (%d),A", 13, 2, false];

        registry.standard[0x3a] = [() => { 
            const m1 = cpu.theMMU.readAddr(registers.pc + 1);
            const m2 = cpu.theMMU.readAddr(registers.pc + 2);
            registers.a = cpu.theMMU.readAddr((m2 << 8) | m1);
            cpu.incPc(3); 
        }, "LD A,(%d)", 13, 2, false];

        // --- Immediate 8-Bit Load Group ---
        registry.standard[0x06] = [() => { registers.b = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD B,%d", 7, 1, false];
        registry.standard[0x0e] = [() => { registers.c = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD C,%d", 7, 1, false];
        registry.standard[0x16] = [() => { registers.d = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD D,%d", 7, 1, false];
        registry.standard[0x1e] = [() => { registers.e = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD E,%d", 7, 1, false];
        registry.standard[0x26] = [() => { registers.h = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD H,%d", 7, 1, false];
        registry.standard[0x2e] = [() => { registers.l = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD L,%d", 7, 1, false];
        registry.standard[0x36] = [() => { cpu.theMMU.writeAddr(registers.hl, cpu.theMMU.readAddr(registers.pc + 1)); cpu.incPc(2); }, "LD (HL),%d", 10, 1, false];
        registry.standard[0x3e] = [() => { registers.a = cpu.theMMU.readAddr(registers.pc + 1); cpu.incPc(2); }, "LD A,%d", 7, 1, false];

        // --- Register 8-Bit Load Group (LD r, r') ---
        registry.standard[0x40] = [() => { cpu.incPc(1); }, "LD B,B", 4, 0, false];
        registry.standard[0x41] = [() => { registers.b = registers.c; cpu.incPc(1); }, "LD B,C", 4, 0, false];
        registry.standard[0x42] = [() => { registers.b = registers.d; cpu.incPc(1); }, "LD B,D", 4, 0, false];
        registry.standard[0x43] = [() => { registers.b = registers.e; cpu.incPc(1); }, "LD B,E", 4, 0, false];
        registry.standard[0x44] = [() => { registers.b = registers.h; cpu.incPc(1); }, "LD B,H", 4, 0, false];
        registry.standard[0x45] = [() => { registers.b = registers.l; cpu.incPc(1); }, "LD B,L", 4, 0, false];
        registry.standard[0x46] = [() => { registers.b = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD B,(HL)", 7, 0, false];
        registry.standard[0x47] = [() => { registers.b = registers.a; cpu.incPc(1); }, "LD B,A", 4, 0, false];

        registry.standard[0x48] = [() => { registers.c = registers.b; cpu.incPc(1); }, "LD C,B", 4, 0, false];
        registry.standard[0x49] = [() => { cpu.incPc(1); }, "LD C,C", 4, 0, false];
        registry.standard[0x4a] = [() => { registers.c = registers.d; cpu.incPc(1); }, "LD C,D", 4, 0, false];
        registry.standard[0x4b] = [() => { registers.c = registers.e; cpu.incPc(1); }, "LD C,E", 4, 0, false];
        registry.standard[0x4c] = [() => { registers.c = registers.h; cpu.incPc(1); }, "LD C,H", 4, 0, false];
        registry.standard[0x4d] = [() => { registers.c = registers.l; cpu.incPc(1); }, "LD C,L", 4, 0, false];
        registry.standard[0x4e] = [() => { registers.c = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD C,(HL)", 7, 0, false];
        registry.standard[0x4f] = [() => { registers.c = registers.a; cpu.incPc(1); }, "LD C,A", 4, 0, false];

        registry.standard[0x50] = [() => { registers.d = registers.b; cpu.incPc(1); }, "LD D,B", 4, 0, false];
        registry.standard[0x51] = [() => { registers.d = registers.c; cpu.incPc(1); }, "LD D,C", 4, 0, false];
        registry.standard[0x52] = [() => { cpu.incPc(1); }, "LD D,D", 4, 0, false];
        registry.standard[0x53] = [() => { registers.d = registers.e; cpu.incPc(1); }, "LD D,E", 4, 0, false];
        registry.standard[0x54] = [() => { registers.d = registers.h; cpu.incPc(1); }, "LD D,H", 4, 0, false];
        registry.standard[0x55] = [() => { registers.d = registers.l; cpu.incPc(1); }, "LD D,L", 4, 0, false];
        registry.standard[0x56] = [() => { registers.d = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD D,(HL)", 7, 0, false];
        registry.standard[0x57] = [() => { registers.d = registers.a; cpu.incPc(1); }, "LD D,A", 4, 0, false];

        registry.standard[0x58] = [() => { registers.e = registers.b; cpu.incPc(1); }, "LD E,B", 4, 0, false];
        registry.standard[0x59] = [() => { registers.e = registers.c; cpu.incPc(1); }, "LD E,C", 4, 0, false];
        registry.standard[0x5a] = [() => { registers.e = registers.d; cpu.incPc(1); }, "LD E,D", 4, 0, false];
        registry.standard[0x5b] = [() => { cpu.incPc(1); }, "LD E,E", 4, 0, false];
        registry.standard[0x5c] = [() => { registers.e = registers.h; cpu.incPc(1); }, "LD E,H", 4, 0, false];
        registry.standard[0x5d] = [() => { registers.e = registers.l; cpu.incPc(1); }, "LD E,L", 4, 0, false];
        registry.standard[0x5e] = [() => { registers.e = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD E,(HL)", 7, 0, false];
        registry.standard[0x5f] = [() => { registers.e = registers.a; cpu.incPc(1); }, "LD E,A", 4, 0, false];

        registry.standard[0x60] = [() => { registers.h = registers.b; cpu.incPc(1); }, "LD H,B", 4, 0, false];
        registry.standard[0x61] = [() => { registers.h = registers.c; cpu.incPc(1); }, "LD H,C", 4, 0, false];
        registry.standard[0x62] = [() => { registers.h = registers.d; cpu.incPc(1); }, "LD H,D", 4, 0, false];
        registry.standard[0x63] = [() => { registers.h = registers.e; cpu.incPc(1); }, "LD H,E", 4, 0, false];
        registry.standard[0x64] = [() => { cpu.incPc(1); }, "LD H,H", 4, 0, false];
        registry.standard[0x65] = [() => { registers.h = registers.l; cpu.incPc(1); }, "LD H,L", 4, 0, false];
        registry.standard[0x66] = [() => { registers.h = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD H,(HL)", 7, 0, false];
        registry.standard[0x67] = [() => { registers.h = registers.a; cpu.incPc(1); }, "LD H,A", 4, 0, false];

        registry.standard[0x68] = [() => { registers.l = registers.b; cpu.incPc(1); }, "LD L,B", 4, 0, false];
        registry.standard[0x69] = [() => { registers.l = registers.c; cpu.incPc(1); }, "LD L,C", 4, 0, false];
        registry.standard[0x6a] = [() => { registers.l = registers.d; cpu.incPc(1); }, "LD L,D", 4, 0, false];
        registry.standard[0x6b] = [() => { registers.l = registers.e; cpu.incPc(1); }, "LD L,E", 4, 0, false];
        registry.standard[0x6c] = [() => { registers.l = registers.h; cpu.incPc(1); }, "LD L,H", 4, 0, false];
        registry.standard[0x6d] = [() => { cpu.incPc(1); }, "LD L,L", 4, 0, false];
        registry.standard[0x6e] = [() => { registers.l = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD L,(HL)", 7, 0, false];
        registry.standard[0x6f] = [() => { registers.l = registers.a; cpu.incPc(1); }, "LD L,A", 4, 0, false];

        registry.standard[0x70] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.b); cpu.incPc(1); }, "LD (HL),B", 7, 0, false];
        registry.standard[0x71] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.c); cpu.incPc(1); }, "LD (HL),C", 7, 0, false];
        registry.standard[0x72] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.d); cpu.incPc(1); }, "LD (HL),D", 7, 0, false];
        registry.standard[0x73] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.e); cpu.incPc(1); }, "LD (HL),E", 7, 0, false];
        registry.standard[0x74] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.h); cpu.incPc(1); }, "LD (HL),H", 7, 0, false];
        registry.standard[0x75] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.l); cpu.incPc(1); }, "LD (HL),L", 7, 0, false];
        registry.standard[0x77] = [() => { cpu.theMMU.writeAddr(registers.hl, registers.a); cpu.incPc(1); }, "LD (HL),A", 7, 0, false];

        registry.standard[0x78] = [() => { registers.a = registers.b; cpu.incPc(1); }, "LD A,B", 4, 0, false];
        registry.standard[0x79] = [() => { registers.a = registers.c; cpu.incPc(1); }, "LD A,C", 4, 0, false];
        registry.standard[0x7a] = [() => { registers.a = registers.d; cpu.incPc(1); }, "LD A,D", 4, 0, false];
        registry.standard[0x7b] = [() => { registers.a = registers.e; cpu.incPc(1); }, "LD A,E", 4, 0, false];
        registry.standard[0x7c] = [() => { registers.a = registers.h; cpu.incPc(1); }, "LD A,H", 4, 0, false];
        registry.standard[0x7d] = [() => { registers.a = registers.l; cpu.incPc(1); }, "LD A,L", 4, 0, false];
        registry.standard[0x7e] = [() => { registers.a = cpu.theMMU.readAddr(registers.hl); cpu.incPc(1); }, "LD A,(HL)", 7, 0, false];
        registry.standard[0x7f] = [() => { cpu.incPc(1); }, "LD A,A", 4, 0, false];

        // --- Stack PUSH / POP ---
        registry.standard[0xc1] = [() => { registers.bc = cpu.popWord(); cpu.incPc(1); },"POP BC", 10, 0, false];
        registry.standard[0xd1] = [() => { registers.de = cpu.popWord(); cpu.incPc(1); },"POP DE", 10, 0, false];
        registry.standard[0xe1] = [() => { registers.hl = cpu.popWord(); cpu.incPc(1); },"POP HL", 10, 0, false];
        registry.standard[0xf1] = [() => { registers.af = cpu.popWord(); cpu.incPc(1); },"POP AF", 10, 0, false];

        registry.standard[0xc5] = [() => { cpu.pushWord(registers.bc); cpu.incPc(1); },"PUSH BC", 11, 0, false];
        registry.standard[0xd5] = [() => { cpu.pushWord(registers.de); cpu.incPc(1); },"PUSH DE", 11, 0, false];
        registry.standard[0xe5] = [() => { cpu.pushWord(registers.hl); cpu.incPc(1); },"PUSH HL", 11, 0, false];
        registry.standard[0xf5] = [() => { cpu.pushWord(registers.af); cpu.incPc(1); },"PUSH AF", 11, 0, false];

        // --- Exchange Registers Group ---
        registry.standard[0x08] = [() => { registers.exchangeAF(); cpu.incPc(1); }, "XCHG AF,AF'", 4, 0, false];
        registry.standard[0xd9] = [() => { registers.exchangeBC_DE_HL(); cpu.incPc(1); }, "EXX", 4, 0, false];
        registry.standard[0xeb] = [() => { registers.exchangeDE_HL(); cpu.incPc(1); }, "XCHG DE,HL", 4, 0, false];
        
        registry.standard[0xe3] = [() => { 
            let tmp = cpu.theMMU.readAddr(registers.sp);
            cpu.theMMU.writeAddr(registers.sp, registers.l);
            registers.l = tmp;

            tmp = cpu.theMMU.readAddr(registers.sp + 1);
            cpu.theMMU.writeAddr(registers.sp + 1, registers.h);
            registers.h = tmp;

            cpu.incPc(1); 
        },"XCHG (SP),HL", 19, 0, false];


        // ========================================================================
        // 2. EXTENDED ED-PREFIXED DATA TRANSFER OPERATIONS (16-bit register load)
        // ========================================================================

        registry.extended[0x43] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            const addr = (m2 << 8) | m1;
            cpu.theMMU.writeAddr(addr, registers.c);
            cpu.theMMU.writeAddr(addr + 1, registers.b);
            cpu.incPc(4);
        }, "LD (%d),BC", 20, 2, false];

        registry.extended[0x4b] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            registers.bc = cpu.theMMU.readAddr16bit((m2 << 8) | m1);
            cpu.incPc(4);
        }, "LD BC,(%d)", 20, 2, false];

        registry.extended[0x53] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            const addr = (m2 << 8) | m1;
            cpu.theMMU.writeAddr(addr, registers.e);
            cpu.theMMU.writeAddr(addr + 1, registers.d);
            cpu.incPc(4);
        }, "LD (%d),DE", 20, 2, false];

        registry.extended[0x5b] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            registers.de = cpu.theMMU.readAddr16bit((m2 << 8) | m1);
            cpu.incPc(4);
        }, "LD DE,(%d)", 20, 2, false];

        registry.extended[0x73] = [() => {
            const m1 = cpu.theMMU.readAddr((registers.pc + 2) & 0xffff);
            const m2 = cpu.theMMU.readAddr((registers.pc + 3) & 0xffff);
            const addr = (m2 << 8) | m1;
            cpu.theMMU.writeAddr(addr, registers.sp & 0xff);
            cpu.theMMU.writeAddr(addr + 1, registers.sp >> 8);
            cpu.incPc(4);
        }, "LD (%d),SP", 20, 2, false];

        registry.extended[0x7b] = [() => {
            const m1 = cpu.theMMU.readAddr((registers.pc + 2) & 0xffff);
            const m2 = cpu.theMMU.readAddr((registers.pc + 3) & 0xffff);
            registers.sp = cpu.theMMU.readAddr16bit((m2 << 8) | m1);
            cpu.incPc(4);
        }, "LD SP,(%d)", 20, 2, false];

        // --- I / R Special Register Transfer ---
        registry.extended[0x47] = [() => { registers.i = registers.a; cpu.incPc(2); }, "LD I,A", 9, 0, false];
        registry.extended[0x4f] = [() => { registers.r = registers.a; cpu.incPc(2); }, "LD R,A", 9, 0, false];
        registry.extended[0x57] = [() => {
            registers.a = registers.i;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.a & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.a === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (registers.iff2) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "LD A,I", 9, 0, false];

        registry.extended[0x5f] = [() => {
            registers.r += 2;
            registers.r &= 0x7f;
            registers.a = registers.r;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.a & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.a === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (registers.iff2) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "LD A,R", 9, 2, false];


        // ========================================================================
        // 3. INDEXED DD-PREFIXED DATA TRANSFER OPERATIONS (IX Loads & Exchanges)
        // ========================================================================

        // --- 16-Bit IX Loads ---
        registry.indexedIX[0x21] = [() => {
            registers.ixl = cpu.theMMU.readAddr(registers.pc + 2);
            registers.ixh = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.incPc(4); 
        }, "LD IX,%d", 14, 2, false];

        registry.indexedIX[0x22] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.theMMU.writeAddr16bit(m1 | (m2 << 8), registers.ix);
            cpu.incPc(4); 
        }, "LD (%d),IX", 20, 2, false];

        registry.indexedIX[0x2a] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            registers.ix = cpu.theMMU.readAddr16bit(m1 | (m2 << 8));
            cpu.incPc(4); 
        }, "LD IX,(%d)", 20, 2, false];

        registry.indexedIX[0xf9] = [() => { registers.sp = registers.ix; cpu.incPc(2); }, "LD SP,IX", 10, 0, false];

        // --- 8-Bit Index Register Loads (IXH/IXL) ---
        registry.indexedIX[0x26] = [() => { registers.ixh = cpu.theMMU.readAddr(registers.pc + 2); cpu.incPc(3); }, "LD IXH,%d", 11, 1, true];
        registry.indexedIX[0x2e] = [() => { registers.ixl = cpu.theMMU.readAddr(registers.pc + 2); cpu.incPc(3); }, "LD IXL,%d", 11, 1, true];
        
        registry.indexedIX[0x44] = [() => { registers.b = registers.ixh; cpu.incPc(2); }, "LD B,IXH", 8, 0, true];
        registry.indexedIX[0x45] = [() => { registers.b = registers.ixl; cpu.incPc(2); }, "LD B,IXL", 8, 0, true];
        registry.indexedIX[0x54] = [() => { registers.d = registers.ixh; cpu.incPc(2); }, "LD D,IXH", 8, 0, true];
        registry.indexedIX[0x5d] = [() => { registers.e = registers.ixl; cpu.incPc(2); }, "LD E,IXL", 8, 0, true];
        
        registry.indexedIX[0x60] = [() => { registers.ixh = registers.b; cpu.incPc(2); }, "LD IXH,B", 8, 0, true];
        registry.indexedIX[0x62] = [() => { registers.ixh = registers.d; cpu.incPc(2); }, "LD IXH,D", 8, 0, true];
        registry.indexedIX[0x63] = [() => { registers.ixh = registers.e; cpu.incPc(2); }, "LD IXH,E", 8, 0, true];
        registry.indexedIX[0x67] = [() => { registers.ixh = registers.a; cpu.incPc(2); }, "LD IXH,A", 8, 0, true];
        registry.indexedIX[0x68] = [() => { registers.ixl = registers.b; cpu.incPc(2); }, "LD IXL,B", 8, 0, true];
        registry.indexedIX[0x69] = [() => { registers.ixl = registers.c; cpu.incPc(2); }, "LD IXL,C", 8, 0, true];
        registry.indexedIX[0x6b] = [() => { registers.ixl = registers.e; cpu.incPc(2); }, "LD IXL,E", 8, 0, true];
        registry.indexedIX[0x6c] = [() => { registers.ixl = registers.ixh; cpu.incPc(2); }, "LD IXL,IXH", 8, 0, true];
        registry.indexedIX[0x6f] = [() => { registers.ixl = registers.a; cpu.incPc(2); }, "LD IXL,A", 8, 0, true];

        registry.indexedIX[0x7c] = [() => { registers.a = registers.ixh; cpu.incPc(2); }, "LD A,IXH", 8, 0, true];
        registry.indexedIX[0x7d] = [() => { registers.a = registers.ixl; cpu.incPc(2); }, "LD A,IXL", 8, 0, true];

        // --- Indirect 8-Bit Index Loads (IX + d) ---
        registry.indexedIX[0x46] = [() => { registers.b = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD B,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x4e] = [() => { registers.c = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD C,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x56] = [() => { registers.d = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD D,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x5e] = [() => { registers.e = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD E,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x66] = [() => { registers.h = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD H,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x6e] = [() => { registers.l = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD L,(IX+%d)", 19, 1, false];
        registry.indexedIX[0x7e] = [() => { registers.a = cpu.theMMU.readAddr(getDisplacement(registers.ix)); cpu.incPc(3); }, "LD A,(IX+%d)", 19, 1, false];

        registry.indexedIX[0x70] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.b); cpu.incPc(3); }, "LD (IX+%d),B", 19, 1, false];
        registry.indexedIX[0x71] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.c); cpu.incPc(3); }, "LD (IX+%d),C", 19, 1, false];
        registry.indexedIX[0x72] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.d); cpu.incPc(3); }, "LD (IX+%d),D", 19, 1, false];
        registry.indexedIX[0x73] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.e); cpu.incPc(3); }, "LD (IX+%d),E", 19, 1, false];
        registry.indexedIX[0x74] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.h); cpu.incPc(3); }, "LD (IX+%d),H", 19, 1, false];
        registry.indexedIX[0x75] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.l); cpu.incPc(3); }, "LD (IX+%d),L", 19, 1, false];
        registry.indexedIX[0x77] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.ix), registers.a); cpu.incPc(3); }, "LD (IX+%d),A", 19, 1, false];
        registry.indexedIX[0x36] = [() => {
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.theMMU.writeAddr(getDisplacement(registers.ix), m2);
            cpu.incPc(4); 
        }, "LD (IX+%d),%d", 19, 1, false];

        // --- IX PUSH / POP ---
        registry.indexedIX[0xe1] = [() => { registers.ix = cpu.popWord(); cpu.incPc(2); },"POP IX", 14, 0, false];
        registry.indexedIX[0xe5] = [() => { cpu.pushWord(registers.ix); cpu.incPc(2); }, "PUSH IX", 15, 0, false];

        // --- IX Exchanges ---
        registry.indexedIX[0xe3] = [() => { 
            let tmp = cpu.theMMU.readAddr(registers.sp);
            cpu.theMMU.writeAddr(registers.sp, registers.ixl);
            registers.ixl = tmp;

            tmp = cpu.theMMU.readAddr((registers.sp + 1) & 0xffff);
            cpu.theMMU.writeAddr((registers.sp + 1) & 0xffff, registers.ixh);
            registers.ixh = tmp;

            cpu.incPc(2); 
        },"XCHG (SP),IX", 23, 0, false];


        // ========================================================================
        // 4. INDEXED FD-PREFIXED DATA TRANSFER OPERATIONS (IY Loads & Exchanges)
        // ========================================================================

        // --- 16-Bit IY Loads ---
        registry.indexedIY[0x21] = [() => {
            registers.iyl = cpu.theMMU.readAddr(registers.pc + 2);
            registers.iyh = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.incPc(4); 
        }, "LD IY,%d", 14, 2, false];

        registry.indexedIY[0x22] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.theMMU.writeAddr16bit(m1 | (m2 << 8), registers.iy);
            cpu.incPc(4); 
        }, "LD (%d),IY", 20, 2, false];

        registry.indexedIY[0x2a] = [() => {
            const m1 = cpu.theMMU.readAddr(registers.pc + 2);
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            registers.iy = cpu.theMMU.readAddr16bit(m1 | (m2 << 8));
            cpu.incPc(4); 
        }, "LD IY,(%d)", 20, 2, false];

        registry.indexedIY[0xf9] = [() => { registers.sp = registers.iy; cpu.incPc(2); }, "LD SP,IY", 10, 0, false];

        // --- 8-Bit Index Register Loads (IYH/IYL) ---
        registry.indexedIY[0x26] = [() => { registers.iyh = cpu.theMMU.readAddr(registers.pc + 2); cpu.incPc(3); }, "LD IYH,%d", 11, 1, true];
        registry.indexedIY[0x2e] = [() => { registers.iyl = cpu.theMMU.readAddr(registers.pc + 2); cpu.incPc(3); }, "LD IYL,%d", 11, 1, true];
        
        registry.indexedIY[0x44] = [() => { registers.b = registers.iyh; cpu.incPc(2); }, "LD B,IYH", 8, 0, true];
        registry.indexedIY[0x45] = [() => { registers.b = registers.iyl; cpu.incPc(2); }, "LD B,IYL", 8, 0, true];
        registry.indexedIY[0x4d] = [() => { registers.c = registers.iyl; cpu.incPc(2); }, "LD C,IYL", 8, 0, true];
        registry.indexedIY[0x54] = [() => { registers.d = registers.iyh; cpu.incPc(2); }, "LD D,IYH", 8, 0, true];
        registry.indexedIY[0x5d] = [() => { registers.e = registers.iyl; cpu.incPc(2); }, "LD E,IYL", 8, 0, true];
        
        registry.indexedIY[0x60] = [() => { registers.iyh = registers.b; cpu.incPc(2); }, "LD IYH,B", 8, 0, true];
        registry.indexedIY[0x62] = [() => { registers.iyh = registers.d; cpu.incPc(2); }, "LD IYH,D", 8, 0, true];
        registry.indexedIY[0x67] = [() => { registers.iyh = registers.a; cpu.incPc(2); }, "LD IYH,A", 8, 0, true];
        registry.indexedIY[0x68] = [() => { registers.iyl = registers.b; cpu.incPc(2); }, "LD IYL,B", 8, 0, true];
        registry.indexedIY[0x69] = [() => { registers.iyl = registers.c; cpu.incPc(2); }, "LD IYL,C", 8, 0, true];
        registry.indexedIY[0x6b] = [() => { registers.iyl = registers.e; cpu.incPc(2); }, "LD IYL,E", 8, 0, true];
        registry.indexedIY[0x6f] = [() => { registers.iyl = registers.a; cpu.incPc(2); }, "LD IYL,A", 8, 0, false];

        registry.indexedIY[0x7c] = [() => { registers.a = registers.iyh; cpu.incPc(2); }, "LD A,IYH", 8, 0, false];
        registry.indexedIY[0x7d] = [() => { registers.a = registers.iyl; cpu.incPc(2); }, "LD A,IYL", 8, 0, false];

        // --- Indirect 8-Bit Index Loads (IY + d) ---
        registry.indexedIY[0x46] = [() => { registers.b = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD B,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x4e] = [() => { registers.c = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD C,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x56] = [() => { registers.d = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD D,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x5e] = [() => { registers.e = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD E,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x66] = [() => { registers.h = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD H,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x6e] = [() => { registers.l = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD L,(IY+%d)", 19, 1, false];
        registry.indexedIY[0x7e] = [() => { registers.a = cpu.theMMU.readAddr(getDisplacement(registers.iy)); cpu.incPc(3); }, "LD A,(IY+%d)", 19, 1, false];

        registry.indexedIY[0x70] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.b); cpu.incPc(3); }, "LD (IY+%d),B", 19, 1, false];
        registry.indexedIY[0x71] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.c); cpu.incPc(3); }, "LD (IY+%d),C", 19, 1, false];
        registry.indexedIY[0x72] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.d); cpu.incPc(3); }, "LD (IY+%d),D", 19, 1, false];
        registry.indexedIY[0x73] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.e); cpu.incPc(3); }, "LD (IY+%d),E", 19, 1, false];
        registry.indexedIY[0x74] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.h); cpu.incPc(3); }, "LD (IY+%d),H", 19, 1, false];
        registry.indexedIY[0x75] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.l); cpu.incPc(3); }, "LD (IY+%d),L", 19, 1, false];
        registry.indexedIY[0x77] = [() => { cpu.theMMU.writeAddr(getDisplacement(registers.iy), registers.a); cpu.incPc(3); }, "LD (IY+%d),A", 19, 1, false];
        registry.indexedIY[0x36] = [() => {
            const m2 = cpu.theMMU.readAddr(registers.pc + 3);
            cpu.theMMU.writeAddr(getDisplacement(registers.iy), m2);
            cpu.incPc(4); 
        }, "LD (IY+%d),%d", 19, 1, false];

        // --- IY PUSH / POP ---
        registry.indexedIY[0xe1] = [() => { registers.iy = cpu.popWord(); cpu.incPc(2); },"POP IY", 14, 0, false];
        registry.indexedIY[0xe5] = [() => { cpu.pushWord(registers.iy); cpu.incPc(2); }, "PUSH IY", 15, 0, false];

        // --- IY Exchanges ---
        registry.indexedIY[0xe3] = [() => { 
            let tmp = cpu.theMMU.readAddr(registers.sp);
            cpu.theMMU.writeAddr(registers.sp, registers.iyl);
            registers.iyl = tmp;

            tmp = cpu.theMMU.readAddr((registers.sp + 1) & 0xffff);
            cpu.theMMU.writeAddr((registers.sp + 1) & 0xffff, registers.iyh);
            registers.iyh = tmp;

            cpu.incPc(2); 
        },"XCHG (SP),IY", 23, 0, false];

    }
}