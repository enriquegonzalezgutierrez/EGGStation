/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Korean Cartridge Memory Mapper
 * 
 * Implements the Korean/Zemina mapper strategy. Locks Slot 0 and Slot 1,
 * only allowing bank switching on Slot 2 (0x8000-0xBFFF) via writes to 0xA000.
 */

class KoreanMapper extends BaseMapper {
    /**
     * @param {number[]} romArray - Flat binary ROM array of the cartridge.
     */
    constructor(romArray) {
        super(romArray);
        
        // Permanent locks for low slots
        this.mapperSlots[0] = this.romBanks[0];
        this.mapperSlots[1] = this.romBanks[1];
        
        // Dynamic starting index for upper slot
        this.mapperSlots[2] = this.romBanks[0];
    }

    /**
     * Catches write operations targeting address 0xA000 to swap Slot 2 banks.
     * @param {number} address - 16-bit target memory offset.
     * @param {number} data - 8-bit bank page selection index.
     */
    write(address, data) {
        if (address === 0xa000) {
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}