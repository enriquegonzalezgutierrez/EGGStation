/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/SnesCartridgeWasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (SNES Cartridge)
 * 
 * Role:
 * Bridges the pure C++ SnesCartridge Domain Entity to WebAssembly. Exposes 
 * high-performance direct memory pointer mappings, enabling JavaScript to persist 
 * backup battery SRAM directly into IndexedDB without array copy overhead.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): Serves as the low-level communication
 *   bridge between the browser's JS virtual machine and the C++ domain boundary.
 */

#include <emscripten.h>
#include "SnesCartridge.h"

// Static instance allocated to guarantee memory locality and fast access
static SnesCartridge globalSnesCartridge;

extern "C" {

/**
 * Loads a new SNES ROM into the C++ Domain, triggers LoROM/HiROM evaluation,
 * and parses the internal SNES game header.
 * 
 * @param rawData Pointer to the raw ROM binary on the WASM Heap.
 * @param size Size of the ROM buffer in bytes.
 */
EMSCRIPTEN_KEEPALIVE
void snes_cart_load(const uint8_t* rawData, uint32_t size) {
    globalSnesCartridge.load(rawData, size);
}

/**
 * Reads a single 8-bit byte from the active cartridge mapping structure.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t snes_cart_read(uint8_t bank, uint16_t address) {
    return globalSnesCartridge.read(bank, address);
}

/**
 * Writes a single 8-bit byte to the active cartridge mapping structure (SRAM).
 */
EMSCRIPTEN_KEEPALIVE
void snes_cart_write(uint8_t bank, uint16_t address, uint8_t value) {
    globalSnesCartridge.write(bank, address, value);
}

/**
 * Triggers a volatile reset cycle.
 */
EMSCRIPTEN_KEEPALIVE
void snes_cart_reset(bool hard) {
    globalSnesCartridge.reset(hard);
}

// ========================================================================
// ZERO-COPY POINTER & METADATA EXPORTS
// ========================================================================

EMSCRIPTEN_KEEPALIVE
bool snes_cart_get_is_hirom() {
    return globalSnesCartridge.getIsHirom();
}

EMSCRIPTEN_KEEPALIVE
bool snes_cart_get_is_pal() {
    return globalSnesCartridge.getIsPal();
}

EMSCRIPTEN_KEEPALIVE
uint32_t snes_cart_get_sram_size() {
    return globalSnesCartridge.getSramSize();
}

/**
 * Returns a direct pointer to the C++ SRAM std::vector backbuffer.
 * Used by JavaScript to perform high-speed Zero-Copy IndexedDB saves.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* snes_cart_get_sram_pointer() {
    return globalSnesCartridge.getSramPointer();
}

}