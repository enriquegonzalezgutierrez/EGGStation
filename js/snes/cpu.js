/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpu (Ricoh 5A22 / 65C816 CPU - Scoped & Audited Version)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the physical SNES Ricoh 5A22 central processor.
 * Uses uniquely prefixed constants (CPU_) to prevent global lexical scope
 * collisions with the audio CPU (SPC700) when loaded via standard script tags.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles core assembly instructions, registers state, and addressing modes.
 * - DIP: Injects central system memory bus (mem) via constructor.
 */

// Prefixed Scope Constants (Zero global collision risk, high performance)
const CPU_REG_DBR = 0; // Data Bank Register
const CPU_REG_K = 1;   // Program Bank

const CPU_REG_A = 0;
const CPU_REG_X = 1;
const CPU_REG_Y = 2;
const CPU_REG_SP = 3;
const CPU_REG_PC = 4;
const CPU_REG_DPR = 5; // Direct Page Register

// Prefixed Addressing Modes
const CPU_MODE_IMP = 0;  // Implied / Accumulator
const CPU_MODE_IMM = 1;  // Immediate (Always 8-bit)
const CPU_MODE_IMMm = 2; // Immediate (Size depends on M flag)
const CPU_MODE_IMMx = 3; // Immediate (Size depends on X flag)
const CPU_MODE_IMMl = 4; // Immediate (Always 16-bit)
const CPU_MODE_DP = 5;   // Direct Page
const CPU_MODE_DPX = 6;  // Direct Page Indexed on X
const CPU_MODE_DPY = 7;  // Direct Page Indexed on Y
const CPU_MODE_IDP = 8;  // Direct Page Indirect
const CPU_MODE_IDX = 9;  // Direct Page Indirect Indexed on X
const CPU_MODE_IDY = 10; // Indirect Direct Page Indexed on Y (For RMW / Writes)
const CPU_MODE_IDYr = 11;// Indirect Direct Page Indexed on Y (For Reads)
const CPU_MODE_IDL = 12; // Indirect Direct Page Long
const CPU_MODE_ILY = 13; // Indirect Direct Page Long Indexed on Y
const CPU_MODE_SR = 14;  // Stack Relative
const CPU_MODE_ISY = 15; // Stack Relative Indirect Indexed on Y
const CPU_MODE_ABS = 16; // Absolute
const CPU_MODE_ABX = 17; // Absolute Indexed on X (For RMW / Writes)
const CPU_MODE_ABXr = 18;// Absolute Indexed on X (For Reads)
const CPU_MODE_ABY = 19; // Absolute Indexed on Y (For RMW / Writes)
const CPU_MODE_ABYr = 20;// Absolute Indexed on Y (For Reads)
const CPU_MODE_ABL = 21; // Absolute Long
const CPU_MODE_ALX = 22; // Absolute Long Indexed on X
const CPU_MODE_IND = 23; // Absolute Indirect
const CPU_MODE_IAX = 24; // Absolute Indexed Indirect
const CPU_MODE_IAL = 25; // Absolute Indirect Long
const CPU_MODE_REL = 26; // Relative
const CPU_MODE_RLL = 27; // Relative Long
const CPU_MODE_BM = 28;  // Block Move

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

        this.bindInstructionMap();
        this.reset();
    }

    /**
     * Resets registers and resets the CPU back to Emulation Mode (6502).
     */
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
    }

    /**
     * Process one clock step of the central CPU.
     */
    cycle() {
        if (this.cyclesLeft === 0) {
            if (this.stopped) {
                this.cyclesLeft = 1;
            } else if (!this.waiting) {
                let instr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                this.cyclesLeft = this.cycles[instr];
                let mode = this.modes[instr];

                // Interrupt Line queries
                if ((this.irqWanted && !this.i) || this.nmiWanted || this.aboWanted) {
                    this.br[CPU_REG_PC]--;
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

                // Retrieve effective addresses and execute
                const adrs = this.getAdr(instr, mode);
                
                if (this.functions[instr] === undefined) {
                    this.uni(adrs[0], adrs[1], instr);
                } else {
                    this.functions[instr](adrs[0], adrs[1]);
                }
            } else {
                if (this.abortWanted || this.irqWanted || this.nmiWanted) {
                    this.waiting = false;
                }
                this.cyclesLeft = 1;
            }
        }
        this.cyclesLeft--;
    }

    /**
     * Encodes CPU status flags into an 8-bit register byte (P).
     */
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

    /**
     * Decodes an 8-bit status byte (P) back into individual CPU flags.
     */
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
            this.br[CPU_REG_PC] += rel;
        }
    }

    pushByte(value) {
        if (this.e) {
            this.mem.write((this.br[CPU_REG_SP] & 0xff) | 0x100, value);
        } else {
            this.mem.write(this.br[CPU_REG_SP], value);
        }
        this.br[CPU_REG_SP]--;
    }

    pullByte() {
        this.br[CPU_REG_SP]++;
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
    // ADDRESSING MODE TRANSLATIONS
    // ========================================================================

    getAdr(opcode, mode) {
        switch (mode) {
            case CPU_MODE_IMP:
                return [0, 0];

            case CPU_MODE_IMM:
                return [(this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++, 0];

            case CPU_MODE_IMMm: {
                if (this.m) {
                    return [(this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++, 0];
                } else {
                    const low = (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++;
                    return [low, (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++];
                }
            }

            case CPU_MODE_IMMx: {
                if (this.x) {
                    return [(this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++, 0];
                } else {
                    const low = (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++;
                    return [low, (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++];
                }
            }

            case CPU_MODE_IMMl: {
                const low = (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++;
                return [low, (this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++];
            }

            case CPU_MODE_DP: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++; // DPR low byte not zero adds 1 cycle
                }
                return [(this.br[CPU_REG_DPR] + adr) & 0xffff, (this.br[CPU_REG_DPR] + adr + 1) & 0xffff];
            }

            case CPU_MODE_DPX: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                return [(this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_X]) & 0xffff, (this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_X] + 1) & 0xffff];
            }

            case CPU_MODE_DPY: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                return [(this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_Y]) & 0xffff, (this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_Y] + 1) & 0xffff];
            }

            case CPU_MODE_IDP: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + pointer, (this.r[CPU_REG_DBR] << 16) + pointer + 1];
            }

            case CPU_MODE_IDX: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_X]) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + this.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + pointer, (this.r[CPU_REG_DBR] << 16) + pointer + 1];
            }

            case CPU_MODE_IDY: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y], (this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_IDYr: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                if (((pointer >> 8) !== ((pointer + this.br[CPU_REG_Y]) >> 8)) || !this.x) {
                    this.cyclesLeft++; 
                }
                return [(this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y], (this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_IDL: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                return [pointer, pointer + 1];
            }

            case CPU_MODE_ILY: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                if ((this.br[CPU_REG_DPR] & 0xff) !== 0) {
                    this.cyclesLeft++;
                }
                let pointer = this.mem.read((this.br[CPU_REG_DPR] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 1) & 0xffff)) << 8;
                pointer |= (this.mem.read((this.br[CPU_REG_DPR] + adr + 2) & 0xffff)) << 16;
                return [pointer + this.br[CPU_REG_Y], pointer + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_SR: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                return [(this.br[CPU_REG_SP] + adr) & 0xffff, (this.br[CPU_REG_SP] + adr + 1) & 0xffff];
            }

            case CPU_MODE_ISY: {
                const adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                let pointer = this.mem.read((this.br[CPU_REG_SP] + adr) & 0xffff);
                pointer |= (this.mem.read((this.br[CPU_REG_SP] + adr + 1) & 0xffff)) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y], (this.r[CPU_REG_DBR] << 16) + pointer + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABS: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + adr, (this.r[CPU_REG_DBR] << 16) + adr + 1];
            }

            case CPU_MODE_ABX: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_X], (this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_ABXr: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + this.br[CPU_REG_X]) >> 8)) || !this.x) {
                    this.cyclesLeft++;
                }
                return [(this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_X], (this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_ABY: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                return [(this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_Y], (this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABYr: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                if (((adr >> 8) !== ((adr + this.br[CPU_REG_Y]) >> 8)) || !this.x) {
                    this.cyclesLeft++;
                }
                return [(this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_Y], (this.r[CPU_REG_DBR] << 16) + adr + this.br[CPU_REG_Y] + 1];
            }

            case CPU_MODE_ABL: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 16;
                return [adr, adr + 1];
            }

            case CPU_MODE_ALX: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 16;
                return [adr + this.br[CPU_REG_X], adr + this.br[CPU_REG_X] + 1];
            }

            case CPU_MODE_IND: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                let pointer = this.mem.read(adr);
                pointer |= this.mem.read((adr + 1) & 0xffff) << 8;
                return [(this.r[CPU_REG_K] << 16) + pointer, 0];
            }

            case CPU_MODE_IAX: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                let pointer = this.mem.read((this.r[CPU_REG_K] << 16) | ((adr + this.br[CPU_REG_X]) & 0xffff));
                pointer |= this.mem.read((this.r[CPU_REG_K] << 16) | ((adr + this.br[CPU_REG_X] + 1) & 0xffff)) << 8;
                return [(this.r[CPU_REG_K] << 16) + pointer, 0];
            }

            case CPU_MODE_IAL: {
                let adr = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                adr |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                let pointer = this.mem.read(adr);
                pointer |= this.mem.read((adr + 1) & 0xffff) << 8;
                pointer |= this.mem.read((adr + 2) & 0xffff) << 16;
                return [pointer, 0];
            }

            case CPU_MODE_REL: {
                const rel = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                return [this.getSigned(rel, true), 0];
            }

            case CPU_MODE_RLL: {
                let rel = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                rel |= this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++) << 8;
                return [this.getSigned(rel, false), 0];
            }

            case CPU_MODE_BM: {
                const dest = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                const src = this.mem.read((this.r[CPU_REG_K] << 16) | this.br[CPU_REG_PC]++);
                return [dest, src];
            }
            default:
                return [0, 0];
        }
    }

    // ========================================================================
    // OPCODES IMPLEMENTATIONS
    // ========================================================================

    uni(adr, adrh, instr) {
        console.warn(`[Ricoh 5A22] Unimplemented opcode $${instr.toString(16)}`);
    }

    adc(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            let result;
            if (this.d) {
                result = (this.br[CPU_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((this.br[CPU_REG_A] & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
            } else {
                result = (this.br[CPU_REG_A] & 0xff) + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[CPU_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
            result += (this.d && result > 0x9f) ? 0x60 : 0;
            this.c = result > 0xff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (result & 0xff);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++; 
            let result;
            if (this.d) {
                result = (this.br[CPU_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((this.br[CPU_REG_A] & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
                result += result > 0x9f ? 0x60 : 0;
                result = ((this.br[CPU_REG_A] & 0xf00) + (value & 0xf00) + (result > 0xff ? 0x100 : 0) + (result & 0xff));
                result += result > 0x9ff ? 0x600 : 0;
                result = ((this.br[CPU_REG_A] & 0xf000) + (value & 0xf000) + (result > 0xfff ? 0x1000 : 0) + (result & 0xfff));
            } else {
                result = this.br[CPU_REG_A] + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[CPU_REG_A] & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
            result += (this.d && result > 0x9fff) ? 0x6000 : 0;
            this.c = result > 0xffff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = result;
        }
    }

    sbc(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr) ^ 0xff;
            let result;
            if (this.d) {
                result = (this.br[CPU_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
                result -= result <= 0xf ? 6 : 0;
                result = ((this.br[CPU_REG_A] & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
            } else {
                result = (this.br[CPU_REG_A] & 0xff) + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[CPU_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
            result -= (this.d && result <= 0xff) ? 0x60 : 0;
            this.c = result > 0xff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (result & 0xff);
        } else {
            const value = this.readWord(adr, adrh) ^ 0xffff;
            this.cyclesLeft++; 
            let result;
            if (this.d) {
                result = (this.br[CPU_REG_A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
                result -= result <= 0x0f ? 6 : 0;
                result = ((this.br[CPU_REG_A] & 0xf0) + (value & 0xf0) + (result > 0xf ? 0x10 : 0) + (result & 0xf));
                result -= result <= 0xff ? 0x60 : 0;
                result = ((this.br[CPU_REG_A] & 0xf00) + (value & 0xf00) + (result > 0xff ? 0x100 : 0) + (result & 0xff));
                result -= result <= 0xfff ? 0x600 : 0;
                result = ((this.br[CPU_REG_A] & 0xf000) + (value & 0xf000) + (result > 0xfff ? 0x1000 : 0) + (result & 0xfff));
            } else {
                result = this.br[CPU_REG_A] + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[CPU_REG_A] & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
            result -= (this.d && result <= 0xffff) ? 0x6000 : 0;
            this.c = result > 0xffff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = result;
        }
    }

    cmp(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr) ^ 0xff;
            const result = (this.br[CPU_REG_A] & 0xff) + value + 1;
            this.c = result > 0xff;
            this.setZandN(result, this.m);
        } else {
            const value = this.readWord(adr, adrh) ^ 0xffff;
            this.cyclesLeft++;
            const result = this.br[CPU_REG_A] + value + 1;
            this.c = result > 0xffff;
            this.setZandN(result, this.m);
        }
    }

    cpx(adr, adrh) {
        if (this.x) {
            const value = this.mem.read(adr) ^ 0xff;
            const result = (this.br[CPU_REG_X] & 0xff) + value + 1;
            this.c = result > 0xff;
            this.setZandN(result, this.x);
        } else {
            const value = this.readWord(adr, adrh) ^ 0xffff;
            this.cyclesLeft++;
            const result = this.br[CPU_REG_X] + value + 1;
            this.c = result > 0xffff;
            this.setZandN(result, this.x);
        }
    }

    cpy(adr, adrh) {
        if (this.x) {
            const value = this.mem.read(adr) ^ 0xff;
            const result = (this.br[CPU_REG_Y] & 0xff) + value + 1;
            this.c = result > 0xff;
            this.setZandN(result, this.x);
        } else {
            const value = this.readWord(adr, adrh) ^ 0xffff;
            this.cyclesLeft++;
            const result = this.br[CPU_REG_Y] + value + 1;
            this.c = result > 0xffff;
            this.setZandN(result, this.x);
        }
    }

    dec(adr, adrh) {
        if (this.m) {
            const result = (this.mem.read(adr) - 1) & 0xff;
            this.setZandN(result, this.m);
            this.mem.write(adr, result);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft += 2; 
            const result = (value - 1) & 0xffff;
            this.setZandN(result, this.m);
            this.writeWord(adr, adrh, result, true);
        }
    }

    deca() {
        if (this.m) {
            const result = ((this.br[CPU_REG_A] & 0xff) - 1) & 0xff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | result;
        } else {
            this.br[CPU_REG_A]--;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    dex() {
        if (this.x) {
            const result = ((this.br[CPU_REG_X] & 0xff) - 1) & 0xff;
            this.setZandN(result, this.x);
            this.br[CPU_REG_X] = result;
        } else {
            this.br[CPU_REG_X]--;
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    dey() {
        if (this.x) {
            const result = ((this.br[CPU_REG_Y] & 0xff) - 1) & 0xff;
            this.setZandN(result, this.x);
            this.br[CPU_REG_Y] = result;
        } else {
            this.br[CPU_REG_Y]--;
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    inc(adr, adrh) {
        if (this.m) {
            const result = (this.mem.read(adr) + 1) & 0xff;
            this.setZandN(result, this.m);
            this.mem.write(adr, result);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            const result = (value + 1) & 0xffff;
            this.setZandN(result, this.m);
            this.writeWord(adr, adrh, result, true);
        }
    }

    inca() {
        if (this.m) {
            const result = ((this.br[CPU_REG_A] & 0xff) + 1) & 0xff;
            this.setZandN(result, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | result;
        } else {
            this.br[CPU_REG_A]++;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    inx() {
        if (this.x) {
            const result = ((this.br[CPU_REG_X] & 0xff) + 1) & 0xff;
            this.setZandN(result, this.x);
            this.br[CPU_REG_X] = result;
        } else {
            this.br[CPU_REG_X]++;
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    iny() {
        if (this.x) {
            const result = ((this.br[CPU_REG_Y] & 0xff) + 1) & 0xff;
            this.setZandN(result, this.x);
            this.br[CPU_REG_Y] = result;
        } else {
            this.br[CPU_REG_Y]++;
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    and(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | ((this.br[CPU_REG_A] & value) & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++;
            this.br[CPU_REG_A] &= value;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    eor(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | ((this.br[CPU_REG_A] ^ value) & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++;
            this.br[CPU_REG_A] ^= value;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    ora(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | ((this.br[CPU_REG_A] | value) & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++;
            this.br[CPU_REG_A] |= value;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    bit(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            const result = (this.br[CPU_REG_A] & 0xff) & value;
            this.z = result === 0;
            this.n = (value & 0x80) > 0;
            this.v = (value & 0x40) > 0;
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++;
            const result = this.br[CPU_REG_A] & value;
            this.z = result === 0;
            this.n = (value & 0x8000) > 0;
            this.v = (value & 0x4000) > 0;
        }
    }

    biti(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            const result = (this.br[CPU_REG_A] & 0xff) & value;
            this.z = result === 0;
        } else {
            const value = this.readWord(adr, adrh);
            this.cyclesLeft++;
            const result = this.br[CPU_REG_A] & value;
            this.z = result === 0;
        }
    }

    trb(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            const result = (this.br[CPU_REG_A] & 0xff) & value;
            value = (value & ~(this.br[CPU_REG_A] & 0xff)) & 0xff;
            this.z = result === 0;
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            const result = this.br[CPU_REG_A] & value;
            value = (value & ~this.br[CPU_REG_A]) & 0xffff;
            this.z = result === 0;
            this.writeWord(adr, adrh, value, true);
        }
    }

    tsb(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            const result = (this.br[CPU_REG_A] & 0xff) & value;
            value = (value | (this.br[CPU_REG_A] & 0xff)) & 0xff;
            this.z = result === 0;
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            const result = this.br[CPU_REG_A] & value;
            value = (value | this.br[CPU_REG_A]) & 0xffff;
            this.z = result === 0;
            this.writeWord(adr, adrh, value, true);
        }
    }

    asl(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            this.c = (value & 0x80) > 0;
            value <<= 1;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            this.c = (value & 0x8000) > 0;
            value <<= 1;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    }

    asla() {
        if (this.m) {
            let value = this.br[CPU_REG_A] & 0xff;
            this.c = (value & 0x80) > 0;
            value <<= 1;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            this.c = (this.br[CPU_REG_A] & 0x8000) > 0;
            this.cyclesLeft += 2;
            this.br[CPU_REG_A] <<= 1;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    lsr(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            this.c = (value & 0x1) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            this.c = (value & 0x1) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    }

    lsra() {
        if (this.m) {
            let value = this.br[CPU_REG_A] & 0xff;
            this.c = (value & 0x1) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            this.c = (this.br[CPU_REG_A] & 0x1) > 0;
            this.cyclesLeft += 2;
            this.br[CPU_REG_A] >>= 1;
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    rol(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            value = (value << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x100) > 0;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            value = (value << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x10000) > 0;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    }

    rola() {
        if (this.m) {
            let value = this.br[CPU_REG_A] & 0xff;
            value = (value << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x100) > 0;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            this.cyclesLeft += 2;
            const value = (this.br[CPU_REG_A] << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x10000) > 0;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = value;
        }
    }

    ror(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            const carry = value & 0x1;
            value = (value >> 1) | (this.c ? 0x80 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2;
            const carry = value & 0x1;
            value = (value >> 1) | (this.c ? 0x8000 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    }

    rora() {
        if (this.m) {
            let value = this.br[CPU_REG_A] & 0xff;
            const carry = value & 0x1;
            value = (value >> 1) | (this.c ? 0x80 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (value & 0xff);
        } else {
            this.cyclesLeft += 2;
            const carry = this.br[CPU_REG_A] & 0x1;
            const value = (this.br[CPU_REG_A] >> 1) | (this.c ? 0x8000 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.br[CPU_REG_A] = value;
        }
    }

    bcc(adr) { this.doBranch(!this.c, adr); }
    bcs(adr) { this.doBranch(this.c, adr); }
    beq(adr) { this.doBranch(this.z, adr); }
    bmi(adr) { this.doBranch(this.n, adr); }
    bne(adr) { this.doBranch(!this.z, adr); }
    bpl(adr) { this.doBranch(!this.n, adr); }
    bra(adr) { this.br[CPU_REG_PC] += adr; }
    bvc(adr) { this.doBranch(!this.v, adr); }
    bvs(adr) { this.doBranch(this.v, adr); }
    brl(adr) { this.br[CPU_REG_PC] += adr; }

    jmp(adr) { this.br[CPU_REG_PC] = adr & 0xffff; }
    jml(adr) { this.r[CPU_REG_K] = (adr & 0xff0000) >> 16; this.br[CPU_REG_PC] = adr & 0xffff; }

    jsl(adr) {
        const pushPc = (this.br[CPU_REG_PC] - 1) & 0xffff;
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(pushPc);
        this.r[CPU_REG_K] = (adr & 0xff0000) >> 16;
        this.br[CPU_REG_PC] = adr & 0xffff;
    }

    jsr(adr) {
        const pushPc = (this.br[CPU_REG_PC] - 1) & 0xffff;
        this.pushWord(pushPc);
        this.br[CPU_REG_PC] = adr & 0xffff;
    }

    rtl() {
        const pullPc = this.pullWord();
        this.r[CPU_REG_K] = this.pullByte();
        this.br[CPU_REG_PC] = pullPc + 1;
    }

    rts() {
        const pullPc = this.pullWord();
        this.br[CPU_REG_PC] = pullPc + 1;
    }

    brk() {
        const pushPc = (this.br[CPU_REG_PC] + 1) & 0xffff;
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(pushPc);
        this.pushByte(this.getP());
        this.cyclesLeft++; // Native mode: adds 1 extra cycle
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe6) | (this.mem.read(0xffe7) << 8);
    }

    cop() {
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(this.br[CPU_REG_PC]);
        this.pushByte(this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe4) | (this.mem.read(0xffe5) << 8);
    }

    abo() {
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(this.br[CPU_REG_PC]);
        this.pushByte(this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffe8) | (this.mem.read(0xffe9) << 8);
    }

    nmi() {
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(this.br[CPU_REG_PC]);
        this.pushByte(this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffea) | (this.mem.read(0xffeb) << 8);
    }

    irq() {
        this.pushByte(this.r[CPU_REG_K]);
        this.pushWord(this.br[CPU_REG_PC]);
        this.pushByte(this.getP());
        this.cyclesLeft++;
        this.i = true;
        this.d = false;
        this.r[CPU_REG_K] = 0;
        this.br[CPU_REG_PC] = this.mem.read(0xffee) | (this.mem.read(0xffef) << 8);
    }

    rti() {
        this.setP(this.pullByte());
        this.cyclesLeft++;
        const pullPc = this.pullWord();
        this.r[CPU_REG_K] = this.pullByte();
        this.br[CPU_REG_PC] = pullPc;
    }

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

    lda(adr, adrh) {
        if (this.m) {
            const value = this.mem.read(adr);
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (value & 0xff);
            this.setZandN(value, this.m);
        } else {
            this.cyclesLeft++; // adds 1 cycle for 16-bit
            this.br[CPU_REG_A] = this.readWord(adr, adrh);
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    ldx(adr, adrh) {
        if (this.x) {
            this.br[CPU_REG_X] = this.mem.read(adr);
            this.setZandN(this.br[CPU_REG_X], this.x);
        } else {
            this.cyclesLeft++;
            this.br[CPU_REG_X] = this.readWord(adr, adrh);
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    ldy(adr, adrh) {
        if (this.x) {
            this.br[CPU_REG_Y] = this.mem.read(adr);
            this.setZandN(this.br[CPU_REG_Y], this.x);
        } else {
            this.cyclesLeft++;
            this.br[CPU_REG_Y] = this.readWord(adr, adrh);
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    sta(adr, adrh) {
        if (this.m) {
            this.mem.write(adr, this.br[CPU_REG_A] & 0xff);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[CPU_REG_A]);
        }
    }

    stx(adr, adrh) {
        if (this.x) {
            this.mem.write(adr, this.br[CPU_REG_X] & 0xff);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[CPU_REG_X]);
        }
    }

    sty(adr, adrh) {
        if (this.x) {
            this.mem.write(adr, this.br[CPU_REG_Y] & 0xff);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[CPU_REG_Y]);
        }
    }

    stz(adr, adrh) {
        if (this.m) {
            this.mem.write(adr, 0);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, 0);
        }
    }

    mvn(adr, adrh) {
        this.r[CPU_REG_DBR] = adr;
        this.mem.write((adr << 16) | this.br[CPU_REG_Y], this.mem.read((adrh << 16) | this.br[CPU_REG_X]));
        this.br[CPU_REG_A]--;
        this.br[CPU_REG_X]++;
        this.br[CPU_REG_Y]++;
        if (this.br[CPU_REG_A] !== 0xffff) {
            this.br[CPU_REG_PC] -= 3;
        }
        if (this.x) {
            this.br[CPU_REG_X] &= 0xff;
            this.br[CPU_REG_Y] &= 0xff;
        }
    }

    mvp(adr, adrh) {
        this.r[CPU_REG_DBR] = adr;
        this.mem.write((adr << 16) | this.br[CPU_REG_Y], this.mem.read((adrh << 16) | this.br[CPU_REG_X]));
        this.br[CPU_REG_A]--;
        this.br[CPU_REG_X]--;
        this.br[CPU_REG_Y]--;
        if (this.br[CPU_REG_A] !== 0xffff) {
            this.br[CPU_REG_PC] -= 3;
        }
        if (this.x) {
            this.br[CPU_REG_X] &= 0xff;
            this.br[CPU_REG_Y] &= 0xff;
        }
    }

    nop() {}
    wdm() {}

    pea(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); }
    pei(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); }
    per(adr)       { this.pushWord((this.br[CPU_REG_PC] + adr) & 0xffff); }

    pha() {
        if (this.m) {
            this.pushByte(this.br[CPU_REG_A] & 0xff);
        } else {
            this.cyclesLeft++;
            this.pushWord(this.br[CPU_REG_A]);
        }
    }

    phx() {
        if (this.x) {
            this.pushByte(this.br[CPU_REG_X] & 0xff);
        } else {
            this.cyclesLeft++;
            this.pushWord(this.br[CPU_REG_X]);
        }
    }

    phy() {
        if (this.x) {
            this.pushByte(this.br[CPU_REG_Y] & 0xff);
        } else {
            this.cyclesLeft++;
            this.pushWord(this.br[CPU_REG_Y]);
        }
    }

    pla() {
        if (this.m) {
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (this.pullByte() & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            this.cyclesLeft++;
            this.br[CPU_REG_A] = this.pullWord();
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    plx() {
        if (this.x) {
            this.br[CPU_REG_X] = this.pullByte();
            this.setZandN(this.br[CPU_REG_X], this.x);
        } else {
            this.cyclesLeft++;
            this.br[CPU_REG_X] = this.pullWord();
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    ply() {
        if (this.x) {
            this.br[CPU_REG_Y] = this.pullByte();
            this.setZandN(this.br[CPU_REG_Y], this.x);
        } else {
            this.cyclesLeft++;
            this.br[CPU_REG_Y] = this.pullWord();
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    phb() { this.pushByte(this.r[CPU_REG_DBR]); }
    phd() { this.pushWord(this.br[CPU_REG_DPR]); }
    phk() { this.pushByte(this.r[CPU_REG_K]); }
    php() { this.pushByte(this.getP()); }

    plb() {
        this.r[CPU_REG_DBR] = this.pullByte();
        this.setZandN(this.r[CPU_REG_DBR], true);
    }

    pld() {
        this.br[CPU_REG_DPR] = this.pullWord();
        this.setZandN(this.br[CPU_REG_DPR], false);
    }

    plp() { this.setP(this.pullByte()); }
    stp() { this.stopped = true; }
    wai() { this.waiting = true; }

    tax() {
        if (this.x) {
            this.br[CPU_REG_X] = this.br[CPU_REG_A] & 0xff;
            this.setZandN(this.br[CPU_REG_X], this.x);
        } else {
            this.br[CPU_REG_X] = this.br[CPU_REG_A];
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    tay() {
        if (this.x) {
            this.br[CPU_REG_Y] = this.br[CPU_REG_A] & 0xff;
            this.setZandN(this.br[CPU_REG_Y], this.x);
        } else {
            this.br[CPU_REG_Y] = this.br[CPU_REG_A];
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    tsx() {
        if (this.x) {
            this.br[CPU_REG_X] = this.br[CPU_REG_SP] & 0xff;
            this.setZandN(this.br[CPU_REG_X], this.x);
        } else {
            this.br[CPU_REG_X] = this.br[CPU_REG_SP];
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    txa() {
        if (this.m) {
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (this.br[CPU_REG_X] & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            this.br[CPU_REG_A] = this.br[CPU_REG_X];
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    txs() { this.br[CPU_REG_SP] = this.br[CPU_REG_X]; }

    txy() {
        if (this.x) {
            this.br[CPU_REG_Y] = this.br[CPU_REG_X] & 0xff;
            this.setZandN(this.br[CPU_REG_Y], this.x);
        } else {
            this.br[CPU_REG_Y] = this.br[CPU_REG_X];
            this.setZandN(this.br[CPU_REG_Y], this.x);
        }
    }

    tya() {
        if (this.m) {
            this.br[CPU_REG_A] = (this.br[CPU_REG_A] & 0xff00) | (this.br[CPU_REG_Y] & 0xff);
            this.setZandN(this.br[CPU_REG_A], this.m);
        } else {
            this.br[CPU_REG_A] = this.br[CPU_REG_Y];
            this.setZandN(this.br[CPU_REG_A], this.m);
        }
    }

    tyx() {
        if (this.x) {
            this.br[CPU_REG_X] = this.br[CPU_REG_Y] & 0xff;
            this.setZandN(this.br[CPU_REG_X], this.x);
        } else {
            this.br[CPU_REG_X] = this.br[CPU_REG_Y];
            this.setZandN(this.br[CPU_REG_X], this.x);
        }
    }

    tcd() {
        this.br[CPU_REG_DPR] = this.br[CPU_REG_A];
        this.setZandN(this.br[CPU_REG_DPR], false);
    }

    tcs() { this.br[CPU_REG_SP] = this.br[CPU_REG_A]; }

    tdc() {
        this.br[CPU_REG_A] = this.br[CPU_REG_DPR];
        this.setZandN(this.br[CPU_REG_A], false);
    }

    tsc() {
        this.br[CPU_REG_A] = this.br[CPU_REG_SP];
        this.setZandN(this.br[CPU_REG_A], false);
    }

    xba() {
        const low = this.br[CPU_REG_A] & 0xff;
        const high = (this.br[CPU_REG_A] & 0xff00) >> 8;
        this.br[CPU_REG_A] = (low << 8) | high;
        this.setZandN(this.br[CPU_REG_A], true);
    }

    xce() {
        const temp = this.c;
        this.c = this.e;
        this.e = temp;
        if (this.e) {
            this.m = true;
            this.x = true;
        }
        if (this.x) {
            this.br[CPU_REG_X] &= 0xff;
            this.br[CPU_REG_Y] &= 0xff;
        }
    }

    /**
     * Binds internal 65816 opcode table statically.
     */
    bindInstructionMap() {
        this.functions = [
            this.brk.bind(this),  this.ora.bind(this),  this.cop.bind(this),  this.ora.bind(this),  this.tsb.bind(this),  this.ora.bind(this),  this.asl.bind(this),  this.ora.bind(this),  this.php.bind(this),  this.ora.bind(this),  this.asla.bind(this), this.phd.bind(this),  this.tsb.bind(this),  this.ora.bind(this),  this.asl.bind(this),  this.ora.bind(this),
            this.bpl.bind(this),  this.ora.bind(this),  this.ora.bind(this),  this.ora.bind(this),  this.trb.bind(this),  this.ora.bind(this),  this.asl.bind(this),  this.ora.bind(this),  this.clc.bind(this),  this.ora.bind(this),  this.inca.bind(this), this.tcs.bind(this),  this.trb.bind(this),  this.ora.bind(this),  this.asl.bind(this),  this.ora.bind(this),
            this.jsr.bind(this),  this.and.bind(this),  this.jsl.bind(this),  this.and.bind(this),  this.bit.bind(this),  this.and.bind(this),  this.rol.bind(this),  this.and.bind(this),  this.plp.bind(this),  this.and.bind(this),  this.rola.bind(this), this.pld.bind(this),  this.bit.bind(this),  this.and.bind(this),  this.rol.bind(this),  this.and.bind(this),
            this.bmi.bind(this),  this.and.bind(this),  this.and.bind(this),  this.and.bind(this),  this.bit.bind(this),  this.and.bind(this),  this.rol.bind(this),  this.and.bind(this),  this.sec.bind(this),  this.and.bind(this),  this.deca.bind(this), this.tsc.bind(this),  this.bit.bind(this),  this.and.bind(this),  this.rol.bind(this),  this.and.bind(this),
            this.rti.bind(this),  this.eor.bind(this),  this.wdm.bind(this),  this.eor.bind(this),  this.mvp.bind(this),  this.eor.bind(this),  this.lsr.bind(this),  this.eor.bind(this),  this.pha.bind(this),  this.eor.bind(this),  this.lsra.bind(this), this.phk.bind(this),  this.jmp.bind(this),  this.eor.bind(this),  this.lsr.bind(this),  this.eor.bind(this),
            this.bvc.bind(this),  this.eor.bind(this),  this.eor.bind(this),  this.eor.bind(this),  this.mvn.bind(this),  this.eor.bind(this),  this.lsr.bind(this),  this.eor.bind(this),  this.cli.bind(this),  this.eor.bind(this),  this.phy.bind(this),  this.tcd.bind(this),  this.jml.bind(this),  this.eor.bind(this),  this.lsr.bind(this),  this.eor.bind(this),
            this.rts.bind(this),  this.adc.bind(this),  this.per.bind(this),  this.adc.bind(this),  this.stz.bind(this),  this.adc.bind(this),  this.ror.bind(this),  this.adc.bind(this),  this.pla.bind(this),  this.adc.bind(this),  this.rora.bind(this), this.rtl.bind(this),  this.jmp.bind(this),  this.adc.bind(this),  this.ror.bind(this),  this.adc.bind(this),
            this.bvs.bind(this),  this.adc.bind(this),  this.adc.bind(this),  this.adc.bind(this),  this.stz.bind(this),  this.adc.bind(this),  this.ror.bind(this),  this.adc.bind(this),  this.sei.bind(this),  this.adc.bind(this),  this.ply.bind(this),  this.tdc.bind(this),  this.jmp.bind(this),  this.adc.bind(this),  this.ror.bind(this),  this.adc.bind(this),
            this.bra.bind(this),  this.sta.bind(this),  this.brl.bind(this),  this.sta.bind(this),  this.sty.bind(this),  this.sta.bind(this),  this.stx.bind(this),  this.sta.bind(this),  this.dey.bind(this),  this.biti.bind(this), this.txa.bind(this),  this.phb.bind(this),  this.sty.bind(this),  this.sta.bind(this),  this.stx.bind(this),  this.sta.bind(this),
            this.bcc.bind(this),  this.sta.bind(this),  this.sta.bind(this),  this.sta.bind(this),  this.sty.bind(this),  this.sta.bind(this),  this.stx.bind(this),  this.sta.bind(this),  this.tya.bind(this),  this.sta.bind(this),  this.txs.bind(this),  this.txy.bind(this),  this.stz.bind(this),  this.sta.bind(this),  this.stz.bind(this),  this.sta.bind(this),
            this.ldy.bind(this),  this.lda.bind(this),  this.ldx.bind(this),  this.lda.bind(this),  this.ldy.bind(this),  this.lda.bind(this),  this.ldx.bind(this),  this.lda.bind(this),  this.tay.bind(this),  this.lda.bind(this),  this.tax.bind(this),  this.plb.bind(this),  this.ldy.bind(this),  this.lda.bind(this),  this.ldx.bind(this),  this.lda.bind(this),
            this.bcs.bind(this),  this.lda.bind(this),  this.lda.bind(this),  this.lda.bind(this),  this.ldy.bind(this),  this.lda.bind(this),  this.ldx.bind(this),  this.lda.bind(this),  this.clv.bind(this),  this.lda.bind(this),  this.tsx.bind(this),  this.tyx.bind(this),  this.ldy.bind(this),  this.lda.bind(this),  this.ldx.bind(this),  this.lda.bind(this),
            this.cpy.bind(this),  this.cmp.bind(this),  this.rep.bind(this),  this.cmp.bind(this),  this.cpy.bind(this),  this.cmp.bind(this),  this.dec.bind(this),  this.cmp.bind(this),  this.iny.bind(this),  this.cmp.bind(this),  this.dex.bind(this),  this.wai.bind(this),  this.cpy.bind(this),  this.cmp.bind(this),  this.dec.bind(this),  this.cmp.bind(this),
            this.bne.bind(this),  this.cmp.bind(this),  this.cmp.bind(this),  this.cmp.bind(this),  this.pei.bind(this),  this.cmp.bind(this),  this.dec.bind(this),  this.cmp.bind(this),  this.cld.bind(this),  this.cmp.bind(this),  this.phx.bind(this),  this.stp.bind(this),  this.jml.bind(this),  this.cmp.bind(this),  this.dec.bind(this),  this.cmp.bind(this),
            this.cpx.bind(this),  this.sbc.bind(this),  this.sep.bind(this),  this.sbc.bind(this),  this.cpx.bind(this),  this.sbc.bind(this),  this.inc.bind(this),  this.sbc.bind(this),  this.inx.bind(this),  this.sbc.bind(this),  this.nop.bind(this),  this.xba.bind(this),  this.cpx.bind(this),  this.sbc.bind(this),  this.inc.bind(this),  this.sbc.bind(this),
            this.beq.bind(this),  this.sbc.bind(this),  this.sbc.bind(this),  this.sbc.bind(this),  this.pea.bind(this),  this.sbc.bind(this),  this.inc.bind(this),  this.sbc.bind(this),  this.sed.bind(this),  this.sbc.bind(this),  this.plx.bind(this),  this.xce.bind(this),  this.jsr.bind(this),  this.sbc.bind(this),  this.inc.bind(this),  this.sbc.bind(this),
            this.abo.bind(this),  this.nmi.bind(this),  this.irq.bind(this)
        ];
    }
}

// Backward Compatibility Alias
window.Cpu = SnesCpu;