/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Addressing Modes Resolver
 * 
 * Translates the 65816 CPU's various addressing modes into absolute 24-bit physical memory addresses.
 * Resolves Program Bank (K), Data Bank (B), Direct Page (D), and Stack (S) relative addresses.
 * Automatically injects cycle penalties for direct page low byte misalignment and page boundary crossings.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates complex effective address calculation
 *   mathematics from ALU arithmetic operations and general instruction execution dispatchers.
 */

class CpuAddressing {
    // Addressing Mode Constants mapped directly to SnesJs specifications
    static get Modes() {
        return {
            IMP: 0, IMM: 1, IMMm: 2, IMMx: 3, IMMl: 4, DP: 5, DPX: 6, DPY: 7,
            IDP: 8, IDX: 9, IDY: 10, IDYr: 11, IDL: 12, ILY: 13, SR: 14, ISY: 15,
            ABS: 16, ABX: 17, ABXr: 18, ABY: 19, ABYr: 20, ABL: 21, ALX: 22,
            IND: 23, IAX: 24, IAL: 25, REL: 26, RLL: 27, BM: 28
        };
    }

    /**
     * Resolves the effective 24-bit address for a given addressing mode.
     * Updates the CPU's cyclesLeft parameter when hardware penalty cycles are incurred.
     * 
     * @param {Object} cpu - Injected CPU core instance reference.
     * @param {CpuRegisters} regs - CPU register state entity.
     * @param {Object} bus - Memory bus adapter.
     * @param {number} mode - Target addressing mode constant.
     * @returns {Array<number>} An array containing the low effective address and optional high effective address.
     */
    static resolve(cpu, regs, bus, mode) {
        const Modes = CpuAddressing.Modes;

        switch (mode) {
            case Modes.IMP:
                // Implied / Accumulator
                return [0, 0];

            case Modes.IMM:
                // Immediate 8-bit
                return [((regs.pb << 16) | regs.pc++), 0];

            case Modes.IMMm:
                // Immediate, size depends on the M register flag
                if (regs.m) {
                    return [((regs.pb << 16) | regs.pc++), 0];
                } else {
                    const low = (regs.pb << 16) | regs.pc++;
                    const high = (regs.pb << 16) | regs.pc++;
                    return [low, high];
                }

            case Modes.IMMx:
                // Immediate, size depends on the X register flag
                if (regs.xFlag) {
                    return [((regs.pb << 16) | regs.pc++), 0];
                } else {
                    const low = (regs.pb << 16) | regs.pc++;
                    const high = (regs.pb << 16) | regs.pc++;
                    return [low, high];
                }

            case Modes.IMMl: {
                // Immediate, always 16-bit word
                const low = (regs.pb << 16) | regs.pc++;
                const high = (regs.pb << 16) | regs.pc++;
                return [low, high];
            }

            case Modes.DP: {
                // Direct Page
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    // Cycle penalty if Direct Page register low byte is non-zero
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.dp + offset) & 0xFFFF,
                    (regs.dp + offset + 1) & 0xFFFF
                ];
            }

            case Modes.DPX: {
                // Direct Page Indexed on X
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.dp + offset + regs.x) & 0xFFFF,
                    (regs.dp + offset + regs.x + 1) & 0xFFFF
                ];
            }

            case Modes.DPY: {
                // Direct Page Indexed on Y
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.dp + offset + regs.y) & 0xFFFF,
                    (regs.dp + offset + regs.y + 1) & 0xFFFF
                ];
            }

            case Modes.IDP: {
                // Direct Page Indirect
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + 1) & 0xFFFF) << 8;
                return [
                    (regs.db << 16) + pointer,
                    (regs.db << 16) + pointer + 1
                ];
            }

            case Modes.IDX: {
                // Direct Page Indexed Indirect on X
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset + regs.x) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + regs.x + 1) & 0xFFFF) << 8;
                return [
                    (regs.db << 16) + pointer,
                    (regs.db << 16) + pointer + 1
                ];
            }

            case Modes.IDY: {
                // Direct Page Indirect Indexed on Y, used for write/RMW instructions (no page penalty)
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + 1) & 0xFFFF) << 8;
                return [
                    (regs.db << 16) + pointer + regs.y,
                    (regs.db << 16) + pointer + regs.y + 1
                ];
            }

            case Modes.IDYr: {
                // Direct Page Indirect Indexed on Y, used for read instructions (incurs page crossed penalty)
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + 1) & 0xFFFF) << 8;
                
                const target = pointer + regs.y;
                if (((pointer >> 8) !== (target >> 8)) || !regs.xFlag) {
                    // Cycle penalty if page boundary is crossed, or index register is in 16-bit mode
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.db << 16) + target,
                    (regs.db << 16) + target + 1
                ];
            }

            case Modes.IDL: {
                // Direct Indirect Long
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + 1) & 0xFFFF) << 8;
                pointer |= bus.read((regs.dp + offset + 2) & 0xFFFF) << 16;
                return [pointer, pointer + 1];
            }

            case Modes.ILY: {
                // Direct Indirect Long Indexed on Y
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                if ((regs.dp & 0xFF) !== 0) {
                    cpu.cyclesLeft++;
                }
                let pointer = bus.read((regs.dp + offset) & 0xFFFF);
                pointer |= bus.read((regs.dp + offset + 1) & 0xFFFF) << 8;
                pointer |= bus.read((regs.dp + offset + 2) & 0xFFFF) << 16;
                
                const target = (pointer + regs.y) & 0xFFFFFF;
                return [target, (target + 1) & 0xFFFFFF];
            }

            case Modes.SR: {
                // Stack Relative
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                return [
                    (regs.sp + offset) & 0xFFFF,
                    (regs.sp + offset + 1) & 0xFFFF
                ];
            }

            case Modes.ISY: {
                // Stack Relative Indirect Indexed on Y
                const offset = bus.read((regs.pb << 16) | regs.pc++);
                let pointer = bus.read((regs.sp + offset) & 0xFFFF);
                pointer |= bus.read((regs.sp + offset + 1) & 0xFFFF) << 8;
                return [
                    (regs.db << 16) + pointer + regs.y,
                    (regs.db << 16) + pointer + regs.y + 1
                ];
            }

            case Modes.ABS: {
                // Absolute
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                return [(regs.db << 16) + adr, (regs.db << 16) + adr + 1];
            }

            case Modes.ABX: {
                // Absolute Indexed on X, used for write/RMW instructions (no page penalty)
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                return [
                    (regs.db << 16) + adr + regs.x,
                    (regs.db << 16) + adr + regs.x + 1
                ];
            }

            case Modes.ABXr: {
                // Absolute Indexed on X, used for read instructions (incurs page crossed penalty)
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                const target = adr + regs.x;
                if (((adr >> 8) !== (target >> 8)) || !regs.xFlag) {
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.db << 16) + target,
                    (regs.db << 16) + target + 1
                ];
            }

            case Modes.ABY: {
                // Absolute Indexed on Y, used for write/RMW instructions (no page penalty)
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                return [
                    (regs.db << 16) + adr + regs.y,
                    (regs.db << 16) + adr + regs.y + 1
                ];
            }

            case Modes.ABYr: {
                // Absolute Indexed on Y, used for read instructions (incurs page crossed penalty)
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                const target = adr + regs.y;
                if (((adr >> 8) !== (target >> 8)) || !regs.xFlag) {
                    cpu.cyclesLeft++;
                }
                return [
                    (regs.db << 16) + target,
                    (regs.db << 16) + target + 1
                ];
            }

            case Modes.ABL: {
                // Absolute Long
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 16;
                return [adr, adr + 1];
            }

            case Modes.ALX: {
                // Absolute Long Indexed on X
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 16;
                return [adr + regs.x, adr + regs.x + 1];
            }

            case Modes.IND: {
                // Absolute Indirect
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                let pointer = bus.read(adr);
                pointer |= bus.read((adr + 1) & 0xFFFF) << 8;
                return [(regs.pb << 16) + pointer, 0];
            }

            case Modes.IAX: {
                // Absolute Indexed Indirect on X
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                let pointer = bus.read((regs.pb << 16) | ((adr + regs.x) & 0xFFFF));
                pointer |= bus.read((regs.pb << 16) | ((adr + regs.x + 1) & 0xFFFF)) << 8;
                return [(regs.pb << 16) + pointer, 0];
            }

            case Modes.IAL: {
                // Absolute Indirect Long
                let adr = bus.read((regs.pb << 16) | regs.pc++);
                adr |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                let pointer = bus.read(adr);
                pointer |= bus.read((adr + 1) & 0xFFFF) << 8;
                pointer |= bus.read((adr + 2) & 0xFFFF) << 16;
                return [pointer, 0];
            }

            case Modes.REL: {
                // Relative 8-bit signed displacement
                const rel = bus.read((regs.pb << 16) | regs.pc++);
                const signedOffset = rel > 127 ? -(256 - rel) : rel;
                return [signedOffset, 0];
            }

            case Modes.RLL: {
                // Relative Long 16-bit signed displacement
                let rel = bus.read((regs.pb << 16) | regs.pc++);
                rel |= bus.read((regs.pb << 16) | regs.pc++) << 8;
                const signedOffset = rel > 32767 ? -(65536 - rel) : rel;
                return [signedOffset, 0];
            }

            case Modes.BM: {
                // Block Move (MVN / MVP)
                const dest = bus.read((regs.pb << 16) | regs.pc++);
                const src = bus.read((regs.pb << 16) | regs.pc++);
                return [dest, src];
            }
        }

        return [0, 0];
    }
}

window.CpuAddressing = CpuAddressing;