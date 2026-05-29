/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: KoreanMapper Strategy
 * 
 * Implements the Korean Cartridge Mapper paging strategy.
 * It locks bank pages 0 and 1, allowing bank switches only in slot 2 (0x8000-0xBFFF)
 * by intercepting write cycles to the address 0xA000.
 */

class KoreanMapper extends BaseMapper {
    constructor(romArray) {
        super(romArray);
        this.mapperSlots[0] = this.romBanks[0];
        this.mapperSlots[1] = this.romBanks[1];
        this.mapperSlots[2] = this.romBanks[0];
    }

    write(address, data) {
        if (address === 0xa000) {
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}