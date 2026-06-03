/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuAddressing (Prototype Extension)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles absolute/relative physical address decoding and pointer indirection
 * for the 28 addressing modes of the Ricoh 5A22 CPU.
 * 
 * JIT OPTIMIZATIONS (GC-Free Prototype Extension):
 * - Extends SnesCpu.prototype.getAdr to compile address decoding as monomorphic 'this' operations.
 * - Writes coordinates directly on `this.effBuffer` to achieve zero Garbage Collection overhead.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles address translations and pointer resolving.
 */

// We extend the SnesCpu prototype. This compiles natively in the monomorphic 'this' context.
SnesCpu.prototype.getAdr = function(mode) {
    const buf = this.effBuffer;
    const K_bank = this.r[K] << 16;
    const DBR_bank = this.r[DBR] << 16;

    switch(mode) {
        case IMP: {
            // Implied / Accumulator
            buf[0] = 0; buf[1] = 0;
            return buf;
        }

        case IMM: {
            // Immediate (Always 8-bit)
            buf[0] = K_bank | this.br[PC]++;
            buf[1] = 0;
            return buf;
        }

        case IMMm: {
            // Immediate (Size depends on M flag)
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
            // Immediate (Size depends on X flag)
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
            // Immediate (Always 16-bit)
            buf[0] = K_bank | this.br[PC]++;
            buf[1] = K_bank | this.br[PC]++;
            return buf;
        }

        case DP: {
            // Direct Page
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            buf[0] = (this.br[DPR] + adr) & 0xffff;
            buf[1] = (this.br[DPR] + adr + 1) & 0xffff;
            return buf;
        }

        case DPX: {
            // Direct Page Indexed on X
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            buf[0] = (this.br[DPR] + adr + this.br[X]) & 0xffff;
            buf[1] = (this.br[DPR] + adr + this.br[X] + 1) & 0xffff;
            return buf;
        }

        case DPY: {
            // Direct Page Indexed on Y
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            buf[0] = (this.br[DPR] + adr + this.br[Y]) & 0xffff;
            buf[1] = (this.br[DPR] + adr + this.br[Y] + 1) & 0xffff;
            return buf;
        }

        case IDP: {
            // Direct Indirect
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xffff)) << 8;
            buf[0] = DBR_bank + pointer;
            buf[1] = DBR_bank + pointer + 1;
            return buf;
        }

        case IDX: {
            // Direct Indirect Indexed (X)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr + this.br[X]) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + this.br[X] + 1) & 0xffff)) << 8;
            buf[0] = DBR_bank + pointer;
            buf[1] = DBR_bank + pointer + 1;
            return buf;
        }

        case IDY: {
            // Indirect Direct Indexed (Y), for RMW and writes
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xffff)) << 8;
            buf[0] = DBR_bank + pointer + this.br[Y];
            buf[1] = DBR_bank + pointer + this.br[Y] + 1;
            return buf;
        }

        case IDYr: {
            // Indirect Direct Indexed (Y), for reads (possible extra cycle)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xffff)) << 8;
            if (((pointer >> 8) !== ((pointer + this.br[Y]) >> 8)) || !this.x) {
                this.cyclesLeft++; // Page crossed, or X is 0: 1 extra cycle
            }
            buf[0] = DBR_bank + pointer + this.br[Y];
            buf[1] = DBR_bank + pointer + this.br[Y] + 1;
            return buf;
        }

        case IDL: {
            // Indirect Direct Long
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xffff)) << 8;
            pointer |= (this.mem.read((this.br[DPR] + adr + 2) & 0xffff)) << 16;
            buf[0] = pointer;
            buf[1] = pointer + 1;
            return buf;
        }

        case ILY: {
            // Indirect Direct Long Indexed (Y)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            if ((this.br[DPR] & 0xff) !== 0) {
                this.cyclesLeft++; // DPRl not 0: 1 extra cycle
            }
            let pointer = this.mem.read((this.br[DPR] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[DPR] + adr + 1) & 0xffff)) << 8;
            pointer |= (this.mem.read((this.br[DPR] + adr + 2) & 0xffff)) << 16;
            buf[0] = pointer + this.br[Y];
            buf[1] = pointer + this.br[Y] + 1;
            return buf;
        }

        case SR: {
            // Stack Relative
            let adr = this.mem.read(K_bank | this.br[PC]++);
            buf[0] = (this.br[SP] + adr) & 0xffff;
            buf[1] = (this.br[SP] + adr + 1) & 0xffff;
            return buf;
        }

        case ISY: {
            // Stack Relative Indexed
            let adr = this.mem.read(K_bank | this.br[PC]++);
            let pointer = this.mem.read((this.br[SP] + adr) & 0xffff);
            pointer |= (this.mem.read((this.br[SP] + adr + 1) & 0xffff)) << 8;
            buf[0] = DBR_bank + pointer + this.br[Y];
            buf[1] = DBR_bank + pointer + this.br[Y] + 1;
            return buf;
        }

        case ABS: {
            // Absolute
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            buf[0] = DBR_bank + adr;
            buf[1] = DBR_bank + adr + 1;
            return buf;
        }

        case ABX: {
            // Absolute Indexed on X for RMW and writes
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            buf[0] = DBR_bank + adr + this.br[X];
            buf[1] = DBR_bank + adr + this.br[X] + 1;
            return buf;
        }

        case ABXr: {
            // Absolute Indexed on X for reads (possible extra cycle)
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
            // Absolute Indexed on Y for RMW and writes
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            buf[0] = DBR_bank + adr + this.br[Y];
            buf[1] = DBR_bank + adr + this.br[Y] + 1;
            return buf;
        }

        case ABYr: {
            // Absolute Indexed on Y for reads (possible extra cycle)
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
            // Absolute Long
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            adr |= this.mem.read(K_bank | this.br[PC]++) << 16;
            buf[0] = adr;
            buf[1] = adr + 1;
            return buf;
        }

        case ALX: {
            // Absolute Long Indexed (X)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            adr |= this.mem.read(K_bank | this.br[PC]++) << 16;
            buf[0] = adr + this.br[X];
            buf[1] = adr + this.br[X] + 1;
            return buf;
        }

        case IND: {
            // Indirect (JMP only)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            let pointer = this.mem.read(adr);
            pointer |= this.mem.read((adr + 1) & 0xffff) << 8;
            buf[0] = K_bank + pointer;
            buf[1] = 0;
            return buf;
        }

        case IAX: {
            // Indirect Indexed (X) (JSR only)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            let pointer = this.mem.read(K_bank | ((adr + this.br[X]) & 0xffff));
            pointer |= this.mem.read(K_bank | ((adr + this.br[X] + 1) & 0xffff)) << 8;
            buf[0] = K_bank + pointer;
            buf[1] = 0;
            return buf;
        }

        case IAL: {
            // Indirect Long (JML only)
            let adr = this.mem.read(K_bank | this.br[PC]++);
            adr |= this.mem.read(K_bank | this.br[PC]++) << 8;
            let pointer = this.mem.read(adr);
            pointer |= this.mem.read((adr + 1) & 0xffff) << 8;
            pointer |= this.mem.read((adr + 2) & 0xffff) << 16;
            buf[0] = pointer;
            buf[1] = 0;
            return buf;
        }

        case REL: {
            // Relative (8-bit signed branch offset)
            let rel = this.mem.read(K_bank | this.br[PC]++);
            buf[0] = this.getSigned(rel, true);
            buf[1] = 0;
            return buf;
        }

        case RLL: {
            // Relative Long (16-bit signed branch offset)
            let rel = this.mem.read(K_bank | this.br[PC]++);
            rel |= this.mem.read(K_bank | this.br[PC]++) << 8;
            buf[0] = this.getSigned(rel, false);
            buf[1] = 0;
            return buf;
        }

        case BM: {
            // Block Move (MVP / MVN)
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