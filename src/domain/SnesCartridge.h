/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SnesCartridge.h
 * 
 * Domain Layer: Super Nintendo (SNES) Cartridge Entity
 * 
 * Role:
 * Defines the physical memory structures, internal SNES header metadata fields,
 * and interface signatures for handling LoROM/HiROM cartridge mapping and SRAM.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Responsible solely for representing
 *   the cartridge hardware, parsing rom files, and routing address spaces.
 */

#ifndef SNES_CARTRIDGE_H
#define SNES_CARTRIDGE_H

#include <stdint.h>
#include <string>
#include <vector>

/**
 * Standard internal SNES header metadata fields parsed from ROM offsets.
 */
struct SnesHeader {
    std::string name;
    uint8_t type;
    uint8_t speed;
    uint8_t chips;
    uint32_t romSize;
    uint32_t ramSize;
    bool isPal;
};

class SnesCartridge {
private:
    std::vector<uint8_t> romData;   // Cleaned, SMC-headerless ROM data
    std::vector<uint8_t> sramData;  // Non-volatile Battery Save RAM
    SnesHeader header;
    bool isHirom;
    uint32_t banks;                 // Total number of 32KB logical banks
    uint32_t sramSize;              // Size of the mapped SRAM in bytes
    bool hasSram;                   // Cache flag indicating if SRAM chips are present

    /**
     * Determines whether the loaded ROM uses LoROM or HiROM memory mapping
     * by validating the checksum complements at standard internal header locations.
     * 
     * @param rom Pointer to the stripped ROM buffer.
     * @param size Size of the ROM buffer in bytes.
     * @return true if HiROM is detected, false otherwise.
     */
    bool detectHirom(const uint8_t* rom, uint32_t size);

    /**
     * Parses the internal SNES header located at $7FC0 (LoROM) or $FFC0 (HiROM)
     * and populates the metadata structure.
     * 
     * @param rom Pointer to the stripped ROM buffer.
     * @param size Size of the ROM buffer in bytes.
     */
    void parseHeader(const uint8_t* rom, uint32_t size);

public:
    SnesCartridge();
    ~SnesCartridge() = default;

    /**
     * Processes raw cartridge binary data. Detects and strips 512-byte SMC
     * copier headers if present, allocates internal buffers, and decodes the header.
     * 
     * @param rawData Pointer to the raw file buffer uploaded by the user.
     * @param size The size of the raw buffer in bytes.
     */
    void load(const uint8_t* rawData, uint32_t size);

    /**
     * Resets the volatile components of the cartridge.
     * 
     * @param hard If true, clears the battery-backed SRAM completely.
     */
    void reset(bool hard);

    /**
     * Reads an 8-bit byte from the cartridge address space (ROM or SRAM)
     * using the current mapping strategy (LoROM/HiROM).
     * 
     * @param bank 8-bit bank index.
     * @param address 16-bit address offset.
     * @return 8-bit value.
     */
    uint8_t read(uint8_t bank, uint16_t address);

    /**
     * Writes an 8-bit byte to the cartridge address space (SRAM).
     * 
     * @param bank 8-bit bank index.
     * @param address 16-bit address offset.
     * @param value 8-bit value to write.
     */
    void write(uint8_t bank, uint16_t address, uint8_t value);

    // --- Domain Getters ---
    bool getIsHirom() const { return isHirom; }
    bool getIsPal() const { return header.isPal; }
    uint32_t getSramSize() const { return sramSize; }
    uint8_t* getSramPointer() { return sramData.data(); }
    const std::vector<uint8_t>& getRomData() const { return romData; }
    const SnesHeader& getHeader() const { return header; }
};

#endif // SNES_CARTRIDGE_H