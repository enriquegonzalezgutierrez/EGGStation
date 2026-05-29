/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: KoreanMapper
 * 
 * Implements the Korean Cartridge Mapper paging strategy.
 * It locks bank pages 0 and 1, allowing bank switches only in slot 2 (0x8000-0xBFFF)
 * by intercepting write cycles to the address 0xA000.
 */

class KoreanMapper extends BaseMapper {
    /**
     * @param {number[]} romArray - Raw binary cartridge ROM array.
     */
    constructor(romArray) {
        super(romArray);
        this.mapperSlots[0] = this.romBanks[0];
        this.mapperSlots[1] = this.romBanks[1];
        this.mapperSlots[2] = this.romBanks[0];
    }

    /**
     * Catches write operations targeting address 0xA000 to trigger Slot 2 remapping.
     * @param {number} address - 16-bit memory offset.
     * @param {number} data - 8-bit bank index value.
     */
    write(address, data) {
        if (address === 0xa000) {
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}