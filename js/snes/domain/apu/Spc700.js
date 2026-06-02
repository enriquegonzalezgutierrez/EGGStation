/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sony SPC700 APU CPU Core Orchestrator
 * 
 * Coordinates the APU execution pipeline, handles interrupts (BRK, IRQ, ABORT),
 * manages the SPC700 register states, and dispatches instruction executions via a
 * modular, registered opcode table. Integrates tightly with the DSP interface for
 * sample playback and state synchronization.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Manages the APU's execution cycle,
 *   interrupt priorities, and instruction dispatching, delegating specific math
 *   to the Spc700Alu and memory access to the Spc700Bus.
 * - Open/Closed Principle (OCP): Easily extendable with new instruction sets via
 *   dynamic executor registration without modifying core dispatching logic.
 */

{
    // Block-Scoped Addressing Mode Constants for SPC700 decoder (Prevents collision with Cpu.js)
    const IMP = 0, REL = 1, DP = 2, DPR = 3, ABS = 4, IND = 5, IDX = 6, IMM = 7, 
          DPX = 8, ABX = 9, ABY = 10, IDY = 11, DD = 12, II = 13, DI = 14, DPY = 15, 
          ABB = 16, DXR = 17, IAX = 18, IPI = 19;

    class Spc700 {
        /**
         * @param {SnesApu} mem - The unified system memory bus for the APU.
         */
        constructor(mem) {
            this.mem = mem;

            // Register entity
            this.registers = new Spc700Registers();

            // ALU entity for math operations
            this.alu = new Spc700Alu();

            // SPC700 Native Opcode Addressing Modes List
            this.modes = [
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, ABS, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, ABS, IAX,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, DPR, REL,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, DP , ABS,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, ABS, DP ,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, ABS, ABS,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMP, DPR, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, DP , IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMM, IMP, DI ,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, IMP, IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, DD , ABB, DP , ABS, IMM, IMP, IPI,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DI , II , DP , DPX, IMP, IMP, IMP, IPI,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, ABS, ABB, DP , ABS, IMM, IMP, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DP , DPY, DP , DPX, IMP, IMP, DXR, IMP,
                IMP, IMP, DP , DPR, DP , ABS, IND, IDX, IMM, ABS, ABB, DP , ABS, IMP, IMP, IMP,
                REL, IMP, DP , DPR, DPX, ABX, ABY, IDY, DP , DPY, DD , DPX, IMP, IMP, REL, IMP
            ];

            // SPC700 Base Clock T-States duration list per instruction
            this.cycles = [
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 6, 8,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 4, 6,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 5, 4,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 3, 8,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 6, 6,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 4, 5, 2, 2, 4, 3,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 5, 5,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 6,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 2, 4, 5,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 12,5,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 2, 4, 4,
                2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 4,
                2, 8, 4, 5, 4, 5, 4, 7, 2, 5, 6, 4, 5, 2, 4, 9,
                2, 8, 4, 5, 5, 6, 6, 7, 4, 5, 5, 5, 2, 2, 6, 3,
                2, 8, 4, 5, 3, 4, 3, 6, 2, 4, 5, 3, 4, 3, 4, 3,
                2, 8, 4, 5, 4, 5, 5, 6, 3, 4, 5, 4, 2, 2, 4, 3
            ];

            // Execution States
            this.cyclesLeft = 0;
            this.additionalCycles = 0;
            this.isHalted = false;

            // Interrupt line registers
            this.irqWanted = false;
            this.nmiWanted = false;
            this.brkWanted = false;

            // Opcode dispatch table
            this.opcodeTable = new Array(256).fill(null);

            this.registerOpcodes();
        }

        /**
         * Resets the SPC700 CPU state to cold-boot defaults.
         */
        reset() {
            this.registers.reset();
            this.cyclesLeft = 0;
            this.additionalCycles = 0;
            this.isHalted = false;

            this.irqWanted = false;
            this.nmiWanted = false;
            this.brkWanted = false;
        }

        /**
         * Registers all SPC700 instructions onto the CPU's opcode table.
         */
        registerOpcodes() {
            Spc700Instructions.register(this, this.opcodeTable);
        }

        /**
         * Executes a single SPC700 instruction cycle.
         * @returns {number} Cycles consumed by the instruction.
         */
        executeOne() {
            if (this.isHalted) {
                this.cyclesLeft = 1;
                return 1;
            }

            // Handle Interrupt vectors (represented as fake opcodes)
            if (this.nmiWanted) {
                this.pushWord(this.registers.pc);
                this.registers.pc = 0xFFFE;
                this.brkWanted = false;
                this.irqWanted = false;
                this.nmiWanted = false;
                this.cyclesLeft = 7;
                return this.cyclesLeft;
            }

            this.additionalCycles = 0;

            // Fetch standard opcode
            const opcode = this.mem.read(this.registers.pc++, true);
            const instruction = this.opcodeTable[opcode];

            if (instruction) {
                const handler = instruction[0];
                const baseCycles = instruction[2];
                const operandSize = instruction[3];

                let op1 = 0, op2 = 0;
                if (operandSize === 1) {
                    op1 = this.mem.read(this.registers.pc++, true);
                } else if (operandSize === 2) {
                    op1 = this.mem.read(this.registers.pc++, true);
                    op2 = this.mem.read(this.registers.pc++, true);
                    op1 |= (op2 << 8);
                }

                handler(op1, op2, opcode);
                this.cyclesLeft = baseCycles + this.additionalCycles;
            } else {
                this.cyclesLeft = 1; // NOP fallback for unmapped codes
            }

            return this.cyclesLeft;
        }

        // Helper stack controls
        pushByte(value) {
            this.mem.write(0x0100 | (this.registers.sp & 0xFF), value & 0xFF);
            this.registers.sp = (this.registers.sp - 1) & 0xFF;
        }

        popByte() {
            this.registers.sp = (this.registers.sp + 1) & 0xFF;
            return this.mem.read(0x0100 | (this.registers.sp & 0xFF));
        }

        pushWord(value) {
            this.pushByte((value >> 8) & 0xFF);
            this.pushByte(value & 0xFF);
        }

        popWord() {
            const low = this.popByte();
            const high = this.popByte();
            return (high << 8) | low;
        }

        step(cpuCycles) {
            // Run APU cycle synchronized to main master clock ratios
            const apuCycles = Math.floor(cpuCycles / 32); 
            if (apuCycles > 0) {
                for (let i = 0; i < apuCycles; i++) {
                    this.executeOne();
                }
            }
        }
    }

    // Expose class to global namespace safely
    window.Spc700 = Spc700;
}