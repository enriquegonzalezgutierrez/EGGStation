/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega Genesis Custom Z80 Sound Processor Core
 * 
 * Extends the unified, shared Z80 CPU core to implement hardware-level 
 * index-register prefix-skipping behaviors required by Genesis sound drivers 
 * (GEMS, SMPS, etc.), keeping the Master System emulator core entirely untouched.
 * 
 * Aligned with standard Z80 silicon behavior to resolve:
 * 1. Double Prefix Skipping: If consecutive index prefixes (e.g. 0xDD 0xDD or 0xFD 0xFD) 
 *    or unsupported index instructions are encountered, the redundant prefix is safely 
 *    treated as a 4-cycle NOP (PC is advanced by 1) instead of halting execution.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates Sega Genesis sound driver CPU 
 *   execution anomalies from the standard, clean SMS Z80 execution pipeline.
 * - Open/Closed Principle (OCP): Dynamically extends standard Z80 instruction decoding 
 *   using class inheritance, avoiding modifying verified domain structures in-place.
 */

class GenesisZ80 extends ZilogZ80 {
    /**
     * @param {GenesisBusZ80} mmu - Secondary Genesis Z80 Memory Bus.
     */
    constructor(mmu) {
        super(mmu);
    }

    /**
     * Performs a single fetch-decode-execute instruction cycle.
     * Evaluates hardware signals and routes operations to their respective prefixes.
     * Overridden to add standard Z80 ISA prefix-skipping fallbacks for Sega sound drivers.
     * @returns {number} The exact number of T-states (cycles) consumed.
     */
    executeOne() {
        let elapsedCycles = 0;
        this.additionalCycles = 0;

        // 1. Process Pending Non-Maskable Interrupts
        if (this.NMIWaiting) {
            this.pushWord(this.isHalted ? this.registers.pc + 1 : this.registers.pc);
            this.registers.pc = 0x0066; // Standard NMI vector jump destination

            this.registers.iff1 = 0;
            this.isHalted = false;
            this.NMIWaiting = false;

            elapsedCycles += 11;
        }
        // 2. Process Pending Maskable Interrupts
        else if (this.registers.iff1 !== 0 && this.maskableInterruptWaiting && !this.m_bAfterEI) {
            this.pushWord(this.isHalted ? this.registers.pc + 1 : this.registers.pc);
            this.registers.pc = 0x0038; // Mode 1 Interrupt vector jump destination

            this.registers.iff1 = 0;
            this.registers.iff2 = 0;

            this.isHalted = false;
            this.maskableInterruptWaiting = false;
            this.maskableInterruptsEnabled = false;

            elapsedCycles += 13;
        }
        // 3. Process Halted State Idle Loops
        else if (this.isHalted) {
            return 4; // Flat idle execution cycles consumption           
        }

        this.m_bAfterEI = false;

        // Fetch primary opcode byte
        const b1 = this.theMMU.readAddr(this.registers.pc);
        
        // 4. Decode Prefix Trees (With standard skip fallbacks)
        if (b1 === 0xcb) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixcbOpcodes[b2];
            if (instrCode === undefined) {
                // If a CB instruction is unhandled, skip the prefix cleanly
                this.incPc(1);
                elapsedCycles = 4;
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }
        else if (b1 === 0xed) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixedOpcodes[b2];
            if (instrCode === undefined) {
                // Unhandled extended instruction prefix acts like a NOP
                this.incPc(1);
                elapsedCycles = 4;
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }
        else if (b1 === 0xdd) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            if (b2 === 0xcb) {
                const b4 = this.theMMU.readAddr(this.registers.pc + 3);
                const instrCode = this.prefixddcbOpcodes[b4];
                if (instrCode === undefined) {
                    this.incPc(1);
                    elapsedCycles = 4;
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixddOpcodes[b2];
                if (instrCode === undefined) {
                    // Double prefix or unhandled instruction: skip 1st prefix (4 T-states, PC + 1)
                    this.incPc(1);
                    elapsedCycles = 4;
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            }
        }
        else if (b1 === 0xfd) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            if (b2 === 0xcb) {
                const b4 = this.theMMU.readAddr(this.registers.pc + 3);
                const instrCode = this.prefixfdcbOpcodes[b4];
                if (instrCode === undefined) {
                    this.incPc(1);
                    elapsedCycles = 4;
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixfdOpcodes[b2];
                if (instrCode === undefined) {
                    // Double prefix or unhandled instruction: skip 1st prefix (4 T-states, PC + 1)
                    this.incPc(1);
                    elapsedCycles = 4;
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            }
        }
        // 5. Decode Unprefixed Core Opcode
        else {
            const instrCode = this.unprefixedOpcodes[b1];
            if (instrCode === undefined) {
                console.error(`GenesisZ80::Unhandled standard opcode: 0x${b1.toString(16)} at PC: 0x${this.registers.pc.toString(16)}`);
                this.incPc(1);
                elapsedCycles = 4;
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }

        elapsedCycles += this.additionalCycles;
        this.totCycles += elapsedCycles;
        return elapsedCycles;
    }
}