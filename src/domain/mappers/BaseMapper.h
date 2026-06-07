/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/BaseMapper.h
 * 
 * Domain Layer: Abstract Base Cartridge Memory Mapper
 * 
 * Role:
 * Defines the abstract contract and common pointer-mapping structures 
 * for physical cartridge memory banks.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Isolates strictly address-translation 
 *   definitions, keeping them decoupled from specific hardware register writes.
 * - Open/Closed Principle (OCP): New cartridge mappers (e.g., Codemasters, Korean) 
 *   can be supported by simply extending this base class without modifying the system Bus.
 * - Liskov Substitution Principle (LSP): All mappers share a uniform interface 
 *   (read/write), making them completely interchangeable.
 * - Interface Segregation Principle (ISP): Exposes only essential memory bus interfaces 
 *   (read, write, writeSystemRamOverride).
 */

#ifndef BASE_MAPPER_H
#define BASE_MAPPER_H

#include <stdint.h>
#include <vector>

class BaseMapper {
protected:
    const uint8_t* romData;      // Weak pointer referencing the Cartridge's raw ROM data
    uint32_t romSize;            // Copy of the loaded ROM size in bytes
    uint32_t numRealBanks;       // Total amount of available 16KB bank slots

    // Active 16KB memory window pointers (Slot 0, Slot 1, Slot 2)
    // Points directly to the mapped index offsets inside the ROM vector, 
    // ensuring zero-allocation page flipping.
    const uint8_t* mapperSlots[3];

public:
    /**
     * @param rom Const reference to the loaded Cartridge raw ROM vector.
     */
    BaseMapper(const std::vector<uint8_t>& rom);
    virtual ~BaseMapper() = default;

    /**
     * Reads an 8-bit byte from the mapped cartridge address space (0x0000 - 0xBFFF).
     * 
     * @param address 16-bit address.
     * @return 8-bit value.
     */
    virtual uint8_t read(uint16_t address) = 0;

    /**
     * Writes an 8-bit byte to the mapped cartridge address space (usually SRAM write).
     * 
     * @param address 16-bit address.
     * @param data 8-bit value.
     */
    virtual void write(uint16_t address, uint8_t data) = 0;

    /**
     * Intercepts memory writes to mirrored System Work RAM (0xFFFC - 0xFFFF)
     * to trigger mapper register paging.
     * 
     * @param address 16-bit address.
     * @param data 8-bit value.
     */
    virtual void writeSystemRamOverride(uint16_t address, uint8_t data) {}
};

#endif // BASE_MAPPER_H