/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAddressing (Prototype Extension)
 * Author: Enrique González Gutiérrez <enrique.gonzalez.gutierrez@gmail.com>
 * 
 * ROLE:
 * Handles absolute/relative physical address decoding and pointer indirection
 * for the 28 addressing modes of the Ricoh 5A22 CPU.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively processes address translations,
 *   operand fetching, and page-boundary cycle penalties.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Block-scoped to isolate register index constants and prevent global window lookups.
 * - Flat mathematical paths designed for rapid JIT execution.
 */

{
    // High-Speed Local Register Index Constants
    const A   = 0;
    const X   = 1;
    const Y   = 2;
    const SP  = 3;
    const PC  = 4;
    const DPR = 5;

    const DBR = 0;
    const K   = 1;

    // Hardware Addressing Mode Identifier Constants
    const IMP   = 0;
    const IMM   = 1;
    const IMMm  = 2;
    const IMMx  = 3;
    const IMMl  = 4;
    const DP    = 5;
    const DPX   = 6;
    const DPY   = 7;
    const IDP   = 8;
    const IDX   = 9;
    const IDY   = 10;
    const IDYr  = 11;
    const IDL   = 12;
    const ILY   = 13;
    const SR    = 14;
    const ISY   = 15;
    const ABS   = 16;
    const ABX   = 17;
    const ABXr  = 18;
    const ABY   = 19;
    const ABYr  = 20;
    const ABL   = 21;
    const ALX   = 22;
    const IND   = 23;
    const IAX   = 24;
    const IAL   = 25;
    const REL   = 26;
    const RLL   = 27;
    const BM    = 28;

    SnesCpu.prototype.getAdr = function(mode) {
        const buf = this.effBuffer;
        const K_bank = this.r[K] << 16;
        const DBR_bank = this.r[DBR] << 16;

        switch (mode) {
            case IMP: {
                buf[0] = 0; buf[1] = 0;
                return buf;
            }

            case IMM: {
                buf[0] = K_bank | this.br[PC]++;
                buf[1] = 0;
                return buf;
            }

            case IMMm: {
                if (this.m) {
                    buf[0] = K_bank | this.br[PC]++;
                    buf[1] = 0;
                } else {
                    buf[0] = K_bank | this.br[PC]++;
                    buf[1] = K_bank | this.br[PC]++;
                }
                return buf;
            }

            case IMMx: {
                if (this.x) {
                    buf[0] = K_bank | this.br[PC]++;
                    buf[1] = 0;
                } else {
                    buf[0] = K_bank | this.br[PC]++;
                    buf[1] = K_bank | this.br[PC]++;
                }
                return buf;
            }

            case IMMl: {
                buf[0] = K_bank | this.br[PC]++;
                buf[1] = K_bank | this.br[PC]++;
                return buf;
            }

            case DP: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                buf[0] = (this.br[DPR] + adr) & 0xFFFF;
                buf[1] = (this.br[DPR] + adr + 1) & 0xFFFF;
                return buf;
            }

            case DPX: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                buf[0] = (this.br[DPR] + adr + this.br[X]) & 0xFFFF;
                buf[1] = (this.br[DPR] + adr + this.br[X] + 1) & 0xFFFF;
                return buf;
            }

            case DPY: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                buf[0] = (this.br[DPR] + adr + this.br[Y]) & 0xFFFF;
                buf[1] = (this.br[DPR] + adr + this.br[Y] + 1) & 0xFFFF;
                return buf;
            }

            case IDP: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xFFFF)) << 8;
                buf[0] = DBR_bank + pointer;
                buf[1] = DBR_bank + pointer + 1;
                return buf;
            }

            case IDX: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr + this.br[X]) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + this.br[X] + 1) & 0xFFFF)) << 8;
                buf[0] = DBR_bank + pointer;
                buf[1] = DBR_bank + pointer + 1;
                return buf;
            }

            case IDY: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xFFFF)) << 8;
                buf[0] = DBR_bank + pointer + this.br[Y];
                buf[1] = DBR_bank + pointer + this.br[Y] + 1;
                return buf;
            }

            case IDYr: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xFFFF)) << 8;
                if (((pointer >> 8) !== ((pointer + this.br[Y]) >> 8)) || !this.x) {
                    this.cyclesLeft++; // Page crossed, or X is 0: 1 extra cycle
                }
                buf[0] = DBR_bank + pointer + this.br[Y];
                buf[1] = DBR_bank + pointer + this.br[Y] + 1;
                return buf;
            }

            case IDL: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xFFFF)) << 8;
                pointer |= (this.mem.read((this.br[DPR] + adr + 2) & 0xFFFF)) << 16;
                buf[0] = pointer;
                buf[1] = pointer + 1;
                return buf;
            }

            case ILY: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                if ((this.br[DPR] & 0xFF) !== 0) {
                    this.cyclesLeft++; // DPRl not 0: 1 extra cycle
                }
                let pointer = this.mem.read((this.br[DPR] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xFFFF)) << 8;
                pointer |= (this.mem.read((this.br[DPR] + adr + 2) & 0xFFFF)) << 16;
                buf[0] = pointer + this.br[Y];
                buf[1] = pointer + this.br[Y] + 1;
                return buf;
            }

            case SR: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                buf[0] = (this.br[SP] + adr) & 0xFFFF;
                buf[1] = (this.br[SP] + adr + 1) & 0xFFFF;
                return buf;
            }

            case ISY: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                let pointer = this.mem.read((this.br[SP] + adr) & 0xFFFF);
                pointer |= (this.mem.read((this.br[SP] + adr + 1) & 0xFFFF)) << 8;
                buf[0] = DBR_bank + pointer + this.br[Y];
                buf[1] = DBR_bank + pointer + this.br[Y] + 1;
                return buf;
            }

            case ABS: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                buf[0] = DBR_bank + adr;
                buf[1] = DBR_bank + adr + 1;
                return buf;
            }

            case ABX: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                buf[0] = DBR_bank + adr + this.br[X];
                buf[1] = DBR_bank + adr + this.br[X] + 1;
                return buf;
            }

            case ABXr: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                if (((adr >> 8) !== ((adr + this.br[X]) >> 8)) || !this.x) {
                    this.cyclesLeft++; // Page crossed, or X is 0: 1 extra cycle
                }
                buf[0] = DBR_bank + adr + this.br[X];
                buf[1] = DBR_bank + adr + this.br[X] + 1;
                return buf;
            }

            case ABY: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                buf[0] = DBR_bank + adr + this.br[Y];
                buf[1] = DBR_bank + adr + this.br[Y] + 1;
                return buf;
            }

            case ABYr: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                if (((adr >> 8) !== ((adr + this.br[Y]) >> 8)) || !this.x) {
                    this.cyclesLeft++; // Page crossed, or X is 0: 1 extra cycle
                }
                buf[0] = DBR_bank + adr + this.br[Y];
                buf[1] = DBR_bank + adr + this.br[Y] + 1;
                return buf;
            }

            case ABL: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                adr |= this.mem.read(K_bank | this.br[PC]++) << 16;
                buf[0] = adr;
                buf[1] = adr + 1;
                return buf;
            }

            case ALX: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                adr |= this.mem.read(K_bank | this.br[PC]++) << 16;
                buf[0] = adr + this.br[X];
                buf[1] = adr + this.br[X] + 1;
                return buf;
            }

            case IND: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                let pointer = this.mem.read(adr);
                pointer |= this.mem.read((adr + 1) & 0xFFFF) << 8;
                buf[0] = K_bank + pointer;
                buf[1] = 0;
                return buf;
            }

            case IAX: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                let pointer = this.mem.read(K_bank | ((adr + this.br[X]) & 0xFFFF));
                pointer |= this.mem.read(K_bank | ((adr + this.br[X] + 1) & 0xFFFF)) << 8;
                buf[0] = K_bank + pointer;
                buf[1] = 0;
                return buf;
            }

            case IAL: {
                let adr = this.mem.read(K_bank | this.br[PC]++);
                adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
                let pointer = this.mem.read(adr);
                pointer |= this.mem.read((adr + 1) & 0xFFFF) << 8;
                pointer |= this.mem.read((adr + 2) & 0xFFFF) << 16;
                buf[0] = pointer;
                buf[1] = 0;
                return buf;
            }

            case REL: {
                let rel = this.mem.read(K_bank | this.br[PC]++);
                buf[0] = this.getSigned(rel, true);
                buf[1] = 0;
                return buf;
            }

            case RLL: {
                let rel = this.mem.read(K_bank | this.br[PC]++);
                rel |= this.mem.read(K_bank | this.br[PC]++) << 8;
                buf[0] = this.getSigned(rel, false);
                buf[1] = 0;
                return buf;
            }

            case BM: {
                let dest = this.mem.read(K_bank | this.br[PC]++);
                let src = this.mem.read(K_bank | this.br[PC]++);
                buf[0] = dest;
                buf[1] = src;
                return buf;
            }

            default: {
                buf[0] = 0; buf[1] = 0;
                return buf;
            }
        }
    };
}