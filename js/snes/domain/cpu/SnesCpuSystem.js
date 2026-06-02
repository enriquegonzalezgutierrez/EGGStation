/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU System & Flag Instructions
 * 
 * Implements system control instructions (NOP, WDM, WAI, STP), flag manipulations 
 * (CLC, SEC, CLI, SEI, CLV, CLD, SED), the emulation/native mode exchange (XCE), 
 * and status register bit reset/set commands (REP, SEP).
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] CPU Cycle Double-Counting: Removed manual increments of cpu.cpuMemOps 
 *   inside REP and SEP handlers. Bus cycles are already tracked automatically inside 
 *   SnesBus.js's read/write passways. Manual modifications corrupted the orchestrated 
 *   timeline and caused freezes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on system flags,
 *   XCE carry exchanges, and REP/SEP status register updates.
 */

{
    class SnesCpuSystem {
        /**
         * Registers System and Flag instructions onto the CPU's opcode table.
         * @param {Cpu} cpu - Main CPU orchestrator.
         * @param {Array<Function>} table - Opcode dispatch table.
         */
        static register(cpu, table) {
            const regs = cpu.registers;
            const bus = cpu.bus;

            // --- Power States and Idle NOPs ---
            table[0xEA] = () => {}; // NOP: No Operation
            table[0x42] = () => {}; // WDM: Reserved 2-byte NOP (ignored by legacy)
            table[0xCB] = () => { cpu.waiting = true; }; // WAI: Wait for Interrupt (powers down CPU)
            table[0xDB] = () => { cpu.stopped = true; }; // STP: Stop Processor (locks CPU clocks)

            // --- Flag Modification Instructions ---
            table[0x18] = () => { regs.cFlag = false; }; // CLC: Clear Carry
            table[0x38] = () => { regs.cFlag = true;  }; // SEC: Set Carry
            table[0x58] = () => { regs.i = false;     }; // CLI: Clear Interrupts
            table[0x78] = () => { regs.i = true;      }; // SEI: Set Interrupts
            table[0xB8] = () => { regs.v = false;     }; // CLV: Clear Overflow
            table[0xD8] = () => { regs.d = false;     }; // CLD: Clear Decimal Mode
            table[0xF8] = () => { regs.d = true;      }; // SED: Set Decimal Mode

            // --- XCE (Exchange Carry and Emulation Flags) ---
            table[0xFB] = () => {
                const carry = regs.cFlag;
                regs.cFlag = regs.e;
                regs.e = carry; // Toggles between Native (e=0) and Emulation (e=1) modes
            };

            // --- REP (Reset Processor Status Bits): Clears status bits on P register ---
            table[0xC2] = (adr) => {
                const value = bus.read(adr) & 0xFF;
                regs.p = regs.p & ~value; // Clears target bitmasks
            };

            // --- SEP (Set Processor Status Bits): Sets status bits on P register ---
            table[0xE2] = (adr) => {
                const value = bus.read(adr) & 0xFF;
                regs.p = regs.p | value; // Asserts target bitmasks
            };
        }
    }

    window.SnesCpuSystem = SnesCpuSystem;
}