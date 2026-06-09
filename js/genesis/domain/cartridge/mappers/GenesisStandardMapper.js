/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cartridge/mappers/GenesisStandardMapper.js
 * 
 * Domain Layer: Standard Genesis Cartridge Memory Mapper
 * 
 * Role:
 * Implements the standard, flat memory mapping scheme used by 99% of Genesis games.
 * Handles up to 4MB (32 Megabits) of linear ROM and maps battery SRAM to 0x200000.
 */

class GenesisStandardMapper extends GenesisBaseMapper {
    constructor(cartridge) {
        super(cartridge);
    }

    readWord(address) {
        // Handle SRAM Reading (Mapped by default at 0x200000 if present)
        if (this.cartridge.hasSram && address >= 0x200000 && address < 0x200000 + this.sramSize) {
            const offset = (address - 0x200000) & (this.sramSize - 1);
            return (this.sram[offset] << 8) | this.sram[offset + 1];
        }

        // Standard Flat ROM Reading
        if (this.cartridge.rom) {
            const wordAddr = Math.floor(address / 2) | 0;
            if (wordAddr < this.cartridge.length) {
                return this.cartridge.rom[wordAddr];
            }
        }

        return 0xFFFF; // Open bus fallback
    }

    writeWord(address, value, mask) {
        // Handle SRAM Writing (Mapped by default at 0x200000)
        if (this.sramWritable && address >= 0x200000 && address < 0x200000 + this.sramSize) {
            const offset = (address - 0x200000) & (this.sramSize - 1);
            
            // Masked word writes to simulate 8-bit lane physical SRAM chips
            if ((mask & 0xFF00) !== 0) this.sram[offset] = (value >> 8) & 0xFF;
            if ((mask & 0x00FF) !== 0) this.sram[offset + 1] = value & 0xFF;
        }
        
        // Writes to standard ROM space are completely ignored (Read-Only)
    }
}