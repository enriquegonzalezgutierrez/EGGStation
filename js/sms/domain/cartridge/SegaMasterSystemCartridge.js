/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega Master System Cartridge Entity
 * 
 * Represents a physical Master System Cartridge. Handles raw binary loading, 
 * copier header removal, metadata validation, and checksum generation.
 */

class SegaMasterSystemCartridge {
    /**
     * @param {string} filename - The filename of the ROM image.
     */
    constructor(filename) {
        this.cartridgeSize = 0;
        this.cartridgeRom = [];
        this.cartridgeName = filename;
        this.romChecksum = 0;
    }

    /**
     * Checks for the presence of the standard SEGA security registration string ("TMR SEGA").
     * @param {string[]} headerCharacters - The 8 characters retrieved from address 0x7FF0.
     * @returns {boolean} True if standard Sega header is present.
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
     * Diagnostically prints regional hardware specifications based on ROM metadata.
     * @param {number} regionCode - 4-bit regional code.
     */
    printRegionCode(regionCode) {
        if (regionCode === 0x03) {
            console.log("Cartridge::Region Code decoded: SMS Japan");
        } else if (regionCode === 0x04) {
            console.log("Cartridge::Region Code decoded: SMS Export");
        }
    }

    /**
     * Diagnostically prints the ROM storage size based on internal metadata.
     * @param {number} sizeCode - 4-bit size classification code.
     */
    printRomSize(sizeCode) {
        if (sizeCode === 0x0c) {
            console.log("Cartridge::Internal ROM size value: 32KB");
        } else if (sizeCode === 0x0f) {
            console.log("Cartridge::Internal ROM size value: 128KB");
        } else if (sizeCode === 0x0) {
            console.log("Cartridge::Internal ROM size value: 256KB");
        }
    }

    /**
     * Calculates the standard 32-bit checksum of the internal ROM byte array.
     * @returns {number} Unsigned 32-bit checksum value.
     */
    calculateChecksum() {
        let checksum = 0;

        if ((this.cartridgeRom.length % 4) !== 0) {
            throw new Error("Cartridge::Error: ROM length is not a multiple of 4, cannot calculate checksum.");
        }

        for (let i = 0; i < this.cartridgeRom.length; i += 4) {
            let chunk = this.cartridgeRom[i];
            chunk |= this.cartridgeRom[i + 1] << 8;
            chunk |= this.cartridgeRom[i + 2] << 16;
            chunk |= this.cartridgeRom[i + 3] << 24;

            checksum += chunk;
            checksum &= 0xffffffff; // Force unsigned 32-bit math wrap-around      
        }

        return Math.abs(checksum);
    }

    /**
     * Parses the raw ArrayBuffer, extracts metadata, and prepares ROM arrays.
     * @param {ArrayBuffer} buffer - Raw file array buffer.
     */
    load(buffer) {
        this.cartridgeSize = buffer.byteLength;
        const tempArray = new Uint8Array(buffer);

        for (let i = 0; i < this.cartridgeSize; i++) {
            this.cartridgeRom.push(tempArray[i]);
        }

        if (this.cartridgeSize < (32 * 1024)) {
            console.warn("Cartridge::Warning: Loaded ROM size is smaller than the standard 32KB system minimum.");
        }

        // Clean outdated copier prefixes (e.g. game doctor headers) if detected
        if (this.cartridgeRom.length % 0x4000 === 512) {
            console.log("Cartridge::Detected and removed 512-byte copier header.");
            const cleanedRom = [];
            for (let i = 512; i < this.cartridgeRom.length; i++) {
                cleanedRom.push(this.cartridgeRom[i]);
            }
            this.cartridgeRom = cleanedRom;
        }

        // Compute unique game checksum identification
        this.romChecksum = this.calculateChecksum();
        console.log(`Cartridge::Checksum identity calculated as: 0x${this.romChecksum.toString(16).padStart(8, '0')}`);

        // Validate Standard Sega registration block at address 0x7FF0
        const headerBytes = [];
        for (let i = 0; i < 16; i++) {
            headerBytes.push(this.cartridgeRom[0x7ff0 + i]);
        }

        const characters = [];
        headerBytes.forEach(byte => {
            characters.push(String.fromCharCode(byte));
        });

        if (this.checkForTmrSega(characters)) {
            console.log("Cartridge::Standard SEGA registration signature confirmed at address 0x7FF0.");
        } else {
            console.warn("Cartridge::No standard SEGA signature found. Proceeding with flat fallback mode.");
            return;
        }

        this.printRegionCode(headerBytes[0x0f] >> 4);
        this.printRomSize(headerBytes[0x0f] & 0x0f);
    }
}