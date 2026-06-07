/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/SegaPsgWasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge
 * 
 * Role:
 * Bridges the pure C++ SegaPsg Domain Entity to WebAssembly. Exposes an extern "C" 
 * interface compiled by Emscripten, and instantiates a static shared memory buffer 
 * to allow direct JS reads without memory copying.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): Acts as the low-level delivery mechanism, 
 *   mediating between the high-level Domain specifications (SegaPsg) and the host 
 *   browser's JavaScript virtual machine memory layout.
 */

#include <emscripten.h>
#include "SegaPsg.h"

#define WASM_AUDIO_BUFFER_SIZE 2048

// Pure Domain instance wrapped inside the Infrastructure Bridge
static SegaPsg globalPsg;

// Shared linear memory buffer. 
// JavaScript can query this pointer and map HEAPF32 directly to prevent GC spikes.
static float sharedAudioBuffer[WASM_AUDIO_BUFFER_SIZE];

extern "C" {

EMSCRIPTEN_KEEPALIVE
void psg_init() {
    globalPsg.initialize();
}

EMSCRIPTEN_KEEPALIVE
void psg_set_sample_rate(float rate) {
    globalPsg.setSampleRate(rate);
}

EMSCRIPTEN_KEEPALIVE
void psg_write_command(uint8_t cmd) {
    globalPsg.writeByte(cmd);
}

EMSCRIPTEN_KEEPALIVE
float psg_get_sample() {
    return globalPsg.getSample();
}

EMSCRIPTEN_KEEPALIVE
void psg_update_buffer(int totalFrames) {
    int frames = totalFrames < WASM_AUDIO_BUFFER_SIZE ? totalFrames : WASM_AUDIO_BUFFER_SIZE;
    for (int i = 0; i < frames; i++) {
        sharedAudioBuffer[i] = globalPsg.getSample();
    }
}

EMSCRIPTEN_KEEPALIVE
float* psg_get_buffer_pointer() {
    return sharedAudioBuffer;
}

// ========================================================================
// EXTENDED INFRASTRUCTURE STATE SYNCHRONIZERS (For Real-time Rewinding)
// ========================================================================

EMSCRIPTEN_KEEPALIVE
int16_t psg_get_vol(int ch) {
    return globalPsg.getVol(ch);
}

EMSCRIPTEN_KEEPALIVE
int16_t psg_get_tone(int ch) {
    return globalPsg.getTone(ch);
}

EMSCRIPTEN_KEEPALIVE
float psg_get_wave_pos(int ch) {
    return globalPsg.getWavePos(ch);
}

EMSCRIPTEN_KEEPALIVE
int psg_get_chan_latch() {
    return globalPsg.getChanLatch();
}

EMSCRIPTEN_KEEPALIVE
int psg_get_what_latch() {
    return globalPsg.getWhatLatch();
}

EMSCRIPTEN_KEEPALIVE
void psg_restore_state(int ch, int16_t vol, int16_t tone, float wave_pos, int chan_latch, int what_latch) {
    globalPsg.restoreState(ch, vol, tone, wave_pos, chan_latch, what_latch);
}

}