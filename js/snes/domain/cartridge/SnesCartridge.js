/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/cartridge/SnesCartridge.js
 * 
 * Domain/Infrastructure Layer: SnesCartridge WASM Bridge Adapter (Adapter Pattern)
 * 
 * Role:
 * Bridges the JS SNES system bus directly to the compiled C++ SnesCartridge 
 * WebAssembly module. Implements zero-copy mappings of battery SRAM.
 * 
 * SOLID Principles:
 * - Liskov Substitution Principle (LSP): Fully interchangeable with the legacy 
 *   JS SnesCartridge representation, keeping existing signatures intact.
 */

class SnesCartridge {
    constructor() {
        this.wasmInstance = null;
        this.isInitialized = false;
        
        // Zero-copy array mapped over the WASM heap for direct SRAM save/load cycles
        this.sramView = null; 
    }

    /**
     * Loads the raw SNES ROM into the compiled C++ module asynchronously.
     * 
     * @param {Uint8Array} romData - Cleaned ROM byte payload.
     * @returns {Promise<void>} Resolves when the WASM instance is ready.
     */
    async load(romData) {
        return new Promise((resolve, reject) => {
            if (typeof SnesCartWasm !== 'undefined') {
                SnesCartWasm().then(instance => {
                    this.wasmInstance = instance;

                    const size = romData.length;
                    
                    // Allocate space on the WASM Heap for the ROM payload
                    const romPtr = instance._malloc(size);
                    instance.HEAPU8.set(romData, romPtr);

                    // Delegate load & parsing directly to C++ Domain
                    instance._snes_cart_load(romPtr, size);

                    // Free temporary allocations
                    instance._free(romPtr);

                    // Setup Zero-Copy SRAM array view
                    const sramSize = instance._snes_cart_get_sram_size();
                    if (sramSize > 0) {
                        const sramPtr = instance._snes_cart_get_sram_pointer();
                        // Map direct Uint8Array view over Emscripten Heap
                        this.sramView = new Uint8Array(instance.HEAPU8.buffer, sramPtr, sramSize);
                    } else {
                        this.sramView = new Uint8Array(0);
                    }

                    this.isInitialized = true;
                    console.log("[SnesCartridge::Wasm] Super Nintendo Cartridge compiled core linked successfully.");
                    resolve();
                }).catch(err => {
                    console.error("[SnesCartridge::Wasm] Instantiation failed:", err);
                    reject(err);
                });
            } else {
                reject(new Error("[SnesCartridge::Wasm] SnesCartWasm binary factory is undefined. Check index.html imports."));
            }
        });
    }

    /**
     * Resets the non-volatile elements of the cartridge.
     */
    reset(hard) {
        if (this.isInitialized) {
            this.wasmInstance._snes_cart_reset(hard);
        }
    }

    /**
     * Reads a byte from the cartridge space in WASM.
     */
    read(bank, adr) {
        if (this.isInitialized) {
            return this.wasmInstance._snes_cart_read(bank, adr);
        }
        return 0;
    }

    /**
     * Writes a byte to the cartridge SRAM space in WASM.
     */
    write(bank, adr, value) {
        if (this.isInitialized) {
            this.wasmInstance._snes_cart_write(bank, adr, value);
        }
    }

    // ========================================================================
    // GETTERS & METADATA PORT (Bridges standard properties used by SNES core)
    // ========================================================================

    get isHirom() {
        return this.isInitialized ? !!this.wasmInstance._snes_cart_get_is_hirom() : false;
    }

    get isPal() {
        return this.isInitialized ? !!this.wasmInstance._snes_cart_get_is_pal() : false;
    }

    get sram() {
        return this.sramView || new Uint8Array(0);
    }

    get sramSize() {
        return this.isInitialized ? this.wasmInstance._snes_cart_get_sram_size() : 0;
    }

    get hasSram() {
        return this.sramSize > 0;
    }
}

// Bind globally to maintain script-based global scope lookup
window.SnesCartridge = SnesCartridge;