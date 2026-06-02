/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Data Transfer Instructions
 * 
 * Implements loads (LDA, LDX, LDY), stores (STA, STX, STY, STZ), register transfers 
 * (TAX, TAY, TSX, TXA, TXS, TXY, TYA, TYX, TCD, TCS, TDC, TSC, XBA), and stack 
 * pushes and pulls (PHA, PHP, PLA, PLP, PHX, PHY, PLX, PLY, PHD, PLD, PHK, PHB, PLB, 
 * PEA, PEI, PER).
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] CPU Cycle Double-Counting: Removed manual increments of cpu.cpuMemOps. 
 *   Bus cycles are already tracked automatically inside SnesBus.js's read/write 
 *   passways. Manual modifications corrupted the orchestrated timeline and caused freezes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines registers movements, 
 *   stack pushes/pulls, and register-to-register transfers to a dedicated module.
 */

{
    class SnesCpuDataTransfer {
        /**
         * Registers Data Transfer instructions onto the CPU's opcode table.
         * @param {Cpu} cpu - Main CPU orchestrator.
         * @param {Array<Function>} table - Opcode dispatch table.
         */
        static register(cpu, table) {
            const regs = cpu.registers;
            const bus = cpu.bus;

            // ========================================================================
            // LOCAL HELPERS
            // ========================================================================

            /**
             * Helper to read a byte or word from memory depending on register size.
             */
            function readMemVal(adr, adrh, is8Bit) {
                if (is8Bit) {
                    return bus.read(adr) & 0xFF;
                } else {
                    const low = bus.read(adr) & 0xFF;
                    const high = bus.read(adrh) & 0xFF;
                    return (high << 8) | low;
                }
            }

            /**
             * Helper to write a byte or word to memory depending on register size.
             */
            function writeMemVal(adr, adrh, val, is8Bit) {
                if (is8Bit) {
                    bus.write(adr, val & 0xFF);
                } else {
                    bus.write(adr, val & 0xFF);
                    bus.write(adrh, (val >> 8) & 0xFF);
                }
            }

            /**
             * Helper to read a 16-bit word from memory.
             */
            function readWord(adr, adrh) {
                const low = bus.read(adr) & 0xFF;
                const high = bus.read(adrh) & 0xFF;
                return (high << 8) | low;
            }

            /**
             * Helper to write a 16-bit word to memory.
             */
            function writeWord(adr, adrh, val) {
                bus.write(adr, val & 0xFF);
                bus.write(adrh, (val >> 8) & 0xFF);
            }

            /**
             * Sets Zero (Z) and Negative (N) flags based on register size.
             */
            function setZandN(value, is8Bit) {
                if (is8Bit) {
                    regs.z = (value & 0xFF) === 0;
                    regs.n = (value & 0x80) > 0;
                } else {
                    regs.z = (value & 0xFFFF) === 0;
                    regs.n = (value & 0x8000) > 0;
                }
            }

            // ========================================================================
            // HOISTED INSTRUCTION HANDLERS
            // ========================================================================

            /**
             * LDA (Load Accumulator from Memory): Loads register A/C with a byte/word.
             */
            function lda(adr, adrh) {
                if (regs.m) {
                    regs.a = bus.read(adr) & 0xFF;
                    setZandN(regs.a, true);
                } else {
                    regs.c = readWord(adr, adrh);
                    setZandN(regs.c, false);
                }
            }

            /**
             * LDX (Load Index X from Memory): Loads register X with a byte/word.
             */
            function ldx(adr, adrh) {
                if (regs.xFlag) {
                    regs.x = bus.read(adr) & 0xFF;
                    setZandN(regs.x, true);
                } else {
                    regs.x = readWord(adr, adrh);
                    setZandN(regs.x, false);
                }
            }

            /**
             * LDY (Load Index Y from Memory): Loads register Y with a byte/word.
             */
            function ldy(adr, adrh) {
                if (regs.xFlag) {
                    regs.y = bus.read(adr) & 0xFF;
                    setZandN(regs.y, true);
                } else {
                    regs.y = readWord(adr, adrh);
                    setZandN(regs.y, false);
                }
            }

            /**
             * STA (Store Accumulator to Memory): Writes register A/C byte/word to memory.
             */
            function sta(adr, adrh) {
                if (regs.m) {
                    bus.write(adr, regs.a & 0xFF);
                } else {
                    writeWord(adr, adrh, regs.c);
                }
            }

            /**
             * STX (Store Index X to Memory): Writes register X byte/word to memory.
             */
            function stx(adr, adrh) {
                if (regs.xFlag) {
                    bus.write(adr, regs.x & 0xFF);
                } else {
                    writeWord(adr, adrh, regs.x);
                }
            }

            /**
             * STY (Store Index Y to Memory): Writes register Y byte/word to memory.
             */
            function sty(adr, adrh) {
                if (regs.xFlag) {
                    bus.write(adr, regs.y & 0xFF);
                } else {
                    writeWord(adr, adrh, regs.y);
                }
            }

            /**
             * STZ (Store Zero to Memory): Writes 0 (byte/word) directly to memory.
             */
            function stz(adr, adrh) {
                if (regs.m) {
                    bus.write(adr, 0);
                } else {
                    writeWord(adr, adrh, 0);
                }
            }

            // --- Stack Pushes & Pulls ---
            
            function pha() {
                if (regs.m) {
                    cpu.pushByte(regs.a);
                } else {
                    cpu.pushWord(regs.c);
                }
            }

            function phx() {
                if (regs.xFlag) {
                    cpu.pushByte(regs.x);
                } else {
                    cpu.pushWord(regs.x);
                }
            }

            function phy() {
                if (regs.xFlag) {
                    cpu.pushByte(regs.y);
                } else {
                    cpu.pushWord(regs.y);
                }
            }

            function pla() {
                const val = regs.m ? cpu.pullByte() : cpu.pullWord();
                if (regs.m) {
                    regs.a = val;
                } else {
                    regs.c = val;
                }
                setZandN(val, regs.m);
            }

            function plx() {
                const val = regs.xFlag ? cpu.pullByte() : cpu.pullWord();
                regs.x = val;
                setZandN(val, regs.xFlag);
            }

            function ply() {
                const val = regs.xFlag ? cpu.pullByte() : cpu.pullWord();
                regs.y = val;
                setZandN(val, regs.xFlag);
            }

            function pea(adr, adrh) { cpu.pushWord(readWord(adr, adrh)); }
            function pei(adr, adrh) { cpu.pushWord(readWord(adr, adrh)); }
            function per(adr, adrh) { cpu.pushWord((regs.pc + adr) & 0xFFFF); }

            function phb() { cpu.pushByte(regs.db); }
            function phd() { cpu.pushWord(regs.dp); }
            function phk() { cpu.pushByte(regs.pb); }
            function php() { cpu.pushByte(regs.p);  }
            
            function plb() { regs.db = cpu.pullByte(); setZandN(regs.db, true); }
            function pld() { regs.dp = cpu.pullWord(); setZandN(regs.dp, false); }
            function plp() { regs.p = cpu.pullByte();  }

            // --- Register-to-Register Transfers ---
            
            function tax() { regs.x = regs.xFlag ? (regs.a & 0xFF) : regs.c; setZandN(regs.x, regs.xFlag); }
            function tay() { regs.y = regs.xFlag ? (regs.a & 0xFF) : regs.c; setZandN(regs.y, regs.xFlag); }
            function tsx() { regs.x = regs.xFlag ? (regs.sp & 0xFF) : regs.sp; setZandN(regs.x, regs.xFlag); }
            function txa() { if (regs.m) regs.a = regs.x & 0xFF; else regs.c = regs.x; setZandN(regs.m ? regs.a : regs.c, regs.m); }
            function txs() { regs.sp = regs.x; }
            function txy() { regs.y = regs.xFlag ? (regs.x & 0xFF) : regs.x; setZandN(regs.y, regs.xFlag); }
            function tya() { if (regs.m) regs.a = regs.y & 0xFF; else regs.c = regs.y; setZandN(regs.m ? regs.a : regs.c, regs.m); }
            function tyx() { regs.x = regs.xFlag ? (regs.y & 0xFF) : regs.y; setZandN(regs.x, regs.xFlag); }

            function tcd() { regs.dp = regs.c; setZandN(regs.dp, false); }
            function tcs() { regs.sp = regs.c; }
            function tdc() { regs.c = regs.dp; setZandN(regs.c, false); }
            function tsc() { regs.c = regs.sp; setZandN(regs.c, false); }

            function xba() {
                const low = regs.c & 0xFF;
                const high = (regs.c >> 8) & 0xFF;
                regs.c = (low << 8) | high;
                setZandN(regs.c, true);
            }

            // ========================================================================
            // BIND DATA TRANSFER OPCODES
            // ========================================================================

            // LDA Family
            table[0xA1] = lda; table[0xA3] = lda; table[0xA5] = lda; table[0xA7] = lda;
            table[0xA9] = lda; table[0xAD] = lda; table[0xAF] = lda; table[0xB1] = lda;
            table[0xB2] = lda; table[0xB3] = lda; table[0xB5] = lda; table[0xB9] = lda;
            table[0xBD] = lda; table[0xBF] = lda;

            // LDX Family
            table[0xA2] = ldx; table[0xA6] = ldx; table[0xAE] = ldx; table[0xB6] = ldx;
            table[0xBE] = ldx;

            // LDY Family
            table[0xA0] = ldy; table[0xA4] = ldy; table[0xAC] = ldy; table[0xB4] = ldy;
            table[0xBC] = ldy;

            // STA Family
            table[0x81] = sta; table[0x83] = sta; table[0x85] = sta; table[0x87] = sta;
            table[0x8D] = sta; 
            table[0x8F] = sta; table[0x91] = sta; table[0x92] = sta; table[0x93] = sta;
            table[0x95] = sta; table[0x99] = sta; table[0x9D] = sta; table[0x9F] = sta;

            // STX Family
            table[0x86] = stx; table[0x8E] = stx; table[0x96] = stx;

            // STY Family
            table[0x84] = sty; table[0x8C] = sty; table[0x94] = sty;

            // STZ Family
            table[0x64] = stz; table[0x74] = stz; table[0x9C] = stz; table[0x9E] = stz;

            // Pushes & Pulls
            table[0x08] = php; table[0x48] = pha; table[0xDA] = phx; table[0x5A] = phy;
            table[0x28] = plp; table[0x68] = pla; table[0xFA] = plx; table[0x7A] = ply;
            table[0x0B] = phd; table[0x2B] = pld; table[0x4B] = phk; table[0x8B] = phb;
            table[0xAB] = plb; table[0xF4] = pea; table[0xD4] = pei; table[0x62] = per;

            // Register Transfers
            table[0xAA] = tax; table[0xA8] = tay; table[0xBA] = tsx; table[0x8A] = txa;
            table[0x9A] = txs; table[0x9B] = txy; table[0x98] = tya; table[0xBB] = tyx;
            table[0x5B] = tcd; table[0x1B] = tcs; table[0x7B] = tdc; table[0x3B] = tsc;
            table[0xEB] = xba;
        }
    }

    window.SnesCpuDataTransfer = SnesCpuDataTransfer;
}