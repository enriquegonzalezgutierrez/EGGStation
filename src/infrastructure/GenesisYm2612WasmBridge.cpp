/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/GenesisYm2612WasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (YM2612 Synthesizer)
 * 
 * Role:
 * Bridges the pure C++ GenesisYm2612 Domain Entity to WebAssembly. Exposes an 
 * extern "C" interface compiled by Emscripten, and instantiates a static shared 
 * memory buffer to allow direct JS reads without memory copying.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): Acts as the low-level delivery mechanism, 
 *   mediating between the high-level Domain specifications (YM2612) and the host 
 *   browser's JavaScript virtual machine memory layout.
 */

#include <emscripten.h>
#include "audio/GenesisYm2612.h"

#define WASM_FM_AUDIO_BUFFER_SIZE 4096

// Pure Domain instance wrapped inside the Infrastructure Bridge
static GenesisYm2612 globalFm;

// Shared linear memory buffer (Stereo: Left and Right interleaved, 16-bit signed)
// JavaScript can query this pointer and map HEAP16 directly to prevent GC spikes.
static int16_t sharedFmBuffer[WASM_FM_AUDIO_BUFFER_SIZE];

extern "C" {

EMSCRIPTEN_KEEPALIVE
void fm_init() {
    globalFm.initialize();
}

EMSCRIPTEN_KEEPALIVE
void fm_write_address(uint8_t port, uint8_t address) {
    globalFm.writeAddress(port, address);
}

EMSCRIPTEN_KEEPALIVE
void fm_write_data(uint8_t data) {
    globalFm.writeData(data);
}

EMSCRIPTEN_KEEPALIVE
uint8_t fm_update(int cycles) {
    return globalFm.update(cycles);
}

EMSCRIPTEN_KEEPALIVE
void fm_output_samples(int totalFrames) {
    int maxFrames = totalFrames < (WASM_FM_AUDIO_BUFFER_SIZE / 2) ? totalFrames : (WASM_FM_AUDIO_BUFFER_SIZE / 2);
    globalFm.outputSamples(sharedFmBuffer, maxFrames);
}

EMSCRIPTEN_KEEPALIVE
int16_t* fm_get_buffer_pointer() {
    return sharedFmBuffer;
}

}