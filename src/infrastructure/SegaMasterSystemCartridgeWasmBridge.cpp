/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/infrastructure/SegaMasterSystemCartridgeWasmBridge.cpp
 * 
 * Infrastructure Layer: Emscripten WebAssembly Port Bridge (Cartridge & Mappers)
 * 
 * Role:
 * Bridges the C++ Cartridge and Mapper Domain entities to WebAssembly. 
 * Manages the static instances of the loaded cartridge and the active 
 * polymorphic mapper strategy.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): The JavaScript system Bus depends 
 *   on this bridge's abstract functional interface, while the bridge orchestrates 
 *   the concrete Domain logic (Factory -> Cartridge -> Mapper).
 */

#include <emscripten.h>
#include <string>
#include <memory>
#include "SegaMasterSystemCartridge.h"
#include "mappers/BaseMapper.h"
#include "mappers/SegaMasterSystemMapperFactory.h"
#include "mappers/SegaMapper.h"

// --- Active Domain Instances ---
static SegaMasterSystemCartridge globalCartridge;
static std::unique_ptr<BaseMapper> activeMapper;

extern "C" {

/**
 * Loads a new ROM into the C++ Domain, triggers checksum calculation, 
 * and instantiates the correct Mapper hardware using the Factory.
 * 
 * @param filename Pointer to the C-string filename.
 * @param data Pointer to the raw ROM binary in WASM memory.
 * @param size Size of the ROM buffer.
 */
EMSCRIPTEN_KEEPALIVE
void cart_load(const char* filename, const uint8_t* data, uint32_t size) {
    globalCartridge.load(std::string(filename), data, size);
    
    // Instantiate the mapper polymorphically through the Domain Factory
    activeMapper = SegaMasterSystemMapperFactory::createMapper(globalCartridge);
}

EMSCRIPTEN_KEEPALIVE
uint8_t cart_read(uint16_t address) {
    return activeMapper ? activeMapper->read(address) : 0x00;
}

EMSCRIPTEN_KEEPALIVE
void cart_write(uint16_t address, uint8_t data) {
    if (activeMapper) {
        activeMapper->write(address, data);
    }
}

EMSCRIPTEN_KEEPALIVE
void cart_write_system_ram_override(uint16_t address, uint8_t data) {
    if (activeMapper) {
        activeMapper->writeSystemRamOverride(address, data);
    }
}

// ========================================================================
// DOMAIN METADATA EXPORTS
// ========================================================================

EMSCRIPTEN_KEEPALIVE
uint32_t cart_get_checksum() {
    return globalCartridge.getRomChecksum();
}

EMSCRIPTEN_KEEPALIVE
uint32_t cart_get_size() {
    return globalCartridge.getCartridgeSize();
}

// ========================================================================
// SRAM PERSISTENCE & REWIND SYNCHRONIZERS
// ========================================================================

/**
 * Returns a pointer to the Save SRAM buffer if the active mapper is a SegaMapper.
 * Used by JS to persist game saves to IndexedDB.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* cart_get_sram_pointer() {
    auto* sMapper = dynamic_cast<SegaMapper*>(activeMapper.get());
    return sMapper ? sMapper->getSramPointer() : nullptr;
}

EMSCRIPTEN_KEEPALIVE
void cart_get_sram_state(uint8_t* bankSelect, uint8_t* isSlot2Ram) {
    auto* sMapper = dynamic_cast<SegaMapper*>(activeMapper.get());
    if (sMapper) {
        *bankSelect = sMapper->getSramBankSelect();
        *isSlot2Ram = sMapper->isSlot2Ram() ? 1 : 0;
    }
}

EMSCRIPTEN_KEEPALIVE
void cart_set_sram_state(uint8_t bankSelect, uint8_t isSlot2Ram) {
    auto* sMapper = dynamic_cast<SegaMapper*>(activeMapper.get());
    if (sMapper) {
        sMapper->setSramState(bankSelect, isSlot2Ram != 0);
    }
}

}