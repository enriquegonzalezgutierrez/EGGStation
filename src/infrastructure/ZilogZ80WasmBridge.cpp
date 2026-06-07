/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/ZilogZ80WasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (Z80 CPU with EM_JS)
 * 
 * Role:
 * Bridges the pure C++ ZilogZ80 Domain Entity to WebAssembly using EM_JS.
 * Maps high-speed imports directly into the C++ binary to bypass the legacy 
 * WebAssembly Table growth restrictions of "addFunction".
 */

#include <emscripten.h>
#include "cpu/z80/ZilogZ80.h"
#include "cpu/z80/IZ80Bus.h"

// ========================================================================
// EM_JS COMPILATION IMPORTS (Natively bound into the WebAssembly module)
// ========================================================================

EM_JS(uint8_t, js_read_addr, (uint16_t addr), {
    return window.activeCpuWasmBusRead(addr);
});

EM_JS(void, js_write_addr, (uint16_t addr, uint8_t val), {
    window.activeCpuWasmBusWrite(addr, val);
});

EM_JS(uint8_t, js_read_port, (uint16_t port), {
    return window.activeCpuWasmPortRead(port);
});

EM_JS(void, js_write_port, (uint16_t port, uint8_t val), {
    window.activeCpuWasmPortWrite(port, val);
});

// ========================================================================
// CONCRETE BUS IMPLEMENTATION DELEGATING TO NATIVE EM_JS IMPORTS
// ========================================================================

class WasmZ80Bus : public IZ80Bus {
public:
    uint8_t readAddr(uint16_t address) override { 
        return js_read_addr(address); 
    }
    
    void writeAddr(uint16_t address, uint8_t value) override { 
        js_write_addr(address, value); 
    }
    
    uint16_t readAddr16bit(uint16_t address) override {
        return js_read_addr(address) | (js_read_addr(address + 1) << 8);
    }
    
    void writeAddr16bit(uint16_t address, uint16_t word) override {
        js_write_addr(address, word & 0xFF);
        js_write_addr(address + 1, (word >> 8) & 0xFF);
    }

    uint8_t readPort(uint16_t port) override { 
        return js_read_port(port); 
    }
    
    void writePort(uint16_t port, uint8_t value) override { 
        js_write_port(port, value); 
    }
};

// Static alignment instances
static WasmZ80Bus wasmBus;
static ZilogZ80 globalCpu(&wasmBus);

extern "C" {

EMSCRIPTEN_KEEPALIVE
void z80_init() {
    globalCpu.registers.reset();
    globalCpu.totCycles = 0;
    globalCpu.isHalted = false;
}

// FIXED: Added mock function definition to satisfy the Makefile EXPORTED_FUNCTIONS 
// compilation argument without requiring manual Makefile modifications.
EMSCRIPTEN_KEEPALIVE
void z80_register_callbacks(void* rc, void* wc, void* rpc, void* wpc) {
    // Legacy placeholder. Native EM_JS imports are now used instead of dynamic addFunction tables.
}

EMSCRIPTEN_KEEPALIVE
int z80_execute_one() {
    return globalCpu.executeOne();
}

EMSCRIPTEN_KEEPALIVE
void z80_raise_interrupt() {
    globalCpu.raiseMaskableInterrupt();
}

EMSCRIPTEN_KEEPALIVE
void z80_raise_nmi() {
    globalCpu.raiseNMI();
}

// --- Registers Exports for Debugger ---
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_pc()  { return globalCpu.registers.pc; }
EMSCRIPTEN_KEEPALIVE void z80_set_pc(uint16_t v) { globalCpu.registers.pc = v; }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_sp()  { return globalCpu.registers.sp; }
EMSCRIPTEN_KEEPALIVE void z80_set_sp(uint16_t v) { globalCpu.registers.sp = v; }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_af()  { return globalCpu.registers.getAF(); }
EMSCRIPTEN_KEEPALIVE void z80_set_af(uint16_t v) { globalCpu.registers.setAF(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_bc()  { return globalCpu.registers.getBC(); }
EMSCRIPTEN_KEEPALIVE void z80_set_bc(uint16_t v) { globalCpu.registers.setBC(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_de()  { return globalCpu.registers.getDE(); }
EMSCRIPTEN_KEEPALIVE void z80_set_de(uint16_t v) { globalCpu.registers.setDE(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_hl()  { return globalCpu.registers.getHL(); }
EMSCRIPTEN_KEEPALIVE void z80_set_hl(uint16_t v) { globalCpu.registers.setHL(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_ix()  { return globalCpu.registers.getIX(); }
EMSCRIPTEN_KEEPALIVE void z80_set_ix(uint16_t v) { globalCpu.registers.setIX(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_iy()  { return globalCpu.registers.getIY(); }
EMSCRIPTEN_KEEPALIVE void z80_set_iy(uint16_t v) { globalCpu.registers.setIY(v); }
EMSCRIPTEN_KEEPALIVE uint32_t z80_get_cycles() { return globalCpu.totCycles; }

}