/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesCpuFlow (Program Flow & Interrupts Processor)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles program execution flow modifications, including relative branches (BCC, BCS, etc.),
 * absolute jumps (JMP, JSL, JSR, RTS), and physical hardware interrupts (NMI, IRQ, BRK, RTI).
 * It delegates state stack operations directly to SnesCpuOperations.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles program branching, jumps, subroutines, and interrupts logic.
 */

class SnesCpuFlow {
    // ========================================================================
    // RELATIVE CONDITIONAL BRANCHES (BCC, BCS, BEQ, BMI, BNE, BPL, BVS, BVC)
    // ========================================================================

    static bcc(cpu, adr) { cpu.doBranch(!cpu.c, adr); }
    static bcs(cpu, adr) { cpu.doBranch(cpu.c, adr); }
    static beq(cpu, adr) { cpu.doBranch(cpu.z, adr); }
    static bmi(cpu, adr) { cpu.doBranch(cpu.n, adr); }
    static bne(cpu, adr) { cpu.doBranch(!cpu.z, adr); }
    static bpl(cpu, adr) { cpu.doBranch(!cpu.n, adr); }
    static bra(cpu, adr) { cpu.br[CPU_REG_PC] += adr; }
    static bvc(cpu, adr) { cpu.doBranch(!cpu.v, adr); }
    static bvs(cpu, adr) { cpu.doBranch(cpu.v, adr); }
    static brl(cpu, adr) { cpu.br[CPU_REG_PC] += adr; }

    // ========================================================================
    // ABSOLUTE JUMPS & SUBROUTINES (JMP, JML, JSL, JSR, RTS, RTL)
    // ========================================================================

    static jmp(cpu, adr) { 
        cpu.br[CPU_REG_PC] = adr & 0xffff; 
    }

    static jml(cpu, adr) { 
        cpu.r[CPU_REG_K] = (adr & 0xff0000) >> 16; 
        cpu.br[CPU_REG_PC] = adr & 0xffff; 
    }

    static jsl(cpu, adr) {
        const pushPc = (cpu.br[CPU_REG_PC] - 1) & 0xffff;
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, pushPc);
        cpu.r[CPU_REG_K] = (adr & 0xff0000) >> 16;
        cpu.br[CPU_REG_PC] = adr & 0xffff;
    }

    static jsr(cpu, adr) {
        const pushPc = (cpu.br[CPU_REG_PC] - 1) & 0xffff;
        SnesCpuOperations.pushWord(cpu, pushPc);
        cpu.br[CPU_REG_PC] = adr & 0xffff;
    }

    static rtl(cpu) {
        const pullPc = SnesCpuOperations.pullWord(cpu);
        cpu.r[CPU_REG_K] = SnesCpuOperations.pullByte(cpu);
        cpu.br[CPU_REG_PC] = pullPc + 1;
    }

    static rts(cpu) {
        const pullPc = SnesCpuOperations.pullWord(cpu);
        cpu.br[CPU_REG_PC] = pullPc + 1;
    }

    // ========================================================================
    // HARDWARE INTERRUPTS PROCESSORS (IRQ, NMI, BRK, COP, ABORT)
    // ========================================================================

    static brk(cpu) {
        const pushPc = (cpu.br[CPU_REG_PC] + 1) & 0xffff;
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, pushPc);
        SnesCpuOperations.pushByte(cpu, cpu.getP());
        cpu.cyclesLeft++; // Adds 1 extra cycle on native 65816 mode
        cpu.i = true;
        cpu.d = false;
        cpu.r[CPU_REG_K] = 0;
        cpu.br[CPU_REG_PC] = cpu.mem.read(0xffe6) | (cpu.mem.read(0xffe7) << 8);
    }

    static cop(cpu) {
        const pushPc = cpu.br[CPU_REG_PC] & 0xffff;
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, pushPc);
        SnesCpuOperations.pushByte(cpu, cpu.getP());
        cpu.cyclesLeft++;
        cpu.i = true;
        cpu.d = false;
        cpu.r[CPU_REG_K] = 0;
        cpu.br[CPU_REG_PC] = cpu.mem.read(0xffe4) | (cpu.mem.read(0xffe5) << 8);
    }

    static abo(cpu) {
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, cpu.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(cpu, cpu.getP());
        cpu.cyclesLeft++;
        cpu.i = true;
        cpu.d = false;
        cpu.r[CPU_REG_K] = 0;
        cpu.br[CPU_REG_PC] = cpu.mem.read(0xffe8) | (cpu.mem.read(0xffe9) << 8);
    }

    static nmi(cpu) {
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, cpu.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(cpu, cpu.getP());
        cpu.cyclesLeft++;
        cpu.i = true;
        cpu.d = false;
        cpu.r[CPU_REG_K] = 0;
        cpu.br[CPU_REG_PC] = cpu.mem.read(0xffea) | (cpu.mem.read(0xffeb) << 8);
    }

    static irq(cpu) {
        SnesCpuOperations.pushByte(cpu, cpu.r[CPU_REG_K]);
        SnesCpuOperations.pushWord(cpu, cpu.br[CPU_REG_PC]);
        SnesCpuOperations.pushByte(cpu, cpu.getP());
        cpu.cyclesLeft++;
        cpu.i = true;
        cpu.d = false;
        cpu.r[CPU_REG_K] = 0;
        cpu.br[CPU_REG_PC] = cpu.mem.read(0xffee) | (cpu.mem.read(0xffef) << 8);
    }

    static rti(cpu) {
        cpu.setP(SnesCpuOperations.pullByte(cpu));
        cpu.cyclesLeft++;
        const pullPc = SnesCpuOperations.pullWord(cpu);
        cpu.r[CPU_REG_K] = SnesCpuOperations.pullByte(cpu);
        cpu.br[CPU_REG_PC] = pullPc;
    }
}

// Global transitional alias
window.SnesCpuFlow = SnesCpuFlow;