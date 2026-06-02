/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Codemasters Cartridge Memory Mapper
 * 
 * Implements the Codemasters banking strategy. Swaps pages when direct 
 * memory writes occur on segment boundaries, without vector lock protection.
 */

class CodemastersMapper extends BaseMapper {
    /**
     * @param {number[]} romArray - Flat binary ROM array of the cartridge.
     */
    constructor(romArray) {
        super(romArray);
        this.mapperSlots[0] = this.romBanks[0];
        this.mapperSlots[1] = this.romBanks[1];
        this.mapperSlots[2] = this.romBanks[0];
    }

    /**
     * Reads a byte from mapped cartridge memory without standard SEGA vector limits.
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
     * Catches direct CPU memory write instructions to trigger bank paging.
     * @param {number} address - 16-bit target memory offset.
     * @param {number} data - 8-bit bank page selection index.
     */
    write(address, data) {
        if (address === 0x0000) {
            // Swap Slot 0 (0x0000 - 0x3FFF)
            this.mapperSlots[0] = this.romBanks[data % this.numRealBanks];
        } 
        else if (address === 0x4000) {
            // Swap Slot 1 (0x4000 - 0x7FFF)
            this.mapperSlots[1] = this.romBanks[data % this.numRealBanks];
        } 
        else if (address === 0x8000) {
            // Swap Slot 2 (0x8000 - 0xBFFF)
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}