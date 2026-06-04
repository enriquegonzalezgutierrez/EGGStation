/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuArithmetic (Prototype Extension)
 * Author: Enrique González Gutiérrez <enrique.gonzalez.gutierrez@gmail.com>
 * 
 * ROLE:
 * Implements 8-bit and 16-bit Arithmetic (ADC, SBC), Comparisons (CMP, CPX, CPY),
 * Increments/Decrements, and Shifts/Rotates (ASL, LSR, ROL, ROR) for the Ricoh 5A22 CPU.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively handles mathematical operations,
 *   comparisons, and bit shifting.
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

    // ========================================================================
    // ARITHMETIC ADDITION & SUBTRACTION (Binary & BCD)
    // ========================================================================

    SnesCpu.prototype.adc = function(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            let result;
            if (this.d) {
                result = (this.br[A] & 0x0F) + (value & 0x0F) + (this.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((this.br[A] & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F));
            } else {
                result = (this.br[A] & 0xFF) + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
            result += (this.d && result > 0x9F) ? 0x60 : 0;
            this.c = result > 0xFF;
            this.setZandN(result, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (result & 0xFF);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft++; // 1 extra cycle if m = 0
            let result;
            if (this.d) {
                result = (this.br[A] & 0x0F) + (value & 0x0F) + (this.c ? 1 : 0);
                result += result > 9 ? 6 : 0;
                result = ((this.br[A] & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F));
                result += result > 0x9F ? 0x60 : 0;
                result = ((this.br[A] & 0xF00) + (value & 0xF00) + (result > 0xFF ? 0x100 : 0) + (result & 0xFF));
                result += result > 0x9FF ? 0x600 : 0;
                result = ((this.br[A] & 0xF000) + (value & 0xF000) + (result > 0xFFF ? 0x1000 : 0) + (result & 0xFFF));
            } else {
                result = this.br[A] + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[A] & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
            result += (this.d && result > 0x9FFF) ? 0x6000 : 0;
            this.c = result > 0xFFFF;
            this.setZandN(result, this.m);
            this.br[A] = result & 0xFFFF;
        }
    };

    SnesCpu.prototype.sbc = function(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr) ^ 0xFF;
            let result;
            if (this.d) {
                result = (this.br[A] & 0x0F) + (value & 0x0F) + (this.c ? 1 : 0);
                result -= result <= 0x0F ? 6 : 0;
                result = ((this.br[A] & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F));
            } else {
                result = (this.br[A] & 0xFF) + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
            result -= (this.d && result <= 0xFF) ? 0x60 : 0;
            this.c = result > 0xFF;
            this.setZandN(result, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (result & 0xFF);
        } else {
            let value = this.readWord(adr, adrh) ^ 0xFFFF;
            this.cyclesLeft++; // 1 extra cycle if m = 0
            let result;
            if (this.d) {
                result = (this.br[A] & 0x0F) + (value & 0x0F) + (this.c ? 1 : 0);
                result -= result <= 0x0F ? 6 : 0;
                result = ((this.br[A] & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F));
                result -= result <= 0xFF ? 0x60 : 0;
                result = ((this.br[A] & 0xF00) + (value & 0xF00) + (result > 0xFF ? 0x100 : 0) + (result & 0xFF));
                result -= result <= 0x9FF ? 0x600 : 0;
                result = ((this.br[A] & 0xF000) + (value & 0xF000) + (result > 0xFFF ? 0x1000 : 0) + (result & 0xFFF));
            } else {
                result = this.br[A] + value + (this.c ? 1 : 0);
            }
            this.v = ((this.br[A] & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
            result -= (this.d && result <= 0xFFFF) ? 0x6000 : 0;
            this.c = result > 0xFFFF;
            this.setZandN(result, this.m);
            this.br[A] = result & 0xFFFF;
        }
    };

    // ========================================================================
    // REGISTER COMPARISONS
    // ========================================================================

    SnesCpu.prototype.cmp = function(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr) ^ 0xFF;
            let result = (this.br[A] & 0xFF) + value + 1;
            this.c = result > 0xFF;
            this.setZandN(result, this.m);
        } else {
            let value = this.readWord(adr, adrh) ^ 0xFFFF;
            this.cyclesLeft++; // 1 extra cycle if m = 0
            let result = this.br[A] + value + 1;
            this.c = result > 0xFFFF;
            this.setZandN(result, this.m);
        }
    };

    SnesCpu.prototype.cpx = function(adr, adrh) {
        if (this.x) {
            let value = this.mem.read(adr) ^ 0xFF;
            let result = (this.br[X] & 0xFF) + value + 1;
            this.c = result > 0xFF;
            this.setZandN(result, this.x);
        } else {
            let value = this.readWord(adr, adrh) ^ 0xFFFF;
            this.cyclesLeft++; // 1 extra cycle if x = 0
            let result = this.br[X] + value + 1;
            this.c = result > 0xFFFF;
            this.setZandN(result, this.x);
        }
    };

    SnesCpu.prototype.cpy = function(adr, adrh) {
        if (this.x) {
            let value = this.mem.read(adr) ^ 0xFF;
            let result = (this.br[Y] & 0xFF) + value + 1;
            this.c = result > 0xFF;
            this.setZandN(result, this.x);
        } else {
            let value = this.readWord(adr, adrh) ^ 0xFFFF;
            this.cyclesLeft++; // 1 extra cycle if x = 0
            let result = this.br[Y] + value + 1;
            this.c = result > 0xFFFF;
            this.setZandN(result, this.x);
        }
    };

    // ========================================================================
    // INCREMENTS & DECREMENTS (Memory & Register)
    // ========================================================================

    SnesCpu.prototype.dec = function(adr, adrh) {
        if (this.m) {
            let result = (this.mem.read(adr) - 1) & 0xFF;
            this.setZandN(result, this.m);
            this.mem.write(adr, result);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            let result = (value - 1) & 0xFFFF;
            this.setZandN(result, this.m);
            this.writeWord(adr, adrh, result, true);
        }
    };

    SnesCpu.prototype.deca = function(adr, adrh) {
        if (this.m) {
            let result = ((this.br[A] & 0xFF) - 1) & 0xFF;
            this.setZandN(result, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | result;
        } else {
            this.br[A]--;
            this.setZandN(this.br[A], this.m);
        }
    };

    SnesCpu.prototype.dex = function(adr, adrh) {
        if (this.x) {
            let result = ((this.br[X] & 0xFF) - 1) & 0xFF;
            this.setZandN(result, this.x);
            this.br[X] = result;
        } else {
            this.br[X]--;
            this.setZandN(this.br[X], this.x);
        }
    };

    SnesCpu.prototype.dey = function(adr, adrh) {
        if (this.x) {
            let result = ((this.br[Y] & 0xFF) - 1) & 0xFF;
            this.setZandN(result, this.x);
            this.br[Y] = result;
        } else {
            this.br[Y]--;
            this.setZandN(this.br[Y], this.x);
        }
    };

    SnesCpu.prototype.inc = function(adr, adrh) {
        if (this.m) {
            let result = (this.mem.read(adr) + 1) & 0xFF;
            this.setZandN(result, this.m);
            this.mem.write(adr, result);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            let result = (value + 1) & 0xFFFF;
            this.setZandN(result, this.m);
            this.writeWord(adr, adrh, result, true);
        }
    };

    SnesCpu.prototype.inca = function(adr, adrh) {
        if (this.m) {
            let result = ((this.br[A] & 0xFF) + 1) & 0xFF;
            this.setZandN(result, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | result;
        } else {
            this.br[A]++;
            this.setZandN(this.br[A], this.m);
        }
    };

    SnesCpu.prototype.inx = function(adr, adrh) {
        if (this.x) {
            let result = ((this.br[X] & 0xFF) + 1) & 0xFF;
            this.setZandN(result, this.x);
            this.br[X] = result;
        } else {
            this.br[X]++;
            this.setZandN(this.br[X], this.x);
        }
    };

    SnesCpu.prototype.iny = function(adr, adrh) {
        if (this.x) {
            let result = ((this.br[Y] & 0xFF) + 1) & 0xFF;
            this.setZandN(result, this.x);
            this.br[Y] = result;
        } else {
            this.br[Y]++;
            this.setZandN(this.br[Y], this.x);
        }
    };

    // ========================================================================
    // SHIFTS & ROTATES (ASL, LSR, ROL, ROR)
    // ========================================================================

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
            let value = this.br[A] & 0xFF;
            this.c = (value & 0x80) > 0;
            value <<= 1;
            this.setZandN(value, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (value & 0xFF);
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
            this.c = (value & 0x01) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            this.c = (value & 0x01) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    };

    SnesCpu.prototype.lsra = function(adr, adrh) {
        if (this.m) {
            let value = this.br[A] & 0xFF;
            this.c = (value & 0x01) > 0;
            value >>= 1;
            this.setZandN(value, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (value & 0xFF);
        } else {
            this.c = (this.br[A] & 0x01) > 0;
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
            let value = this.br[A] & 0xFF;
            value = (value << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x100) > 0;
            this.setZandN(value, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (value & 0xFF);
        } else {
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            let value = (this.br[A] << 1) | (this.c ? 1 : 0);
            this.c = (value & 0x10000) > 0;
            this.setZandN(value, this.m);
            this.br[A] = value;
        }
    };

    SnesCpu.prototype.ror = function(adr, adrh) {
        if (this.m) {
            let value = this.mem.read(adr);
            let carry = value & 0x01;
            value = (value >> 1) | (this.c ? 0x80 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.mem.write(adr, value);
        } else {
            let value = this.readWord(adr, adrh);
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            let carry = value & 0x01;
            value = (value >> 1) | (this.c ? 0x8000 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.writeWord(adr, adrh, value, true);
        }
    };

    SnesCpu.prototype.rora = function(adr, adrh) {
        if (this.m) {
            let value = this.br[A] & 0xFF;
            let carry = value & 0x01;
            value = (value >> 1) | (this.c ? 0x80 : 0);
            this.c = carry > 0;
            this.setZandN(value, this.m);
            this.br[A] = (this.br[A] & 0xFF00) | (value & 0xFF);
        } else {
            this.cyclesLeft += 2; // 2 extra cycles if m = 0
            let carry = this.br[A] & 0x01;
            let value = (this.br[A] >> 1) | (this.c ? 0x8000 : 0);
            this.c = carry > 0;
            this.setZandN(this.br[A], this.m);
            this.br[A] = value;
        }
    };
}