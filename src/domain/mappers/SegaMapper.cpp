/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/mappers/SegaMapper.cpp
 * 
 * Domain Layer: Sega Cartridge Memory Mapper
 * 
 * Role:
 * Implementation of the Sega memory bank mapping standard.
 * Emulates the SEGA paging chip by routing pointer addresses on register writes.
 */

#include "SegaMapper.h"
#include <string.h>

SegaMapper::SegaMapper(const std::vector<uint8_t>& rom) : BaseMapper(rom) {
    // Clear save RAM memory on cold boot
    memset(cartridgeRam, 0, sizeof(cartridgeRam));
    cartridgeRamBankSelect = 0;
    mapperSlot2IsCartridgeRam = false;

    // Default startup mapping offsets: Bank 0, Bank 1, Bank 2
    if (romData) {
        mapperSlots[0] = (numRealBanks > 0) ? &romData[0] : nullptr;
        mapperSlots[1] = (numRealBanks > 1) ? &romData[1 * 0x4000] : nullptr;
        mapperSlots[2] = (numRealBanks > 2) ? &romData[2 * 0x4000] : nullptr;
    }
}

uint8_t SegaMapper::read(uint16_t address) {
    if (address <= 0x03FF) {
        // Interrupt Vector Lockdown: Address range 0x0000 - 0x03FF containing 
        // the reset and IRQ vectors is hardware-locked to Bank 0 to prevent 
        // system crashes during dynamic page swapping.
        return romData[address];
    } 
    else if (address <= 0x3FFF) {
        return mapperSlots[0] ? mapperSlots[0][address] : 0;
    } 
    else if (address <= 0x7FFF) {
        return mapperSlots[1] ? mapperSlots[1][address - 0x4000] : 0;
    } 
    else if (address <= 0xBFFF) {
        // Slot 2 can map either cartridge ROM banks or Cartridge Save SRAM
        if (mapperSlot2IsCartridgeRam) {
            uint32_t sramOffset = (address - 0x8000) + (cartridgeRamBankSelect * 0x4000);
            return cartridgeRam[sramOffset & 0x7FFF];
        } else {
            return mapperSlots[2] ? mapperSlots[2][address - 0x8000] : 0;
        }
    }
    return 0;
}

void SegaMapper::write(uint16_t address, uint8_t data) {
    if (address >= 0x8000 && address <= 0xBFFF) {
        // Intercept writes targeting backup Save SRAM
        if (mapperSlot2IsCartridgeRam) {
            uint32_t sramOffset = (address - 0x8000) + (cartridgeRamBankSelect * 0x4000);
            cartridgeRam[sramOffset & 0x7FFF] = data;
        }
    }
}

void SegaMapper::writeSystemRamOverride(uint16_t address, uint8_t data) {
    if (address == 0xFFFC) {
        // Cartridge SRAM Control Register:
        // Bit 2: Selects SRAM Bank (0: Bank 0, 1: Bank 1)
        // Bit 3: Map state (0: ROM in Slot 2, 1: SRAM in Slot 2)
        cartridgeRamBankSelect = (data & 0x04) ? 1 : 0;
        mapperSlot2IsCartridgeRam = (data & 0x08) != 0;
    } 
    else if (address == 0xFFFD) {
        // Swap Slot 0 (0x0000 - 0x3FFF)
        mapperSlots[0] = &romData[(data % numRealBanks) * 0x4000];
    } 
    else if (address == 0xFFFE) {
        // Swap Slot 1 (0x4000 - 0x7FFF)
        mapperSlots[1] = &romData[(data % numRealBanks) * 0x4000];
    } 
    else if (address == 0xFFFF) {
        // Swap Slot 2 (0x8000 - 0xBFFF)
        mapperSlots[2] = &romData[(data % numRealBanks) * 0x4000];
    }
}

// --- State Serialization Helpers ---

uint8_t* SegaMapper::getSramPointer() {
    return cartridgeRam;
}

uint8_t SegaMapper::getSramBankSelect() const {
    return cartridgeRamBankSelect;
}

bool SegaMapper::isSlot2Ram() const {
    return mapperSlot2IsCartridgeRam;
}

void SegaMapper::setSramState(uint8_t bankSelect, bool isRam) {
    cartridgeRamBankSelect = bankSelect;
    mapperSlot2IsCartridgeRam = isRam;
}