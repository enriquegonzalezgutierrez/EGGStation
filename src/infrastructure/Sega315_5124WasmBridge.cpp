/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/Sega315_5124WasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (VDP)
 * 
 * Role:
 * Bridges the Sega 315-5124 VDP Domain class to WebAssembly. Exposes 
 * high-performance pointers to CRAM, VRAM, and the packed 32-bit Framebuffer, 
 * bypassing the slow JavaScript boundary serialization limits.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): The presentation layers and adapters 
 *   depend on this bridge's exposed functional interface instead of coupling 
 *   directly to C++ memory structures.
 */

#include <emscripten.h>
#include "Sega315_5124.h"

// Static instance mapping to preserve memory locality and guarantee fast 
// access to the active console VDP context.
static Sega315_5124 globalVdp;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void vdp_init(int mode) {
    globalVdp.initialize(mode);
}

EMSCRIPTEN_KEEPALIVE
void vdp_write_control(uint8_t value) {
    globalVdp.writeByteToControlPort(value);
}

EMSCRIPTEN_KEEPALIVE
void vdp_write_data(uint8_t value) {
    globalVdp.writeByteToDataPort(value);
}

EMSCRIPTEN_KEEPALIVE
uint8_t vdp_read_control() {
    return globalVdp.readByteFromControlPort();
}

EMSCRIPTEN_KEEPALIVE
uint8_t vdp_read_data() {
    return globalVdp.readByteFromDataPort();
}

EMSCRIPTEN_KEEPALIVE
uint8_t vdp_read_port(uint8_t port) {
    return globalVdp.readDataPort(port);
}

/**
 * Steps the VDP cycle timer.
 * 
 * @param cycles Master CPU clock cycles elapsed since last step.
 * @param raiseInterrupt Out-pointer containing a boolean 1/0 flag to signal a physical line interrupt.
 * @return true if V-Blank was reached.
 */
EMSCRIPTEN_KEEPALIVE
bool vdp_update(int cycles, uint8_t* raiseInterrupt) {
    bool irq = false;
    bool vblank = globalVdp.update(cycles, &irq);
    *raiseInterrupt = irq ? 1 : 0;
    return vblank;
}

// ========================================================================
// ZERO-COPY POINTER EXPORTS
// ========================================================================

EMSCRIPTEN_KEEPALIVE
uint32_t* vdp_get_framebuffer_pointer() {
    return globalVdp.getFrameBufferPointer();
}

EMSCRIPTEN_KEEPALIVE
uint8_t* vdp_get_vram_pointer() {
    return globalVdp.getVramPointer();
}

EMSCRIPTEN_KEEPALIVE
uint8_t* vdp_get_cram_pointer() {
    return globalVdp.getCramPointer();
}

EMSCRIPTEN_KEEPALIVE
uint8_t* vdp_get_registers_pointer() {
    return globalVdp.getRegistersPointer();
}

// ========================================================================
// EXTENDED STATE SYNCHRONIZERS (For Real-time Rewinding)
// ========================================================================

EMSCRIPTEN_KEEPALIVE
void vdp_get_internal_state(int* scanlineIdx, int* lineCnt, int* ctrlFlag, uint16_t* ctrlWord, 
                             uint16_t* dataAddr, uint8_t* writeMode, uint8_t* readBuf, uint8_t* status) {
    bool flag = false;
    globalVdp.getInternalState(scanlineIdx, lineCnt, &flag, ctrlWord, dataAddr, writeMode, readBuf, status);
    *ctrlFlag = flag ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void vdp_set_internal_state(int scanlineIdx, int lineCnt, int ctrlFlag, uint16_t ctrlWord, 
                             uint16_t dataAddr, uint8_t writeMode, uint8_t readBuf, uint8_t status) {
    globalVdp.setInternalState(scanlineIdx, lineCnt, ctrlFlag != 0, ctrlWord, dataAddr, writeMode, readBuf, status);
}

}