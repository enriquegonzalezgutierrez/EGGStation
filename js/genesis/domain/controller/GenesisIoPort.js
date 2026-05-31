/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Physical I/O Port Registers
 * 
 * Emulates the physical I/O ports registers (Port A, Port B, and Port C/Ext) 
 * on the Genesis motherboard. Manages direction control registers (mask/control) 
 * and bidirectional data registers (data).
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the pin-out direction 
 * multiplexing math from both system buses and standard gamepads.
 */

class GenesisIoPort {
    constructor() {
        this.mask = 0;         // Direction control register (0 = Input, 1 = Output)
        this.cachedWrite = 0;  // Holds the last written byte to the data register
    }

    initialise() {
        // Zeros out on reset. Sega standard SDK bootcode checks if control value is 0.
        this.mask = 0;
        this.cachedWrite = 0;
    }

    /**
     * Reads the direction control register (Control Port).
     * @returns {number} 8-bit direction mask.
     */
    readControl() {
        return this.mask;
    }

    /**
     * Writes to the direction control register (Control Port).
     * @param {number} value - 8-bit direction mask.
     */
    writeControl(value) {
        this.mask = value & 0xFF;
    }

    /**
     * Reads multiplexed data from the port (Data Port).
     * @param {number} cycles - Clock cycles passed.
     * @param {Function} readCallback - Bidirectional pin read callback.
     * @param {Object} userData - User context pointer.
     * @returns {number} 8-bit data register readout.
     */
    readData(cycles, readCallback, userData) {
        if (readCallback === null || readCallback === undefined) {
            return 0;
        }

        // Multiplexing formula: bits set as inputs (0) in mask are read from the controller line,
        // while bits set as outputs (1) are read directly from the cached written value.
        const inputLines = readCallback(userData, cycles) & 0xFF;
        const inputMask = (~this.mask) & 0xFF;

        return (inputLines & inputMask) | this.cachedWrite;
    }

    /**
     * Writes 8-bit data to the port (Data Port).
     * @param {number} value - 8-bit data byte.
     * @param {number} cycles - Clock cycles passed.
     * @param {Function} writeCallback - Bidirectional pin write callback.
     * @param {Object} userData - User context pointer.
     */
    writeData(value, cycles, writeCallback, userData) {
        if (writeCallback === null || writeCallback === undefined) {
            return;
        }

        // Store only the bits mapped as active outputs
        this.cachedWrite = value & this.mask;
        writeCallback(userData, this.cachedWrite, cycles);
    }
}