/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/Sega315_5124.h
 * 
 * Domain Layer: Sega 315-5124 Video Display Processor (VDP)
 * 
 * Role:
 * Pure C++ Domain Entity representing the Master System graphics chip.
 * Manages VRAM, Color RAM (CRAM), registers, and the 32-bit pixel rendering pipeline.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Handles strictly video memory state, 
 *   scanline timing, and pixel rasterization. Upscaling and WebGL are left to JS.
 * - Interface Segregation Principle (ISP): Exposes only bus-level I/O methods 
 *   (read/write control and data ports) to the outside world.
 */

#ifndef SEGA_315_5124_H
#define SEGA_315_5124_H

#include <stdint.h>
#include <stdbool.h>

// VDP Video Standard Modes
#define VDP_STANDARD_NTSC 0
#define VDP_STANDARD_PAL  1

// Internal Write Modes for the Data Port
#define VDP_WRITE_MODE_VRAM 0
#define VDP_WRITE_MODE_CRAM 1

class Sega315_5124 {
private:
    // --- Hardware Memory Arrays ---
    uint8_t vRam[0x4000];       // 16KB Video RAM
    uint8_t colorRam[0x20];     // 32-byte Color Palette RAM (CRAM)

    // --- High-Performance Zero-Copy Buffers ---
    uint32_t frameBuffer[256 * 240]; // 32-bit packed ABGR pixel output
    uint8_t  priBuffer[256 * 240];   // Priority map for Sprite vs Background overlap
    uint8_t  spriteBuffer[256 * 240]; // Sprite collision map

    // --- Video Registers & State ---
    uint8_t registers[11];      // Internal VDP Registers (0x00 to 0x0A)
    uint16_t controlWord;
    bool controlWordFlag;
    uint16_t dataPortAddress;
    uint8_t dataPortWriteMode;
    uint8_t readBufferByte;
    uint8_t statusFlags;

    // --- Decoded Base Memory Addresses ---
    uint8_t nameTableBaseAddress;
    uint16_t spriteAttributeTableBaseAddress;
    uint16_t spritePatternGeneratorBaseAddress;

    // --- Timings & Counters ---
    int vdpStandard;            // NTSC (0) or PAL (1)
    int numberOfScanlines;
    int clockCyclesPerScanline;
    int currentScanlineIndex;
    int lineCounter;
    int vcounter;
    int hcounter;
    int yScreenLines;           // 192, 224, or 240 active lines

    // --- Internal Rendering Helpers (SRP) ---
    void writeByteToRegister(uint8_t regIdx, uint8_t value);
    void drawScanline(int scanlineNum);
    void drawMode4Background(int scanlineNum);
    void drawMode4Sprites(int scanlineNum);
    void drawMode2Background(int scanlineNum);
    void drawMode2Sprites(int scanlineNum);
    
    void drawLineTile(uint16_t addr, int x, int y, int pal, bool flipH, bool flipV, int fineScrollY, int priFlag);
    void drawSpriteSlice(uint16_t addr, int spriteX, int scanlineNum, int sliceY);
    void cleanSpriteBuffer();

    // Constant lookup for Master System color palette mapping
    static const uint8_t analogColorScale[4];
    static const uint8_t sg1000palette[48];

public:
    Sega315_5124();
    ~Sega315_5124() = default;

    /**
     * Initializes the VDP, clearing memory and setting default register values.
     * @param mode VDP_STANDARD_NTSC (0) or VDP_STANDARD_PAL (1)
     */
    void initialize(int mode);

    // --- Hardware Bus I/O Interface ---
    void writeByteToControlPort(uint8_t value);
    void writeByteToDataPort(uint8_t value);
    uint8_t readByteFromControlPort();
    uint8_t readByteFromDataPort();
    uint8_t readDataPort(uint8_t port); // Reads H/V Counters

    /**
     * Steps the VDP hardware clock.
     * @param cycles Master CPU clock cycles elapsed since last step.
     * @param raiseInterrupt Pointer to a boolean flag set to true if an IRQ is generated.
     * @return true if a full frame has been completed (V-Blank reached).
     */
    bool update(int cycles, bool* raiseInterrupt);

    // --- Memory Pointers for JS Bridge ---
    uint32_t* getFrameBufferPointer();
    
    // --- State Serialization (For Temporal Physics / Rewind) ---
    uint8_t* getVramPointer();
    uint8_t* getCramPointer();
    uint8_t* getRegistersPointer();
    void setInternalState(int scanlineIdx, int lineCnt, bool ctrlFlag, uint16_t ctrlWord, 
                          uint16_t dataAddr, uint8_t writeMode, uint8_t readBuf, uint8_t status);
    void getInternalState(int* scanlineIdx, int* lineCnt, bool* ctrlFlag, uint16_t* ctrlWord, 
                          uint16_t* dataAddr, uint8_t* writeMode, uint8_t* readBuf, uint8_t* status);
};

#endif // SEGA_315_5124_H