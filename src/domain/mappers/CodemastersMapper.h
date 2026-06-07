/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/CodemastersMapper.h
 * 
 * Domain Layer: Codemasters Cartridge Memory Mapper
 * 
 * Role:
 * Concrete implementation of the Codemasters bank mapping standard.
 * Swaps banks on direct CPU writes targeting segment boundary lines.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Fully substitutes 'BaseMapper' cleanly, 
 *   implementing specific memory interceptors without affecting public signatures.
 * - Single Responsibility Principle (SRP): Focuses exclusively on emulating 
 *   Codemasters-type memory controller hardware.
 */

#ifndef CODEMASTERS_MAPPER_H
#define CODEMASTERS_MAPPER_H

#include "BaseMapper.h"

class CodemastersMapper : public BaseMapper {
public:
    CodemastersMapper(const std::vector<uint8_t>& rom);
    virtual ~CodemastersMapper() = default;

    // --- Overridden Bus Operations ---
    uint8_t read(uint16_t address) override;
    void write(uint16_t address, uint8_t data) override;
};

#endif // CODEMASTERS_MAPPER_H