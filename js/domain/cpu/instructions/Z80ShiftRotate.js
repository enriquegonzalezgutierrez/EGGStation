/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 Shift and Rotate Instruction Registry
 * 
 * This class encapsulates all Z80 CPU instructions designed for bit shifts and 
 * rotations (SLA, SRL, SRA, RL, RR, RLC, RRC, and BCD-related RLD/RRD). 
 * Refactored to accept a clean 'opcodeRegistry' object instead of a long parameter list.
 */

class Z80ShiftRotate {
    static register(cpu, registers, alu, registry) {

        // Helper for displacement address
        const getDisplacement = (indexValue) => {
            const d = cpu.theMMU.readAddr(cpu.registers.pc + 2);
            const incr = (d & 0x80) === 0x80 ? -0x80 + (d & 0x7F) : d;
            return (indexValue + incr) & 0xffff;
        };

        // ========================================================================
        // 1. STANDARD UNPREFIXED ROTATE INSTRUCTIONS (Accumulator Fast Rotates)
        // ========================================================================

        registry.standard[0x07] = [() => { 
            registers.a = alu.rlca_8bit(registers, registers.a);
            cpu.incPc(1); 
        }, "RLCA", 4, 0, false];

        registry.standard[0x0f] = [() => { 
            registers.a = alu.rrc_8bit(registers, registers.a, true);            
            cpu.incPc(1); 
        }, "RRCA", 4, 0, false];

        registry.standard[0x17] = [() => { 
            registers.a = alu.rl_8bit(registers, registers.a, true);
            cpu.incPc(1); 
        }, "RLA", 4, 0, false];

        registry.standard[0x1f] = [() => { 
            registers.a = alu.rra_8bit(registers, registers.a);
            cpu.incPc(1); 
        }, "RRA", 4, 0, false];


        // ========================================================================
        // 2. STANDARD CB-PREFIXED SHIFT/ROTATE INSTRUCTIONS
        // ========================================================================

        // --- RLC r ---
        registry.bitwise[0x00] = [() => { registers.b = alu.rlc_8bit(registers, registers.b); cpu.incPc(2); }, "RLC B", 8, 0, false];
        registry.bitwise[0x01] = [() => { registers.c = alu.rlc_8bit(registers, registers.c); cpu.incPc(2); }, "RLC C", 8, 0, false];
        registry.bitwise[0x02] = [() => { registers.d = alu.rlc_8bit(registers, registers.d); cpu.incPc(2); }, "RLC D", 8, 0, false]; 
        registry.bitwise[0x03] = [() => { registers.e = alu.rlc_8bit(registers, registers.e); cpu.incPc(2); }, "RLC E", 8, 0, false];
        registry.bitwise[0x04] = [() => { registers.h = alu.rlc_8bit(registers, registers.h); cpu.incPc(2); }, "RLC H", 8, 0, false];
        registry.bitwise[0x05] = [() => { registers.l = alu.rlc_8bit(registers, registers.l); cpu.incPc(2); }, "RLC L", 8, 0, false];
        registry.bitwise[0x06] = [() => { 
            const addr = registers.hl;
            const res = alu.rlc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(2); 
        }, "RLC (HL)", 15, 0, false];
        registry.bitwise[0x07] = [() => { registers.a = alu.rlc_8bit(registers, registers.a); cpu.incPc(2); }, "RLC A", 8, 0, false];

        // --- RRC r ---
        registry.bitwise[0x08] = [() => { registers.b = alu.rrc_8bit(registers, registers.b); cpu.incPc(2); }, "RRC B", 8, 0, false];
        registry.bitwise[0x09] = [() => { registers.c = alu.rrc_8bit(registers, registers.c); cpu.incPc(2); }, "RRC C", 8, 0, false];
        registry.bitwise[0x0a] = [() => { registers.d = alu.rrc_8bit(registers, registers.d); cpu.incPc(2); }, "RRC D", 8, 0, false];
        registry.bitwise[0x0b] = [() => { registers.e = alu.rrc_8bit(registers, registers.e); cpu.incPc(2); }, "RRC E", 8, 0, false];
        registry.bitwise[0x0c] = [() => { registers.h = alu.rrc_8bit(registers, registers.h); cpu.incPc(2); }, "RRC H", 8, 0, false];
        registry.bitwise[0x0d] = [() => { registers.l = alu.rrc_8bit(registers, registers.l); cpu.incPc(2); }, "RRC L", 8, 0, false];
        registry.bitwise[0x0e] = [() => { 
            const addr = registers.hl;
            const res = alu.rrc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(2); 
        }, "RRC (HL)", 15, 0, false];
        registry.bitwise[0x0f] = [() => { registers.a = alu.rrc_8bit(registers, registers.a); cpu.incPc(2); }, "RRC A", 8, 0, false];

        // --- RL r ---
        registry.bitwise[0x10] = [() => { registers.b = alu.rl_8bit(registers, registers.b); cpu.incPc(2); }, "RL B", 8, 0, false];
        registry.bitwise[0x11] = [() => { registers.c = alu.rl_8bit(registers, registers.c); cpu.incPc(2); }, "RL C", 8, 0, false];
        registry.bitwise[0x12] = [() => { registers.d = alu.rl_8bit(registers, registers.d); cpu.incPc(2); }, "RL D", 8, 0, false];
        registry.bitwise[0x13] = [() => { registers.e = alu.rl_8bit(registers, registers.e); cpu.incPc(2); }, "RL E", 8, 0, false];
        registry.bitwise[0x14] = [() => { registers.h = alu.rl_8bit(registers, registers.h); cpu.incPc(2); }, "RL H", 8, 0, false];
        registry.bitwise[0x15] = [() => { registers.l = alu.rl_8bit(registers, registers.l); cpu.incPc(2); }, "RL L", 8, 0, false];
        registry.bitwise[0x16] = [() => { 
            const addr = registers.hl;
            const res = alu.rl_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(2); 
        }, "RL (HL)", 15, 0, false];
        registry.bitwise[0x17] = [() => { registers.a = alu.rl_8bit(registers, registers.a); cpu.incPc(2); }, "RL A", 8, 0, false];

        // --- RR r ---
        registry.bitwise[0x18] = [() => { registers.b = alu.rr_8bit(registers, registers.b); cpu.incPc(2); }, "RR B", 8, 0, false];
        registry.bitwise[0x19] = [() => { registers.c = alu.rr_8bit(registers, registers.c); cpu.incPc(2); }, "RR C", 8, 0, false];
        registry.bitwise[0x1a] = [() => { registers.d = alu.rr_8bit(registers, registers.d); cpu.incPc(2); }, "RR D", 8, 0, false];
        registry.bitwise[0x1b] = [() => { registers.e = alu.rr_8bit(registers, registers.e); cpu.incPc(2); }, "RR E", 8, 0, false];
        registry.bitwise[0x1c] = [() => { registers.h = alu.rr_8bit(registers, registers.h); cpu.incPc(2); }, "RR H", 8, 0, false];
        registry.bitwise[0x1d] = [() => { registers.l = alu.rr_8bit(registers, registers.l); cpu.incPc(2); }, "RR L", 8, 0, false];
        registry.bitwise[0x1e] = [() => {
            const hl = registers.hl;
            const content = cpu.theMMU.readAddr(hl);
            cpu.theMMU.writeAddr(hl, alu.rr_8bit(registers, content)); 
            cpu.incPc(2); 
        }, "RR (HL)", 15, 0, false];
        registry.bitwise[0x1f] = [() => { registers.a = alu.rr_8bit(registers, registers.a); cpu.incPc(2); }, "RR A", 8, 0, false];

        // --- SLA r ---
        registry.bitwise[0x20] = [() => { registers.b = alu.sla_8bit(registers, registers.b); cpu.incPc(2); }, "SLA B", 8, 0, false];
        registry.bitwise[0x21] = [() => { registers.c = alu.sla_8bit(registers, registers.c); cpu.incPc(2); }, "SLA C", 8, 0, false];
        registry.bitwise[0x22] = [() => { registers.d = alu.sla_8bit(registers, registers.d); cpu.incPc(2); }, "SLA D", 8, 0, false];
        registry.bitwise[0x23] = [() => { registers.e = alu.sla_8bit(registers, registers.e); cpu.incPc(2); }, "SLA E", 8, 0, false];
        registry.bitwise[0x24] = [() => { registers.h = alu.sla_8bit(registers, registers.h); cpu.incPc(2); }, "SLA H", 8, 0, false];
        registry.bitwise[0x25] = [() => { registers.l = alu.sla_8bit(registers, registers.l); cpu.incPc(2); }, "SLA L", 8, 0, false];
        registry.bitwise[0x26] = [() => {
            const hl = registers.hl;
            const content = cpu.theMMU.readAddr(hl);
            cpu.theMMU.writeAddr(hl, alu.sla_8bit(registers, content)); 
            cpu.incPc(2); 
        }, "SLA (HL)", 15, 0, false];
        registry.bitwise[0x27] = [() => { registers.a = alu.sla_8bit(registers, registers.a); cpu.incPc(2); }, "SLA A", 8, 0, false];

        // --- SRA r ---
        registry.bitwise[0x28] = [() => { registers.b = alu.sra_8bit(registers, registers.b); cpu.incPc(2); }, "SRA B", 8, 0, false];
        registry.bitwise[0x29] = [() => { registers.c = alu.sra_8bit(registers, registers.c); cpu.incPc(2); }, "SRA C", 8, 0, false];
        registry.bitwise[0x2a] = [() => { registers.d = alu.sra_8bit(registers, registers.d); cpu.incPc(2); }, "SRA D", 8, 0, false];
        registry.bitwise[0x2b] = [() => { registers.e = alu.sra_8bit(registers, registers.e); cpu.incPc(2); }, "SRA E", 8, 0, false];
        registry.bitwise[0x2c] = [() => { registers.h = alu.sra_8bit(registers, registers.h); cpu.incPc(2); }, "SRA H", 8, 0, false];
        registry.bitwise[0x2d] = [() => { registers.l = alu.sra_8bit(registers, registers.l); cpu.incPc(2); }, "SRA L", 8, 0, false];
        registry.bitwise[0x2f] = [() => { registers.a = alu.sra_8bit(registers, registers.a); cpu.incPc(2); }, "SRA A", 8, 0, false];

        // --- SLL r (Undocumented) ---
        registry.bitwise[0x31] = [() => { registers.c = alu.sll_8bit(registers, registers.c); cpu.incPc(2); }, "SLL C", 8, 0, true];
        registry.bitwise[0x33] = [() => { registers.e = alu.sll_8bit(registers, registers.e); cpu.incPc(2); }, "SLL E", 8, 0, true];
    
        // --- SRL r ---
        registry.bitwise[0x38] = [() => { registers.b = alu.srl_8bit(registers, registers.b); cpu.incPc(2); }, "SRL B", 8, 0, false];
        registry.bitwise[0x39] = [() => { registers.c = alu.srl_8bit(registers, registers.c); cpu.incPc(2); }, "SRL C", 8, 0, false];
        registry.bitwise[0x3a] = [() => { registers.d = alu.srl_8bit(registers, registers.d); cpu.incPc(2); }, "SRL D", 8, 0, false];
        registry.bitwise[0x3b] = [() => { registers.e = alu.srl_8bit(registers, registers.e); cpu.incPc(2); }, "SRL E", 8, 0, false];
        registry.bitwise[0x3c] = [() => { registers.h = alu.srl_8bit(registers, registers.h); cpu.incPc(2); }, "SRL H", 8, 0, false];
        registry.bitwise[0x3d] = [() => { registers.l = alu.srl_8bit(registers, registers.l); cpu.incPc(2); }, "SRL L", 8, 0, false];
        registry.bitwise[0x3e] = [() => {
            const hl = registers.hl;
            const content = cpu.theMMU.readAddr(hl);
            cpu.theMMU.writeAddr(hl, alu.srl_8bit(registers, content)); 
            cpu.incPc(2); 
        }, "SRL (HL)", 15, 0, false];
        registry.bitwise[0x3f] = [() => { registers.a = alu.srl_8bit(registers, registers.a); cpu.incPc(2); }, "SRL A", 8, 0, false];


        // ========================================================================
        // 3. EXTENDED ED-PREFIXED NIBBLE ROTATES (RLD / RRD for BCD Math)
        // ========================================================================

        registry.extended[0x67] = [() => {
            Z80ShiftRotate.executeRrd(cpu, registers, alu);
            cpu.incPc(2);
        }, "RRD", 18, 0, false];

        registry.extended[0x6f] = [() => {
            Z80ShiftRotate.executeRld(cpu, registers, alu);
            cpu.incPc(2);
        }, "RLD", 18, 0, false];


        // ========================================================================
        // 4. INDEXED DDCB-PREFIXED SHIFT/ROTATE INSTRUCTIONS (IX + d)
        // ========================================================================

        registry.bitwiseIX[0x06] = [() => { 
            const addr = getDisplacement(registers.ix);
            const res = alu.rlc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RLC (IX+%d)", 23, 0, false];

        registry.bitwiseIX[0x0e] = [() => { 
            const addr = getDisplacement(registers.ix);
            const res = alu.rrc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RRC (IX+%d)", 23, 0, false];
            
        registry.bitwiseIX[0x16] = [() => {
            const addr = getDisplacement(registers.ix);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.rl_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "RL (IX+%d)", 23, 1, false];

        registry.bitwiseIX[0x1e] = [() => { 
            const addr = getDisplacement(registers.ix);
            const res = alu.rr_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RR (IX+%d)", 23, 0, false];
            
        registry.bitwiseIX[0x26] = [() => {
            const addr = getDisplacement(registers.ix);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sla_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SLA (IX+%d)", 23, 1, false];

        registry.bitwiseIX[0x2e] = [() => {
            const addr = getDisplacement(registers.ix);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sra_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SRA (IX+%d)", 23, 1, false];

        registry.bitwiseIX[0x36] = [() => {
            const addr = getDisplacement(registers.ix);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sll_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SLL (IX+%d)", 23, 1, true];
            
        registry.bitwiseIX[0x3e] = [() => {
            const addr = getDisplacement(registers.ix);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.srl_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SRL (IX+%d)", 23, 1, false];


        // ========================================================================
        // 5. INDEXED FDCB-PREFIXED SHIFT/ROTATE INSTRUCTIONS (IY + d)
        // ========================================================================

        registry.bitwiseIY[0x06] = [() => { 
            const addr = getDisplacement(registers.iy);
            const res = alu.rlc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RLC (IY+%d)", 23, 0, false];

        registry.bitwiseIY[0x0e] = [() => { 
            const addr = getDisplacement(registers.iy);
            const res = alu.rrc_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RRC (IY+%d)", 23, 0, false];

        registry.bitwiseIY[0x16] = [() => { 
            const addr = getDisplacement(registers.iy);
            const res = alu.rl_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RL (IY+%d)", 23, 0, false];
            
        registry.bitwiseIY[0x1e] = [() => { 
            const addr = getDisplacement(registers.iy);
            const res = alu.rr_8bit(registers, cpu.theMMU.readAddr(addr));
            cpu.theMMU.writeAddr(addr, res);
            cpu.incPc(4); 
        }, "RR (IY+%d)", 23, 0, false];
    
        registry.bitwiseIY[0x26] = [() => {
            const addr = getDisplacement(registers.iy);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sla_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SLA (IY+%d)", 23, 1, false];
    
        registry.bitwiseIY[0x2e] = [() => {
            const addr = getDisplacement(registers.iy);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sra_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SRA (IY+%d)", 23, 1, false];
    
        registry.bitwiseIY[0x36] = [() => {
            const addr = getDisplacement(registers.iy);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.sll_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SLL (IY+%d)", 23, 1, true];
    
        registry.bitwiseIY[0x3e] = [() => {
            const addr = getDisplacement(registers.iy);
            let mem = cpu.theMMU.readAddr(addr);
            mem = alu.srl_8bit(registers, mem); 
            cpu.theMMU.writeAddr(addr, mem);
            cpu.incPc(4); 
        }, "SRL (IY+%d)", 23, 1, false];

    }

    // Helper functions for BCD Rotate Operations
    static executeRld(cpu, registers, alu) {
        const address = registers.hl;
        const byte = cpu.theMMU.readAddr(address);

        const result = (registers.a & 0xf0) | ((byte >> 4) & 0x0F);
        cpu.theMMU.writeAddr(address, ((byte << 4) & 0xF0) | (registers.a & 0x0F));
        registers.a = result;

        registers.f &= 0x01;

        if (alu.parityLookUp[registers.a]) {
            registers.f |= z80flags.FLAG_PV;
        }
        if (registers.a & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }
        if (registers.a & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }
        if (registers.a === 0) {
            registers.f |= z80flags.FLAG_Z;
        }
        if (registers.a & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }
    }

    static executeRrd(cpu, registers, alu) {
        const address = registers.hl;
        let byte = cpu.theMMU.readAddr(address);

        const nibble0 = (registers.a & 0x0f);
        const nibble1 = (byte & 0xf0) >> 4;
        const nibble2 = (byte & 0x0f);

        registers.a = (registers.a & 0xf0) | nibble2;
        byte = (nibble0 << 4) | nibble1;

        cpu.theMMU.writeAddr(address, byte);

        registers.f &= 0x01;

        if (alu.parityLookUp[registers.a]) {
            registers.f |= z80flags.FLAG_PV;
        }
        if (registers.a & 0x08) {
            registers.f |= z80flags.FLAG_F3;
        }
        if (registers.a & 0x20) {
            registers.f |= z80flags.FLAG_F5;
        }
        if (registers.a === 0) {
            registers.f |= z80flags.FLAG_Z;
        }
        if (registers.a & 0x80) {
            registers.f |= z80flags.FLAG_S;
        }
    }
}