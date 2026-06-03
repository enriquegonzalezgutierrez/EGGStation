/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpu (Ricoh 5A22 CPU - JIT-Optimized PC Wrapping)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Manages the state, memory access, stack, and cycle-accurate loop execution 
 * of the SNES Ricoh 5A22 processor. 
 * OPTIMIZED: Implements 16-bit program counter wrapping on opcode fetches,
 * bypassing array lookup overhead.
 * 
 * SOLID Principles:
 * - SRP: Handles only CPU execution states, registers, and memory lookups.
 */

// Local constant register scopes
const CPU_REG_DBR = 0;
const CPU_REG_K = 1;
const CPU_REG_A = 0;
const CPU_REG_X = 1;
const CPU_REG_Y = 2;
const CPU_REG_SP = 3;
const CPU_REG_PC = 4;
const CPU_REG_DPR = 5;

// Local constant addressing modes
const CPU_MODE_IMP = 0;  
const CPU_MODE_IMM = 1;  
const CPU_MODE_IMMm = 2; 
const CPU_MODE_IMMx = 3; 
const CPU_MODE_IMMl = 4; 
const CPU_MODE_DP = 5;   
const CPU_MODE_DPX = 6;  
const CPU_MODE_DPY = 7;  
const CPU_MODE_IDP = 8;  
const CPU_MODE_IDX = 9;  
const CPU_MODE_IDY = 10; 
const CPU_MODE_IDYr = 11;
const CPU_MODE_IDL = 12; 
const CPU_MODE_ILY = 13; 
const CPU_MODE_SR = 14;  
const CPU_MODE_ISY = 15; 
const CPU_MODE_ABS = 16; 
const CPU_MODE_ABX = 17; 
const CPU_MODE_ABXr = 18;
const CPU_MODE_ABY = 19; 
const CPU_MODE_ABYr = 20;
const CPU_MODE_ABL = 21; 
const CPU_MODE_ALX = 22; 
const CPU_MODE_IND = 23; 
const CPU_MODE_IAX = 24; 
const CPU_MODE_IAL = 25; 
const CPU_MODE_REL = 26; 
const CPU_MODE_RLL = 27; 
const CPU_MODE_BM = 28;  

// CPU Decoding Tables
const CPU_MODES = Object.freeze([
    CPU_MODE_IMP,  CPU_MODE_IDX,  CPU_MODE_IMM,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DP ,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_ABS,  CPU_MODE_IDX,  CPU_MODE_ABL,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABXr, CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_IMP,  CPU_MODE_IDX,  CPU_MODE_IMM,  CPU_MODE_SR ,  CPU_MODE_BM ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_BM ,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABL,  CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_IMP,  CPU_MODE_IDX,  CPU_MODE_RLL,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_IND,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_IAX,  CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_REL,  CPU_MODE_IDX,  CPU_MODE_RLL,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDY,  CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_DPY,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABY,  CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABX,  CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_IMMx, CPU_MODE_IDX,  CPU_MODE_IMMx, CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_DPY,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABXr, CPU_MODE_ABXr, CPU_MODE_ABYr, CPU_MODE_ALX,
    CPU_MODE_IMMx, CPU_MODE_IDX,  CPU_MODE_IMM,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_DP ,  CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_IAL,  CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_IMMx, CPU_MODE_IDX,  CPU_MODE_IMM,  CPU_MODE_SR ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_DP ,  CPU_MODE_IDL,  CPU_MODE_IMP,  CPU_MODE_IMMm, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABS,  CPU_MODE_ABL,
    CPU_MODE_REL,  CPU_MODE_IDYr, CPU_MODE_IDP,  CPU_MODE_ISY,  CPU_MODE_IMMl, CPU_MODE_DPX,  CPU_MODE_DPX,  CPU_MODE_ILY,  CPU_MODE_IMP,  CPU_MODE_ABYr, CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_IAX,  CPU_MODE_ABXr, CPU_MODE_ABX,  CPU_MODE_ALX,
    CPU_MODE_IMP,  CPU_MODE_IMP,  CPU_MODE_IMP 
]);

const CPU_CYCLES = Object.freeze([
    7, 6, 7, 4, 5, 3, 5, 6, 3, 2, 2, 4, 6, 4, 6, 5,
    2, 5, 5, 7, 5, 4, 6, 6, 2, 4, 2, 2, 6, 4, 7, 5,
    6, 6, 8, 4, 3, 3, 5, 6, 4, 2, 2, 5, 4, 4, 6, 5,
    2, 5, 5, 7, 4, 4, 6, 6, 2, 4, 2, 2, 4, 4, 7, 5,
    6, 6, 2, 4, 7, 3, 5, 6, 3, 2, 2, 3, 3, 4, 6, 5,
    2, 5, 5, 7, 7, 4, 6, 6, 2, 4, 3, 2, 4, 4, 7, 5,
    6, 6, 6, 4, 3, 3, 5, 6, 4, 2, 2, 6, 5, 4, 6, 5,
    2, 5, 5, 7, 4, 4, 6, 6, 2, 4, 4, 2, 6, 4, 7, 5,
    3, 6, 4, 4, 3, 3, 3, 6, 2, 2, 2, 3, 4, 4, 4, 5,
    2, 6, 5, 7, 4, 4, 4, 6, 2, 5, 2, 2, 4, 5, 5, 5,
    2, 6, 2, 4, 3, 3, 3, 6, 2, 2, 2, 4, 4, 4, 4, 5,
    2, 5, 5, 7, 4, 4, 4, 6, 2, 4, 2, 2, 4, 4, 4, 5,
    2, 6, 3, 4, 3, 3, 5, 6, 2, 2, 2, 3, 4, 4, 6, 5,
    2, 5, 5, 7, 6, 4, 6, 6, 2, 4, 3, 3, 6, 4, 7, 5,
    2, 6, 3, 4, 3, 3, 5, 6, 2, 2, 2, 3, 4, 4, 6, 5,
    2, 5, 5, 7, 5, 4, 6, 6, 2, 4, 4, 2, 8, 4, 7, 5,
    7, 7, 7 
]);

class SnesCpu {
    /**
     * @param {Object} mem - Central virtual system memory bus.
     */
    constructor(mem) {
        this.mem = mem;

        // Core registers
        this.r = new Uint8Array(2);
        this.br = new Uint16Array(6);

        // Core state flags
        this.n = false; 
        this.v = false; 
        this.m = true;  
        this.x = true;  
        this.d = false; 
        this.i = false; 
        this.z = false; 
        this.c = false; 
        this.e = true;  

        // Interrupt lines
        this.irqWanted = false;
        this.nmiWanted = false;
        this.aboWanted = false;

        this.stopped = false;
        this.waiting = false;
        this.cyclesLeft = 0;

        this.modes = CPU_MODES;
        this.cycles = CPU_CYCLES;

        // Pre-allocated static properties to achieve complete GC-Free executions
        this.resolvedAdr = 0;
        this.resolvedAdrh = 0;

        this.bindInstructionMap();
        this.reset();
    }

    reset() {
        this.r[CPU_REG_DBR] = 0;
        this.r[CPU_REG_K] = 0;

        this.br[CPU_REG_A] = 0;
        this.br[CPU_REG_X] = 0;
        this.br[CPU_REG_Y] = 0;
        this.br[CPU_REG_SP] = 0;
        this.br[CPU_REG_DPR] = 0;

        if (this.mem.read) {
            // Emulation Mode standard reset vector is read from 0xFFFC-0xFFFD
            this.br[CPU_REG_PC] = this.mem.read(0xfffc) | (this.mem.read(0xfffd) << 8);
        } else {
            this.br[CPU_REG_PC] = 0;
        }

        this.n = false;
        this.v = false;
        this.m = true;
        this.x = true;
        this.d = false;
        this.i = false;
        this.z = false;
        this.c = false;
        this.e = true;

        this.irqWanted = false;
        this.nmiWanted = false;
        this.aboWanted = false;

        this.stopped = false;
        this.waiting = false;

        this.cyclesLeft = 7;
        this.resolvedAdr = 0;
        this.resolvedAdrh = 0;
    }

    /**
     * Process one clock step of the central CPU.
     * GC-FREE: Employs 16-bit enshrouded PC wrapping.
     */
    cycle() {
        if (this.cyclesLeft === 0) {
            if (this.stopped) {
                this.cyclesLeft = 1;
            } else if (!this.waiting) {
                // Fetch opcode byte with strict 16-bit Program Counter wrapping
                const pc = this.br[CPU_REG_PC];
                let instr = this.mem.read((this.r[CPU_REG_K] << 16) | pc);
                this.br[CPU_REG_PC] = (pc + 1) & 0xffff;
                
                this.cyclesLeft = this.cycles[instr];
                let mode = this.modes[instr];

                // Interrupt Line queries
                if ((this.irqWanted && !this.i) || this.nmiWanted || this.aboWanted) {
                    this.br[CPU_REG_PC] = (this.br[CPU_REG_PC] - 1) & 0xffff;
                    if (this.aboWanted) {
                        this.aboWanted = false;
                        instr = 0x100;
                    } else if (this.nmiWanted) {
                        this.nmiWanted = false;
                        instr = 0x101;
                    } else {
                        instr = 0x102; // Standard IRQ
                    }
                    this.cyclesLeft = this.cycles[instr];
                    mode = this.modes[instr];
                }

                // UNIFIED DECODER: Decodes addressing modes dynamically directly into this.resolvedAdr
                SnesCpuAddressing.resolve(this, instr, mode);
                
                // JIT-Optimized Jump Table execution (delegates to SnesCpuDecoder)
                SnesCpuDecoder.execute(this, instr, this.resolvedAdr, this.resolvedAdrh);
            } else {
                if (this.abortWanted || this.irqWanted || this.nmiWanted) {
                    this.waiting = false;
                }
                this.cyclesLeft = 1;
            }
        }
        this.cyclesLeft--;
    }

    // ========================================================================
    // HELPER STACK & MEMORY OPERATIONS
    // ========================================================================

    getP() {
        let val = 0;
        val |= this.n ? 0x80 : 0;
        val |= this.v ? 0x40 : 0;
        val |= this.m ? 0x20 : 0;
        val |= this.x ? 0x10 : 0;
        val |= this.d ? 0x08 : 0;
        val |= this.i ? 0x04 : 0;
        val |= this.z ? 0x02 : 0;
        val |= this.c ? 0x01 : 0;
        return val;
    }

    setP(value) {
        this.n = (value & 0x80) > 0;
        this.v = (value & 0x40) > 0;
        this.m = (value & 0x20) > 0;
        this.x = (value & 0x10) > 0;
        this.d = (value & 0x08) > 0;
        this.i = (value & 0x04) > 0;
        this.z = (value & 0x02) > 0;
        this.c = (value & 0x01) > 0;
        if (this.x) {
            this.br[CPU_REG_X] &= 0xff;
            this.br[CPU_REG_Y] &= 0xff;
        }
    }

    setZandN(value, byte) {
        if (byte) {
            this.z = (value & 0xff) === 0;
            this.n = (value & 0x80) > 0;
            return;
        }
        this.z = (value & 0xffff) === 0;
        this.n = (value & 0x8000) > 0;
    }

    getSigned(value, byte) {
        if (byte) {
            return (value & 0xff) > 127 ? -(256 - (value & 0xff)) : (value & 0xff);
        }
        return value > 32767 ? -(65536 - value) : value;
    }

    doBranch(check, rel) {
        if (check) {
            this.cyclesLeft++;
            this.br[CPU_REG_PC] = (this.br[CPU_REG_PC] + rel) & 0xffff;
        }
    }

    pushByte(value) {
        if (this.e) {
            this.mem.write((this.br[CPU_REG_SP] & 0xff) | 0x100, value);
        } else {
            this.mem.write(this.br[CPU_REG_SP], value);
        }
        this.br[CPU_REG_SP] = (this.br[CPU_REG_SP] - 1) & 0xffff;
    }

    pullByte() {
        this.br[CPU_REG_SP] = (this.br[CPU_REG_SP] + 1) & 0xffff;
        if (this.e) {
            return this.mem.read((this.br[CPU_REG_SP] & 0xff) | 0x100);
        }
        return this.mem.read(this.br[CPU_REG_SP]);
    }

    pushWord(value) {
        this.pushByte((value & 0xff00) >> 8);
        this.pushByte(value & 0xff);
    }

    pullWord() {
        let value = this.pullByte();
        value |= this.pullByte() << 8;
        return value;
    }

    readWord(adr, adrh) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        return value;
    }

    writeWord(adr, adrh, result, reversed = false) {
        if (reversed) {
            this.mem.write(adrh, (result & 0xff00) >> 8);
            this.mem.write(adr, result & 0xff);
        } else {
            this.mem.write(adr, result & 0xff);
            this.mem.write(adrh, (result & 0xff00) >> 8);
        }
    }

    // ========================================================================
    // CPU CONTROL FLOW METHODS (Restored internally)
    // ========================================================================

    bcc(adr) { this.doBranch(!this.c, adr); }
    bcs(adr) { this.doBranch(this.c, adr); }
    beq(adr) { this.doBranch(this.z, adr); }
    bmi(adr) { this.doBranch(this.n, adr); }
    bne(adr) { this.doBranch(!this.z, adr); }
    bpl(adr) { this.doBranch(!this.n, adr); }
    bra(adr) { this.br[CPU_REG_PC] = (this.br[CPU_REG_PC] + adr) & 0xffff; }
    bvc(adr) { this.doBranch(!this.v, adr); }
    bvs(adr) { this.doBranch(this.v, adr); }
    brl(adr) { this.br[CPU_REG_PC] = (this.br[CPU_REG_PC] + adr) & 0xffff; }

    jmp(adr) { this.br[CPU_REG_PC] = adr & 0xffff; }
    jml(adr) { this.r[CPU_REG_K] = (adr & 0xff0000) >> 16; this.br[CPU_REG_PC] = adr & 0xffff; }

    clc() { this.c = false; }
    cld() { this.d = false; }
    cli() { this.i = false; }
    clv() { this.v = false; }
    sec() { this.c = true; }
    sed() { this.d = true; }
    sei() { this.i = true; }

    rep(adr) {
        const value = this.mem.read(adr);
        this.setP(this.getP() & ~value);
    }

    sep(adr) {
        const value = this.mem.read(adr);
        this.setP(this.getP() | value);
    }

    jsl(adr) {
        const pushPc = (this.br[CPU_REG_PC] - 1) & 0xffff;
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, pushPc);
        this.r[CPU_REG_K] = (adr & 0xff0000) >> 16;
        this.br[CPU_REG_PC] = adr & 0xffff;
    }

    jsr(adr) {
        const pushPc = (this.br[CPU_REG_PC] - 1) & 0xffff;
        SnesCpuOperations.pushWord(this, pushPc);
        this.br[CPU_REG_PC] = adr & 0xffff;
    }

    rtl() {
        const pullPc = SnesCpuOperations.pullWord(this);
        this.r[CPU_REG_K] = SnesCpuOperations.pullByte(this);
        this.br[CPU_REG_PC] = (pullPc + 1) & 0xffff;
    }

    rts() {
        const pullPc = SnesCpuOperations.pullWord(this);
        this.br[CPU_REG_PC] = (pullPc + 1) & 0xffff;
    }

    brk() {
        const pushPc = (this.br[CPU_REG_PC] + 1) & 0xffff;
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, pushPc);
        SnesCpuOperations.pushByte(this, this.getP());
        this.cyclesLeft++; 
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe6) | (this.mem.read(0xffe7) << 8);
    }

    cop() {
        const pushPc = this.br[CPU_REG_PC] & 0xffff;
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, pushPc);
        SnesCpuOperations.pushByte(this, this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe4) | (this.mem.read(0xffe5) << 8);
    }

    abo() {
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, this.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(this, this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe8) | (this.mem.read(0xffe9) << 8);
    }

    nmi() {
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, this.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(this, this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffea) | (this.mem.read(0xffeb) << 8);
    }

    irq() {
        SnesCpuOperations.pushByte(this, this.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(this, this.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(this, this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffee) | (this.mem.read(0xffef) << 8);
    }

    rti() {
        this.setP(SnesCpuOperations.pullByte(this));
        this.cyclesLeft++;
        const pullPc = SnesCpuOperations.pullWord(this);
        this.r[CPU_REG_K] = SnesCpuOperations.pullByte(this);
        this.br[CPU_REG_PC] = pullPc;
    }

    // Standardized register transfer operations
    tcd() {
        this.br[CPU_REG_DPR] = this.br[CPU_REG_A];
        this.setZandN(this.br[CPU_REG_DPR], false);
    }

    tcs() {
        this.br[CPU_REG_SP] = this.br[CPU_REG_A];
    }

    tdc() {
        this.br[CPU_REG_A] = this.br[CPU_REG_DPR];
        this.setZandN(this.br[CPU_REG_A], false);
    }

    tsc() {
        this.br[CPU_REG_A] = this.br[CPU_REG_SP];
        this.setZandN(this.br[CPU_REG_A], false);
    }

    // Unimplemented opcode logger
    uni(adr, adrh, instr) {
        console.warn(`[Ricoh 5A22] Unimplemented opcode $${instr.toString(16)}`);
    }

    // empty function bindings because SnesCpuInstructions covers execution now
    bindInstructionMap() {}
}

// Backward Compatibility Alias
window.Cpu = SnesCpu;