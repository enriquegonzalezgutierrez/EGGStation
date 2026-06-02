/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Shift & Rotate Instructions
 * 
 * Implements bitwise shift-left (ASL), shift-right (LSR), rotate-left (ROL), 
 * and rotate-right (ROR) operations, supporting Accumulator direct modes and 
 * memory Read-Modify-Write (RMW) modes.
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] CPU Cycle Double-Counting: Removed manual increments of cpu.cpuMemOps. 
 *   Bus cycles are already tracked automatically inside SnesBus.js's read/write 
 *   passways. Manual modifications corrupted the orchestrated timeline and caused freezes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines bit-shifting, bit-rotates,
 *   and carry state transfers to a dedicated module.
 */

{
    class SnesCpuShiftRotate {
        /**
         * Registers Shift and Rotate instructions onto the CPU's opcode table.
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
             * ASL (Arithmetic Shift Left): Shifts bits left, moving MSB into carry flag and filling LSB with 0.
             */
            function asl(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    regs.cFlag = (value & 0x80) > 0;
                    value = (value << 1) & 0xFF;
                    setZandN(value, true);
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2; // RMW 16-bit timing penalty
                    regs.cFlag = (value & 0x8000) > 0;
                    value = (value << 1) & 0xFFFF;
                    setZandN(value, false);
                    writeWord(adr, adrh, value);
                }
            }

            /**
             * ASLA (Arithmetic Shift Left Accumulator): ASL on register A/C.
             */
            function asla() {
                if (regs.m) {
                    let value = regs.a & 0xFF;
                    regs.cFlag = (value & 0x80) > 0;
                    value = (value << 1) & 0xFF;
                    setZandN(value, true);
                    regs.a = (regs.a & 0xFF00) | value;
                } else {
                    regs.cFlag = (regs.c & 0x8000) > 0;
                    regs.c = (regs.c << 1) & 0xFFFF;
                    setZandN(regs.c, false);
                }
            }

            /**
             * LSR (Logical Shift Right): Shifts bits right, moving LSB into carry flag and filling MSB with 0.
             */
            function lsr(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    regs.cFlag = (value & 0x01) > 0;
                    value >>= 1;
                    setZandN(value, true);
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    regs.cFlag = (value & 0x0001) > 0;
                    value >>= 1;
                    setZandN(value, false);
                    writeWord(adr, adrh, value);
                }
            }

            /**
             * LSRA (Logical Shift Right Accumulator): LSR on register A/C.
             */
            function lsra() {
                if (regs.m) {
                    let value = regs.a & 0xFF;
                    regs.cFlag = (value & 0x01) > 0;
                    value >>= 1;
                    setZandN(value, true);
                    regs.a = (regs.a & 0xFF00) | value;
                } else {
                    regs.cFlag = (regs.c & 0x0001) > 0;
                    regs.c >>= 1;
                    setZandN(regs.c, false);
                }
            }

            /**
             * ROL (Rotate Left): Shifts bits left, moving carry into LSB and MSB into carry flag.
             */
            function rol(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    const carry = value & 0x80;
                    value = ((value << 1) | (regs.cFlag ? 1 : 0)) & 0xFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, true);
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    const carry = value & 0x8000;
                    value = ((value << 1) | (regs.cFlag ? 1 : 0)) & 0xFFFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, false);
                    writeWord(adr, adrh, value);
                }
            }

            /**
             * ROLA (Rotate Left Accumulator): ROL on register A/C.
             */
            function rola() {
                if (regs.m) {
                    let value = regs.a & 0xFF;
                    const carry = value & 0x80;
                    value = ((value << 1) | (regs.cFlag ? 1 : 0)) & 0xFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, true);
                    regs.a = (regs.a & 0xFF00) | value;
                } else {
                    const carry = regs.c & 0x8000;
                    const value = ((regs.c << 1) | (regs.cFlag ? 1 : 0)) & 0xFFFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, false);
                    regs.c = value;
                }
            }

            /**
             * ROR (Rotate Right): Shifts bits right, moving carry into MSB and LSB into carry flag.
             */
            function ror(adr, adrh) {
                if (regs.m) {
                    let value = bus.read(adr) & 0xFF;
                    const carry = value & 0x01;
                    value = ((value >> 1) | (regs.cFlag ? 0x80 : 0)) & 0xFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, true);
                    bus.write(adr, value);
                } else {
                    let value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    const carry = value & 0x0001;
                    value = ((value >> 1) | (regs.cFlag ? 0x8000 : 0)) & 0xFFFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, false);
                    writeWord(adr, adrh, value);
                }
            }

            /**
             * RORA (Rotate Right Accumulator): ROR on register A/C.
             */
            function rora() {
                if (regs.m) {
                    let value = regs.a & 0xFF;
                    const carry = value & 0x01;
                    value = ((value >> 1) | (regs.cFlag ? 0x80 : 0)) & 0xFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, true);
                    regs.a = (regs.a & 0xFF00) | value;
                } else {
                    const carry = regs.c & 0x0001;
                    const value = ((regs.c >> 1) | (regs.cFlag ? 0x8000 : 0)) & 0xFFFF;
                    regs.cFlag = carry > 0;
                    setZandN(value, false);
                    regs.c = value;
                }
            }

            // ========================================================================
            // BIND SHIFT AND ROTATE OPCODES
            // ========================================================================

            // ASL Family
            table[0x0A] = asla; table[0x06] = asl; table[0x0E] = asl; table[0x16] = asl;
            table[0x1E] = asl;

            // LSR Family
            table[0x4A] = lsra; table[0x46] = lsr; table[0x4E] = lsr; table[0x56] = lsr;
            table[0x5E] = lsr;

            // ROL Family
            table[0x2A] = rola; table[0x26] = rol; table[0x2E] = rol; table[0x36] = rol;
            table[0x3E] = rol;

            // ROR Family
            table[0x6A] = rora; table[0x66] = ror; table[0x6E] = ror; table[0x76] = ror;
            table[0x7E] = ror;
        }
    }

    window.SnesCpuShiftRotate = SnesCpuShiftRotate;
}