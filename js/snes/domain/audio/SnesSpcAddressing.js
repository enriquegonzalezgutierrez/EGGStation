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
const SPC_MODE_DP  = 2;
const SPC_MODE_DPR = 3;
const SPC_MODE_ABS = 4;
const SPC_MODE_IND = 5;
const SPC_MODE_IDX = 6;
const SPC_MODE_IMM = 7;
const SPC_MODE_DPX = 8;
const SPC_MODE_ABX = 9;
const SPC_MODE_ABY = 10;
const SPC_MODE_IDY = 11;
const SPC_MODE_DD  = 12;
const SPC_MODE_II  = 13;
const SPC_MODE_DI  = 14;
const SPC_MODE_DPY = 15;
const SPC_MODE_ABB = 16;
const SPC_MODE_DXR = 17;
const SPC_MODE_IAX = 18;
const SPC_MODE_IPI = 19;

/**
 * Module-level result buffer — allocated ONCE, reused on every resolve() call.
 * Eliminates ~1 million array heap allocations per second in the SPC hot path.
 * Safe because cycle() reads eff[0]/eff[1] as primitive numbers before any
 * subsequent resolve() call could overwrite the buffer.
 */
const _SPC_EFF = [0, 0];

class SnesSpcAddressing {
    /**
     * Resolves the effective address for the given addressing mode.
     * Returns the shared module-level buffer _SPC_EFF = [adr, adrh].
     * @param {SnesSpc} spc  - The SnesSpc instance.
     * @param {number}  mode - The addressing mode constant.
     * @returns {number[]} Shared result buffer — do NOT hold a reference across calls.
     */
    static resolve(spc, mode) {
        switch (mode) {
            case SPC_MODE_IMP:
                _SPC_EFF[0] = 0; _SPC_EFF[1] = 0;
                return _SPC_EFF;

            case SPC_MODE_REL: {
                const rel = spc.mem.read(spc.br[SPC_REG_PC]++);
                _SPC_EFF[0] = spc.getSigned(rel); _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_DP: {
                const adr  = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                _SPC_EFF[0] = adr | page;
                _SPC_EFF[1] = ((adr + 1) & 0xff) | page;
                return _SPC_EFF;
            }
            case SPC_MODE_DPR: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const rel = spc.mem.read(spc.br[SPC_REG_PC]++);
                _SPC_EFF[0] = adr | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = spc.getSigned(rel);
                return _SPC_EFF;
            }
            case SPC_MODE_ABS: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr    |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                _SPC_EFF[0] = adr; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_IND:
                _SPC_EFF[0] = spc.r[SPC_REG_X] | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = 0;
                return _SPC_EFF;

            case SPC_MODE_IDX: {
                const pointer = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page    = spc.p ? 0x100 : 0;
                let adr = spc.mem.read(((pointer + spc.r[SPC_REG_X])     & 0xff) | page);
                adr    |= spc.mem.read(((pointer + spc.r[SPC_REG_X] + 1) & 0xff) | page) << 8;
                _SPC_EFF[0] = adr; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_IMM:
                _SPC_EFF[0] = spc.br[SPC_REG_PC]++; _SPC_EFF[1] = 0;
                return _SPC_EFF;

            case SPC_MODE_DPX: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                _SPC_EFF[0] = ((adr + spc.r[SPC_REG_X]) & 0xff) | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_ABX: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr    |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                _SPC_EFF[0] = (adr + spc.r[SPC_REG_X]) & 0xffff; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_ABY: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr    |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                _SPC_EFF[0] = (adr + spc.r[SPC_REG_Y]) & 0xffff; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_IDY: {
                const pointer = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page    = spc.p ? 0x100 : 0;
                let adr = spc.mem.read(pointer | page);
                adr    |= spc.mem.read(((pointer + 1) & 0xff) | page) << 8;
                _SPC_EFF[0] = (adr + spc.r[SPC_REG_Y]) & 0xffff; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_DD: {
                const adr  = spc.mem.read(spc.br[SPC_REG_PC]++);
                const adr2 = spc.mem.read(spc.br[SPC_REG_PC]++);
                const page = spc.p ? 0x100 : 0;
                _SPC_EFF[0] = adr | page; _SPC_EFF[1] = adr2 | page;
                return _SPC_EFF;
            }
            case SPC_MODE_II: {
                const page = spc.p ? 0x100 : 0;
                _SPC_EFF[0] = spc.r[SPC_REG_Y] | page;
                _SPC_EFF[1] = spc.r[SPC_REG_X] | page;
                return _SPC_EFF;
            }
            case SPC_MODE_DI: {
                const imm = spc.br[SPC_REG_PC]++;
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                _SPC_EFF[0] = imm; _SPC_EFF[1] = adr | (spc.p ? 0x100 : 0);
                return _SPC_EFF;
            }
            case SPC_MODE_DPY: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                _SPC_EFF[0] = ((adr + spc.r[SPC_REG_Y]) & 0xff) | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_ABB: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr    |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                _SPC_EFF[0] = adr & 0x1fff; _SPC_EFF[1] = adr >> 13;
                return _SPC_EFF;
            }
            case SPC_MODE_DXR: {
                const adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                const rel = spc.getSigned(spc.mem.read(spc.br[SPC_REG_PC]++));
                _SPC_EFF[0] = ((adr + spc.r[SPC_REG_X]) & 0xff) | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = rel;
                return _SPC_EFF;
            }
            case SPC_MODE_IAX: {
                let adr = spc.mem.read(spc.br[SPC_REG_PC]++);
                adr    |= spc.mem.read(spc.br[SPC_REG_PC]++) << 8;
                let radr = spc.mem.read((adr + spc.r[SPC_REG_X])     & 0xffff);
                radr    |= spc.mem.read((adr + spc.r[SPC_REG_X] + 1) & 0xffff) << 8;
                _SPC_EFF[0] = radr; _SPC_EFF[1] = 0;
                return _SPC_EFF;
            }
            case SPC_MODE_IPI:
                _SPC_EFF[0] = spc.r[SPC_REG_X]++ | (spc.p ? 0x100 : 0);
                _SPC_EFF[1] = 0;
                return _SPC_EFF;

            default:
                _SPC_EFF[0] = 0; _SPC_EFF[1] = 0;
                return _SPC_EFF;
        }
    }
}

window.SnesSpcAddressing = SnesSpcAddressing;
