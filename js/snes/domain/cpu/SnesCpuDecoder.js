/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuDecoder (Opcode Execution Router - Context Fixed)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Contains the complete 256-opcode jump table for the Ricoh 5A22 CPU.
 * Routes every hardware instruction to its corresponding static handler 
 * on the passed CPU instance.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles instruction set decoding.
 */

class SnesCpuDecoder {
    /**
     * Decodes and executes the exact requested opcode on the passed CPU instance.
     * Compiled as a high-speed JIT jump-table.
     */
    static execute(cpu, instr, adr, adrh) {
        switch (instr) {
            case 0x00: SnesCpuFlow.brk(cpu); break;
            case 0x01: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x02: SnesCpuFlow.cop(cpu); break;
            case 0x03: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x04: SnesCpuInstructions.tsb(cpu, adr, adrh); break;
            case 0x05: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x06: SnesCpuInstructions.asl(cpu, adr); break;
            case 0x07: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x08: SnesCpuOperations.php(cpu); break;
            case 0x09: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x0a: SnesCpuInstructions.asla(cpu); break;
            case 0x0b: SnesCpuOperations.phd(cpu); break;
            case 0x0c: SnesCpuInstructions.tsb(cpu, adr, adrh); break;
            case 0x0d: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x0e: SnesCpuInstructions.asl(cpu, adr); break;
            case 0x0f: SnesCpuInstructions.ora(cpu, adr, adrh); break;

            case 0x10: SnesCpuFlow.bpl(cpu, adr); break;
            case 0x11: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x12: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x13: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x14: SnesCpuInstructions.trb(cpu, adr, adrh); break;
            case 0x15: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x16: SnesCpuInstructions.asl(cpu, adr); break;
            case 0x17: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x18: SnesCpuOperations.clc(cpu); break;
            case 0x19: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x1a: SnesCpuInstructions.inca(cpu); break;
            case 0x1b: cpu.tcs(); break; // Refers to cpu instance method
            case 0x1c: SnesCpuInstructions.trb(cpu, adr, adrh); break;
            case 0x1d: SnesCpuInstructions.ora(cpu, adr, adrh); break;
            case 0x1e: SnesCpuInstructions.asl(cpu, adr); break;
            case 0x1f: SnesCpuInstructions.ora(cpu, adr, adrh); break;

            case 0x20: SnesCpuFlow.jsr(cpu, adr); break;
            case 0x21: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x22: SnesCpuFlow.jsl(cpu, adr); break;
            case 0x23: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x24: SnesCpuInstructions.bit(cpu, adr, adrh); break;
            case 0x25: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x26: SnesCpuInstructions.rol(cpu, adr); break;
            case 0x27: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x28: SnesCpuOperations.plp(cpu); break;
            case 0x29: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x2a: SnesCpuInstructions.rola(cpu); break;
            case 0x2b: SnesCpuOperations.pld(cpu); break;
            case 0x2c: SnesCpuInstructions.bit(cpu, adr, adrh); break;
            case 0x2d: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x2e: SnesCpuInstructions.rol(cpu, adr); break;
            case 0x2f: SnesCpuInstructions.and(cpu, adr, adrh); break;

            case 0x30: SnesCpuFlow.bmi(cpu, adr); break;
            case 0x31: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x32: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x33: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x34: SnesCpuInstructions.bit(cpu, adr, adrh); break;
            case 0x35: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x36: SnesCpuInstructions.rol(cpu, adr); break;
            case 0x37: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x38: SnesCpuOperations.sec(cpu); break;
            case 0x39: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x3a: SnesCpuInstructions.deca(cpu); break;
            case 0x3b: cpu.tsc(); break;
            case 0x3c: SnesCpuInstructions.bit(cpu, adr, adrh); break;
            case 0x3d: SnesCpuInstructions.and(cpu, adr, adrh); break;
            case 0x3e: SnesCpuInstructions.rol(cpu, adr); break;
            case 0x3f: SnesCpuInstructions.and(cpu, adr, adrh); break;

            case 0x40: SnesCpuFlow.rti(cpu); break;
            case 0x41: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x42: break; // WDM (2-byte NOP)
            case 0x43: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x44: SnesCpuInstructions.mvp(cpu, adr, adrh); break;
            case 0x45: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x46: SnesCpuInstructions.lsr(cpu, adr); break;
            case 0x47: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x48: SnesCpuOperations.pha(cpu); break;
            case 0x49: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x4a: SnesCpuInstructions.lsra(cpu); break;
            case 0x4b: SnesCpuOperations.phk(cpu); break;
            case 0x4c: SnesCpuFlow.jmp(cpu, adr); break;
            case 0x4d: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x4e: SnesCpuInstructions.lsr(cpu, adr); break;
            case 0x4f: SnesCpuInstructions.eor(cpu, adr, adrh); break;

            case 0x50: SnesCpuFlow.bvc(cpu, adr); break;
            case 0x51: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x52: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x53: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x54: SnesCpuInstructions.mvn(cpu, adr, adrh); break;
            case 0x55: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x56: SnesCpuInstructions.lsr(cpu, adr); break;
            case 0x57: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x58: SnesCpuOperations.cli(cpu); break;
            case 0x59: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x5a: SnesCpuOperations.phy(cpu); break;
            case 0x5b: cpu.tcd(); break;
            case 0x5c: SnesCpuFlow.jml(cpu, adr); break;
            case 0x5d: SnesCpuInstructions.eor(cpu, adr, adrh); break;
            case 0x5e: SnesCpuInstructions.lsr(cpu, adr); break;
            case 0x5f: SnesCpuInstructions.eor(cpu, adr, adrh); break;

            case 0x60: SnesCpuFlow.rts(cpu); break;
            case 0x61: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x62: cpu.pushWord((cpu.br[CPU_REG_PC] + adr) & 0xffff); break;
            case 0x63: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x64: SnesCpuInstructions.stz(cpu, adr, adrh); break;
            case 0x65: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x66: SnesCpuInstructions.ror(cpu, adr); break;
            case 0x67: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x68: SnesCpuOperations.pla(cpu); break;
            case 0x69: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x6a: SnesCpuInstructions.rora(cpu); break;
            case 0x6b: SnesCpuFlow.rtl(cpu); break;
            case 0x6c: SnesCpuFlow.jmp(cpu, adr); break;
            case 0x6d: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x6e: SnesCpuInstructions.ror(cpu, adr); break;
            case 0x6f: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            case 0x70: SnesCpuFlow.bvs(cpu, adr); break;
            case 0x71: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x72: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x73: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x74: SnesCpuInstructions.stz(cpu, adr, adrh); break;
            case 0x75: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x76: SnesCpuInstructions.ror(cpu, adr); break;
            case 0x77: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x78: SnesCpuOperations.sei(cpu); break;
            case 0x79: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x7a: SnesCpuOperations.ply(cpu); break;
            case 0x7b: cpu.tdc(); break;
            case 0x7c: SnesCpuFlow.jmp(cpu, adr); break;
            case 0x7d: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0x7e: SnesCpuInstructions.ror(cpu, adr); break;
            case 0x7f: SnesCpuAlu.adc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            case 0x80: SnesCpuFlow.bra(cpu, adr); break;
            case 0x81: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x82: SnesCpuFlow.bra(cpu, adr); break;
            case 0x83: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x84: SnesCpuInstructions.sty(cpu, adr, adrh); break;
            case 0x85: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x86: SnesCpuInstructions.stx(cpu, adr, adrh); break;
            case 0x87: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x88: SnesCpuInstructions.dey(cpu); break;
            case 0x89: SnesCpuInstructions.biti(cpu, adr, adrh); break;
            case 0x8a: SnesCpuInstructions.txa(cpu); break;
            case 0x8b: SnesCpuOperations.phb(cpu); break;
            case 0x8c: SnesCpuInstructions.sty(cpu, adr, adrh); break;
            case 0x8d: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x8e: SnesCpuInstructions.stx(cpu, adr, adrh); break;
            case 0x8f: SnesCpuInstructions.sta(cpu, adr, adrh); break;

            case 0x90: SnesCpuFlow.bcc(cpu, adr); break;
            case 0x91: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x92: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x93: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x94: SnesCpuInstructions.sty(cpu, adr, adrh); break;
            case 0x95: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x96: SnesCpuInstructions.stx(cpu, adr, adrh); break;
            case 0x97: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x98: SnesCpuInstructions.tya(cpu); break;
            case 0x99: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x9a: SnesCpuInstructions.txs(cpu); break;
            case 0x9b: SnesCpuInstructions.txy(cpu); break;
            case 0x9c: SnesCpuInstructions.stz(cpu, adr, adrh); break;
            case 0x9d: SnesCpuInstructions.sta(cpu, adr, adrh); break;
            case 0x9e: SnesCpuInstructions.stz(cpu, adr, adrh); break;
            case 0x9f: SnesCpuInstructions.sta(cpu, adr, adrh); break;

            case 0xa0: SnesCpuInstructions.ldy(cpu, adr, adrh); break;
            case 0xa1: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xa2: SnesCpuInstructions.ldx(cpu, adr, adrh); break;
            case 0xa3: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xa4: SnesCpuInstructions.ldy(cpu, adr, adrh); break;
            case 0xa5: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xa6: SnesCpuInstructions.ldx(cpu, adr, adrh); break;
            case 0xa7: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xa8: SnesCpuInstructions.tay(cpu); break;
            case 0xa9: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xaa: SnesCpuInstructions.tax(cpu); break;
            case 0xab: SnesCpuOperations.plb(cpu); break;
            case 0xac: SnesCpuInstructions.ldy(cpu, adr, adrh); break;
            case 0xad: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xae: SnesCpuInstructions.ldx(cpu, adr, adrh); break;
            case 0xaf: SnesCpuInstructions.lda(cpu, adr, adrh); break;

            case 0xb0: SnesCpuFlow.bcs(cpu, adr); break;
            case 0xb1: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xb2: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xb3: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xb4: SnesCpuInstructions.ldy(cpu, adr, adrh); break;
            case 0xb5: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xb6: SnesCpuInstructions.ldx(cpu, adr, adrh); break;
            case 0xb7: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xb8: SnesCpuOperations.clv(cpu); break;
            case 0xb9: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xba: SnesCpuInstructions.tsx(cpu); break;
            case 0xbb: SnesCpuInstructions.tyx(cpu); break;
            case 0xbc: SnesCpuInstructions.ldy(cpu, adr, adrh); break;
            case 0xbd: SnesCpuInstructions.lda(cpu, adr, adrh); break;
            case 0xbe: SnesCpuInstructions.ldx(cpu, adr, adrh); break;
            case 0xbf: SnesCpuInstructions.lda(cpu, adr, adrh); break;

            case 0xc0: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_Y], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xc1: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xc2: SnesCpuOperations.rep(cpu, adr); break;
            case 0xc3: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xc4: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_Y], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xc5: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xc6: SnesCpuInstructions.dec(cpu, adr, adrh); break;
            case 0xc7: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xc8: SnesCpuInstructions.iny(cpu); break;
            case 0xc9: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xca: SnesCpuInstructions.dex(cpu); break;
            case 0xcb: cpu.waiting = true; break; // WAI (Wait for Interrupt)
            case 0xcc: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_Y], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xcd: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xce: SnesCpuInstructions.dec(cpu, adr, adrh); break;
            case 0xcf: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            case 0xd0: SnesCpuFlow.bne(cpu, adr); break;
            case 0xd1: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xd2: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xd3: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xd4: cpu.pushWord(cpu.readWord(adr, adrh)); break; // PEI
            case 0xd5: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xd6: SnesCpuInstructions.dec(cpu, adr, adrh); break;
            case 0xd7: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xd8: SnesCpuOperations.cld(cpu); break;
            case 0xd9: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xda: SnesCpuOperations.phx(cpu); break;
            case 0xdb: cpu.stopped = true; break; // STP (Stop Processor)
            case 0xdc: SnesCpuFlow.jml(cpu, adr); break;
            case 0xdd: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xde: SnesCpuInstructions.dec(cpu, adr, adrh); break;
            case 0xdf: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_A], cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            case 0xe0: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_X], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xe1: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xe2: SnesCpuOperations.sep(cpu, adr); break;
            case 0xe3: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xe4: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_X], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xe5: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xe6: SnesCpuInstructions.inc(cpu, adr, adrh); break;
            case 0xe7: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xe8: SnesCpuInstructions.inx(cpu); break;
            case 0xe9: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xea: break; // NOP
            case 0xeb: SnesCpuInstructions.xba(cpu); break;
            case 0xec: SnesCpuAlu.compare(cpu, cpu.br[CPU_REG_X], cpu.x ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.x); break;
            case 0xed: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xee: SnesCpuInstructions.inc(cpu, adr, adrh); break;
            case 0xef: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            case 0xf0: SnesCpuFlow.beq(cpu, adr); break;
            case 0xf1: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xf2: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xf3: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xf4: cpu.pushWord(cpu.readWord(adr, adrh)); break; // PEA
            case 0xf5: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xf6: SnesCpuInstructions.inc(cpu, adr, adrh); break;
            case 0xf7: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xf8: SnesCpuOperations.sed(cpu); break;
            case 0xf9: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xfa: SnesCpuOperations.plx(cpu); break;
            case 0xfb: SnesCpuInstructions.xce(cpu); break;
            case 0xfc: SnesCpuFlow.jsr(cpu, adr); break;
            case 0xfd: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;
            case 0xfe: SnesCpuInstructions.inc(cpu, adr, adrh); break;
            case 0xff: SnesCpuAlu.sbc(cpu, cpu.m ? cpu.mem.read(adr) : cpu.readWord(adr, adrh), cpu.m); break;

            // Direct System Interrupt vectors ($100-$102)
            case 0x100: SnesCpuFlow.abo(cpu); break;
            case 0x101: SnesCpuFlow.nmi(cpu); break;
            case 0x102: SnesCpuFlow.irq(cpu); break;

            default:
                cpu.uni(adr, adrh, instr);
                break;
        }
    }
}

// Global transitional alias
window.SnesCpuDecoder = SnesCpuDecoder;