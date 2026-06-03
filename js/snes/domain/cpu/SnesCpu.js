/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpu (Ricoh 5A22 CPU Core - JIT Optimized Base)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Coordinates the execution state, registers, flags and main cycle loop 
 * of the 65816-compatible Ricoh 5A22 CPU.
 * 
 * JIT OPTIMIZATIONS (SOLID Prototype Extension):
 * - Serves as the base class for prototype extensions (Addressing, ALU, Instructions).
 * - Pre-allocates a static `effBuffer` array to prevent Garbage Collection pauses.
 * - Pre-binds the entire 256-opcode function table to avoid dynamic `.call()` checks.
 * 
 * SOLID Principles:
 * - SRP: Exclusively manages core CPU state, register boundaries, and execution pacing.
 */

// CPU Register Array Constants (Local scope for high-speed indexing)
const DBR = 0;   // Data Bank Register
const K = 1;     // Program Bank Register

const A = 0;     // Accumulator
const X = 1;     // X Index Register
const Y = 2;     // Y Index Register
const SP = 3;    // Stack Pointer
const PC = 4;    // Program Counter
const DPR = 5;   // Direct Page Register

class SnesCpu {
    /**
     * @param {SnesMemoryRouter} mem - Unified system memory bus router.
     */
    constructor(mem) {
        this.mem = mem;

        // Core Registers
        this.r = new Uint8Array(2);     // 8-bit registers: [DBR, K]
        this.br = new Uint16Array(6);   // 16-bit registers: [A, X, Y, SP, PC, DPR]

        // Processor Status Flags (Clipped to independent booleans for JIT efficiency)
        this.n = false; // Negative
        this.v = false; // Overflow
        this.m = true;  // Memory/Accumulator select (8/16-bit)
        this.x = true;  // Index select (8/16-bit)
        this.d = false; // Decimal mode
        this.i = false; // IRQ disable
        this.z = false; // Zero
        this.c = false; // Carry
        this.e = true;  // 6502 Emulation mode select

        // Interrupt Lines
        this.irqWanted = false;
        this.nmiWanted = false;
        this.aboWanted = false;

        this.stopped = false;
        this.waiting = false;
        this.cyclesLeft = 0;

        // Pre-allocated static address buffer to avoid Garbage Collection (GC Free)
        this.effBuffer = new Uint32Array(2);

        // Hardware Opcode Addressing Modes Table
        this.modes = [
            0,  9,  1,  14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 11, 8,  15, 5,  6,  6,  13, 0,  20, 0,  0,  16, 18, 17, 22,
            16, 9,  21, 14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 11, 8,  15, 6,  6,  6,  13, 0,  20, 0,  0,  18, 18, 17, 22,
            0,  9,  1,  14, 28, 5,  5,  12, 0,  2,  0,  0,  21, 16, 16, 21,
            26, 11, 8,  15, 28, 6,  6,  13, 0,  20, 0,  0,  21, 18, 17, 22,
            0,  9,  27, 14, 5,  5,  5,  12, 0,  2,  0,  0,  23, 16, 16, 21,
            26, 11, 8,  15, 6,  6,  6,  13, 0,  20, 0,  0,  24, 18, 17, 22,
            26, 9,  27, 14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 10, 8,  15, 6,  6,  7,  13, 0,  19, 0,  0,  16, 17, 17, 22,
            3,  9,  3,  14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 11, 8,  15, 6,  6,  7,  13, 0,  20, 0,  0,  18, 18, 20, 22,
            3,  9,  1,  14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 11, 8,  15, 5,  6,  6,  13, 0,  20, 0,  0,  25, 18, 17, 22,
            3,  9,  1,  14, 5,  5,  5,  12, 0,  2,  0,  0,  16, 16, 16, 21,
            26, 11, 8,  15, 4,  6,  6,  13, 0,  20, 0,  0,  24, 18, 17, 22,
            0,  0,  0 // Internal vectors
        ];

        // Hardware Opcode Cycle Durations Table
        this.cycles = [
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
            7, 7, 7 // Internal vectors
        ];

        // Mapped dynamic instructions set (Bridges prototype-extended functions)
        this.functions = [];

        this.bindInstructionMap();
        this.reset();
    }

    reset() {
        this.r[DBR] = 0;
        this.r[K] = 0;

        this.br[A] = 0;
        this.br[X] = 0;
        this.br[Y] = 0;
        this.br[SP] = 0;
        this.br[DPR] = 0;

        if (this.mem.read) {
            // Read hardware Emulation Mode reset vector from memory map ($FFFC-$FFFD)
            this.br[PC] = this.mem.read(0xfffc) | (this.mem.read(0xfffd) << 8);
        } else {
            this.br[PC] = 0;
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
        this.effBuffer.fill(0);
    }

    /**
     * Highly Optimized Hot Path CPU Execution Step.
     * GC-FREE: Reuses the static effBuffer to prevent runtime array allocations.
     */
    cycle() {
        if (this.cyclesLeft === 0) {
            if (this.stopped) {
                this.cyclesLeft = 1;
            } else if (!this.waiting) {
                // Fetch opcode byte with strict 16-bit PC wrapping
                let instr = this.mem.read((this.r[K] << 16) | this.br[PC]++);
                this.cyclesLeft = this.cycles[instr];
                let mode = this.modes[instr];

                // Interrupt Line check
                if ((this.irqWanted && !this.i) || this.nmiWanted || this.aboWanted) {
                    this.br[PC]--;
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

                // Resolves addressing mode dynamically directly into this.effBuffer (GC-Free!)
                const adrs = this.getAdr(mode);
                
                // Fast JIT Dispatch: No slow .call() overhead
                this.functions[instr](adrs[0], adrs[1]);
            } else {
                if (this.aboWanted || this.irqWanted || this.nmiWanted) {
                    this.waiting = false;
                }
                this.cyclesLeft = 1;
            }
        }
        this.cyclesLeft--;
    }

    // ========================================================================
    // CO-PROCESSORS HELPER METHODS (Monomorphic context)
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
            this.br[X] &= 0xff;
            this.br[Y] &= 0xff;
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
            this.br[PC] = (this.br[PC] + rel) & 0xffff;
        }
    }

    pushByte(value) {
        if (this.e) {
            this.mem.write((this.br[SP] & 0xff) | 0x100, value);
        } else {
            this.mem.write(this.br[SP], value);
        }
        this.br[SP]--;
    }

    pullByte() {
        this.br[SP]++;
        if (this.e) {
            return this.mem.read((this.br[SP] & 0xff) | 0x100);
        }
        return this.mem.read(this.br[SP]);
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

    /**
     * Maps and pre-binds all instructions to the class prototype array.
     * This isolates files while keeping V8 monomorphic.
     */
    bindInstructionMap() {
        const self = this;
        
        //Opcode-to-function bindings (Will be extended by SnesCpuDecoder/SnesCpuInstructions)
        this.functions = [
            this.brk, this.ora, this.cop, this.ora, this.tsb, this.ora, this.asl, this.ora, this.php, this.ora, this.asla,this.phd, this.tsb, this.ora, this.asl, this.ora,
            this.bpl, this.ora, this.ora, this.ora, this.trb, this.ora, this.asl, this.ora, this.clc, this.ora, this.inca,this.tcs, this.trb, this.ora, this.asl, this.ora,
            this.jsr, this.and, this.jsl, this.and, this.bit, this.and, this.rol, this.and, this.plp, this.and, this.rola,this.pld, this.bit, this.and, this.rol, this.and,
            this.bmi, this.and, this.and, this.and, this.bit, this.and, this.rol, this.and, this.sec, this.and, this.deca,this.tsc, this.bit, this.and, this.rol, this.and,
            this.rti, this.eor, this.wdm, this.eor, this.mvp, this.eor, this.lsr, this.eor, this.pha, this.eor, this.lsra,this.phk, this.jmp, this.eor, this.lsr, this.eor,
            this.bvc, this.eor, this.eor, this.eor, this.mvn, this.eor, this.lsr, this.eor, this.cli, this.eor, this.phy, this.tcd, this.jml, this.eor, this.lsr, this.eor,
            this.rts, this.adc, this.per, this.adc, this.stz, this.adc, this.ror, this.adc, this.pla, this.adc, this.rora,this.rtl, this.jmp, this.adc, this.ror, this.adc,
            this.bvs, this.adc, this.adc, this.adc, this.stz, this.adc, this.ror, this.adc, this.sei, this.adc, this.ply, this.tdc, this.jmp, this.adc, this.ror, this.adc,
            this.bra, this.sta, this.brl, this.sta, this.sty, this.sta, this.stx, this.sta, this.dey, this.biti,this.txa, this.phb, this.sty, this.sta, this.stx, this.sta,
            this.bcc, this.sta, this.sta, this.sta, this.sty, this.sta, this.stx, this.sta, this.tya, this.sta, this.txs, this.txy, this.stz, this.sta, this.stz, this.sta,
            this.ldy, this.lda, this.ldx, this.lda, this.ldy, this.lda, this.ldx, this.lda, this.tay, this.lda, this.tax, this.plb, this.ldy, this.lda, this.ldx, this.lda,
            this.bcs, this.lda, this.lda, this.lda, this.ldy, this.lda, this.ldx, this.lda, this.clv, this.lda, this.tsx, this.tyx, this.ldy, this.lda, this.ldx, this.lda,
            this.cpy, this.cmp, this.rep, this.cmp, this.cpy, this.cmp, this.dec, this.cmp, this.iny, this.cmp, this.dex, this.wai, this.cpy, this.cmp, this.dec, this.cmp,
            this.bne, this.cmp, this.cmp, this.cmp, this.pei, this.cmp, this.dec, this.cmp, this.cld, this.cmp, this.phx, this.stp, this.jml, this.cmp, this.dec, this.cmp,
            this.cpx, this.sbc, this.sep, this.sbc, this.cpx, this.sbc, this.inc, this.sbc, this.inx, this.sbc, this.nop, this.xba, this.cpx, this.sbc, this.inc, this.sbc,
            this.beq, this.sbc, this.sbc, this.sbc, this.pea, this.sbc, this.inc, this.sbc, this.sed, this.sbc, this.plx, this.xce, this.jsr, this.sbc, this.inc, this.sbc,
            this.abo, this.nmi, this.irq // Internal vectors
        ];

        // Pre-binds for extreme JIT-friendly performance
        for (let i = 0; i < this.functions.length; i++) {
            if (this.functions[i]) {
                this.functions[i] = this.functions[i].bind(self);
            }
        }
    }
}

// Backward Compatibility Alias
window.Cpu = SnesCpu;