/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuInstructions (Prototype Extension)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements the instruction set (Opcodes) of the Ricoh 5A22 CPU.
 * 
 * JIT OPTIMIZATIONS (Monomorphic Prototype Extension):
 * - Extends SnesCpu.prototype with 90+ hardware execution routines, enabling 
 *   direct, high-speed 'this' variable and flag access with no .call() overhead.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles instruction set execution behavior.
 */

// We extend the SnesCpu prototype. This compiles natively in the monomorphic 'this' context.

SnesCpu.prototype.adc = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let result;
    if (this.d) {
      result = (this.br[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
      result += result > 9 ? 6 : 0;
      result = (
        (this.br[A] & 0xf0) + (value & 0xf0) +
        (result > 0xf ? 0x10 : 0) + (result & 0xf)
      );
    } else {
      result = (this.br[A] & 0xff) + value + (this.c ? 1 : 0);
    }
    this.v = (
      (this.br[A] & 0x80) === (value & 0x80) &&
      (value & 0x80) !== (result & 0x80)
    );
    result += (this.d && result > 0x9f) ? 0x60 : 0;
    this.c = result > 0xff;
    this.setZandN(result, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (result & 0xff);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft++; // 1 extra cycle if m = 0
    let result;
    if (this.d) {
      result = (this.br[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
      result += result > 9 ? 6 : 0;
      result = (
        (this.br[A] & 0xf0) + (value & 0xf0) +
        (result > 0xf ? 0x10 : 0) + (result & 0xf)
      );
      result += result > 0x9f ? 0x60 : 0;
      result = (
        (this.br[A] & 0xf00) + (value & 0xf00) +
        (result > 0xff ? 0x100 : 0) + (result & 0xff)
      );
      result += result > 0x9ff ? 0x600 : 0;
      result = (
        (this.br[A] & 0xf000) + (value & 0xf000) +
        (result > 0xfff ? 0x1000 : 0) + (result & 0xfff)
      );
    } else {
      result = this.br[A] + value + (this.c ? 1 : 0);
    }
    this.v = (
      (this.br[A] & 0x8000) === (value & 0x8000) &&
      (value & 0x8000) !== (result & 0x8000)
    );
    result += (this.d && result > 0x9fff) ? 0x6000 : 0;
    this.c = result > 0xffff;
    this.setZandN(result, this.m);
    this.br[A] = result;
  }
};

SnesCpu.prototype.sbc = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr) ^ 0xff;
    let result;
    if (this.d) {
      result = (this.br[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
      result -= result <= 0xf ? 6 : 0;
      result = (
        (this.br[A] & 0xf0) + (value & 0xf0) +
        (result > 0xf ? 0x10 : 0) + (result & 0xf)
      );
    } else {
      result = (this.br[A] & 0xff) + value + (this.c ? 1 : 0);
    }
    this.v = (
      (this.br[A] & 0x80) === (value & 0x80) &&
      (value & 0x80) !== (result & 0x80)
    );
    result -= (this.d && result <= 0xff) ? 0x60 : 0;
    this.c = result > 0xff;
    this.setZandN(result, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (result & 0xff);
  } else {
    let value = this.readWord(adr, adrh) ^ 0xffff;
    this.cyclesLeft++; // 1 extra cycle if m = 0
    let result;
    if (this.d) {
      result = (this.br[A] & 0xf) + (value & 0xf) + (this.c ? 1 : 0);
      result -= result <= 0x0f ? 6 : 0;
      result = (
        (this.br[A] & 0xf0) + (value & 0xf0) +
        (result > 0xf ? 0x10 : 0) + (result & 0xf)
      );
      result -= result <= 0xff ? 0x60 : 0;
      result = (
        (this.br[A] & 0xf00) + (value & 0xf00) +
        (result > 0xff ? 0x100 : 0) + (result & 0xff)
      );
      result -= result <= 0xfff ? 0x600 : 0;
      result = (
        (this.br[A] & 0xf000) + (value & 0xf000) +
        (result > 0xfff ? 0x1000 : 0) + (result & 0xfff)
      );
    } else {
      result = this.br[A] + value + (this.c ? 1 : 0);
    }
    this.v = (
      (this.br[A] & 0x8000) === (value & 0x8000) &&
      (value & 0x8000) !== (result & 0x8000)
    );
    result -= (this.d && result <= 0xffff) ? 0x6000 : 0;
    this.c = result > 0xffff;
    this.setZandN(result, this.m);
    this.br[A] = result;
  }
};

SnesCpu.prototype.cmp = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr) ^ 0xff;
    let result = (this.br[A] & 0xff) + value + 1;
    this.c = result > 0xff;
    this.setZandN(result, this.m);
  } else {
    let value = this.readWord(adr, adrh) ^ 0xffff;
    this.cyclesLeft++; // 1 extra cycle if m = 0
    let result = this.br[A] + value + 1;
    this.c = result > 0xffff;
    this.setZandN(result, this.m);
  }
};

SnesCpu.prototype.cpx = function(adr, adrh) {
  if (this.x) {
    let value = this.mem.read(adr) ^ 0xff;
    let result = (this.br[X] & 0xff) + value + 1;
    this.c = result > 0xff;
    this.setZandN(result, this.x);
  } else {
    let value = this.readWord(adr, adrh) ^ 0xffff;
    this.cyclesLeft++; // 1 extra cycle if x = 0
    let result = this.br[X] + value + 1;
    this.c = result > 0xffff;
    this.setZandN(result, this.x);
  }
};

SnesCpu.prototype.cpy = function(adr, adrh) {
  if (this.x) {
    let value = this.mem.read(adr) ^ 0xff;
    let result = (this.br[Y] & 0xff) + value + 1;
    this.c = result > 0xff;
    this.setZandN(result, this.x);
  } else {
    let value = this.readWord(adr, adrh) ^ 0xffff;
    this.cyclesLeft++; // 1 extra cycle if x = 0
    let result = this.br[Y] + value + 1;
    this.c = result > 0xffff;
    this.setZandN(result, this.x);
  }
};

SnesCpu.prototype.dec = function(adr, adrh) {
  if (this.m) {
    let result = (this.mem.read(adr) - 1) & 0xff;
    this.setZandN(result, this.m);
    this.mem.write(adr, result);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let result = (value - 1) & 0xffff;
    this.setZandN(result, this.m);
    this.writeWord(adr, adrh, result, true);
  }
};

SnesCpu.prototype.deca = function(adr, adrh) {
  if (this.m) {
    let result = ((this.br[A] & 0xff) - 1) & 0xff;
    this.setZandN(result, this.m);
    this.br[A] = this.br[A] & 0xff00 | result;
  } else {
    this.br[A]--;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.dex = function(adr, adrh) {
  if (this.x) {
    let result = ((this.br[X] & 0xff) - 1) & 0xff;
    this.setZandN(result, this.x);
    this.br[X] = result;
  } else {
    this.br[X]--;
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.dey = function(adr, adrh) {
  if (this.x) {
    let result = ((this.br[Y] & 0xff) - 1) & 0xff;
    this.setZandN(result, this.x);
    this.br[Y] = result;
  } else {
    this.br[Y]--;
    this.setZandN(this.br[Y], this.x);
  }
};

SnesCpu.prototype.inc = function(adr, adrh) {
  if (this.m) {
    let result = (this.mem.read(adr) + 1) & 0xff;
    this.setZandN(result, this.m);
    this.mem.write(adr, result);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let result = (value + 1) & 0xffff;
    this.setZandN(result, this.m);
    this.writeWord(adr, adrh, result, true);
  }
};

SnesCpu.prototype.inca = function(adr, adrh) {
  if (this.m) {
    let result = ((this.br[A] & 0xff) + 1) & 0xff;
    this.setZandN(result, this.m);
    this.br[A] = this.br[A] & 0xff00 | result;
  } else {
    this.br[A]++;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.inx = function(adr, adrh) {
  if (this.x) {
    let result = ((this.br[X] & 0xff) + 1) & 0xff;
    this.setZandN(result, this.x);
    this.br[X] = result;
  } else {
    this.br[X]++;
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.iny = function(adr, adrh) {
  if (this.x) {
    let result = ((this.br[Y] & 0xff) + 1) & 0xff;
    this.setZandN(result, this.x);
    this.br[Y] = result;
  } else {
    this.br[Y]++;
    this.setZandN(this.br[Y], this.x);
  }
};

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

SnesCpu.prototype.asl = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.c = (value & 0x80) > 0;
    value <<= 1;
    this.setZandN(value, this.m);
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    this.c = (value & 0x8000) > 0;
    value <<= 1;
    this.setZandN(value, this.m);
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.asla = function(adr, adrh) {
  if (this.m) {
    let value = this.br[A] & 0xff;
    this.c = (value & 0x80) > 0;
    value <<= 1;
    this.setZandN(value, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (value & 0xff);
  } else {
    this.c = (this.br[A] & 0x8000) > 0;
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    this.br[A] <<= 1;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.lsr = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.c = (value & 0x1) > 0;
    value >>= 1;
    this.setZandN(value, this.m);
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    this.c = (value & 0x1) > 0;
    value >>= 1;
    this.setZandN(value, this.m);
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.lsra = function(adr, adrh) {
  if (this.m) {
    let value = this.br[A] & 0xff;
    this.c = (value & 0x1) > 0;
    value >>= 1;
    this.setZandN(value, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (value & 0xff);
  } else {
    this.c = (this.br[A] & 0x1) > 0;
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    this.br[A] >>= 1;
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.rol = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    value = (value << 1) | (this.c ? 1 : 0);
    this.c = (value & 0x100) > 0;
    this.setZandN(value, this.m);
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    value = (value << 1) | (this.c ? 1 : 0);
    this.c = (value & 0x10000) > 0;
    this.setZandN(value, this.m);
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.rola = function(adr, adrh) {
  if (this.m) {
    let value = this.br[A] & 0xff;
    value = (value << 1) | (this.c ? 1 : 0);
    this.c = (value & 0x100) > 0;
    this.setZandN(value, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (value & 0xff);
  } else {
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    value = (this.br[A] << 1) | (this.c ? 1 : 0);
    this.c = (value & 0x10000) > 0;
    this.setZandN(value, this.m);
    this.br[A] = value;
  }
};

SnesCpu.prototype.ror = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    let carry = value & 0x1;
    value = (value >> 1) | (this.c ? 0x80 : 0);
    this.c = carry > 0;
    this.setZandN(value, this.m);
    this.mem.write(adr, value);
  } else {
    let value = this.readWord(adr, adrh);
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let carry = value & 0x1;
    value = (value >> 1) | (this.c ? 0x8000 : 0);
    this.c = carry > 0;
    this.setZandN(value, this.m);
    this.writeWord(adr, adrh, value, true);
  }
};

SnesCpu.prototype.rora = function(adr, adrh) {
  if (this.m) {
    let value = this.br[A] & 0xff;
    let carry = value & 0x1;
    value = (value >> 1) | (this.c ? 0x80 : 0);
    this.c = carry > 0;
    this.setZandN(value, this.m);
    this.br[A] = (this.br[A] & 0xff00) | (value & 0xff);
  } else {
    this.cyclesLeft += 2; // 2 extra cycles if m = 0
    let carry = this.br[A] & 0x1;
    value = (this.br[A] >> 1) | (this.c ? 0x8000 : 0);
    this.c = carry > 0;
    this.setZandN(value, this.m);
    this.br[A] = value;
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
  this.cyclesLeft++; // native mode: 1 extra cycle
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe6) | (this.mem.read(0xffe7) << 8);
};

SnesCpu.prototype.cop = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; // native mode: 1 extra cycle
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe4) | (this.mem.read(0xffe5) << 8);
};

SnesCpu.prototype.abo = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; // native mode: 1 extra cycle
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffe8) | (this.mem.read(0xffe9) << 8);
};

SnesCpu.prototype.nmi = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; // native mode: 1 extra cycle
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffea) | (this.mem.read(0xffeb) << 8);
};

SnesCpu.prototype.irq = function(adr, adrh) {
  this.pushByte(this.r[K]);
  this.pushWord(this.br[PC]);
  this.pushByte(this.getP());
  this.cyclesLeft++; // native mode: 1 extra cycle
  this.i = true;
  this.d = false;
  this.r[K] = 0;
  this.br[PC] = this.mem.read(0xffee) | (this.mem.read(0xffef) << 8);
};

SnesCpu.prototype.rti = function(adr, adrh) {
  this.setP(this.pullByte());
  this.cyclesLeft++; // native mode: 1 extra cycle
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

SnesCpu.prototype.lda = function(adr, adrh) {
  if (this.m) {
    let value = this.mem.read(adr);
    this.br[A] = (this.br[A] & 0xff00) | (value & 0xff);
    this.setZandN(value, this.m);
  } else {
    this.cyclesLeft++; // m = 0: 1 extra cycle
    this.br[A] = this.readWord(adr, adrh);
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.ldx = function(adr, adrh) {
  if (this.x) {
    this.br[X] = this.mem.read(adr);
    this.setZandN(this.br[X], this.x);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.br[X] = this.readWord(adr, adrh);
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.ldy = function(adr, adrh) {
  if (this.x) {
    this.br[Y] = this.mem.read(adr);
    this.setZandN(this.br[Y], this.x);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.br[Y] = this.readWord(adr, adrh);
    this.setZandN(this.br[Y], this.x);
  }
};

SnesCpu.prototype.sta = function(adr, adrh) {
  if (this.m) {
    this.mem.write(adr, this.br[A] & 0xff);
  } else {
    this.cyclesLeft++; // m = 0: 1 extra cycle
    this.writeWord(adr, adrh, this.br[A]);
  }
};

SnesCpu.prototype.stx = function(adr, adrh) {
  if (this.x) {
    this.mem.write(adr, this.br[X] & 0xff);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.writeWord(adr, adrh, this.br[X]);
  }
};

SnesCpu.prototype.sty = function(adr, adrh) {
  if (this.x) {
    this.mem.write(adr, this.br[Y] & 0xff);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.writeWord(adr, adrh, this.br[Y]);
  }
};

SnesCpu.prototype.stz = function(adr, adrh) {
  if (this.m) {
    this.mem.write(adr, 0);
  } else {
    this.cyclesLeft++; // m = 0: 1 extra cycle
    this.writeWord(adr, adrh, 0);
  }
};

SnesCpu.prototype.mvn = function(adr, adrh) {
  this.r[DBR] = adr;
  this.mem.write(
    (adr << 16) | this.br[Y],
    this.mem.read((adrh << 16) | this.br[X])
  );
  this.br[A] = (this.br[A] - 1) & 0xffff;
  this.br[X] = (this.br[X] + 1) & 0xffff;
  this.br[Y] = (this.br[Y] + 1) & 0xffff;
  if (this.br[A] !== 0xffff) {
    this.br[PC] = (this.br[PC] - 3) & 0xffff;
  }
  if (this.x) {
    this.br[X] &= 0xff;
    this.br[Y] &= 0xff;
  }
};

SnesCpu.prototype.mvp = function(adr, adrh) {
  this.r[DBR] = adr;
  this.mem.write(
    (adr << 16) | this.br[Y],
    this.mem.read((adrh << 16) | this.br[X])
  );
  this.br[A] = (this.br[A] - 1) & 0xffff;
  this.br[X] = (this.br[X] - 1) & 0xffff;
  this.br[Y] = (this.br[Y] - 1) & 0xffff;
  if (this.br[A] !== 0xffff) {
    this.br[PC] = (this.br[PC] - 3) & 0xffff;
  }
  if (this.x) {
    this.br[X] &= 0xff;
    this.br[Y] &= 0xff;
  }
};

SnesCpu.prototype.nop = function(adr, adrh) {};
SnesCpu.prototype.wdm = function(adr, adrh) {};

SnesCpu.prototype.pea = function(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); };
SnesCpu.prototype.pei = function(adr, adrh) { this.pushWord(this.readWord(adr, adrh)); };
SnesCpu.prototype.per = function(adr, adrh) { this.pushWord((this.br[PC] + adr) & 0xffff); };

SnesCpu.prototype.pha = function(adr, adrh) {
  if (this.m) {
    this.pushByte(this.br[A] & 0xff);
  } else {
    this.cyclesLeft++; // m = 0: 1 extra cycle
    this.pushWord(this.br[A]);
  }
};

SnesCpu.prototype.phx = function(adr, adrh) {
  if (this.x) {
    this.pushByte(this.br[X] & 0xff);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.pushWord(this.br[X]);
  }
};

SnesCpu.prototype.phy = function(adr, adrh) {
  if (this.x) {
    this.pushByte(this.br[Y] & 0xff);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.pushWord(this.br[Y]);
  }
};

SnesCpu.prototype.pla = function(adr, adrh) {
  if (this.m) {
    this.br[A] = (this.br[A] & 0xff00) | (this.pullByte() & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    this.cyclesLeft++; // m = 0: 1 extra cycle
    this.br[A] = this.pullWord();
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.plx = function(adr, adrh) {
  if (this.x) {
    this.br[X] = this.pullByte();
    this.setZandN(this.br[X], this.x);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.br[X] = this.pullWord();
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.ply = function(adr, adrh) {
  if (this.x) {
    this.br[Y] = this.pullByte();
    this.setZandN(this.br[Y], this.x);
  } else {
    this.cyclesLeft++; // x = 0: 1 extra cycle
    this.br[Y] = this.pullWord();
    this.setZandN(this.br[Y], this.x);
  }
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
SnesCpu.prototype.stp = function(adr, adrh) { this.stopped = true; };
SnesCpu.prototype.wai = function(adr, adrh) { this.waiting = true; };

SnesCpu.prototype.tax = function(adr, adrh) {
  if (this.x) {
    this.br[X] = this.br[A] & 0xff;
    this.setZandN(this.br[X], this.x);
  } else {
    this.br[X] = this.br[A];
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.tay = function(adr, adrh) {
  if (this.x) {
    this.br[Y] = this.br[A] & 0xff;
    this.setZandN(this.br[Y], this.x);
  } else {
    this.br[Y] = this.br[A];
    this.setZandN(this.br[Y], this.x);
  }
};

SnesCpu.prototype.tsx = function(adr, adrh) {
  if (this.x) {
    this.br[X] = this.br[SP] & 0xff;
    this.setZandN(this.br[X], this.x);
  } else {
    this.br[X] = this.br[SP];
    this.setZandN(this.br[X], this.x);
  }
};

SnesCpu.prototype.txa = function(adr, adrh) {
  if (this.m) {
    this.br[A] = (this.br[A] & 0xff00) | (this.br[X] & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    this.br[A] = this.br[X];
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.txs = function(adr, adrh) { this.br[SP] = this.br[X]; };

SnesCpu.prototype.txy = function(adr, adrh) {
  if (this.x) {
    this.br[Y] = this.br[X] & 0xff;
    this.setZandN(this.br[Y], this.x);
  } else {
    this.br[Y] = this.br[X];
    this.setZandN(this.br[Y], this.x);
  }
};

SnesCpu.prototype.tya = function(adr, adrh) {
  if (this.m) {
    this.br[A] = (this.br[A] & 0xff00) | (this.br[Y] & 0xff);
    this.setZandN(this.br[A], this.m);
  } else {
    this.br[A] = this.br[Y];
    this.setZandN(this.br[A], this.m);
  }
};

SnesCpu.prototype.tyx = function(adr, adrh) {
  if (this.x) {
    this.br[X] = this.br[Y] & 0xff;
    this.setZandN(this.br[X], this.x);
  } else {
    this.br[X] = this.br[Y];
    this.setZandN(this.br[X], this.x);
  }
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

SnesCpu.prototype.xba = function(adr, adrh) {
  let low = this.br[A] & 0xff;
  let high = (this.br[A] & 0xff00) >> 8;
  this.br[A] = (low << 8) | high;
  this.setZandN(this.br[A], true);
};

SnesCpu.prototype.xce = function(adr, adrh) {
  let temp = this.c;
  this.c = this.e;
  this.e = temp;
  if (this.e) {
    this.m = true;
    this.x = true;
  }
  if (this.x) {
    this.br[X] &= 0xff;
    this.br[Y] &= 0xff;
  }
};