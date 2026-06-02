/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuInstructions (Hardware Instruction Set)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements the instruction set (Opcodes) of the Ricoh 5A22 CPU.
 * It manipulates CPU state registers and delegates mathematical calculations to
 * SnesCpuAlu. This keeps the execution core decoupled from instruction definitions.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles instruction set behavior.
 */

class SnesCpuInstructions {
    // ========================================================================
    // DATA TRANSFERS & REGISTERS LOAD/STORE
    // ========================================================================

    static lda(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (value & 0xff);
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_A] = cpu.readWord(adr, adrh);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static ldx(cpu, adr, adrh) {
        if (cpu.x) {
            cpu.br[CPU_REG_X] = cpu.mem.read(adr);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_X] = cpu.readWord(adr, adrh);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        }
    }

    static ldy(cpu, adr, adrh) {
        if (cpu.x) {
            cpu.br[CPU_REG_Y] = cpu.mem.read(adr);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_Y] = cpu.readWord(adr, adrh);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        }
    }

    static sta(cpu, adr, adrh) {
        if (cpu.m) {
            cpu.mem.write(adr, cpu.br[CPU_REG_A] & 0xff);
        } else {
            cpu.cyclesLeft++;
            cpu.writeWord(adr, adrh, cpu.br[CPU_REG_A]);
        }
    }

    static stx(cpu, adr, adrh) {
        if (cpu.x) {
            cpu.mem.write(adr, cpu.br[CPU_REG_X] & 0xff);
        } else {
            cpu.cyclesLeft++;
            cpu.writeWord(adr, adrh, cpu.br[CPU_REG_X]);
        }
    }

    static sty(cpu, adr, adrh) {
        if (cpu.x) {
            cpu.mem.write(adr, cpu.br[CPU_REG_Y] & 0xff);
        } else {
            cpu.cyclesLeft++;
            cpu.writeWord(adr, adrh, cpu.br[CPU_REG_Y]);
        }
    }

    static stz(cpu, adr, adrh) {
        if (cpu.m) {
            cpu.mem.write(adr, 0);
        } else {
            cpu.cyclesLeft++;
            cpu.writeWord(adr, adrh, 0);
        }
    }

    // ========================================================================
    // ARITHMETIC / BITWISE OPERATION MEMORY WRAPPERS
    // ========================================================================

    static and(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | ((cpu.br[CPU_REG_A] & value) & 0xff);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_A] &= value;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static eor(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | ((cpu.br[CPU_REG_A] ^ value) & 0xff);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_A] ^= value;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static ora(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | ((cpu.br[CPU_REG_A] | value) & 0xff);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_A] |= value;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static bit(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            const result = (cpu.br[CPU_REG_A] & 0xff) & value;
            cpu.z = result === 0;
            cpu.n = (value & 0x80) > 0;
            cpu.v = (value & 0x40) > 0;
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft++;
            const result = cpu.br[CPU_REG_A] & value;
            cpu.z = result === 0;
            cpu.n = (value & 0x8000) > 0;
            cpu.v = (value & 0x4000) > 0;
        }
    }

    static biti(cpu, adr, adrh) {
        if (cpu.m) {
            const value = cpu.mem.read(adr);
            cpu.z = ((cpu.br[CPU_REG_A] & 0xff) & value) === 0;
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft++;
            cpu.z = (cpu.br[CPU_REG_A] & value) === 0;
        }
    }

    static trb(cpu, adr, adrh) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            cpu.z = ((cpu.br[CPU_REG_A] & 0xff) & value) === 0;
            value = (value & ~(cpu.br[CPU_REG_A] & 0xff)) & 0xff;
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft += 2;
            cpu.z = (cpu.br[CPU_REG_A] & value) === 0;
            value = (value & ~cpu.br[CPU_REG_A]) & 0xffff;
            cpu.writeWord(adr, adrh, value, true);
        }
    }

    static tsb(cpu, adr, adrh) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            cpu.z = ((cpu.br[CPU_REG_A] & 0xff) & value) === 0;
            value = (value | (cpu.br[CPU_REG_A] & 0xff)) & 0xff;
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft += 2;
            cpu.z = (cpu.br[CPU_REG_A] & value) === 0;
            value = (value | cpu.br[CPU_REG_A]) & 0xffff;
            cpu.writeWord(adr, adrh, value, true);
        }
    }

    // ========================================================================
    // INCREMENT / DECREMENT / SHIFTS
    // ========================================================================

    static dec(cpu, adr, adrh) {
        if (cpu.m) {
            const result = (cpu.mem.read(adr) - 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.mem.write(adr, result);
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft += 2;
            const result = (value - 1) & 0xffff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.writeWord(adr, adrh, result, true);
        }
    }

    static deca(cpu) {
        if (cpu.m) {
            const result = ((cpu.br[CPU_REG_A] & 0xff) - 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | result;
        } else {
            cpu.br[CPU_REG_A]--;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static dex(cpu) {
        if (cpu.x) {
            const result = ((cpu.br[CPU_REG_X] & 0xff) - 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.x);
            cpu.br[CPU_REG_X] = result;
        } else {
            cpu.br[CPU_REG_X]--;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        }
    }

    static dey(cpu) {
        if (cpu.x) {
            const result = ((cpu.br[CPU_REG_Y] & 0xff) - 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.x);
            cpu.br[CPU_REG_Y] = result;
        } else {
            cpu.br[CPU_REG_Y]--;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        }
    }

    static inc(cpu, adr, adrh) {
        if (cpu.m) {
            const result = (cpu.mem.read(adr) + 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.mem.write(adr, result);
        } else {
            const value = cpu.readWord(adr, adrh);
            cpu.cyclesLeft += 2;
            const result = (value + 1) & 0xffff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.writeWord(adr, adrh, result, true);
        }
    }

    static inca(cpu) {
        if (cpu.m) {
            const result = ((cpu.br[CPU_REG_A] & 0xff) + 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | result;
        } else {
            cpu.br[CPU_REG_A]++;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static inx(cpu) {
        if (cpu.x) {
            const result = ((cpu.br[CPU_REG_X] & 0xff) + 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.x);
            cpu.br[CPU_REG_X] = result;
        } else {
            cpu.br[CPU_REG_X]++;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        }
    }

    static iny(cpu) {
        if (cpu.x) {
            const result = ((cpu.br[CPU_REG_Y] & 0xff) + 1) & 0xff;
            SnesCpuAlu.setZandN(cpu, result, cpu.x);
            cpu.br[CPU_REG_Y] = result;
        } else {
            cpu.br[CPU_REG_Y]++;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        }
    }

    static asl(cpu, adr) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            cpu.c = (value & 0x80) > 0;
            value <<= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adr + 1);
            cpu.cyclesLeft += 2;
            cpu.c = (value & 0x8000) > 0;
            value <<= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.writeWord(adr, adr + 1, value, true);
        }
    }

    static asla(cpu) {
        if (cpu.m) {
            let value = cpu.br[CPU_REG_A] & 0xff;
            cpu.c = (value & 0x80) > 0;
            value <<= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            cpu.c = (cpu.br[CPU_REG_A] & 0x8000) > 0;
            cpu.cyclesLeft += 2;
            cpu.br[CPU_REG_A] <<= 1;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static lsr(cpu, adr) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            cpu.c = (value & 0x1) > 0;
            value >>= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adr + 1);
            cpu.cyclesLeft += 2;
            cpu.c = (value & 0x1) > 0;
            value >>= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.writeWord(adr, adr + 1, value, true);
        }
    }

    static lsra(cpu) {
        if (cpu.m) {
            let value = cpu.br[CPU_REG_A] & 0xff;
            cpu.c = (value & 0x1) > 0;
            value >>= 1;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            cpu.c = (cpu.br[CPU_REG_A] & 0x1) > 0;
            cpu.cyclesLeft += 2;
            cpu.br[CPU_REG_A] >>= 1;
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static rol(cpu, adr) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            value = (value << 1) | (cpu.c ? 1 : 0);
            cpu.c = (value & 0x100) > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adr + 1);
            cpu.cyclesLeft += 2;
            value = (value << 1) | (cpu.c ? 1 : 0);
            cpu.c = (value & 0x10000) > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.writeWord(adr, adr + 1, value, true);
        }
    }

    static rola(cpu) {
        if (cpu.m) {
            let value = cpu.br[CPU_REG_A] & 0xff;
            value = (value << 1) | (cpu.c ? 1 : 0);
            cpu.c = (value & 0x100) > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            cpu.cyclesLeft += 2;
            const value = (cpu.br[CPU_REG_A] << 1) | (cpu.c ? 1 : 0);
            cpu.c = (value & 0x10000) > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = value;
        }
    }

    static ror(cpu, adr) {
        if (cpu.m) {
            let value = cpu.mem.read(adr);
            const carry = value & 0x1;
            value = (value >> 1) | (cpu.c ? 0x80 : 0);
            cpu.c = carry > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.mem.write(adr, value);
        } else {
            let value = cpu.readWord(adr, adr + 1);
            cpu.cyclesLeft += 2;
            const carry = value & 0x1;
            value = (value >> 1) | (cpu.c ? 0x8000 : 0);
            cpu.c = carry > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.writeWord(adr, adr + 1, value, true);
        }
    }

    static rora(cpu) {
        if (cpu.m) {
            let value = cpu.br[CPU_REG_A] & 0xff;
            const carry = value & 0x1;
            value = (value >> 1) | (cpu.c ? 0x80 : 0);
            cpu.c = carry > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            cpu.cyclesLeft += 2;
            const carry = cpu.br[CPU_REG_A] & 0x1;
            const value = (cpu.br[CPU_REG_A] >> 1) | (cpu.c ? 0x8000 : 0);
            cpu.c = carry > 0;
            SnesCpuAlu.setZandN(cpu, value, cpu.m);
            cpu.br[CPU_REG_A] = value;
        }
    }

    // ========================================================================
    // SYSTEM CO-PROCESSING REGISTER TRANSFERS
    // ========================================================================

    static tax(cpu) {
        cpu.br[CPU_REG_X] = cpu.x ? (cpu.br[CPU_REG_A] & 0xff) : cpu.br[CPU_REG_A];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
    }

    static tay(cpu) {
        cpu.br[CPU_REG_Y] = cpu.x ? (cpu.br[CPU_REG_A] & 0xff) : cpu.br[CPU_REG_A];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
    }

    static tsx(cpu) {
        cpu.br[CPU_REG_X] = cpu.x ? (cpu.br[CPU_REG_SP] & 0xff) : cpu.br[CPU_REG_SP];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
    }

    static txa(cpu) {
        cpu.br[CPU_REG_A] = cpu.m ? ((cpu.br[CPU_REG_A] & 0xff00) | (cpu.br[CPU_REG_X] & 0xff)) : cpu.br[CPU_REG_X];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
    }

    static txs(cpu) {
        cpu.br[CPU_REG_SP] = cpu.br[CPU_REG_X];
    }

    static txy(cpu) {
        cpu.br[CPU_REG_Y] = cpu.x ? (cpu.br[CPU_REG_X] & 0xff) : cpu.br[CPU_REG_X];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
    }

    static tya(cpu) {
        cpu.br[CPU_REG_A] = cpu.m ? ((cpu.br[CPU_REG_A] & 0xff00) | (cpu.br[CPU_REG_Y] & 0xff)) : cpu.br[CPU_REG_Y];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
    }

    static tyx(cpu) {
        cpu.br[CPU_REG_X] = cpu.x ? (cpu.br[CPU_REG_Y] & 0xff) : cpu.br[CPU_REG_Y];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
    }

    static tcd(cpu) {
        cpu.br[CPU_REG_DPR] = cpu.br[CPU_REG_A];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_DPR], false);
    }

    static tcs(cpu) {
        cpu.br[CPU_REG_SP] = cpu.br[CPU_REG_A];
    }

    static tdc(cpu) {
        cpu.br[CPU_REG_A] = cpu.br[CPU_REG_DPR];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], false);
    }

    static tsc(cpu) {
        cpu.br[CPU_REG_A] = cpu.br[CPU_REG_SP];
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], false);
    }

    static xba(cpu) {
        const low = cpu.br[CPU_REG_A] & 0xff;
        const high = (cpu.br[CPU_REG_A] & 0xff00) >> 8;
        cpu.br[CPU_REG_A] = (low << 8) | high;
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], true);
    }

    static xce(cpu) {
        const temp = cpu.c;
        cpu.c = cpu.e;
        cpu.e = temp;
        if (cpu.e) {
            cpu.m = true;
            cpu.x = true;
        }
        if (cpu.x) {
            cpu.br[CPU_REG_X] &= 0xff;
            cpu.br[CPU_REG_Y] &= 0xff;
        }
    }

    static mvn(cpu, adr, adrh) {
        cpu.r[CPU_REG_DBR] = adr;
        cpu.mem.write((adr << 16) | cpu.br[CPU_REG_Y], cpu.mem.read((adrh << 16) | cpu.br[CPU_REG_X]));
        cpu.br[CPU_REG_A]--;
        cpu.br[CPU_REG_X]++;
        cpu.br[CPU_REG_Y]++;
        if (cpu.br[CPU_REG_A] !== 0xffff) {
            cpu.br[CPU_REG_PC] -= 3;
        }
        if (cpu.x) {
            cpu.br[CPU_REG_X] &= 0xff;
            cpu.br[CPU_REG_Y] &= 0xff;
        }
    }

    static mvp(cpu, adr, adrh) {
        cpu.r[CPU_REG_DBR] = adr;
        cpu.mem.write((adr << 16) | cpu.br[CPU_REG_Y], cpu.mem.read((adrh << 16) | cpu.br[CPU_REG_X]));
        cpu.br[CPU_REG_A]--;
        cpu.br[CPU_REG_X]--;
        cpu.br[CPU_REG_Y]--;
        if (cpu.br[CPU_REG_A] !== 0xffff) {
            cpu.br[CPU_REG_PC] -= 3;
        }
        if (cpu.x) {
            cpu.br[CPU_REG_X] &= 0xff;
            cpu.br[CPU_REG_Y] &= 0xff;
        }
    }
}

// Global transitional alias
window.SnesCpuInstructions = SnesCpuInstructions;