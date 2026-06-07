/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/ZilogZ80WasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (Polymorphic CPU Core)
 * 
 * Role:
 * Bridges both the standard ZilogZ80 (SMS) and the specialized GenesisZ80 (Sega Genesis)
 * CPU Domain Entities to WebAssembly. Employs polymorphism to safely swap cores 
 * on-demand without affecting the SMS memory space.
 */

#include <emscripten.h>
#include "cpu/z80/ZilogZ80.h"
#include "cpu/z80/GenesisZ80.h" // Injected specialized subclass
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

// --- Static Alignment Instances ---
static WasmZ80Bus wasmBus;

// SMS baseline CPU instance (Class Base)
static ZilogZ80 globalCpu(&wasmBus);

// Sega Genesis sound specialized CPU instance (Class Subclass)
static GenesisZ80 globalGenesisCpu(&wasmBus);

// Polymorphic Pointer pointing to the active CPU Core (Defaults safely to SMS)
static ZilogZ80* activeCpu = &globalCpu;

extern "C" {

/**
 * Hot-swaps the active C++ CPU instance.
 * @param mode 0: Standard Z80 (Sega Master System), 1: GenesisZ80 (Sega Genesis)
 */
EMSCRIPTEN_KEEPALIVE
void z80_select_mode(int mode) {
    if (mode == 1) {
        activeCpu = &globalGenesisCpu;
    } else {
        activeCpu = &globalCpu;
    }
}

EMSCRIPTEN_KEEPALIVE
void z80_init() {
    activeCpu->registers.reset();
    activeCpu->totCycles = 0;
    activeCpu->isHalted = false;
}

EMSCRIPTEN_KEEPALIVE
void z80_register_callbacks(void* rc, void* wc, void* rpc, void* wpc) {
    // Legacy placeholder. Native EM_JS imports are now used instead of dynamic addFunction tables.
}

EMSCRIPTEN_KEEPALIVE
int z80_execute_one() {
    // Invokes the polymorphic virtual method in C++ (LSP compliant)
    return activeCpu->executeOne();
}

EMSCRIPTEN_KEEPALIVE
void z80_raise_interrupt() {
    activeCpu->raiseMaskableInterrupt();
}

EMSCRIPTEN_KEEPALIVE
void z80_raise_nmi() {
    activeCpu->raiseNMI();
}

// --- Registers Exports for Debugger ---
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_pc()  { return activeCpu->registers.pc; }
EMSCRIPTEN_KEEPALIVE void z80_set_pc(uint16_t v) { activeCpu->registers.pc = v; }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_sp()  { return activeCpu->registers.sp; }
EMSCRIPTEN_KEEPALIVE void z80_set_sp(uint16_t v) { activeCpu->registers.sp = v; }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_af()  { return activeCpu->registers.getAF(); }
EMSCRIPTEN_KEEPALIVE void z80_set_af(uint16_t v) { activeCpu->registers.setAF(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_bc()  { return activeCpu->registers.getBC(); }
EMSCRIPTEN_KEEPALIVE void z80_set_bc(uint16_t v) { activeCpu->registers.setBC(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_de()  { return activeCpu->registers.getDE(); }
EMSCRIPTEN_KEEPALIVE void z80_set_de(uint16_t v) { activeCpu->registers.setDE(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_hl()  { return activeCpu->registers.getHL(); }
EMSCRIPTEN_KEEPALIVE void z80_set_hl(uint16_t v) { activeCpu->registers.setHL(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_ix()  { return activeCpu->registers.getIX(); }
EMSCRIPTEN_KEEPALIVE void z80_set_ix(uint16_t v) { activeCpu->registers.setIX(v); }
EMSCRIPTEN_KEEPALIVE uint16_t z80_get_iy()  { return activeCpu->registers.getIY(); }
EMSCRIPTEN_KEEPALIVE void z80_set_iy(uint16_t v) { activeCpu->registers.setIY(v); }
EMSCRIPTEN_KEEPALIVE uint32_t z80_get_cycles() { return activeCpu->totCycles; }

}