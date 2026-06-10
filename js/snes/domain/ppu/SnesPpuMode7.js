/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/ppu/SnesPpuMode7.js
 * 
 * Domain Layer: Super Nintendo (SNES) PPU Mode 7 Graphics Engine
 * 
 * Role:
 * Performs linear coordinate scaling, rotation matrices translation,
 * and decodes screen pixels on the affine Mode 7 layer of the SNES.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for Mode 7 
 *   matrix calculations and pixel fetching, completely decoupled from backgrounds, 
 *   OAM, or master compositor color blending calculations.
 */

class SnesPpuMode7 {
    /**
     * Generates dynamic Mode 7 coordinate lists for the current scanline.
     * @param {SnesPpu} ppu - The parent PPU instance context (DIP).
     * @param {number} y - The active scanline index.
     */
    static generateMode7Coords(ppu, y) {
        let rY = ppu.mode7FlipY ? 255 - y : y;

        let clippedH = ppu.mode7Hoff - ppu.mode7X;
        clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3ff) : (clippedH & 0x3ff);
        let clippedV = ppu.mode7Voff - ppu.mode7Y;
        clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3ff) : (clippedV & 0x3ff);

        let lineStartX = (
            ((ppu.mode7A * clippedH) & ~63) +
            ((ppu.mode7B * rY) & ~63) + ((ppu.mode7B * clippedV) & ~63) +
            (ppu.mode7X << 8)
        );
        let lineStartY = (
            ((ppu.mode7C * clippedH) & ~63) +
            ((ppu.mode7D * rY) & ~63) + ((ppu.mode7D * clippedV) & ~63) +
            (ppu.mode7Y << 8)
        );

        ppu.mode7Xcoords[0] = lineStartX;
        ppu.mode7Ycoords[0] = lineStartY;

        for (let i = 1; i < 256; i++) {
            ppu.mode7Xcoords[i] = ppu.mode7Xcoords[i - 1] + ppu.mode7A;
            ppu.mode7Ycoords[i] = ppu.mode7Ycoords[i - 1] + ppu.mode7C;
        }
    }

    /**
     * Fetches and decodes a pixel directly from the Mode 7 tilemap.
     * @param {SnesPpu} ppu - The parent PPU instance context.
     * @param {number} x - Target horizontal pixel coordinate.
     * @param {number} y - Target vertical pixel coordinate.
     * @param {number} l - Target background layer index (usually 0).
     * @param {number} p - Active layer priority index.
     * @returns {number} 8-bit palette index.
     */
    static getMode7Pixel(ppu, x, y, l, p) {
        let pixelData = ppu.tilemapBuffer[0];
        if (x !== ppu.lastTileFetchedX[0] || y !== ppu.lastTileFetchedY[0]) {
            let rX = ppu.mode7FlipX ? 255 - x : x;

            let px = ppu.mode7Xcoords[rX] >> 8;
            let py = ppu.mode7Ycoords[rX] >> 8;

            let pixelIsTransparent = false;

            if (ppu.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
                if (ppu.mode7Char0fill) {
                    px &= 0x7;
                    py &= 0x7;
                } else {
                    pixelIsTransparent = true;
                }
            }
            let tileX = (px & 0x3f8) >> 3;
            let tileY = (py & 0x3f8) >> 3;

            let tileByte = ppu.vram[(tileY * 128 + tileX)] & 0xff;
            pixelData = ppu.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)];
            pixelData >>= 8;
            pixelData = pixelIsTransparent ? 0 : pixelData;
            ppu.tilemapBuffer[0] = pixelData;
            ppu.lastTileFetchedX[0] = x;
            ppu.lastTileFetchedY[0] = y;
        }

        if (l === 1 && (pixelData >> 7) !== p) {
            return 0;
        } else if (l === 1) {
            return pixelData & 0x7f;
        }

        return pixelData;
    }

    /**
     * Simulates physical SNES 16-bit hardware multiplication.
     * @param {number} a - 16-bit operand A.
     * @param {number} b - 16-bit operand B.
     * @returns {number} Signed 24-bit multiplication result.
     */
    static getMultResult(a, b) {
        b = b < 0 ? 65536 + b : b;
        b >>= 8;
        b = ((b & 0x80) > 0) ? -(256 - b) : b;
        let ans = a * b;
        if (ans < 0) {
            return 16777216 + ans;
        }
        return ans;
    }
}