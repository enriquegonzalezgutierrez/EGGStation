/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/instructions/Z80BlockOps.js
 * 
 * Role:
 * Domain Layer: Z80 Block Operations Instructions.
 * This class encapsulates all Z80 CPU instructions designed for block memory 
 * transfers and block searches (LDI, LDIR, LDD, LDDR, CPI, CPIR, CPD, CPDR).
 * The logic follows the Command Pattern, mapping execution blocks dynamically (SRP).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for block memory 
 *    transfers, block copies, and block search instruction routines.
 * 2. Interface Segregation Principle (ISP): It depends only on a lean, unified 
 *    opcode mapping dictionary (registry) rather than requiring access to the 
 *    entire, heavy execution context of the ZilogZ80 class.
 */

class Z80BlockOps {
    /**
     * Registers all Block Operations opcodes onto the provided CPU opcode maps.
     * @param {ZilogZ80} cpu - The CPU Orchestrator instance.
     * @param {Z80Registers} registers - The CPU Registers state object.
     * @param {Z80Alu} alu - The Arithmetic Logic Unit for flag/math processing.
     * @param {Object} registry - The categorized opcode mapping arrays.
     */
    static register(cpu, registers, alu, registry) {

        // ========================================================================
        // 1. EXTENDED ED-PREFIXED MEMORY BLOCK TRANSFERS
        // ========================================================================
        registry.extended[0xa0] = [() => { Z80BlockOps.executeLdi(cpu, registers, alu); }, "LDI", 16, 0, false];
        registry.extended[0xa8] = [() => { Z80BlockOps.executeLoadDecrement(cpu, registers, alu); }, "LDD", 16, 0, false];
        registry.extended[0xb0] = [() => { Z80BlockOps.executeLoadIncrementRepeat(cpu, registers, alu); }, "LDIR", 16, 0, false];
        registry.extended[0xb8] = [() => { Z80BlockOps.executeLoadDecrementRepeat(cpu, registers, alu); }, "LDDR", 16, 0, false];

        // ========================================================================
        // 2. EXTENDED ED-PREFIXED MEMORY BLOCK SEARCHES
        // ========================================================================
        registry.extended[0xa1] = [() => { Z80BlockOps.executeCpi(cpu, registers, alu); }, "CPI", 16, 0, false];
        registry.extended[0xa9] = [() => { Z80BlockOps.executeCpd(cpu, registers, alu); }, "CPD", 16, 0, false];
        registry.extended[0xb1] = [() => { Z80BlockOps.executeCpir(cpu, registers, alu); }, "CPIR", 16, 0, false];
        registry.extended[0xb9] = [() => { Z80BlockOps.executeCpdr(cpu, registers, alu); }, "CPDR", 16, 0, false];

    }

    // ------------------------------------------------------------------------
    // ENCAPSULATED ALGORITHMS (Z80 BLOCK OPERATIONS)
    // ------------------------------------------------------------------------

    static executeLdi(cpu, registers, alu) {
        let hl = registers.hl;
        let de = registers.de;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writeAddr(de, byte);

        hl = (hl + 1) & 0xffff;
        de = (de + 1) & 0xffff;
        bc = (bc - 1); // Cycle count decremented 
        de &= 0xffff;  

        registers.hl = hl;
        registers.de = de;
        registers.bc = bc & 0xffff;

        registers.f &= 0xc1; // Clear S, Z, H, P/V, N flags
        const testByte = (byte + registers.a) & 0xff;

        if ((bc & 0xffff) > 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        cpu.incPc(2);
    }

    static executeCpi(cpu, registers, alu) {
        let hl = registers.hl;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);

        hl = (hl + 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.bc = bc;

        const v1 = registers.a;
        const v2 = byte;
        const rawNewValue = v1 - v2;
        const newValue = rawNewValue & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((v1 & 0x0f) - (v2 & 0x0f) < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        const testByte = (registers.a - byte - ((registers.f & Z80Flags.FLAG_H) ? 1 : 0)) & 0xff;

        registers.f |= Z80Flags.FLAG_N; // Subtraction set

        if (bc !== 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        if (newValue === 0) {
            registers.f |= Z80Flags.FLAG_Z;
        }
        if (newValue & 0x80) {
            registers.f |= Z80Flags.FLAG_S;
        }
        cpu.incPc(2);
    }

    static executeLoadDecrement(cpu, registers, alu) {
        let hl = registers.hl;
        let de = registers.de;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writeAddr(de, byte);

        hl = (hl - 1) & 0xffff;
        de = (de - 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.de = de;
        registers.bc = bc;

        registers.f &= 0xc1;
        const testByte = (byte + registers.a) & 0xff;

        if (bc > 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        cpu.incPc(2);
    }

    static executeCpd(cpu, registers, alu) {
        let hl = registers.hl;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);

        hl = (hl - 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.bc = bc;

        const v1 = registers.a;
        const v2 = byte;
        const rawNewValue = v1 - v2;
        const newValue = rawNewValue & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((v1 & 0x0f) - (v2 & 0x0f) < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        const testByte = (registers.a - byte - ((registers.f & Z80Flags.FLAG_H) ? 1 : 0)) & 0xff;

        registers.f |= Z80Flags.FLAG_N;

        if (bc !== 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        if (newValue === 0) {
            registers.f |= Z80Flags.FLAG_Z;
        }
        if (newValue & 0x80) {
            registers.f |= Z80Flags.FLAG_S;
        }
        cpu.incPc(2);
    }

    static executeLoadIncrementRepeat(cpu, registers, alu) {
        let hl = registers.hl;
        let de = registers.de;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writeAddr(de, byte);

        hl = (hl + 1) & 0xffff;
        de = (de + 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.de = de;
        registers.bc = bc;

        registers.f &= 0xc1;
        const testByte = (byte + registers.a) & 0xff;

        if (bc > 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }

        // Loop branching instruction logic
        if (bc > 0) {
            cpu.additionalCycles = 5; // branch taken cycle penalty
        } else {
            cpu.incPc(2);
        }
    }

    static executeCpir(cpu, registers, alu) {
        let hl = registers.hl;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);

        hl = (hl + 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.bc = bc;

        const v1 = registers.a;
        const v2 = byte;
        const rawNewValue = v1 - v2;
        const newValue = rawNewValue & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((v1 & 0x0f) - (v2 & 0x0f) < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        const testByte = (registers.a - byte - ((registers.f & Z80Flags.FLAG_H) ? 1 : 0)) & 0xff;

        registers.f |= Z80Flags.FLAG_N;

        if (bc !== 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x04) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        if (newValue === 0) {
            registers.f |= Z80Flags.FLAG_Z;
        }
        if (newValue & 0x80) {
            registers.f |= Z80Flags.FLAG_S;
        }

        if ((bc !== 0) && ((registers.f & Z80Flags.FLAG_Z) === 0)) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }

    static executeLoadDecrementRepeat(cpu, registers, alu) {
        let hl = registers.hl;
        let de = registers.de;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);
        cpu.theMMU.writeAddr(de, byte);

        hl = (hl - 1) & 0xffff;
        de = (de - 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.de = de;
        registers.bc = bc;

        registers.f &= ~Z80Flags.FLAG_N;
        registers.f &= ~Z80Flags.FLAG_H;

        if (bc !== 0) {
            registers.f |= Z80Flags.FLAG_PV;
        } else {
            registers.f &= ~Z80Flags.FLAG_PV;
        }

        if (bc !== 0) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }

    static executeCpdr(cpu, registers, alu) {
        let hl = registers.hl;
        let bc = registers.bc;

        const byte = cpu.theMMU.readAddr(hl);

        hl = (hl - 1) & 0xffff;
        bc = (bc - 1) & 0xffff;

        registers.hl = hl;
        registers.bc = bc;

        const v1 = registers.a;
        const v2 = byte;
        const rawNewValue = v1 - v2;
        const newValue = rawNewValue & 0xff;

        registers.f &= 0x01; // Preserve C flag

        if ((v1 & 0x0f) - (v2 & 0x0f) < 0) {
            registers.f |= Z80Flags.FLAG_H;
        }

        const testByte = (registers.a - byte - ((registers.f & Z80Flags.FLAG_H) ? 1 : 0)) & 0xff;

        registers.f |= Z80Flags.FLAG_N;

        if (bc !== 0) {
            registers.f |= Z80Flags.FLAG_PV;
        }
        if (testByte & 0x08) {
            registers.f |= Z80Flags.FLAG_F3;
        }
        if (testByte & 0x02) {
            registers.f |= Z80Flags.FLAG_F5;
        }
        if (newValue === 0) {
            registers.f |= Z80Flags.FLAG_Z;
        }
        if (newValue & 0x80) {
            registers.f |= Z80Flags.FLAG_S;
        }

        if ((bc !== 0) && ((registers.f & Z80Flags.FLAG_Z) === 0)) {
            cpu.additionalCycles = 5;
        } else {
            cpu.incPc(2);
        }
    }
}