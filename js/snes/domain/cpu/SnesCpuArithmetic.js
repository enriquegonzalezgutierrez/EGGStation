/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuArithmetic (Prototype Extension)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements 8-bit and 16-bit Arithmetic, Increments, Decrements and Shifts 
 * instructions for the Ricoh 5A22 CPU.
 * 
 * JIT OPTIMIZATIONS:
 * - Extends SnesCpu.prototype to maintain monomorphic JIT execution context.
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