/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSpcDataOps (Data Moves & Stack Extension)
 * 
 * ROLE:
 * Handles register load/stores, memory moves, exchanges, and standard
 * CPU stack operations (pushes/pulls).
 */

{
    const A = 0;
    const X = 1;
    const Y = 2;
    const SP = 3;

    SnesSpc.prototype.mov = function(adr, adrh, instr) {
        this.r[A] = this.mem.read(adr);
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.movx = function(adr, adrh, instr) {
        this.r[X] = this.mem.read(adr);
        this.setZandN(this.r[X]);
    }

    SnesSpc.prototype.movy = function(adr, adrh, instr) {
        this.r[Y] = this.mem.read(adr);
        this.setZandN(this.r[Y]);
    }

    SnesSpc.prototype.movs = function(adr, adrh, instr) {
        if (instr !== 0xaf) {
            this.mem.read(adr);
        }
        this.mem.write(adr, this.r[A]);
    }

    SnesSpc.prototype.movsx = function(adr, adrh, instr) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[X]);
    }

    SnesSpc.prototype.movsy = function(adr, adrh, instr) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[Y]);
    }

    SnesSpc.prototype.movw = function(adr, adrh, instr) {
        this.r[A] = this.mem.read(adr);
        this.r[Y] = this.mem.read(adrh);
        this.z = this.r[A] === 0 && this.r[Y] === 0;
        this.n = (this.r[Y] & 0x80) > 0;
    }

    SnesSpc.prototype.movws = function(adr, adrh, instr) {
        this.mem.read(adr);
        this.mem.write(adr, this.r[A]);
        this.mem.write(adrh, this.r[Y]);
    }

    SnesSpc.prototype.movm = function(adr, adrh, instr) {
        if (instr === 0x8f) {
            this.mem.read(adrh);
        }
        this.mem.write(adrh, this.mem.read(adr));
    }

    SnesSpc.prototype.movxa = function(adr, adrh, instr) {
        this.r[X] = this.r[A];
        this.setZandN(this.r[X]);
    }

    SnesSpc.prototype.movax = function(adr, adrh, instr) {
        this.r[A] = this.r[X];
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.movxp = function(adr, adrh, instr) {
        this.r[X] = this.r[SP];
        this.setZandN(this.r[X]);
    }

    SnesSpc.prototype.movpx = function(adr, adrh, instr) {
        this.r[SP] = this.r[X];
    }

    SnesSpc.prototype.movay = function(adr, adrh, instr) {
        this.r[A] = this.r[Y];
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.movya = function(adr, adrh, instr) {
        this.r[Y] = this.r[A];
        this.setZandN(this.r[Y]);
    }

    SnesSpc.prototype.pushp = function(adr, adrh, instr) { this.push(this.getP()); }
    SnesSpc.prototype.pusha = function(adr, adrh, instr) { this.push(this.r[A]); }
    SnesSpc.prototype.pushx = function(adr, adrh, instr) { this.push(this.r[X]); }
    SnesSpc.prototype.pushy = function(adr, adrh, instr) { this.push(this.r[Y]); }
    SnesSpc.prototype.popp = function(adr, adrh, instr)  { this.setP(this.pop()); }
    SnesSpc.prototype.popa = function(adr, adrh, instr)  { this.r[A] = this.pop(); }
    SnesSpc.prototype.popx = function(adr, adrh, instr)  { this.r[X] = this.pop(); }
    SnesSpc.prototype.popy = function(adr, adrh, instr)  { this.r[Y] = this.pop(); }
}