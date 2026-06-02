/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAddressing (Addressing Mode Resolvers - GC-Free)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Resolves all 28 physical addressing modes of the Ricoh 5A22 CPU.
 * OPTIMIZED: Writes resolved address bounds directly to pre-allocated properties 
 * on the CPU instance (cpu.resolvedAdr, cpu.resolvedAdrh) instead of returning 
 * new array allocations. This eliminates Garbage Collection pressure on hot paths.
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
        switch (mode) {
            case CPU_MODE_IMP:
                cpu.resolvedAdr = 0;
                cpu.resolvedAdrh = 0;
                break;

            case CPU_MODE_IMM:
                cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                cpu.resolvedAdrh = 0;
                break;

            case CPU_MODE_IMMm: {
                if (cpu.m) {
                    cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    cpu.resolvedAdrh = 0;
                } else {
                    cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    cpu.resolvedAdrh = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                }
                break;
            }

            case CPU_MODE_IMMx: {
                if (cpu.x) {
                    cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    cpu.resolvedAdrh = 0;
                } else {
                    cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    cpu.resolvedAdrh = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                }
                break;
            }

            case CPU_MODE_IMMl: {
                cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                cpu.resolvedAdrh = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                break;
            }

            case CPU_MODE_DP: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++; 
                }
                cpu.resolvedAdr = (cpu.br[CPU_REG_DPR] + adr) & 0xffff;
                cpu.resolvedAdrh = (cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff;
                break;
            }

            case CPU_MODE_DPX: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                cpu.resolvedAdr = (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X]) & 0xffff;
                cpu.resolvedAdrh = (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X] + 1) & 0xffff;
                break;
            }

            case CPU_MODE_DPY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                cpu.resolvedAdr = (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_Y]) & 0xffff;
                cpu.resolvedAdrh = (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_Y] + 1) & 0xffff;
                break;
            }

            case CPU_MODE_IDP: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + pointer;
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + pointer + 1;
                break;
            }

            case CPU_MODE_IDX: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X]) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + pointer;
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + pointer + 1;
                break;
            }

            case CPU_MODE_IDY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_IDYr: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                if (((pointer >> 8) !== ((pointer + cpu.br[CPU_REG_Y]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++; 
                }
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_IDL: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                cpu.resolvedAdr = pointer;
                cpu.resolvedAdrh = pointer + 1;
                break;
            }

            case CPU_MODE_ILY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                cpu.resolvedAdr = pointer + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = pointer + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_SR: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                cpu.resolvedAdr = (cpu.br[CPU_REG_SP] + adr) & 0xffff;
                cpu.resolvedAdrh = (cpu.br[CPU_REG_SP] + adr + 1) & 0xffff;
                break;
            }

            case CPU_MODE_ISY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                let pointer = cpu.mem.read((cpu.br[CPU_REG_SP] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_SP] + adr + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_ABS: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + adr;
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + adr + 1;
                break;
            }

            case CPU_MODE_ABX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X] + 1;
                break;
            }

            case CPU_MODE_ABXr: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + cpu.br[CPU_REG_X]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X] + 1;
                break;
            }

            case CPU_MODE_ABY: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_ABYr: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + cpu.br[CPU_REG_Y]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }
                cpu.resolvedAdr = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y];
                cpu.resolvedAdrh = (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y] + 1;
                break;
            }

            case CPU_MODE_ABL: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 16;
                cpu.resolvedAdr = adr;
                cpu.resolvedAdrh = adr + 1;
                break;
            }

            case CPU_MODE_ALX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 16;
                cpu.resolvedAdr = adr + cpu.br[CPU_REG_X];
                cpu.resolvedAdrh = adr + cpu.br[CPU_REG_X] + 1;
                break;
            }

            case CPU_MODE_IND: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) + pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_IAX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | ((adr + cpu.br[CPU_REG_X]) & 0xffff));
                pointer |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | ((adr + cpu.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                cpu.resolvedAdr = (cpu.r[CPU_REG_K] << 16) + pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_IAL: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                pointer |= cpu.mem.read((adr + 2) & 0xffff) << 16;
                cpu.resolvedAdr = pointer;
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_REL: {
                const rel = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                cpu.resolvedAdr = cpu.getSigned(rel, true);
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_RLL: {
                let rel = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                rel |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                cpu.resolvedAdr = cpu.getSigned(rel, false);
                cpu.resolvedAdrh = 0;
                break;
            }

            case CPU_MODE_BM: {
                const dest = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                const src = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                cpu.resolvedAdr = dest;
                cpu.resolvedAdrh = src;
                break;
            }
        }
    }
}

// Global transitional alias
window.SnesCpuAddressing = SnesCpuAddressing;