/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/KoreanMapper.h
 * 
 * Domain Layer: Korean / Zemina Cartridge Memory Mapper
 * 
 * Role:
 * Concrete implementation of the Korean/Zemina memory bank mapping standard.
 * Keeps Slot 0 and Slot 1 locked to physical Bank 0 and Bank 1 respectively, 
 * while allowing Slot 2 to swap banks via writes targeting address 0xA000.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Fully substitutes 'BaseMapper' cleanly, 
 *   implementing specific memory interceptors without affecting public signatures.
 * - Single Responsibility Principle (SRP): Focuses exclusively on emulating 
 *   Korean-type memory controller hardware.
 */

#ifndef KOREAN_MAPPER_H
#define KOREAN_MAPPER_H

#include "BaseMapper.h"

class KoreanMapper : public BaseMapper {
public:
    KoreanMapper(const std::vector<uint8_t>& rom);
    virtual ~KoreanMapper() = default;

    // --- Overridden Bus Operations ---
    uint8_t read(uint16_t address) override;
    void write(uint16_t address, uint8_t data) override;
};

#endif // KOREAN_MAPPER_H