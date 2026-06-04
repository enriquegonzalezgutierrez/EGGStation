/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSpcLogic (Logic, Shifts, Bit Manipulation & Jumps Extension)
 * 
 * ROLE:
 * Handles logical gates (AND, OR, EOR), bit shifting (ASL, LSR, ROL, ROR),
 * jumps and branching (conditional and absolute), and status flag modifications.
 */

{
    const A = 0;
    const X = 1;
    const Y = 2;
    const PC = 0;

    SnesSpc.prototype.nop = function(adr, adrh, instr) {}

    SnesSpc.prototype.clrp = function(adr, adrh, instr) { this.p = false; }
    SnesSpc.prototype.setp = function(adr, adrh, instr) { this.p = true; }
    SnesSpc.prototype.clrc = function(adr, adrh, instr) { this.c = false; }
    SnesSpc.prototype.setc = function(adr, adrh, instr) { this.c = true; }
    SnesSpc.prototype.ei = function(adr, adrh, instr) { this.i = true; }
    SnesSpc.prototype.di = function(adr, adrh, instr) { this.i = false; }
    SnesSpc.prototype.clrv = function(adr, adrh, instr) { this.v = false; this.h = false; }

    SnesSpc.prototype.and = function(adr, adrh, instr) {
        this.r[A] &= this.mem.read(adr);
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.andm = function(adr, adrh, instr) {
        let value = this.mem.read(adrh);
        value &= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    SnesSpc.prototype.or = function(adr, adrh, instr) {
        this.r[A] |= this.mem.read(adr);
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.orm = function(adr, adrh, instr) {
        let value = this.mem.read(adrh);
        value |= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    SnesSpc.prototype.eor = function(adr, adrh, instr) {
        this.r[A] ^= this.mem.read(adr);
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.eorm = function(adr, adrh, instr) {
        let value = this.mem.read(adrh);
        value ^= this.mem.read(adr);
        this.mem.write(adrh, value);
        this.setZandN(value);
    }

    SnesSpc.prototype.asl = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        this.c = (value & 0x80) > 0;
        value <<= 1;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    SnesSpc.prototype.asla = function(adr, adrh, instr) {
        this.c = (this.r[A] & 0x80) > 0;
        this.r[A] = (this.r[A] << 1) & 0xff;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.lsr = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        this.c = (value & 0x1) > 0;
        value >>= 1;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    SnesSpc.prototype.lsra = function(adr, adrh, instr) {
        this.c = (this.r[A] & 0x1) > 0;
        this.r[A] >>= 1;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.rol = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let carry = (value & 0x80) > 0;
        value = (value << 1) | (this.c ? 1 : 0);
        this.c = carry > 0;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    SnesSpc.prototype.rola = function(adr, adrh, instr) {
        let carry = (this.r[A] & 0x80) > 0;
        this.r[A] = ((this.r[A] << 1) | (this.c ? 1 : 0)) & 0xff;
        this.c = carry > 0;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.ror = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let carry = (value & 0x1) > 0;
        value = (value >> 1) | (this.c ? 0x80 : 0);
        this.c = carry > 0;
        this.setZandN(value);
        this.mem.write(adr, value & 0xff);
    }

    SnesSpc.prototype.rora = function(adr, adrh, instr) {
        let carry = (this.r[A] & 0x1) > 0;
        this.r[A] = (this.r[A] >> 1) | (this.c ? 0x80 : 0);
        this.c = carry > 0;
        this.setZandN(this.r[A]);
    }

    SnesSpc.prototype.bpl = function(adr, adrh, instr) { this.doBranch(!this.n, adr); }
    SnesSpc.prototype.bmi = function(adr, adrh, instr) { this.doBranch(this.n, adr); }
    SnesSpc.prototype.bvc = function(adr, adrh, instr) { this.doBranch(!this.v, adr); }
    SnesSpc.prototype.bvs = function(adr, adrh, instr) { this.doBranch(this.v, adr); }
    SnesSpc.prototype.bcc = function(adr, adrh, instr) { this.doBranch(!this.c, adr); }
    SnesSpc.prototype.bcs = function(adr, adrh, instr) { this.doBranch(this.c, adr); }
    SnesSpc.prototype.bne = function(adr, adrh, instr) { this.doBranch(!this.z, adr); }
    SnesSpc.prototype.beq = function(adr, adrh, instr) { this.doBranch(this.z, adr); }

    SnesSpc.prototype.bra = function(adr, adrh, instr) { this.br[PC] += adr; }
    SnesSpc.prototype.jmp = function(adr, adrh, instr) { this.br[PC] = adr; }

    SnesSpc.prototype.call = function(adr, adrh, instr) {
        this.push(this.br[PC] >> 8);
        this.push(this.br[PC] & 0xff);
        this.br[PC] = adr;
    }

    SnesSpc.prototype.pcall = function(adr, adrh, instr) {
        this.push(this.br[PC] >> 8);
        this.push(this.br[PC] & 0xff);
        this.br[PC] = 0xff00 + (adr & 0xff);
    }

    SnesSpc.prototype.tcall = function(adr, adrh, instr) {
        this.push(this.br[PC] >> 8);
        this.push(this.br[PC] & 0xff);
        let padr = 0xffc0 + ((15 - (instr >> 4)) << 1);
        this.br[PC] = this.mem.read(padr) | (this.mem.read(padr + 1) << 8);
    }

    SnesSpc.prototype.ret = function(adr, adrh, instr) {
        this.br[PC] = this.pop();
        this.br[PC] |= this.pop() << 8;
    }

    SnesSpc.prototype.reti = function(adr, adrh, instr) {
        this.setP(this.pop());
        this.br[PC] = this.pop();
        this.br[PC] |= this.pop() << 8;
    }

    SnesSpc.prototype.set1 = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value |= (1 << (instr >> 5));
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.clr1 = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        value &= ~(1 << (instr >> 5));
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.bbs = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        this.doBranch((value & (1 << (instr >> 5))) > 0, adrh);
    }

    SnesSpc.prototype.bbc = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        this.doBranch((value & (1 << (instr >> 5))) === 0, adrh);
    }

    SnesSpc.prototype.or1 = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        let result = (this.c ? 1 : 0) | bit;
        this.c = result > 0;
    }

    SnesSpc.prototype.or1n = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        let result = (this.c ? 1 : 0) | (bit > 0 ? 0 : 1);
        this.c = result > 0;
    }

    SnesSpc.prototype.and1 = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        let result = (this.c ? 1 : 0) & bit;
        this.c = result > 0;
    }

    SnesSpc.prototype.and1n = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        let result = (this.c ? 1 : 0) & (bit > 0 ? 0 : 1);
        this.c = result > 0;
    }

    SnesSpc.prototype.eor1 = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        let result = (this.c ? 1 : 0) ^ bit;
        this.c = result > 0;
    }

    SnesSpc.prototype.mov1 = function(adr, adrh, instr) {
        let bit = (this.mem.read(adr) >> adrh) & 0x1;
        this.c = bit > 0;
    }

    SnesSpc.prototype.mov1s = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let bit = 1 << adrh;
        value = this.c ? (value | bit) : (value & ~bit);
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.not1 = function(adr, adrh, instr) {
        let bit = 1 << adrh;
        let value = this.mem.read(adr) ^ bit;
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.notc = function(adr, adrh, instr) {
        this.c = !this.c;
    }

    SnesSpc.prototype.tset1 = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let result = this.r[A] + (value ^ 0xff) + 1;
        this.setZandN(result);
        value |= this.r[A];
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.tclr1 = function(adr, adrh, instr) {
        let value = this.mem.read(adr);
        let result = this.r[A] + (value ^ 0xff) + 1;
        this.setZandN(result);
        value &= ~this.r[A];
        this.mem.write(adr, value);
    }

    SnesSpc.prototype.cbne = function(adr, adrh, instr) {
        let value = this.mem.read(adr) ^ 0xff;
        let result = this.r[A] + value + 1;
        this.doBranch((result & 0xff) !== 0, adrh);
    }

    SnesSpc.prototype.dbnz = function(adr, adrh, instr) {
        let value = (this.mem.read(adr) - 1) & 0xff;
        this.mem.write(adr, value);
        this.doBranch(value !== 0, adrh);
    }

    SnesSpc.prototype.dbnzy = function(adr, adrh, instr) {
        this.r[Y]--;
        this.doBranch(this.r[Y] !== 0, adr);
    }

    SnesSpc.prototype.brk = function(adr, adrh, instr) {
        this.push(this.br[PC] >> 8);
        this.push(this.br[PC] & 0xff);
        this.push(this.getP());
        this.i = false;
        this.b = true;
        this.br[PC] = this.mem.read(0xffde) | (this.mem.read(0xffdf) << 8);
    }

    SnesSpc.prototype.sleep = function(adr, adrh, instr) {
        this.br[PC]--;
    }

    SnesSpc.prototype.stop = function(adr, adrh, instr) {
        this.br[PC]--;
    }

    SnesSpc.prototype.xcn = function(adr, adrh, instr) {
        this.r[A] = ((this.r[A] >> 4) | (this.r[A] << 4)) & 0xff;
        this.setZandN(this.r[A]);
    }
}