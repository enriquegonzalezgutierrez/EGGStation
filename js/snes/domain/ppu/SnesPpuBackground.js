/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Component: SnesPpuBackground (Background Layers Pipeline)
 * 
 * ROLE:
 * Handles screen tiles maps decoding, planar bitplane shifts, and 
 * high-performance rasterization of the background layers.
 * 
 * PHASE 3 OPTIMIZATION (BUGFIX EDITION):
 * - Refactored `fetchTileInBuffer` to use the pre-decoded planar cache (`this.vramCache`).
 * - FIXED: Relational range checks (`bits <= 2`, `bits <= 4`, `else`) are now used 
 *   instead of strict equalities. This correctly handles custom or dummy layers 
 *   where `bits` evaluates to 5, 7, etc., restoring 100% of the game graphics.
 */

{
    SnesPpu.prototype.renderBgScanline = function(l, line) {
        const bgBuffer = this.bgBuffers[l];
        const bgPrioBuffer = this.bgPriorityBuffers[l];
        bgBuffer.fill(0);
        bgPrioBuffer.fill(0);

        if (!this.mainScreenEnabled[l] && !this.subScreenEnabled[l]) {
            return;
        }

        const hScroll = this.bgHoff[l];
        const vScroll = this.bgVoff[l];
        const y = line + vScroll;
        const mapWordBits = SnesPpu.bitPerMode[this.mode * 4 + l];
        const paletteMul = mapWordBits === 2 ? 4 : (mapWordBits === 4 ? 16 : 256);
        const paletteBase = this.mode === 0 ? l * 8 : 0;

        for (let tx = 0; tx < 33; tx++) {
            const screenX = (tx * 8) - (hScroll & 7);
            if (screenX >= 256) break;

            const mapX = hScroll + (tx * 8);
            this.fetchTileInBuffer(mapX, y, l, false);
            
            const mapWord = this.tilemapBuffer[l];
            const priority = (mapWord & 0x2000) >> 13;
            const paletteNum = ((mapWord & 0x1c00) >> 10) + paletteBase;
            const paletteOffset = paletteNum * paletteMul;
            const decodedRow = this.decodedRow[l];

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
    };

    SnesPpu.prototype.fetchTileInBuffer = function(x, y, l, offset) {
        let rx = x;
        let ry = y;
        let useXbig = this.bigTiles[l] || this.mode === 5 || this.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= this.bigTiles[l] ? 1 : 0;

        let adr = this.tilemapAdr[l] + (
            ((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3)
        );
        adr += ((x & 0x100) > 0 && this.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && this.tilemapHigher[l]) ? (
            this.tilemapWider[l] ? 2048 : 1024
        ) : 0;
        this.tilemapBuffer[l] = this.vram[adr & 0x7fff];
        
        if (offset) {
            return;
        }
        
        let yFlip = (this.tilemapBuffer[l] & 0x8000) > 0;
        let xFlip = (this.tilemapBuffer[l] & 0x4000) > 0;
        let yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = this.tilemapBuffer[l] & 0x3ff;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += this.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

        let bits = SnesPpu.bitPerMode[this.mode * 4 + l];
        let tileBaseOffset = (this.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7fff;

        // Keep legacy buffers populated for external sub-system references (e.g. debugger)
        const p1 = this.vram[tileBaseOffset];
        this.tileBufferP1[l] = p1;

        if (bits > 2) {
            this.tileBufferP2[l] = this.vram[(tileBaseOffset + 8) & 0x7fff];
        }
        if (bits > 4) {
            this.tileBufferP3[l] = this.vram[(tileBaseOffset + 16) & 0x7fff];
            this.tileBufferP4[l] = this.vram[(tileBaseOffset + 24) & 0x7fff];
        }

        const decoded = this.decodedRow[l];
        
        // --- OPTIMIZED CACHE PATTERN FETCH ---
        // Normal cache is located at 0. Horizontal flipped version is pre-rendered at index 262144
        const cacheBase = xFlip ? 262144 : 0;
        const p1Idx = cacheBase + (tileBaseOffset << 3); // tileBaseOffset * 8

        if (bits <= 2) {
            // Direct memory copy of the pre-decoded 2bpp row (GC Free)
            decoded[0] = this.vramCache[p1Idx];
            decoded[1] = this.vramCache[p1Idx + 1];
            decoded[2] = this.vramCache[p1Idx + 2];
            decoded[3] = this.vramCache[p1Idx + 3];
            decoded[4] = this.vramCache[p1Idx + 4];
            decoded[5] = this.vramCache[p1Idx + 5];
            decoded[6] = this.vramCache[p1Idx + 6];
            decoded[7] = this.vramCache[p1Idx + 7];
        } 
        else if (bits <= 4) {
            // Fast-combine Plane 0/1 (p1Idx) with Plane 2/3 (p2Idx)
            const p2Idx = cacheBase + (((tileBaseOffset + 8) & 0x7fff) << 3);
            for (let j = 0; j < 8; j++) {
                decoded[j] = this.vramCache[p1Idx + j] | (this.vramCache[p2Idx + j] << 2);
            }
        } 
        else {
            // Handles 8bpp tiles as well as dummy configurations (like bits = 5, 7, 8)
            const p2Idx = cacheBase + (((tileBaseOffset + 8) & 0x7fff) << 3);
            const p3Idx = cacheBase + (((tileBaseOffset + 16) & 0x7fff) << 3);
            const p4Idx = cacheBase + (((tileBaseOffset + 24) & 0x7fff) << 3);
            for (let j = 0; j < 8; j++) {
                decoded[j] = this.vramCache[p1Idx + j] | 
                             (this.vramCache[p2Idx + j] << 2) |
                             (this.vramCache[p3Idx + j] << 4) |
                             (this.vramCache[p4Idx + j] << 6);
            }
        }
    };
}