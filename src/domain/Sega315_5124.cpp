/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/Sega315_5124.cpp
 * 
 * Domain Layer: Sega 315-5124 Video Display Processor (VDP)
 * 
 * Role:
 * Implementation of the Sega 315-5124 VDP. Manages real-time hardware timings,
 * interrupt generation, and pixel rasterization loops.
 */

#include "Sega315_5124.h"
#include <string.h>

// --- Static Palette Lookups ---
const uint8_t Sega315_5124::analogColorScale[4] = {0, 80, 175, 255};

const uint8_t Sega315_5124::sg1000palette[48] = {
    0,0,0,       0,0,0,       33,200,66,   94,220,120, 
    84,85,237,   125,118,252, 212,82,77,   66,235,245, 
    252,85,84,   255,121,120, 212,193,84,  230,206,128, 
    33,176,59,   201,91,186,  204,204,204, 255,255,255
};

Sega315_5124::Sega315_5124() {
    initialize(VDP_STANDARD_NTSC);
}

void Sega315_5124::initialize(int mode) {
    vdpStandard = mode;

    if (vdpStandard == VDP_STANDARD_NTSC) {
        numberOfScanlines = 262;
        clockCyclesPerScanline = 228;
    } else {
        numberOfScanlines = 313;
        clockCyclesPerScanline = 228;
    }

    currentScanlineIndex = 0;
    lineCounter = 0;

    controlWordFlag = false;
    controlWord = 0;
    dataPortAddress = 0;
    dataPortWriteMode = VDP_WRITE_MODE_VRAM;
    readBufferByte = 0;
    statusFlags = 0;

    nameTableBaseAddress = 0xFF;
    spriteAttributeTableBaseAddress = 0;
    spritePatternGeneratorBaseAddress = 0;

    vcounter = 0;
    hcounter = 0;

    // Reset default registers values
    registers[0] = 0x36;
    registers[1] = 0x80;
    writeByteToRegister(2, 0xFF);
    registers[3] = 0xFF;
    registers[4] = 0xFF;
    writeByteToRegister(5, 0xFF);
    writeByteToRegister(6, 0xFB);
    registers[7] = 0x00;
    registers[8] = 0x00;
    registers[9] = 0x00;
    registers[10] = 0xFF;

    yScreenLines = 192;

    // Zero-out memories and buffers
    memset(vRam, 0, sizeof(vRam));
    memset(colorRam, 0, sizeof(colorRam));
    memset(frameBuffer, 0, sizeof(frameBuffer));
    memset(priBuffer, 0, sizeof(priBuffer));
    memset(spriteBuffer, 0, sizeof(spriteBuffer));
}

// ========================================================================
// HARDWARE REGISTER WRITES
// ========================================================================

void Sega315_5124::writeByteToRegister(uint8_t regIdx, uint8_t value) {
    if (regIdx > 10) return;
    
    registers[regIdx] = value;

    switch (regIdx) {
        case 1:
            // Parse screen heights for extended resolutions (Register 1, Bits 3-4)
            if (registers[0] & 0x02) {
                if (registers[1] & 0x08) {
                    yScreenLines = 240;
                } else if (registers[1] & 0x10) {
                    yScreenLines = 224;
                } else {
                    yScreenLines = 192;
                }
            } else {
                yScreenLines = 192;
            }
            break;
        case 2:
            nameTableBaseAddress = value;
            break;
        case 5:
            spriteAttributeTableBaseAddress = (value & 0x7E) << 7;
            break;
        case 6:
            spritePatternGeneratorBaseAddress = (value & 0x04) << 11;
            break;
        case 10:
            lineCounter = value;
            break;
    }
}

// ========================================================================
// SYSTEM BUS I/O INTERFACE
// ========================================================================

void Sega315_5124::writeByteToControlPort(uint8_t value) {
    if (!controlWordFlag) {
        controlWord = value;
        controlWordFlag = true;
        dataPortAddress = (dataPortAddress & 0x3F00) | value;
    } else {
        controlWord |= (value << 8);
        controlWordFlag = false;

        uint8_t controlCode = (controlWord & 0xC000) >> 14;
        dataPortAddress = (controlWord & 0x3FFF);

        if (controlCode == 0) {
            dataPortWriteMode = VDP_WRITE_MODE_VRAM;
            readBufferByte = vRam[dataPortAddress & 0x3FFF];
            dataPortAddress = (dataPortAddress + 1) & 0x3FFF;
        } 
        else if (controlCode == 1) {
            dataPortWriteMode = VDP_WRITE_MODE_VRAM;
        } 
        else if (controlCode == 2) {
            uint8_t regIdx = (controlWord & 0x0F00) >> 8;
            uint8_t dataByte = controlWord & 0x00FF;
            writeByteToRegister(regIdx, dataByte);
        } 
        else if (controlCode == 3) {
            dataPortWriteMode = VDP_WRITE_MODE_CRAM;
        }
    }
}

void Sega315_5124::writeByteToDataPort(uint8_t value) {
    controlWordFlag = false;

    if (dataPortWriteMode == VDP_WRITE_MODE_VRAM) {
        vRam[dataPortAddress] = value;
    } else {
        colorRam[dataPortAddress & 0x1F] = value;
    }

    dataPortAddress = (dataPortAddress + 1) & 0x3FFF;
    readBufferByte = value;
}

uint8_t Sega315_5124::readByteFromDataPort() {
    controlWordFlag = false;
    uint8_t byte = readBufferByte;
    readBufferByte = vRam[dataPortAddress];
    dataPortAddress = (dataPortAddress + 1) & 0x3FFF;
    return byte;
}

uint8_t Sega315_5124::readByteFromControlPort() {
    controlWordFlag = false;
    uint8_t currentStatus = statusFlags;
    statusFlags &= 0x1F; // Clear interrupt, overflow, and collision flags on read
    return currentStatus | 0x1F; // Lower 5 bits return open-bus noise (always 1s on SMS)
}

uint8_t Sega315_5124::readDataPort(uint8_t port) {
    if (port == 0x7E) return vcounter;
    if (port == 0x7F) return hcounter;
    return 0;
}

// ========================================================================
// CORES SCHEDULER & HARDWARE TIMINGS
// ========================================================================

bool Sega315_5124::update(int cycles, bool* raiseInterrupt) {
    *raiseInterrupt = false;
    hcounter += cycles;

    if (hcounter >= clockCyclesPerScanline) {
        hcounter %= clockCyclesPerScanline;

        // V-Counter jump indexes depend on active line configurations
        int vCounterJumpOnScanlineIndex = (vdpStandard == VDP_STANDARD_NTSC) ? 219 : 243;
        int vCounterJumpToIndex = (vdpStandard == VDP_STANDARD_NTSC) ? 213 : 186;
        int interruptAfterScanlineIndex = 192;

        if (yScreenLines == 224) {
            vCounterJumpOnScanlineIndex = (vdpStandard == VDP_STANDARD_NTSC) ? 235 : 256;
            vCounterJumpToIndex = (vdpStandard == VDP_STANDARD_NTSC) ? 229 : 0xCA + 1;
            interruptAfterScanlineIndex = 224;
        } 
        else if (yScreenLines == 240) {
            vCounterJumpOnScanlineIndex = 256;
            vCounterJumpToIndex = (vdpStandard == VDP_STANDARD_NTSC) ? 0 : 0xD2 + 1;
            interruptAfterScanlineIndex = 240;
        }

        if (currentScanlineIndex == vCounterJumpOnScanlineIndex) {
            vcounter = vCounterJumpToIndex;
        } else {
            vcounter = (vcounter + 1) & 0xFF;
        }

        // Mode 4 Line Interrupts down-counter decrements
        if (currentScanlineIndex <= yScreenLines) {
            if (lineCounter == 0) {
                lineCounter = registers[10];
                if (registers[0] & 0x10) *raiseInterrupt = true; // Line IRQ enabled (Register 0, Bit 4)
            } else {
                lineCounter--;
            }
        } else {
            lineCounter = registers[10];
        }

        // Frame Interrupt flag updates
        if (currentScanlineIndex == interruptAfterScanlineIndex) {
            statusFlags |= 0x80; // Raise Frame Interrupt pending flag
        }

        if (currentScanlineIndex == (interruptAfterScanlineIndex + 1)) {
            if (registers[1] & 0x20) *raiseInterrupt = true; // Frame IRQ enabled (Register 1, Bit 5)
        }

        currentScanlineIndex++;
        if (currentScanlineIndex == numberOfScanlines) {
            currentScanlineIndex = 0;
        }

        if (currentScanlineIndex == 0) {
            cleanSpriteBuffer();
            return true; // Complete frame reached (V-Blank)
        } else {
            drawScanline(currentScanlineIndex - 1);
        }
    }
    return false;
}

// ========================================================================
// CORE HIGH-PERFORMANCE RASTERIZERS
// ========================================================================

void Sega315_5124::drawScanline(int scanlineNum) {
    if (scanlineNum < 0 || scanlineNum >= yScreenLines) return;

    int fbY = scanlineNum * 256;

    // Check for forced blanking (Register 1, Bit 6)
    if (!(registers[1] & 0x40)) {
        for (int i = 0; i < 256; i++) {
            frameBuffer[fbY + i] = 0xFF000000; // Paint solid black on blank
        }
        return;
    }

    // Dynamic standard evaluation
    if (registers[0] & 0x04) {
        // Mode 4 active (Master System standard)
        drawMode4Background(scanlineNum);
        drawMode4Sprites(scanlineNum);
        
        // Render 8-pixel horizontal blanking border (Register 0, Bit 5)
        if (registers[0] & 0x20) {
            uint8_t borderColIdx = colorRam[(registers[7] & 0x0F) + 16];
            uint32_t borderABGR = analogColorScale[borderColIdx & 0x03] |
                                  (analogColorScale[(borderColIdx & 0x0C) >> 2] << 8) |
                                  (analogColorScale[(borderColIdx & 0x30) >> 4] << 16) |
                                  0xFF000000;
            for (int x = 0; x < 8; x++) {
                frameBuffer[fbY + x] = borderABGR;
            }
        }
    } else if (registers[0] & 0x02) {
        // Mode 2 active (SG-1000 Legacy standard)
        drawMode2Background(scanlineNum);
        drawMode2Sprites(scanlineNum);
    }
}

// --- Mode 4 (Master System) Background Rasterizer ---
void Sega315_5124::drawMode4Background(int scanlineNum) {
    uint8_t nameTableBaseAddressMask = 0x0E;
    uint16_t nameTableBaseAddressOffset = 0;

    if (yScreenLines == 224 || yScreenLines == 240) {
        nameTableBaseAddressMask = 0x0C;
        nameTableBaseAddressOffset = 0x700;
    }

    uint16_t nameTableBase = ((nameTableBaseAddress & nameTableBaseAddressMask) << 10) | nameTableBaseAddressOffset;

    // Scrolling registers parameters
    int initialTile = 32 - ((registers[8] >> 3) & 0x1F);
    int fineScrollX = registers[8] & 0x07;
    int initialRow = registers[9] / 8;
    int fineScrollY = registers[9] % 8;

    int scanlineLimit = (yScreenLines == 192) ? 28 : 32;

    int yScreenMap = scanlineNum / 8;
    int adder = ((fineScrollY + (scanlineNum % 8)) >= 8) ? 1 : 0;

    uint16_t nameTableAddr = nameTableBase + (((yScreenMap + initialRow + adder) % scanlineLimit) * 32) * 2;
    uint16_t screenMap[32];

    for (int x = 0; x < 32; x++) {
        uint16_t word = vRam[nameTableAddr];
        word |= vRam[nameTableAddr + 1] << 8;
        screenMap[x] = word;
        nameTableAddr += 2;
    }

    // Vertical Scroll Lock (Register 0, Bit 7) on columns 24-31
    uint16_t screenMapNoScroll[32];
    if (registers[0] & 0x80) {
        uint16_t baseNoScroll = ((nameTableBaseAddress >> 1) & 0x07) << 11;
        baseNoScroll += (yScreenMap % scanlineLimit) * 64;
        for (int x = 0; x < 32; x++) {
            uint16_t word = vRam[baseNoScroll];
            word |= vRam[baseNoScroll + 1] << 8;
            screenMapNoScroll[x] = word;
            baseNoScroll += 2;
        }
    }

    for (int x = 0; x < 32; x++) {
        uint16_t word;

        if (x >= 24 && (registers[0] & 0x80)) {
            word = screenMapNoScroll[(x + initialTile) % 32];
            fineScrollY = 0;
        } 
        else if ((registers[0] & 0x40) && scanlineNum < 16) {
            // Horizontal scroll locked on rows 0-1
            word = screenMap[x];
            fineScrollX = 0;
        } 
        else {
            word = screenMap[(x + initialTile) % 32];
        }

        bool flipH = (word >> 9) & 0x01;
        bool flipV = (word >> 10) & 0x01;
        int pal = (word >> 11) & 0x01;
        int priFlag = (word >> 12) & 0x01;

        drawLineTile((word & 0x1FF) * 32, (x * 8) + fineScrollX, scanlineNum, pal, flipH, flipV, fineScrollY, priFlag);
    }
}

// --- Optimized 32-bit Background Pixel Copier ---
void Sega315_5124::drawLineTile(uint16_t addr, int x, int y, int pal, bool flipH, bool flipV, int fineScrollY, int priFlag) {
    int offset = flipV ? (7 - ((y + fineScrollY) % 8)) : ((y + fineScrollY) % 8);
    uint16_t tileRowAddr = addr + (offset * 4);

    uint8_t byte0 = vRam[tileRowAddr];
    uint8_t byte1 = vRam[tileRowAddr + 1];
    uint8_t byte2 = vRam[tileRowAddr + 2];
    uint8_t byte3 = vRam[tileRowAddr + 3];

    int palOffset = pal * 16;
    int bufferIndex = x + (y * 256);

    for (int xt = 0; xt < 8; xt++) {
        int shift = flipH ? xt : (7 - xt);
        uint8_t cramIdx = (((byte0 >> shift) & 1) | 
                          (((byte1 >> shift) & 1) << 1) | 
                          (((byte2 >> shift) & 1) << 2) | 
                          (((byte3 >> shift) & 1) << 3)) & 0x0F;

        uint8_t colorValue = colorRam[cramIdx + palOffset];
        int xTile = x + xt;

        if (xTile >= 0 && xTile < 256 && y >= 0 && y < yScreenLines) {
            uint32_t colorABGR = analogColorScale[colorValue & 0x03] |
                                  (analogColorScale[(colorValue & 0x0C) >> 2] << 8) |
                                  (analogColorScale[(colorValue & 0x30) >> 4] << 16) |
                                  0xFF000000;
            frameBuffer[bufferIndex] = colorABGR;
            priBuffer[xTile + (y * 256)] = (cramIdx != 0) ? priFlag : 0;
        }
        bufferIndex++;
    }
}

// --- Mode 4 (Master System) Sprites Rasterizer ---
void Sega315_5124::drawMode4Sprites(int scanlineNum) {
    uint16_t sat = spriteAttributeTableBaseAddress;
    bool checkSpriteTerminator = (yScreenLines == 192);

    // Scan table bounds
    int maxSprites = 64;
    for (int s = 0; s < 64; s++) {
        uint8_t spriteY = vRam[sat + s];
        if (spriteY == 0xD0 && checkSpriteTerminator) {
            maxSprites = s;
            break;
        }
    }

    if (maxSprites > 0) {
        maxSprites -= 1;
    }

    int spritesDrawn = 0;

    for (int s = maxSprites; s >= 0; s--) {
        int spriteY = vRam[sat + s];
        spriteY++; // Sprites coordinate is offset by +1

        if (spriteY > 0xD0 && checkSpriteTerminator) {
            spriteY -= 0x100;
        }

        int spriteX = vRam[sat + (s * 2) + 128];
        if (registers[0] & 0x08) {
            spriteX -= 8; // Global 8-pixel horizontal shift (Register 0, Bit 3)
        }

        uint8_t spriteIdx = vRam[sat + (s * 2) + 129];
        bool is8x16 = (registers[0] & 0x04) && (registers[1] & 0x02);
        if (is8x16) {
            spriteIdx &= 0xFE; // LSB is ignored in 8x16 mode
        }

        int sizeY = is8x16 ? 16 : 8;

        if (scanlineNum >= spriteY && scanlineNum < (spriteY + sizeY)) {
            drawSpriteSlice(spriteIdx * 32, spriteX, scanlineNum, scanlineNum - spriteY);
            spritesDrawn++;
        }
    }

    // Trigger Sprite Overflow flag if >= 8 sprites occupy the same scanline
    if (spritesDrawn >= 8) {
        statusFlags |= 0x40; // Set overflow bit in status register
    }
}

// --- Optimized 32-bit Sprite Pixel Copier ---
void Sega315_5124::drawSpriteSlice(uint16_t addr, int spriteX, int scanlineNum, int sliceY) {
    uint16_t tileRowAddr = spritePatternGeneratorBaseAddress + addr + (sliceY * 4);

    uint8_t byte0 = vRam[tileRowAddr];
    uint8_t byte1 = vRam[tileRowAddr + 1];
    uint8_t byte2 = vRam[tileRowAddr + 2];
    uint8_t byte3 = vRam[tileRowAddr + 3];

    for (int xt = 0; xt < 8; xt++) {
        int shift = 7 - xt;
        uint8_t cramIdx = (((byte0 >> shift) & 1) | 
                          (((byte1 >> shift) & 1) << 1) | 
                          (((byte2 >> shift) & 1) << 2) | 
                          (((byte3 >> shift) & 1) << 3)) & 0x0F;

        if (cramIdx != 0) {
            uint8_t colorValue = colorRam[cramIdx + 16];
            int cX = spriteX + xt;

            if (cX >= 0 && cX < 256 && scanlineNum >= 0 && scanlineNum < yScreenLines) {
                int linearIdx = cX + (scanlineNum * 256);

                if (spriteBuffer[linearIdx] == 0) {
                    spriteBuffer[linearIdx] = 1;
                } else {
                    statusFlags |= 0x20; // Trigger collision hardware bit
                }

                // Render sprite pixel only if the background priority allows it
                if (priBuffer[linearIdx] == 0) {
                    uint32_t colorABGR = analogColorScale[colorValue & 0x03] |
                                          (analogColorScale[(colorValue & 0x0C) >> 2] << 8) |
                                          (analogColorScale[(colorValue & 0x30) >> 4] << 16) |
                                          0xFF000000;
                    frameBuffer[linearIdx] = colorABGR;
                }
            }
        }
    }
}

// --- Legacy Mode 2 Background (SG-1000) ---
void Sega315_5124::drawMode2Background(int scanlineNum) {
    uint16_t nameTableBase = (nameTableBaseAddress & 0x0F) << 10;
    int yScreenMap = scanlineNum / 8;

    for (int x = 0; x < 32; x++) {
        uint16_t tileAddr = nameTableBase + (yScreenMap * 32) + x;
        uint16_t charCode = vRam[tileAddr];

        if (yScreenMap >= 8 && yScreenMap < 16) {
            charCode += 0x100;
        } else if (yScreenMap >= 16) {
            charCode += 0x200;
        }

        // Mode 2 Background pixel assignment (Derived from sg1000palette)
        uint16_t patternBase = (charCode << 3) + (scanlineNum % 8);
        uint8_t patternByte = vRam[patternBase & 0x3FFF];
        uint8_t colorByte = vRam[((patternBase & 0x1FFF) + 0x2000) & 0x3FFF];

        uint8_t fgColor = colorByte >> 4;
        uint8_t bgColor = colorByte & 0x0F;

        int bufferIndex = (x * 8) + (scanlineNum * 256);

        for (int p = 0; p < 8; p++) {
            uint8_t colorIdx = (patternByte & (1 << (7 - p))) ? fgColor : bgColor;
            frameBuffer[bufferIndex] = sg1000palette[colorIdx * 3] |
                                       (sg1000palette[colorIdx * 3 + 1] << 8) |
                                       (sg1000palette[colorIdx * 3 + 2] << 16) |
                                       0xFF000000;
            bufferIndex++;
        }
    }
}

// --- Legacy Mode 2 Sprites (SG-1000) ---
void Sega315_5124::drawMode2Sprites(int scanlineNum) {
    uint16_t sat = (registers[5] & 0x7F) << 7;
    int spriteSize = (registers[1] & 0x02) ? 16 : 8;
    uint16_t patternBase = (registers[6] & 0x07) << 11;

    int maxSprites = 31;
    for (int s = 0; s < 32; s++) {
        if (vRam[sat + (s * 4)] == 0xD0) {
            maxSprites = s - 1;
            break;
        }
    }

    for (int s = 0; s <= maxSprites; s++) {
        uint16_t spriteOffset = sat + (s * 4);
        int spriteY = (vRam[spriteOffset] + 1) & 0xFF;

        if (spriteY >= 0xE0) {
            spriteY = -(256 - spriteY);
        }

        if (scanlineNum < spriteY || scanlineNum >= (spriteY + spriteSize)) {
            continue;
        }

        uint8_t colorIdx = vRam[spriteOffset + 3] & 0x0F;
        if (colorIdx == 0) continue; // Transparency

        int shift = (vRam[spriteOffset + 3] & 0x80) ? 32 : 0;
        int spriteX = vRam[spriteOffset + 1] - shift;

        uint8_t tileNum = vRam[spriteOffset + 2];
        if (registers[1] & 0x02) {
            tileNum &= 0xFC;
        }

        uint16_t lineAddr = patternBase + (tileNum << 3) + (scanlineNum - spriteY);

        for (int tx = 0; tx < spriteSize; tx++) {
            int cx = spriteX + tx;
            if (cx >= 256) break;
            if (cx < 0) continue;

            bool isPixelSet = false;
            if (tx < 8) {
                isPixelSet = (vRam[lineAddr] & (1 << (7 - tx))) != 0;
            } else {
                isPixelSet = (vRam[lineAddr + 16] & (1 << (15 - tx))) != 0;
            }

            if (isPixelSet) {
                int linearIdx = cx + (scanlineNum * 256);
                frameBuffer[linearIdx] = sg1000palette[colorIdx * 3] |
                                         (sg1000palette[colorIdx * 3 + 1] << 8) |
                                         (sg1000palette[colorIdx * 3 + 2] << 16) |
                                         0xFF000000;
            }
        }
    }
}

void Sega315_5124::cleanSpriteBuffer() {
    memset(spriteBuffer, 0, sizeof(spriteBuffer));
}

// ========================================================================
// GETTERS & SETTERS (WASM INTERFACE)
// ========================================================================

uint32_t* Sega315_5124::getFrameBufferPointer() {
    return frameBuffer;
}

uint8_t* Sega315_5124::getVramPointer() {
    return vRam;
}

uint8_t* Sega315_5124::getCramPointer() {
    return colorRam;
}

uint8_t* Sega315_5124::getRegistersPointer() {
    return registers;
}

void Sega315_5124::getInternalState(int* scanlineIdx, int* lineCnt, bool* ctrlFlag, uint16_t* ctrlWord, 
                                    uint16_t* dataAddr, uint8_t* writeMode, uint8_t* readBuf, uint8_t* status) {
    *scanlineIdx = currentScanlineIndex;
    *lineCnt = lineCounter;
    *ctrlFlag = controlWordFlag;
    *ctrlWord = controlWord;
    *dataAddr = dataPortAddress;
    *writeMode = dataPortWriteMode;
    *readBuf = readBufferByte;
    *status = statusFlags;
}

void Sega315_5124::setInternalState(int scanlineIdx, int lineCnt, bool ctrlFlag, uint16_t ctrlWord, 
                                    uint16_t dataAddr, uint8_t writeMode, uint8_t readBuf, uint8_t status) {
    currentScanlineIndex = scanlineIdx;
    lineCounter = lineCnt;
    controlWordFlag = ctrlFlag;
    controlWord = ctrlWord;
    dataPortAddress = dataAddr;
    dataPortWriteMode = writeMode;
    readBufferByte = readBuf;
    statusFlags = status;
}