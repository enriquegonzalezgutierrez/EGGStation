/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/SegaMasterSystemMapperFactory.h
 * 
 * Domain Layer: Sega Master System Mapper Factory
 * 
 * Role:
 * Domain Service / Factory responsible for identifying the cartridge hardware 
 * type and instantiating the appropriate BaseMapper strategy.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Isolates the complex logic of ROM 
 *   identification (checksum analysis, signature checking) from the Bus and CPU.
 * - Dependency Inversion Principle (DIP): Returns the high-level 'BaseMapper' 
 *   abstraction, decoupling the system from concrete mapper implementations.
 * - Open/Closed Principle (OCP): New hardware types can be added to the detection 
 *   logic without affecting existing mappers.
 */

#ifndef SEGA_MASTER_SYSTEM_MAPPER_FACTORY_H
#define SEGA_MASTER_SYSTEM_MAPPER_FACTORY_H

#include "BaseMapper.h"
#include "../SegaMasterSystemCartridge.h"
#include <memory>

/**
 * Enumeration of supported hardware paging chips.
 */
enum class SegaMasterSystemMapperHardwareType {
    SEGA,
    CODEMASTERS,
    KOREAN
};

class SegaMasterSystemMapperFactory {
public:
    /**
     * Analyzes cartridge properties (checksums, file structures) and applies 
     * soft-patches if necessary to return the correct Mapper instance.
     * 
     * @param cartridge Reference to the loaded Domain Cartridge entity.
     * @return A unique pointer to the instantiated concrete BaseMapper subclass.
     */
    static std::unique_ptr<BaseMapper> createMapper(SegaMasterSystemCartridge& cartridge);
};

#endif // SEGA_MASTER_SYSTEM_MAPPER_FACTORY_H