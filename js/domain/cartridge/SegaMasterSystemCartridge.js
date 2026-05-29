/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SegaMasterSystemCartridge
 * 
 * Encapsulates the hardware properties of a physical Master System Cartridge.
 * It is responsible for parsing raw binary data arrays, validating physical 
 * integrity, checking the SEGA "TMR SEGA" header, and stripping down external headers.
 */

class SegaMasterSystemCartridge {
    /**
     * @param {string} name - Name of the cartridge.
     */
    constructor(name) {
        this.cartridgeSize = 0;
        this.cartridgeRom = [];
        this.cartridgeName = name;
        this.romChecksum = 0;
    }

    /**
     * Verifies the presence of the original Sega "TMR SEGA" security registration string.
     * @param {string[]} headerCharacters - Array of 8 characters representing the header.
     * @returns {boolean} True if signature matches.
     */
    checkForTmrSega(headerCharacters) {
        const tmrSegaSignature = ['T', 'M', 'R', ' ', 'S', 'E', 'G', 'A'];

        for (let i = 0; i < 8; i++) {
            if (headerCharacters[i] !== tmrSegaSignature[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Parses and outputs the regional hardware specifications.
     * @param {number} regionCode - 4-bit region code.
     */
    printRegionCode(regionCode) {
        if (regionCode === 0x03) {
            console.log("Cartridge::Region Code: Sega Master System Japan");
        } else if (regionCode === 0x04) {
            console.log("Cartridge::Region Code: Sega Master System Export");
        }
    }

    /**
     * Parses and outputs the theoretical ROM storage size.
     * @param {number} sizeCode - 4-bit ROM sizing code.
     */
    printRomSize(sizeCode) {
        if (sizeCode === 0x0c) {
            console.log("Cartridge::Assigned Capacity: 32KB");
        } else if (sizeCode === 0x0f) {
            console.log("Cartridge::Assigned Capacity: 128KB");
        } else if (sizeCode === 0x0) {
            console.log("Cartridge::Assigned Capacity: 256KB");
        }
    }

    /**
     * Computes the global 32-bit arithmetic checksum of the cartridge memory array.
     * @returns {number} Unsigned 32-bit checksum.
     */
    calculateChecksum() {
        let checksum = 0;

        if ((this.cartridgeRom.length % 4) !== 0) {
            throw new Error("Cartridge::Error: ROM length is not a multiple of 4. Unable to compute checksum.");
        }

        for (let i = 0; i < this.cartridgeRom.length; i += 4) {
            let chunk = this.cartridgeRom[i];
            chunk |= this.cartridgeRom[i + 1] << 8;
            chunk |= this.cartridgeRom[i + 2] << 16;
            chunk |= this.cartridgeRom[i + 3] << 24;

            checksum += chunk;
            checksum &= 0xffffffff;       
        }

        return Math.abs(checksum);
    }

    /**
     * Parses the raw file ArrayBuffer, strips copier prefixes, and processes hardware header structures.
     * @param {ArrayBuffer} buffer - Raw file array buffer.
     */
    load(buffer) {
        this.cartridgeSize = buffer.byteLength;
        const tempArray = new Uint8Array(buffer);

        for (let i = 0; i < this.cartridgeSize; i++) {
            this.cartridgeRom.push(tempArray[i]);
        }

        if (this.cartridgeSize < (32 * 1024)) {
            console.warn("Cartridge::Warning: Loaded ROM size is smaller than the standard 32KB hardware minimum.");
        }

        // Strip obsolete 512-byte copier headers (e.g. game doctor formats) if present
        if (this.cartridgeRom.length % 0x4000 === 512) {
            console.log("Cartridge::Detected and stripped 512-byte copier header.");
            const cleanedRom = [];
            for (let i = 512; i < this.cartridgeRom.length; i++) {
                cleanedRom.push(this.cartridgeRom[i]);
            }
            this.cartridgeRom = cleanedRom;
        }

        // Calculate and register unique hardware checksum
        this.romChecksum = this.calculateChecksum();
        console.log("Cartridge::Physical checksum is 0x" + this.romChecksum.toString(16).padStart(8, '0'));

        // Inspect metadata registration block starting at address 0x7FF0
        const headerBytes = [];
        for (let i = 0; i < 16; i++) {
            headerBytes.push(this.cartridgeRom[0x7ff0 + i]);
        }

        const characters = [];
        headerBytes.forEach(byte => {
            characters.push(String.fromCharCode(byte));
        });

        if (this.checkForTmrSega(characters)) {
            console.log("Cartridge::Standard Sega Registration Header found at memory offset 0x7FF0");
        } else {
            console.warn("Cartridge::Standard Sega Registration Header not found.");
            return;
        }

        this.printRegionCode(headerBytes[0x0f] >> 4);
        this.printRomSize(headerBytes[0x0f] & 0x0f);
    }
}

// Global legacy mapping to maintain browser UI callbacks
const cartridge = SegaMasterSystemCartridge;