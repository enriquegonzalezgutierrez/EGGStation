/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSpc (Sony SPC700 Audio CPU Core - Base Definition)
 * Documented & Optimized: English comments, Float-aligned registers, Monomorphic dispatch
 * 
 * ROLE:
 * Coordinates the execution state, internal registers, status flags, and instruction
 * dispatch table for the Sony SPC700 sound coprocessor.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively manages register boundaries,
 *   flag operations, and instruction stepping.
 */

{
    // High-Speed Local Register Index Constants
    const A = 0;
    const X = 1;
    const Y = 2;
    const SP = 3;
    const PC = 0;

    // Addressing Mode Identifier Constants
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

    class SnesSpc {
        /**
         * @param {Apu} mem - Mapped memory routing interface of the APU context.
         */
        constructor(mem) {
            this.mem = mem;

            // Registers allocations (Float-aligned or typed arrays)
            this.r = new Uint8Array(4);      // [A, X, Y, SP]
            this.br = new Uint16Array(1);    // [PC]

            // Status flags decomposed into independent booleans
            this.n = false; // Negative
            this.v = false; // Overflow
            this.p = false; // Direct Page Selection
            this.b = false; // Break
            this.h = false; // Half-Carry
            this.i = false; // Interrupt Enable
            this.z = false; // Zero
            this.c = false; // Carry

            this.cyclesLeft = 0;

            // Zero-allocation static buffer for addressing resolution
            this.effBuffer = new Uint32Array(2);

            // Mapped Opcodes Addressing Modes Table
            this.modes = [
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, ABS, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, ABS, IAX,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, DPR, REL,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, DP , ABS,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, ABS, DP ,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, ABS, ABS,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, DPR, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, DP , IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMM, IMP, DI ,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, IMP, IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMM, IMP, IPI,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, IMP, IPI,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, ABS, ABB, DP , ABS, IMM, IMP, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DP , DPY, DP , DPX, IMP, IMP, DXR, IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, ABS, ABB, DP , ABS, IMP, IMP, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DP , DPY, DD , DPX, IMP, IMP, REL, IMP
            ];

            // Cycles duration tables
            this.cycles = [
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 6, 8,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 4, 6,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 5, 4,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 3, 8,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 6, 6,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 4, 5, 2, 2, 4, 3,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 5, 5,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 6,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 2, 4, 5,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 12,5,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 2, 4, 4,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 4,
                2, 8, 4, 5, 4, 5, 4, 7, 2, 5, 6, 4, 5, 2, 4, 9,
                2, 8, 4, 5, 5, 6, 6, 7, 4, 5, 5, 5, 2, 2, 6, 3,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 4, 5, 3, 4, 3, 4, 3,
                2, 8, 4, 5, 4, 5, 5, 6, 3, 4, 5, 4, 2, 2, 4, 3
            ];

            this.functions = [];
            this.bindInstructionMap();
            this.reset();
        }

        reset() {
            this.r[A] = 0;
            this.r[X] = 0;
            this.r[Y] = 0;
            this.r[SP] = 0;

            if (this.mem.read) {
                this.br[PC] = this.mem.read(0xfffe) | (this.mem.read(0xffff) << 8);
            } else {
                this.br[PC] = 0;
            }

            this.n = false;
            this.v = false;
            this.p = false;
            this.b = false;
            this.h = false;
            this.i = false;
            this.z = false;
            this.c = false;

            this.cyclesLeft = 7;
        }

        /**
         * Steps the CPU core on execution ticks.
         */
        cycle() {
            if (this.cyclesLeft === 0) {
                const instr = this.mem.read(this.br[PC]++);
                const mode = this.modes[instr];
                this.cyclesLeft = this.cycles[instr];

                const eff = this.getAdr(mode);
                this.functions[instr](eff[0], eff[1], instr);
            }
            this.cyclesLeft--;
        }

        getP() {
            let value = 0;
            value |= this.n ? 0x80 : 0;
            value |= this.v ? 0x40 : 0;
            value |= this.p ? 0x20 : 0;
            value |= this.b ? 0x10 : 0;
            value |= this.h ? 0x08 : 0;
            value |= this.i ? 0x04 : 0;
            value |= this.z ? 0x02 : 0;
            value |= this.c ? 0x01 : 0;
            return value;
        }

        setP(value) {
            this.n = (value & 0x80) > 0;
            this.v = (value & 0x40) > 0;
            this.p = (value & 0x20) > 0;
            this.b = (value & 0x10) > 0;
            this.h = (value & 0x08) > 0;
            this.i = (value & 0x04) > 0;
            this.z = (value & 0x02) > 0;
            this.c = (value & 0x01) > 0;
        }

        setZandN(val) {
            const v = val & 0xff;
            this.n = v > 0x7f;
            this.z = v === 0;
        }

        getSigned(val) {
            return (val << 24) >> 24;
        }

        doBranch(check, rel) {
            if (check) {
                this.br[PC] += rel;
                this.cyclesLeft += 2;
            }
        }

        push(value) {
            this.mem.write(this.r[SP] | 0x100, value);
            this.r[SP]--;
        }

        pop() {
            this.r[SP]++;
            return this.mem.read(this.r[SP] | 0x100);
        }

        /**
         * Pre-binds instruction handlers to map indexes once.
         */
        bindInstructionMap() {
            this.functions = [
                this.nop , this.tcall,this.set1, this.bbs , this.or  , this.or  , this.or  , this.or  , this.or  , this.orm , this.or1 , this.asl , this.asl , this.pushp,this.tset1,this.brk ,
                this.bpl , this.tcall,this.clr1, this.bbc , this.or  , this.or  , this.or  , this.or  , this.orm , this.orm , this.decw, this.asl , this.asla, this.decx, this.cmpx, this.jmp ,
                this.clrp, this.tcall,this.set1, this.bbs , this.and , this.and , this.and , this.and , this.and , this.andm, this.or1n, this.rol , this.rol , this.pusha,this.cbne, this.bra ,
                this.bmi , this.tcall,this.clr1, this.bbc , this.and , this.and , this.and , this.and , this.andm, this.andm, this.incw, this.rol , this.rola, this.incx, this.cmpx, this.call,
                this.setp, this.tcall,this.set1, this.bbs , this.eor , this.eor , this.eor , this.eor , this.eor , this.eorm, this.and1, this.lsr , this.lsr , this.pushx,this.tclr1,this.pcall,
                this.bvc , this.tcall,this.clr1, this.bbc , this.eor , this.eor , this.eor , this.eor , this.eorm, this.eorm, this.cmpw, this.lsr , this.lsra, this.movxa,this.cmpy, this.jmp ,
                this.clrc, this.tcall,this.set1, this.bbs , this.cmp , this.cmp , this.cmp , this.cmp , this.cmp , this.cmpm, this.and1n,this.ror , this.ror , this.pushy,this.dbnz, this.ret ,
                this.bvs , this.tcall,this.clr1, this.bbc , this.cmp , this.cmp , this.cmp , this.cmp , this.cmpm, this.cmpm, this.addw, this.ror , this.rora, this.movax,this.cmpy, this.reti,
                this.setc, this.tcall,this.set1, this.bbs , this.adc , this.adc , this.adc , this.adc , this.adc , this.adcm, this.eor1, this.dec , this.dec , this.movy, this.popp, this.movm,
                this.bcc , this.tcall,this.clr1, this.bbc , this.adc , this.adc , this.adc , this.adc , this.adcm, this.adcm, this.subw, this.dec , this.deca, this.movxp,this.div , this.xcn ,
                this.ei  , this.tcall,this.set1, this.bbs , this.sbc , this.sbc , this.sbc , this.sbc , this.sbc , this.sbcm, this.mov1, this.inc , this.inc , this.cmpy, this.popa, this.movs,
                this.bcs , this.tcall,this.clr1, this.bbc , this.sbc , this.sbc , this.sbc , this.sbc , this.sbcm, this.sbcm, this.movw, this.inc , this.inca, this.movpx,this.das , this.mov ,
                this.di  , this.tcall,this.set1, this.bbs , this.movs, this.movs, this.movs, this.movs, this.cmpx, this.movsx,this.mov1s,this.movsy,this.movsy,this.movx, this.popx, this.mul ,
                this.bne , this.tcall,this.clr1, this.bbc , this.movs, this.movs, this.movs, this.movs, this.movsx,this.movsx,this.movws,this.movsy,this.decy, this.movay,this.cbne, this.daa ,
                this.clrv, this.tcall,this.set1, this.bbs , this.mov , this.mov , this.mov , this.mov , this.mov , this.movx, this.not1, this.movy, this.movy, this.notc, this.popy, this.sleep,
                this.beq , this.tcall,this.clr1, this.bbc , this.mov , this.mov , this.mov , this.mov , this.movx, this.movx, this.movm, this.movy, this.incy, this.movya,this.dbnzy,this.stop
            ];

            for (let i = 0; i < 256; i++) {
                if (this.functions[i]) {
                    this.functions[i] = this.functions[i].bind(this);
                }
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesSpc;
    } else if (typeof window !== 'undefined') {
        window.SnesSpc = SnesSpc;
        window.Spc = SnesSpc; // Backward compatibility alias
    }
}