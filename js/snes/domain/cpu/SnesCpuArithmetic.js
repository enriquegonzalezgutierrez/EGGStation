/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Arithmetic Instructions
 * 
 * Implements binary and decimal (BCD) additions (ADC), subtractions (SBC), 
 * register comparisons (CMP, CPX, CPY), and direct memory increments and 
 * decrements (INC, DEC, INX, INY, DEX, DEY).
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] CPU Cycle Double-Counting: Removed manual increments of cpu.cpuMemOps. 
 *   Memory operations are already tracked automatically inside SnesBus.js's read/write 
 *   passways. Manual modifications corrupted the orchestrated timeline and caused freezes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines arithmetic operations, 
 *   BCD decimal maths, and registers updates strictly to a dedicated module.
 */

{
    class SnesCpuArithmetic {
        /**
         * Registers Arithmetic instructions onto the CPU's opcode table.
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
             * @param {number} adr - Low byte address.
             * @param {number} adrh - High byte address.
             * @returns {number} 16-bit word.
             */
            function readWord(adr, adrh) {
                const low = bus.read(adr) & 0xFF;
                const high = bus.read(adrh) & 0xFF;
                return (high << 8) | low;
            }

            /**
             * Helper to write a 16-bit word to memory.
             * @param {number} adr - Low byte address.
             * @param {number} adrh - High byte address.
             * @param {number} val - 16-bit word value.
             */
            function writeWord(adr, adrh, val) {
                bus.write(adr, val & 0xFF);
                bus.write(adrh, (val >> 8) & 0xFF);
            }

            /**
             * Sets Zero (Z) and Negative (N) flags based on the value's register size.
             * @param {number} value - Operational result.
             * @param {boolean} is8Bit - True if register is configured to 8-bit mode.
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
             * ADC (Add with Carry): Adds memory and carry status to the accumulator.
             * Handles both binary and decimal (BCD) addition modes.
             */
            function adc(adr, adrh) {
                if (regs.m) {
                    // 8-bit mode
                    const value = bus.read(adr) & 0xFF;
                    let result;
                    if (regs.d) {
                        // Decimal (BCD) mode 8-bit
                        result = (regs.a & 0x0F) + (value & 0x0F) + (regs.cFlag ? 1 : 0);
                        result += result > 9 ? 6 : 0;
                        result = (regs.a & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F);
                    } else {
                        // Binary mode 8-bit
                        result = (regs.a & 0xFF) + value + (regs.cFlag ? 1 : 0);
                    }
                    regs.v = ((regs.a & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
                    result += (regs.d && result > 0x9F) ? 0x60 : 0;
                    regs.cFlag = result > 0xFF;
                    setZandN(result, true);
                    regs.a = result & 0xFF;
                } else {
                    // 16-bit mode
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft++; // Instruction length penalty
                    let result;
                    if (regs.d) {
                        // Decimal (BCD) mode 16-bit
                        result = (regs.c & 0x0F) + (value & 0x0F) + (regs.cFlag ? 1 : 0);
                        result += result > 9 ? 6 : 0;
                        result = (regs.c & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F);
                        result += result > 0x9F ? 0x60 : 0;
                        result = (regs.c & 0xF00) + (value & 0xF00) + (result > 0xFF ? 0x100 : 0) + (result & 0xFF);
                        result += result > 0x9FF ? 0x600 : 0;
                        result = (regs.c & 0xF000) + (value & 0xF000) + (result > 0xFFF ? 0x1000 : 0) + (result & 0xFFF);
                    } else {
                        // Binary mode 16-bit
                        result = regs.c + value + (regs.cFlag ? 1 : 0);
                    }
                    regs.v = ((regs.c & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
                    result += (regs.d && result > 0x9FFF) ? 0x6000 : 0;
                    regs.cFlag = result > 0xFFFF;
                    setZandN(result, false);
                    regs.c = result;
                }
            }

            /**
             * SBC (Subtract with Borrow): Subtracts memory and borrow from the accumulator.
             * Handles both binary and decimal (BCD) subtraction modes.
             */
            function sbc(adr, adrh) {
                if (regs.m) {
                    // 8-bit mode
                    const value = (bus.read(adr) & 0xFF) ^ 0xFF;
                    let result;
                    if (regs.d) {
                        // Decimal (BCD) mode 8-bit
                        result = (regs.a & 0x0F) + (value & 0x0F) + (regs.cFlag ? 1 : 0);
                        result -= result <= 0x0F ? 6 : 0;
                        result = (regs.a & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F);
                    } else {
                        // Binary mode 8-bit
                        result = (regs.a & 0xFF) + value + (regs.cFlag ? 1 : 0);
                    }
                    regs.v = ((regs.a & 0x80) === (value & 0x80) && (value & 0x80) !== (result & 0x80));
                    result -= (regs.d && result <= 0xFF) ? 0x60 : 0;
                    regs.cFlag = result > 0xFF;
                    setZandN(result, true);
                    regs.a = result & 0xFF;
                } else {
                    // 16-bit mode
                    const value = readWord(adr, adrh) ^ 0xFFFF;
                    cpu.cyclesLeft++;
                    let result;
                    if (regs.d) {
                        // Decimal (BCD) mode 16-bit
                        result = (regs.c & 0x0F) + (value & 0x0F) + (regs.cFlag ? 1 : 0);
                        result -= result <= 0x0F ? 6 : 0;
                        result = (regs.c & 0xF0) + (value & 0xF0) + (result > 0x0F ? 0x10 : 0) + (result & 0x0F);
                        result -= result <= 0xFF ? 0x60 : 0;
                        result = (regs.c & 0xF00) + (value & 0xF00) + (result > 0xFF ? 0x100 : 0) + (result & 0xFF);
                        result -= result <= 0xFFF ? 0x600 : 0;
                        result = (regs.c & 0xF000) + (value & 0xF000) + (result > 0xFFF ? 0x1000 : 0) + (result & 0xFFF);
                    } else {
                        // Binary mode 16-bit
                        result = regs.c + value + (regs.cFlag ? 1 : 0);
                    }
                    regs.v = ((regs.c & 0x8000) === (value & 0x8000) && (value & 0x8000) !== (result & 0x8000));
                    result -= (regs.d && result <= 0xFFFF) ? 0x6000 : 0;
                    regs.cFlag = result > 0xFFFF;
                    setZandN(result, false);
                    regs.c = result;
                }
            }

            /**
             * CMP (Compare Accumulator with Memory): Sets flags based on (A - Memory).
             */
            function cmp(adr, adrh) {
                if (regs.m) {
                    const value = (bus.read(adr) & 0xFF) ^ 0xFF;
                    const result = (regs.a & 0xFF) + value + 1;
                    regs.cFlag = result > 0xFF;
                    setZandN(result, true);
                } else {
                    const value = readWord(adr, adrh) ^ 0xFFFF;
                    cpu.cyclesLeft++;
                    const result = regs.c + value + 1;
                    regs.cFlag = result > 0xFFFF;
                    setZandN(result, false);
                }
            }

            /**
             * CPX (Compare Index X with Memory): Sets flags based on (X - Memory).
             */
            function cpx(adr, adrh) {
                if (regs.xFlag) {
                    const value = (bus.read(adr) & 0xFF) ^ 0xFF;
                    const result = (regs.x & 0xFF) + value + 1;
                    regs.cFlag = result > 0xFF;
                    setZandN(result, true);
                } else {
                    const value = readWord(adr, adrh) ^ 0xFFFF;
                    cpu.cyclesLeft++;
                    const result = regs.x + value + 1;
                    regs.cFlag = result > 0xFFFF;
                    setZandN(result, false);
                }
            }

            /**
             * CPY (Compare Index Y with Memory): Sets flags based on (Y - Memory).
             */
            function cpy(adr, adrh) {
                if (regs.xFlag) {
                    const value = (bus.read(adr) & 0xFF) ^ 0xFF;
                    const result = (regs.y & 0xFF) + value + 1;
                    regs.cFlag = result > 0xFF;
                    setZandN(result, true);
                } else {
                    const value = readWord(adr, adrh) ^ 0xFFFF;
                    cpu.cyclesLeft++;
                    const result = regs.y + value + 1;
                    regs.cFlag = result > 0xFFFF;
                    setZandN(regs.y, false);
                }
            }

            /**
             * DEC (Decrement Memory): Subtracts 1 from memory directly.
             */
            function dec(adr, adrh) {
                if (regs.m) {
                    const result = (bus.read(adr) - 1) & 0xFF;
                    setZandN(result, true);
                    bus.write(adr, result);
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    const result = (value - 1) & 0xFFFF;
                    setZandN(result, false);
                    writeWord(adr, adrh, result);
                }
            }

            /**
             * DEA (Decrement Accumulator): Subtracts 1 from the accumulator.
             */
            function deca() {
                if (regs.m) {
                    const result = ((regs.a & 0xFF) - 1) & 0xFF;
                    setZandN(result, true);
                    regs.a = (regs.a & 0xFF00) | result;
                } else {
                    regs.c--;
                    setZandN(regs.c, false);
                }
            }

            /**
             * DEX (Decrement Index X): Subtracts 1 from register X.
             */
            function dex() {
                if (regs.xFlag) {
                    const result = ((regs.x & 0xFF) - 1) & 0xFF;
                    setZandN(result, true);
                    regs.x = result;
                } else {
                    regs.x--;
                    setZandN(regs.x, false);
                }
            }

            /**
             * DEY (Decrement Index Y): Subtracts 1 from register Y.
             */
            function dey() {
                if (regs.xFlag) {
                    const result = ((regs.y & 0xFF) - 1) & 0xFF;
                    setZandN(result, true);
                    regs.y = result;
                } else {
                    regs.y--;
                    setZandN(regs.y, false);
                }
            }

            /**
             * INC (Increment Memory): Adds 1 to memory directly.
             */
            function inc(adr, adrh) {
                if (regs.m) {
                    const result = (bus.read(adr) + 1) & 0xFF;
                    setZandN(result, true);
                    bus.write(adr, result);
                } else {
                    const value = readWord(adr, adrh);
                    cpu.cyclesLeft += 2;
                    const result = (value + 1) & 0xFFFF;
                    setZandN(result, false);
                    writeWord(adr, adrh, result);
                }
            }

            /**
             * INA (Increment Accumulator): Adds 1 to the accumulator.
             */
            function inca() {
                if (regs.m) {
                    const result = ((regs.a & 0xFF) + 1) & 0xFF;
                    setZandN(result, true);
                    regs.a = (regs.a & 0xFF00) | result;
                } else {
                    regs.c++;
                    setZandN(regs.c, false);
                }
            }

            /**
             * INX (Increment Index X): Adds 1 to register X.
             */
            function inx() {
                if (regs.xFlag) {
                    const result = ((regs.x & 0xFF) + 1) & 0xFF;
                    setZandN(result, true);
                    regs.x = result;
                } else {
                    regs.x++;
                    setZandN(regs.x, false);
                }
            }

            /**
             * INY (Increment Index Y): Adds 1 to register Y.
             */
            function iny() {
                if (regs.xFlag) {
                    const result = ((regs.y & 0xFF) + 1) & 0xFF;
                    setZandN(result, true);
                    regs.y = result;
                } else {
                    regs.y++;
                    setZandN(regs.y, false);
                }
            }

            // ========================================================================
            // BIND ARITHMETIC OPCODES
            // ========================================================================

            // ADC Family
            table[0x61] = adc; table[0x63] = adc; table[0x65] = adc; table[0x67] = adc;
            table[0x69] = adc; table[0x6D] = adc; table[0x6F] = adc; table[0x71] = adc;
            table[0x72] = adc; table[0x73] = adc; table[0x75] = adc; table[0x79] = adc;
            table[0x7D] = adc; table[0x7F] = adc;

            // SBC Family
            table[0xE1] = sbc; table[0xE3] = sbc; table[0xE5] = sbc; table[0xE7] = sbc;
            table[0xE9] = sbc; table[0xED] = sbc; table[0xEF] = sbc; table[0xF1] = sbc;
            table[0xF2] = sbc; table[0xF3] = sbc; table[0xF5] = sbc; table[0xF9] = sbc;
            table[0xFD] = sbc; table[0xFF] = sbc;

            // CMP Family
            table[0xC1] = cmp; table[0xC3] = cmp; table[0xC5] = cmp; table[0xC7] = cmp;
            table[0xC9] = cmp; table[0xCD] = cmp; table[0xCF] = cmp; table[0xD1] = cmp;
            table[0xD2] = cmp; table[0xD3] = cmp; table[0xD5] = cmp; table[0xD9] = cmp;
            table[0xDD] = cmp; table[0xDF] = cmp;

            // CPX Family
            table[0xE0] = cpx; table[0xE4] = cpx; table[0xEC] = cpx;

            // CPY Family
            table[0xC0] = cpy; table[0xC4] = cpy; table[0xCC] = cpy;

            // INC Family
            table[0x1A] = inca; table[0xE6] = inc; table[0xEE] = inc; table[0xF6] = inc;
            table[0xFE] = inc;

            // DEC Family
            table[0x3A] = deca; table[0xC6] = dec; table[0xCE] = dec; table[0xD6] = dec;
            table[0xDE] = dec;

            // Index register adjustments
            table[0xCA] = dex; table[0x88] = dey; table[0xE8] = inx; table[0xC8] = iny;
        }
    }

    window.SnesCpuArithmetic = SnesCpuArithmetic;
}