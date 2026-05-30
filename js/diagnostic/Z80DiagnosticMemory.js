/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Diagnostic Layer: Z80 Diagnostic Memory
 * 
 * Emulates a flat, isolated 64KB memory space and mock I/O port interface 
 * designed exclusively for parsing and executing dry CPU test cycles (SRP).
 */

class Z80DiagnosticMemory {
    constructor() {
        this.ram64k = new Uint8Array(0x10000).fill(0);
        this.portValues = [];
        console.log("DiagnosticMemory::Initialized flat testing memory block.");
    }

    /**
     * Resets the entire 64KB RAM block back to 0.
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
        return this.ram64k[addr & 0xffff];            
    }

    /**
     * Writes a byte to diagnostic memory.
     * @param {number} addr - 16-bit address.
     * @param {number} value - 8-bit value.
     */
    writeAddr(addr, value) {
        this.ram64k[addr & 0xffff] = value & 0xff;            
    }

    /**
     * Reads a 16-bit word (little-endian) from diagnostic memory.
     * @param {number} addr - 16-bit starting address.
     * @returns {number} 16-bit value.
     */
    readAddr16bit(addr) {
        const address = addr & 0xffff;
        if (address <= 0xff) {
            // Diagnostic zero-page index wrapping simulation
            return (this.readAddr(address) | (this.readAddr((address + 1) & 0xff) << 8)) & 0xffff;
        }
        return (this.readAddr(address) | (this.readAddr((address + 1) & 0xffff) << 8)) & 0xffff;
    }

    /**
     * Writes a 16-bit word (little-endian) to diagnostic memory.
     * @param {number} address - 16-bit physical address.
     * @param {number} word - 16-bit word value.
     */
	writeAddr16bit(address, word) {
		this.writeAddr(address, word & 0xff);
		this.writeAddr(address + 1, (word >> 8) & 0xff);
	}    

    /**
     * Fetches a wrapped address offset pointer.
     */
    getWrappedAddr(addr) {
        if ((addr & 0xff) === 0xff) {
            return ((this.readAddr(addr & 0xff00)) << 8) | (this.readAddr(addr));
        } else {
            return ((this.readAddr(addr + 1)) << 8) | (this.readAddr(addr));
        }
    }    

    /**
     * Preloads mock data inside the target I/O port registry.
     * @param {number} v - Byte to write.
     */
    preparePort(v) {
        this.portValues = [v & 0xff];
    }

    /**
     * Writes a byte to mock diagnostic port.
     */
    writePort(p, v) {
        // Output cycles are ignored during dry CPU logic verification
    }

    /**
     * Reads a byte from mock diagnostic port.
     * @returns {number} Mock port byte.
     */
    readPort(p) {
        return this.portValues[0] !== undefined ? this.portValues[0] : 0;
    }
}