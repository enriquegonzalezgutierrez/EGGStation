/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SegaMapper
 * 
 * Implements the standard SEGA Cartridge Mapper hardware paging.
 * It manages three bank slots and can map Cartridge SRAM into slot 2 (0x8000-0xBFFF)
 * via writing control registers mapped to system RAM mirror addresses (0xFFFC-0xFFFF).
 */

class SegaMapper extends BaseMapper {
    /**
     * @param {number[]} romArray - Raw binary cartridge ROM array.
     */
    constructor(romArray) {
        super(romArray);
        
        // Load default banks upon hardware startup
        this.mapperSlots[0] = this.romBanks.length > 0 ? this.romBanks[0] : null;
        this.mapperSlots[1] = this.romBanks.length > 1 ? this.romBanks[1] : null;
        this.mapperSlots[2] = this.romBanks.length > 2 ? this.romBanks[2] : null;

        // 32KB on-board Battery-Backed Save SRAM
        this.cartridgeRam = new Uint8Array(0x8000).fill(0);
        this.cartridgeRamBankSelect = 0;
        this.mapperSlot2IsCartridgeRam = false;
    }

    /**
     * Reads a byte from mapped physical space, enforcing vector protection and SRAM routing.
     * @param {number} address - 16-bit memory address.
     * @returns {number} 8-bit value.
     */
    read(address) {
        if (address <= 0x03ff) {
            // Protect first 1KB to ensure Z80 interrupt vector stability
            return this.romBanks[0][address];
        } 
        else if (address <= 0x3fff) {
            return this.mapperSlots[0] !== null ? this.mapperSlots[0][address] : 0;
        } 
        else if (address <= 0x7fff) {
            return this.mapperSlots[1] !== null ? this.mapperSlots[1][address - 0x4000] : 0;
        } 
        else if (address <= 0xbfff) {
            if (this.mapperSlot2IsCartridgeRam) {
                return this.cartridgeRam[(address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000)];
            } else {
                return this.mapperSlots[2] !== null ? this.mapperSlots[2][address - 0x8000] : 0;
            }
        }
        return 0;
    }

    /**
     * Writes data to the mapped space, allowing direct writes to Cartridge Save SRAM.
     * @param {number} address - 16-bit physical memory address.
     * @param {number} data - 8-bit value.
     */
    write(address, data) {
        if (address >= 0x8000 && address <= 0xbfff) {
            if (this.mapperSlot2IsCartridgeRam) {
                this.cartridgeRam[(address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000)] = data;
            }
        }
    }

    /**
     * Processes paging register updates mapped to System RAM Mirror bounds (0xFFFC-0xFFFF).
     * @param {number} address - 16-bit address written to.
     * @param {number} data - 8-bit mapping control value.
     */
    writeSystemRamOverride(address, data) {
        if (address === 0xfffc) {
            const bankShift = data & 0x03;
            if (bankShift !== 0) {
                throw new Error("SegaMapper::Unimplemented ROM bank shifting rule triggered.");
            }
            
            this.cartridgeRamBankSelect = (data & 0x04) > 0 ? 1 : 0;
            if ((data & 0x10) > 0) {
                throw new Error("SegaMapper::Unimplemented system RAM mirror override configuration.");
            }
            this.mapperSlot2IsCartridgeRam = (data & 0x08) > 0;
        } 
        else if (address === 0xfffd) {
            this.mapperSlots[0] = this.romBanks[data % this.numRealBanks];
        } 
        else if (address === 0xfffe) {
            this.mapperSlots[1] = this.romBanks[data % this.numRealBanks];
        } 
        else if (address === 0xffff) {
            this.mapperSlots[2] = this.romBanks[data % this.numRealBanks];
        }
    }
}