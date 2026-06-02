/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSpc (Sony SPC700 Audio CPU - Unified & Scoped)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the physical Sony SPC700 co-processor.
 * Uses uniquely prefixed constants (SPC_) to prevent global lexical scope
 * collisions with the main CPU (65816) when loaded via standard script tags.
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

class SnesSpc {
    constructor(mem) {
        this.mem = mem;

        // Core Registers
        this.r = new Uint8Array(4);
        this.br = new Uint16Array(1);

        // CPU Status Flags
        this.n = false;
        this.v = false;
        this.p = false;
        this.b = false;
        this.h = false;
        this.i = false;
        this.z = false;
        this.c = false;

        this.cyclesLeft = 0;

        // Static Addressing Modes Decoder Table
        this.modes = [
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMP, SPC_MODE_ABS, SPC_MODE_IMP,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_ABS, SPC_MODE_IAX,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMP, SPC_MODE_DPR, SPC_MODE_REL,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_ABS,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMP, SPC_MODE_ABS, SPC_MODE_DP ,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_ABS, SPC_MODE_ABS,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMP, SPC_MODE_DPR, SPC_MODE_IMP,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_IMP,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMM, SPC_MODE_IMP, SPC_MODE_DI ,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_IMP,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_DD , SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMM, SPC_MODE_IMP, SPC_MODE_IPI,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DI , SPC_MODE_II , SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_IPI,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_ABS, SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMM, SPC_MODE_IMP, SPC_MODE_IMP,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DP , SPC_MODE_DPY, SPC_MODE_DP , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DXR, SPC_MODE_IMP,
            SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IND, SPC_MODE_IDX, SPC_MODE_IMM, SPC_MODE_ABS, SPC_MODE_ABB, SPC_MODE_DP , SPC_MODE_ABS, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_IMP,
            SPC_MODE_REL, SPC_MODE_IMP, SPC_MODE_DP , SPC_MODE_DPR, SPC_MODE_DPX, SPC_MODE_ABX, SPC_MODE_ABY, SPC_MODE_IDY, SPC_MODE_DP , SPC_MODE_DPY, SPC_MODE_DD , SPC_MODE_DPX, SPC_MODE_IMP, SPC_MODE_IMP, SPC_MODE_REL, SPC_MODE_IMP
        ];

        // Static Opcode Instruction Cycle Durations
        this.cycles = [
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 6, 8,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 4, 6,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 5, 4,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 3, 8,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 6, 6,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 4, 5, 2, 2, 4, 3,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 5, 5,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 6,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 2, 4, 5,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 12,5,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 2, 4, 4,
            2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 4,
            2, 8, 4, 5, 4, 5, 4, 7, 2, 5, 6, 4, 5, 2, 4, 9,
            2, 8, 4, 5, 5, 6, 6, 7, 4, 5, 5, 5, 2, 2, 6, 3,
            2, 8, 4, 5, 3, 4, 3, 6, 2, 4, 5, 3, 4, 3, 4, 3,
            2, 8, 4, 5, 4, 5, 5, 6, 3, 4, 5, 4, 2, 2, 4, 3
        ];

        this.bindInstructionMap();
        this.reset();
    }

    reset() {
        this.r[SPC_REG_A] = 0;
        this.r[SPC_REG_X] = 0;
        this.r[SPC_REG_Y] = 0;
        this.r[SPC_REG_SP] = 0;

        if (this.mem.read) {
            this.br[SPC_REG_PC] = this.mem.read(0xfffe) | (this.mem.read(0xffff) << 8);
        } else {
            this.br[SPC_REG_PC] = 0;
        }

        this.n = false;
        this.v = false;
        this.p = false;
        this.b = false;
        this.h = false;
        this.i = false;
        this.z = false;
        this.c = false;

        this.cyclesLeft = 7; 
    }

    cycle() {
        if (this.cyclesLeft === 0) {
            const instr = this.mem.read(this.br[SPC_REG_PC]++);
            const mode = this.modes[instr];
            this.cyclesLeft = this.cycles[instr];

            try {
                const eff = this.getAdr(mode);
                this.functions[instr](eff[0], eff[1], instr);
            } catch (e) {
                console.error(`[SPC700] Execution Exception at PC $${this.br[SPC_REG_PC].toString(16)}:`, e);
            }
        }
        this.cyclesLeft--;
    }

    getP() {
        let value = 0;
        value |= this.n ? 0x80 : 0;
        value |= this.v ? 0x40 : 0;
        value |= this.p ? 0x20 : 0;
        value |= this.b ? 0x10 : 0;
        value |= this.h ? 0x08 : 0;
        value |= this.i ? 0x04 : 0;
        value |= this.z ? 0x02 : 0;
        value |= this.c ? 0x01 : 0;
        return value;
    }

    setP(value) {
        this.n = (value & 0x80) > 0;
        this.v = (value & 0x40) > 0;
        this.p = (value & 0x20) > 0;
        this.b = (value & 0x10) > 0;
        this.h = (value & 0x08) > 0;
        this.i = (value & 0x04) > 0;
        this.z = (value & 0x02) > 0;
        this.c = (value & 0x01) > 0;
    }

    setZandN(val) {
        const masked = val & 0xff;
        this.n = masked > 0x7f;
        this.z = masked === 0;
    }

    getSigned(val) {
        return val > 127 ? -(256 - val) : val;
    }

    doBranch(check, rel) {
        if (check) {
            this.br[SPC_REG_PC] += rel;
            this.cyclesLeft += 2;
        }
    }

    push(value) {
        this.mem.write(this.r[SPC_REG_SP] | 0x100, value);
        this.r[SPC_REG_SP]--;
    }

    pop() {
        this.r[SPC_REG_SP]++;
        return this.mem.read(this.r[SPC_REG_SP] | 0x100);
    }

    // ========================================================================
    // ADDRESSING MODE TRANSLATIONS
    // ========================================================================

    getAdr(mode) {
        switch (mode) {
            case SPC_MODE_IMP:
                return [0, 0];
            case SPC_MODE_REL: {
                const rel = this.mem.read(this.br[SPC_REG_PC]++);
                return [this.getSigned(rel), 0];
            }
            case SPC_MODE_DP: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                const page = this.p ? 0x100 : 0;
                return [adr | page, ((adr + 1) & 0xff) | page];
            }
            case SPC_MODE_DPR: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                const rel = this.mem.read(this.br[SPC_REG_PC]++);
                return [adr | (this.p ? 0x100 : 0), this.getSigned(rel)];
            }
            case SPC_MODE_ABS: {
                let adr = this.mem.read(this.br[SPC_REG_PC]++);
                adr |= this.mem.read(this.br[SPC_REG_PC]++) << 8;
                return [adr, 0];
            }
            case SPC_MODE_IND:
                return [this.r[SPC_REG_X] | (this.p ? 0x100 : 0), 0];
            case SPC_MODE_IDX: {
                const pointer = this.mem.read(this.br[SPC_REG_PC]++);
                const page = this.p ? 0x100 : 0;
                let adr = this.mem.read(((pointer + this.r[SPC_REG_X]) & 0xff) | page);
                adr |= this.mem.read(((pointer + 1 + this.r[SPC_REG_X]) & 0xff) | page) << 8;
                return [adr, 0];
            }
            case SPC_MODE_IMM:
                return [this.br[SPC_REG_PC]++, 0];
            case SPC_MODE_DPX: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                return [((adr + this.r[SPC_REG_X]) & 0xff) | (this.p ? 0x100 : 0), 0];
            }
            case SPC_MODE_ABX: {
                let adr = this.mem.read(this.br[SPC_REG_PC]++);
                adr |= this.mem.read(this.br[SPC_REG_PC]++) << 8;
                return [(adr + this.r[SPC_REG_X]) & 0xffff, 0];
            }
            case SPC_MODE_ABY: {
                let adr = this.mem.read(this.br[SPC_REG_PC]++);
                adr |= this.mem.read(this.br[SPC_REG_PC]++) << 8;
                return [(adr + this.r[SPC_REG_Y]) & 0xffff, 0];
            }
            case SPC_MODE_IDY: {
                const pointer = this.mem.read(this.br[SPC_REG_PC]++);
                const page = this.p ? 0x100 : 0;
                let adr = this.mem.read(pointer | page);
                adr |= this.mem.read(((pointer + 1) & 0xff) | page) << 8;
                return [(adr + this.r[SPC_REG_Y]) & 0xffff, 0];
            }
            case SPC_MODE_DD: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                const adr2 = this.mem.read(this.br[SPC_REG_PC]++);
                const page = this.p ? 0x100 : 0;
                return [adr | page, adr2 | page];
            }
            case SPC_MODE_II: {
                const page = this.p ? 0x100 : 0;
                return [this.r[SPC_REG_Y] | page, this.r[SPC_REG_X] | page];
            }
            case SPC_MODE_DI: {
                const imm = this.br[SPC_REG_PC]++;
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                return [imm, adr | (this.p ? 0x100 : 0)];
            }
            case SPC_MODE_DPY: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                return [((adr + this.r[SPC_REG_Y]) & 0xff) | (this.p ? 0x100 : 0), 0];
            }
            case SPC_MODE_ABB: {
                let adr = this.mem.read(this.br[SPC_REG_PC]++);
                adr |= this.mem.read(this.br[SPC_REG_PC]++) << 8;
                return [adr & 0x1fff, adr >> 13];
            }
            case SPC_MODE_DXR: {
                const adr = this.mem.read(this.br[SPC_REG_PC]++);
                const rel = this.getSigned(this.mem.read(this.br[SPC_REG_PC]++));
                return [((adr + this.r[SPC_REG_X]) & 0xff) | (this.p ? 0x100 : 0), rel];
            }
            case SPC_MODE_IAX: {
                let adr = this.mem.read(this.br[SPC_REG_PC]++);
                adr |= this.mem.read(this.br[SPC_REG_PC]++) << 8;
                let radr = this.mem.read((adr + this.r[SPC_REG_X]) & 0xffff);
                radr |= this.mem.read((adr + this.r[SPC_REG_X] + 1) & 0xffff) << 8;
                return [radr, 0];
            }
            case SPC_MODE_IPI:
                return [this.r[SPC_REG_X]++ | (this.p ? 0x100 : 0), 0];
            default:
                return [0, 0];
        }
    }

    // ========================================================================
    // CORE CPU OPCODES HANDLERS
    // ========================================================================

    nop(adr, adrh, instr) {}

    clrp() { this.p = false; }
    setp() { this.p = true; }
    clrc() { this.c = false; }
    setc() { this.c = true; }
    ei() { this.i = true; }
    di() { this.i = false; }
    clrv() { this.v = false; this.h = false; }

    bpl(adr) { this.doBranch(!this.n, adr); }
    bmi(adr) { this.doBranch(this.n, adr); }
    bvc(adr) { this.doBranch(!this.v, adr); }
    bvs(adr) { this.doBranch(this.v, adr); }
    bcc(adr) { this.doBranch(!this.c, adr); }
    bcs(adr) { this.doBranch(this.c, adr); }
    bne(adr) { this.doBranch(!this.z, adr); }
    beq(adr) { this.doBranch(this.z, adr); }

    tcall(adr, adrh, instr) {
        this.push(this.br[SPC_REG_PC] >> 8);
        this.push(this.br[SPC_REG_PC] & 0xff);
        const padr = 0xffc0 + ((15 - (instr >> 4)) << 1);
        this.br[SPC_REG_PC] = this.mem.read(padr) | (this.mem.read(padr + 1) << 8);
    }

    set1(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= (1 << (instr >> 5));
        this.mem.write(adr, value);
    }

    clr1(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value &= ~(1 << (instr >> 5));
        this.mem.write(adr, value);
    }

    bbs(adr, adrh, instr) {
        const value = this.mem.read(adr);
        this.doBranch((value & (1 << (instr >> 5))) > 0, adrh);
    }

    bbc(adr, adrh, instr) {
        const value = this.mem.read(adr);
        this.doBranch((value & (1 << (instr >> 5))) === 0, adrh);
    }

    or(adr) {
        this.r[SPC_REG_A] |= this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_A]);
    }

    orm(adr, adrh) {
        let value = this.mem.read(adrh);
        value |= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    and(adr) {
        this.r[SPC_REG_A] &= this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_A]);
    }

    andm(adr, adrh) {
        let value = this.mem.read(adrh);
        value &= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    eor(adr) {
        this.r[SPC_REG_A] ^= this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_A]);
    }

    eorm(adr, adrh) {
        let value = this.mem.read(adrh);
        value ^= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    cmp(adr) {
        const value = this.mem.read(adr) ^ 0xff;
        const result = this.r[SPC_REG_A] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    cmpm(adr, adrh) {
        const value = this.mem.read(adrh);
        const result = value + (this.mem.read(adr) ^ 0xff) + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    cmpx(adr) {
        const value = this.mem.read(adr) ^ 0xff;
        const result = this.r[SPC_REG_X] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    cmpy(adr) {
        const value = this.mem.read(adr) ^ 0xff;
        const result = this.r[SPC_REG_Y] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    adc(adr) {
        const value = this.mem.read(adr);
        const result = this.r[SPC_REG_A] + value + (this.c ? 1 : 0);
        this.v = ((this.r[SPC_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        this.h = ((this.r[SPC_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.r[SPC_REG_A] = result;
    }

    adcm(adr, adrh) {
        const value = this.mem.read(adr);
        const addedTo = this.mem.read(adrh);
        const result = addedTo + value + (this.c ? 1 : 0);
        this.v = ((addedTo & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        this.h = ((addedTo & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.mem.write(adrh, result & 0xff);
    }

    sbc(adr) {
        const value = this.mem.read(adr) ^ 0xff;
        const result = this.r[SPC_REG_A] + value + (this.c ? 1 : 0);
        this.v = ((this.r[SPC_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        this.h = ((this.r[SPC_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.r[SPC_REG_A] = result;
    }

    sbcm(adr, adrh) {
        const value = this.mem.read(adr) ^ 0xff;
        const addedTo = this.mem.read(adrh);
        const result = addedTo + value + (this.c ? 1 : 0);
        this.v = ((addedTo & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        this.h = ((addedTo & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.mem.write(adrh, result & 0xff);
    }

    movs(adr, adrh, instr) {
        if (instr !== 0xaf) this.mem.read(adr);
        this.mem.write(adr, this.r[SPC_REG_A]);
    }

    movsx(adr) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[SPC_REG_X]);
    }

    movsy(adr) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[SPC_REG_Y]);
    }

    mov(adr) {
        this.r[SPC_REG_A] = this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_A]);
    }

    movx(adr) {
        this.r[SPC_REG_X] = this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_X]);
    }

    movy(adr) {
        this.r[SPC_REG_Y] = this.mem.read(adr);
        this.setZandN(this.r[SPC_REG_Y]);
    }

    or1(adr, adrh) {
        const bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = ((this.c ? 1 : 0) | bit) > 0;
    }

    or1n(adr, adrh) {
        const bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = ((this.c ? 1 : 0) | (bit > 0 ? 0 : 1)) > 0;
    }

    and1(adr, adrh) {
        const bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = ((this.c ? 1 : 0) & bit) > 0;
    }

    and1n(adr, adrh) {
        const bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = ((this.c ? 1 : 0) & (bit > 0 ? 0 : 1)) > 0;
    }

    eor1(adr, adrh) {
        const bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = ((this.c ? 1 : 0) ^ bit) > 0;
    }

    mov1(adr, adrh) {
        this.c = ((this.mem.read(adr) >> adrh) & 0x1) > 0;
    }

    mov1s(adr, adrh) {
        let value = this.mem.read(adr);
        const bit = 1 << adrh;
        value = this.c ? (value | bit) : (value & ~bit);
        this.mem.write(adr, value);
    }

    not1(adr, adrh) {
        const bit = 1 << adrh;
        this.mem.write(adr, this.mem.read(adr) ^ bit);
    }

    decw(adr, adrh) {
        let value = this.mem.read(adr) | (this.mem.read(adrh) << 8);
        value = (value - 1) & 0xffff;
        this.z = value === 0;
        this.n = (value & 0x8000) > 0;
        this.mem.write(adr, value & 0xff);
        this.mem.write(adrh, value >> 8);
    }

    incw(adr, adrh) {
        let value = this.mem.read(adr) | (this.mem.read(adrh) << 8);
        value = (value + 1) & 0xffff;
        this.z = value === 0;
        this.n = (value & 0x8000) > 0;
        this.mem.write(adr, value & 0xff);
        this.mem.write(adrh, value >> 8);
    }

    cmpw(adr, adrh) {
        const value = this.mem.read(adr) | (this.mem.read(adrh) << 8);
        const addTo = (this.r[SPC_REG_Y] << 8) | this.r[SPC_REG_A];
        const result = addTo + (value ^ 0xffff) + 1;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
    }

    addw(adr, adrh) {
        const value = this.mem.read(adr) | (this.mem.read(adrh) << 8);
        const addTo = (this.r[SPC_REG_Y] << 8) | this.r[SPC_REG_A];
        const result = addTo + value;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
        this.v = ((addTo & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
        this.h = ((addTo & 0xfff) + (value & 0xfff)) > 0x0fff;
        this.r[SPC_REG_A] = result & 0xff;
        this.r[SPC_REG_Y] = (result & 0xff00) >> 8;
    }

    subw(adr, adrh) {
        let value = this.mem.read(adr) | (this.mem.read(adrh) << 8);
        value ^= 0xffff;
        const addTo = (this.r[SPC_REG_Y] << 8) | this.r[SPC_REG_A];
        const result = addTo + value + 1;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
        this.v = ((addTo & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
        this.h = ((addTo & 0xfff) + (value & 0xfff) + 1) > 0xfff;
        this.r[SPC_REG_A] = result & 0xff;
        this.r[SPC_REG_Y] = (result & 0xff00) >> 8;
    }

    movw(adr, adrh) {
        this.r[SPC_REG_A] = this.mem.read(adr);
        this.r[SPC_REG_Y] = this.mem.read(adrh);
        this.z = this.r[SPC_REG_A] === 0 && this.r[SPC_REG_Y] === 0;
        this.n = (this.r[SPC_REG_Y] & 0x80) > 0;
    }

    movws(adr, adrh) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[SPC_REG_A]);
        this.mem.write(adrh, this.r[SPC_REG_Y]);
    }

    movm(adr, adrh, instr) {
        if (instr === 0x8f) this.mem.read(adrh);
        this.mem.write(adrh, this.mem.read(adr));
    }

    asl(adr) {
        let value = this.mem.read(adr);
        this.c = (value & 0x80) > 0;
        value <<= 1;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    asla() {
        this.c = (this.r[SPC_REG_A] & 0x80) > 0;
        this.r[SPC_REG_A] <<= 1;
        this.setZandN(this.r[SPC_REG_A]);
    }

    rol(adr) {
        let value = this.mem.read(adr);
        const carry = (value & 0x80) > 0;
        value = (value << 1) | (this.c ? 1 : 0);
        this.c = carry > 0;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    rola() {
        const carry = (this.r[SPC_REG_A] & 0x80) > 0;
        this.r[SPC_REG_A] = (this.r[SPC_REG_A] << 1) | (this.c ? 1 : 0);
        this.c = carry > 0;
        this.setZandN(this.r[SPC_REG_A]);
    }

    lsr(adr) {
        let value = this.mem.read(adr);
        this.c = (value & 0x1) > 0;
        value >>= 1;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    lsra() {
        this.c = (this.r[SPC_REG_A] & 0x1) > 0;
        this.r[SPC_REG_A] >>= 1;
        this.setZandN(this.r[SPC_REG_A]);
    }

    ror(adr) {
        let value = this.mem.read(adr);
        const carry = (value & 0x1) > 0;
        value = (value >> 1) | (this.c ? 0x80 : 0);
        this.c = carry > 0;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    rora() {
        const carry = (this.r[SPC_REG_A] & 0x1) > 0;
        this.r[SPC_REG_A] = (this.r[SPC_REG_A] >> 1) | (this.c ? 0x80 : 0);
        this.c = carry > 0;
        this.setZandN(this.r[SPC_REG_A]);
    }

    inc(adr) {
        const value = (this.mem.read(adr) + 1) & 0xff;
        this.setZandN(value);
        this.mem.write(adr, value);
    }

    inca() {
        this.r[SPC_REG_A]++;
        this.setZandN(this.r[SPC_REG_A]);
    }

    incx() {
        this.r[SPC_REG_X]++;
        this.setZandN(this.r[SPC_REG_X]);
    }

    incy() {
        this.r[SPC_REG_Y]++;
        this.setZandN(this.r[SPC_REG_Y]);
    }

    dec(adr) {
        const value = (this.mem.read(adr) - 1) & 0xff;
        this.setZandN(value);
        this.mem.write(adr, value);
    }

    deca() {
        this.r[SPC_REG_A]--;
        this.setZandN(this.r[SPC_REG_A]);
    }

    decx() {
        this.r[SPC_REG_X]--;
        this.setZandN(this.r[SPC_REG_X]);
    }

    decy() {
        this.r[SPC_REG_Y]--;
        this.setZandN(this.r[SPC_REG_Y]);
    }

    pushp() { this.push(this.getP()); }
    pusha() { this.push(this.r[SPC_REG_A]); }
    pushx() { this.push(this.r[SPC_REG_X]); }
    pushy() { this.push(this.r[SPC_REG_Y]); }

    movxa() {
        this.r[SPC_REG_X] = this.r[SPC_REG_A];
        this.setZandN(this.r[SPC_REG_X]);
    }

    movax() {
        this.r[SPC_REG_A] = this.r[SPC_REG_X];
        this.setZandN(this.r[SPC_REG_A]);
    }

    movxp() {
        this.r[SPC_REG_X] = this.r[SPC_REG_SP];
        this.setZandN(this.r[SPC_REG_X]);
    }

    movpx() { this.r[SPC_REG_SP] = this.r[SPC_REG_X]; }

    movay() {
        this.r[SPC_REG_A] = this.r[SPC_REG_Y];
        this.setZandN(this.r[SPC_REG_A]);
    }

    movya() {
        this.r[SPC_REG_Y] = this.r[SPC_REG_A];
        this.setZandN(this.r[SPC_REG_Y]);
    }

    notc() { this.c = !this.c; }

    tset1(adr) {
        const value = this.mem.read(adr);
        const result = this.r[SPC_REG_A] + (value ^ 0xff) + 1;
        this.setZandN(result);
        this.mem.write(adr, value | this.r[SPC_REG_A]);
    }

    tclr1(adr) {
        const value = this.mem.read(adr);
        const result = this.r[SPC_REG_A] + (value ^ 0xff) + 1;
        this.setZandN(result);
        this.mem.write(adr, value & ~this.r[SPC_REG_A]);
    }

    cbne(adr, adrh) {
        const value = this.mem.read(adr) ^ 0xff;
        const result = this.r[SPC_REG_A] + value + 1;
        this.doBranch((result & 0xff) !== 0, adrh);
    }

    dbnz(adr, adrh) {
        const value = (this.mem.read(adr) - 1) & 0xff;
        this.mem.write(adr, value);
        this.doBranch(value !== 0, adrh);
    }

    dbnzy(adr) {
        this.r[SPC_REG_Y]--;
        this.doBranch(this.r[SPC_REG_Y] !== 0, adr);
    }

    popp() { this.setP(this.pop()); }
    popa() { this.r[SPC_REG_A] = this.pop(); }
    popx() { this.r[SPC_REG_X] = this.pop(); }
    popy() { this.r[SPC_REG_Y] = this.pop(); }

    brk() {
        this.push(this.br[SPC_REG_PC] >> 8);
        this.push(this.br[SPC_REG_PC] & 0xff);
        this.push(this.getP());
        this.i = false;
        this.b = true;
        this.br[SPC_REG_PC] = this.mem.read(0xffde) | (this.mem.read(0xffdf) << 8);
    }

    jmp(adr) { this.br[SPC_REG_PC] = adr; }
    bra(adr) { this.br[SPC_REG_PC] += adr; }

    call(adr) {
        this.push(this.br[SPC_REG_PC] >> 8);
        this.push(this.br[SPC_REG_PC] & 0xff);
        this.br[SPC_REG_PC] = adr;
    }

    pcall(adr) {
        this.push(this.br[SPC_REG_PC] >> 8);
        this.push(this.br[SPC_REG_PC] & 0xff);
        this.br[SPC_REG_PC] = 0xff00 + (adr & 0xff);
    }

    ret() {
        this.br[SPC_REG_PC] = this.pop();
        this.br[SPC_REG_PC] |= this.pop() << 8;
    }

    reti() {
        this.setP(this.pop());
        this.br[SPC_REG_PC] = this.pop();
        this.br[SPC_REG_PC] |= this.pop() << 8;
    }

    xcn() {
        this.r[SPC_REG_A] = (this.r[SPC_REG_A] >> 4) | (this.r[SPC_REG_A] << 4);
        this.setZandN(this.r[SPC_REG_A]);
    }

    sleep() { this.br[SPC_REG_PC]--; }
    stop() { this.br[SPC_REG_PC]--; }

    mul() {
        const result = this.r[SPC_REG_Y] * this.r[SPC_REG_A];
        this.r[SPC_REG_A] = result & 0xff;
        this.r[SPC_REG_Y] = (result & 0xff00) >> 8;
        this.setZandN(this.r[SPC_REG_Y]);
    }

    div() {
        const value = this.r[SPC_REG_A] | (this.r[SPC_REG_Y] << 8);
        let result = 0xffff;
        let mod = value & 0xff;
        if (this.r[SPC_REG_X] !== 0) {
            result = (value / this.r[SPC_REG_X]) & 0xffff;
            mod = value % this.r[SPC_REG_X];
        }
        this.v = result > 0xff;
        this.h = (this.r[SPC_REG_X] & 0xf) <= (this.r[SPC_REG_Y] & 0xf);
        this.r[SPC_REG_A] = result;
        this.r[SPC_REG_Y] = mod;
        this.setZandN(this.r[SPC_REG_A]);
    }

    daa() {
        if (this.r[SPC_REG_A] > 0x99 || this.c) {
            this.r[SPC_REG_A] += 0x60;
            this.c = true;
        }
        if ((this.r[SPC_REG_A] & 0xf) > 9 || this.h) {
            this.r[SPC_REG_A] += 6;
        }
        this.setZandN(this.r[SPC_REG_A]);
    }

    das() {
        if (this.r[SPC_REG_A] > 0x99 || !this.c) {
            this.r[SPC_REG_A] -= 0x60;
            this.c = false;
        }
        if ((this.r[SPC_REG_A] & 0xf) > 9 || !this.h) {
            this.r[SPC_REG_A] -= 6;
        }
        this.setZandN(this.r[SPC_REG_A]);
    }

    /**
     * Binds internal CPU opcode handling table statically.
     */
    bindInstructionMap() {
        this.functions = [
            this.nop.bind(this),   this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.or.bind(this),    this.or.bind(this),    this.or.bind(this),    this.or.bind(this),    this.or.bind(this),    this.orm.bind(this),   this.or1.bind(this),   this.asl.bind(this),   this.asl.bind(this),   this.pushp.bind(this), this.tset1.bind(this), this.brk.bind(this),
            this.bpl.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.or.bind(this),    this.or.bind(this),    this.or.bind(this),    this.or.bind(this),    this.orm.bind(this),   this.orm.bind(this),   this.decw.bind(this),  this.asl.bind(this),   this.asla.bind(this),  this.decx.bind(this),  this.cmpx.bind(this),  this.jmp.bind(this),
            this.clrp.bind(this),  this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.and.bind(this),   this.and.bind(this),   this.and.bind(this),   this.and.bind(this),   this.and.bind(this),   this.andm.bind(this),  this.or1n.bind(this),  this.rol.bind(this),   this.rol.bind(this),   this.pusha.bind(this), this.cbne.bind(this),  this.bra.bind(this),
            this.bmi.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.and.bind(this),   this.and.bind(this),   this.and.bind(this),   this.and.bind(this),   this.andm.bind(this),  this.andm.bind(this),  this.incw.bind(this),  this.rol.bind(this),   this.rola.bind(this),  this.incx.bind(this),  this.cmpx.bind(this),  this.call.bind(this),
            this.setp.bind(this),  this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eorm.bind(this),  this.and1.bind(this),  this.lsr.bind(this),   this.lsr.bind(this),   this.pushx.bind(this), this.tclr1.bind(this), this.pcall.bind(this),
            this.bvc.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eor.bind(this),   this.eorm.bind(this),  this.eorm.bind(this),  this.cmpw.bind(this),  this.lsr.bind(this),   this.lsra.bind(this),  this.movxa.bind(this), this.cmpy.bind(this),  this.jmp.bind(this),
            this.clrc.bind(this),  this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmpm.bind(this),  this.and1n.bind(this), this.ror.bind(this),   this.ror.bind(this),   this.pushy.bind(this), this.dbnz.bind(this),  this.ret.bind(this),
            this.bvs.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmp.bind(this),   this.cmpm.bind(this),  this.cmpm.bind(this),  this.addw.bind(this),  this.ror.bind(this),   this.rora.bind(this),  this.movax.bind(this), this.cmpy.bind(this),  this.reti.bind(this),
            this.setc.bind(this),  this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adcm.bind(this),  this.eor1.bind(this),  this.dec.bind(this),   this.dec.bind(this),   this.movy.bind(this),  this.popp.bind(this),  this.movm.bind(this),
            this.bcc.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adc.bind(this),   this.adcm.bind(this),  this.adcm.bind(this),  this.subw.bind(this),  this.dec.bind(this),   this.deca.bind(this),  this.movxp.bind(this), this.div.bind(this),   this.xcn.bind(this),
            this.ei.bind(this),    this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbcm.bind(this),  this.mov1.bind(this),  this.inc.bind(this),   this.inc.bind(this),   this.cmpy.bind(this),  this.popa.bind(this),  this.movs.bind(this),
            this.bcs.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbc.bind(this),   this.sbcm.bind(this),  this.sbcm.bind(this),  this.movw.bind(this),  this.inc.bind(this),   this.inca.bind(this),  this.movpx.bind(this), this.das.bind(this),   this.mov.bind(this),
            this.di.bind(this),    this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.movs.bind(this),  this.movs.bind(this),  this.movs.bind(this),  this.movs.bind(this),  this.cmpx.bind(this),  this.movsx.bind(this), this.mov1s.bind(this), this.movsy.bind(this), this.movsy.bind(this), this.movx.bind(this),  this.popx.bind(this),  this.mul.bind(this),
            this.bne.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.movs.bind(this),  this.movs.bind(this),  this.movs.bind(this),  this.movs.bind(this),  this.movsx.bind(this), this.movsx.bind(this), this.movws.bind(this), this.movsy.bind(this), this.decy.bind(this),  this.movay.bind(this), this.cbne.bind(this),  this.daa.bind(this),
            this.clrv.bind(this),  this.tcall.bind(this), this.set1.bind(this),  this.bbs.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.movx.bind(this),  this.not1.bind(this),  this.movy.bind(this),  this.movy.bind(this),  this.notc.bind(this),  this.popy.bind(this),  this.sleep.bind(this),
            this.beq.bind(this),   this.tcall.bind(this), this.clr1.bind(this),  this.bbc.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.mov.bind(this),   this.movx.bind(this),  this.movx.bind(this),  this.movm.bind(this),  this.movy.bind(this),  this.incy.bind(this),  this.movya.bind(this), this.dbnzy.bind(this), this.stop.bind(this)
        ];
    }
}

// Backward Compatibility Alias
window.Spc = SnesSpc;