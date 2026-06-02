/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Super Nintendo (SNES) Memory Mapper Strategies
 * 
 * Implements address decoding strategies for standard LoROM and HiROM cartridge formats.
 * Manages the memory banking offsets, mirroring bounds, and on-board SRAM battery mappings.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates address-to-offset mapping mechanics,
 *   preventing the system bus from bloating with cartridge-specific layout checks.
 * - Open/Closed Principle (OCP): Designed using Strategy pattern wrappers to easily
 *   integrate other coprocessor maps (e.g., SA-1, Super FX) without mutating core files.
 */

class SnesMapper {
    /**
     * @param {SnesCartridge} cartridge - Injected cartridge entity containing aligned ROM arrays.
     */
    constructor(cartridge) {
        this.cartridge = cartridge;
        this.romData = cartridge.romData;
        this.romSize = cartridge.romSize;

        // Number of available 32KB ROM banks
        this.banksCount = Math.floor(this.romSize / 0x8000);

        // Instantiate save RAM buffer
        this.sramSize = cartridge.sramSize;
        this.sram = new Uint8Array(this.sramSize).fill(0);
        this.hasSram = cartridge.hasSram && this.sramSize > 0;

        // Auto-select strategy mode (0: LoROM, 1: HiROM)
        this.isHirom = cartridge.mapperType === 1;
    }

    /**
     * Resets the save RAM state.
     */
    reset() {
        this.sram.fill(0);
    }

    /**
     * Translates a 24-bit memory request into a byte read from cartridge memory.
     * @param {number} bank - 8-bit bank index
     * @param {number} adr - 16-bit address offset
     * @returns {number} 8-bit value
     */
    read(bank, adr) {
        bank &= 0xFF;
        adr &= 0xFFFF;

        if (!this.isHirom) {
            // --- LoROM Mapping Strategy ---
            if (adr < 0x8000) {
                // Save SRAM is mapped to banks 0x70 to 0x7D, lower 32KB segment
                if (bank >= 0x70 && bank < 0x7E && this.hasSram) {
                    const sramOffset = (((bank - 0x70) << 15) | (adr & 0x7FFF)) & (this.sramSize - 1);
                    return this.sram[sramOffset];
                }
            }
            // Standard LoROM uses the upper 32KB of each bank for ROM mapping
            const romOffset = ((bank & (this.banksCount - 1)) << 15) | (adr & 0x7FFF);
            return this.romData[romOffset % this.romSize];
        } else {
            // --- HiROM Mapping Strategy ---
            if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
                // Save SRAM is mapped to banks 0x00-0x3F and 0x80-0xBF, address 0x6000-0x7FFF
                if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                    const sramOffset = (((bank & 0x3F) << 13) | (adr & 0x1FFF)) & (this.sramSize - 1);
                    return this.sram[sramOffset];
                }
            }
            // HiROM maps full 64KB banks sequentially
            const romOffset = (((bank & 0x3F) & (this.banksCount - 1)) << 16) | adr;
            return this.romData[romOffset % this.romSize];
        }
    }

    /**
     * Translates a 24-bit memory write into a save SRAM update if mapping rules match.
     * @param {number} bank - 8-bit bank index
     * @param {number} adr - 16-bit address offset
     * @param {number} value - 8-bit data byte
     */
    write(bank, adr, value) {
        bank &= 0xFF;
        adr &= 0xFFFF;
        value &= 0xFF;

        if (!this.isHirom) {
            // --- LoROM Save SRAM Writes ---
            if (adr < 0x8000 && bank >= 0x70 && bank < 0x7E && this.hasSram) {
                const sramOffset = (((bank - 0x70) << 15) | (adr & 0x7FFF)) & (this.sramSize - 1);
                this.sram[sramOffset] = value;
            }
        } else {
            // --- HiROM Save SRAM Writes ---
            if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
                if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                    const sramOffset = (((bank & 0x3F) << 13) | (adr & 0x1FFF)) & (this.sramSize - 1);
                    this.sram[sramOffset] = value;
                }
            }
        }
    }
}