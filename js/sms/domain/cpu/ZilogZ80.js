/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Zilog Z80 CPU Core Orchestrator
 * 
 * Coordinates the CPU emulation loop, processes interrupts (INT/NMI), and executes 
 * instructions. Opcode strategy mapping is decoupled into functional registries 
 * populated at boot time to satisfy SOLID principles.
 */

class ZilogZ80 {
    /**
     * @param {SegaMasterSystemBus} mmu - The unified system memory bus.
     */
    constructor(mmu) {
        this.clockRate = 3579545; // Standard SMS NTSC Master Clock rating (3.58 MHz)
        this.theMMU = mmu;

        // Domain State Delegation (SOLID: SRP)
        this.registers = new Z80Registers();
        this.shadowRegisters = this.registers.shadow; 
        this.alu = new Z80Alu();

        // Processor control signals
        this.maskableInterruptsEnabled = false;
        this.maskableInterruptWaiting = false;        
        this.NMIWaiting = false;        
        this.interruptMode = 0;
        this.isHalted = false;
        this.m_bAfterEI = false;

        this.totCycles = 0;
        this.additionalCycles = 0;

        // Initialize segmented instruction decoding tables (256 slots per map)
        this.unprefixedOpcodes = new Array(256).fill(undefined);
        this.prefixcbOpcodes = new Array(256).fill(undefined);
        this.prefixedOpcodes = new Array(256).fill(undefined);    // ED prefixed operations
        this.prefixddOpcodes = new Array(256).fill(undefined);    // IX indexed operations
        this.prefixfdOpcodes = new Array(256).fill(undefined);    // IY indexed operations
        this.prefixddcbOpcodes = new Array(256).fill(undefined);  // IX displaced bitwise operations
        this.prefixfdcbOpcodes = new Array(256).fill(undefined);  // IY displaced bitwise operations

        // Wrap mapped lists inside a unified strategy configuration dictionary
        const opcodeRegistry = {
            standard:  this.unprefixedOpcodes,
            bitwise:   this.prefixcbOpcodes,
            extended:  this.prefixedOpcodes,
            indexedIX: this.prefixddOpcodes,
            indexedIY: this.prefixfdOpcodes,
            bitwiseIX: this.prefixddcbOpcodes,
            bitwiseIY: this.prefixfdcbOpcodes
        };

        // Populate instruction mappings via functional domain classes (SOLID: OCP / DIP)
        Z80DataTransfer.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Arithmetic.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Bitwise.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ShiftRotate.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ProgramFlow.register(this, this.registers, this.alu, opcodeRegistry);
        Z80BlockOps.register(this, this.registers, this.alu, opcodeRegistry);
        Z80SystemIO.register(this, this.registers, this.alu, opcodeRegistry);

        this.logMappingDiagnostics();
    }

    /**
     * Diagnostic logging routine to verify execution tables coverage.
     */
    logMappingDiagnostics() {
        const count = (arr) => arr.filter(slot => slot !== undefined).length;

        const total = count(this.unprefixedOpcodes) +
                      count(this.prefixedOpcodes) +
                      count(this.prefixcbOpcodes) +
                      count(this.prefixfdOpcodes) +
                      count(this.prefixddOpcodes) +
                      count(this.prefixddcbOpcodes) +
                      count(this.prefixfdcbOpcodes);

        console.log(`ZilogZ80::Decoder tables initialized. Mapping coverage: ${total} opcodes active.`);
    }

    /**
     * Converts current Flag state bits into a readable binary string.
     * @returns {string} 8-character flag register string representation.
     */
    getFlags() {
        let binaryString = "";
        for (let i = 0; i < 8; i++) {
            binaryString += (this.registers.f & (1 << (7 - i))) !== 0 ? "1" : "0";
        }
        return binaryString;
    }

    /**
     * Signals a pending Maskable Interrupt (INT) request line.
     */
    raiseMaskableInterrupt() {
        if (this.maskableInterruptsEnabled) {
            this.maskableInterruptWaiting = true;
        }
    }

    /**
     * Signals a Non-Maskable Interrupt (NMI) request line (Pause Button interactions).
     */
    raiseNMI() {
        this.NMIWaiting = true;
    }

    /**
     * Increments the Program Counter (PC), wrapping cleanly to 16-bits.
     * @param {number} offset - Value to increment by.
     */
    incPc(offset) { 
        this.registers.pc = (this.registers.pc + offset) & 0xffff; 
    }

    /**
     * Resolves PC displacement branches based on an 8-bit signed integer.
     * @param {number} signedOffset - 8-bit offset value.
     */
    jumpRel(signedOffset) {
        if ((signedOffset & 0x80) === 0x80) {
            this.registers.pc += -0x80 + (signedOffset & 0x7F);
        } else {
            this.registers.pc += signedOffset;
        }
        this.registers.pc &= 0xffff;
    }

    /**
     * Pops a 16-bit word from the system stack.
     * @returns {number} 16-bit word.
     */
    popWord() {
        const word = this.theMMU.readAddr16bit(this.registers.sp);
        this.registers.sp = (this.registers.sp + 2) & 0xffff;
        return word;
    }

    /**
     * Pushes a 16-bit word onto the system stack.
     * @param {number} word - 16-bit word value.
     */
    pushWord(word) {
        this.registers.sp = (this.registers.sp - 2) & 0xffff;
        this.theMMU.writeAddr16bit(this.registers.sp, word);
    }

    // ========================================================================
    // CORE FETCH-DECODE-EXECUTE PROCESSOR LOOP
    // ========================================================================

    /**
     * Performs a single fetch-decode-execute instruction cycle.
     * Evaluates hardware signals and routes operations to their respective prefixes.
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
        
        // 4. Decode Prefix Trees
        if (b1 === 0xcb) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixcbOpcodes[b2];
            if (instrCode === undefined) {
                console.error(`ZilogZ80::Unhandled CB opcode: 0x${b2.toString(16)}`);
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }
        else if (b1 === 0xed) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixedOpcodes[b2];
            if (instrCode === undefined) {
                console.error(`ZilogZ80::Unhandled ED opcode: 0x${b2.toString(16)}`);
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
                    console.error(`ZilogZ80::Unhandled DDCB opcode: 0x${b4.toString(16)}`);
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixddOpcodes[b2];
                if (instrCode === undefined) {
                    console.error(`ZilogZ80::Unhandled DD opcode: 0x${b2.toString(16)}`);
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
                    console.error(`ZilogZ80::Unhandled FDCB opcode: 0x${b4.toString(16)}`);
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixfdOpcodes[b2];
                if (instrCode === undefined) {
                    console.error(`ZilogZ80::Unhandled FD opcode: 0x${b2.toString(16)}`);
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
                console.error(`ZilogZ80::Unhandled standard opcode: 0x${b1.toString(16)} at PC: 0x${this.registers.pc.toString(16)}`);
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