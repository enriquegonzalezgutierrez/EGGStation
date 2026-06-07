/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/BaseMapper.cpp
 * 
 * Domain Layer: Abstract Base Cartridge Memory Mapper
 * 
 * Role:
 * Implementation of the BaseMapper base class.
 * Sets up weak-pointer linkages to the raw Cartridge binary data and 
 * calculates physical 16KB bank sizes.
 */

#include "BaseMapper.h"

BaseMapper::BaseMapper(const std::vector<uint8_t>& rom) {
    if (!rom.empty()) {
        romData = rom.data();
        romSize = rom.size();
        
        // Master System ROMs are partitioned into logical 16KB bank sizes (0x4000)
        numRealBanks = romSize / 0x4000;
        if (numRealBanks == 0) {
            numRealBanks = 1; // Safeguard against sub-16KB homebrew ROMs
        }
    } else {
        romData = nullptr;
        romSize = 0;
        numRealBanks = 0;
    }

    // Initialize memory pointer execution slots to null. 
    // Derived concrete classes will point these to active offset partitions.
    mapperSlots[0] = nullptr;
    mapperSlots[1] = nullptr;
    mapperSlots[2] = nullptr;
}