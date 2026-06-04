/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpuBackground (Background Layers Pipeline)
 * 
 * ROLE:
 * Handles screen tiles maps decoding, planar bitplane shifts, and 
 * high-performance rasterization of the background layers.
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
        let useXbig = this.bigTiles[l] | this.mode === 5 | this.mode === 6;
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
        let tileBaseOffset = this.tileAdr[l] + tileNum * 4 * bits + yRow;

        const p1 = this.vram[tileBaseOffset & 0x7fff];
        this.tileBufferP1[l] = p1;

        let p2 = 0, p3 = 0, p4 = 0;
        if (bits > 2) {
            p2 = this.vram[(tileBaseOffset + 8) & 0x7fff];
            this.tileBufferP2[l] = p2;
        }
        if (bits > 4) {
            p3 = this.vram[(tileBaseOffset + 16) & 0x7fff];
            p4 = this.vram[(tileBaseOffset + 24) & 0x7fff];
            this.tileBufferP3[l] = p3;
            this.tileBufferP4[l] = p4;
        }

        const decoded = this.decodedRow[l];
        
        if (xFlip) {
            for (let j = 0; j < 8; j++) {
                let tileData = (p1 >> j) & 0x1;
                tileData |= ((p1 >> (8 + j)) & 0x1) << 1;
                if (bits > 2) {
                    tileData |= ((p2 >> j) & 0x1) << 2;
                    tileData |= ((p2 >> (8 + j)) & 0x1) << 3;
                }
                if (bits > 4) {
                    tileData |= ((p3 >> j) & 0x1) << 4;
                    tileData |= ((p3 >> (8 + j)) & 0x1) << 5;
                    tileData |= ((p4 >> j) & 0x1) << 6;
                    tileData |= ((p4 >> (8 + j)) & 0x1) << 7;
                }
                decoded[j] = tileData;
            }
        } else {
            for (let j = 0; j < 8; j++) {
                const shift = 7 - j;
                let tileData = (p1 >> shift) & 0x1;
                tileData |= ((p1 >> (8 + shift)) & 0x1) << 1;
                if (bits > 2) {
                    tileData |= ((p2 >> shift) & 0x1) << 2;
                    tileData |= ((p2 >> (8 + shift)) & 0x1) << 3;
                }
                if (bits > 4) {
                    tileData |= ((p3 >> shift) & 0x1) << 4;
                    tileData |= ((p3 >> (8 + shift)) & 0x1) << 5;
                    tileData |= ((p4 >> shift) & 0x1) << 6;
                    tileData |= ((p4 >> (8 + shift)) & 0x1) << 7;
                }
                decoded[j] = tileData;
            }
        }
    };
}