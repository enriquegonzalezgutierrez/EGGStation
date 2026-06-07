/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/infrastructure/audio/GenesisYm2612.js
 * 
 * Infrastructure Layer: WASM YM2612 FM Synthesizer Adapter (Adapter Pattern)
 * 
 * Role:
 * Bridges the legacy JavaScript orchestrators and mixers to the compiled 
 * C++ WebAssembly YM2612 synthesizer binary. Caches early hardware writes 
 * snychronously to prevent startup race conditions.
 */

class GenesisYm2612 {
    constructor() {
        this.wasmInstance = null;
        this.isReady = false;
        this.sharedBufferPtr = 0;

        // Synchronous write cache queue to prevent race conditions during early boot
        this.pendingWrites = [];

        // Asynchronously load the modularized Emscripten WebAssembly output
        if (typeof GenesisYm2612Wasm !== 'undefined') {
            GenesisYm2612Wasm().then(instance => {
                this.wasmInstance = instance;
                this.sharedBufferPtr = instance._fm_get_buffer_pointer();
                
                instance._fm_init();

                // Flush any early writes snychronously to the C++ core
                for (let i = 0; i < this.pendingWrites.length; i++) {
                    const write = this.pendingWrites[i];
                    if (write.type === 'addr') {
                        instance._fm_write_address(write.port, write.addr);
                    } else {
                        instance._fm_write_data(write.val);
                    }
                }
                this.pendingWrites = []; // Flush completed
                
                this.isReady = true;
                console.log("[GenesisYm2612::JSAdapter] Linked native WASM YM2612 core successfully.");
            });
        } else {
            console.error("[GenesisYm2612::JSAdapter] Fatal: GenesisYm2612Wasm binary factory is not loaded.");
        }
    }

    /**
     * Resets the entire FM chip states snychronously.
     */
    initialise() {
        if (this.isReady) {
            this.wasmInstance._fm_init();
        }
    }

    reset() {
        this.initialise();
    }

    /**
     * Latch-registers the target active address.
     */
    writeAddress(port, addr) {
        if (this.isReady) {
            this.wasmInstance._fm_write_address(port, addr);
        } else {
            this.pendingWrites.push({ type: 'addr', port: port, addr: addr });
        }
    }

    /**
     * Writes data into the previously latched register.
     */
    writeData(val) {
        if (this.isReady) {
            this.wasmInstance._fm_write_data(val);
        } else {
            this.pendingWrites.push({ type: 'data', val: val });
        }
    }

    /**
     * Steps the physical internal hardware timers.
     * @return Current status of the Timer IRQ flags.
     */
    update(cycles) {
        return this.isReady ? this.wasmInstance._fm_update(cycles) : 0;
    }

    /**
     * Synthesizes and mixes FM audio channels into the system backbuffer.
     * Maps HEAP16 directly over the C++ memory space to achieve Zero-Copy.
     */
    outputSamples(destBuffer, totalFrames) {
        if (!this.isReady) {
            destBuffer.fill(0);
            return;
        }

        // Trigger native C++ synthesis
        this.wasmInstance._fm_output_samples(totalFrames);

        const totalSamples = totalFrames * 2; // Stereo
        
        // Map the Int16Array directly to the WASM HEAP16 memory buffer (Zero-Copy)
        const wasmView = new Int16Array(this.wasmInstance.HEAP16.buffer, this.sharedBufferPtr, totalSamples);
        
        // Fast-copy values to the destination buffer
        destBuffer.set(wasmView);
    }
}