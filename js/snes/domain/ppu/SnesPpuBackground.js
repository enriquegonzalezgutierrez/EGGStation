/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/ppu/SnesPpuBackground.js
 * 
 * Domain Layer: Super Nintendo (SNES) PPU Background Layers Engine
 * 
 * Role:
 * Handles the high-performance rasterization of the SNES background planes.
 * Decodes screen tilemaps, manages planar bitplane shifting, and processes
 * 2bpp, 4bpp, and 8bpp tiles using the pre-decoded fast VRAM cache.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for background 
 *   layer scanline composition and tile decoding, completely decoupled from OAM/Sprites 
 *   or master compositor blending calculations.
 */

class SnesPpuBackground {
    /**
     * Renders a single background plane scanline for a specific layer.
     * @param {SnesPpu} ppu - The parent PPU instance context (DIP).
     * @param {number} l - Target background layer index (0 to 3).
     * @param {number} line - The active scanline index.
     */
    static renderBgScanline(ppu, l, line) {
        const bgBuffer = ppu.bgBuffers[l];
        const bgPrioBuffer = ppu.bgPriorityBuffers[l];
        bgBuffer.fill(0);
        bgPrioBuffer.fill(0);

        // Terminate early if the layer is not active on either main or sub screens
        if (!ppu.mainScreenEnabled[l] && !ppu.subScreenEnabled[l]) {
            return;
        }

        const hScroll = ppu.bgHoff[l];
        const vScroll = ppu.bgVoff[l];
        const y = line + vScroll;
        const mapWordBits = SnesPpu.bitPerMode[ppu.mode * 4 + l];
        const paletteMul = mapWordBits === 2 ? 4 : (mapWordBits === 4 ? 16 : 256);
        const paletteBase = ppu.mode === 0 ? l * 8 : 0;

        for (let tx = 0; tx < 33; tx++) {
            const screenX = (tx * 8) - (hScroll & 7);
            if (screenX >= 256) break;

            const mapX = hScroll + (tx * 8);
            this.fetchTileInBuffer(ppu, mapX, y, l, false);
            
            const mapWord = ppu.tilemapBuffer[l];
            const priority = (mapWord & 0x2000) >> 13;
            const paletteNum = ((mapWord & 0x1c00) >> 10) + paletteBase;
            const paletteOffset = paletteNum * paletteMul;
            const decodedRow = ppu.decodedRow[l];

            for (let px = 0; px < 8; px++) {
                const destX = screenX + px;
                if (destX >= 0 && destX < 256) {
                    const colorVal = decodedRow[px];
                    if (colorVal !== 0) {
                        bgBuffer[destX] = paletteOffset + colorVal;
                        bgPrioBuffer[destX] = priority;
                    }
                }
            }
        }
    }

    /**
     * Decodes and fetches a tile from the active VRAM Name Table.
     * @param {SnesPpu} ppu - The parent PPU instance context.
     * @param {number} x - 16-bit physical tilemap X pixel coordinate.
     * @param {number} y - 16-bit physical tilemap Y pixel coordinate.
     * @param {number} l - Target background layer index.
     * @param {boolean} offset - True if decoding offset-per-tile parameters.
     */
    static fetchTileInBuffer(ppu, x, y, l, offset) {
        let rx = x;
        let ry = y;
        let useXbig = ppu.bigTiles[l] || ppu.mode === 5 || ppu.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= ppu.bigTiles[l] ? 1 : 0;

        let adr = ppu.tilemapAdr[l] + (
            ((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3)
        );
        adr += ((x & 0x100) > 0 && ppu.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && ppu.tilemapHigher[l]) ? (
            ppu.tilemapWider[l] ? 2048 : 1024
        ) : 0;
        ppu.tilemapBuffer[l] = ppu.vram[adr & 0x7fff];
        
        if (offset) {
            return;
        }
        
        let yFlip = (ppu.tilemapBuffer[l] & 0x8000) > 0;
        let xFlip = (ppu.tilemapBuffer[l] & 0x4000) > 0;
        let yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = ppu.tilemapBuffer[l] & 0x3ff;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += ppu.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

        let bits = SnesPpu.bitPerMode[ppu.mode * 4 + l];
        let tileBaseOffset = (ppu.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7fff;

        const p1 = ppu.vram[tileBaseOffset];
        ppu.tileBufferP1[l] = p1;

        if (bits > 2) {
            ppu.tileBufferP2[l] = ppu.vram[(tileBaseOffset + 8) & 0x7fff];
        }
        if (bits > 4) {
            ppu.tileBufferP3[l] = ppu.vram[(tileBaseOffset + 16) & 0x7fff];
            ppu.tileBufferP4[l] = ppu.vram[(tileBaseOffset + 24) & 0x7fff];
        }

        const decoded = ppu.decodedRow[l];
        
        // --- HIGH-SPEED VRAM CACHE DECODING PIPELINE ---
        // Normal cache is located at 0. Horizontal flipped version is pre-rendered at index 262144
        const cacheBase = xFlip ? 262144 : 0;
        const p1Idx = cacheBase + (tileBaseOffset << 3); // tileBaseOffset * 8

        if (bits <= 2) {
            // Direct memory copy of the pre-decoded 2bpp row (GC Free)
            decoded[0] = ppu.vramCache[p1Idx];
            decoded[1] = ppu.vramCache[p1Idx + 1];
            decoded[2] = ppu.vramCache[p1Idx + 2];
            decoded[3] = ppu.vramCache[p1Idx + 3];
            decoded[4] = ppu.vramCache[p1Idx + 4];
            decoded[5] = ppu.vramCache[p1Idx + 5];
            decoded[6] = ppu.vramCache[p1Idx + 6];
            decoded[7] = ppu.vramCache[p1Idx + 7];
        } 
        else if (bits <= 4) {
            // Fast-combine Plane 0/1 (p1Idx) with Plane 2/3 (p2Idx)
            const p2Idx = cacheBase + (((tileBaseOffset + 8) & 0x7fff) << 3);
            for (let j = 0; j < 8; j++) {
                decoded[j] = ppu.vramCache[p1Idx + j] | (ppu.vramCache[p2Idx + j] << 2);
            }
        } 
        else {
            // Handles 8bpp tiles as well as dummy configurations (like bits = 5, 7, 8)
            const p2Idx = cacheBase + (((tileBaseOffset + 8) & 0x7fff) << 3);
            const p3Idx = cacheBase + (((tileBaseOffset + 16) & 0x7fff) << 3);
            const p4Idx = cacheBase + (((tileBaseOffset + 24) & 0x7fff) << 3);
            for (let j = 0; j < 8; j++) {
                decoded[j] = ppu.vramCache[p1Idx + j] | 
                             (ppu.vramCache[p2Idx + j] << 2) |
                             (ppu.vramCache[p3Idx + j] << 4) |
                             (ppu.vramCache[p4Idx + j] << 6);
            }
        }
    }
}