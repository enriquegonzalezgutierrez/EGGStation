/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 CPU Orchestrator
 * 
 * Coordinates the CPU emulation loop. It encapsulates execution state and 
 * delegates instruction mapping to dedicated functional registries, feeding them
 * with a clean, unified 'opcodeRegistry' object (SOLID: DIP / Clean Code: No Long Parameter Lists).
 */

class z80cpu {
    constructor(theMMU) {
        this.clockRate = 3579545;
        this.theMMU = theMMU;

        // Domain State delegation (SOLID: SRP)
        this.registers = new Z80Registers();
        this.shadowRegisters = this.registers.shadow; 
        this.alu = new Z80Alu();

        // Control signals
        this.maskableInterruptsEnabled = false;
        this.maskableInterruptWaiting = false;        
        this.NMIWaiting = false;        
        this.interruptMode = 0;
        this.isHalted = false;
        this.m_bAfterEI = false;

        this.totCycles = 0;
        this.additionalCycles = 0;

        // Initialize empty instruction lookup arrays (256 slots per prefix)
        this.unprefixedOpcodes = new Array(256).fill(undefined);
        this.prefixcbOpcodes = new Array(256).fill(undefined);
        this.prefixedOpcodes = new Array(256).fill(undefined); // ED table
        this.prefixddOpcodes = new Array(256).fill(undefined);
        this.prefixfdOpcodes = new Array(256).fill(undefined);
        this.prefixddcbOpcodes = new Array(256).fill(undefined);
        this.prefixfdcbOpcodes = new Array(256).fill(undefined);

        // Define a clean, semantic Domain Registry to avoid Long Parameter Lists
        const opcodeRegistry = {
            standard:  this.unprefixedOpcodes,   // Standard 8/16-bit instructions (Unprefixed)
            bitwise:   this.prefixcbOpcodes,     // Bitwise & shift instructions (CB Prefix)
            extended:  this.prefixedOpcodes,     // Extended system & block instructions (ED Prefix)
            indexedIX: this.prefixddOpcodes,     // Index Register IX base instructions (DD Prefix)
            indexedIY: this.prefixfdOpcodes,     // Index Register IY base instructions (FD Prefix)
            bitwiseIX: this.prefixddcbOpcodes,   // Indexed IX bitwise instructions (DDCB double prefix)
            bitwiseIY: this.prefixfdcbOpcodes    // Indexed IY bitwise instructions (FDCB double prefix)
        };

        // Populate instruction maps via Functional Domain Registries (OCP / DIP)
        Z80DataTransfer.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Arithmetic.register(this, this.registers, this.alu, opcodeRegistry);
        Z80Bitwise.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ShiftRotate.register(this, this.registers, this.alu, opcodeRegistry);
        Z80ProgramFlow.register(this, this.registers, this.alu, opcodeRegistry);
        Z80BlockOps.register(this, this.registers, this.alu, opcodeRegistry);
        Z80SystemIO.register(this, this.registers, this.alu, opcodeRegistry);

        // Compute diagnostics
        const unprefOpcodesCount = this.countOpcodes(this.unprefixedOpcodes);
        const edOpcodesCount = this.countOpcodes(this.prefixedOpcodes);
        const cbOpcodesCount = this.countOpcodes(this.prefixcbOpcodes);
        const fdOpcodesCount = this.countOpcodes(this.prefixfdOpcodes);
        const fdcbOpcodesCount = this.countOpcodes(this.prefixfdcbOpcodes);
        const ddOpcodesCount = this.countOpcodes(this.prefixddOpcodes);
        const ddcbOpcodesCount = this.countOpcodes(this.prefixddcbOpcodes);
        const totalOpcodes = unprefOpcodesCount + edOpcodesCount + cbOpcodesCount + fdOpcodesCount + ddOpcodesCount + ddcbOpcodesCount + fdcbOpcodesCount;

        console.log("CPU::Inited (Refactored)");
        console.log("CPU:: opcodes: Unpref: " + unprefOpcodesCount +
                    " - ED: " + edOpcodesCount +
                    " - CB: " + cbOpcodesCount +
                    " - FD: " + fdOpcodesCount +
                    " - DD: " + ddOpcodesCount +
                    " - DDCB: " + ddcbOpcodesCount +
                    " - FDCB: " + fdcbOpcodesCount +
                    " - total opcodes: " + totalOpcodes
                    );
    }

    countOpcodes(arr) {
        let cnt = 0;
        for (let o = 0; o < arr.length; o++) {
            if (arr[o] !== undefined) {
                cnt++;
            }
        }
        return cnt;
    }

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

    raiseMaskableInterrupt() {
        if (this.maskableInterruptsEnabled) {
            this.maskableInterruptWaiting = true;
        }
    }

    raiseNMI() {
        this.NMIWaiting = true;
    }

    incPc(n) { 
        this.registers.pc += n; 
        this.registers.pc &= 0xffff; 
    }

    jumpRel(n) {
        if ((n & 0x80) === 0x80) {
            this.registers.pc += -0x80 + (n & 0x7F);
        } else {
            this.registers.pc += n;
        }
        this.registers.pc &= 0xffff;
    }

    popWord() {
        const word = this.theMMU.readAddr16bit(this.registers.sp);
        this.registers.sp += 2;
        this.registers.sp &= 0xffff;
        return word;
    }

    pushWord(word) {
        this.registers.sp -= 2;
        this.registers.sp &= 0xffff;
        this.theMMU.writeAddr16bit(this.registers.sp, word);
    }

    // ------------------------------------------------------------------------
    // CORE FETCH-DECODE-EXECUTE LOOP
    // ------------------------------------------------------------------------

    executeOne() {
        let elapsedCycles = 0;
        this.additionalCycles = 0;

        if (this.NMIWaiting) {
            if (this.isHalted) this.pushWord(this.registers.pc + 1);
            else this.pushWord(this.registers.pc);
            this.registers.pc = 0x0066;

            this.registers.iff1 = 0;
            this.isHalted = false;
            this.NMIWaiting = false;

            elapsedCycles += 11;
        }
        else if ((this.registers.iff1 !== 0) && (this.maskableInterruptWaiting) && (!this.m_bAfterEI)) {
            if (this.isHalted) this.pushWord(this.registers.pc + 1);
            else this.pushWord(this.registers.pc);
            this.registers.pc = 0x0038;

            this.registers.iff1 = 0;
            this.registers.iff2 = 0;

            this.isHalted = false;
            this.maskableInterruptWaiting = false;
            this.maskableInterruptsEnabled = false;

            elapsedCycles += 13;
        }
        else if (this.isHalted) {
            return 4;            
        }

        this.m_bAfterEI = false;

        const b1 = this.theMMU.readAddr(this.registers.pc);
        
        if (b1 === 0xcb) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixcbOpcodes[b2];
            if (instrCode === undefined) {
                console.error("z80CPU::unhandled opcode cb " + b2.toString(16));
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }
        else if (b1 === 0xed) {
            const b2 = this.theMMU.readAddr(this.registers.pc + 1);
            const instrCode = this.prefixedOpcodes[b2];
            if (instrCode === undefined) {
                alert("z80CPU::unhandled opcode " + b1.toString(16) + b2.toString(16));
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
                    alert("z80CPU::unhandled opcode 0xddcb xx " + b4.toString(16) + " at PC:" + this.registers.pc.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixddOpcodes[b2];
                if (instrCode === undefined) {
                    alert("z80CPU::unhandled opcode " + b1.toString(16) + b2.toString(16));
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
                    alert("z80CPU::unhandled opcode 0xfdcb xx " + b4.toString(16) + " at PC:" + this.registers.pc.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            } else {
                const instrCode = this.prefixfdOpcodes[b2];
                if (instrCode === undefined) {
                    alert("z80CPU::unhandled opcode " + b1.toString(16) + b2.toString(16));
                } else {
                    instrCode[0]();
                    elapsedCycles = instrCode[2];
                }
            }
        }
        else {
            const instrCode = this.unprefixedOpcodes[b1];
            if (instrCode === undefined) {
                console.error("z80CPU::unhandled opcode " + b1.toString(16) + " at PC:" + this.registers.pc.toString(16));
            } else {
                instrCode[0]();
                elapsedCycles = instrCode[2];
            }
        }

        elapsedCycles += this.additionalCycles;
        this.totCycles += elapsedCycles;
        return elapsedCycles;
    }

    // ------------------------------------------------------------------------
    // DEBUGGER AND GRAPHICAL DECODER (Preserves original UI functionality)
    // ------------------------------------------------------------------------

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