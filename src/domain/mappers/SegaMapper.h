/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/SegaMapper.h
 * 
 * Domain Layer: Sega Cartridge Memory Mapper
 * 
 * Role:
 * Concrete implementation of the Sega memory bank mapping standard.
 * Supports three 16KB execution slots, low-vector redirection, and 32KB on-board
 * battery-backed Save SRAM.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Fully substitutes 'BaseMapper' without 
 *   requiring the master Bus to understand battery-backed RAM or bank switching.
 * - Single Responsibility Principle (SRP): Focuses exclusively on emulating 
 *   Sega-type memory controller hardware.
 */

#ifndef SEGA_MAPPER_H
#define SEGA_MAPPER_H

#include "BaseMapper.h"

class SegaMapper : public BaseMapper {
private:
    // 32KB on-board battery-backed Save SRAM
    uint8_t cartridgeRam[0x8000];
    
    // SRAM bank offset selector (0 or 1 mapping to active 16KB window)
    uint8_t cartridgeRamBankSelect;
    
    // True if Slot 2 (0x8000 - 0xBFFF) is currently routed to SRAM instead of ROM
    bool mapperSlot2IsCartridgeRam;

public:
    SegaMapper(const std::vector<uint8_t>& rom);
    virtual ~SegaMapper() = default;

    // --- Overridden Bus Operations ---
    uint8_t read(uint16_t address) override;
    void write(uint16_t address, uint8_t data) override;
    void writeSystemRamOverride(uint16_t address, uint8_t data) override;

    // --- State Serialization Helpers (Temporal Physics / Rewind) ---
    uint8_t* getSramPointer();
    uint8_t getSramBankSelect() const;
    bool isSlot2Ram() const;
    void setSramState(uint8_t bankSelect, bool isRam);
};

#endif // SEGA_MAPPER_H