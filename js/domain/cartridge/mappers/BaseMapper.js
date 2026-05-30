/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Abstract Base Mapper Strategy
 * 
 * Defines the abstract interface and standard behaviors for physical cartridge 
 * memory mapping strategies. It partitions raw ROM files into logical 16KB banks.
 */

class BaseMapper {
    /**
     * @param {number[]} romArray - Flat binary ROM array of the cartridge.
     */
    constructor(romArray) {
        // Calculate standard 16KB bank availability (minimum 3 banks for standard safety)
        this.numRealBanks = Math.max(3, Math.floor(romArray.length / 0x4000));
        
        // Storage for pre-allocated 16KB hardware bank pages
        this.romBanks = [];
        for (let i = 0; i < 256; i++) {
            this.romBanks[i] = new Uint8Array(0x4000);
        }

        // Initialize three slots representing memory bounds:
        // Slot 0: 0x0000 - 0x3FFF
        // Slot 1: 0x4000 - 0x7FFF
        // Slot 2: 0x8000 - 0xBFFF
        this.mapperSlots = [null, null, null];

        let bankIndex = 0;
        let bankByteIndex = 0;

        // Partition flat ROM array into clean 16KB structured bank segments
        for (let i = 0; i < romArray.length; i++) {
            this.romBanks[bankIndex][bankByteIndex] = romArray[i];
            bankByteIndex++;

            if (bankByteIndex === 0x4000) {
                bankIndex++;
                bankByteIndex = 0;
            }
        }
    }

    /**
     * Reads a byte from mapped cartridge memory slots.
     * @param {number} address - 16-bit memory address.
     * @returns {number} 8-bit value.
     */
    read(address) {
        if (address <= 0x3fff) {
            return this.mapperSlots[0] !== null ? this.mapperSlots[0][address] : 0;
        } 
        else if (address <= 0x7fff) {
            return this.mapperSlots[1] !== null ? this.mapperSlots[1][address - 0x4000] : 0;
        } 
        else if (address <= 0xbfff) {
            return this.mapperSlots[2] !== null ? this.mapperSlots[2][address - 0x8000] : 0;
        }
        return 0;
    }

    /**
     * Writes to mapped cartridge memory slots.
     * Implemented by descendants supporting on-cartridge RAM or write-based paging.
     * @param {number} address - 16-bit memory offset.
     * @param {number} data - 8-bit value.
     */
    write(address, data) {
        // Default: ROM is read-only. Descendants will override if required.
    }

    /**
     * Intercepts memory writes to mirrored System Work RAM (0xFFFC - 0xFFFF).
     * Decoded by mappers whose hardware paging registers sit on the mirror bus.
     * @param {number} address - 16-bit address.
     * @param {number} data - 8-bit value.
     */
    writeSystemRamOverride(address, data) {
        // Default: Does nothing. Overridden by specific mapper strategy subclasses.
    }
}