/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cartridge/mappers/GenesisSsf2Mapper.js
 * 
 * Domain Layer: Sega SSF2 Cartridge Memory Mapper
 * 
 * Role:
 * Implements the official Sega memory mapper hardware (used primarily by 
 * Super Street Fighter II) to exceed the 4MB physical address limit.
 * Divides the ROM into eight 512KB configurable memory slots (Banks).
 */

class GenesisSsf2Mapper extends GenesisBaseMapper {
    constructor(cartridge) {
        super(cartridge);
        
        // 8 Bank Registers controlling 512KB windows each.
        // Default mapping matches a flat ROM (0x000000 to 0x3FFFFF)
        this.bankRegisters = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    }

    readWord(address) {
        // The SSF2 Mapper allows the game to dynamically map SRAM ON or OFF
        // using Bit 0 of Bank Register 0.
        const sramEnabled = this.cartridge.hasSram && ((this.bankRegisters[0] & 1) === 1);

        if (sramEnabled && address >= 0x200000 && address < 0x200000 + this.sramSize) {
            const offset = (address - 0x200000) & (this.sramSize - 1);
            return (this.sram[offset] << 8) | this.sram[offset + 1];
        }

        // Bank-Switched ROM Reading
        if (this.cartridge.rom) {
            // Determine which of the 8 memory slots the address targets (1 << 19 = 512KB = 0x80000)
            const slot = (address >> 19) & 7;
            
            // Map the physical window address into the absolute ROM Array buffer
            const mappedAddr = (this.bankRegisters[slot] * 0x80000) + (address & 0x7FFFF);
            
            const wordAddr = Math.floor(mappedAddr / 2) | 0;
            if (wordAddr < this.cartridge.length) {
                return this.cartridge.rom[wordAddr];
            }
        }

        return 0xFFFF; // Open bus fallback
    }

    writeWord(address, value, mask) {
        // 1. SSF2 Mapper Control Registers (0xA130F1 - 0xA130FF)
        // Check if the write targets the I/O area responsible for paging.
        if (address >= 0xA130F0 && address <= 0xA130FF) {
            if ((mask & 0x00FF) !== 0) {
                // Determine the target bank slot (0-7)
                const regIdx = ((address & 0xE) >> 1) & 7;
                this.bankRegisters[regIdx] = value & 0xFF;
            }
            return;
        }

        // 2. SRAM Writing
        // SRAM write-enable state is managed by bits 0 and 1 of Bank Register 0
        const sramWriteEnabled = this.sramWritable && ((this.bankRegisters[0] & 3) === 1);

        if (sramWriteEnabled && address >= 0x200000 && address < 0x200000 + this.sramSize) {
            const offset = (address - 0x200000) & (this.sramSize - 1);
            if ((mask & 0xFF00) !== 0) this.sram[offset] = (value >> 8) & 0xFF;
            if ((mask & 0x00FF) !== 0) this.sram[offset + 1] = value & 0xFF;
        }
    }

    serializeState() {
        const state = super.serializeState();
        state.bankRegisters = Array.from(this.bankRegisters);
        return state;
    }

    deserializeState(state) {
        super.deserializeState(state);
        if (state.bankRegisters) {
            this.bankRegisters.set(state.bankRegisters);
        }
    }
}