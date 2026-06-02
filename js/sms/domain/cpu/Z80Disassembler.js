/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Z80 CPU Disassembler
 * 
 * This class abstracts and encapsulates the disassembly and decoding logic 
 * used exclusively for debugger visual representation. By separating this 
 * from the execution core (ZilogZ80), we preserve the Single Responsibility Principle (SRP).
 */

class Z80Disassembler {
    /**
     * Formats raw instruction templates (e.g. "LD A,%d") with actual memory operands.
     * @param {Object} instruction - Mapped opcode strategy tuple.
     * @param {number[]} bytes - Bytes fetched for this instruction.
     * @returns {string} Formatted assembly string.
     */
    static getFullDecodedString(instruction, bytes) {
        let retStr = instruction[1];
        if (instruction[1].includes("%d")) {
            if (instruction[3] === 1) {
                retStr = retStr.replace("%d", "0x" + bytes[bytes.length - 1].toString(16).padStart(2, '0'));
            } else if (instruction[3] === 2) {
                retStr = retStr.replace("%d", "0x" + bytes[bytes.length - 1].toString(16).padStart(2, '0') + bytes[bytes.length - 2].toString(16).padStart(2, '0'));
            }
        }
        return retStr;
    }

    /**
     * Disassembles a block of instructions starting from the active Program Counter.
     * @param {ZilogZ80} cpu - The CPU Orchestrator.
     * @param {number} numInstructions - Number of instructions to decode.
     * @returns {Object[]} Decoded instructions list.
     */
    static disassembleBlock(cpu, numInstructions) {
        const decodedBlock = [];
        let tempPC = cpu.registers.pc;

        for (let i = 0; i < numInstructions; i++) {
            const currentInstruction = {};
            this.disassemble(cpu, tempPC, currentInstruction);
            decodedBlock.push(currentInstruction);
            tempPC = (tempPC + currentInstruction.bytes.length) & 0xffff;
        }

        return decodedBlock;
    }

    /**
     * Decodes a single instruction at the target physical address PC for debugger visualization.
     * @param {ZilogZ80} cpu - The CPU Orchestrator.
     * @param {number} targetPC - Starting Program Counter offset.
     * @param {Object} outObject - Output instruction wrapper object.
     */
    static disassemble(cpu, targetPC, outObject) {
        outObject.bytes = [];
        outObject.decodedString = "UNK";
        outObject.address = targetPC;

        const b1 = cpu.theMMU.readAddr(targetPC);

        // 1. CB-Prefixed Bitwise/Shift Instructions
        if (b1 === 0xcb) {
            outObject.bytes.push(0xcb);
            const b2 = cpu.theMMU.readAddr(targetPC + 1);
            outObject.bytes.push(b2);

            const instrCode = cpu.prefixcbOpcodes[b2];
            if (instrCode !== undefined) {
                outObject.decodedString = instrCode[1];
            }
        }
        // 2. ED-Prefixed Extended Instructions
        else if (b1 === 0xed) {
            outObject.bytes.push(0xed);
            const b2 = cpu.theMMU.readAddr(targetPC + 1);
            outObject.bytes.push(b2);

            const instrCode = cpu.prefixedOpcodes[b2];
            if (instrCode !== undefined) {
                outObject.decodedString = instrCode[1];
            }
        }
        // 3. DD-Prefixed IX Indexed Instructions
        else if (b1 === 0xdd) {
            const b2 = cpu.theMMU.readAddr(targetPC + 1);
            if (b2 === 0xcb) {
                outObject.bytes.push(0xdd);
                outObject.bytes.push(0xcb);
                const b3 = cpu.theMMU.readAddr(targetPC + 2);
                outObject.bytes.push(b3);
                const b4 = cpu.theMMU.readAddr(targetPC + 3);
                outObject.bytes.push(b4);
    
                const instrCode = cpu.prefixddcbOpcodes[b4];
                if (instrCode !== undefined) {
                    outObject.decodedString = instrCode[1];
                }
            } else {
                outObject.bytes.push(0xdd);
                outObject.bytes.push(b2);

                const instrCode = cpu.prefixddOpcodes[b2];
                if (instrCode !== undefined) {
                    for (let ab = 0; ab < instrCode[3]; ab++) {
                        outObject.bytes.push(cpu.theMMU.readAddr(targetPC + 2 + ab));
                    }
                    outObject.decodedString = this.getFullDecodedString(instrCode, outObject.bytes);
                }                  
            }
        }
        // 4. FD-Prefixed IY Indexed Instructions
        else if (b1 === 0xfd) {
            const b2 = cpu.theMMU.readAddr(targetPC + 1);
            if (b2 === 0xcb) {
                outObject.bytes.push(0xfd);
                outObject.bytes.push(0xcb);
                const b3 = cpu.theMMU.readAddr(targetPC + 2);
                outObject.bytes.push(b3);
                const b4 = cpu.theMMU.readAddr(targetPC + 3);
                outObject.bytes.push(b4);

                const instrCode = cpu.prefixfdcbOpcodes[b4];
                if (instrCode !== undefined) {
                    outObject.decodedString = instrCode[1];
                }
            } else {
                outObject.bytes.push(0xfd);
                outObject.bytes.push(b2);

                const instrCode = cpu.prefixfdOpcodes[b2];
                if (instrCode !== undefined) {
                    outObject.decodedString = instrCode[1];
                }
            }
        }
        // 5. Standard Unprefixed Core Instructions
        else {
            const instrCode = cpu.unprefixedOpcodes[b1];
            outObject.bytes.push(b1);
            if (instrCode !== undefined) {
                for (let ab = 0; ab < instrCode[3]; ab++) {
                    outObject.bytes.push(cpu.theMMU.readAddr(targetPC + 1 + ab));
                }
                outObject.decodedString = this.getFullDecodedString(instrCode, outObject.bytes);
            }
        }
    }
}