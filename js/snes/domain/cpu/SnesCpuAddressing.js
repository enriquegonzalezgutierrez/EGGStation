/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAddressing (Addressing Mode Resolvers)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Resolves all 28 physical addressing modes of the Ricoh 5A22 CPU.
 * It decodes the effective memory address based on the current Program Counter,
 * WRAM layout, and Direct Page boundaries, returning high/low byte coordinates.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles CPU address translation and pointer decoding.
 */

class SnesCpuAddressing {
    /**
     * Translates coordinates to effective address boundaries.
     * @param {SnesCpu} cpu - Active CPU instance.
     * @param {number} opcode - Active execution instruction.
     * @param {number} mode - Addressing mode ID.
     */
    static getAdr(cpu, opcode, mode) {
        switch (mode) {
            case CPU_MODE_IMP:
                return [0, 0];

            case CPU_MODE_IMM:
                return [(cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++, 0];

            case CPU_MODE_IMMm: {
                if (cpu.m) {
                    return [(cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++, 0];
                } else {
                    const low = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    return [low, (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++];
                }
            }

            case CPU_MODE_IMMx: {
                if (cpu.x) {
                    return [(cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++, 0];
                } else {
                    const low = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                    return [low, (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++];
                }
            }

            case CPU_MODE_IMMl: {
                const low = (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++;
                return [low, (cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++];
            }

            case CPU_MODE_DP: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++; // Low byte not zero adds 1 cycle
                }
                return [(cpu.br[CPU_REG_DPR] + adr) & 0xffff, (cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff];
            }

            case CPU_MODE_DPX: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                return [(cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X]) & 0xffff, (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X] + 1) & 0xffff];
            }

            case CPU_MODE_DPY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                return [(cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_Y]) & 0xffff, (cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_Y] + 1) & 0xffff];
            }

            case CPU_MODE_IDP: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + pointer, (cpu.r[CPU_REG_DBR] << 16) + pointer + 1];
            }

            case CPU_MODE_IDX: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X]) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + cpu.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + pointer, (cpu.r[CPU_REG_DBR] << 16) + pointer + 1];
            }

            case CPU_MODE_IDY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y], (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_IDYr: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                if (((pointer >> 8) !== ((pointer + cpu.br[CPU_REG_Y]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++; // Adds 1 cycle on page crossed or X flag is 8-bit
                }
                return [(cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y], (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_IDL: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                return [pointer, pointer + 1];
            }

            case CPU_MODE_ILY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                if ((cpu.br[CPU_REG_DPR] & 0xff) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = cpu.mem.read((cpu.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                return [pointer + cpu.br[CPU_REG_Y], pointer + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_SR: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                return [(cpu.br[CPU_REG_SP] + adr) & 0xffff, (cpu.br[CPU_REG_SP] + adr + 1) & 0xffff];
            }

            case CPU_MODE_ISY: {
                const adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                let pointer = cpu.mem.read((cpu.br[CPU_REG_SP] + adr) & 0xffff);
                pointer |= (cpu.mem.read((cpu.br[CPU_REG_SP] + adr + 1) & 0xffff)) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y], (cpu.r[CPU_REG_DBR] << 16) + pointer + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABS: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + adr, (cpu.r[CPU_REG_DBR] << 16) + adr + 1];
            }

            case CPU_MODE_ABX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X], (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_ABXr: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + cpu.br[CPU_REG_X]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }
                return [(cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X], (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_ABY: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                return [(cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y], (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABYr: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + cpu.br[CPU_REG_Y]) >> 8)) || !cpu.x) {
                    cpu.cyclesLeft++;
                }
                return [(cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y], (cpu.r[CPU_REG_DBR] << 16) + adr + cpu.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABL: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 16;
                return [adr, adr + 1];
            }

            case CPU_MODE_ALX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 16;
                return [adr + cpu.br[CPU_REG_X], adr + cpu.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_IND: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                return [(cpu.r[CPU_REG_K] << 16) + pointer, 0];
            }

            case CPU_MODE_IAX: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | ((adr + cpu.br[CPU_REG_X]) & 0xffff));
                pointer |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | ((adr + cpu.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                return [(cpu.r[CPU_REG_K] << 16) + pointer, 0];
            }

            case CPU_MODE_IAL: {
                let adr = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                adr |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                let pointer = cpu.mem.read(adr);
                pointer |= cpu.mem.read((adr + 1) & 0xffff) << 8;
                pointer |= cpu.mem.read((adr + 2) & 0xffff) << 16;
                return [pointer, 0];
            }

            case CPU_MODE_REL: {
                const rel = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                return [cpu.getSigned(rel, true), 0];
            }

            case CPU_MODE_RLL: {
                let rel = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                rel |= cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++) << 8;
                return [cpu.getSigned(rel, false), 0];
            }

            case CPU_MODE_BM: {
                const dest = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                const src = cpu.mem.read((cpu.r[CPU_REG_K] << 16) | cpu.br[CPU_REG_PC]++);
                return [dest, src];
            }
            default:
                return [0, 0];
        }
    }
}

// Global transitional alias
window.SnesCpuAddressing = SnesCpuAddressing;