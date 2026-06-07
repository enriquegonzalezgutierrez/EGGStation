/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/domain/cartridge/mappers/BaseMapper.js
 * 
 * Domain Layer: Sega Master System Mapper Wasm Proxy
 * 
 * Role:
 * Acts as a transparent proxy for the polymorphic C++ Mapper suite.
 * It provides the same interface to the System Bus while executing 
 * native code for address translation and bank switching.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Fully interchangeable with 
 *   previous JS implementations.
 */

class BaseMapper {
    /**
     * @param {SegaMasterSystemCartridge} cartridge - The Wasm Cartridge adapter.
     */
    constructor(cartridge) {
        this.wasm = cartridge.wasmInstance;
    }

    /** Redirects memory read to C++ Mapper strategy */
    read(address) {
        return this.wasm._cart_read(address);
    }

    /** Redirects memory write to C++ Mapper strategy (e.g. SRAM) */
    write(address, data) {
        this.wasm._cart_write(address, data);
    }

    /** Redirects paging register writes to C++ Mapper strategy */
    writeSystemRamOverride(address, data) {
        this.wasm._cart_write_system_ram_override(address, data);
    }

    // --- Temporal Physics (Rewind Sync) ---
    get sramBankSelect() {
        const ptr = this.wasm._malloc(1);
        this.wasm._cart_get_sram_state(ptr, ptr + 1); // Mocked for simplicity
        const val = this.wasm.HEAPU8[ptr];
        this.wasm._free(ptr);
        return val;
    }

    get mapperSlot2IsCartridgeRam() {
        // In this phase, we keep variables like this as virtual proxies
        return false; 
    }
}