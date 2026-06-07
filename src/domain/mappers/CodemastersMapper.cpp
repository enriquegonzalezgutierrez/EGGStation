/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/CodemastersMapper.cpp
 * 
 * Domain Layer: Codemasters Cartridge Memory Mapper
 * 
 * Role:
 * Implementation of the Codemasters bank mapping standard.
 * Swaps banks on direct CPU writes targeting segment boundary lines.
 */

#include "CodemastersMapper.h"

CodemastersMapper::CodemastersMapper(const std::vector<uint8_t>& rom) : BaseMapper(rom) {
    // Default startup mapping offsets: Bank 0, Bank 1, Bank 0
    if (romData) {
        mapperSlots[0] = (numRealBanks > 0) ? &romData[0] : nullptr;
        mapperSlots[1] = (numRealBanks > 1) ? &romData[1 * 0x4000] : nullptr;
        mapperSlots[2] = (numRealBanks > 0) ? &romData[0] : nullptr; // Maps back to Bank 0 on boot
    }
}

uint8_t CodemastersMapper::read(uint16_t address) {
    if (address <= 0x3FFF) {
        // Direct read. Codemasters mappers do NOT incorporate the 
        // 1KB vector lockdown at 0x0000 - 0x03FF.
        return mapperSlots[0] ? mapperSlots[0][address] : 0;
    } 
    else if (address <= 0x7FFF) {
        return mapperSlots[1] ? mapperSlots[1][address - 0x4000] : 0;
    } 
    else if (address <= 0xBFFF) {
        return mapperSlots[2] ? mapperSlots[2][address - 0x8000] : 0;
    }
    return 0;
}

void CodemastersMapper::write(uint16_t address, uint8_t data) {
    if (address == 0x0000) {
        // Swap Slot 0 (0x0000 - 0x3FFF)
        mapperSlots[0] = &romData[(data % numRealBanks) * 0x4000];
    } 
    else if (address == 0x4000) {
        // Swap Slot 1 (0x4000 - 0x7FFF)
        mapperSlots[1] = &romData[(data % numRealBanks) * 0x4000];
    } 
    else if (address == 0x8000) {
        // Swap Slot 2 (0x8000 - 0xBFFF)
        mapperSlots[2] = &romData[(data % numRealBanks) * 0x4000];
    }
}