/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuBackgroundRenderer (Highly Optimized Background Layer Engine with Priority-Packed Scanline Buffers)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Implements the standard background plane rendering pipeline of the SNES PPU.
 * It decodes VRAM tilemaps, handles offset-per-tile shifts (BG scrolling variations),
 * evaluates hardware Window clipping masks, and resolves pixel colors.
 * OPTIMIZED: Employs Loop Fission (Scanline Buffering) to render entire background rows
 * sequentially at x === 0, converting pixel resolution into high-speed array lookups.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles background plane rendering, tilemap fetches, and window math.
 */

class SnesPpuBackgroundRenderer {
    /**
     * Resolves the active pixel color across the prioritized background and sprite layers.
     * GC-FREE: Employs direct array index lookup on cached tile buffers.
     */
    static resolveColor(ppu, sub, x, y) {
        // Trigger sequential scanline buffering on the first pixel of the row
        if (x === 0) {
            this.preRenderScanlines(ppu, y);
        }

        // Local cache of PPU states to bypass property access overhead
        const mode = ppu.mode;
        const layer3Prio = ppu.layer3Prio;
        const mode7ExBg = ppu.mode7ExBg;
        const directColor = ppu.directColor;
        const cgram = ppu.cgram;

        // Cache external static math arrays locally
        const layers = SnesPpuMathUnit.LAYERS_PER_MODE;
        const prios = SnesPpuMathUnit.PRIO_PER_MODE;
        const bitsArray = SnesPpuMathUnit.BIT_PER_MODE;

        let modeIndex = layer3Prio && mode === 1 ? 96 : 12 * mode;
        modeIndex = mode7ExBg && mode === 7 ? 108 : modeIndex;
        const count = SnesPpuMathUnit.LAYER_COUNT_PER_MODE[mode];

        let j;
        let pixel = 0;
        let layer = 5;

        // Loop through layers in priority order for the active Mode
        for (j = 0; j < count; j++) {
            layer = layers[modeIndex + j]; // Fast local index lookup

            // Evaluate screen visibility
            const isLayerEnabled = !sub ? ppu.mainScreenEnabled[layer] : ppu.subScreenEnabled[layer];
            
            if (isLayerEnabled) {
                const isWindowActive = !sub ? ppu.mainScreenWindow[layer] : ppu.subScreenWindow[layer];
                
                // Fast Window bypass using screen-fixed physical coordinates
                const windowState = (isWindowActive && (ppu.window1Enabled[layer] || ppu.window2Enabled[layer]))
                    ? this.getWindowState(ppu, x, layer)
                    : false;

                if (!isWindowActive || !windowState) {
                    const currentPriority = prios[modeIndex + j];
                    
                    if (layer > 3) {
                        // Sprites are already in a scanline buffer, direct read!
                        if (ppu.spritePrioBuffer[x] === currentPriority) {
                            pixel = ppu.spriteLineBuffer[x];
                        }
                    } else if (mode === 7) {
                        pixel = SnesPpuMode7Renderer.getPixel(ppu, x, y, layer, currentPriority);
                    } else {
                        // High-speed pre-rendered scanline buffer read!
                        // Unpack priority and final pixel value using rapid bitwise masking
                        const packedData = ppu.bgLineBuffers[layer][x];
                        const tilePriority = packedData >> 12;
                        
                        if (tilePriority === currentPriority) {
                            pixel = packedData & 0xfff; // Extract final 12-bit pixel value
                        }
                    }
                }
            }

            if ((pixel & 0xff) > 0) {
                break;
            }
        }

        layer = j === count ? 5 : layer;
        let color = cgram[pixel & 0xff];

        // Handle Direct Color modes (Standard 8-bpp layer bypass)
        if (directColor && layer < 4 && bitsArray[(mode << 2) + layer] === 8) {
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
     * Sequentially pre-renders all active background layers for the current scanline.
     * Loop Fission: Restructures interleaved pixel calculations into flat sequential loops.
     */
    static preRenderScanlines(ppu, y) {
        // Initialize scanline buffer caches on first demand
        if (!ppu.bgLineBuffers) {
            ppu.bgLineBuffers = [
                new Uint16Array(256), // BG1
                new Uint16Array(256), // BG2
                new Uint16Array(256), // BG3
                new Uint16Array(256), // BG4
            ];
        }

        const mode = ppu.mode;
        const layer3Prio = ppu.layer3Prio;
        const mode7ExBg = ppu.mode7ExBg;
        const bgLineBuffers = ppu.bgLineBuffers;

        let modeIndex = layer3Prio && mode === 1 ? 96 : 12 * mode;
        modeIndex = mode7ExBg && mode === 7 ? 108 : modeIndex;
        const count = SnesPpuMathUnit.LAYER_COUNT_PER_MODE[mode];
        const layers = SnesPpuMathUnit.LAYERS_PER_MODE;

        // Render each visible background plane sequentially
        for (let j = 0; j < count; j++) {
            const layer = layers[modeIndex + j];
            if (layer > 3) continue; // Sprites are resolved separately on the fly

            const buf = bgLineBuffers[layer];
            buf.fill(0); // Zero out buffer

            // Skip rendering if the background is completely inactive on both screens
            if (!ppu.mainScreenEnabled[layer] && !ppu.subScreenEnabled[layer]) {
                continue;
            }

            const hoff = ppu.bgHoff[layer];
            const voff = ppu.bgVoff[layer];

            // Ultra-fast sequential scanline rendering (JIT vectorization optimized)
            for (let px = 0; px < 256; px++) {
                let lx = px;
                let ly = y;

                if (ppu.mosaicEnabled[layer]) {
                    lx -= lx % ppu.mosaicSize;
                    ly -= (ly - ppu.mosaicStartLine) % ppu.mosaicSize;
                }

                lx += mode === 7 ? 0 : hoff;
                ly += mode === 7 ? 0 : voff;

                if ((mode === 5 || mode === 6) && layer < 4) {
                    lx = (lx << 1) + 1;
                }

                // Offset-Per-Tile (OPT) logic (Modes 2, 4, 6)
                if ((mode === 2 || mode === 4 || mode === 6) && layer < 2) {
                    const optX = lx - hoff;
                    const andVal = layer === 0 ? 0x2000 : 0x4000;
                    if (px === 0) {
                        ppu.lastOrigTileX[layer] = lx >> 3;
                    }
                    const tileStartX = optX - (lx - (lx & 0xfff8));
                    if ((lx >> 3) !== ppu.lastOrigTileX[layer] && px > 0) {
                        this.fetchTileInBuffer(ppu, ppu.bgHoff[2] + ((tileStartX - 1) & 0x1f8), ppu.bgVoff[2], 2, true);
                        ppu.optHorBuffer[layer] = ppu.tilemapBuffer[2];
                        
                        if (mode === 4) {
                            if ((ppu.optHorBuffer[layer] & 0x8000) > 0) {
                                ppu.optVerBuffer[layer] = ppu.optHorBuffer[layer];
                                ppu.optVerBuffer[layer] = 0;
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
                        ly = (ppu.optVerBuffer[layer] & 0x1fff) + (ly - voff);
                    }
                }

                // Fetch tile parameters sequentially
                const lastX = ppu.lastTileFetchedX[layer];
                const lastY = ppu.lastTileFetchedY[layer];
                const currentXTile = lx >> 3;

                if (currentXTile !== lastX || ly !== lastY) {
                    this.fetchTileInBuffer(ppu, lx, ly, layer, false);
                    ppu.lastTileFetchedX[layer] = currentXTile;
                    ppu.lastTileFetchedY[layer] = ly;
                }

                const mapWord = ppu.tilemapBuffer[layer];
                const tileData = ppu.decodedRow[layer][lx & 0x7];
                
                if (tileData > 0) {
                    // Extract both priority and pixel index sequentially
                    const priority = (mapWord & 0x2000) >> 13;
                    let paletteNum = (mapWord & 0x1c00) >> 10;
                    if (mode === 0) {
                        paletteNum += layer * 8;
                    }
                    const bits = SnesPpuMathUnit.BIT_PER_MODE[(mode << 2) + layer];
                    const mul = bits === 2 ? 4 : (bits === 4 ? 16 : 256);

                    const finalPixel = paletteNum * mul + tileData;
                    
                    // Pack priority (0-1) in the upper 4 bits, and 12-bit pixel value in the lower bits
                    buf[px] = (priority << 12) | finalPixel;
                }
            }
        }
    }

    /**
     * Resolves the pixel index value of the selected layer.
     * GC-FREE: Employs direct array index lookup on cached tile buffers.
     * Retained for background systems compatibility during microphases swaps.
     */
    static getPixelForLayer(ppu, x, y, l, p) {
        if (l > 3) {
            if (ppu.spritePrioBuffer[x] !== p) return 0;
            return ppu.spriteLineBuffer[x];
        }

        if (ppu.mode === 7) {
            return SnesPpuMode7Renderer.getPixel(ppu, x, y, l, p);
        }

        const lastX = ppu.lastTileFetchedX[l];
        const lastY = ppu.lastTileFetchedY[l];
        const currentXTile = x >> 3;

        if (currentXTile !== lastX || y !== lastY) {
            this.fetchTileInBuffer(ppu, x, y, l, false);
            ppu.lastTileFetchedX[l] = currentXTile;
            ppu.lastTileFetchedY[l] = y;
        }

        const mapWord = ppu.tilemapBuffer[l];
        if (((mapWord & 0x2000) >> 13) !== p) return 0;

        const tileData = ppu.decodedRow[l][x & 0x7];
        if (tileData === 0) return 0;

        let paletteNum = (mapWord & 0x1c00) >> 10;
        
        if (ppu.mode === 0) {
            paletteNum += l * 8;
        }

        const bits = SnesPpuMathUnit.BIT_PER_MODE[(ppu.mode << 2) + l];
        const mul = bits === 2 ? 4 : (bits === 4 ? 16 : 256);

        return paletteNum * mul + tileData;
    }

    /**
     * Fetches tile bytes into the active PPU tile buffer and decodes them into the pixel row cache.
     */
    static fetchTileInBuffer(ppu, x, y, l, offset) {
        // High-precision timing capture of VRAM tile decoding
        const t0 = performance.now();

        const rx = x;
        const ry = y;
        const useXbig = ppu.bigTiles[l] | ppu.mode === 5 | ppu.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= ppu.bigTiles[l] ? 1 : 0;

        let adr = ppu.tilemapAdr[l] + (((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3));
        adr += ((x & 0x100) > 0 && ppu.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && ppu.tilemapHigher[l]) ? (ppu.tilemapWider[l] ? 2048 : 1024) : 0;
        
        ppu.tilemapBuffer[l] = ppu.vram[adr & 0x7fff];
        if (offset) {
            // Accumulate timing metric safely
            ppu.profFetchTime = (ppu.profFetchTime || 0) + (performance.now() - t0);
            return;
        }

        const tilemapWord = ppu.tilemapBuffer[l];
        const yFlip = (tilemapWord & 0x8000) > 0;
        const xFlip = (tilemapWord & 0x4000) > 0;
        const yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = tilemapWord & 0x3ff;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += ppu.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

        const bits = SnesPpuMathUnit.BIT_PER_MODE[(ppu.mode << 2) + l];
        const tileBaseOffset = ppu.tileAdr[l] + tileNum * 4 * bits + yRow;

        // Load plane buffers
        const p1 = ppu.vram[tileBaseOffset & 0x7fff];
        ppu.tileBufferP1[l] = p1;
        
        let p2 = 0, p3 = 0, p4 = 0;
        if (bits > 2) {
            p2 = ppu.vram[(tileBaseOffset + 8) & 0x7fff];
            ppu.tileBufferP2[l] = p2;
        }
        if (bits > 4) {
            p3 = ppu.vram[(tileBaseOffset + 16) & 0x7fff];
            p4 = ppu.vram[(tileBaseOffset + 24) & 0x7fff];
            ppu.tileBufferP3[l] = p3;
            ppu.tileBufferP4[l] = p4;
        }

        // Initialize high-speed decoded row cache array on the PPU context if absent
        if (!ppu.decodedRow) {
            ppu.decodedRow = [
                new Uint8Array(8), // BG1
                new Uint8Array(8), // BG2
                new Uint8Array(8), // BG3
                new Uint8Array(8), // BG4
            ];
        }

        // BATCHED TILE ROW DECODING: Processes 8 pixels at once (triggered only once per tile)
        const decoded = ppu.decodedRow[l];
        
        if (xFlip) {
            for (let j = 0; j < 8; j++) {
                const shift = j;
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

        // Accumulate timing metric safely
        ppu.profFetchTime = (ppu.profFetchTime || 0) + (performance.now() - t0);
    }

    /**
     * Resolves mathematical window clipping logic.
     */
    static getWindowState(ppu, x, l) {
        const w1Enabled = ppu.window1Enabled[l];
        const w2Enabled = ppu.window2Enabled[l];

        if (!w1Enabled && !w2Enabled) {
            return false;
        }
        if (w1Enabled && !w2Enabled) {
            const test = x >= ppu.window1Left && x <= ppu.window1Right;
            return ppu.window1Inversed[l] ? !test : test;
        }
        if (!w1Enabled && w2Enabled) {
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