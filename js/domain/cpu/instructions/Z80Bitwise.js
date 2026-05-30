/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 Bitwise Instruction Registry
 * 
 * This class encapsulates all Z80 CPU instructions designed for individual bit 
 * manipulation (BIT, SET, RES). The logic follows the Command Pattern, dynamically 
 * registering instruction closures against the primary CPU instruction decoders.
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
        // 1. STANDARD CB-PREFIXED BITWISE OPERATIONS
        // ========================================================================

        // --- BIT b, r ---
        registry.bitwise[0x40] = [() => { alu.bit_8bit(registers, registers.b, 0x01); cpu.incPc(2); }, "BIT 0,B", 8, 0, false];
        registry.bitwise[0x41] = [() => { alu.bit_8bit(registers, registers.c, 0x01); cpu.incPc(2); }, "BIT 0,C", 8, 0, false];
        registry.bitwise[0x42] = [() => { alu.bit_8bit(registers, registers.d, 0x01); cpu.incPc(2); }, "BIT 0,D", 8, 0, false];
        registry.bitwise[0x43] = [() => { alu.bit_8bit(registers, registers.e, 0x01); cpu.incPc(2); }, "BIT 0,E", 8, 0, false];
        registry.bitwise[0x44] = [() => { alu.bit_8bit(registers, registers.h, 0x01); cpu.incPc(2); }, "BIT 0,H", 8, 0, false];
        registry.bitwise[0x45] = [() => { alu.bit_8bit(registers, registers.l, 0x01); cpu.incPc(2); }, "BIT 0,L", 8, 0, false];
        registry.bitwise[0x46] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x01); cpu.incPc(2); }, "BIT 0,(HL)", 12, 0, false];
        registry.bitwise[0x47] = [() => { alu.bit_8bit(registers, registers.a, 0x01); cpu.incPc(2); }, "BIT 0,A", 8, 0, false];

        registry.bitwise[0x48] = [() => { alu.bit_8bit(registers, registers.b, 0x02); cpu.incPc(2); }, "BIT 1,B", 8, 0, false];
        registry.bitwise[0x49] = [() => { alu.bit_8bit(registers, registers.c, 0x02); cpu.incPc(2); }, "BIT 1,C", 8, 0, false];
        registry.bitwise[0x4a] = [() => { alu.bit_8bit(registers, registers.d, 0x02); cpu.incPc(2); }, "BIT 1,D", 8, 0, false];
        registry.bitwise[0x4b] = [() => { alu.bit_8bit(registers, registers.e, 0x02); cpu.incPc(2); }, "BIT 1,E", 8, 0, false];
        registry.bitwise[0x4c] = [() => { alu.bit_8bit(registers, registers.h, 0x02); cpu.incPc(2); }, "BIT 1,H", 8, 0, false];
        registry.bitwise[0x4d] = [() => { alu.bit_8bit(registers, registers.l, 0x02); cpu.incPc(2); }, "BIT 1,L", 8, 0, false];
        registry.bitwise[0x4e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x02); cpu.incPc(2); }, "BIT 1,(HL)", 12, 0, false];
        registry.bitwise[0x4f] = [() => { alu.bit_8bit(registers, registers.a, 0x02); cpu.incPc(2); }, "BIT 1,A", 8, 0, false];

        registry.bitwise[0x50] = [() => { alu.bit_8bit(registers, registers.b, 0x04); cpu.incPc(2); }, "BIT 2,B", 8, 0, false];
        registry.bitwise[0x51] = [() => { alu.bit_8bit(registers, registers.c, 0x04); cpu.incPc(2); }, "BIT 2,C", 8, 0, false];
        registry.bitwise[0x52] = [() => { alu.bit_8bit(registers, registers.d, 0x04); cpu.incPc(2); }, "BIT 2,D", 8, 0, false];
        registry.bitwise[0x53] = [() => { alu.bit_8bit(registers, registers.e, 0x04); cpu.incPc(2); }, "BIT 2,E", 8, 0, false];
        registry.bitwise[0x54] = [() => { alu.bit_8bit(registers, registers.h, 0x04); cpu.incPc(2); }, "BIT 2,H", 8, 0, false];
        registry.bitwise[0x55] = [() => { alu.bit_8bit(registers, registers.l, 0x04); cpu.incPc(2); }, "BIT 2,L", 8, 0, false];
        registry.bitwise[0x56] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x04); cpu.incPc(2); }, "BIT 2,(HL)", 12, 0, false];
        registry.bitwise[0x57] = [() => { alu.bit_8bit(registers, registers.a, 0x04); cpu.incPc(2); }, "BIT 2,A", 8, 0, false];

        registry.bitwise[0x58] = [() => { alu.bit_8bit(registers, registers.b, 0x08); cpu.incPc(2); }, "BIT 3,B", 8, 0, false];
        registry.bitwise[0x59] = [() => { alu.bit_8bit(registers, registers.c, 0x08); cpu.incPc(2); }, "BIT 3,C", 8, 0, false];
        registry.bitwise[0x5a] = [() => { alu.bit_8bit(registers, registers.d, 0x08); cpu.incPc(2); }, "BIT 3,D", 8, 0, false];
        registry.bitwise[0x5b] = [() => { alu.bit_8bit(registers, registers.e, 0x08); cpu.incPc(2); }, "BIT 3,E", 8, 0, false];
        registry.bitwise[0x5c] = [() => { alu.bit_8bit(registers, registers.h, 0x08); cpu.incPc(2); }, "BIT 3,H", 8, 0, false];
        registry.bitwise[0x5d] = [() => { alu.bit_8bit(registers, registers.l, 0x08); cpu.incPc(2); }, "BIT 3,L", 8, 0, false];
        registry.bitwise[0x5e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x08); cpu.incPc(2); }, "BIT 3,(HL)", 12, 0, false];
        registry.bitwise[0x5f] = [() => { alu.bit_8bit(registers, registers.a, 0x08); cpu.incPc(2); }, "BIT 3,A", 8, 0, false];

        registry.bitwise[0x60] = [() => { alu.bit_8bit(registers, registers.b, 0x10); cpu.incPc(2); }, "BIT 4,B", 8, 0, false];
        registry.bitwise[0x61] = [() => { alu.bit_8bit(registers, registers.c, 0x10); cpu.incPc(2); }, "BIT 4,C", 8, 0, false];
        registry.bitwise[0x62] = [() => { alu.bit_8bit(registers, registers.d, 0x10); cpu.incPc(2); }, "BIT 4,D", 8, 0, false];
        registry.bitwise[0x63] = [() => { alu.bit_8bit(registers, registers.e, 0x10); cpu.incPc(2); }, "BIT 4,E", 8, 0, false];
        registry.bitwise[0x64] = [() => { alu.bit_8bit(registers, registers.h, 0x10); cpu.incPc(2); }, "BIT 4,H", 8, 0, false];
        registry.bitwise[0x65] = [() => { alu.bit_8bit(registers, registers.l, 0x10); cpu.incPc(2); }, "BIT 4,L", 8, 0, false];
        registry.bitwise[0x66] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x10); cpu.incPc(2); }, "BIT 4,(HL)", 12, 0, false];
        registry.bitwise[0x67] = [() => { alu.bit_8bit(registers, registers.a, 0x10); cpu.incPc(2); }, "BIT 4,A", 8, 0, false];

        registry.bitwise[0x68] = [() => { alu.bit_8bit(registers, registers.b, 0x20); cpu.incPc(2); }, "BIT 5,B", 8, 0, false];
        registry.bitwise[0x69] = [() => { alu.bit_8bit(registers, registers.c, 0x20); cpu.incPc(2); }, "BIT 5,C", 8, 0, false];
        registry.bitwise[0x6a] = [() => { alu.bit_8bit(registers, registers.d, 0x20); cpu.incPc(2); }, "BIT 5,D", 8, 0, false];
        registry.bitwise[0x6b] = [() => { alu.bit_8bit(registers, registers.e, 0x20); cpu.incPc(2); }, "BIT 5,E", 8, 0, false];
        registry.bitwise[0x6c] = [() => { alu.bit_8bit(registers, registers.h, 0x20); cpu.incPc(2); }, "BIT 5,H", 8, 0, false];
        registry.bitwise[0x6d] = [() => { alu.bit_8bit(registers, registers.l, 0x20); cpu.incPc(2); }, "BIT 5,L", 8, 0, false];
        registry.bitwise[0x6e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x20); cpu.incPc(2); }, "BIT 5,(HL)", 12, 0, false];
        registry.bitwise[0x6f] = [() => { alu.bit_8bit(registers, registers.a, 0x20); cpu.incPc(2); }, "BIT 5,A", 8, 0, false];

        registry.bitwise[0x70] = [() => { alu.bit_8bit(registers, registers.b, 0x40); cpu.incPc(2); }, "BIT 6,B", 8, 0, false];
        registry.bitwise[0x71] = [() => { alu.bit_8bit(registers, registers.c, 0x40); cpu.incPc(2); }, "BIT 6,C", 8, 0, false];
        registry.bitwise[0x72] = [() => { alu.bit_8bit(registers, registers.d, 0x40); cpu.incPc(2); }, "BIT 6,D", 8, 0, false];
        registry.bitwise[0x73] = [() => { alu.bit_8bit(registers, registers.e, 0x40); cpu.incPc(2); }, "BIT 6,E", 8, 0, false];
        registry.bitwise[0x74] = [() => { alu.bit_8bit(registers, registers.h, 0x40); cpu.incPc(2); }, "BIT 6,H", 8, 0, false];
        registry.bitwise[0x75] = [() => { alu.bit_8bit(registers, registers.l, 0x40); cpu.incPc(2); }, "BIT 6,L", 8, 0, false];
        registry.bitwise[0x76] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x40); cpu.incPc(2); }, "BIT 6,(HL)", 12, 0, false];
        registry.bitwise[0x77] = [() => { alu.bit_8bit(registers, registers.a, 0x40); cpu.incPc(2); }, "BIT 6,A", 8, 0, false];

        registry.bitwise[0x78] = [() => { alu.bit_8bit(registers, registers.b, 0x80); cpu.incPc(2); }, "BIT 7,B", 8, 0, false];
        registry.bitwise[0x79] = [() => { alu.bit_8bit(registers, registers.c, 0x80); cpu.incPc(2); }, "BIT 7,C", 8, 0, false];
        registry.bitwise[0x7a] = [() => { alu.bit_8bit(registers, registers.d, 0x80); cpu.incPc(2); }, "BIT 7,D", 8, 0, false];
        registry.bitwise[0x7b] = [() => { alu.bit_8bit(registers, registers.e, 0x80); cpu.incPc(2); }, "BIT 7,E", 8, 0, false];
        registry.bitwise[0x7c] = [() => { alu.bit_8bit(registers, registers.h, 0x80); cpu.incPc(2); }, "BIT 7,H", 8, 0, false];
        registry.bitwise[0x7d] = [() => { alu.bit_8bit(registers, registers.l, 0x80); cpu.incPc(2); }, "BIT 7,L", 8, 0, false];
        registry.bitwise[0x7e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(registers.hl), 0x80); cpu.incPc(2); }, "BIT 7,(HL)", 12, 0, false];
        registry.bitwise[0x7f] = [() => { alu.bit_8bit(registers, registers.a, 0x80); cpu.incPc(2); }, "BIT 7,A", 8, 0, false];

        // --- RES b, r ---
        registry.bitwise[0x80] = [() => { registers.b &= ~0x01; cpu.incPc(2); }, "RES 0,B", 8, 0, false];
        registry.bitwise[0x81] = [() => { registers.c &= ~0x01; cpu.incPc(2); }, "RES 0,C", 8, 0, false];
        registry.bitwise[0x82] = [() => { registers.d &= ~0x01; cpu.incPc(2); }, "RES 0,D", 8, 0, false];
        registry.bitwise[0x83] = [() => { registers.e &= ~0x01; cpu.incPc(2); }, "RES 0,E", 8, 0, false];
        registry.bitwise[0x84] = [() => { registers.h &= ~0x01; cpu.incPc(2); }, "RES 0,H", 8, 0, false];
        registry.bitwise[0x85] = [() => { registers.l &= ~0x01; cpu.incPc(2); }, "RES 0,L", 8, 0, false];
        registry.bitwise[0x86] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x01; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 0,(HL)", 15, 0, false];
        registry.bitwise[0x87] = [() => { registers.a &= ~0x01; cpu.incPc(2); }, "RES 0,A", 8, 0, false];

        registry.bitwise[0x88] = [() => { registers.b &= ~0x02; cpu.incPc(2); }, "RES 1,B", 8, 0, false];
        registry.bitwise[0x89] = [() => { registers.c &= ~0x02; cpu.incPc(2); }, "RES 1,C", 8, 0, false];
        registry.bitwise[0x8a] = [() => { registers.d &= ~0x02; cpu.incPc(2); }, "RES 1,D", 8, 0, false];
        registry.bitwise[0x8b] = [() => { registers.e &= ~0x02; cpu.incPc(2); }, "RES 1,E", 8, 0, false];
        registry.bitwise[0x8c] = [() => { registers.h &= ~0x02; cpu.incPc(2); }, "RES 1,H", 8, 0, false];
        registry.bitwise[0x8d] = [() => { registers.l &= ~0x02; cpu.incPc(2); }, "RES 1,L", 8, 0, false];
        registry.bitwise[0x8e] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x02; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 1,(HL)", 15, 0, false];
        registry.bitwise[0x8f] = [() => { registers.a &= ~0x02; cpu.incPc(2); }, "RES 1,A", 8, 0, false];

        registry.bitwise[0x90] = [() => { registers.b &= ~0x04; cpu.incPc(2); }, "RES 2,B", 8, 0, false];
        registry.bitwise[0x91] = [() => { registers.c &= ~0x04; cpu.incPc(2); }, "RES 2,C", 8, 0, false];
        registry.bitwise[0x92] = [() => { registers.d &= ~0x04; cpu.incPc(2); }, "RES 2,D", 8, 0, false];
        registry.bitwise[0x93] = [() => { registers.e &= ~0x04; cpu.incPc(2); }, "RES 2,E", 8, 0, false];
        registry.bitwise[0x94] = [() => { registers.h &= ~0x04; cpu.incPc(2); }, "RES 2,H", 8, 0, false];
        registry.bitwise[0x95] = [() => { registers.l &= ~0x04; cpu.incPc(2); }, "RES 2,L", 8, 0, false];
        registry.bitwise[0x96] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x04; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 2,(HL)", 15, 0, false];
        registry.bitwise[0x97] = [() => { registers.a &= ~0x04; cpu.incPc(2); }, "RES 2,A", 8, 0, false];

        registry.bitwise[0x98] = [() => { registers.b &= ~0x08; cpu.incPc(2); }, "RES 3,B", 8, 0, false];
        registry.bitwise[0x99] = [() => { registers.c &= ~0x08; cpu.incPc(2); }, "RES 3,C", 8, 0, false];
        registry.bitwise[0x9a] = [() => { registers.d &= ~0x08; cpu.incPc(2); }, "RES 3,D", 8, 0, false];
        registry.bitwise[0x9b] = [() => { registers.e &= ~0x08; cpu.incPc(2); }, "RES 3,E", 8, 0, false];
        registry.bitwise[0x9d] = [() => { registers.l &= ~0x08; cpu.incPc(2); }, "RES 3,L", 8, 0, false];
        registry.bitwise[0x9e] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x08; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 3,(HL)", 15, 0, false];
        registry.bitwise[0x9f] = [() => { registers.a &= ~0x08; cpu.incPc(2); }, "RES 3,A", 8, 0, false];

        registry.bitwise[0xa0] = [() => { registers.b &= ~0x10; cpu.incPc(2); }, "RES 4,B", 8, 0, false];
        registry.bitwise[0xa1] = [() => { registers.c &= ~0x10; cpu.incPc(2); }, "RES 4,C", 8, 0, false];
        registry.bitwise[0xa2] = [() => { registers.d &= ~0x10; cpu.incPc(2); }, "RES 4,D", 8, 0, false];
        registry.bitwise[0xa3] = [() => { registers.e &= ~0x10; cpu.incPc(2); }, "RES 4,E", 8, 0, false];
        registry.bitwise[0xa4] = [() => { registers.h &= ~0x10; cpu.incPc(2); }, "RES 4,H", 8, 0, false];
        registry.bitwise[0xa6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x10; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 4,(HL)", 15, 0, false];
        registry.bitwise[0xa7] = [() => { registers.a &= ~0x10; cpu.incPc(2); }, "RES 4,A", 8, 0, false];

        registry.bitwise[0xa8] = [() => { registers.b &= ~0x20; cpu.incPc(2); }, "RES 5,B", 8, 0, false];
        registry.bitwise[0xa9] = [() => { registers.c &= ~0x20; cpu.incPc(2); }, "RES 5,C", 8, 0, false];
        registry.bitwise[0xaa] = [() => { registers.d &= ~0x20; cpu.incPc(2); }, "RES 5,D", 8, 0, false];
        registry.bitwise[0xab] = [() => { registers.e &= ~0x20; cpu.incPc(2); }, "RES 5,E", 8, 0, false];
        registry.bitwise[0xac] = [() => { registers.h &= ~0x20; cpu.incPc(2); }, "RES 5,H", 8, 0, false];
        registry.bitwise[0xad] = [() => { registers.l &= ~0x20; cpu.incPc(2); }, "RES 5,L", 8, 0, false];
        registry.bitwise[0xae] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x20; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 5,(HL)", 15, 0, false];
        registry.bitwise[0xaf] = [() => { registers.a &= ~0x20; cpu.incPc(2); }, "RES 5,A", 8, 0, false];

        registry.bitwise[0xb0] = [() => { registers.b &= ~0x40; cpu.incPc(2); }, "RES 6,B", 8, 0, false];
        registry.bitwise[0xb1] = [() => { registers.c &= ~0x40; cpu.incPc(2); }, "RES 6,C", 8, 0, false];
        registry.bitwise[0xb2] = [() => { registers.d &= ~0x40; cpu.incPc(2); }, "RES 6,D", 8, 0, false];
        registry.bitwise[0xb3] = [() => { registers.e &= ~0x40; cpu.incPc(2); }, "RES 6,E", 8, 0, false];
        registry.bitwise[0xb4] = [() => { registers.h &= ~0x40; cpu.incPc(2); }, "RES 6,H", 8, 0, false];
        registry.bitwise[0xb5] = [() => { registers.l &= ~0x40; cpu.incPc(2); }, "RES 6,L", 8, 0, false];
        registry.bitwise[0xb6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x40; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 6,(HL)", 15, 0, false];
        registry.bitwise[0xb7] = [() => { registers.a &= ~0x40; cpu.incPc(2); }, "RES 6,A", 8, 0, false];

        registry.bitwise[0xb8] = [() => { registers.b &= ~0x80; cpu.incPc(2); }, "RES 7,B", 8, 0, false];
        registry.bitwise[0xb9] = [() => { registers.c &= ~0x80; cpu.incPc(2); }, "RES 7,C", 8, 0, false];
        registry.bitwise[0xba] = [() => { registers.d &= ~0x80; cpu.incPc(2); }, "RES 7,D", 8, 0, false];
        registry.bitwise[0xbb] = [() => { registers.e &= ~0x80; cpu.incPc(2); }, "RES 7,E", 8, 0, false];
        registry.bitwise[0xbc] = [() => { registers.h &= ~0x80; cpu.incPc(2); }, "RES 7,H", 8, 0, false];
        registry.bitwise[0xbd] = [() => { registers.l &= ~0x80; cpu.incPc(2); }, "RES 7,L", 8, 0, false];
        registry.bitwise[0xbe] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c &= ~0x80; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "RES 7,(HL)", 15, 0, false];
        registry.bitwise[0xbf] = [() => { registers.a &= ~0x80; cpu.incPc(2); }, "RES 7,A", 8, 0, false];

        // --- SET b, r ---
        registry.bitwise[0xc0] = [() => { registers.b |= 0x01; cpu.incPc(2); }, "SET 0,B", 8, 0, false];
        registry.bitwise[0xc1] = [() => { registers.c |= 0x01; cpu.incPc(2); }, "SET 0,C", 8, 0, false];
        registry.bitwise[0xc2] = [() => { registers.d |= 0x01; cpu.incPc(2); }, "SET 0,D", 8, 0, false];
        registry.bitwise[0xc3] = [() => { registers.e |= 0x01; cpu.incPc(2); }, "SET 0,E", 8, 0, false];
        registry.bitwise[0xc4] = [() => { registers.h |= 0x01; cpu.incPc(2); }, "SET 0,H", 8, 0, false];
        registry.bitwise[0xc5] = [() => { registers.l |= 0x01; cpu.incPc(2); }, "SET 0,L", 8, 0, false];
        registry.bitwise[0xc6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x01; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 0,(HL)", 15, 0, false];
        registry.bitwise[0xc7] = [() => { registers.a |= 0x01; cpu.incPc(2); }, "SET 0,A", 8, 0, false];

        registry.bitwise[0xc8] = [() => { registers.b |= 0x02; cpu.incPc(2); }, "SET 1,B", 8, 0, false];
        registry.bitwise[0xc9] = [() => { registers.c |= 0x02; cpu.incPc(2); }, "SET 1,C", 8, 0, false];
        registry.bitwise[0xca] = [() => { registers.d |= 0x02; cpu.incPc(2); }, "SET 1,D", 8, 0, false];
        registry.bitwise[0xcb] = [() => { registers.e |= 0x02; cpu.incPc(2); }, "SET 1,E", 8, 0, false];
        registry.bitwise[0xcc] = [() => { registers.h |= 0x02; cpu.incPc(2); }, "SET 1,H", 8, 0, false];
        registry.bitwise[0xcd] = [() => { registers.l |= 0x02; cpu.incPc(2); }, "SET 1,L", 8, 0, false];
        registry.bitwise[0xce] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x02; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 1,(HL)", 15, 0, false];
        registry.bitwise[0xcf] = [() => { registers.a |= 0x02; cpu.incPc(2); }, "SET 1,A", 8, 0, false];

        registry.bitwise[0xd0] = [() => { registers.b |= 0x04; cpu.incPc(2); }, "SET 2,B", 8, 0, false];
        registry.bitwise[0xd1] = [() => { registers.c |= 0x04; cpu.incPc(2); }, "SET 2,C", 8, 0, false];
        registry.bitwise[0xd2] = [() => { registers.d |= 0x04; cpu.incPc(2); }, "SET 2,D", 8, 0, false];
        registry.bitwise[0xd3] = [() => { registers.e |= 0x04; cpu.incPc(2); }, "SET 2,E", 8, 0, false];
        registry.bitwise[0xd4] = [() => { registers.h |= 0x04; cpu.incPc(2); }, "SET 2,H", 8, 0, false];
        registry.bitwise[0xd5] = [() => { registers.l |= 0x04; cpu.incPc(2); }, "SET 2,L", 8, 0, false];
        registry.bitwise[0xd6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x04; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 2,(HL)", 15, 0, false];
        registry.bitwise[0xd7] = [() => { registers.a |= 0x04; cpu.incPc(2); }, "SET 2,A", 8, 0, false];

        registry.bitwise[0xd8] = [() => { registers.b |= 0x08; cpu.incPc(2); }, "SET 3,B", 8, 0, false];
        registry.bitwise[0xd9] = [() => { registers.c |= 0x08; cpu.incPc(2); }, "SET 3,C", 8, 0, false];
        registry.bitwise[0xda] = [() => { registers.d |= 0x08; cpu.incPc(2); }, "SET 3,D", 8, 0, false];
        registry.bitwise[0xdb] = [() => { registers.e |= 0x08; cpu.incPc(2); }, "SET 3,E", 8, 0, false];
        registry.bitwise[0xdc] = [() => { registers.h |= 0x08; cpu.incPc(2); }, "SET 3,H", 8, 0, false];
        registry.bitwise[0xdd] = [() => { registers.l |= 0x08; cpu.incPc(2); }, "SET 3,L", 8, 0, false];
        registry.bitwise[0xde] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x08; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 3,(HL)", 15, 0, false];
        registry.bitwise[0xdf] = [() => { registers.a |= 0x08; cpu.incPc(2); }, "SET 3,A", 8, 0, false];

        registry.bitwise[0xe0] = [() => { registers.b |= 0x10; cpu.incPc(2); }, "SET 4,B", 8, 0, false];
        registry.bitwise[0xe1] = [() => { registers.c |= 0x10; cpu.incPc(2); }, "SET 4,C", 8, 0, false];
        registry.bitwise[0xe2] = [() => { registers.d |= 0x10; cpu.incPc(2); }, "SET 4,D", 8, 0, false];
        registry.bitwise[0xe3] = [() => { registers.e |= 0x10; cpu.incPc(2); }, "SET 4,E", 8, 0, false];
        registry.bitwise[0xe4] = [() => { registers.h |= 0x10; cpu.incPc(2); }, "SET 4,H", 8, 0, false];
        registry.bitwise[0xe5] = [() => { registers.l |= 0x10; cpu.incPc(2); }, "SET 4,L", 8, 0, false];
        registry.bitwise[0xe6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x10; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 4,(HL)", 15, 0, false];
        registry.bitwise[0xe7] = [() => { registers.a |= 0x10; cpu.incPc(2); }, "SET 4,A", 8, 0, false];

        registry.bitwise[0xe8] = [() => { registers.b |= 0x20; cpu.incPc(2); }, "SET 5,B", 8, 0, false];
        registry.bitwise[0xe9] = [() => { registers.c |= 0x20; cpu.incPc(2); }, "SET 5,C", 8, 0, false];
        registry.bitwise[0xea] = [() => { registers.d |= 0x20; cpu.incPc(2); }, "SET 5,D", 8, 0, false];
        registry.bitwise[0xeb] = [() => { registers.e |= 0x20; cpu.incPc(2); }, "SET 5,E", 8, 0, false];
        registry.bitwise[0xec] = [() => { registers.h |= 0x20; cpu.incPc(2); }, "SET 5,H", 8, 0, false];
        registry.bitwise[0xed] = [() => { registers.l |= 0x20; cpu.incPc(2); }, "SET 5,L", 8, 0, false];
        registry.bitwise[0xee] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x20; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 5,(HL)", 15, 0, false];
        registry.bitwise[0xef] = [() => { registers.a |= 0x20; cpu.incPc(2); }, "SET 5,A", 8, 0, false];

        registry.bitwise[0xf0] = [() => { registers.b |= 0x40; cpu.incPc(2); }, "SET 6,B", 8, 0, false];
        registry.bitwise[0xf1] = [() => { registers.c |= 0x40; cpu.incPc(2); }, "SET 6,C", 8, 0, false];
        registry.bitwise[0xf2] = [() => { registers.d |= 0x40; cpu.incPc(2); }, "SET 6,D", 8, 0, false];
        registry.bitwise[0xf3] = [() => { registers.e |= 0x40; cpu.incPc(2); }, "SET 6,E", 8, 0, false];
        registry.bitwise[0xf4] = [() => { registers.h |= 0x40; cpu.incPc(2); }, "SET 6,H", 8, 0, false];
        registry.bitwise[0xf5] = [() => { registers.l |= 0x40; cpu.incPc(2); }, "SET 6,L", 8, 0, false];
        registry.bitwise[0xf6] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x40; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 6,(HL)", 15, 0, false];
        registry.bitwise[0xf7] = [() => { registers.a |= 0x40; cpu.incPc(2); }, "SET 6,A", 8, 0, false];

        registry.bitwise[0xf8] = [() => { registers.b |= 0x80; cpu.incPc(2); }, "SET 7,B", 8, 0, false];
        registry.bitwise[0xf9] = [() => { registers.c |= 0x80; cpu.incPc(2); }, "SET 7,C", 8, 0, false];
        registry.bitwise[0xfa] = [() => { registers.d |= 0x80; cpu.incPc(2); }, "SET 7,D", 8, 0, false];
        registry.bitwise[0xfb] = [() => { registers.e |= 0x80; cpu.incPc(2); }, "SET 7,E", 8, 0, false];
        registry.bitwise[0xfc] = [() => { registers.h |= 0x80; cpu.incPc(2); }, "SET 7,H", 8, 0, false];
        registry.bitwise[0xfd] = [() => { registers.l |= 0x80; cpu.incPc(2); }, "SET 7,L", 8, 0, false];
        registry.bitwise[0xfe] = [() => { let c = cpu.theMMU.readAddr(registers.hl); c |= 0x80; cpu.theMMU.writeAddr(registers.hl, c); cpu.incPc(2); }, "SET 7,(HL)", 15, 0, false];
        registry.bitwise[0xff] = [() => { registers.a |= 0x80; cpu.incPc(2); }, "SET 7,A", 8, 0, false];


        // ========================================================================
        // 2. INDEXED DDCB-PREFIXED BIT INSTRUCTIONS (IX + d)
        // ========================================================================

        // --- BIT b, (IX+d) ---
        registry.bitwiseIX[0x46] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x01); cpu.incPc(4); }, "BIT 0,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x4e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x02); cpu.incPc(4); }, "BIT 1,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x56] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x04); cpu.incPc(4); }, "BIT 2,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x5e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x08); cpu.incPc(4); }, "BIT 3,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x66] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x10); cpu.incPc(4); }, "BIT 4,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x6e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x20); cpu.incPc(4); }, "BIT 5,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x76] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x40); cpu.incPc(4); }, "BIT 6,(IX+%d)", 20, 1, false];
        registry.bitwiseIX[0x7e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.ix)), 0x80); cpu.incPc(4); }, "BIT 7,(IX+%d)", 20, 1, false];

        // --- RES b, (IX+d) ---
        registry.bitwiseIX[0x86] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x01; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 0,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0x8e] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x02; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 1,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0x96] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x04; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 2,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0x9e] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x08; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 3,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xa6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x10; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 4,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xae] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x20; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 5,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xb6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x40; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 6,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xbe] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c &= ~0x80; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 7,(IX+%d)", 23, 1, false];

        // --- SET b, (IX+d) ---
        registry.bitwiseIX[0xc6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x01; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 0,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xce] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x02; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 1,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xd6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x04; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 2,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xde] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x08; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 3,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xe6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x10; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 4,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xee] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x20; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 5,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xf6] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x40; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 6,(IX+%d)", 23, 1, false];
        registry.bitwiseIX[0xfe] = [() => { const a = getDisplacement(registers.ix); let c = cpu.theMMU.readAddr(a); c |= 0x80; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 7,(IX+%d)", 23, 1, false];


        // ========================================================================
        // 3. INDEXED FDCB-PREFIXED BIT INSTRUCTIONS (IY + d)
        // ========================================================================

        // --- BIT b, (IY+d) ---
        registry.bitwiseIY[0x46] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x01); cpu.incPc(4); }, "BIT 0,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x4e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x02); cpu.incPc(4); }, "BIT 1,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x56] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x04); cpu.incPc(4); }, "BIT 2,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x5e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x08); cpu.incPc(4); }, "BIT 3,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x66] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x10); cpu.incPc(4); }, "BIT 4,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x6e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x20); cpu.incPc(4); }, "BIT 5,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x76] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x40); cpu.incPc(4); }, "BIT 6,(IY+%d)", 20, 1, false];
        registry.bitwiseIY[0x7e] = [() => { alu.bit_8bit(registers, cpu.theMMU.readAddr(getDisplacement(registers.iy)), 0x80); cpu.incPc(4); }, "BIT 7,(IY+%d)", 20, 1, false];

        // --- RES b, (IY+d) ---
        registry.bitwiseIY[0x86] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x01; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 0,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0x8e] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x02; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 1,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0x96] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x04; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 2,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0x9e] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x08; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 3,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xa6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x10; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 4,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xae] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x20; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 5,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xb6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x40; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 6,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xbe] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c &= ~0x80; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "RES 7,(IY+%d)", 23, 1, false];

        // --- SET b, (IY+d) ---
        registry.bitwiseIY[0xc6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x01; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 0,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xce] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x02; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 1,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xd6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x04; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 2,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xde] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x08; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 3,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xe6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x10; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 4,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xee] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x20; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 5,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xf6] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x40; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 6,(IY+%d)", 23, 1, false];
        registry.bitwiseIY[0xfe] = [() => { const a = getDisplacement(registers.iy); let c = cpu.theMMU.readAddr(a); c |= 0x80; cpu.theMMU.writeAddr(a, c); cpu.incPc(4); }, "SET 7,(IY+%d)", 23, 1, false];

    }
}