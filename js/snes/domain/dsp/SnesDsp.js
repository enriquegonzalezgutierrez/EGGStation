/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/dsp/SnesDsp.js
 * 
 * Domain/Infrastructure Layer: SnesDsp WASM Bridge Adapter (Unified APU RAM Sync Edition)
 * 
 * Role:
 * Bridges the JS SNES Audio Processing Unit (APU) directly to the compiled 
 * C++ SnesDsp WebAssembly module. Dynamically overrides and binds the RAM pointers
 * of both the APU and the SPC700 CPU to guarantee shared C++ memory synchronization.
 * 
 * SOLID Principles:
 * - Liskov Substitution Principle (LSP): Fully interchangeable with the legacy 
 *   JS SnesDsp class, allowing SnesApu to execute its mixers seamlessly.
 */

class SnesDsp {
    /**
     * @param {SnesApu} apu - Active audio processing unit context.
     */
    constructor(apu) {
        this.apu = apu;
        this.wasmInstance = null;
        this.isReady = false;

        // Fallbacks during early asynchronous compiling phase
        this.fallbackL = new Float32Array(534);
        this.fallbackR = new Float32Array(534);
        this.regCache = new Uint8Array(0x80);

        if (typeof SnesDspWasm !== 'undefined') {
            SnesDspWasm().then(instance => {
                this.wasmInstance = instance;
                instance._dsp_init();

                // 1. Allocate APU 64KB RAM natively on the WASM Heap
                const apuRamPtr = instance._malloc(0x10000);
                instance._dsp_set_apuram_ptr(apuRamPtr);

                // 2. Synchronize any early register writes safely (excluding triggers first)
                const triggers = [0x4c, 0x5c, 0x6c];
                for (let i = 0; i < 0x80; i++) {
                    if (!triggers.includes(i)) {
                        instance._dsp_write(i, this.regCache[i]);
                    }
                }
                // Write triggers last in proper chronological order to avoid out-of-order execution
                instance._dsp_write(0x6c, this.regCache[0x6c]); // FLG
                instance._dsp_write(0x5c, this.regCache[0x5c]); // KOF
                instance._dsp_write(0x4c, this.regCache[0x4c]); // KON (Corrected to 0x4C)

                // 3. Define shared, high-performance getter for APU and CPU RAM 
                // Uses dynamic HEAPU8 subarray mapping to survive WASM Memory Growth seamlessly
                const syncRamGetter = {
                    get: () => {
                        return instance.HEAPU8.subarray(apuRamPtr, apuRamPtr + 0x10000);
                    },
                    set: (v) => { /* Read-only safety */ }
                };

                // Copy existing boot ROM or memory contents into the newly allocated WASM memory space
                const tempRam = new Uint8Array(instance.HEAPU8.buffer, apuRamPtr, 0x10000);
                tempRam.set(this.apu.ram);

                // Define dynamic getter on SnesApu instance
                Object.defineProperty(this.apu, 'ram', syncRamGetter);

                // Define dynamic getter on SnesSpc (SPC700 CPU) instance to avoid stale reference caching
                if (this.apu.spc) {
                    Object.defineProperty(this.apu.spc, 'ram', syncRamGetter);
                }

                this.isReady = true;
                console.log("[SnesDsp::Wasm] Linked mapped APU RAM and direct audio buffers over WASM heap.");
            }).catch(err => {
                console.error("[SnesDsp::Wasm] Instantiation failed:", err);
            });
        }
    }

    /**
     * Resets internal registers.
     */
    reset() {
        if (this.isReady) {
            this.wasmInstance._dsp_init();
        } else {
            this.regCache.fill(0);
        }
    }

    /**
     * Reads a byte from the active registers.
     */
    read(address) {
        if (this.isReady) {
            return this.wasmInstance._dsp_read(address);
        }
        return this.regCache[address & 0x7F];
    }

    /**
     * Writes a byte value into the target register.
     */
    write(address, value) {
        if (this.isReady) {
            this.wasmInstance._dsp_write(address, value);
        } else {
            this.regCache[address & 0x7F] = value;
        }
    }

    /**
     * Steps the synthesizer clock cycle.
     */
    cycle() {
        if (this.isReady) {
            this.wasmInstance._dsp_cycle();
        }
    }

    // ========================================================================
    // GETTERS & SETTERS (Apu Mixer & SaveState interfaces)
    // Uses direct subarray slices over Emscripten's active auto-updating HEAP
    // ========================================================================

    /**
     * Zero-Copy mapping of internal DSP registers array for Savestates (Rewind).
     * Solves the 'undefined is not iterable' Array.from() crash in SnesOrchestrator.
     */
    get ram() {
        if (this.isReady) {
            const ptr = this.wasmInstance._dsp_get_ram_ptr();
            return this.wasmInstance.HEAPU8.subarray(ptr, ptr + 0x80);
        }
        return this.regCache;
    }

    get samplesL() {
        if (this.isReady) {
            const ptr = this.wasmInstance._dsp_get_samples_l_ptr() >> 2; // Float32 index is byte address / 4
            return this.wasmInstance.HEAPF32.subarray(ptr, ptr + 534);
        }
        return this.fallbackL;
    }

    get samplesR() {
        if (this.isReady) {
            const ptr = this.wasmInstance._dsp_get_samples_r_ptr() >> 2; // Float32 index is byte address / 4
            return this.wasmInstance.HEAPF32.subarray(ptr, ptr + 534);
        }
        return this.fallbackR;
    }

    get sampleOffset() {
        return this.isReady ? this.wasmInstance._dsp_get_sample_offset() : 0;
    }

    set sampleOffset(value) {
        if (this.isReady && value === 0) {
            this.wasmInstance._dsp_clear_sample_offset();
        }
    }
}

// Bind globally to maintain script-based global scope lookup
window.SnesDsp = SnesDsp;
window.Dsp = SnesDsp;