/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/instructions/Z80Bitwise.js
 * 
 * Role:
 * Domain Layer: Z80 CPU Bitwise Instructions.
 * This class encapsulates all Z80 CPU instructions designed for individual bit 
 * manipulation (BIT, SET, RES). The logic follows the Command Pattern, dynamically 
 * registering instruction closures against the primary CPU instruction decoders.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for single-bit 
 *    test, set, and clear operation definitions. It isolates dynamic table mapping 
 *    logic completely from standard execution loops.
 * 2. Interface Segregation Principle (ISP): It expects only a thin, unified 
 *    opcode mapping dictionary (registry) rather than depending on the full, 
 *    heavy execution context of the ZilogZ80 class.
 */

class Z80Bitwise {
    /**
     * Registers all Bitwise opcodes onto the provided CPU opcode maps.
     * @param {ZilogZ80} cpu - The CPU Orchestrator instance.
     * @param {Z80Registers} registers - The CPU Registers state object.
     * @param {Z80Alu} alu - The Arithmetic Logic Unit for flag processing.
     * @param {Object} registry - The categorized opcode mapping arrays.
     */
    static register(cpu, registers, alu, registry) {

        /**
         * Helper for displacement address computation used in index-relative 
         * addressing (e.g., SET 3,(IX+d)).
         * @param {number} indexValue - Base 16-bit index (IX or IY).
         * @returns {number} The absolute 16-bit memory offset.
         */
        const getDisplacement = (indexValue) => {
            const d = cpu.theMMU.readAddr(registers.pc + 2);
            // Sign-extend the 8-bit displacement value (-128 to 127)
            const incr = (d & 0x80) === 0x80 ? -0x80 + (d & 0x7F) : d;
            return (indexValue + incr) & 0xffff;
        };

        // ========================================================================
        // DYNAMIC BITWISE INSTRUCTION GENERATOR (BIT, RES, SET)
        // ========================================================================
        
        // Z80 Standard Register mapping sequence: B, C, D, E, H, L, (HL), A
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        const regProps = ['b', 'c', 'd', 'e', 'h', 'l', null, 'a'];

        for (let bit = 0; bit < 8; bit++) {
            const bitMask = 1 << bit;
            const notBitMask = (~bitMask) & 0xff;

            for (let r = 0; r < 8; r++) {
                const isHL = (r === 6);
                const regName = regNames[r];
                const prop = regProps[r];

                // Calculate base opcodes for the CB prefix matrix
                const opBit = 0x40 + (bit * 8) + r;
                const opRes = 0x80 + (bit * 8) + r;
                const opSet = 0xC0 + (bit * 8) + r;

                // --- 1. STANDARD CB-PREFIXED OPERATIONS ---
                
                // BIT b, r
                registry.bitwise[opBit] = [() => {
                    const val = isHL ? cpu.theMMU.readAddr(registers.hl) : registers[prop];
                    alu.bit_8bit(registers, val, bitMask);
                    cpu.incPc(2);
                }, `BIT ${bit},${regName}`, isHL ? 12 : 8, 0, false];

                // RES b, r
                registry.bitwise[opRes] = [() => {
                    if (isHL) {
                        let val = cpu.theMMU.readAddr(registers.hl);
                        val &= notBitMask;
                        cpu.theMMU.writeAddr(registers.hl, val);
                    } else {
                        registers[prop] &= notBitMask;
                    }
                    cpu.incPc(2);
                }, `RES ${bit},${regName}`, isHL ? 15 : 8, 0, false];

                // SET b, r
                registry.bitwise[opSet] = [() => {
                    if (isHL) {
                        let val = cpu.theMMU.readAddr(registers.hl);
                        val |= bitMask;
                        cpu.theMMU.writeAddr(registers.hl, val);
                    } else {
                        registers[prop] |= bitMask;
                    }
                    cpu.incPc(2);
                }, `SET ${bit},${regName}`, isHL ? 15 : 8, 0, false];


                // --- 2. INDEXED DDCB / FDCB OPERATIONS (IX/IY overrides) ---
                // In the Z80 architecture, IX/IY index bitwise instructions occupy 
                // the exact same matrix slots as the (HL) pointer (Register index 6).
                if (isHL) {
                    
                    // BIT b, (IX+d) / (IY+d)
                    registry.bitwiseIX[opBit] = [() => {
                        const val = cpu.theMMU.readAddr(getDisplacement(registers.ix));
                        alu.bit_8bit(registers, val, bitMask);
                        cpu.incPc(4);
                    }, `BIT ${bit},(IX+%d)`, 20, 1, false];

                    registry.bitwiseIY[opBit] = [() => {
                        const val = cpu.theMMU.readAddr(getDisplacement(registers.iy));
                        alu.bit_8bit(registers, val, bitMask);
                        cpu.incPc(4);
                    }, `BIT ${bit},(IY+%d)`, 20, 1, false];

                    // RES b, (IX+d) / (IY+d)
                    registry.bitwiseIX[opRes] = [() => {
                        const addr = getDisplacement(registers.ix);
                        let val = cpu.theMMU.readAddr(addr);
                        val &= notBitMask;
                        cpu.theMMU.writeAddr(addr, val);
                        cpu.incPc(4);
                    }, `RES ${bit},(IX+%d)`, 23, 1, false];

                    registry.bitwiseIY[opRes] = [() => {
                        const addr = getDisplacement(registers.iy);
                        let val = cpu.theMMU.readAddr(addr);
                        val &= notBitMask;
                        cpu.theMMU.writeAddr(addr, val);
                        cpu.incPc(4);
                    }, `RES ${bit},(IY+%d)`, 23, 1, false];

                    // SET b, (IX+d) / (IY+d)
                    registry.bitwiseIX[opSet] = [() => {
                        const addr = getDisplacement(registers.ix);
                        let val = cpu.theMMU.readAddr(addr);
                        val |= bitMask;
                        cpu.theMMU.writeAddr(addr, val);
                        cpu.incPc(4);
                    }, `SET ${bit},(IX+%d)`, 23, 1, false];

                    registry.bitwiseIY[opSet] = [() => {
                        const addr = getDisplacement(registers.iy);
                        let val = cpu.theMMU.readAddr(addr);
                        val |= bitMask;
                        cpu.theMMU.writeAddr(addr, val);
                        cpu.incPc(4);
                    }, `SET ${bit},(IY+%d)`, 23, 1, false];
                }
            }
        }
    }
}