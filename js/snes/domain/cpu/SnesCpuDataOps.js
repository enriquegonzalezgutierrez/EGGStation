/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuDataOps (Prototype Extension)
 * Author: Enrique González Gutiérrez <enrique.gonzalez.gutierrez@gmail.com>
 * 
 * ROLE:
 * Implements Data Transfer, Stack and Register Transfer instructions 
 * for the Ricoh 5A22 CPU.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively processes memory loads,
 *   stores, pushes, pulls, and register-to-register transfers.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Block-scoped to isolate register index constants and prevent global window lookups.
 * - Straightforward memory mutations for rapid JIT execution.
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

    // ========================================================================
    // MEMORY LOADS
    // ========================================================================

    SnesCpu.prototype.lda = function(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            this.br[A] = (this.br[A] & 0xFF00) | (value & 0xFF);
            this.setZandN(value, this.m);
        } else {
            this.cyclesLeft++;
            this.br[A] = this.readWord(adr, adrh);
            this.setZandN(this.br[A], this.m);
        }
    };

    SnesCpu.prototype.ldx = function(adr, adrh) {
        if (this.x) {
            this.br[X] = this.mem.read(adr);
            this.setZandN(this.br[X], this.x);
        } else {
            this.cyclesLeft++;
            this.br[X] = this.readWord(adr, adrh);
            this.setZandN(this.br[X], this.x);
        }
    };

    SnesCpu.prototype.ldy = function(adr, adrh) {
        if (this.x) {
            this.br[Y] = this.mem.read(adr);
            this.setZandN(this.br[Y], this.x);
        } else {
            this.cyclesLeft++;
            this.br[Y] = this.readWord(adr, adrh);
            this.setZandN(this.br[Y], this.x);
        }
    };

    // ========================================================================
    // MEMORY STORES
    // ========================================================================

    SnesCpu.prototype.sta = function(adr, adrh) {
        if (this.m) {
            this.mem.write(adr, this.br[A] & 0xFF);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[A]);
        }
    };

    SnesCpu.prototype.stx = function(adr, adrh) {
        if (this.x) {
            this.mem.write(adr, this.br[X] & 0xFF);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[X]);
        }
    };

    SnesCpu.prototype.sty = function(adr, adrh) {
        if (this.x) {
            this.mem.write(adr, this.br[Y] & 0xFF);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, this.br[Y]);
        }
    };

    SnesCpu.prototype.stz = function(adr, adrh) {
        if (this.m) {
            this.mem.write(adr, 0);
        } else {
            this.cyclesLeft++;
            this.writeWord(adr, adrh, 0);
        }
    };

    // ========================================================================
    // REGISTER TRANSFERS
    // ========================================================================

    SnesCpu.prototype.tax = function(adr, adrh) {
        this.br[X] = this.x ? (this.br[A] & 0xFF) : this.br[A];
        this.setZandN(this.br[X], this.x);
    };

    SnesCpu.prototype.tay = function(adr, adrh) {
        this.br[Y] = this.x ? (this.br[A] & 0xFF) : this.br[A];
        this.setZandN(this.br[Y], this.x);
    };

    SnesCpu.prototype.tsx = function(adr, adrh) {
        this.br[X] = this.x ? (this.br[SP] & 0xFF) : this.br[SP];
        this.setZandN(this.br[X], this.x);
    };

    SnesCpu.prototype.txa = function(adr, adrh) {
        this.br[A] = this.m ? ((this.br[A] & 0xFF00) | (this.br[X] & 0xFF)) : this.br[X];
        this.setZandN(this.br[A], this.m);
    };

    SnesCpu.prototype.txs = function(adr, adrh) { this.br[SP] = this.br[X]; };

    SnesCpu.prototype.txy = function(adr, adrh) {
        this.br[Y] = this.x ? (this.br[X] & 0xFF) : this.br[X];
        this.setZandN(this.br[Y], this.x);
    };

    SnesCpu.prototype.tya = function(adr, adrh) {
        this.br[A] = this.m ? ((this.br[A] & 0xFF00) | (this.br[Y] & 0xFF)) : this.br[Y];
        this.setZandN(this.br[A], this.m);
    };

    SnesCpu.prototype.tyx = function(adr, adrh) {
        this.br[X] = this.x ? (this.br[Y] & 0xFF) : this.br[Y];
        this.setZandN(this.br[X], this.x);
    };

    SnesCpu.prototype.tcd = function(adr, adrh) {
        this.br[DPR] = this.br[A];
        this.setZandN(this.br[DPR], false);
    };

    SnesCpu.prototype.tcs = function(adr, adrh) { this.br[SP] = this.br[A]; };

    SnesCpu.prototype.tdc = function(adr, adrh) {
        this.br[A] = this.br[DPR];
        this.setZandN(this.br[A], false);
    };

    SnesCpu.prototype.tsc = function(adr, adrh) {
        this.br[A] = this.br[SP];
        this.setZandN(this.br[A], false);
    };

    // ========================================================================
    // EXCHANGES & BLOCK MOVES
    // ========================================================================

    SnesCpu.prototype.xba = function(adr, adrh) {
        let low = this.br[A] & 0xFF;
        let high = (this.br[A] & 0xFF00) >> 8;
        this.br[A] = (low << 8) | high;
        this.setZandN(this.br[A], true);
    };

    SnesCpu.prototype.xce = function(adr, adrh) {
        let temp = this.c;
        this.c = this.e;
        this.e = temp;
        if (this.e) { this.m = true; this.x = true; }
        if (this.x) { this.br[X] &= 0xFF; this.br[Y] &= 0xFF; }
    };

    SnesCpu.prototype.mvn = function(adr, adrh) {
        this.r[DBR] = adr;
        this.mem.write((adr << 16) | this.br[Y], this.mem.read((adrh << 16) | this.br[X]));
        this.br[A] = (this.br[A] - 1) & 0xFFFF;
        this.br[X] = (this.br[X] + 1) & 0xFFFF;
        this.br[Y] = (this.br[Y] + 1) & 0xFFFF;
        if (this.br[A] !== 0xFFFF) { this.br[PC] = (this.br[PC] - 3) & 0xFFFF; }
        if (this.x) { this.br[X] &= 0xFF; this.br[Y] &= 0xFF; }
    };

    SnesCpu.prototype.mvp = function(adr, adrh) {
        this.r[DBR] = adr;
        this.mem.write((adr << 16) | this.br[Y], this.mem.read((adrh << 16) | this.br[X]));
        this.br[A] = (this.br[A] - 1) & 0xFFFF;
        this.br[X] = (this.br[X] - 1) & 0xFFFF;
        this.br[Y] = (this.br[Y] - 1) & 0xFFFF;
        if (this.br[A] !== 0xFFFF) { this.br[PC] = (this.br[PC] - 3) & 0xFFFF; }
        if (this.x) { this.br[X] &= 0xFF; this.br[Y] &= 0xFF; }
    };

    // ========================================================================
    // STACK OPERATIONS (Pushes / Pulls)
    // ========================================================================

    SnesCpu.prototype.pha = function(adr, adrh) {
        if (this.m) { this.pushByte(this.br[A] & 0xFF); }
        else { this.cyclesLeft++; this.pushWord(this.br[A]); }
    };

    SnesCpu.prototype.phx = function(adr, adrh) {
        if (this.x) { this.pushByte(this.br[X] & 0xFF); }
        else { this.cyclesLeft++; this.pushWord(this.br[X]); }
    };

    SnesCpu.prototype.phy = function(adr, adrh) {
        if (this.x) { this.pushByte(this.br[Y] & 0xFF); }
        else { this.cyclesLeft++; this.pushWord(this.br[Y]); }
    };

    SnesCpu.prototype.pla = function(adr, adrh) {
        if (this.m) { this.br[A] = (this.br[A] & 0xFF00) | (this.pullByte() & 0xFF); this.setZandN(this.br[A], this.m); }
        else { this.cyclesLeft++; this.br[A] = this.pullWord(); this.setZandN(this.br[A], this.m); }
    };

    SnesCpu.prototype.plx = function(adr, adrh) {
        if (this.x) { this.br[X] = this.pullByte(); this.setZandN(this.br[X], this.x); }
        else { this.cyclesLeft++; this.br[X] = this.pullWord(); this.setZandN(this.br[X], this.x); }
    };

    SnesCpu.prototype.ply = function(adr, adrh) {
        if (this.x) { this.br[Y] = this.pullByte(); this.setZandN(this.br[Y], this.x); }
        else { this.cyclesLeft++; this.br[Y] = this.pullWord(); this.setZandN(this.br[Y], this.x); }
    };

    SnesCpu.prototype.phb = function(adr, adrh) { this.pushByte(this.r[DBR]); };
    SnesCpu.prototype.phd = function(adr, adrh) { this.pushWord(this.br[DPR]); };
    SnesCpu.prototype.phk = function(adr, adrh) { this.pushByte(this.r[K]); };
    SnesCpu.prototype.php = function(adr, adrh) { this.pushByte(this.getP()); };

    SnesCpu.prototype.plb = function(adr, adrh) {
        this.r[DBR] = this.pullByte();
        this.setZandN(this.r[DBR], true);
    };

    SnesCpu.prototype.pld = function(adr, adrh) {
        this.br[DPR] = this.pullWord();
        this.setZandN(this.br[DPR], false);
    };

    SnesCpu.prototype.plp = function(adr, adrh) { this.setP(this.pullByte()); };
}