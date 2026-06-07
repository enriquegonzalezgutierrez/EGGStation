/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/KoreanMapper.cpp
 * 
 * Domain Layer: Korean / Zemina Cartridge Memory Mapper
 * 
 * Role:
 * Implementation of the Korean/Zemina memory bank mapping standard.
 * Keeps Slot 0 and Slot 1 locked to physical Bank 0 and Bank 1 respectively, 
 * while allowing Slot 2 to swap banks via writes targeting address 0xA000.
 */

#include "KoreanMapper.h"

KoreanMapper::KoreanMapper(const std::vector<uint8_t>& rom) : BaseMapper(rom) {
    // Default startup mapping offsets: Bank 0, Bank 1, Bank 0
    if (romData) {
        mapperSlots[0] = (numRealBanks > 0) ? &romData[0] : nullptr;
        mapperSlots[1] = (numRealBanks > 1) ? &romData[1 * 0x4000] : nullptr;
        mapperSlots[2] = (numRealBanks > 0) ? &romData[0] : nullptr; // Maps to Bank 0 initially
    }
}

uint8_t KoreanMapper::read(uint16_t address) {
    if (address <= 0x3FFF) {
        // Direct read. Permanent hardware-lock to Bank 0.
        return mapperSlots[0] ? mapperSlots[0][address] : 0;
    } 
    else if (address <= 0x7FFF) {
        // Direct read. Permanent hardware-lock to Bank 1.
        return mapperSlots[1] ? mapperSlots[1][address - 0x4000] : 0;
    } 
    else if (address <= 0xBFFF) {
        // Direct read. Dynamic Slot 2 window.
        return mapperSlots[2] ? mapperSlots[2][address - 0x8000] : 0;
    }
    return 0;
}

void KoreanMapper::write(uint16_t address, uint8_t data) {
    if (address == 0xA000) {
        // Dynamic Slot 2 page register swapping: 
        // Any CPU write targeting exactly 0xA000 triggers bank switching.
        mapperSlots[2] = &romData[(data % numRealBanks) * 0x4000];
    }
}