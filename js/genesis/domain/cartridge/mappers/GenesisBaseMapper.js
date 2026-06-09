/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cartridge/mappers/GenesisBaseMapper.js
 * 
 * Domain Layer: Abstract Base Genesis Cartridge Mapper
 * 
 * Role:
 * Defines the abstract interface/strategy for routing CPU memory requests 
 * into physical cartridge ROM arrays and backup SRAM buffers.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): All concrete mappers (Standard, SSF2, etc.) 
 *   must implement this interface uniformly so the M68k Bus can route memory 
 *   polymorphically.
 * - Dependency Inversion Principle (DIP): The System Bus depends on this abstract 
 *   contract, entirely decoupling the CPU from specific cartridge banking circuitry.
 */

class GenesisBaseMapper {
    /**
     * @param {GenesisCartridge} cartridge - The parsed Cartridge entity.
     */
    constructor(cartridge) {
        if (new.target === GenesisBaseMapper) {
            throw new TypeError("Cannot construct GenesisBaseMapper abstract instances directly.");
        }

        this.cartridge = cartridge;
        
        // --- Centralized Backup SRAM Memory Buffer ---
        // Instantiated at the base level so all mappers inherit standard SRAM capabilities
        this.sram = new Uint8Array(0x10000); 
        this.sram.fill(0);

        if (this.cartridge.hasSram) {
            this.sramSize = this.cartridge.sramSize;
            this.sramWritable = this.cartridge.sramWritable;
        } else {
            this.sramSize = 0;
            this.sramWritable = false;
        }
    }

    /**
     * Reads a 16-bit word synchronously from the mapped cartridge space.
     * @param {number} address - 24-bit physical address.
     * @returns {number} 16-bit word data.
     */
    readWord(address) {
        throw new Error("Method 'readWord()' must be implemented by concrete mapper.");
    }

    /**
     * Writes a 16-bit word synchronously to the mapped cartridge space (usually SRAM/Registers).
     * @param {number} address - 24-bit physical address.
     * @param {number} value - 16-bit data word.
     * @param {number} mask - Write mask (e.g. 0xFF00 for upper byte).
     */
    writeWord(address, value, mask) {
        throw new Error("Method 'writeWord()' must be implemented by concrete mapper.");
    }

    /**
     * Base implementation for byte-level reads. 
     * In the Motorola 68000, 8-bit reads simply fetch the full word and mask 
     * the requested even/odd lane.
     */
    readByte(address) {
        const isOdd = (address & 1) !== 0;
        const word = this.readWord(address & ~1);
        return (word >> (isOdd ? 0 : 8)) & 0xFF;
    }

    /**
     * Base implementation for byte-level writes.
     * Translates the 8-bit payload into a masked 16-bit operation.
     */
    writeByte(address, value) {
        const isOdd = (address & 1) !== 0;
        const mask = isOdd ? 0x00FF : 0xFF00;
        const shiftedValue = (value & 0xFF) << (isOdd ? 0 : 8);
        this.writeWord(address & ~1, shiftedValue, mask);
    }

    /**
     * Temporal Physics Hooks (Savestates/Rewind)
     * To be overridden if the mapper has internal banking state (e.g. SSF2).
     */
    serializeState() {
        return {
            sram: Array.from(this.sram)
        };
    }

    deserializeState(state) {
        if (state && state.sram) {
            this.sram.set(state.sram);
        }
    }
}