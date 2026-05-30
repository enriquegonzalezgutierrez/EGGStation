/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Standard SEGA Cartridge Memory Mapper
 * 
 * Implements the standard SEGA mapper hardware behavior. Supports 3-slot 
 * logical mapping, vector protection in Slot 0, and on-board battery save SRAM.
 */

class SegaMapper extends BaseMapper {
    /**
     * @param {number[]} romArray - Flat binary ROM array of the cartridge.
     */
    constructor(romArray) {
        super(romArray);
        
        // Setup standard starting banks at system boot
        this.mapperSlots[0] = this.romBanks.length > 0 ? this.romBanks[0] : null;
        this.mapperSlots[1] = this.romBanks.length > 1 ? this.romBanks[1] : null;
        this.mapperSlots[2] = this.romBanks.length > 2 ? this.romBanks[2] : null;

        // 32KB on-board battery-backed Save SRAM
        this.cartridgeRam = new Uint8Array(0x8000).fill(0);
        this.cartridgeRamBankSelect = 0;
        this.mapperSlot2IsCartridgeRam = false;
    }

    /**
     * Reads a byte from mapped cartridge memory, enforcing vector protection and SRAM routing.
     * @param {number} address - 16-bit memory address.
     * @returns {number} 8-bit value.
     */
    read(address) {
        if (address <= 0x03ff) {
            // Standard hardware protection: first 1KB of memory (Reset & Interrupt vectors) 
            // is always locked to bank 0 to ensure system jump stability.
            return this.romBanks[0][address];
        } 
        else if (address <= 0x3fff) {
            return this.mapperSlots[0] !== null ? this.mapperSlots[0][address] : 0;
        } 
        else if (address <= 0x7fff) {
            return this.mapperSlots[1] !== null ? this.mapperSlots[1][address - 0x4000] : 0;
        } 
        else if (address <= 0xbfff) {
            // Slot 2 can map either Cartridge SRAM or Cartridge ROM
            if (this.mapperSlot2IsCartridgeRam) {
                const sramOffset = (address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000);
                return this.cartridgeRam[sramOffset];
            } else {
                return this.mapperSlots[2] !== null ? this.mapperSlots[2][address - 0x8000] : 0;
            }
        }
        return 0;
    }

    /**
     * Writes to mapped memory. Intercepts writes to target Cartridge save SRAM.
     * @param {number} address - 16-bit physical memory address.
     * @param {number} data - 8-bit value.
     */
    write(address, data) {
        if (address >= 0x8000 && address <= 0xbfff) {
            if (this.mapperSlot2IsCartridgeRam) {
                const sramOffset = (address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000);
                this.cartridgeRam[sramOffset] = data;
            }
        }
    }

    /**
     * Decodes paging registers mapped to Mirrored System Work RAM bounds (0xFFFC-0xFFFF).
     * @param {number} address - 16-bit register address.
     * @param {number} data - 8-bit page parameter.
     */
    writeSystemRamOverride(address, addressByte) {
        if (address === 0xfffc) {
            // Cartridge SRAM control register
            const bankShift = addressByte & 0x03;
            if (bankShift !== 0) {
                throw new Error("SegaMapper::Unimplemented ROM bank shifting rules detected.");
            }
            
            // Decodes SRAM Bank select (Bit 2) and SRAM mapping state (Bit 3)
            this.cartridgeRamBankSelect = (addressByte & 0x04) > 0 ? 1 : 0;
            this.mapperSlot2IsCartridgeRam = (addressByte & 0x08) > 0;

            if ((addressByte & 0x10) > 0) {
                throw new Error("SegaMapper::Unimplemented system RAM mirror override configuration.");
            }
        } 
        else if (address === 0xfffd) {
            // Swap page at Slot 0 (0x0000 - 0x3FFF)
            this.mapperSlots[0] = this.romBanks[addressByte % this.numRealBanks];
        } 
        else if (address === 0xfffe) {
            // Swap page at Slot 1 (0x4000 - 0x7FFF)
            this.mapperSlots[1] = this.romBanks[addressByte % this.numRealBanks];
        } 
        else if (address === 0xffff) {
            // Swap page at Slot 2 (0x8000 - 0xBFFF)
            this.mapperSlots[2] = this.romBanks[addressByte % this.numRealBanks];
        }
    }
}