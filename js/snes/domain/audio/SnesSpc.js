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

// Constants are defined in SnesSpcAddressing.js (loaded before this file)

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
                const eff = SnesSpcAddressing.resolve(this, mode);
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
    // INSTRUCTION DISPATCH TABLE
    // ========================================================================

    /**
     * Builds the per-instance dispatch array from the shared static TABLE.
     * Closures capture `s` (this) once — V8 can constant-fold the receiver
     * and apply inline-cache optimizations that are not available when calling
     * a global static array with a dynamic receiver argument.
     */
    bindInstructionMap() {
        const s = this;
        this.functions = SnesSpcDecoder.TABLE.map(fn => (a, b, i) => fn(s, a, b, i));
    }
}

// Backward Compatibility Alias
window.Spc = SnesSpc;