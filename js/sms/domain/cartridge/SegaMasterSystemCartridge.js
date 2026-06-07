/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/domain/cartridge/SegaMasterSystemCartridge.js
 * 
 * Domain Layer: Sega Master System Cartridge Wasm Adapter (Async Optimized)
 * 
 * Role:
 * Adapter that bridges the browser's ROM File Reading to the C++ Cartridge Entity.
 * Now supports asynchronous "wait-for-ready" logic to prevent startup races.
 */

class SegaMasterSystemCartridge {
    /**
     * @param {string} filename - The filename of the ROM image.
     */
    constructor(filename) {
        this.cartridgeName = filename;
        this.wasmInstance = null;
        this.isInitialized = false;
        
        // --- 1. Async Initialization Pipeline ---
        // We create a promise that resolves only when the Wasm binary is compiled.
        this.readyPromise = new Promise((resolve) => {
            if (typeof SegaCartWasm !== 'undefined') {
                SegaCartWasm().then(instance => {
                    this.wasmInstance = instance;
                    this.isInitialized = true;
                    console.log("[EGGStation::Wasm] Sega Cartridge/Mapper module linked.");
                    resolve();
                });
            } else {
                console.error("[Cartridge] Fatal: SegaCartWasm loader is missing.");
            }
        });
    }

    /**
     * Copies the ROM ArrayBuffer into the WASM heap.
     * Updated to be ASYNC to wait for the module readiness.
     * 
     * @param {ArrayBuffer} buffer - Raw file array buffer.
     */
    async load(buffer) {
        // --- 2. Startup Race Protection ---
        // If Wasm is not yet ready, we await the promise before proceeding.
        if (!this.isInitialized) {
            console.warn("[Cartridge] Waiting for Wasm module to initialize...");
            await this.readyPromise;
        }

        const wasm = this.wasmInstance;
        const uint8 = new Uint8Array(buffer);
        const size = uint8.length;

        // 3. Memory Allocation on the WASM Heap
        const romBufferPtr = wasm._malloc(size);
        wasm.HEAPU8.set(uint8, romBufferPtr);

        const filenamePtr = this.allocateString(this.cartridgeName);
        
        // 4. Invoke C++ Domain loading logic
        wasm._cart_load(filenamePtr, romBufferPtr, size);

        // 5. Cleanup temporary heap strings and pointers
        wasm._free(romBufferPtr);
        wasm._free(filenamePtr);

        console.log(`[Cartridge] Successfully injected ${size} bytes into C++ Domain.`);
    }

    /** Helper to allocate C-compatible strings on the WASM heap */
    allocateString(str) {
        const wasm = this.wasmInstance;
        const size = str.length + 1;
        const ptr = wasm._malloc(size);
        for (let i = 0; i < str.length; i++) {
            wasm.HEAPU8[ptr + i] = str.charCodeAt(i);
        }
        wasm.HEAPU8[ptr + str.length] = 0; // Null terminator
        return ptr;
    }

    // --- Domain Getters (Proxied from C++) ---
    get romChecksum() { return this.isInitialized ? this.wasmInstance._cart_get_checksum() : 0; }
    get cartridgeSize() { return this.isInitialized ? this.wasmInstance._cart_get_size() : 0; }
}