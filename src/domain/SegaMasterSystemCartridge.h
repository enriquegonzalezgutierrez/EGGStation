/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SegaMasterSystemCartridge.h
 * 
 * Domain Layer: Sega Master System Cartridge Entity
 * 
 * Role:
 * Pure C++ Domain Entity representing a physical Master System Cartridge.
 * Handles raw ROM data storage, copier header validation, and checksum generation.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for validating,
 *   holding, and parsing the ROM binary data. It has no responsibility over 
 *   memory bank switching (which is delegated to the Mappers).
 */

#ifndef SEGA_MASTER_SYSTEM_CARTRIDGE_H
#define SEGA_MASTER_SYSTEM_CARTRIDGE_H

#include <stdint.h>
#include <string>
#include <vector>

class SegaMasterSystemCartridge {
private:
    std::vector<uint8_t> cartridgeRom; // Cleaned ROM binary data
    uint32_t cartridgeSize;            // Size of the cleaned ROM in bytes
    uint32_t romChecksum;              // Calculated 32-bit checksum for identification
    std::string cartridgeName;         // Filename of the loaded ROM

    /**
     * Checks for the presence of the standard SEGA security registration string ("TMR SEGA")
     * at physical address 0x7FF0 in the ROM.
     * 
     * @return true if the physical TMR SEGA signature is verified.
     */
    bool checkForTmrSegaHeader() const;

    /**
     * Calculates the standard 32-bit checksum of the loaded ROM array.
     * 
     * @return Unsigned 32-bit checksum value.
     */
    uint32_t calculateChecksum();

public:
    SegaMasterSystemCartridge();
    ~SegaMasterSystemCartridge() = default;

    /**
     * Loads a raw ROM buffer, strips copier headers (like Game Doctor 512-byte headers),
     * and performs structure and checksum validations.
     * 
     * @param filename The name of the file being loaded.
     * @param rawData Pointer to the raw ROM binary buffer.
     * @param size The size of the raw buffer in bytes.
     */
    void load(const std::string& filename, const uint8_t* rawData, uint32_t size);

    // --- Domain Getters ---
    const std::vector<uint8_t>& getRomData() const;
    uint32_t getCartridgeSize() const;
    uint32_t getRomChecksum() const;
    const std::string& getCartridgeName() const;
};

#endif // SEGA_MASTER_SYSTEM_CARTRIDGE_H