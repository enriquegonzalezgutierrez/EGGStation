/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Diagnostic Layer: Z80DiagnosticMemory
 * 
 * Emulates a flat 64KB memory interface and mock I/O ports designed exclusively 
 * to execute Z80 cycle-accurate CPU instruction validation tests.
 */

class Z80DiagnosticMemory {
    constructor() {
        this.ram64k = new Uint8Array(0x10000).fill(0);
        this.portValues = [];
        console.log("DiagnosticMemory::Initialized");
    }

    /**
     * Resets the entire 64KB RAM memory block back to zero.
     */
    cleanMem() {
        this.ram64k.fill(0);
    }

    /**
     * Reads a byte from diagnostic memory.
     * @param {number} addr - 16-bit address.
     * @returns {number} 8-bit value.
     */
    readAddr(addr) {
        addr &= 0xffff;
        return this.ram64k[addr];            
    }

    /**
     * Writes a byte to diagnostic memory.
     * @param {number} addr - 16-bit address.
     * @param {number} value - 8-bit value.
     */
    writeAddr(addr, value) {
        addr &= 0xffff;
        value &= 0xff;
        this.ram64k[addr] = value;            
    }

    /**
     * Reads a 16-bit word (little-endian) from diagnostic memory.
     * @param {number} addr - 16-bit address.
     * @returns {number} 16-bit value.
     */
    readAddr16bit(addr) {
        addr &= 0xffff;
        if (addr <= 0xff) {
            // Support zero-page diagnostic index wrap around logic
            return (this.readAddr(addr) | (this.readAddr((addr + 1) & 0xff) << 8)) & 0xffff;
        }
        return (this.readAddr(addr) | (this.readAddr((addr + 1) & 0xffff) << 8)) & 0xffff;
    }

    /**
     * Writes a 16-bit word (little-endian) to diagnostic memory.
     * @param {number} address - 16-bit address.
     * @param {number} word - 16-bit value.
     */
	writeAddr16bit(address, word) {
		const byte1 = word & 0xFF;
		const byte2 = (word >> 8) & 0xFF;

		this.writeAddr(address, byte1);
		this.writeAddr(address + 1, byte2);
	}    

    /**
     * Fetches a wrapped address offset (pointer redirection logic helper).
     */
    getWrappedAddr(addr) {
        if ((addr & 0xff) === 0xff) {
            return ((this.readAddr(addr & 0xff00)) << 8) | (this.readAddr(addr));
        } else {
            return ((this.readAddr(addr + 1)) << 8) | (this.readAddr(addr));
        }
    }    

    /**
     * Prepares mock incoming data inside the diagnostic I/O ports.
     * @param {number} v - Byte to load.
     */
    preparePort(v) {
        this.portValues = [];
        this.portValues.push(v);
    }

    /**
     * Writes a byte to diagnostic ports (stubbed).
     */
    writePort(p, v) {
        // Port outputs are typically ignored during dry CPU execution verification
    }

    /**
     * Reads a byte from diagnostic ports.
     * @returns {number} Mock port value.
     */
    readPort(p) {
        return this.portValues[0] !== undefined ? this.portValues[0] : 0;
    }
}

// Global legacy alias to prevent breaking unrefactored diagnostic runners
const testMMU = Z80DiagnosticMemory;