/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSpcAddressing (Sony SPC700 Audio CPU Addressing Modes)
 */

// Prefixed Scope Constants (Zero global collision risk, high performance)
const SPC_REG_A = 0;
const SPC_REG_X = 1;
const SPC_REG_Y = 2;
const SPC_REG_SP = 3;
const SPC_REG_PC = 0;

// Prefixed Addressing Modes
const SPC_MODE_IMP = 0;
const SPC_MODE_REL = 1;
const SPC_MODE_DP = 2;
const SPC_MODE_DPR = 3;
const SPC_MODE_ABS = 4;
const SPC_MODE_IND = 5;
const SPC_MODE_IDX = 6;
const SPC_MODE_IMM = 7;
const SPC_MODE_DPX = 8;
const SPC_MODE_ABX = 9;
const SPC_MODE_ABY = 10;
const SPC_MODE_IDY = 11;
const SPC_MODE_DD = 12;
const SPC_MODE_II = 13;
const SPC_MODE_DI = 14;
const SPC_MODE_DPY = 15;
const SPC_MODE_ABB = 16;
const SPC_MODE_DXR = 17;
const SPC_MODE_IAX = 18;
const SPC_MODE_IPI = 19;

class SnesSpcAddressing {
    /**
     * Resolves the effective address based on the addressing mode.
     * @param {SnesSpc} spc - The SnesSpc instance.
     * @param {number} mode - The addressing mode.
     * @returns {number[]} [address1, address2]
     */
    static resolve(spc, mode) {
        switch (mode) {
            case SPC_MODE_IMP:
                return [0, 0];
            case SPC_MODE_REL: {
                const rel = spc.mem.read(spc.br[SPC_REG_PC]++);
                return [spc.getSigned(rel), 0];
            }
            case SPC_MODE_DP: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                return [adr | page, ((adr + 1) & 0xff) | page];
            }
            case SPC_MODE_DPR: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const rel = spc.mem.read(spc.br[SPC_REG_PC]++);
                return [adr | (spc.p ? 0x100 : 0), spc.getSigned(rel)];
            }
            case SPC_MODE_ABS: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                return [adr, 0];
            }
            case SPC_MODE_IND:
                return [spc.r[SPC_REG_X] | (spc.p ? 0x100 : 0), 0];
            case SPC_MODE_IDX: {
                const pointer = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                let adr = spc.mem.read(((pointer + spc.r[SPC_REG_X]) & 0xff) | page);
                adr |= spc.mem.read(((pointer + 1 + spc.r[SPC_REG_X]) & 0xff) | page) << 8;
                return [adr, 0];
            }
            case SPC_MODE_IMM:
                return [spc.br[SPC_REG_PC]++, 0];
            case SPC_MODE_DPX: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                return [((adr + spc.r[SPC_REG_X]) & 0xff) | (spc.p ? 0x100 : 0), 0];
            }
            case SPC_MODE_ABX: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                return [(adr + spc.r[SPC_REG_X]) & 0xffff, 0];
            }
            case SPC_MODE_ABY: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                return [(adr + spc.r[SPC_REG_Y]) & 0xffff, 0];
            }
            case SPC_MODE_IDY: {
                const pointer = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                let adr = spc.mem.read(pointer | page);
                adr |= spc.mem.read(((pointer + 1) & 0xff) | page) << 8;
                return [(adr + spc.r[SPC_REG_Y]) & 0xffff, 0];
            }
            case SPC_MODE_DD: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const adr2 = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                return [adr | page, adr2 | page];
            }
            case SPC_MODE_II: {
                const page = spc.p ? 0x100 : 0;
                return [spc.r[SPC_REG_Y] | page, spc.r[SPC_REG_X] | page];
            }
            case SPC_MODE_DI: {
                const imm = spc.br[SPC_REG_PC]++;
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                return [imm, adr | (spc.p ? 0x100 : 0)];
            }
            case SPC_MODE_DPY: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                return [((adr + spc.r[SPC_REG_Y]) & 0xff) | (spc.p ? 0x100 : 0), 0];
            }
            case SPC_MODE_ABB: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                return [adr & 0x1fff, adr >> 13];
            }
            case SPC_MODE_DXR: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const rel = spc.getSigned(spc.mem.read(spc.br[SPC_REG_PC]++));
                return [((adr + spc.r[SPC_REG_X]) & 0xff) | (spc.p ? 0x100 : 0), rel];
            }
            case SPC_MODE_IAX: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                let radr = spc.mem.read((adr + spc.r[SPC_REG_X]) & 0xffff);
                radr |= spc.mem.read((adr + spc.r[SPC_REG_X] + 1) & 0xffff) << 8;
                return [radr, 0];
            }
            case SPC_MODE_IPI:
                return [spc.r[SPC_REG_X]++ | (spc.p ? 0x100 : 0), 0];
            default:
                return [0, 0];
        }
    }
}

window.SnesSpcAddressing = SnesSpcAddressing;
