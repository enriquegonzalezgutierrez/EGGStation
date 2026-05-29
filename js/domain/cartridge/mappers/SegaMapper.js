/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SegaMapper Strategy
 * 
 * Implements the standard SEGA Cartridge Mapper hardware paging.
 * It manages three bank slots and can map Cartridge SRAM into slot 2 (0x8000-0xBFFF)
 * via writing control registers mapped to system RAM mirror addresses (0xFFFC-0xFFFF).
 */

class SegaMapper extends BaseMapper {
    constructor(romArray) {
        super(romArray);
        
        // Standard SEGA default banks loaded at boot
        this.mapperSlots[0] = 0 < this.romBanks.length ? this.romBanks[0] : null;
        this.mapperSlots[1] = 1 < this.romBanks.length ? this.romBanks[1] : null;
        this.mapperSlots[2] = 2 < this.romBanks.length ? this.romBanks[2] : null;

        this.cartridgeRam = new Uint8Array(0x8000).fill(0); // 32KB Cartridge SRAM
        this.cartridgeRamBankSelect = 0;
        this.mapperSlot2IsCartridgeRam = false;
    }

    read(address) {
        if (address <= 0x03ff) {
            // First 1KB is protected to preserve Z80 interrupt vectors
            return this.romBanks[0][address];
        } else if (address <= 0x3fff) {
            return this.mapperSlots[0] != null ? this.mapperSlots[0][address] : 0;
        } else if (address <= 0x7fff) {
            return this.mapperSlots[1] != null ? this.mapperSlots[1][address - 0x4000] : 0;
        } else if (address <= 0xbfff) {
            if (this.mapperSlot2IsCartridgeRam) {
                return this.cartridgeRam[(address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000)];
            } else {
                return this.mapperSlots[2] != null ? this.mapperSlots[2][address - 0x8000] : 0;
            }
        }
        return 0;
    }

    write(address, data) {
        if (address >= 0x8000 && address <= 0xbfff) {
            if (this.mapperSlot2IsCartridgeRam) {
                this.cartridgeRam[(address - 0x8000) + (this.cartridgeRamBankSelect * 0x4000)] = data;
            }
        }
    }

    writeSystemRamOverride(address, data) {
        if (address === 0xfffc) {
            const bankShift = data & 0x03;
            if (bankShift !== 0) throw 'Unimplemented ROM bank shift.';
            
            this.cartridgeRamBankSelect = (data & 0x04) > 0 ? 1 : 0;
            if ((data & 0x10) > 0) throw 'Unimplemented system RAM override.';
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