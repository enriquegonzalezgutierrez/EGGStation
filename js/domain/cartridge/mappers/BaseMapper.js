/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: BaseMapper
 * 
 * Abstract base class for all Cartridge Memory Mappers. It provides the shared
 * logic to slice the physical cartridge ROM array into 16KB banks, which is 
 * standard across different hardware paging strategies.
 */

class BaseMapper {
    constructor(romArray) {
        this.numRealBanks = Math.max(3, Math.floor(romArray.length / 0x4000));
        this.romBanks = [];
        this.mapperSlots = [null, null, null];
        
        // Initialize the 256 physical ROM bank slots
        for (let i = 0; i < 256; i++) {
            this.romBanks[i] = new Uint8Array(0x4000);
        }

        let bankIndex = 0;
        let bankByteIndex = 0;

        // Slice ROM data into standard 16KB hardware bank pages
        for (let i = 0; i < romArray.length; i++) {
            this.romBanks[bankIndex][bankByteIndex] = romArray[i];
            bankByteIndex++;

            if (bankByteIndex === 0x4000) {
                bankIndex++;
                bankByteIndex = 0;
            }
        }
    }

    read(address) {
        // Base mapping strategy bounds
        if (address <= 0x3fff) {
            return this.mapperSlots[0] != null ? this.mapperSlots[0][address] : 0;
        } else if (address <= 0x7fff) {
            return this.mapperSlots[1] != null ? this.mapperSlots[1][address - 0x4000] : 0;
        } else if (address <= 0xbfff) {
            return this.mapperSlots[2] != null ? this.mapperSlots[2][address - 0x8000] : 0;
        }
        return 0;
    }

    write(address, data) {
        // To be overridden by mappers that support writing (e.g. Cartridge RAM)
    }

    writeSystemRamOverride(address, data) {
        // To be overridden by mappers that listen to registers on the RAM mirror (e.g. SEGA)
    }
}