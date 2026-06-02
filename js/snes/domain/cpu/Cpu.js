/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Orchestrator
 * 
 * Coordinates the CPU execution pipeline, handles interrupts (Abort, NMI, IRQ),
 * manages register states, and dispatches instruction executions via a
 * modular, registered opcode table.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses strictly on CPU execution cycles,
 *   interrupt lines check, and memory-stack pushes/pulls.
 */

{
    // Block-Scoped Addressing Mode Index Mappings (Prevents global window pollution)
    const IMP = 0, IMM = 1, IMMm = 2, IMMx = 3, IMMl = 4, DP = 5, DPX = 6, DPY = 7,
          IDP = 8, IDX = 9, IDY = 10, IDYr = 11, IDL = 12, ILY = 13, SR = 14, ISY = 15,
          ABS = 16, ABX = 17, ABXr = 18, ABY = 19, ABYr = 20, ABL = 21, ALX = 22,
          IND = 23, IAX = 24, IAL = 25, REL = 26, RLL = 27, BM = 28;

    class Cpu {
        /**
         * @param {Object} bus - The 24-bit physical system memory bus.
         */
        constructor(bus) {
            this.bus = bus;

            this.registers = new CpuRegisters();
            this.cyclesLeft = 0;
            this.cpuMemOps = 0;

            this.irqWanted = false;
            this.nmiWanted = false;
            this.aboWanted = false;

            this.stopped = false;
            this.waiting = false;

            // Native 65816 Opcode Addressing Modes Table
            this.modes = [
                IMP, IDX, IMM, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, DP , DPX, DPX, ILY, IMP, ABYr,IMP, IMP, ABS, ABXr,ABX, ALX,
                ABS, IDX, ABL, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, DPX, DPX, DPX, ILY, IMP, ABYr,IMP, IMP, ABXr,ABXr,ABX, ALX,
                IMP, IDX, IMM, SR , BM , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, BM , DPX, DPX, ILY, IMP, ABYr,IMP, IMP, ABL, ABXr,ABX, ALX,
                IMP, IDX, RLL, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, IND, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, DPX, DPX, DPX, ILY, IMP, ABYr,IMP, IMP, IAX, ABXr,ABX, ALX,
                REL, IDX, RLL, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDY, IDP, ISY, DPX, DPX, DPY, ILY, IMP, ABY, IMP, IMP, ABS, ABX, ABX, ALX,
                IMMx,IDX, IMMx,SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, DPX, DPX, DPY, ILY, IMP, ABYr,IMP, IMP, ABXr,ABXr,ABYr,ALX,
                IMMx,IDX, IMM, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, DP , DPX, DPX, ILY, IMP, ABYr,IMP, IMP, IAL, ABXr,ABX, ALX,
                IMMx,IDX, IMM, SR , DP , DP , DP , IDL, IMP, IMMm,IMP, IMP, ABS, ABS, ABS, ABL,
                REL, IDYr,IDP, ISY, IMMl,DPX, DPX, ILY, IMP, ABYr,IMP, IMP, IAX, ABXr,ABX, ALX,
                IMP, IMP, IMP // Fake interrupts
            ];

            // Native 65816 Opcode T-States Clocks Table
            this.cycles = [
                7, 6, 7, 4, 5, 3, 5, 6, 3, 2, 2, 4, 6, 4, 6, 5,
                2, 5, 5, 7, 5, 4, 6, 6, 2, 4, 2, 2, 6, 4, 7, 5,
                6, 6, 8, 4, 3, 3, 5, 6, 4, 2, 2, 5, 4, 4, 6, 5,
                2, 5, 5, 7, 4, 4, 6, 6, 2, 4, 2, 2, 4, 4, 7, 5,
                6, 6, 2, 4, 7, 3, 5, 6, 3, 2, 2, 3, 3, 4, 6, 5,
                2, 5, 5, 7, 7, 4, 6, 6, 2, 4, 3, 2, 4, 4, 7, 5,
                6, 6, 6, 4, 3, 3, 5, 6, 4, 2, 2, 6, 5, 4, 6, 5,
                2, 5, 5, 7, 4, 4, 6, 6, 2, 4, 4, 2, 6, 4, 7, 5,
                3, 6, 4, 4, 3, 3, 3, 6, 2, 2, 2, 3, 4, 4, 4, 5,
                2, 6, 5, 7, 4, 4, 4, 6, 2, 5, 2, 2, 4, 5, 5, 5,
                2, 6, 2, 4, 3, 3, 3, 6, 2, 2, 2, 4, 4, 4, 4, 5,
                2, 5, 5, 7, 4, 4, 4, 6, 2, 4, 2, 2, 4, 4, 4, 5,
                2, 6, 3, 4, 3, 3, 5, 6, 2, 2, 2, 3, 4, 4, 6, 5,
                2, 5, 5, 7, 6, 4, 6, 6, 2, 4, 3, 3, 6, 4, 7, 5,
                2, 6, 3, 4, 3, 3, 5, 6, 2, 2, 2, 3, 4, 4, 6, 5,
                2, 5, 5, 7, 5, 4, 6, 6, 2, 4, 4, 2, 8, 4, 7, 5,
                7, 7, 7 // Fake interrupts
            ];

            this.opcodeTable = new Array(259).fill(null);
        }

        reset() {
            this.registers.reset();
            this.cyclesLeft = 5 * 8 + 12;
            this.cpuMemOps = 0;

            this.irqWanted = false;
            this.nmiWanted = false;
            this.aboWanted = false;

            this.stopped = false;
            this.waiting = false;

            if (this.bus) {
                const low = this.bus.read(0xFFFC, true);
                const high = this.bus.read(0xFFFD, true);
                this.registers.pc = (high << 8) | low;
            }
        }

        registerInstructionSet(registrationCallback) {
            if (typeof registrationCallback === 'function') {
                registrationCallback(this, this.opcodeTable);
            }
        }

        cycle() {
            if (this.cyclesLeft === 0) {
                if (this.stopped) {
                    this.cyclesLeft = 1;
                } else if (!this.waiting) {
                    this.cpuMemOps = 0;

                    // Fetch the 8-bit instruction opcode. Standard memory access timing applies automatically
                    let instr = this.bus.read((this.registers.pb << 16) | this.registers.pc++);
                    
                    // Hardware interrupt vector overrides
                    if ((this.irqWanted && !this.registers.i) || this.nmiWanted || this.aboWanted) {
                        this.registers.pc--;

                        if (this.aboWanted) {
                            this.aboWanted = false;
                            instr = 0x100;
                        } else if (this.nmiWanted) {
                            this.nmiWanted = false;
                            instr = 0x101;
                        } else {
                            instr = 0x102;
                        }
                    }

                    // Resolve Addressing Mode globally before execution to simplify code
                    this.cyclesLeft = this.cycles[instr];
                    const mode = this.modes[instr];
                    const [adr, adrh] = CpuAddressing.resolve(this, this.registers, this.bus, mode);

                    const executor = this.opcodeTable[instr];
                    if (executor) {
                        executor(adr, adrh, instr); // Dispatch directly passing resolved addresses
                    } else {
                        console.error(`Cpu::Fatal: Unimplemented SNES instruction opcode: 0x${instr.toString(16).toUpperCase()} at PC: 0x${this.registers.pc.toString(16).toUpperCase()}`);
                    }

                } else {
                    if (this.aboWanted || this.irqWanted || this.nmiWanted) {
                        this.waiting = false;
                    }
                    this.cyclesLeft = 1;
                }
            }
            this.cyclesLeft--;
        }

        pushByte(value) {
            if (this.registers.e) {
                this.bus.write((this.registers.sp & 0xFF) | 0x0100, value & 0xFF);
            } else {
                this.bus.write(this.registers.sp, value & 0xFF);
            }
            this.registers.sp--;
        }

        pullByte() {
            this.registers.sp++;
            if (this.registers.e) {
                return this.bus.read((this.registers.sp & 0xFF) | 0x0100);
            }
            return this.bus.read(this.registers.sp);
        }

        pushWord(value) {
            this.pushByte((value & 0xFF00) >> 8);
            this.pushByte(value & 0xFF);
        }

        pullWord() {
            const low = this.pullByte();
            const high = this.pullByte();
            return (high << 8) | low;
        }

        exportState() {
            return {
                registers: this.registers.exportState(),
                cyclesLeft: this.cyclesLeft,
                cpuMemOps: this.cpuMemOps,
                irqWanted: this.irqWanted,
                nmiWanted: this.nmiWanted,
                aboWanted: this.aboWanted,
                stopped: this.stopped,
                waiting: this.waiting
            };
        }

        importState(state) {
            this.registers.importState(state.registers);
            this.cyclesLeft = state.cyclesLeft;
            this.cpuMemOps = state.cpuMemOps;
            this.irqWanted = !!state.irqWanted;
            this.nmiWanted = !!state.nmiWanted;
            this.aboWanted = !!state.aboWanted;
            this.stopped = !!state.stopped;
            this.waiting = !!state.waiting;
        }
    }

    // Expose class to global namespace safely
    window.Cpu = Cpu;
}