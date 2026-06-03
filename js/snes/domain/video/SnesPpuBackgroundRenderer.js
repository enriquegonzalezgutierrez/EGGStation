/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuBackgroundRenderer (Background Planes, Windows and Color Math Processor)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements the standard background plane rendering pipeline of the SNES PPU.
 * It decodes VRAM tilemaps, handles offset-per-tile shifts (BG scrolling variations),
 * evaluates hardware Window clipping masks, and resolves pixel colors.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles background plane rendering, tilemap fetches, and window math.
 */

class SnesPpuBackgroundRenderer {
    /**
     * Resolves the active pixel color across the prioritized background and sprite layers.
     * GC-FREE: Writes final color and parameters directly to pre-allocated properties on the PPU.
     */
    static resolveColor(ppu, sub, x, y) {
        let modeIndex = ppu.layer3Prio && ppu.mode === 1 ? 96 : 12 * ppu.mode;
        modeIndex = ppu.mode7ExBg && ppu.mode === 7 ? 108 : modeIndex;
        const count = SnesPpuMathUnit.LAYER_COUNT_PER_MODE[ppu.mode];

        let j;
        let pixel = 0;
        let layer = 5;

        if (ppu.interlace && (ppu.mode === 5 || ppu.mode === 6)) {
            y = y * 2 + (ppu.evenFrame ? 1 : 0);
        }

        // Loop through layers in priority order for the active Mode
        for (j = 0; j < count; j++) {
            let lx = x;
            let ly = y;
            layer = SnesPpuMathUnit.LAYERS_PER_MODE[modeIndex + j];

            // Evaluate screen visibility and window clipping masks
            if ((!sub && ppu.mainScreenEnabled[layer] && (!ppu.mainScreenWindow[layer] || !this.getWindowState(ppu, lx, layer))) ||
                (sub && ppu.subScreenEnabled[layer] && (!ppu.subScreenWindow[layer] || !this.getWindowState(ppu, lx, layer)))) {
                
                if (ppu.mosaicEnabled[layer]) {
                    lx -= lx % ppu.mosaicSize;
                    ly -= (ly - ppu.mosaicStartLine) % ppu.mosaicSize;
                }

                lx += ppu.mode === 7 ? 0 : ppu.bgHoff[layer];
                ly += ppu.mode === 7 ? 0 : ppu.bgVoff[layer];
                const optX = lx - ppu.bgHoff[layer];

                if ((ppu.mode === 5 || ppu.mode === 6) && layer < 4) {
                    lx = lx * 2 + (sub ? 0 : 1);
                }

                // Offset-Per-Tile (OPT) logic (Modes 2, 4, 6)
                if ((ppu.mode === 2 || ppu.mode === 4 || ppu.mode === 6) && layer < 2) {
                    const andVal = layer === 0 ? 0x2000 : 0x4000;
                    if (x === 0) {
                        ppu.lastOrigTileX[layer] = lx >> 3;
                    }
                    const tileStartX = optX - (lx - (lx & 0xfff8));
                    if ((lx >> 3) !== ppu.lastOrigTileX[layer] && x > 0) {
                        this.fetchTileInBuffer(ppu, ppu.bgHoff[2] + ((tileStartX - 1) & 0x1f8), ppu.bgVoff[2], 2, true);
                        ppu.optHorBuffer[layer] = ppu.tilemapBuffer[2];
                        
                        if (ppu.mode === 4) {
                            if ((ppu.optHorBuffer[layer] & 0x8000) > 0) {
                                ppu.optVerBuffer[layer] = ppu.optHorBuffer[layer];
                                ppu.optHorBuffer[layer] = 0;
                            } else {
                                ppu.optVerBuffer[layer] = 0;
                            }
                        } else {
                            this.fetchTileInBuffer(ppu, ppu.bgHoff[2] + ((tileStartX - 1) & 0x1f8), ppu.bgVoff[2] + 8, 2, true);
                            ppu.optVerBuffer[layer] = ppu.tilemapBuffer[2];
                        }
                        ppu.lastOrigTileX[layer] = lx >> 3;
                    }

                    if ((ppu.optHorBuffer[layer] & andVal) > 0) {
                        const add = ((tileStartX + 7) & 0x1f8);
                        lx = (lx & 0x7) + ((ppu.optHorBuffer[layer] + add) & 0x1ff8);
                    }
                    if ((ppu.optVerBuffer[layer] & andVal) > 0) {
                        ly = (ppu.optVerBuffer[layer] & 0x1fff) + (ly - ppu.bgVoff[layer]);
                    }
                }

                pixel = this.getPixelForLayer(ppu, lx, ly, layer, SnesPpuMathUnit.PRIO_PER_MODE[modeIndex + j]);
            }

            if ((pixel & 0xff) > 0) {
                break;
            }
        }

        layer = j === count ? 5 : layer;
        let color = ppu.cgram[pixel & 0xff];

        // Handle Direct Color modes (Standard 8-bpp layer bypass)
        if (ppu.directColor && layer < 4 && SnesPpuMathUnit.BIT_PER_MODE[ppu.mode * 4 + layer] === 8) {
            const r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
            const g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
            const b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
            color = (b << 10) | (g << 5) | r;
        }

        // Write directly on pre-allocated instance properties
        ppu.resolvedColor = color;
        ppu.resolvedLayer = layer;
        ppu.resolvedPixel = pixel;
    }

    /**
     * Resolves the pixel index value of the selected layer.
     */
    static getPixelForLayer(ppu, x, y, l, p) {
        if (l > 3) {
            if (ppu.spritePrioBuffer[x] !== p) return 0;
            return ppu.spriteLineBuffer[x];
        }

        if (ppu.mode === 7) {
            return SnesPpuMode7Renderer.getPixel(ppu, x, y, l, p);
        }

        if ((x >> 3) !== ppu.lastTileFetchedX[l] || y !== ppu.lastTileFetchedY[l]) {
            this.fetchTileInBuffer(ppu, x, y, l, false);
            ppu.lastTileFetchedX[l] = (x >> 3);
            ppu.lastTileFetchedY[l] = y;
        }

        const mapWord = ppu.tilemapBuffer[l];
        if (((mapWord & 0x2000) >> 13) !== p) return 0;

        let paletteNum = (mapWord & 0x1c00) >> 10;
        const xShift = (mapWord & 0x4000) > 0 ? (x & 0x7) : 7 - (x & 0x7);

        paletteNum += ppu.mode === 0 ? l * 8 : 0;

        const bits = SnesPpuMathUnit.BIT_PER_MODE[ppu.mode * 4 + l];
        let mul = 4;
        let tileData = (ppu.tileBufferP1[l] >> xShift) & 0x1;
        tileData |= ((ppu.tileBufferP1[l] >> (8 + xShift)) & 0x1) << 1;

        if (bits > 2) {
            mul = 16;
            tileData |= ((ppu.tileBufferP2[l] >> xShift) & 0x1) << 2;
            tileData |= ((ppu.tileBufferP2[l] >> (8 + xShift)) & 0x1) << 3;
        }

        if (bits > 4) {
            mul = 256;
            tileData |= ((ppu.tileBufferP3[l] >> xShift) & 0x1) << 4;
            tileData |= ((ppu.tileBufferP3[l] >> (8 + xShift)) & 0x1) << 5;
            tileData |= ((ppu.tileBufferP4[l] >> xShift) & 0x1) << 6;
            tileData |= ((ppu.tileBufferP4[l] >> (8 + xShift)) & 0x1) << 7;
        }

        return tileData > 0 ? (paletteNum * mul + tileData) : 0;
    }

    /**
     * Fetches tile bytes into the active PPU tile buffer.
     */
    static fetchTileInBuffer(ppu, x, y, l, offset) {
        const rx = x;
        const ry = y;
        const useXbig = ppu.bigTiles[l] | ppu.mode === 5 | ppu.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= ppu.bigTiles[l] ? 1 : 0;

        let adr = ppu.tilemapAdr[l] + (((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3));
        adr += ((x & 0x100) > 0 && ppu.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && ppu.tilemapHigher[l]) ? (ppu.tilemapWider[l] ? 2048 : 1024) : 0;
        
        ppu.tilemapBuffer[l] = ppu.vram[adr & 0x7fff];
        if (offset) return;

        const yFlip = (ppu.tilemapBuffer[l] & 0x8000) > 0;
        const xFlip = (ppu.tilemapBuffer[l] & 0x4000) > 0;
        const yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = ppu.tilemapBuffer[l] & 0x3ff;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += ppu.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

        const bits = SnesPpuMathUnit.BIT_PER_MODE[ppu.mode * 4 + l];

        ppu.tileBufferP1[l] = ppu.vram[(ppu.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7fff];
        if (bits > 2) {
            ppu.tileBufferP1[l] = ppu.vram[(ppu.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7fff];
            ppu.tileBufferP2[l] = ppu.vram[(ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 8) & 0x7fff];
        }
        if (bits > 4) {
            ppu.tileBufferP3[l] = ppu.vram[(ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 16) & 0x7fff];
            ppu.tileBufferP4[l] = ppu.vram[(ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 24) & 0x7fff];
        }
    }

    /**
     * Resolves mathematical window clipping logic.
     */
    static getWindowState(ppu, x, l) {
        if (!ppu.window1Enabled[l] && !ppu.window2Enabled[l]) {
            return false;
        }
        if (ppu.window1Enabled[l] && !ppu.window2Enabled[l]) {
            const test = x >= ppu.window1Left && x <= ppu.window1Right;
            return ppu.window1Inversed[l] ? !test : test;
        }
        if (!ppu.window1Enabled[l] && ppu.window2Enabled[l]) {
            const test = x >= ppu.window2Left && x <= ppu.window2Right;
            return ppu.window2Inversed[l] ? !test : test;
        }

        let w1test = x >= ppu.window1Left && x <= ppu.window1Right;
        w1test = ppu.window1Inversed[l] ? !w1test : w1test;
        let w2test = x >= ppu.window2Left && x <= ppu.window2Right;
        w2test = ppu.window2Inversed[l] ? !w2test : w2test;

        switch (ppu.windowMaskLogic[l]) {
            case 0: return w1test || w2test;
            case 1: return w1test && w2test;
            case 2: return w1test !== w2test;
            case 3: return w1test === w2test;
            default: return false;
        }
    }
}

// Global transitional alias for microphases compatibility
window.SnesPpuBackgroundRenderer = SnesPpuBackgroundRenderer;