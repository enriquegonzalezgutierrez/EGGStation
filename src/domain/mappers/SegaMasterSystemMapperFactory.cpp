/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/SegaMasterSystemMapperFactory.cpp
 * 
 * Domain Layer: Sega Master System Mapper Factory
 * 
 * Role:
 * Implementation of the Mapper Factory. Analyzes ROM metadata and checksums
 * to select the correct hardware mapping strategy.
 */

#include "SegaMasterSystemMapperFactory.h"
#include "SegaMapper.h"
#include "CodemastersMapper.h"
#include "KoreanMapper.h"
#include <iostream>
#include <cstring>

std::unique_ptr<BaseMapper> SegaMasterSystemMapperFactory::createMapper(SegaMasterSystemCartridge& cartridge) {
    // Corrected scope resolution from . to :: for C++ enum classes
    SegaMasterSystemMapperHardwareType hardwareType = SegaMasterSystemMapperHardwareType::SEGA;
    
    uint32_t checksum = cartridge.getRomChecksum();
    const std::vector<uint8_t>& rom = cartridge.getRomData();

    // 1. Soft-patch compatibility rule for Altered Beast export ROM
    // This specific dump has a bug that causes a crash on real hardware and emulators
    if (checksum == 0x38f22e98) {
        std::cout << "[MapperFactory] Applying Altered Beast compatibility soft-patch." << std::endl;
        uint8_t* mutableRom = const_cast<uint8_t*>(rom.data());
        if (rom.size() > 0x31C) {
            mutableRom[0x31B] = 0x00;
            mutableRom[0x31C] = 0x00;
        }
    }

    // 2. Automated Codemasters detection rule
    // Codemasters ROMs contain a unique checksum structure at offsets 0x7FE6 - 0x7FE9
    if (rom.size() >= 0x8000) {
        uint16_t checksum1 = (rom[0x7FE7] << 8) | rom[0x7FE6];
        uint16_t checksum2 = (rom[0x7FE9] << 8) | rom[0x7FE8];
        
        if (checksum1 != 0 && (static_cast<uint16_t>(0x10000 - checksum1) == checksum2)) {
            std::cout << "[MapperFactory] Identified Codemasters hardware signature." << std::endl;
            hardwareType = SegaMasterSystemMapperHardwareType::CODEMASTERS;
        }
    }

    // 3. Automated Korean / Zemina hardware detection rule
    // Compares calculated checksums against known Korean software dumps
    if (
        checksum == 0x5a7b2220 || // Dodgeball King
        checksum == 0x224d46cf || // Sangokushi 3
        checksum == 0x324884ba    // Jang Pung 3
    ) {
        std::cout << "[MapperFactory] Identified Korean/Zemina hardware via checksum." << std::endl;
        hardwareType = SegaMasterSystemMapperHardwareType::KOREAN;
    }

    // 4. Instantiation and Strategy injection using C++ scope resolution (::)
    switch (hardwareType) {
        case SegaMasterSystemMapperHardwareType::CODEMASTERS:
            return std::make_unique<CodemastersMapper>(rom);
            
        case SegaMasterSystemMapperHardwareType::KOREAN:
            return std::make_unique<KoreanMapper>(rom);
            
        case SegaMasterSystemMapperHardwareType::SEGA:
        default:
            return std::make_unique<SegaMapper>(rom);
    }
}