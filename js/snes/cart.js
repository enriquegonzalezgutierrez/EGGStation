/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Model
 * Component: SnesCartridge & Mappers (Domain Entities)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the physical Super Nintendo Game Cartridge.
 * It encapsulates ROM (Read-Only Memory), SRAM (Static Random Access Memory),
 * and delegates the complex address routing logic to specialized Mapper strategies
 * (LoRom/HiRom) adhering to SOLID design.
 * 
 * SOLID Principles:
 * - SRP: The Cartridge manages storage state, while Mapper classes manage address decoding.
 * - OCP: New mapping chips (SA-1, SuperFX, SDD-1) can be implemented by extending SnesMapper 
 *        without changing SnesCartridge.
 * - LSP: LoRomMapper and HiRomMapper can be seamlessly interchanged.
 */

/**
 * Base Abstract Mapper Class (Interface)
 */
class SnesMapper {
    /**
     * @param {Uint8Array} romData 
     * @param {Uint8Array} sramData 
     * @param {number} romBanks 
     * @param {number} sramSize 
     * @param {boolean} hasSram 
     */
    constructor(romData, sramData, romBanks, sramSize, hasSram) {
        this.romData = romData;
        this.sramData = sramData;
        this.romBanks = romBanks;
        this.sramSize = sramSize;
        this.hasSram = hasSram;
    }

    read(bank, adr) { 
        throw new Error("Method 'read(bank, adr)' must be implemented by concrete mapper."); 
    }
    
    write(bank, adr, value) { 
        throw new Error("Method 'write(bank, adr, value)' must be implemented by concrete mapper."); 
    }
}

/**
 * LoROM Address Mapping Strategy
 */
class LoRomMapper extends SnesMapper {
    read(bank, adr) {
        if (adr < 0x8000) {
            if (bank >= 0x70 && bank < 0x7e && this.hasSram) {
                // Static SRAM Read access
                const index = (((bank - 0x70) << 15) | (adr & 0x7fff)) & (this.sramSize - 1);
                return this.sramData[index];
            }
        }
        // Standard ROM Read access
        const romIndex = ((bank & (this.romBanks - 1)) << 15) | (adr & 0x7fff);
        return this.romData[romIndex];
    }

    write(bank, adr, value) {
        if (adr < 0x8000 && bank >= 0x70 && bank < 0x7e && this.hasSram) {
            // Static SRAM Write access
            const index = (((bank - 0x70) << 15) | (adr & 0x7fff)) & (this.sramSize - 1);
            this.sramData[index] = value;
        }
    }
}

/**
 * HiROM Address Mapping Strategy
 */
class HiRomMapper extends SnesMapper {
    read(bank, adr) {
        if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
            if (bank < 0x40 || (bank >= 0x80 && bank < 0xc0)) {
                // Static SRAM Read access
                const index = (((bank & 0x3f) << 13) | (adr & 0x1fff)) & (this.sramSize - 1);
                return this.sramData[index];
            }
        }
        // Standard ROM Read access
        const romIndex = (((bank & 0x3f) & (this.romBanks - 1)) << 16) | adr;
        return this.romData[romIndex];
    }

    write(bank, adr, value) {
        if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
            if (bank < 0x40 || (bank >= 0x80 && bank < 0xc0)) {
                // Static SRAM Write access
                const index = (((bank & 0x3f) << 13) | (adr & 0x1fff)) & (this.sramSize - 1);
                this.sramData[index] = value;
            }
        }
    }
}

/**
 * Aggregate Root: Super Nintendo Cartridge
 */
class SnesCartridge {
    /**
     * @param {Uint8Array} romData 
     * @param {Object} header 
     * @param {boolean} isHirom 
     */
    constructor(romData, header, isHirom) {
        this.header = header;
        this.romData = romData;
        this.isHirom = isHirom;

        // Initialize battery-backed SRAM boundaries
        this.hasSram = header.chips > 0;
        this.sramSize = header.ramSize;
        this.sramData = new Uint8Array(this.sramSize);

        // Parse ROM bank properties
        this.romBanks = header.romSize / 0x8000;

        // Dependency Inversion: Inject the required address layout mapper strategy
        this.mapper = this.isHirom
            ? new HiRomMapper(this.romData, this.sramData, this.romBanks, this.sramSize, this.hasSram)
            : new LoRomMapper(this.romData, this.sramData, this.romBanks, this.sramSize, this.hasSram);

        this.logMetadata();
        this.reset(true);
    }

    /**
     * Logs diagnostic cartridge statistics to the developer console.
     */
    logMetadata() {
        const sramHexSize = typeof getWordRep === "function"
            ? getWordRep(this.hasSram ? this.sramSize : 0)
            : (this.hasSram ? this.sramSize : 0).toString(16).toUpperCase();

        console.log(
            `[EGGStation::SNES] Mounted ${this.isHirom ? "HiROM" : "LoROM"} ROM: "${this.header.name}"; ` +
            `Banks: ${this.romBanks}; SRAM Allocated: $${sramHexSize}`
        );
    }

    /**
     * Performs a hard or soft reset on the cartridge memories.
     */
    reset(hard = false) {
        if (hard && this.sramData) {
            this.sramData.fill(0);
        }
    }

    /**
     * Translates a system Bus read request through the active mapper strategy.
     */
    read(bank, adr) {
        return this.mapper.read(bank, adr);
    }

    /**
     * Translates a system Bus write request through the active mapper strategy.
     */
    write(bank, adr, value) {
        this.mapper.write(bank, adr, value);
    }
}

// Backward Compatibility Alias (Ensures legacy core files run normally during microphases)
window.Cart = SnesCartridge;