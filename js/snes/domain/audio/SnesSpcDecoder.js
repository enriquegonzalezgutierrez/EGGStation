/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSpcDecoder (Sony SPC700 Audio CPU Static Jump Table)
 *
 * Maps all 256 opcodes to their SnesSpcInstructions handler using a single
 * static array built once at parse time — never re-allocated per SPC instance.
 * This eliminates the 256 closures previously created by bindInstructionMap().
 *
 * Depends on: SnesSpcInstructions.js (loaded before this file)
 */

class SnesSpcDecoder {}

// Build the static jump table once — shared by every SnesSpc instance.
{
    const I = SnesSpcInstructions;
    SnesSpcDecoder.TABLE = [
        I.nop,   I.tcall, I.set1,  I.bbs,   I.or,    I.or,    I.or,    I.or,    I.or,    I.orm,   I.or1,   I.asl,   I.asl,   I.pushp, I.tset1, I.brk,
        I.bpl,   I.tcall, I.clr1,  I.bbc,   I.or,    I.or,    I.or,    I.or,    I.orm,   I.orm,   I.decw,  I.asl,   I.asla,  I.decx,  I.cmpx,  I.jmp,
        I.clrp,  I.tcall, I.set1,  I.bbs,   I.and,   I.and,   I.and,   I.and,   I.and,   I.andm,  I.or1n,  I.rol,   I.rol,   I.pusha, I.cbne,  I.bra,
        I.bmi,   I.tcall, I.clr1,  I.bbc,   I.and,   I.and,   I.and,   I.and,   I.andm,  I.andm,  I.incw,  I.rol,   I.rola,  I.incx,  I.cmpx,  I.call,
        I.setp,  I.tcall, I.set1,  I.bbs,   I.eor,   I.eor,   I.eor,   I.eor,   I.eor,   I.eorm,  I.and1,  I.lsr,   I.lsr,   I.pushx, I.tclr1, I.pcall,
        I.bvc,   I.tcall, I.clr1,  I.bbc,   I.eor,   I.eor,   I.eor,   I.eor,   I.eorm,  I.eorm,  I.cmpw,  I.lsr,   I.lsra,  I.movxa, I.cmpy,  I.jmp,
        I.clrc,  I.tcall, I.set1,  I.bbs,   I.cmp,   I.cmp,   I.cmp,   I.cmp,   I.cmp,   I.cmpm,  I.and1n, I.ror,   I.ror,   I.pushy, I.dbnz,  I.ret,
        I.bvs,   I.tcall, I.clr1,  I.bbc,   I.cmp,   I.cmp,   I.cmp,   I.cmp,   I.cmpm,  I.cmpm,  I.addw,  I.ror,   I.rora,  I.movax, I.cmpy,  I.reti,
        I.setc,  I.tcall, I.set1,  I.bbs,   I.adc,   I.adc,   I.adc,   I.adc,   I.adc,   I.adcm,  I.eor1,  I.dec,   I.dec,   I.movy,  I.popp,  I.movm,
        I.bcc,   I.tcall, I.clr1,  I.bbc,   I.adc,   I.adc,   I.adc,   I.adc,   I.adcm,  I.adcm,  I.subw,  I.dec,   I.deca,  I.movxp, I.div,   I.xcn,
        I.ei,    I.tcall, I.set1,  I.bbs,   I.sbc,   I.sbc,   I.sbc,   I.sbc,   I.sbc,   I.sbcm,  I.mov1,  I.inc,   I.inc,   I.cmpy,  I.popa,  I.movs,
        I.bcs,   I.tcall, I.clr1,  I.bbc,   I.sbc,   I.sbc,   I.sbc,   I.sbc,   I.sbcm,  I.sbcm,  I.movw,  I.inc,   I.inca,  I.movpx, I.das,   I.mov,
        I.di,    I.tcall, I.set1,  I.bbs,   I.movs,  I.movs,  I.movs,  I.movs,  I.cmpx,  I.movsx, I.mov1s, I.movsy, I.movsy, I.movx,  I.popx,  I.mul,
        I.bne,   I.tcall, I.clr1,  I.bbc,   I.movs,  I.movs,  I.movs,  I.movs,  I.movsx, I.movsx, I.movws, I.movsy, I.decy,  I.movay, I.cbne,  I.daa,
        I.clrv,  I.tcall, I.set1,  I.bbs,   I.mov,   I.mov,   I.mov,   I.mov,   I.mov,   I.movx,  I.not1,  I.movy,  I.movy,  I.notc,  I.popy,  I.sleep,
        I.beq,   I.tcall, I.clr1,  I.bbc,   I.mov,   I.mov,   I.mov,   I.mov,   I.movx,  I.movx,  I.movm,  I.movy,  I.incy,  I.movya, I.dbnzy, I.stop
    ];
}

window.SnesSpcDecoder = SnesSpcDecoder;
