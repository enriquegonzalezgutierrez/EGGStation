/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSpcArithmetic (ALU & Decimal Operations Extension)
 * 
 * ROLE:
 * Handles arithmetic algorithms (ADC, SBC, CMP, increments, decrements, 
 * multiplication, division, and BCD decimal adjustments).
 */

{
    const A = 0;
    const X = 1;
    const Y = 2;

    SnesSpc.prototype.adc = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let result = this.r[A] + value + (this.c ? 1 : 0);
        this.v = (
            (this.r[A] & 0x80) === (value & 0x80) &&
            (value & 0x80) !== (result & 0x80)
        );
        this.h = ((this.r[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.r[A] = result;
    }

    SnesSpc.prototype.adcm = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let addedTo = this.mem.read(adrh);
        let result = addedTo + value + (this.c ? 1 : 0);
        this.v = (
            (addedTo & 0x80) === (value & 0x80) &&
            (value & 0x80) !== (result & 0x80)
        );
        this.h = ((addedTo & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.mem.write(adrh, result & 0xff);
    }

    SnesSpc.prototype.sbc = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let result = this.r[A] + value + (this.c ? 1 : 0);
        this.v = (
            (this.r[A] & 0x80) === (value & 0x80) &&
            (value & 0x80) !== (result & 0x80)
        );
        this.h = ((this.r[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.r[A] = result;
    }

    SnesSpc.prototype.sbcm = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let addedTo = this.mem.read(adrh);
        let result = addedTo + value + (this.c ? 1 : 0);
        this.v = (
            (addedTo & 0x80) === (value & 0x80) &&
            (value & 0x80) !== (result & 0x80)
        );
        this.h = ((addedTo & 0xf) + (value & 0xf) + (this.c ? 1 : 0)) > 0xf;
        this.c = result > 0xff;
        this.setZandN(result);
        this.mem.write(adrh, result & 0xff);
    }

    SnesSpc.prototype.addw = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        let addTo = (this.r[Y] << 8) | this.r[A];
        let result = addTo + value;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
        this.v = (
            (addTo & 0x8000) === (value & 0x8000) &&
            (value & 0x8000) !== (result & 0x8000)
        );
        this.h = ((addTo & 0xfff) + (value & 0xfff)) > 0x0fff;
        this.r[A] = result & 0xff;
        this.r[Y] = (result & 0xff00) >> 8;
    }

    SnesSpc.prototype.subw = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        value ^= 0xffff;
        let addTo = (this.r[Y] << 8) | this.r[A];
        let result = addTo + value + 1;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
        this.v = (
            (addTo & 0x8000) === (value & 0x8000) &&
            (value & 0x8000) !== (result & 0x8000)
        );
        this.h = ((addTo & 0xfff) + (value & 0xfff) + 1) > 0xfff;
        this.r[A] = result & 0xff;
        this.r[Y] = (result & 0xff00) >> 8;
    }

    SnesSpc.prototype.cmp = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let result = this.r[A] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    SnesSpc.prototype.cmpm = function(adr, adrh, instr) {
        let value = this.mem.read(adrh);
        let result = value + (this.mem.read(adr) ^ 0xff) + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    SnesSpc.prototype.cmpx = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let result = this.r[X] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    SnesSpc.prototype.cmpy = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let result = this.r[Y] + value + 1;
        this.c = result > 0xff;
        this.setZandN(result);
    }

    SnesSpc.prototype.cmpw = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        let addTo = (this.r[Y] << 8) | this.r[A];
        let result = addTo + (value ^ 0xffff) + 1;
        this.z = (result & 0xffff) === 0;
        this.n = (result & 0x8000) > 0;
        this.c = result > 0xffff;
    }

    SnesSpc.prototype.inc = function(adr, adrh, instr) {
        let value = (this.mem.read(adr) + 1) & 0xff;
        this.setZandN(value);
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.inca = function(adr, adrh, instr) {
        this.r[A] = (this.r[A] + 1) & 0xff;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.incx = function(adr, adrh, instr) {
        this.r[X] = (this.r[X] + 1) & 0xff;
        this.setZandN(this.r[X]);
    }

    SnesSpc.prototype.incy = function(adr, adrh, instr) {
        this.r[Y] = (this.r[Y] + 1) & 0xff;
        this.setZandN(this.r[Y]);
    }

    SnesSpc.prototype.dec = function(adr, adrh, instr) {
        let value = (this.mem.read(adr) - 1) & 0xff;
        this.setZandN(value);
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.deca = function(adr, adrh, instr) {
        this.r[A] = (this.r[A] - 1) & 0xff;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.decx = function(adr, adrh, instr) {
        this.r[X] = (this.r[X] - 1) & 0xff;
        this.setZandN(this.r[X]);
    }

    SnesSpc.prototype.decy = function(adr, adrh, instr) {
        this.r[Y] = (this.r[Y] - 1) & 0xff;
        this.setZandN(this.r[Y]);
    }

    SnesSpc.prototype.incw = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        value = (value + 1) & 0xffff;
        this.z = value === 0;
        this.n = (value & 0x8000) > 0;
        this.mem.write(adr, value & 0xff);
        this.mem.write(adrh, value >> 8);
    }

    SnesSpc.prototype.decw = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= this.mem.read(adrh) << 8;
        value = (value - 1) & 0xffff;
        this.z = value === 0;
        this.n = (value & 0x8000) > 0;
        this.mem.write(adr, value & 0xff);
        this.mem.write(adrh, value >> 8);
    }

    SnesSpc.prototype.mul = function(adr, adrh, instr) {
        let result = this.r[Y] * this.r[A];
        this.r[A] = result & 0xff;
        this.r[Y] = (result & 0xff00) >> 8;
        this.setZandN(this.r[Y]);
    }

    SnesSpc.prototype.div = function(adr, adrh, instr) {
        let value = this.r[A] | (this.r[Y] << 8);
        let result = 0xffff;
        let mod = value & 0xff;
        if (this.r[X] !== 0) {
            result = (value / this.r[X]) & 0xffff;
            mod = value % this.r[X];
        }
        this.v = result > 0xff;
        this.h = (this.r[X] & 0xf) <= (this.r[Y] & 0xf);
        this.r[A] = result & 0xff;
        this.r[Y] = mod;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.daa = function(adr, adrh, instr) {
        if (this.r[A] > 0x99 || this.c) {
            this.r[A] = (this.r[A] + 0x60) & 0xff;
            this.c = true;
        }
        if ((this.r[A] & 0xf) > 9 || this.h) {
            this.r[A] = (this.r[A] + 6) & 0xff;
        }
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.das = function(adr, adrh, instr) {
        if (this.r[A] > 0x99 || !this.c) {
            this.r[A] = (this.r[A] - 0x60) & 0xff;
            this.c = false;
        }
        if ((this.r[A] & 0xf) > 9 || !this.h) {
            this.r[A] = (this.r[A] - 6) & 0xff;
        }
        this.setZandN(this.r[A]);
    }
}