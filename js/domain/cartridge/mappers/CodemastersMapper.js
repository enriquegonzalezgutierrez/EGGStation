/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: CodemastersMapper Strategy
 * 
 * Implements the Codemasters Cartridge Mapper paging strategy.
 * It changes bank pages by catching direct write cycles on addresses 
 * 0x0000, 0x4000, and 0x8000. It does not protect the first 1KB of vector memory.
 */

class CodemastersMapper extends BaseMapper {
    constructor(romArray) {
        super(romArray);
        this.mapperSlots[0] = this.romBanks[0];
        this.mapperSlots[1] = this.romBanks[1];
        this.mapperSlots[2] = this.romBanks[0];
    }

    read(address) {
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
        if (address === 0x0000) {
            this.mapperSlots[0] = this.romBanks[data % this.numRealBanks];
        } else if (address === 0x4000) {
            this.mapperSlots[1] = this.romBanks[data % this.numRealBanks];
        } else if (address === 0x8000) {
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}