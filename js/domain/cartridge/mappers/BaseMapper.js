/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: BaseMapper
 * 
 * Abstract base class for all Cartridge Memory Mappers. It provides the shared
 * logic to slice the physical cartridge ROM array into 16KB banks, which is 
 * standard across different hardware paging strategies.
 */

class BaseMapper {
    /**
     * @param {number[]} romArray - The flat binary array containing raw ROM data.
     */
    constructor(romArray) {
        // Compute standard 16KB bank capacities, ensuring at least 3 logical banks
        this.numRealBanks = Math.max(3, Math.floor(romArray.length / 0x4000));
        this.romBanks = [];
        this.mapperSlots = [null, null, null];
        
        // Initialize the physical ROM bank slot partitions
        for (let i = 0; i < 256; i++) {
            this.romBanks[i] = new Uint8Array(0x4000);
        }

        let bankIndex = 0;
        let bankByteIndex = 0;

        // Populate standard 16KB hardware bank pages
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
     * @param {number} address - 16-bit physical memory address.
     * @returns {number} 8-bit value.
     */
    read(address) {
        if (address <= 0x3fff) {
            return this.mapperSlots[0] !== null ? this.mapperSlots[0][address] : 0;
        } else if (address <= 0x7fff) {
            return this.mapperSlots[1] !== null ? this.mapperSlots[1][address - 0x4000] : 0;
        } else if (address <= 0xbfff) {
            return this.mapperSlots[2] !== null ? this.mapperSlots[2][address - 0x8000] : 0;
        }
        return 0;
    }

    /**
     * Writes to mapped cartridge memory slots.
     * To be overridden by mappers supporting on-cartridge RAM or write-triggered banking.
     * @param {number} address - 16-bit memory offset.
     * @param {number} data - 8-bit value.
     */
    write(address, data) {
        // Base implementation does nothing (standard ROM is write-protected)
    }

    /**
     * Overrides systems mapping registers mapped to Work RAM Mirror space.
     * To be overridden by mappers that listen to control offsets (e.g. Standard SEGA Mapper).
     * @param {number} address - 16-bit mirror RAM write offset.
     * @param {number} data - 8-bit register payload.
     */
    writeSystemRamOverride(address, data) {
        // Base implementation does nothing
    }
}