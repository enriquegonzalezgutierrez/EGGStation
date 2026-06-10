/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/ppu/SnesPpuCompositor.js
 * 
 * Domain Layer: Super Nintendo (SNES) PPU Video Compositor
 * 
 * Role:
 * Composites active backgrounds and prioritized sprites into a final scanline, 
 * resolving window masking, mosaic, and advanced color blending mathematics 
 * (transparency, addition, subtraction, half-color division).
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for scanline 
 *   layer compositing and color blending calculations, delegating background 
 *   fetching to SnesPpuBackground, sprites to SnesPpuSprite, and Mode 7 coordinates 
 *   to SnesPpuMode7.
 */

class SnesPpuCompositor {
    /**
     * Composites a single scanline row, resolving layers priorities and color blending.
     * @param {SnesPpu} ppu - The parent PPU instance context (DIP).
     * @param {number} line - The active scanline index.
     */
    static renderLine(ppu, line) {
        if (line === 0) {
            ppu.rangeOver = false;
            ppu.timeOver = false;
            ppu.frameOverscan = false;
            ppu.frameInterlace = false;
            ppu.spriteLineBuffer.fill(0);
            if (!ppu.forcedBlank) {
                SnesPpuSprite.buildSpriteCache(ppu);
            }
        } else if (line === (ppu.frameOverscan ? 240 : 225)) {
            if (!ppu.forcedBlank) {
                ppu.oamAdr = ppu.oamRegAdr;
                ppu.oamInHigh = ppu.oamRegInHigh;
                ppu.oamSecond = false;
            }
            ppu.frameInterlace = ppu.interlace;
            ppu.evenFrame = !ppu.evenFrame;
        } else if (line > 0 && line < (ppu.frameOverscan ? 240 : 225)) {
            if (line === 1) {
                ppu.mosaicStartLine = 1;
            }
            if (ppu.mode === 7) {
                SnesPpuMode7.generateMode7Coords(ppu, line);
            }

            // High-speed window masks mapping
            for (let l = 0; l < 6; l++) {
                const w1Enabled = ppu.window1Enabled[l];
                const w2Enabled = ppu.window2Enabled[l];
                const mask = ppu.windowMasks[l];
                
                if (!w1Enabled && !w2Enabled) {
                    mask.fill(0);
                    continue;
                }

                const w1Inv = ppu.window1Inversed[l];
                const w2Inv = ppu.window2Inversed[l];
                const left1 = ppu.window1Left;
                const right1 = ppu.window1Right;
                const left2 = ppu.window2Left;
                const right2 = ppu.window2Right;
                const logic = ppu.windowMaskLogic[l];

                for (let x = 0; x < 256; x++) {
                    let w1test = w1Enabled && (x >= left1 && x <= right1);
                    if (w1Inv) w1test = !w1test;
                    let w2test = w2Enabled && (x >= left2 && x <= right2);
                    if (w2Inv) w2test = !w2test;

                    let result = false;
                    if (w1Enabled && w2Enabled) {
                        switch (logic) {
                            case 0: result = w1test || w2test; break;
                            case 1: result = w1test && w2test; break;
                            case 2: result = w1test !== w2test; break;
                            case 3: result = w1test === w2test; break;
                        }
                    } else if (w1Enabled) {
                        result = w1test;
                    } else {
                        result = w2test;
                    }
                    mask[x] = result ? 1 : 0;
                }
            }

            ppu.lastTileFetchedX.fill(-1);
            ppu.lastTileFetchedY.fill(-1);
            ppu.optHorBuffer.fill(0);
            ppu.optVerBuffer.fill(0);
            ppu.lastOrigTileX.fill(-1);

            const bMult = SnesPpu.brightnessMults[ppu.brightness];
            const lineOffset = line * 1536;
            const colorClipValue = ppu.colorClip;
            const colMask5 = ppu.windowMasks[5];
            const pixelOut = ppu.pixelOutput;
            const modeNum = ppu.mode;
            const isPseudoHires = ppu.pseudoHires;
            const isSubEnabled = ppu.addSub;

            const useScanlineFastPath = !ppu.pseudoHires && (modeNum === 0 || modeNum === 1 || modeNum === 3);

            if (useScanlineFastPath && !ppu.forcedBlank) {
                for (let l = 0; l < 4; l++) {
                    SnesPpuBackground.renderBgScanline(ppu, l, line);
                }
            }

            let i = 0;
            while (i < 256) {
                let r1 = 0, g1 = 0, b1 = 0;
                let r2 = 0, g2 = 0, b2 = 0;

                if (!ppu.forcedBlank) {
                    const colLay = useScanlineFastPath ? this.getColorFast(ppu, false, i, line) : this.getColor(ppu, false, i, line);
                    const color = colLay[0];
                    const activeLayer = colLay[1];
                    const activePal = colLay[2];

                    r2 = color & 0x1f;
                    g2 = (color & 0x3e0) >> 5;
                    b2 = (color & 0x7c00) >> 10;

                    if (
                        colorClipValue === 3 ||
                        (colorClipValue === 2 && colMask5[i] === 1) ||
                        (colorClipValue === 1 && colMask5[i] === 0)
                    ) {
                        r2 = 0; g2 = 0; b2 = 0;
                    }

                    let secondLayerNum = 5;
                    const mathEnabled = this.getMathEnabled(ppu, i, activeLayer, activePal);
                    
                    if (
                        modeNum === 5 || modeNum === 6 || isPseudoHires ||
                        (mathEnabled && isSubEnabled)
                    ) {
                        const secondLay = useScanlineFastPath ? this.getColorFast(ppu, true, i, line) : this.getColor(ppu, true, i, line);
                        r1 = secondLay[0] & 0x1f;
                        g1 = (secondLay[0] & 0x3e0) >> 5;
                        b1 = (secondLay[0] & 0x7c00) >> 10;
                        secondLayerNum = secondLay[1];
                    }

                    if (mathEnabled) {
                        const useSecondColor = isSubEnabled && secondLayerNum < 5;
                        const mathR = useSecondColor ? r1 : ppu.fixedColorR;
                        const mathG = useSecondColor ? g1 : ppu.fixedColorG;
                        const mathB = useSecondColor ? b1 : ppu.fixedColorB;

                        if (ppu.subtractColors) {
                            r2 -= mathR; g2 -= mathG; b2 -= mathB;
                        } else {
                            r2 += mathR; g2 += mathG; b2 += mathB;
                        }

                        if (ppu.halfColors && (secondLayerNum < 5 || !isSubEnabled)) {
                            r2 >>= 1; g2 >>= 1; b2 >>= 1;
                        }
                        if (r2 > 31) r2 = 31; else if (r2 < 0) r2 = 0;
                        if (g2 > 31) g2 = 31; else if (g2 < 0) g2 = 0;
                        if (b2 > 31) b2 = 31; else if (b2 < 0) b2 = 0;
                    }

                    if (!(modeNum === 5 || modeNum === 6 || isPseudoHires)) {
                        r1 = r2; g1 = g2; b1 = b2;
                    }
                }
                
                const idx = lineOffset + 6 * i;
                pixelOut[idx] = (r1 * bMult) & 0xff;
                pixelOut[idx + 1] = (g1 * bMult) & 0xff;
                pixelOut[idx + 2] = (b1 * bMult) & 0xff;
                pixelOut[idx + 3] = (r2 * bMult) & 0xff;
                pixelOut[idx + 4] = (g2 * bMult) & 0xff;
                pixelOut[idx + 5] = (b2 * bMult) & 0xff;

                i++;
            }

            ppu.spriteLineBuffer.fill(0);
            if (!ppu.forcedBlank) {
                SnesPpuSprite.evaluateSprites(ppu, line);
            }
        }
    }

    /**
     * Fast-path pixel color selector (bypasses heavy pseudo-hires and scaling transformations).
     */
    static getColorFast(ppu, sub, x, y) {
        let modeIndex = ppu.layer3Prio && ppu.mode === 1 ? 96 : 12 * ppu.mode;
        modeIndex = ppu.mode7ExBg && ppu.mode === 7 ? 108 : modeIndex;
        let count = SnesPpu.layercountPerMode[ppu.mode];

        let pixel = 0;
        let layer = 5;

        const subEnabled = ppu.subScreenEnabled;
        const mainEnabled = ppu.mainScreenEnabled;
        const subWindow = ppu.subScreenWindow;
        const mainWindow = ppu.mainScreenWindow;
        const winMasks = ppu.windowMasks;

        let j;
        for (j = 0; j < count; j++) {
            layer = SnesPpu.layersPerMode[modeIndex + j];
            const isVisible = sub ? subEnabled[layer] : mainEnabled[layer];
            const isWindowRestricted = sub ? subWindow[layer] : mainWindow[layer];

            if (isVisible && (!isWindowRestricted || winMasks[layer][x] === 0)) {
                if (layer < 4) {
                    const priority = ppu.bgPriorityBuffers[layer][x];
                    if (priority === SnesPpu.prioPerMode[modeIndex + j]) {
                        const colorIdx = ppu.bgBuffers[layer][x];
                        if (colorIdx !== 0) {
                            pixel = colorIdx;
                            break;
                        }
                    }
                } else {
                    if (ppu.spritePrioBuffer[x] === SnesPpu.prioPerMode[modeIndex + j]) {
                        const colorIdx = ppu.spriteLineBuffer[x];
                        if (colorIdx !== 0) {
                            pixel = colorIdx;
                            break;
                        }
                    }
                }
            }
        }

        layer = j === count ? 5 : layer;
        let color = ppu.cgram[pixel & 0xff];
        
        if (
            ppu.directColor && layer < 4 &&
            SnesPpu.bitPerMode[ppu.mode * 4 + layer] === 8
        ) {
            let r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
            let g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
            let b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
            color = (b << 10) | (g << 5) | r;
        }

        ppu.pixelOutputCache[0] = color;
        ppu.pixelOutputCache[1] = layer;
        ppu.pixelOutputCache[2] = pixel;
        return ppu.pixelOutputCache;
    }

    /**
     * Full-path pixel color selector (supports advanced interlace, mosaic, and offsets-per-tile).
     */
    static getColor(ppu, sub, x, y) {
        let modeIndex = ppu.layer3Prio && ppu.mode === 1 ? 96 : 12 * ppu.mode;
        modeIndex = ppu.mode7ExBg && ppu.mode === 7 ? 108 : modeIndex;
        let count = SnesPpu.layercountPerMode[ppu.mode];

        let pixel = 0;
        let layer = 5;
        if (ppu.interlace && (ppu.mode === 5 || ppu.mode === 6)) {
            y = y * 2 + (ppu.evenFrame ? 1 : 0);
        }

        const subEnabled = ppu.subScreenEnabled;
        const mainEnabled = ppu.mainScreenEnabled;
        const subWindow = ppu.subScreenWindow;
        const mainWindow = ppu.mainScreenWindow;
        const winMasks = ppu.windowMasks;

        let j;
        for (j = 0; j < count; j++) {
            let lx = x;
            let ly = y;
            layer = SnesPpu.layersPerMode[modeIndex + j];
            
            const isVisible = sub ? subEnabled[layer] : mainEnabled[layer];
            const isWindowRestricted = sub ? subWindow[layer] : mainWindow[layer];

            if (isVisible && (!isWindowRestricted || winMasks[layer][lx] === 0)) {
                if (ppu.mosaicEnabled[layer]) {
                    lx -= lx % ppu.mosaicSize;
                    ly -= (ly - ppu.mosaicStartLine) % ppu.mosaicSize;
                }
                lx += ppu.mode === 7 ? 0 : ppu.bgHoff[layer];
                ly += ppu.mode === 7 ? 0 : ppu.bgVoff[layer];
                let optX = lx - ppu.bgHoff[layer];
                if ((ppu.mode === 5 || ppu.mode === 6) && layer < 4) {
                    lx = lx * 2 + (sub ? 0 : 1);
                    optX = optX * 2 + (sub ? 0 : 1);
                }

                if ((ppu.mode === 2 || ppu.mode === 4 || ppu.mode === 6) && layer < 2) {
                    let andVal = layer === 0 ? 0x2000 : 0x4000;
                    if (x === 0) {
                        ppu.lastOrigTileX[layer] = lx >> 3;
                    }
                    let tileStartX = optX - (lx - (lx & 0xfff8));
                    if ((lx >> 3) !== ppu.lastOrigTileX[layer] && x > 0) {
                        SnesPpuBackground.fetchTileInBuffer(
                            ppu,
                            ppu.bgHoff[2] + ((tileStartX - 1) & 0x1f8),
                            ppu.bgVoff[2], 2, true
                        );
                        ppu.optHorBuffer[layer] = ppu.tilemapBuffer[2];
                        if (ppu.mode === 4) {
                            if ((ppu.optHorBuffer[layer] & 0x8000) > 0) {
                                ppu.optVerBuffer[layer] = ppu.optHorBuffer[layer];
                                ppu.optHorBuffer[layer] = 0;
                            } else {
                                ppu.optVerBuffer[layer] = 0;
                            }
                        } else {
                            SnesPpuBackground.fetchTileInBuffer(
                                ppu,
                                ppu.bgHoff[2] + ((tileStartX - 1) & 0x1f8),
                                ppu.bgVoff[2] + 8, 2, true
                            );
                            ppu.optVerBuffer[layer] = ppu.tilemapBuffer[2];
                        }
                        ppu.lastOrigTileX[layer] = lx >> 3;
                    }
                    if ((ppu.optHorBuffer[layer] & andVal) > 0) {
                        let add = ((tileStartX + 7) & 0x1f8);
                        lx = (lx & 0x7) + ((ppu.optHorBuffer[layer] + add) & 0x1ff8);
                    }
                    if ((ppu.optVerBuffer[layer] & andVal) > 0) {
                        ly = (ppu.optVerBuffer[layer] & 0x1fff) + (ly - ppu.bgVoff[layer]);
                    }
                }

                pixel = this.getPixelForLayer(
                    ppu,
                    lx, ly,
                    layer,
                    SnesPpu.prioPerMode[modeIndex + j]
                );
            }
            if ((pixel & 0xff) > 0) {
                break;
            }
        }
        layer = j === count ? 5 : layer;
        let color = ppu.cgram[pixel & 0xff];
        if (
            ppu.directColor && layer < 4 &&
            SnesPpu.bitPerMode[ppu.mode * 4 + layer] === 8
        ) {
            let r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
            let g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
            let b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
            color = (b << 10) | (g << 5) | r;
        }

        ppu.pixelOutputCache[0] = color;
        ppu.pixelOutputCache[1] = layer;
        ppu.pixelOutputCache[2] = pixel;
        return ppu.pixelOutputCache;
    }

    static getWindowState(ppu, x, l) {
        return ppu.windowMasks[l][x] === 1;
    }

    /**
     * Checks if color math operations are enabled for the target pixel.
     */
    static getMathEnabled(ppu, x, l, pal) {
        if (
            ppu.preventMath === 3 ||
            (ppu.preventMath === 2 && ppu.windowMasks[5][x] === 1) ||
            (ppu.preventMath === 1 && ppu.windowMasks[5][x] === 0)
        ) {
            return false;
        }
        if (ppu.mathEnabled[l] && (l !== 4 || pal >= 0xc0)) {
            return true;
        }
        return false;
    }

    /**
     * Returns the color index and priority for the target active background/sprite layer.
     */
    static getPixelForLayer(ppu, x, y, l, p) {
        if (l > 3) {
            if (ppu.spritePrioBuffer[x] !== p) {
                return 0;
            }
            return ppu.spriteLineBuffer[x];
        }

        if (ppu.mode === 7) {
            return SnesPpuMode7.getMode7Pixel(ppu, x, y, l, p);
        }

        const currentXTile = x >> 3;
        if (
            currentXTile !== ppu.lastTileFetchedX[l] ||
            y !== ppu.lastTileFetchedY[l]
        ) {
            SnesPpuBackground.fetchTileInBuffer(ppu, x, y, l, false);
            ppu.lastTileFetchedX[l] = currentXTile;
            ppu.lastTileFetchedY[l] = y;
        }

        let mapWord = ppu.tilemapBuffer[l];
        if (((mapWord & 0x2000) >> 13) !== p) {
            return 0;
        }

        const tileData = ppu.decodedRow[l][x & 0x7];
        if (tileData === 0) return 0;

        let paletteNum = (mapWord & 0x1c00) >> 10;
        paletteNum += ppu.mode === 0 ? l * 8 : 0;

        let bits = SnesPpu.bitPerMode[ppu.mode * 4 + l];
        let mul = bits === 2 ? 4 : (bits === 4 ? 16 : 256);

        return paletteNum * mul + tileData;
    }

    /**
     * High-speed copy of raw pixels buffer into the canvas ImageData object.
     */
    static setPixels(ppu, arr) {
        if (!ppu.frameOverscan) {
            arr.fill(0, 0, 32768);
            arr.fill(0, 950272, 983040);
        }

        let addY = ppu.frameOverscan ? 0 : 14;

        for (let i = 512; i < 512 * (ppu.frameOverscan ? 240 : 225); i++) {
            let x = i % 512;
            let y = (i >> 9) * 2;
            let ind = ((y + addY) * 512 + x) * 4;
            let r = ppu.pixelOutput[i * 3];
            let g = ppu.pixelOutput[i * 3 + 1];
            let b = ppu.pixelOutput[i * 3 + 2];
            
            if (!ppu.frameInterlace || ppu.evenFrame) {
                arr[ind] = r;
                arr[ind + 1] = g;
                arr[ind + 2] = b;
                arr[ind + 3] = 255;
            }
            ind += 2048;
            if (!ppu.frameInterlace || !ppu.evenFrame) {
                arr[ind] = r;
                arr[ind + 1] = g;
                arr[ind + 2] = b;
                arr[ind + 3] = 255;
            }
        }
    }
}