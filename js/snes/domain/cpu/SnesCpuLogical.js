/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Logical & Bitwise Instructions
 * 
 * Implements logical operations (AND, ORA, EOR), bit testing (BIT, including 
 * immediate variations), and single-bit mutation/reset registers (TRB, TSB).
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] CPU Cycle Double-Counting: Removed manual increments of cpu.cpuMemOps. 
 *   Bus cycles are already tracked automatically inside SnesBus.js's read/write 
 *   passways. Manual modifications corrupted the orchestrated timeline and caused freezes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines logical and bitwise operations,
 *   bit tests, and bit-reset/set instructions to a dedicated module.
 */

{
    class SnesCpuLogical {
        /**
         * Registers Logical instructions onto the CPU's opcode table.
         * @param {Cpu} cpu - Main CPU orchestrator.
         * @param {Array<Function>} table - Opcode dispatch table.
         */
        static register(cpu, table) {
            const regs = cpu.registers;
            const bus = cpu.bus;

            // ========================================================================
            // LOCAL HELPERS
            // ========================================================================

            /**
             * Helper to read a 16-bit word from memory.
             */
            function readWord(adr, adrh) {
                const low = bus.read(adr) & 0xFF;
                const high = bus.read(adrh) & 0xFF;
                return (high << 8) | low;
            }

            /**
             * Helper to write a 16-bit word to memory.
             */
            function writeWord(adr, adrh, val) {
                bus.write(adr, val & 0xFF);
                bus.write(adrh, (val >> 8) & 0xFF);
            }

            /**
             * Sets Zero (Z) and Negative (N) flags based on register size.
             */
            function setZandN(value, is8Bit) {
                if (is8Bit) {
                    regs.z = (value & 0xFF) === 0;
                    regs.n = (value & 0x80) > 0;
                } else {
                    regs.z = (value & 0xFFFF) === 0;
                    regs.n = (value & 0x8000) > 0;
                }
            }

            // ========================================================================
            // HOISTED INSTRUCTION HANDLERS
            // ========================================================================

            /**
             * AND (Logical AND with Accumulator): Performs bitwise AND of accumulator and memory.
             */
            function and(adr, adrh) {
                if (regs.m) {
                    const value = bus.read(adr) & 0xFF;
                    regs.a = (regs.a & 0xFF00) | ((regs.a & value) & 0xFF);
                    setZandN(regs.a, true);
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++; // 16-bit mode penalty
                    regs.c &= value;
                    setZandN(regs.c, false);
                }
            }

            /**
             * EOR (Exclusive OR with Accumulator): Performs bitwise XOR of accumulator and memory.
             */
            function eor(adr, adrh) {
                if (regs.m) {
                    const value = bus.read(adr) & 0xFF;
                    regs.a = (regs.a & 0xFF00) | ((regs.a ^ value) & 0xFF);
                    setZandN(regs.a, true);
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++;
                    regs.c ^= value;
                    setZandN(regs.c, false);
                }
            }

            /**
             * ORA (Logical OR with Accumulator): Performs bitwise OR of accumulator and memory.
             */
            function ora(adr, adrh) {
                if (regs.m) {
                    const value = bus.read(adr) & 0xFF;
                    regs.a = (regs.a & 0xFF00) | ((regs.a | value) & 0xFF);
                    setZandN(regs.a, true);
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++;
                    regs.c |= value;
                    setZandN(regs.c, false);
                }
            }

            /**
             * BIT (Bit Test): Performs bitwise AND to set Z flag, copying bits 7 and 6 of memory to N and V.
             */
            function bit(adr, adrh) {
                if (regs.m) {
                    const value = bus.read(adr) & 0xFF;
                    const result = (regs.a & 0xFF) & value;
                    regs.z = result === 0;
                    regs.n = (value & 0x80) > 0;
                    regs.v = (value & 0x40) > 0;
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++;
                    const result = regs.c & value;
                    regs.z = result === 0;
                    regs.n = (value & 0x8000) > 0;
                    regs.v = (value & 0x4000) > 0;
                }
            }

            /**
             * BIT (Bit Test - Immediate mode): Sets Z flag without modifying N and V flags.
             */
            function biti(adr, adrh) {
                if (regs.m) {
                    const value = bus.read(adr) & 0xFF;
                    const result = (regs.a & 0xFF) & value;
                    regs.z = result === 0;
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++;
                    const result = regs.c & value;
                    regs.z = result === 0;
                }
            }

            /**
             * TRB (Test and Reset Bit): Tests bitwise AND to set Z, writing the AND of memory and inverted A back.
             */
            function trb(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    const result = (regs.a & 0xFF) & value;
                    value = (value & ~(regs.a & 0xFF)) & 0xFF;
                    regs.z = result === 0;
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2; // RMW 16-bit penalty
                    const result = regs.c & value;
                    value = (value & ~regs.c) & 0xFFFF;
                    regs.z = result === 0;
                    writeWord(adr, adrh, value);
                }
            }

            /**
             * TSB (Test and Set Bit): Tests bitwise AND to set Z, writing the OR of memory and A back.
             */
            function tsb(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    const result = (regs.a & 0xFF) & value;
                    value = (value | (regs.a & 0xFF)) & 0xFF;
                    regs.z = result === 0;
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    const result = regs.c & value;
                    value = (value | regs.c) & 0xFFFF;
                    regs.z = result === 0;
                    writeWord(adr, adrh, value);
                }
            }

            // ========================================================================
            // BIND LOGICAL OPCODES
            // ========================================================================

            // AND Family
            table[0x21] = and; table[0x23] = and; table[0x25] = and; table[0x27] = and;
            table[0x29] = and; table[0x2D] = and; table[0x2F] = and; table[0x31] = and;
            table[0x32] = and; table[0x33] = and; table[0x35] = and; table[0x39] = and;
            table[0x3D] = and; table[0x3F] = and;

            // ORA Family
            table[0x01] = ora; table[0x03] = ora; table[0x05] = ora; table[0x07] = ora;
            table[0x09] = ora; table[0x0D] = ora; table[0x0F] = ora; table[0x11] = ora;
            table[0x12] = ora; table[0x13] = ora; table[0x15] = ora; table[0x19] = ora;
            table[0x1D] = ora; table[0x1F] = ora;

            // EOR Family
            table[0x41] = eor; table[0x43] = eor; table[0x45] = eor; table[0x47] = eor;
            table[0x49] = eor; table[0x4D] = eor; table[0x4F] = eor; table[0x51] = eor;
            table[0x52] = eor; table[0x53] = eor; table[0x55] = eor; table[0x59] = eor;
            table[0x5D] = eor; table[0x5F] = eor;

            // Bitwise Tests and Mutations
            table[0x24] = bit; table[0x2C] = bit; table[0x3C] = bit; table[0x89] = biti;
            table[0x14] = trb; table[0x1C] = trb;
            table[0x04] = tsb; table[0x0C] = tsb;
        }
    }

    window.SnesCpuLogical = SnesCpuLogical;
}