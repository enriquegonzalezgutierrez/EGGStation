/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/SnesDspWasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (SNES DSP)
 * 
 * Role:
 * Bridges the pure C++ SnesDsp Domain class to WebAssembly. Exposes 
 * high-performance direct memory pointers to generated PCM sample buffers 
 * and internal audio registers, bypasssing JS-WASM boundary copy limits.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): The presentation layer and audio 
 *   processors depend on this exposed interface instead of coupling directly 
 *   to C++ internal memory layout.
 */

#include <emscripten.h>
#include "SnesDsp.h"

// Static instance allocated to guarantee memory locality
static SnesDsp globalDsp;

extern "C" {

/**
 * Initializes the DSP, resetting memory and filters.
 */
EMSCRIPTEN_KEEPALIVE
void dsp_init() {
    globalDsp.initialize();
}

/**
 * Configures the direct pointer link to the APU's 64KB memory space.
 * @param ptr Pointer to the active APU RAM buffer on the WASM Heap.
 */
EMSCRIPTEN_KEEPALIVE
void dsp_set_apuram_ptr(uint8_t* ptr) {
    globalDsp.setApuRamPointer(ptr);
}

/**
 * Writes an 8-bit byte value into the target DSP register.
 */
EMSCRIPTEN_KEEPALIVE
void dsp_write(uint8_t address, uint8_t value) {
    globalDsp.write(address, value);
}

/**
 * Reads an 8-bit byte value from the target DSP register.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t dsp_read(uint8_t address) {
    return globalDsp.read(address);
}

/**
 * Synthesizes a single stereo audio sample slice, processing active channels.
 */
EMSCRIPTEN_KEEPALIVE
void dsp_cycle() {
    globalDsp.cycle();
}

// ========================================================================
// ZERO-COPY AUDIO SAMPLE BUFFERS & OFFSET POINTERS EXPORTS
// ========================================================================

EMSCRIPTEN_KEEPALIVE
float* dsp_get_samples_l_ptr() {
    return globalDsp.getSamplesL();
}

EMSCRIPTEN_KEEPALIVE
float* dsp_get_samples_r_ptr() {
    return globalDsp.getSamplesR();
}

EMSCRIPTEN_KEEPALIVE
int dsp_get_sample_offset() {
    return globalDsp.getSampleOffset();
}

EMSCRIPTEN_KEEPALIVE
void dsp_clear_sample_offset() {
    globalDsp.clearSampleOffset();
}

// ========================================================================
// REWIND & SERIALIZATION REGISTERS STATE EXPORTS (Zero-Copy)
// ========================================================================

EMSCRIPTEN_KEEPALIVE
uint8_t* dsp_get_ram_ptr() {
    return globalDsp.getRamPointer();
}

EMSCRIPTEN_KEEPALIVE
uint8_t* dsp_get_adsr_state_ptr() {
    return globalDsp.getAdsrStatePointer();
}

EMSCRIPTEN_KEEPALIVE
int16_t* dsp_get_gain_ptr() {
    return globalDsp.getGainPointer();
}

EMSCRIPTEN_KEEPALIVE
uint32_t* dsp_get_counter_ptr() {
    return globalDsp.getCounterPointer();
}

}