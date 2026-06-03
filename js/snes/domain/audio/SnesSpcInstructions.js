/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSpcInstructions (Sony SPC700 Audio CPU Opcode Handlers)
 *
 * All 256 opcode handlers as static functions.
 * The SPC instance is passed as the first argument (spc) instead of using
 * `this`, eliminating prototype dispatch and .bind() allocation costs.
 *
 * Depends on: SnesSpcAddressing.js (SPC_REG_* / SPC_MODE_* constants)
 */

class SnesSpcInstructions {

    // ========================================================================
    // FLAG & CONTROL
    // ========================================================================

    static nop(spc, adr, adrh, instr) {}

    static clrp(spc) { spc.p = false; }
    static setp(spc) { spc.p = true; }
    static clrc(spc) { spc.c = false; }
    static setc(spc) { spc.c = true; }
    static ei(spc)   { spc.i = true; }
    static di(spc)   { spc.i = false; }
    static clrv(spc) { spc.v = false; spc.h = false; }
    static notc(spc) { spc.c = !spc.c; }

    // ========================================================================
    // BRANCH
    // ========================================================================

    static bpl(spc, adr) { spc.doBranch(!spc.n, adr); }
    static bmi(spc, adr) { spc.doBranch( spc.n, adr); }
    static bvc(spc, adr) { spc.doBranch(!spc.v, adr); }
    static bvs(spc, adr) { spc.doBranch( spc.v, adr); }
    static bcc(spc, adr) { spc.doBranch(!spc.c, adr); }
    static bcs(spc, adr) { spc.doBranch( spc.c, adr); }
    static bne(spc, adr) { spc.doBranch(!spc.z, adr); }
    static beq(spc, adr) { spc.doBranch( spc.z, adr); }
    static bra(spc, adr) { spc.br[SPC_REG_PC] += adr; }

    static bbs(spc, adr, adrh, instr) {
        const value = spc.mem.read(adr);
        spc.doBranch((value & (1 << (instr >> 5))) > 0, adrh);
    }

    static bbc(spc, adr, adrh, instr) {
        const value = spc.mem.read(adr);
        spc.doBranch((value & (1 << (instr >> 5))) === 0, adrh);
    }

    static cbne(spc, adr, adrh) {
        const value = spc.mem.read(adr) ^ 0xff;
        const result = spc.r[SPC_REG_A] + value + 1;
        spc.doBranch((result & 0xff) !== 0, adrh);
    }

    static dbnz(spc, adr, adrh) {
        const value = (spc.mem.read(adr) - 1) & 0xff;
        spc.mem.write(adr, value);
        spc.doBranch(value !== 0, adrh);
    }

    static dbnzy(spc, adr) {
        spc.r[SPC_REG_Y]--;
        spc.doBranch(spc.r[SPC_REG_Y] !== 0, adr);
    }

    // ========================================================================
    // CALL / JUMP / RETURN
    // ========================================================================

    static tcall(spc, adr, adrh, instr) {
        spc.push(spc.br[SPC_REG_PC] >> 8);
        spc.push(spc.br[SPC_REG_PC] & 0xff);
        const padr = 0xffc0 + ((15 - (instr >> 4)) << 1);
        spc.br[SPC_REG_PC] = spc.mem.read(padr) | (spc.mem.read(padr + 1) << 8);
    }

    static jmp(spc, adr)  { spc.br[SPC_REG_PC] = adr; }

    static call(spc, adr) {
        spc.push(spc.br[SPC_REG_PC] >> 8);
        spc.push(spc.br[SPC_REG_PC] & 0xff);
        spc.br[SPC_REG_PC] = adr;
    }

    static pcall(spc, adr) {
        spc.push(spc.br[SPC_REG_PC] >> 8);
        spc.push(spc.br[SPC_REG_PC] & 0xff);
        spc.br[SPC_REG_PC] = 0xff00 + (adr & 0xff);
    }

    static ret(spc) {
        spc.br[SPC_REG_PC]  = spc.pop();
        spc.br[SPC_REG_PC] |= spc.pop() << 8;
    }

    static reti(spc) {
        spc.setP(spc.pop());
        spc.br[SPC_REG_PC]  = spc.pop();
        spc.br[SPC_REG_PC] |= spc.pop() << 8;
    }

    static brk(spc) {
        spc.push(spc.br[SPC_REG_PC] >> 8);
        spc.push(spc.br[SPC_REG_PC] & 0xff);
        spc.push(spc.getP());
        spc.i = false;
        spc.b = true;
        spc.br[SPC_REG_PC] = spc.mem.read(0xffde) | (spc.mem.read(0xffdf) << 8);
    }

    static sleep(spc) { spc.br[SPC_REG_PC]--; }
    static stop(spc)  { spc.br[SPC_REG_PC]--; }

    // ========================================================================
    // BIT MANIPULATION
    // ========================================================================

    static set1(spc, adr, adrh, instr) {
        let value = spc.mem.read(adr);
        value |= (1 << (instr >> 5));
        spc.mem.write(adr, value);
    }

    static clr1(spc, adr, adrh, instr) {
        let value = spc.mem.read(adr);
        value &= ~(1 << (instr >> 5));
        spc.mem.write(adr, value);
    }

    static or1(spc, adr, adrh) {
        const bit = (spc.mem.read(adr) >> adrh) & 0x1;
        spc.c = ((spc.c ? 1 : 0) | bit) > 0;
    }

    static or1n(spc, adr, adrh) {
        const bit = (spc.mem.read(adr) >> adrh) & 0x1;
        spc.c = ((spc.c ? 1 : 0) | (bit > 0 ? 0 : 1)) > 0;
    }

    static and1(spc, adr, adrh) {
        const bit = (spc.mem.read(adr) >> adrh) & 0x1;
        spc.c = ((spc.c ? 1 : 0) & bit) > 0;
    }

    static and1n(spc, adr, adrh) {
        const bit = (spc.mem.read(adr) >> adrh) & 0x1;
        spc.c = ((spc.c ? 1 : 0) & (bit > 0 ? 0 : 1)) > 0;
    }

    static eor1(spc, adr, adrh) {
        const bit = (spc.mem.read(adr) >> adrh) & 0x1;
        spc.c = ((spc.c ? 1 : 0) ^ bit) > 0;
    }

    static mov1(spc, adr, adrh) {
        spc.c = ((spc.mem.read(adr) >> adrh) & 0x1) > 0;
    }

    static mov1s(spc, adr, adrh) {
        let value = spc.mem.read(adr);
        const bit = 1 << adrh;
        value = spc.c ? (value | bit) : (value & ~bit);
        spc.mem.write(adr, value);
    }

    static not1(spc, adr, adrh) {
        const bit = 1 << adrh;
        spc.mem.write(adr, spc.mem.read(adr) ^ bit);
    }

    static tset1(spc, adr) {
        const value = spc.mem.read(adr);
        const result = spc.r[SPC_REG_A] + (value ^ 0xff) + 1;
        spc.setZandN(result);
        spc.mem.write(adr, value | spc.r[SPC_REG_A]);
    }

    static tclr1(spc, adr) {
        const value = spc.mem.read(adr);
        const result = spc.r[SPC_REG_A] + (value ^ 0xff) + 1;
        spc.setZandN(result);
        spc.mem.write(adr, value & ~spc.r[SPC_REG_A]);
    }

    // ========================================================================
    // LOGIC — OR / AND / EOR
    // ========================================================================

    static or(spc, adr) {
        spc.r[SPC_REG_A] |= spc.mem.read(adr);
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static orm(spc, adr, adrh) {
        let value = spc.mem.read(adrh);
        value |= spc.mem.read(adr);
        spc.mem.write(adrh, value);
        spc.setZandN(value);
    }

    static and(spc, adr) {
        spc.r[SPC_REG_A] &= spc.mem.read(adr);
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static andm(spc, adr, adrh) {
        let value = spc.mem.read(adrh);
        value &= spc.mem.read(adr);
        spc.mem.write(adrh, value);
        spc.setZandN(value);
    }

    static eor(spc, adr) {
        spc.r[SPC_REG_A] ^= spc.mem.read(adr);
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static eorm(spc, adr, adrh) {
        let value = spc.mem.read(adrh);
        value ^= spc.mem.read(adr);
        spc.mem.write(adrh, value);
        spc.setZandN(value);
    }

    // ========================================================================
    // COMPARE
    // ========================================================================

    static cmp(spc, adr) {
        const value  = spc.mem.read(adr) ^ 0xff;
        const result = spc.r[SPC_REG_A] + value + 1;
        spc.c = result > 0xff;
        spc.setZandN(result);
    }

    static cmpm(spc, adr, adrh) {
        const value  = spc.mem.read(adrh);
        const result = value + (spc.mem.read(adr) ^ 0xff) + 1;
        spc.c = result > 0xff;
        spc.setZandN(result);
    }

    static cmpx(spc, adr) {
        const value  = spc.mem.read(adr) ^ 0xff;
        const result = spc.r[SPC_REG_X] + value + 1;
        spc.c = result > 0xff;
        spc.setZandN(result);
    }

    static cmpy(spc, adr) {
        const value  = spc.mem.read(adr) ^ 0xff;
        const result = spc.r[SPC_REG_Y] + value + 1;
        spc.c = result > 0xff;
        spc.setZandN(result);
    }

    static cmpw(spc, adr, adrh) {
        const value  = spc.mem.read(adr) | (spc.mem.read(adrh) << 8);
        const addTo  = (spc.r[SPC_REG_Y] << 8) | spc.r[SPC_REG_A];
        const result = addTo + (value ^ 0xffff) + 1;
        spc.z = (result & 0xffff) === 0;
        spc.n = (result & 0x8000) > 0;
        spc.c = result > 0xffff;
    }

    // ========================================================================
    // ARITHMETIC — ADD / SUB
    // ========================================================================

    static adc(spc, adr) {
        const value  = spc.mem.read(adr);
        const result = spc.r[SPC_REG_A] + value + (spc.c ? 1 : 0);
        spc.v = ((spc.r[SPC_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        spc.h = ((spc.r[SPC_REG_A] & 0xf)  + (value & 0xf)  + (spc.c ? 1 : 0)) > 0xf;
        spc.c = result > 0xff;
        spc.setZandN(result);
        spc.r[SPC_REG_A] = result;
    }

    static adcm(spc, adr, adrh) {
        const value   = spc.mem.read(adr);
        const addedTo = spc.mem.read(adrh);
        const result  = addedTo + value + (spc.c ? 1 : 0);
        spc.v = ((addedTo & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        spc.h = ((addedTo & 0xf)  + (value & 0xf)  + (spc.c ? 1 : 0)) > 0xf;
        spc.c = result > 0xff;
        spc.setZandN(result);
        spc.mem.write(adrh, result & 0xff);
    }

    static addw(spc, adr, adrh) {
        const value  = spc.mem.read(adr) | (spc.mem.read(adrh) << 8);
        const addTo  = (spc.r[SPC_REG_Y] << 8) | spc.r[SPC_REG_A];
        const result = addTo + value;
        spc.z = (result & 0xffff) === 0;
        spc.n = (result & 0x8000) > 0;
        spc.c = result > 0xffff;
        spc.v = ((addTo & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
        spc.h = ((addTo & 0xfff)  + (value & 0xfff)) > 0x0fff;
        spc.r[SPC_REG_A] = result & 0xff;
        spc.r[SPC_REG_Y] = (result & 0xff00) >> 8;
    }

    static sbc(spc, adr) {
        const value  = spc.mem.read(adr) ^ 0xff;
        const result = spc.r[SPC_REG_A] + value + (spc.c ? 1 : 0);
        spc.v = ((spc.r[SPC_REG_A] & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        spc.h = ((spc.r[SPC_REG_A] & 0xf)  + (value & 0xf)  + (spc.c ? 1 : 0)) > 0xf;
        spc.c = result > 0xff;
        spc.setZandN(result);
        spc.r[SPC_REG_A] = result;
    }

    static sbcm(spc, adr, adrh) {
        const value   = spc.mem.read(adr) ^ 0xff;
        const addedTo = spc.mem.read(adrh);
        const result  = addedTo + value + (spc.c ? 1 : 0);
        spc.v = ((addedTo & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
        spc.h = ((addedTo & 0xf)  + (value & 0xf)  + (spc.c ? 1 : 0)) > 0xf;
        spc.c = result > 0xff;
        spc.setZandN(result);
        spc.mem.write(adrh, result & 0xff);
    }

    static subw(spc, adr, adrh) {
        let value    = spc.mem.read(adr) | (spc.mem.read(adrh) << 8);
        value       ^= 0xffff;
        const addTo  = (spc.r[SPC_REG_Y] << 8) | spc.r[SPC_REG_A];
        const result = addTo + value + 1;
        spc.z = (result & 0xffff) === 0;
        spc.n = (result & 0x8000) > 0;
        spc.c = result > 0xffff;
        spc.v = ((addTo & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
        spc.h = ((addTo & 0xfff)  + (value & 0xfff) + 1) > 0xfff;
        spc.r[SPC_REG_A] = result & 0xff;
        spc.r[SPC_REG_Y] = (result & 0xff00) >> 8;
    }

    // ========================================================================
    // SHIFT / ROTATE
    // ========================================================================

    static asl(spc, adr) {
        let value = spc.mem.read(adr);
        spc.c = (value & 0x80) > 0;
        value <<= 1;
        spc.setZandN(value);
        spc.mem.write(adr, value & 0xff);
    }

    static asla(spc) {
        spc.c = (spc.r[SPC_REG_A] & 0x80) > 0;
        spc.r[SPC_REG_A] <<= 1;
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static rol(spc, adr) {
        let value      = spc.mem.read(adr);
        const carry    = (value & 0x80) > 0;
        value          = (value << 1) | (spc.c ? 1 : 0);
        spc.c = carry > 0;
        spc.setZandN(value);
        spc.mem.write(adr, value & 0xff);
    }

    static rola(spc) {
        const carry      = (spc.r[SPC_REG_A] & 0x80) > 0;
        spc.r[SPC_REG_A] = (spc.r[SPC_REG_A] << 1) | (spc.c ? 1 : 0);
        spc.c = carry > 0;
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static lsr(spc, adr) {
        let value = spc.mem.read(adr);
        spc.c = (value & 0x1) > 0;
        value >>= 1;
        spc.setZandN(value);
        spc.mem.write(adr, value & 0xff);
    }

    static lsra(spc) {
        spc.c = (spc.r[SPC_REG_A] & 0x1) > 0;
        spc.r[SPC_REG_A] >>= 1;
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static ror(spc, adr) {
        let value   = spc.mem.read(adr);
        const carry = (value & 0x1) > 0;
        value       = (value >> 1) | (spc.c ? 0x80 : 0);
        spc.c = carry > 0;
        spc.setZandN(value);
        spc.mem.write(adr, value & 0xff);
    }

    static rora(spc) {
        const carry      = (spc.r[SPC_REG_A] & 0x1) > 0;
        spc.r[SPC_REG_A] = (spc.r[SPC_REG_A] >> 1) | (spc.c ? 0x80 : 0);
        spc.c = carry > 0;
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    // ========================================================================
    // INC / DEC
    // ========================================================================

    static inc(spc, adr) {
        const value = (spc.mem.read(adr) + 1) & 0xff;
        spc.setZandN(value);
        spc.mem.write(adr, value);
    }
    static inca(spc) { spc.r[SPC_REG_A]++; spc.setZandN(spc.r[SPC_REG_A]); }
    static incx(spc) { spc.r[SPC_REG_X]++; spc.setZandN(spc.r[SPC_REG_X]); }
    static incy(spc) { spc.r[SPC_REG_Y]++; spc.setZandN(spc.r[SPC_REG_Y]); }

    static incw(spc, adr, adrh) {
        let value = spc.mem.read(adr) | (spc.mem.read(adrh) << 8);
        value = (value + 1) & 0xffff;
        spc.z = value === 0;
        spc.n = (value & 0x8000) > 0;
        spc.mem.write(adr, value & 0xff);
        spc.mem.write(adrh, value >> 8);
    }

    static dec(spc, adr) {
        const value = (spc.mem.read(adr) - 1) & 0xff;
        spc.setZandN(value);
        spc.mem.write(adr, value);
    }
    static deca(spc) { spc.r[SPC_REG_A]--; spc.setZandN(spc.r[SPC_REG_A]); }
    static decx(spc) { spc.r[SPC_REG_X]--; spc.setZandN(spc.r[SPC_REG_X]); }
    static decy(spc) { spc.r[SPC_REG_Y]--; spc.setZandN(spc.r[SPC_REG_Y]); }

    static decw(spc, adr, adrh) {
        let value = spc.mem.read(adr) | (spc.mem.read(adrh) << 8);
        value = (value - 1) & 0xffff;
        spc.z = value === 0;
        spc.n = (value & 0x8000) > 0;
        spc.mem.write(adr, value & 0xff);
        spc.mem.write(adrh, value >> 8);
    }

    static xcn(spc) {
        spc.r[SPC_REG_A] = (spc.r[SPC_REG_A] >> 4) | (spc.r[SPC_REG_A] << 4);
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    // ========================================================================
    // STACK
    // ========================================================================

    static pushp(spc) { spc.push(spc.getP()); }
    static pusha(spc) { spc.push(spc.r[SPC_REG_A]); }
    static pushx(spc) { spc.push(spc.r[SPC_REG_X]); }
    static pushy(spc) { spc.push(spc.r[SPC_REG_Y]); }
    static popp(spc)  { spc.setP(spc.pop()); }
    static popa(spc)  { spc.r[SPC_REG_A] = spc.pop(); }
    static popx(spc)  { spc.r[SPC_REG_X] = spc.pop(); }
    static popy(spc)  { spc.r[SPC_REG_Y] = spc.pop(); }

    // ========================================================================
    // MOVE
    // ========================================================================

    static mov(spc, adr)  { spc.r[SPC_REG_A] = spc.mem.read(adr); spc.setZandN(spc.r[SPC_REG_A]); }
    static movx(spc, adr) { spc.r[SPC_REG_X] = spc.mem.read(adr); spc.setZandN(spc.r[SPC_REG_X]); }
    static movy(spc, adr) { spc.r[SPC_REG_Y] = spc.mem.read(adr); spc.setZandN(spc.r[SPC_REG_Y]); }

    static movs(spc, adr, adrh, instr) {
        if (instr !== 0xaf) spc.mem.read(adr);
        spc.mem.write(adr, spc.r[SPC_REG_A]);
    }

    static movsx(spc, adr) {
        spc.mem.read(adr);
        spc.mem.write(adr, spc.r[SPC_REG_X]);
    }

    static movsy(spc, adr) {
        spc.mem.read(adr);
        spc.mem.write(adr, spc.r[SPC_REG_Y]);
    }

    static movw(spc, adr, adrh) {
        spc.r[SPC_REG_A] = spc.mem.read(adr);
        spc.r[SPC_REG_Y] = spc.mem.read(adrh);
        spc.z = spc.r[SPC_REG_A] === 0 && spc.r[SPC_REG_Y] === 0;
        spc.n = (spc.r[SPC_REG_Y] & 0x80) > 0;
    }

    static movws(spc, adr, adrh) {
        spc.mem.read(adr);
        spc.mem.write(adr, spc.r[SPC_REG_A]);
        spc.mem.write(adrh, spc.r[SPC_REG_Y]);
    }

    static movm(spc, adr, adrh, instr) {
        if (instr === 0x8f) spc.mem.read(adrh);
        spc.mem.write(adrh, spc.mem.read(adr));
    }

    // Register-to-register transfers
    static movxa(spc) { spc.r[SPC_REG_X] = spc.r[SPC_REG_A]; spc.setZandN(spc.r[SPC_REG_X]); }
    static movax(spc) { spc.r[SPC_REG_A] = spc.r[SPC_REG_X]; spc.setZandN(spc.r[SPC_REG_A]); }
    static movay(spc) { spc.r[SPC_REG_A] = spc.r[SPC_REG_Y]; spc.setZandN(spc.r[SPC_REG_A]); }
    static movya(spc) { spc.r[SPC_REG_Y] = spc.r[SPC_REG_A]; spc.setZandN(spc.r[SPC_REG_Y]); }
    static movxp(spc) { spc.r[SPC_REG_X] = spc.r[SPC_REG_SP]; spc.setZandN(spc.r[SPC_REG_X]); }
    static movpx(spc) { spc.r[SPC_REG_SP] = spc.r[SPC_REG_X]; }

    // ========================================================================
    // MULTIPLY / DIVIDE / DECIMAL
    // ========================================================================

    static mul(spc) {
        const result     = spc.r[SPC_REG_Y] * spc.r[SPC_REG_A];
        spc.r[SPC_REG_A] = result & 0xff;
        spc.r[SPC_REG_Y] = (result & 0xff00) >> 8;
        spc.setZandN(spc.r[SPC_REG_Y]);
    }

    static div(spc) {
        const value = spc.r[SPC_REG_A] | (spc.r[SPC_REG_Y] << 8);
        let result  = 0xffff;
        let mod     = value & 0xff;
        if (spc.r[SPC_REG_X] !== 0) {
            result = (value / spc.r[SPC_REG_X]) & 0xffff;
            mod    = value % spc.r[SPC_REG_X];
        }
        spc.v = result > 0xff;
        spc.h = (spc.r[SPC_REG_X] & 0xf) <= (spc.r[SPC_REG_Y] & 0xf);
        spc.r[SPC_REG_A] = result;
        spc.r[SPC_REG_Y] = mod;
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static daa(spc) {
        if (spc.r[SPC_REG_A] > 0x99 || spc.c) {
            spc.r[SPC_REG_A] += 0x60;
            spc.c = true;
        }
        if ((spc.r[SPC_REG_A] & 0xf) > 9 || spc.h) {
            spc.r[SPC_REG_A] += 6;
        }
        spc.setZandN(spc.r[SPC_REG_A]);
    }

    static das(spc) {
        if (spc.r[SPC_REG_A] > 0x99 || !spc.c) {
            spc.r[SPC_REG_A] -= 0x60;
            spc.c = false;
        }
        if ((spc.r[SPC_REG_A] & 0xf) > 9 || !spc.h) {
            spc.r[SPC_REG_A] -= 6;
        }
        spc.setZandN(spc.r[SPC_REG_A]);
    }
}

window.SnesSpcInstructions = SnesSpcInstructions;
