/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/Sega315_5297WasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (I/O Controller)
 * 
 * Role:
 * Bridges the pure C++ Sega315_5297 Domain Entity to WebAssembly. 
 * Exposes a flat extern "C" interface compiled by Emscripten, allowing 
 * the JavaScript environment to trigger physical pin-outs synchronously.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): Acts as the low-level delivery mechanism, 
 *   mediating between the high-level Domain specifications (the C++ Chip) and the host 
 *   browser's JavaScript virtual machine. JavaScript never touches the C++ memory directly;
 *   it relies entirely on this defined API contract.
 */

#include <emscripten.h>
#include "Sega315_5297.h"

// Pure Domain instance wrapped inside the Infrastructure Bridge.
// A static instance is used to provide the absolute fastest access times 
// without dynamic memory allocation overhead across the JS-WASM boundary.
static Sega315_5297 globalIO;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void io_init() {
    globalIO.initialize();
}

EMSCRIPTEN_KEEPALIVE
void io_write_pin_dc(uint8_t mask, bool isPressed) {
    globalIO.writePinStateDC(mask, isPressed);
}

EMSCRIPTEN_KEEPALIVE
void io_write_pin_dd(uint8_t mask, bool isPressed) {
    globalIO.writePinStateDD(mask, isPressed);
}

EMSCRIPTEN_KEEPALIVE
uint8_t io_read_dc() {
    return globalIO.readRegisterDC();
}

EMSCRIPTEN_KEEPALIVE
uint8_t io_read_dd() {
    return globalIO.readRegisterDD();
}

// ========================================================================
// EXTENDED INFRASTRUCTURE STATE SYNCHRONIZERS (For Real-time Rewinding)
// ========================================================================

EMSCRIPTEN_KEEPALIVE
void io_restore_state(uint8_t dc, uint8_t dd) {
    globalIO.restoreState(dc, dd);
}

}