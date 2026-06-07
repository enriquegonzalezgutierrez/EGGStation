/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SegaMasterSystemCartridge.cpp
 * 
 * Domain Layer: Sega Master System Cartridge Entity
 * 
 * Role:
 * Implementation of the SegaMasterSystemCartridge entity.
 * Handles the binary parsing, checksum calculation, and copier header stripping 
 * logic for physical Sega Master System ROM files.
 */

#include "SegaMasterSystemCartridge.h"
#include <iostream>

SegaMasterSystemCartridge::SegaMasterSystemCartridge() 
    : cartridgeSize(0), romChecksum(0), cartridgeName("") {}

void SegaMasterSystemCartridge::load(const std::string& filename, const uint8_t* rawData, uint32_t size) {
    uint32_t startOffset = 0;

    // Detect and strip standard 512-byte copier headers (e.g., Game Doctor backup headers)
    if (size % 0x4000 == 512) {
        startOffset = 512;
        std::cout << "[Cartridge] Detected and stripped 512-byte copier header." << std::endl;
    }

    cartridgeRom.clear();
    uint32_t cleanSize = size - startOffset;
    cartridgeRom.resize(cleanSize);
    
    // Copy the binary payload safely into the internal domain vector
    memcpy(cartridgeRom.data(), rawData + startOffset, cleanSize);
    cartridgeSize = cleanSize;
    cartridgeName = filename;

    // Generate unique ROM checksum identity
    romChecksum = calculateChecksum();
    std::cout << "[Cartridge] Checksum calculated successfully: 0x" 
              << std::hex << romChecksum << std::dec << std::endl;

    // Validate standard Sega hardware registration header at 0x7FF0
    if (checkForTmrSegaHeader()) {
        std::cout << "[Cartridge] Verified SEGA physical registration header at offset 0x7FF0." << std::endl;
    } else {
        std::cout << "[Cartridge] Warning: No standard SEGA registration header detected." << std::endl;
    }
}

bool SegaMasterSystemCartridge::checkForTmrSegaHeader() const {
    if (cartridgeRom.size() < 0x8000) {
        return false; // ROM is too small to contain a standard header
    }

    const char tmrSegaSignature[8] = {'T', 'M', 'R', ' ', 'S', 'E', 'G', 'A'};
    
    for (int i = 0; i < 8; i++) {
        if (cartridgeRom[0x7FF0 + i] != static_cast<uint8_t>(tmrSegaSignature[i])) {
            return false;
        }
    }
    return true;
}

uint32_t SegaMasterSystemCartridge::calculateChecksum() {
    uint32_t checksum = 0;
    uint32_t length = cartridgeRom.size();

    // Enforce 32-bit dword-aligned loops. 
    // This replicates the unsigned 32-bit accumulation of the JavaScript implementation.
    for (uint32_t i = 0; i < length; i += 4) {
        uint32_t chunk = cartridgeRom[i];
        if (i + 1 < length) chunk |= (cartridgeRom[i + 1] << 8);
        if (i + 2 < length) chunk |= (cartridgeRom[i + 2] << 16);
        if (i + 3 < length) chunk |= (cartridgeRom[i + 3] << 24);

        checksum += chunk; // Naturally wraps around on 32-bit overflow
    }
    return checksum;
}

// --- Getters ---

const std::vector<uint8_t>& SegaMasterSystemCartridge::getRomData() const {
    return cartridgeRom;
}

uint32_t SegaMasterSystemCartridge::getCartridgeSize() const {
    return cartridgeSize;
}

uint32_t SegaMasterSystemCartridge::getRomChecksum() const {
    return romChecksum;
}

const std::string& SegaMasterSystemCartridge::getCartridgeName() const {
    return cartridgeName;
}