/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuOperations (Stack & Flags Processor - Scoped & Fixed)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles direct CPU stack push/pull operations (PHA, PLA, PHP, PLP, etc.)
 * and system flag manipulations (CLC, SEC, SEI, CLI, REP, SEP).
 * Manipulates CPU registers and WRAM space directly to prevent GC thrashing.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles stack memory operations and processor status register flags.
 */

class SnesCpuOperations {
    // ========================================================================
    // BASE STACK MANIPULATIONS (Bridges native 8-bit/16-bit boundaries)
    // ========================================================================

    static pushByte(cpu, value) {
        if (cpu.e) { // Emulation Mode (always on Page 1: $100-$1FF)
            cpu.mem.write((cpu.br[CPU_REG_SP] & 0xff) | 0x100, value);
        } else { // Native Mode
            cpu.mem.write(cpu.br[CPU_REG_SP], value);
        }
        cpu.br[CPU_REG_SP]--;
    }

    static pullByte(cpu) {
        cpu.br[CPU_REG_SP]++;
        if (cpu.e) {
            return cpu.mem.read((cpu.br[CPU_REG_SP] & 0xff) | 0x100);
        }
        return cpu.mem.read(cpu.br[CPU_REG_SP]);
    }

    static pushWord(cpu, value) {
        this.pushByte(cpu, (value & 0xff00) >> 8);
        this.pushByte(cpu, value & 0xff);
    }

    static pullWord(cpu) {
        let value = this.pullByte(cpu);
        value |= this.pullByte(cpu) << 8;
        return value;
    }

    // ========================================================================
    // CPU STACK OPCODES (PHA, PHP, PLA, PLP, etc.)
    // ========================================================================

    static pha(cpu) {
        if (cpu.m) {
            this.pushByte(cpu, cpu.br[CPU_REG_A] & 0xff);
        } else {
            cpu.cyclesLeft++; // 16-bit push overhead
            this.pushWord(cpu, cpu.br[CPU_REG_A]);
        }
    }

    static phx(cpu) {
        if (cpu.x) {
            this.pushByte(cpu, cpu.br[CPU_REG_X] & 0xff);
        } else {
            cpu.cyclesLeft++;
            this.pushWord(cpu, cpu.br[CPU_REG_X]);
        }
    }

    static phy(cpu) {
        if (cpu.x) {
            this.pushByte(cpu, cpu.br[CPU_REG_Y] & 0xff);
        } else {
            cpu.cyclesLeft++;
            this.pushWord(cpu, cpu.br[CPU_REG_Y]);
        }
    }

    static pla(cpu) {
        if (cpu.m) {
            cpu.br[CPU_REG_A] = (cpu.br[CPU_REG_A] & 0xff00) | (this.pullByte(cpu) & 0xff);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_A] = this.pullWord(cpu);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_A], cpu.m);
        }
    }

    static plx(cpu) {
        if (cpu.x) {
            cpu.br[CPU_REG_X] = this.pullByte(cpu);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_X] = this.pullWord(cpu);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_X], cpu.x);
        }
    }

    static ply(cpu) {
        if (cpu.x) {
            cpu.br[CPU_REG_Y] = this.pullByte(cpu);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        } else {
            cpu.cyclesLeft++;
            cpu.br[CPU_REG_Y] = this.pullWord(cpu);
            SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_Y], cpu.x);
        }
    }

    static phb(cpu) { this.pushByte(cpu, cpu.r[CPU_REG_DBR]); }
    static phd(cpu) { this.pushWord(cpu, cpu.br[CPU_REG_DPR]); }
    static phk(cpu) { this.pushByte(cpu, cpu.r[CPU_REG_K]); }
    static php(cpu) { this.pushByte(cpu, cpu.getP()); }

    static plb(cpu) {
        cpu.r[CPU_REG_DBR] = this.pullByte(cpu);
        SnesCpuAlu.setZandN(cpu, cpu.r[CPU_REG_DBR], true);
    }

    static pld(cpu) {
        cpu.br[CPU_REG_DPR] = this.pullWord(cpu);
        SnesCpuAlu.setZandN(cpu, cpu.br[CPU_REG_DPR], false);
    }

    static plp(cpu) {
        cpu.setP(this.pullByte(cpu));
    }

    // ========================================================================
    // HARDWARE STATE FLAGS OPERATIONS (CLC, SEC, REP, SEP, etc.)
    // ========================================================================

    static clc(cpu) { cpu.c = false; }
    static cld(cpu) { cpu.d = false; }
    static cli(cpu) { cpu.i = false; }
    static clv(cpu) { cpu.v = false; }
    static sec(cpu) { cpu.c = true; }
    static sed(cpu) { cpu.d = true; }
    static sei(cpu) { cpu.i = true; }

    /**
     * CORRECCIÓN CLAVE: Realizar la lectura en la dirección física (adr) del bus
     * de memoria antes de alterar las banderas del procesador.
     */
    static rep(cpu, adr) {
        const value = cpu.mem.read(adr);
        cpu.setP(cpu.getP() & ~value);
    }

    static sep(cpu, adr) {
        const value = cpu.mem.read(adr);
        cpu.setP(cpu.getP() | value);
    }
}

// Global transitional alias
window.SnesCpuOperations = SnesCpuOperations;