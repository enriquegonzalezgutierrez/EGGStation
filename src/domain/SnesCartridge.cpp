/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SnesCartridge.cpp
 * 
 * Domain Layer: Super Nintendo (SNES) Cartridge Entity
 * 
 * Role:
 * Implements cartridge ROM image mapping, SMC header extraction,
 * auto-detection of HiROM/LoROM specifications, and non-volatile SRAM 
 * address routing.
 */

#include "SnesCartridge.h"
#include <algorithm>
#include <iostream>

SnesCartridge::SnesCartridge() 
    : isHirom(false), banks(0), sramSize(0), hasSram(false) {}

void SnesCartridge::load(const uint8_t* rawData, uint32_t size) {
    uint32_t startOffset = 0;
    
    // Auto-detect and strip standard 512-byte SMC copier headers if present
    if ((size - 512) % 0x8000 == 0) {
        startOffset = 512;
        std::cout << "[SnesCartridge] Cleaned 512-byte SMC copier header from ROM payload." << std::endl;
    }

    uint32_t cleanSize = size - startOffset;
    romData.resize(cleanSize);
    std::copy(rawData + startOffset, rawData + size, romData.begin());

    // Resolve internal mapping architecture
    isHirom = detectHirom(romData.data(), cleanSize);
    parseHeader(romData.data(), cleanSize);

    banks = header.romSize / 0x8000;
    sramSize = header.ramSize;
    hasSram = (header.chips > 0) && (sramSize > 0);

    if (hasSram) {
        sramData.resize(sramSize);
        std::fill(sramData.begin(), sramData.end(), 0);
    }

    std::cout << "[SnesCartridge] Loaded Game: \"" << header.name << "\"" << std::endl;
    std::cout << "[SnesCartridge] Mapping: " << (isHirom ? "HiROM" : "LoROM") << std::endl;
    std::cout << "[SnesCartridge] Size: " << cleanSize << " bytes. SRAM: " << sramSize << " bytes." << std::endl;
}

bool SnesCartridge::detectHirom(const uint8_t* rom, uint32_t size) {
    if (size < 0x10000) {
        return false; // ROM is too small for standard HiROM checksum offsets
    }

    uint16_t loromSum = rom[0x7FDC] | (rom[0x7FDD] << 8);
    uint16_t loromComp = rom[0x7FDA] | (rom[0x7FDB] << 8);
    
    uint16_t hiromSum = rom[0xFFDC] | (rom[0xFFDD] << 8);
    uint16_t hiromComp = rom[0xFFDA] | (rom[0xFFDB] << 8);

    // Verify complements matching standard hardware checks
    bool loromValid = ((loromSum ^ loromComp) == 0xFFFF) && (loromSum != 0 && loromSum != 0xFFFF);
    bool hiromValid = ((hiromSum ^ hiromComp) == 0xFFFF) && (hiromSum != 0 && hiromSum != 0xFFFF);

    if (hiromValid && !loromValid) return true;
    if (loromValid && !hiromValid) return false;

    // Fallback: Check map mode byte at offset 0x15 of internal SNES header
    uint8_t hiromMap = rom[0xFFD5];
    if ((hiromMap & 0x0F) == 1) {
        return true;
    }
    return false;
}

void SnesCartridge::parseHeader(const uint8_t* rom, uint32_t size) {
    uint32_t offset = isHirom ? 0xFFC0 : 0x7FC0;
    if (size < offset + 0x30) return;

    header.name = "";
    for (int i = 0; i < 21; i++) {
        char c = static_cast<char>(rom[offset + i]);
        // Strip non-printable ASCII characters for clean logs
        if (c >= 32 && c <= 126) {
            header.name += c;
        }
    }

    header.type = rom[offset + 0x15] & 0x0F;
    header.speed = rom[offset + 0x15] >> 4;
    header.chips = rom[offset + 0x16];
    
    // Parse sizes using exponent shifting
    header.romSize = 0x400 << rom[offset + 0x17];
    header.ramSize = rom[offset + 0x18] > 0 ? (0x400 << rom[offset + 0x18]) : 0;

    uint8_t regionCode = rom[offset + 0x19];
    header.isPal = (regionCode >= 0x02 && regionCode <= 0x0C);
}

void SnesCartridge::reset(bool hard) {
    if (hard && hasSram) {
        std::fill(sramData.begin(), sramData.end(), 0);
    }
}

uint8_t SnesCartridge::read(uint8_t bank, uint16_t address) {
    if (!isHirom) {
        // LoROM Mapping Logic
        if (address < 0x8000) {
            if (bank >= 0x70 && bank < 0x7E && hasSram) {
                uint32_t sramOffset = (((bank - 0x70) << 15) | (address & 0x7FFF)) & (sramSize - 1);
                return sramData[sramOffset];
            }
        }
        return romData[((bank & (banks - 1)) << 15) | (address & 0x7FFF)];
    } else {
        // HiROM Mapping Logic
        if (address >= 0x6000 && address < 0x8000 && hasSram) {
            if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                uint32_t sramOffset = (((bank & 0x3F) << 13) | (address & 0x1FFF)) & (sramSize - 1);
                return sramData[sramOffset];
            }
        }
        return romData[(((bank & 0x3F) & (banks - 1)) << 16) | address];
    }
}

void SnesCartridge::write(uint8_t bank, uint16_t address, uint8_t value) {
    if (!isHirom) {
        // LoROM SRAM Writes
        if (address < 0x8000 && bank >= 0x70 && bank < 0x7E && hasSram) {
            uint32_t sramOffset = (((bank - 0x70) << 15) | (address & 0x7FFF)) & (sramSize - 1);
            sramData[sramOffset] = value;
        }
    } else {
        // HiROM SRAM Writes
        if (address >= 0x6000 && address < 0x8000 && hasSram) {
            if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                uint32_t sramOffset = (((bank & 0x3F) << 13) | (address & 0x1FFF)) & (sramSize - 1);
                sramData[sramOffset] = value;
            }
        }
    }
}