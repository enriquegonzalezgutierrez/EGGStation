/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 System and I/O Instruction Registry
 * 
 * This class encapsulates all Z80 CPU instructions designed for hardware input/output 
 * port operations and processor state control (IN, OUT, INI, INIR, OUTI, OTIR, OUTD, 
 * OTDR, NOP, HALT, DI, EI, IM). Refactored to accept a clean 'opcodeRegistry' object.
 */

class Z80SystemIO {
    static register(cpu, registers, alu, registry) {

        // ========================================================================
        // 1. STANDARD UNPREFIXED SYSTEM & I/O OPERATIONS
        // ========================================================================

        // --- System Control ---
        registry.standard[0x00] = [() => { cpu.incPc(1); }, "NOP", 4, 0, false];
        
        registry.standard[0x76] = [() => { 
            cpu.isHalted = true; 
        }, "HALT", 4, 0, false];

        registry.standard[0xf3] = [() => { 
            registers.iff1 = 0; 
            registers.iff2 = 0; 
            cpu.maskableInterruptsEnabled = false; 
            cpu.incPc(1); 
        },"DI", 4, 0, false];

        registry.standard[0xfb] = [() => { 
            cpu.m_bAfterEI = true; 
            registers.iff1 = 1; 
            registers.iff2 = 1; 
            cpu.maskableInterruptsEnabled = true; 
            cpu.incPc(1); 
        }, "EI", 4, 0, false];

        // --- Simple Port I/O ---
        registry.standard[0xd3] = [() => { 
            const port = cpu.theMMU.readAddr(registers.pc + 1); 
            cpu.theMMU.writePort(port, registers.a); 
            cpu.incPc(2); 
        }, "OUT (%d),A", 11, 1, false];

        registry.standard[0xdb] = [() => { 
            const port = cpu.theMMU.readAddr(registers.pc + 1); 
            registers.a = cpu.theMMU.readPort(port); 
            cpu.incPc(2); 
        }, "IN A,(%d)", 11, 1, false];


        // ========================================================================
        // 2. EXTENDED ED-PREFIXED SYSTEM & I/O OPERATIONS
        // ========================================================================

        // --- Extended Port Inputs ---
        registry.extended[0x40] = [() => {
            registers.b = cpu.theMMU.readPort(registers.c);
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.b & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.b === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.b]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN B,(C)", 12, 0, false];

        registry.extended[0x48] = [() => {
            registers.c = cpu.theMMU.readPort(registers.c);
            if (!(registers.f & z80flags.FLAG_C)) registers.f = 0x00;
            else registers.f |= z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.c & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.c === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.c]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN C,(C)", 12, 0, false];

        registry.extended[0x50] = [() => {
            registers.d = cpu.theMMU.readPort(registers.c);
            if (!(registers.f & z80flags.FLAG_C)) registers.f = 0x00;
            else registers.f |= z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.d & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.d === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.d]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN D,(C)", 12, 0, false];

        registry.extended[0x58] = [() => {
            registers.e = cpu.theMMU.readPort(registers.c);
            if (!(registers.f & z80flags.FLAG_C)) registers.f = 0x00;
            else registers.f |= z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.e & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.e === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.e]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN E,(C)", 12, 0, false];

        registry.extended[0x60] = [() => {
            registers.h = cpu.theMMU.readPort(registers.c);
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.h & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.h === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.h]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN H,(C)", 12, 0, false];

        registry.extended[0x68] = [() => {
            registers.l = cpu.theMMU.readPort(registers.c);
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.l & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.l === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.l]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN L,(C)", 12, 0, false];

        registry.extended[0x70] = [() => {
            const byte = cpu.theMMU.readPort(registers.c);
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((byte & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (byte === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[byte]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN (C)", 12, 0, true];

        registry.extended[0x78] = [() => {
            registers.a = cpu.theMMU.readPort(registers.c);
            if (!(registers.f & z80flags.FLAG_C)) registers.f = 0x00;
            else registers.f |= z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_N;
            registers.f &= ~z80flags.FLAG_H;
            if ((registers.a & 0x80) !== 0) registers.f |= z80flags.FLAG_S;
            else registers.f &= ~z80flags.FLAG_S;
            if (registers.a === 0) registers.f |= z80flags.FLAG_Z;
            else registers.f &= ~z80flags.FLAG_Z;
            if (alu.parityLookUp[registers.a]) registers.f |= z80flags.FLAG_PV;
            else registers.f &= ~z80flags.FLAG_PV;
            cpu.incPc(2);
        }, "IN A,(C)", 12, 0, true];

        // --- Extended Port Outputs ---
        registry.extended[0x41] = [() => { cpu.theMMU.writePort(registers.c, registers.b); cpu.incPc(2); }, "OUT (C),B", 12, 0, false];
        registry.extended[0x51] = [() => { cpu.theMMU.writePort(registers.c, registers.d); cpu.incPc(2); }, "OUT (C),D", 12, 0, false];
        registry.extended[0x59] = [() => { cpu.theMMU.writePort(registers.c, registers.e); cpu.incPc(2); }, "OUT (C),E", 12, 0, false];
        registry.extended[0x61] = [() => { cpu.theMMU.writePort(registers.c, registers.h); cpu.incPc(2); }, "OUT (C),H", 12, 0, false];
        registry.extended[0x69] = [() => { cpu.theMMU.writePort(registers.c, registers.l); cpu.incPc(2); }, "OUT (C),L", 12, 0, false];
        registry.extended[0x71] = [() => { cpu.theMMU.writePort(registers.c, 0); cpu.incPc(2); }, "OUT (C),0", 12, 0, true];
        registry.extended[0x79] = [() => { cpu.theMMU.writePort(registers.c, registers.a); cpu.incPc(2); }, "OUT (C),A", 12, 0, true];

        // --- Interrupt Mode ---
        registry.extended[0x56] = [() => { cpu.interruptMode = 1; cpu.incPc(2); }, "IM 1", 8, 0, false];

        // --- Block Port I/O Operations ---
        registry.extended[0xa2] = [() => { Z80SystemIO.executeIni(cpu, registers, alu); }, "INI", 16, 0, false];
        registry.extended[0xa3] = [() => { Z80SystemIO.executeOuti(cpu, registers, alu); }, "OUTI", 16, 0, false];
        registry.extended[0xab] = [() => { Z80SystemIO.executeOutDecrement(cpu, registers, alu); }, "OUTD", 16, 0, false];
        
        registry.extended[0xb2] = [() => { Z80SystemIO.executeInir(cpu, registers, alu); }, "INIR", 16, 0, false];
        registry.extended[0xb3] = [() => { Z80SystemIO.executeOutIncrementRepeat(cpu, registers, alu); }, "OTIR", 16, 0, false];
        registry.extended[0xbb] = [() => { Z80SystemIO.executeOutd(cpu, registers, alu); }, "OTDR", 16, 0, false];
    }

    // ------------------------------------------------------------------------
    // ENCAPSULATED ALGORITHMS (Z80 PORT BLOCK OPERATIONS)
    // ------------------------------------------------------------------------

    static executeIni(cpu, registers, alu) {
        let hl = registers.hl;

        const byte = cpu.theMMU.readPort(registers.c);
        cpu.theMMU.writeAddr(hl, byte);

        hl = (hl + 1) & 0xffff;
        registers.hl = hl;

        registers.b = alu.dec_8bit(registers, registers.b);

        if ((byte & 0x80) !== 0) registers.f |= z80flags.FLAG_N;
        else registers.f &= ~z80flags.FLAG_N;

        if ((byte + ((registers.c + 1) & 0xFF)) > 0xFF) {
            registers.f |= z80flags.FLAG_C;
            registers.f |= z80flags.FLAG_H;
        } else {
            registers.f &= ~z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_H;
        }

        if (alu.parityLookUp[((((byte + ((registers.c + 1) & 0xFF)) & 0x07) ^ registers.b))]) {
            registers.f |= z80flags.FLAG_PV;
        } else {
            registers.f &= ~z80flags.FLAG_PV;        
        }
        cpu.incPc(2);
    }

    static executeInir(cpu, registers, alu) {
        let hl = registers.hl;

        const byte = cpu.theMMU.readPort(registers.c);
        cpu.theMMU.writeAddr(hl, byte);

        hl = (hl + 1) & 0xffff;
        registers.hl = hl;

        registers.b = alu.dec_8bit(registers, registers.b);

        if (registers.b > 0) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }

    static executeOuti(cpu, registers, alu) {
        let hl = registers.hl;
        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writePort(registers.c, byte);

        registers.b = alu.dec_8bit(registers, registers.b);

        hl = (hl + 1) & 0xffff;
        registers.hl = hl;

        if ((byte & 0x80) !== 0) {
            registers.f |= z80flags.FLAG_N;
        } else {
            registers.f &= ~z80flags.FLAG_N;
        }

        if ((registers.l + byte) > 0xFF) {
            registers.f |= z80flags.FLAG_C;
            registers.f |= z80flags.FLAG_H;
        } else {
            registers.f &= ~z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_H;
        }

        if (alu.parityLookUp[((((registers.l + byte) & 0x07) ^ registers.b))]) {
            registers.f |= z80flags.FLAG_PV;
        } else {
            registers.f &= ~z80flags.FLAG_PV;
        }
        cpu.incPc(2);
    }

    static executeOutIncrementRepeat(cpu, registers, alu) {
        let hl = registers.hl;
        const valwritten = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writePort(registers.c, valwritten);

        registers.b = alu.dec_8bit(registers, registers.b);

        hl = (hl + 1) & 0xffff;
        registers.hl = hl;

        if ((valwritten & 0x80) !== 0) {
            registers.f |= z80flags.FLAG_N;
        } else {
            registers.f &= ~z80flags.FLAG_N;
        }

        if ((registers.l + valwritten) > 0xFF) {
            registers.f |= z80flags.FLAG_C;
            registers.f |= z80flags.FLAG_H;
        } else {
            registers.f &= ~z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_H;
        }

        if (alu.parityLookUp[((((registers.l + valwritten) & 0x07) ^ registers.b))]) {
            registers.f |= z80flags.FLAG_PV;
        } else {
            registers.f &= ~z80flags.FLAG_PV;
        }

        if (registers.b !== 0) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }

    static executeOutDecrement(cpu, registers, alu) {
        let hl = registers.hl;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writePort(registers.c, byte);

        hl = (hl - 1) & 0xffff;
        registers.hl = hl;

        registers.b = alu.dec_8bit(registers, registers.b);

        if ((byte & 0x80) !== 0) {
            registers.f |= z80flags.FLAG_N;
        } else {
            registers.f &= ~z80flags.FLAG_N;
        }

        if ((registers.l + byte) > 0xFF) {
            registers.f |= z80flags.FLAG_C;
            registers.f |= z80flags.FLAG_H;
        } else {
            registers.f &= ~z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_H;
        }

        if (alu.parityLookUp[((((registers.l + byte) & 0x07) ^ registers.b))]) {
            registers.f |= z80flags.FLAG_PV;
        } else {
            registers.f &= ~z80flags.FLAG_PV;
        }
        cpu.incPc(2);
    }

    static executeOutd(cpu, registers, alu) {
        let hl = registers.hl;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writePort(registers.c, byte);

        hl = (hl - 1) & 0xffff;
        registers.hl = hl;

        registers.b = alu.dec_8bit(registers, registers.b);

        if ((byte & 0x80) !== 0) {
            registers.f |= z80flags.FLAG_N;
        } else {
            registers.f &= ~z80flags.FLAG_N;
        }

        if ((registers.l + byte) > 0xFF) {
            registers.f |= z80flags.FLAG_C;
            registers.f |= z80flags.FLAG_H;
        } else {
            registers.f &= ~z80flags.FLAG_C;
            registers.f &= ~z80flags.FLAG_H;
        }

        if (alu.parityLookUp[((((registers.l + byte) & 0x07) ^ registers.b))]) {
            registers.f |= z80flags.FLAG_PV;
        } else {
            registers.f &= ~z80flags.FLAG_PV;
        }

        if (registers.b !== 0) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }
}