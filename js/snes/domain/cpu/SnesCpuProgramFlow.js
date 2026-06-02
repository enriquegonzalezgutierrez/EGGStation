/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Program Flow Instructions
 * 
 * Implements jumps, subroutine linkages, conditional branching, system exceptions,
 * block moves, and physical interrupt vector state pushes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines program branching, 
 *   subroutine returns, block copying loops, and exceptions to a dedicated module.
 */

{
    class SnesCpuProgramFlow {
        /**
         * Registers Program Flow instructions onto the CPU's opcode table.
         * @param {Cpu} cpu - Main CPU orchestrator.
         * @param {Array<Function>} table - Opcode dispatch table.
         */
        static register(cpu, table) {
            const regs = cpu.registers;
            const bus = cpu.bus;

            // ========================================================================
            // LOCAL HELPERS
            // ========================================================================

            function pushVectorState(vectorAddress) {
                cpu.pushByte(regs.pb);
                cpu.pushWord(regs.pc);
                cpu.pushByte(regs.p);
                cpu.cyclesLeft++; // Native state stack alignment cycle
                regs.i = true;
                regs.d = false;
                regs.pb = 0;
                const low = bus.read(vectorAddress);
                const high = bus.read(vectorAddress + 1);
                regs.pc = (high << 8) | low;
            }

            function executeBranch(cond, rel) {
                if (cond) {
                    cpu.cyclesLeft++; // Taken branch penalty
                    regs.pc = (regs.pc + rel) & 0xFFFF;
                }
            }

            // ========================================================================
            // HOISTED INSTRUCTION HANDLERS
            // ========================================================================

            function bcc(rel) { executeBranch(!regs.cFlag, rel); }
            function bcs(rel) { executeBranch(regs.cFlag, rel);  }
            function beq(rel) { executeBranch(regs.z, rel);      }
            function bmi(rel) { executeBranch(regs.n, rel);      }
            function bne(rel) { executeBranch(!regs.z, rel);     }
            function bpl(rel) { executeBranch(!regs.n, rel);     }
            function bra(rel) { regs.pc = (regs.pc + rel) & 0xFFFF; }
            function bvc(rel) { executeBranch(!regs.v, rel);     }
            function bvs(rel) { executeBranch(regs.v, rel);      }
            function brl(rel) { regs.pc = (regs.pc + rel) & 0xFFFF; }

            function jmp(adr) { regs.pc = adr & 0xFFFF; }
            function jml(adr) { regs.pb = (adr >> 16) & 0xFF; regs.pc = adr & 0xFFFF; }
            function jsl(adr) { cpu.pushByte(regs.pb); cpu.pushWord((regs.pc - 1) & 0xFFFF); regs.pb = (adr >> 16) & 0xFF; regs.pc = adr & 0xFFFF; }
            function jsr(adr) { cpu.pushWord((regs.pc - 1) & 0xFFFF); regs.pc = adr & 0xFFFF; }
            function rtl() { regs.pc = cpu.pullWord() + 1; regs.pb = cpu.pullByte(); }
            function rts() { regs.pc = (cpu.pullWord() + 1) & 0xFFFF; }

            function brk() {
                const pushPc = (regs.pc + 1) & 0xFFFF;
                cpu.pushByte(regs.pb);
                cpu.pushWord(pushPc);
                cpu.pushByte(regs.p);
                cpu.cyclesLeft++;
                regs.i = true;
                regs.d = false;
                regs.pb = 0;
                regs.pc = bus.read(0xFFFE) | (bus.read(0xFFFF) << 8);
            }

            function cop() {
                const pushPc = (regs.pc + 1) & 0xFFFF;
                cpu.pushByte(regs.pb);
                cpu.pushWord(pushPc);
                cpu.pushByte(regs.p);
                cpu.cyclesLeft++;
                regs.i = true;
                regs.d = false;
                regs.pb = 0;
                regs.pc = bus.read(0xFFF4) | (bus.read(0xFFF5) << 8);
            }

            function rti() {
                regs.p = cpu.pullByte();
                regs.pc = cpu.pullWord();
                regs.pb = cpu.pullByte();
            }

            function mvn(dest, src) {
                regs.db = dest;
                const val = bus.read((src << 16) | regs.x);
                bus.write((dest << 16) | regs.y, val);
                regs.c--;
                regs.x++;
                regs.y++;
                if (regs.c !== 0xFFFF) {
                    regs.pc = (regs.pc - 3) & 0xFFFF; // Repeat
                }
                if (regs.xFlag) {
                    regs.x &= 0xFF;
                    regs.y &= 0xFF;
                }
            }

            function mvp(dest, src) {
                regs.db = dest;
                const val = bus.read((src << 16) | regs.x);
                bus.write((dest << 16) | regs.y, val);
                regs.c--;
                regs.x--;
                regs.y--;
                if (regs.c !== 0xFFFF) {
                    regs.pc = (regs.pc - 3) & 0xFFFF;
                }
                if (regs.xFlag) {
                    regs.x &= 0xFF;
                    regs.y &= 0xFF;
                }
            }

            // ========================================================================
            // BIND PROGRAM FLOW OPCODES
            // ========================================================================

            // Conditional branches
            table[0x10] = bpl; table[0x30] = bmi; table[0x50] = bvc; table[0x70] = bvs;
            table[0x90] = bcc; table[0xB0] = bcs; table[0xD0] = bne; table[0xF0] = beq;

            // Unconditional branches
            table[0x80] = bra; table[0x82] = brl;

            // Subroutine linkages and returns
            table[0x20] = jsr; table[0xFC] = jsr; table[0x22] = jsl; table[0x60] = rts;
            table[0x6B] = rtl;

            // Jumps
            table[0x4C] = jmp; table[0x6C] = jmp; table[0x5C] = jml; table[0xDC] = jml;

            // Block moves
            table[0x54] = mvp; table[0x44] = mvn;

            // System Exceptions
            table[0x00] = brk; table[0x02] = cop; table[0x40] = rti;

            // System Vectors (Indices 256, 257, 258)
            table[256] = () => { pushVectorState(0xFFE4); }; // Abort
            table[257] = () => { pushVectorState(0xFFEA); }; // NMI
            table[258] = () => { pushVectorState(0xFFEE); }; // IRQ
        }
    }

    // Safely publish class to the window namespace
    window.SnesCpuProgramFlow = SnesCpuProgramFlow;
}