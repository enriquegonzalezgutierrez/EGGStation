/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuLogic (Prototype Extension)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements Bitwise Logical, Processor Status Flags, Branches, Jumps, 
 * Returns and System Control instructions for the Ricoh 5A22 CPU.
 * 
 * JIT OPTIMIZATIONS:
 * - Extends SnesCpu.prototype to maintain monomorphic JIT execution context.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles logical operations, system control, and program branching.
 */

// We extend the SnesCpu prototype. This compiles natively in the monomorphic 'this' context.

SnesCpu.prototype.and = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.br[A] = (this.br[A] & 0xff00) | ((this.br[A] & value) & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    this.br[A] &= value;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.eor = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.br[A] = (this.br[A] & 0xff00) | ((this.br[A] ^ value) & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    this.br[A] ^= value;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.ora = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.br[A] = (this.br[A] & 0xff00) | ((this.br[A] | value) & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    this.br[A] |= value;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.bit = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let result = (this.br[A] & 0xff) & value;
    this.z = result === 0;
    this.n = (value & 0x80) > 0;
    this.v = (value & 0x40) > 0;
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    let result = this.br[A] & value;
    this.z = result === 0;
    this.n = (value & 0x8000) > 0;
    this.v = (value & 0x4000) > 0;
  }
};

SnesCpu.prototype.biti = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let result = (this.br[A] & 0xff) & value;
    this.z = result === 0;
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    let result = this.br[A] & value;
    this.z = result === 0;
  }
};

SnesCpu.prototype.trb = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let result = (this.br[A] & 0xff) & value;
    value = (value & ~(this.br[A] & 0xff)) & 0xff;
    this.z = result === 0;
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let result = this.br[A] & value;
    value = (value & ~this.br[A]) & 0xffff;
    this.z = result === 0;
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.tsb = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let result = (this.br[A] & 0xff) & value;
    value = (value | (this.br[A] & 0xff)) & 0xff;
    this.z = result === 0;
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let result = this.br[A] & value;
    value = (value | this.br[A]) & 0xffff;
    this.z = result === 0;
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.bcc = function(adr, adrh) { this.doBranch(!this.c, adr); };
SnesCpu.prototype.bcs = function(adr, adrh) { this.doBranch(this.c, adr); };
SnesCpu.prototype.beq = function(adr, adrh) { this.doBranch(this.z, adr); };
SnesCpu.prototype.bmi = function(adr, adrh) { this.doBranch(this.n, adr); };
SnesCpu.prototype.bne = function(adr, adrh) { this.doBranch(!this.z, adr); };
SnesCpu.prototype.bpl = function(adr, adrh) { this.doBranch(!this.n, adr); };
SnesCpu.prototype.bra = function(adr, adrh) { this.br[PC] = (this.br[PC] + adr) & 0xffff; };
SnesCpu.prototype.bvc = function(adr, adrh) { this.doBranch(!this.v, adr); };
SnesCpu.prototype.bvs = function(adr, adrh) { this.doBranch(this.v, adr); };
SnesCpu.prototype.brl = function(adr, adrh) { this.br[PC] = (this.br[PC] + adr) & 0xffff; };

SnesCpu.prototype.jmp = function(adr, adrh) { this.br[PC] = adr & 0xffff; };
SnesCpu.prototype.jml = function(adr, adrh) {
  this.r[K] = (adr & 0xff0000) >> 16;
  this.br[PC] = adr & 0xffff;
};

SnesCpu.prototype.jsl = function(adr, adrh) {
  let pushPc = (this.br[PC] - 1) & 0xffff;
  this.pushByte(this.r[K]);
  this.pushWord(pushPc);
  this.r[K] = (adr & 0xff0000) >> 16;
  this.br[PC] = adr & 0xffff;
};

SnesCpu.prototype.jsr = function(adr, adrh) {
  let pushPc = (this.br[PC] - 1) & 0xffff;
  this.pushWord(pushPc);
  this.br[PC] = adr & 0xffff;
};

SnesCpu.prototype.rtl = function(adr, adrh) {
  let pullPc = this.pullWord();
  this.r[K] = this.pullByte();
  this.br[PC] = (pullPc + 1) & 0xffff;
};

SnesCpu.prototype.rts = function(adr, adrh) {
  let pullPc = this.pullWord();
  this.br[PC] = (pullPc + 1) & 0xffff;
};

SnesCpu.prototype.brk = function(adr, adrh) {
  let pushPc = (this.br[PC] + 1) & 0xffff;
  this.pushByte(this.r[K]);
  this.pushWord(pushPc);
  this.pushByte(this.getP());
  this.cyclesLeft++; 
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe6) | (this.mem.read(0xffe7) << 8);
};

SnesCpu.prototype.cop = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; 
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe4) | (this.mem.read(0xffe5) << 8);
};

SnesCpu.prototype.abo = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; 
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe8) | (this.mem.read(0xffe9) << 8);
};

SnesCpu.prototype.nmi = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; 
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffea) | (this.mem.read(0xffeb) << 8);
};

SnesCpu.prototype.irq = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; 
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffee) | (this.mem.read(0xffef) << 8);
};

SnesCpu.prototype.rti = function(adr, adrh) {
  this.setP(this.pullByte());
  this.cyclesLeft++; 
  let pullPc = this.pullWord();
  this.r[K] = this.pullByte();
  this.br[PC] = pullPc;
};

SnesCpu.prototype.clc = function(adr, adrh) { this.c = false; };
SnesCpu.prototype.cld = function(adr, adrh) { this.d = false; };
SnesCpu.prototype.cli = function(adr, adrh) { this.i = false; };
SnesCpu.prototype.clv = function(adr, adrh) { this.v = false; };
SnesCpu.prototype.sec = function(adr, adrh) { this.c = true; };
SnesCpu.prototype.sed = function(adr, adrh) { this.d = true; };
SnesCpu.prototype.sei = function(adr, adrh) { this.i = true; };

SnesCpu.prototype.rep = function(adr, adrh) {
  let value = this.mem.read(adr);
  this.setP(this.getP() & ~value);
};

SnesCpu.prototype.sep = function(adr, adrh) {
  let value = this.mem.read(adr);
  this.setP(this.getP() | value);
};

SnesCpu.prototype.nop = function(adr, adrh) {};
SnesCpu.prototype.wdm = function(adr, adrh) {};

SnesCpu.prototype.pea = function(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); };
SnesCpu.prototype.pei = function(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); };
SnesCpu.prototype.per = function(adr, adrh) { this.pushWord((this.br[PC] + adr) & 0xffff); };

SnesCpu.prototype.stp = function(adr, adrh) { this.stopped = true; };
SnesCpu.prototype.wai = function(adr, adrh) { this.waiting = true; };