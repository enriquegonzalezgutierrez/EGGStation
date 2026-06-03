/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAddressing (Highly Optimized Addressing Mode Resolvers with 16-bit PC Wrapping)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Resolves all 28 physical addressing modes of the Ricoh 5A22 CPU.
 * OPTIMIZED: Caches CPU registers locally as variables prior to calculation,
 * performing stream offsets with local integers enshrouded in an active 16-bit mask
 * to accurately emulate hardware PC wrapping bounds.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles CPU address translation and pointer decoding.
 */

class SnesCpuAddressing {
    /**
     * Translates coordinates to effective address boundaries.
     * Writes results directly to cpu.resolvedAdr and cpu.resolvedAdrh.
     * @param {SnesCpu} cpu - Active CPU instance.
     * @param {number} opcode - Active execution instruction.
     * @param {number} mode - Addressing mode ID.
     */
    static resolve(cpu, opcode, mode) {
        // Cache CPU registers locally to bypass TypedArray read/write latency in the hot path
        let pc = cpu.br[CPU_REG_PC];
        const pb = cpu.r[CPU_REG_K] << 16;
        const dpr = cpu.br[CPU_REG_DPR];
        const dbr = cpu.r[CPU_REG_DBR] << 16;
        const regX = cpu.br[CPU_REG_X];
        const regY = cpu.br[CPU_REG_Y];
        const sp = cpu.br[CPU_REG_SP];

        switch (mode) {
            case CPU_MODE_IMP:
                cpu.resolvedAdr = 0;
                cpu.resolvedAdrh = 0;
                break;

            case CPU_MODE_IMM:
                cpu.resolvedAdr = pb | pc;
                pc = (pc + 1) & 0xffff; // Accurate 16-bit PC wrapping
                cpu.resolvedAdrh = 0;
                break;

            case CPU_MODE_IMMm: {
                if (cpu.m) {
                    cpu.resolvedAdr = pb | pc;
                    pc = (pc + 1) & 0xffff;
                    cpu.resolvedAdrh = 0;
                } else {
                    cpu.resolvedAdr = pb | pc;
                    pc = (pc + 1) & 0xffff;
                    cpu.resolvedAdrh = pb | pc;
                    pc = (pc + 1) & 0xffff;
                }
                break;
            }

            case CPU_MODE_IMMx: {
                if (cpu.x) {
                    cpu.resolvedAdr = pb | pc;
                    pc = (pc + 1) & 0xffff;
                    cpu.resolvedAdrh = 0;
                } else {
                    cpu.resolvedAdr = pb | pc;
                    pc = (pc + 1) & 0xffff;
                    cpu.resolvedAdrh = pb | pc;
                    pc = (pc + 1) & 0xffff;
                }
                break;
            }

            case CPU_MODE_IMMl: {
                cpu.resolvedAdr = pb | pc;
                pc = (pc + 1) & 0xffff;
                cpu.resolvedAdrh = pb | pc;
                pc = (pc + 1) & 0xffff;
                break;
            }

            case CPU_MODE_DP: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++; 
                }
                const base = (dpr + adr) & 0xffff;
                cpu.resolvedAdr = base;
                cpu.resolvedAdrh = (base + 1) & 0xffff;
                break;
            }

            case CPU_MODE_DPX: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const base = (dpr + adr + regX) & 0xffff;
                cpu.resolvedAdr = base;
                cpu.resolvedAdrh = (base + 1) & 0xffff;
                break;
            }

            case CPU_MODE_DPY: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const base = (dpr + adr + regY) & 0xffff;
                cpu.resolvedAdr = base;
                cpu.resolvedAdrh = (base + 1) & 0xffff;
                break;
            }

            case CPU_MODE_IDP: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;
                
                const finalAdr = dbr + pointer;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_IDX: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr + regX) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;

                const finalAdr = dbr + pointer;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_IDY: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;

                const finalAdr = dbr + pointer + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_IDYr: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;
                if (((pointer >> 8) !== ((pointer + regY) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++; 
                }

                const finalAdr = dbr + pointer + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_IDL: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((baseDpr + 2) & 0xffff)) << 16;
                cpu.resolvedAdr = pointer;
                cpu.resolvedAdrh = pointer + 1;
                break;
            }

            case CPU_MODE_ILY: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                if ((dpr & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                const baseDpr = (dpr + adr) & 0xffff;
                let pointer = cpu.mem.read(baseDpr);
                pointer |= (cpu.mem.read((baseDpr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((baseDpr + 2) & 0xffff)) << 16;

                const finalAdr = pointer + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_SR: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                const base = (sp + adr) & 0xffff;
                cpu.resolvedAdr = base;
                cpu.resolvedAdrh = (base + 1) & 0xffff;
                break;
            }

            case CPU_MODE_ISY: {
                const adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                const baseSp = (sp + adr) & 0xffff;
                let pointer = cpu.mem.read(baseSp);
                pointer |= (cpu.mem.read((baseSp + 1) & 0xffff)) << 8;

                const finalAdr = dbr + pointer + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABS: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;

                const finalAdr = dbr + adr;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABX: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;

                const finalAdr = dbr + adr + regX;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABXr: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                if (((adr >> 8) !== ((adr + regX) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }

                const finalAdr = dbr + adr + regX;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABY: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;

                const finalAdr = dbr + adr + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABYr: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                if (((adr >> 8) !== ((adr + regY) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }

                const finalAdr = dbr + adr + regY;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_ABL: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 16;
                pc = (pc + 1) & 0xffff;
                cpu.resolvedAdr = adr;
                cpu.resolvedAdrh = adr + 1;
                break;
            }

            case CPU_MODE_ALX: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 16;
                pc = (pc + 1) & 0xffff;

                const finalAdr = adr + regX;
                cpu.resolvedAdr = finalAdr;
                cpu.resolvedAdrh = finalAdr + 1;
                break;
            }

            case CPU_MODE_IND: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                cpu.resolvedAdr = pb + pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_IAX: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                let pointer = cpu.mem.read(pb | ((adr + regX) & 0xffff));
                pointer |= cpu.mem.read(pb | ((adr + regX + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = pb + pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_IAL: {
                let adr = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                adr |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                pointer |= cpu.mem.read((adr + 2) & 0xffff) << 16;
                cpu.resolvedAdr = pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_REL: {
                const rel = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                cpu.resolvedAdr = cpu.getSigned(rel, true);
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_RLL: {
                let rel = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                rel |= cpu.mem.read(pb | pc) << 8;
                pc = (pc + 1) & 0xffff;
                cpu.resolvedAdr = cpu.getSigned(rel, false);
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_BM: {
                const dest = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                const src = cpu.mem.read(pb | pc);
                pc = (pc + 1) & 0xffff;
                cpu.resolvedAdr = dest;
                cpu.resolvedAdrh = src;
                break;
            }
        }

        // Flush the updated local program counter register back to the CPU state exactly once with proper 16-bit wrap
        cpu.br[CPU_REG_PC] = pc;
    }
}

// Global transitional alias
window.SnesCpuAddressing = SnesCpuAddressing;