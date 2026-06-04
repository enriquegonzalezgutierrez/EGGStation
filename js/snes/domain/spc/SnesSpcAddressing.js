/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSpcAddressing (Prototype Extension)
 * 
 * ROLE:
 * Handles absolute/relative physical address decoding and indirect pointer
 * resolution for the Sony SPC700 CPU.
 */

{
    const A = 0;
    const X = 1;
    const Y = 2;
    const SP = 3;
    const PC = 0;

    const IMP = 0;
    const REL = 1;
    const DP = 2;
    const DPR = 3;
    const ABS = 4;
    const IND = 5;
    const IDX = 6;
    const IMM = 7;
    const DPX = 8;
    const ABX = 9;
    const ABY = 10;
    const IDY = 11;
    const DD = 12;
    const II = 13;
    const DI = 14;
    const DPY = 15;
    const ABB = 16;
    const DXR = 17;
    const IAX = 18;
    const IPI = 19;

    SnesSpc.prototype.getAdr = function(mode) {
        const buf = this.effBuffer;
        switch(mode) {
            case IMP: {
                buf[0] = 0; buf[1] = 0;
                return buf;
            }
            case REL: {
                const rel = this.mem.read(this.br[PC]++);
                buf[0] = (rel << 24) >> 24; buf[1] = 0;
                return buf;
            }
            case DP: {
                let adr = this.mem.read(this.br[PC]++);
                buf[0] = adr | (this.p ? 0x100 : 0);
                buf[1] = ((adr + 1) & 0xff) | (this.p ? 0x100 : 0);
                return buf;
            }
            case DPR: {
                let adr = this.mem.read(this.br[PC]++);
                const rel = this.mem.read(this.br[PC]++);
                buf[0] = adr | (this.p ? 0x100 : 0);
                buf[1] = (rel << 24) >> 24;
                return buf;
            }
            case ABS: {
                let adr = this.mem.read(this.br[PC]++);
                adr |= this.mem.read(this.br[PC]++) << 8;
                buf[0] = adr; buf[1] = 0;
                return buf;
            }
            case IND: {
                buf[0] = this.r[X] | (this.p ? 0x100 : 0);
                buf[1] = 0;
                return buf;
            }
            case IDX: {
                let pointer = this.mem.read(this.br[PC]++);
                let adr = this.mem.read(
                    ((pointer + this.r[X]) & 0xff) | (this.p ? 0x100 : 0)
                );
                adr |= this.mem.read(
                    ((pointer + 1 + this.r[X]) & 0xff) | (this.p ? 0x100 : 0)
                ) << 8;
                buf[0] = adr; buf[1] = 0;
                return buf;
            }
            case IMM: {
                buf[0] = this.br[PC]++; buf[1] = 0;
                return buf;
            }
            case DPX: {
                let adr = this.mem.read(this.br[PC]++);
                buf[0] = ((adr + this.r[X]) & 0xff) | (this.p ? 0x100 : 0);
                buf[1] = 0;
                return buf;
            }
            case ABX: {
                let adr = this.mem.read(this.br[PC]++);
                adr |= this.mem.read(this.br[PC]++) << 8;
                buf[0] = (adr + this.r[X]) & 0xffff; buf[1] = 0;
                return buf;
            }
            case ABY: {
                let adr = this.mem.read(this.br[PC]++);
                adr |= this.mem.read(this.br[PC]++) << 8;
                buf[0] = (adr + this.r[Y]) & 0xffff; buf[1] = 0;
                return buf;
            }
            case IDY: {
                let pointer = this.mem.read(this.br[PC]++);
                let adr = this.mem.read(pointer | (this.p ? 0x100 : 0));
                adr |= this.mem.read(
                    ((pointer + 1) & 0xff) | (this.p ? 0x100 : 0)
                ) << 8;
                buf[0] = (adr + this.r[Y]) & 0xffff; buf[1] = 0;
                return buf;
            }
            case DD: {
                let adr = this.mem.read(this.br[PC]++);
                let adr2 = this.mem.read(this.br[PC]++);
                buf[0] = adr | (this.p ? 0x100 : 0);
                buf[1] = adr2 | (this.p ? 0x100 : 0);
                return buf;
            }
            case II: {
                buf[0] = this.r[Y] | (this.p ? 0x100 : 0);
                buf[1] = this.r[X] | (this.p ? 0x100 : 0);
                return buf;
            }
            case DI: {
                let imm = this.br[PC]++;
                let adr = this.mem.read(this.br[PC]++);
                buf[0] = imm; buf[1] = adr | (this.p ? 0x100 : 0);
                return buf;
            }
            case DPY: {
                let adr = this.mem.read(this.br[PC]++);
                buf[0] = ((adr + this.r[Y]) & 0xff) | (this.p ? 0x100 : 0);
                buf[1] = 0;
                return buf;
            }
            case ABB: {
                let adr = this.mem.read(this.br[PC]++);
                adr |= this.mem.read(this.br[PC]++) << 8;
                buf[0] = adr & 0x1fff; buf[1] = adr >> 13;
                return buf;
            }
            case DXR: {
                let adr = this.mem.read(this.br[PC]++);
                const rel = (this.mem.read(this.br[PC]++) << 24) >> 24;
                buf[0] = ((adr + this.r[X]) & 0xff) | (this.p ? 0x100 : 0);
                buf[1] = rel;
                return buf;
            }
            case IAX: {
                let adr = this.mem.read(this.br[PC]++);
                adr |= this.mem.read(this.br[PC]++) << 8;
                let radr = this.mem.read((adr + this.r[X]) & 0xffff);
                radr |= this.mem.read((adr + this.r[X] + 1) & 0xffff) << 8;
                buf[0] = radr; buf[1] = 0;
                return buf;
            }
            case IPI: {
                buf[0] = this.r[X]++ | (this.p ? 0x100 : 0);
                buf[1] = 0;
                return buf;
            }
        }
    };
}