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
 * SOLID: Adheres to the Single Responsibility Principle (SRP) by isolating the 
 * pin-out direction multiplexing math completely from standard gamepads and 
 * system memory buses.
 */

class GenesisIoPort {
    constructor() {
        // Direction control register (0 = Input pin, 1 = Output pin)
        this.mask = 0;         
        // Holds the last written byte to the data register
        this.cachedWrite = 0;  
    }

    /**
     * Resets the port to cold-boot states.
     * Sega standard SDK bootcode explicitly checks if the control value defaults to 0.
     */
    initialise() {
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
     * @param {number} cycles - Clock cycles elapsed.
     * @param {Function} readCallback - Bidirectional pin read callback from the hardware Controller.
     * @param {Object} userData - User context pointer.
     * @returns {number} 8-bit data register readout.
     */
    readData(cycles, readCallback, userData) {
        if (!readCallback) {
            return 0;
        }

        // Multiplexing formula: bits set as inputs (0) in the mask are read from the 
        // physical controller lines. Bits set as outputs (1) are read directly from 
        // the locally cached written value.
        const inputLines = readCallback(userData, cycles) & 0xFF;
        const inputMask = (~this.mask) & 0xFF;

        return (inputLines & inputMask) | this.cachedWrite;
    }

    /**
     * Writes 8-bit data to the port (Data Port).
     * @param {number} value - 8-bit data byte.
     * @param {number} cycles - Clock cycles elapsed.
     * @param {Function} writeCallback - Bidirectional pin write callback to the hardware Controller.
     * @param {Object} userData - User context pointer.
     */
    writeData(value, cycles, writeCallback, userData) {
        if (!writeCallback) {
            return;
        }

        // Store only the bits mapped as active outputs by the direction mask
        this.cachedWrite = value & this.mask;
        writeCallback(userData, this.cachedWrite, cycles);
    }
}