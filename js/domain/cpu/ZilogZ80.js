/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Zilog Z80 CPU Orchestrator
 * 
 * Coordinates the CPU emulation loop. It encapsulates execution state and 
 * delegates instruction mapping to dedicated functional registries, feeding them
 * with a clean, unified 'opcodeRegistry' object (SOLID: DIP / Clean Code: No Long Parameter Lists).
 */

class ZilogZ80 {
    /**
     * @param {SegaMasterSystemBus} mmu - The virtual address decoding system bus.
     */
    constructor(mmu) {
        this.clockRate = 3579545; // 3.58 MHz standard Master System CPU clock rate
        this.theMMU = mmu;

        // Core domain state delegations (SOLID: SRP)
        this.registers = new Z80Registers();
        this.shadowRegisters = this.registers.shadow; 
        this.alu = new Z80Alu();

        // CPU internal control signals
        this.maskableInterruptsEnabled = false;
        this.maskableInterruptWaiting = false;        
        this.NMIWaiting = false;        
        this.interruptMode = 0;
        this.isHalted = false;
        this.m_bAfterEI = false;

        this.totCycles = 0;
        this.additionalCycles = 0;

        // Initialize prefixes and maps (256 instruction registers per prefix array)
        this.unprefixedOpcodes = new Array(256).fill(undefined);
        this.prefixcbOpcodes = new Array(256).fill(undefined);
        this.prefixedOpcodes = new Array(256).fill(undefined); // ED Prefix table
        this.prefixddOpcodes = new Array(256).fill(undefined);
        this.prefixfdOpcodes = new Array(256).fill(undefined);
        this.prefixddcbOpcodes = new Array(256).fill(undefined);
        this.prefixfdcbOpcodes = new Array(256).fill(undefined);

        // Map registration slots to functional registries
        const opcodeRegistry = {
            standard:  this.unprefixedOpcodes,   // Standard instructions (Unprefixed)
            bitwise:   this.prefixcbOpcodes,     // Bitwise & shifts (CB Prefix)
            extended:  this.prefixedOpcodes,     // System & block instructions (ED Prefix)
            indexedIX: this.prefixddOpcodes,     // Index IX operations (DD Prefix)
            indexedIY: this.prefixfdOpcodes,     // Index IY operations (FD Prefix)
            bitwiseIX: this.prefixddcbOpcodes,   // Indexed IX bitwise ops (DDCB Prefix)
            bitwiseIY: this.prefixfdcbOpcodes    // Indexed IY bitwise ops (FDCB Prefix)
        };

        // Populate instruction maps via Functional Domain Registries (OCP / DIP)
        Z80DataTransfer.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Arithmetic.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Bitwise.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ShiftRotate.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ProgramFlow.register(this, this.registers, this.alu, opcodeRegistry);
        Z80BlockOps.register(this, this.registers, this.alu, opcodeRegistry);
        Z80SystemIO.register(this, this.registers, this.alu, opcodeRegistry);

        // Log diagnostics details
        const unprefOpcodesCount = this.countOpcodes(this.unprefixedOpcodes);
        const edOpcodesCount = this.countOpcodes(this.prefixedOpcodes);
        const cbOpcodesCount = this.countOpcodes(this.prefixcbOpcodes);
        const fdOpcodesCount = this.countOpcodes(this.prefixfdOpcodes);
        const fdcbOpcodesCount = this.countOpcodes(this.prefixfdcbOpcodes);
        const ddOpcodesCount = this.countOpcodes(this.prefixddOpcodes);
        const ddcbOpcodesCount = this.countOpcodes(this.prefixddcbOpcodes);
        const totalOpcodes = unprefOpcodesCount + edOpcodesCount + cbOpcodesCount + fdOpcodesCount + ddOpcodesCount + ddcbOpcodesCount + fdcbOpcodesCount;

        console.log("CPU::Inited (Refactored)");
        console.log("CPU:: Opcodes Table Mapping Summary:" +
                    "\n - Standard: " + unprefOpcodesCount +
                    "\n - Extended (ED): " + edOpcodesCount +
                    "\n - Bitwise (CB): " + cbOpcodesCount +
                    "\n - Indexed IY (FD): " + fdOpcodesCount +
                    "\n - Indexed IX (DD): " + ddOpcodesCount +
                    "\n - Indexed IX Bitwise (DDCB): " + ddcbOpcodesCount +
                    "\n - Indexed IY Bitwise (FDCB): " + fdcbOpcodesCount +
                    "\n - Total Compiled Instructions: " + totalOpcodes
                    );
    }

    /**
     * Diagnostic helper to count initialized array slots.
     */
    countOpcodes(arr) {
        let cnt = 0;
        for (let o = 0; o < arr.length; o++) {
            if (arr[o] !== undefined) {
                cnt++;
            }
        }
        return cnt;
    }

    /**
     * Converts flag registers to a binary string representation for display.
     */
    getFlags() {
        let s = "";
        for (let b = 0; b < 8; b++) {
            if ((this.registers.f & (1 << (7 - b))) !== 0) {
                s += "1";
            } else {
                s += "0";
            }
        }
        return s;
    }

    /**
     * Raises maskable interrupt (INT) line if enabled.
     */
    raiseMaskableInterrupt() {
        if (this.maskableInterruptsEnabled) {
            this.maskableInterruptWaiting = true;
        }
    }

    /**
     * Raises non-maskable interrupt (NMI) line (triggers on SMS Pause Button).
     */
    raiseNMI() {
        this.NMIWaiting = true;
    }

    /**
     * Increments the Program Counter (PC), wrapping cleanly to 16-bits.
     */
    incPc(n) { 
        this.registers.pc += n; 
        this.registers.pc &= 0xffff; 
    }

    /**
     * Performs a relative jump based on an 8-bit signed offset.
     */
    jumpRel(n) {
        if ((n & 0x80) === 0x80) {
            this.registers.pc += -0x80 + (n & 0x7F);
        } else {
            this.registers.pc += n;
        }
        this.registers.pc &= 0xffff;
    }

    /**
     * Pops a 16-bit word from the system stack.
     */
    popWord() {
        const word = this.theMMU.readAddr16bit(this.registers.sp);
        this.registers.sp += 2;
        this.registers.sp &= 0xffff;
        return word;
    }

    /**
     * Pushes a 16-bit word onto the system stack.
     */
    pushWord(word) {
        this.registers.sp -= 2;
        this.registers.sp &= 0xffff;
        this.theMMU.writeAddr16bit(this.registers.sp, word);
    }

    // ========================================================================
    // CORE FETCH-DECODE-EXECUTE LOOP
    // ========================================================================

    /**
     * Executes a single instruction cycle, resolving prefix states and interrupts.
     * @returns {number} T-states elapsed.
     */
    executeOne() {
        let elapsedCycles = 0;
        this.additionalCycles = 0;

        if (this.NMIWaiting) {
            if (this.isHalted) {
                this.pushWord(this.registers.pc + 1);
            } else {
                this.pushWord(this.registers.pc);
            }
            this.registers.pc = 0x0066; // NMI vector jump destination

            this.registers.iff1 = 0;
            this.isHalted = false;
            this.NMIWaiting = false;

            elapsedCycles += 11;
        }
        else if ((this.registers.iff1 !== 0) && (this.maskableInterruptWaiting) && (!this.m_bAfterEI)) {
            if (this.isHalted) {
                this.pushWord(this.registers.pc + 1);
            } else {
                this.pushWord(this.registers.pc);
            }
            this.registers.pc = 0x0038; // Maskable Interrupt (IM 1) vector destination

            this.registers.iff1 = 0;
            this.registers.iff2 = 0;

            this.isHalted = false;
            this.maskableInterruptWaiting = false;
            this.maskableInterruptsEnabled = false;

            elapsedCycles += 13;
        }
        else if (this.isHalted) {
            return 4; // Constant halted cycle execution consumption           
        }

        this.m_bAfterEI = false;

        const b1 = this.theMMU.readAddr(this.registers.pc);
        
        if (b1 === 0xcb) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixcbOpcodes[b2];
            if (instrCode === undefined) {
                console.error("ZilogZ80::Unhandled CB opcode: 0x" + b2.toString(16));
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }
        else if (b1 === 0xed) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixedOpcodes[b2];
            if (instrCode === undefined) {
                console.error("ZilogZ80::Unhandled ED opcode: 0x" + b2.toString(16));
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
                    console.error("ZilogZ80::Unhandled DDCB opcode: 0x" + b4.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixddOpcodes[b2];
                if (instrCode === undefined) {
                    console.error("ZilogZ80::Unhandled DD opcode: 0x" + b2.toString(16));
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
                    console.error("ZilogZ80::Unhandled FDCB opcode: 0x" + b4.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixfdOpcodes[b2];
                if (instrCode === undefined) {
                    console.error("ZilogZ80::Unhandled FD opcode: 0x" + b2.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            }
        }
        else {
            const instrCode = this.unprefixedOpcodes[b1];
            if (instrCode === undefined) {
                console.error("ZilogZ80::Unhandled standard opcode: 0x" + b1.toString(16) + " at PC: 0x" + this.registers.pc.toString(16));
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }

        elapsedCycles += this.additionalCycles;
        this.totCycles += elapsedCycles;
        return elapsedCycles;
    }

    // ========================================================================
    // DEBUGGER AND GRAPHICAL DECODER INTERFACES
    // ========================================================================

    getFullDecodedString(instr, bts) {
        let retStr = instr[1];
        if (instr[1].includes("%d")) {
            if (instr[3] === 1) {
                retStr = retStr.replace("%d", "0x" + bts[bts.length - 1].toString(16).padStart(2, '0'));
            } else if (instr[3] === 2) {
                retStr = retStr.replace("%d", "0x" + bts[bts.length - 1].toString(16).padStart(2, '0') + bts[bts.length - 2].toString(16).padStart(2, '0'));
            }
        }
        return retStr;
    }

    debugInstructions(numInstr) {
        const retStruct = [];
        let pc = this.registers.pc;

        for (let i = 0; i < numInstr; i++) {
            const curInstr = {};
            this.debugDecodeOpcode(pc, curInstr);
            retStruct.push(curInstr);
            pc += curInstr.bytes.length;
        }

        return retStruct;
    }

    debugDecodeOpcode(thePC, retStruct) {
        retStruct.bytes = [];
        retStruct.decodedString = "UNK";
        retStruct.address = thePC;

        const b1 = this.theMMU.readAddr(thePC);
        if (b1 === 0xcb) {
            retStruct.bytes.push(0xcb);
            const b2 = this.theMMU.readAddr(thePC + 1);
            retStruct.bytes.push(b2);

            const instrCode = this.prefixcbOpcodes[b2];
            if (instrCode !== undefined) {
                retStruct.decodedString = instrCode[1];
            }
        }
        else if (b1 === 0xed) {
            retStruct.bytes.push(0xed);
            const b2 = this.theMMU.readAddr(thePC + 1);
            retStruct.bytes.push(b2);

            const instrCode = this.prefixedOpcodes[b2];
            if (instrCode !== undefined) {
                retStruct.decodedString = instrCode[1];
            }
        }
        else if (b1 === 0xdd) {
            const b2 = this.theMMU.readAddr(thePC + 1);
            if (b2 === 0xcb) {
                retStruct.bytes.push(0xdd);
                retStruct.bytes.push(0xcb);
                const b3 = this.theMMU.readAddr(thePC + 2);
                retStruct.bytes.push(b3);
                const b4 = this.theMMU.readAddr(thePC + 3);
                retStruct.bytes.push(b4);
    
                const instrCode = this.prefixddcbOpcodes[b4];
                if (instrCode !== undefined) {
                    retStruct.decodedString = instrCode[1];
                }
            } else {
                retStruct.bytes.push(0xdd);
                retStruct.bytes.push(b2);

                const instrCode = this.prefixddOpcodes[b2];
                if (instrCode !== undefined) {
                    for (let ab = 0; ab < instrCode[3]; ab++) {
                        retStruct.bytes.push(this.theMMU.readAddr(thePC + 2 + ab));
                    }
                    retStruct.decodedString = this.getFullDecodedString(instrCode, retStruct.bytes);
                }                  
            }
        }
        else if (b1 === 0xfd) {
            const b2 = this.theMMU.readAddr(thePC + 1);
            if (b2 === 0xcb) {
                retStruct.bytes.push(0xfd);
                retStruct.bytes.push(0xcb);
                const b3 = this.theMMU.readAddr(thePC + 2);
                retStruct.bytes.push(b3);
                const b4 = this.theMMU.readAddr(thePC + 3);
                retStruct.bytes.push(b4);

                const instrCode = this.prefixfdcbOpcodes[b4];
                if (instrCode !== undefined) {
                    retStruct.decodedString = instrCode[1];
                }
            } else {
                retStruct.bytes.push(0xfd);
                retStruct.bytes.push(b2);

                const instrCode = this.prefixfdOpcodes[b2];
                if (instrCode !== undefined) {
                    retStruct.decodedString = instrCode[1];
                }
            }
        }
        else {
            const instrCode = this.unprefixedOpcodes[b1];
            retStruct.bytes.push(b1);
            if (instrCode !== undefined) {
                for (let ab = 0; ab < instrCode[3]; ab++) {
                    retStruct.bytes.push(this.theMMU.readAddr(thePC + 1 + ab));
                }
                retStruct.decodedString = this.getFullDecodedString(instrCode, retStruct.bytes);
            }
        }
    }
}

// Global legacy alias to maintain test execution structures
const z80cpu = ZilogZ80;