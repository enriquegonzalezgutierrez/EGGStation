/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Super Nintendo PPU Rasterization Pipeline
 * 
 * Implements scanline-by-scanline SNES PPU rendering logic, incorporating:
 * - Tile background scrolling, mirroring and wrapping (BG1 - BG4)
 * - Sprite evaluation, priority layers, and overlapping masks
 * - Window clipping and masking logic
 * - Mode 7 affine matrix transformation calculations
 * - High-fidelity color math blending (addition, subtraction, averaging)
 * 
 * Aligned with standard hardware specifications to resolve:
 * - [FIXED] Big Tiles Offset Assignment: Restores the missing 'tileNum +=' assignment
 *   during vertical calculation of 16x16 tiles, which previously caused broken tile indices.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Concentrates raw visual rasterization,
 *   priority overlap calculations, and color math blending into a dedicated pipeline.
 */

class SnesPpuRenderer {
    /**
     * @param {SnesPpu} ppu - Injected visual state container.
     */
    constructor(ppu) {
        this.ppu = ppu;

        // Pre-allocated line buffers to ensure zero GC allocations during active frames
        this.spriteLineBuffer = new Uint8Array(256);
        this.spritePrioBuffer = new Uint8Array(256);

        this.mode7Xcoords = new Int32Array(256);
        this.mode7Ycoords = new Int32Array(256);

        // Pre-allocated Tile decoding buffers
        this.tilemapBuffer = new Uint16Array(4);
        this.tileBufferP1 = new Uint16Array(4);
        this.tileBufferP2 = new Uint16Array(4);
        this.tileBufferP3 = new Uint16Array(4);
        this.tileBufferP4 = new Uint16Array(4);

        this.lastTileFetchedX = [-1, -1, -1, -1];
        this.lastTileFetchedY = [-1, -1, -1, -1];
        this.optHorBuffer = [0, 0];
        this.optVerBuffer = [0, 0];
        this.lastOrigTileX = [-1, -1];
    }

    /**
     * Checks if a pixel at X falls inside or outside the active window mask for a given layer.
     * @param {number} x - Horizontal pixel coordinate (0 to 255).
     * @param {number} l - Targeted layer index (0 to 5, where 5 is the color window).
     * @returns {boolean} True if the pixel is inside the active window.
     */
    getWindowState(x, l) {
        if (!this.ppu.window1Enabled[l] && !this.ppu.window2Enabled[l]) {
            return false;
        }

        let w1test = false;
        if (this.ppu.window1Enabled[l]) {
            w1test = x >= this.ppu.window1Left && x <= this.ppu.window1Right;
            if (this.ppu.window1Inversed[l]) w1test = !w1test;
        }

        let w2test = false;
        if (this.ppu.window2Enabled[l]) {
            w2test = x >= this.ppu.window2Left && x <= this.ppu.window2Right;
            if (this.ppu.window2Inversed[l]) w2test = !w2test;
        }

        if (this.ppu.window1Enabled[l] && !this.ppu.window2Enabled[l]) return w1test;
        if (!this.ppu.window1Enabled[l] && this.ppu.window2Enabled[l]) return w2test;

        switch (this.ppu.windowMaskLogic[l]) {
            case 0: return w1test || w2test;
            case 1: return w1test && w2test;
            case 2: return w1test !== w2test;
            case 3: return w1test === w2test;
        }
        return false;
    }

    /**
     * Fetches background tilemap metadata and planar pattern data from VRAM.
     * @param {number} x - Target horizontal pixel coordinate.
     * @param {number} y - Target vertical pixel coordinate.
     * @param {number} l - Targeted background layer index (0 to 3).
     * @param {boolean} offsetOnly - True if only reading the tilemap byte (for offset-per-tile).
     */
    fetchTileInBuffer(x, y, l, offsetOnly = false) {
        let rx = x;
        let ry = y;
        let useXbig = this.ppu.bigTiles[l] || this.ppu.mode === 5 || this.ppu.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= this.ppu.bigTiles[l] ? 1 : 0;

        let adr = this.ppu.tilemapAdr[l] + ((((y & 0xFF) >> 3) << 5) | ((x & 0xFF) >> 3));
        adr += ((x & 0x100) > 0 && this.ppu.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && this.ppu.tilemapHigher[l]) ? (this.ppu.tilemapWider[l] ? 2048 : 1024) : 0;

        this.tilemapBuffer[l] = this.ppu.vram[adr & 0x7FFF];
        if (offsetOnly) return;

        const yFlip = (this.tilemapBuffer[l] & 0x8000) > 0;
        const xFlip = (this.tilemapBuffer[l] & 0x4000) > 0;
        const yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = this.tilemapBuffer[l] & 0x3FF;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += this.ppu.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0; // FIXED: Added 'tileNum +='

        const bits = this.ppu.bitPerMode[this.ppu.mode * 4 + l];

        this.tileBufferP1[l] = this.ppu.vram[(this.ppu.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7FFF];
        if (bits > 2) {
            this.tileBufferP2[l] = this.ppu.vram[(this.ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 8) & 0x7FFF];
        }
        if (bits > 4) {
            this.tileBufferP3[l] = this.ppu.vram[(this.ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 16) & 0x7FFF];
            this.tileBufferP4[l] = this.ppu.vram[(this.ppu.tileAdr[l] + tileNum * 4 * bits + yRow + 24) & 0x7FFF];
        }
    }

    /**
     * Resolves Mode 7 Affine Texture Mapping pixels from matrix coordinates.
     * @param {number} x - Horizontal coordinate.
     * @param {number} y - Vertical coordinate.
     * @param {number} l - Targeted layer index.
     * @param {number} p - Targeted priority value.
     * @returns {number} Decoded palette color index.
     */
    getMode7Pixel(x, y, l, p) {
        let pixelData = this.tilemapBuffer[0];
        if (x !== this.lastTileFetchedX[0] || y !== this.lastTileFetchedY[0]) {
            let rX = this.ppu.mode7FlipX ? 255 - x : x;

            let px = this.mode7Xcoords[rX] >> 8;
            let py = this.mode7Ycoords[rX] >> 8;

            let pixelIsTransparent = false;

            // Handle Mode 7 boundary repeating rules
            if (this.ppu.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
                if (this.ppu.mode7Char0fill) {
                    px &= 0x7;
                    py &= 0x7;
                } else {
                    pixelIsTransparent = true;
                }
            }

            let tileX = (px & 0x3F8) >> 3;
            let tileY = (py & 0x3F8) >> 3;

            let tileByte = this.ppu.vram[(tileY * 128 + tileX)] & 0xFF;
            pixelData = this.ppu.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)];
            pixelData >>= 8;
            pixelData = pixelIsTransparent ? 0 : pixelData;
            
            this.tilemapBuffer[0] = pixelData;
            this.lastTileFetchedX[0] = x;
            this.lastTileFetchedY[0] = y;
        }

        if (l === 1 && (pixelData >> 7) !== p) {
            return 0;
        } else if (l === 1) {
            return pixelData & 0x7F;
        }
        return pixelData;
    }

    /**
     * Extracts a pixel's color from the VRAM pattern buffer for a targeted background layer.
     * @param {number} x - Calculated scroll horizontal coordinate.
     * @param {number} y - Calculated scroll vertical coordinate.
     * @param {number} l - Target layer (0 to 4, where 4 is the sprite layer).
     * @param {number} p - Priority value of the layer's tile.
     * @returns {number} Decoded palette color index.
     */
    getPixelForLayer(x, y, l, p) {
        if (l > 3) {
            if (this.spritePrioBuffer[x] !== p) return 0;
            return this.spriteLineBuffer[x];
        }

        if (this.ppu.mode === 7) {
            return this.getMode7Pixel(x, y, l, p);
        }

        if ((x >> 3) !== this.lastTileFetchedX[l] || y !== this.lastTileFetchedY[l]) {
            this.fetchTileInBuffer(x, y, l);
            this.lastTileFetchedX[l] = (x >> 3);
            this.lastTileFetchedY[l] = y;
        }

        const mapWord = this.tilemapBuffer[l];
        if (((mapWord & 0x2000) >> 13) !== p) {
            return 0;
        }

        let paletteNum = (mapWord & 0x1C00) >> 10;
        let xShift = (mapWord & 0x4000) > 0 ? (x & 0x7) : 7 - (x & 0x7);

        paletteNum += this.ppu.mode === 0 ? l * 8 : 0;

        const bits = this.ppu.bitPerMode[this.ppu.mode * 4 + l];
        let mul = 4;
        
        // Planar decoding (2bpp, 4bpp, 8bpp)
        let tileData = (this.tileBufferP1[l] >> xShift) & 0x1;
        tileData |= ((this.tileBufferP1[l] >> (8 + xShift)) & 0x1) << 1;

        if (bits > 2) {
            mul = 16;
            tileData |= ((this.tileBufferP2[l] >> xShift) & 0x1) << 2;
            tileData |= ((this.tileBufferP2[l] >> (8 + xShift)) & 0x1) << 3;
        }

        if (bits > 4) {
            mul = 256;
            tileData |= ((this.tileBufferP3[l] >> xShift) & 0x1) << 4;
            tileData |= ((this.tileBufferP3[l] >> (8 + xShift)) & 0x1) << 5;
            tileData |= ((this.tileBufferP4[l] >> xShift) & 0x1) << 6;
            tileData |= ((this.tileBufferP4[l] >> (8 + xShift)) & 0x1) << 7;
        }

        return tileData > 0 ? (paletteNum * mul + tileData) : 0;
    }

    /**
     * Resolves the primary or subscreen color and layer coordinates.
     * @param {boolean} sub - True if parsing the subscreen layers.
     * @param {number} x - Horizontal screen coordinate.
     * @param {number} y - Vertical screen coordinate.
     * @returns {Array<number>} An array containing [15-bit color, layer index, palette index].
     */
    getColor(sub, x, y) {
        let modeIndex = this.ppu.layer3Prio && this.ppu.mode === 1 ? 96 : 12 * this.ppu.mode;
        modeIndex = this.ppu.mode7ExBg && this.ppu.mode === 7 ? 108 : modeIndex;
        const count = this.ppu.layercountPerMode[this.ppu.mode];

        let j;
        let pixel = 0;
        let layer = 5;

        // Apply Interlace adjustments for high-resolution modes
        if (this.ppu.interlace && (this.ppu.mode === 5 || this.ppu.mode === 6)) {
            y = y * 2 + (this.ppu.evenFrame ? 1 : 0);
        }

        // Search through layers in priority order
        for (j = 0; j < count; j++) {
            let lx = x;
            let ly = y;
            layer = this.ppu.layersPerMode[modeIndex + j];

            if ((!sub && this.ppu.mainScreenEnabled[layer] && (!this.ppu.mainScreenWindow[layer] || !this.getWindowState(lx, layer))) || 
                (sub && this.ppu.subScreenEnabled[layer] && (!this.ppu.subScreenWindow[layer] || !this.getWindowState(lx, layer)))) {
                
                // Mosaic Effect
                if (this.ppu.mosaicEnabled[layer]) {
                    lx -= lx % this.ppu.mosaicSize;
                    ly -= (ly - this.ppu.mosaicStartLine) % this.ppu.mosaicSize;
                }

                lx += this.ppu.mode === 7 ? 0 : this.ppu.bgHoff[layer];
                ly += this.ppu.mode === 7 ? 0 : this.ppu.bgVoff[layer];

                let optX = lx - this.ppu.bgHoff[layer];
                if ((this.ppu.mode === 5 || this.ppu.mode === 6) && layer < 4) {
                    lx = lx * 2 + (sub ? 0 : 1);
                    optX = optX * 2 + (sub ? 0 : 1);
                }

                // Handle OPT (Offset Per Tile) Column Scrolling for Modes 2, 4, 6
                if ((this.ppu.mode === 2 || this.ppu.mode === 4 || this.ppu.mode === 6) && layer < 2) {
                    let andVal = layer === 0 ? 0x2000 : 0x4000;
                    if (x === 0) this.lastOrigTileX[layer] = lx >> 3;
                    
                    let tileStartX = optX - (lx - (lx & 0xFFF8));
                    if ((lx >> 3) !== this.lastOrigTileX[layer] && x > 0) {
                        this.fetchTileInBuffer(this.ppu.bgHoff[2] + ((tileStartX - 1) & 0x1F8), this.ppu.bgVoff[2], 2, true);
                        this.optHorBuffer[layer] = this.tilemapBuffer[2];
                        
                        if (this.ppu.mode === 4) {
                            if ((this.optHorBuffer[layer] & 0x8000) > 0) {
                                this.optVerBuffer[layer] = this.optHorBuffer[layer];
                                this.optHorBuffer[layer] = 0;
                            } else {
                                this.optVerBuffer[layer] = 0;
                            }
                        } else {
                            this.fetchTileInBuffer(this.ppu.bgHoff[2] + ((tileStartX - 1) & 0x1F8), this.ppu.bgVoff[2] + 8, 2, true);
                            this.optVerBuffer[layer] = this.tilemapBuffer[2];
                        }
                        this.lastOrigTileX[layer] = lx >> 3;
                    }
                    if ((this.optHorBuffer[layer] & andVal) > 0) {
                        let add = ((tileStartX + 7) & 0x1F8);
                        lx = (lx & 0x7) + ((this.optHorBuffer[layer] + add) & 0x1FF8);
                    }
                    if ((this.optVerBuffer[layer] & andVal) > 0) {
                        ly = (this.optVerBuffer[layer] & 0x1FFF) + (ly - this.ppu.bgVoff[layer]);
                    }
                }

                pixel = this.getPixelForLayer(lx, ly, layer, this.ppu.prioPerMode[modeIndex + j]);
            }
            if ((pixel & 0xFF) > 0) break;
        }

        layer = j === count ? 5 : layer;
        let color = this.ppu.cgram[pixel & 0xFF];

        // Direct Color Mode (extract color directly from VRAM data in 256-color modes)
        if (this.ppu.directColor && layer < 4 && this.ppu.bitPerMode[this.ppu.mode * 4 + layer] === 8) {
            let r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
            let g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
            let b = ((pixel & 0xC0) >> 3) | ((pixel & 0x400) >> 8);
            color = (b << 10) | (g << 5) | r;
        }

        return [color, layer, pixel];
    }

    /**
     * Checks if color math (blending) is active for a given layer.
     */
    getMathEnabled(x, l, pal) {
        if (this.ppu.preventMath === 3 ||
            (this.ppu.preventMath === 2 && this.getWindowState(x, 5)) ||
            (this.ppu.preventMath === 1 && !this.getWindowState(x, 5))) {
            return false;
        }
        if (this.ppu.mathEnabled[l] && (l !== 4 || pal >= 0xC0)) {
            return true;
        }
        return false;
    }

    /**
     * Computes horizontal and vertical coordinate arrays for Mode 7 projection.
     * @param {number} y - Active vertical scanline.
     */
    generateMode7Coords(y) {
        let rY = this.ppu.mode7FlipY ? 255 - y : y;

        let clippedH = this.ppu.mode7Hoff - this.ppu.mode7X;
        clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3FF) : (clippedH & 0x3FF);
        
        let clippedV = this.ppu.mode7Voff - this.ppu.mode7Y;
        clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3FF) : (clippedV & 0x3FF);

        let lineStartX = (((this.ppu.mode7A * clippedH) & ~63) + ((this.ppu.mode7B * rY) & ~63) + ((this.ppu.mode7B * clippedV) & ~63) + (this.ppu.mode7X << 8));
        let lineStartY = (((this.ppu.mode7C * clippedH) & ~63) + ((this.ppu.mode7D * rY) & ~63) + ((this.ppu.mode7D * clippedV) & ~63) + (this.ppu.mode7Y << 8));

        this.mode7Xcoords[0] = lineStartX;
        this.mode7Ycoords[0] = lineStartY;

        for (let i = 1; i < 256; i++) {
            this.mode7Xcoords[i] = this.mode7Xcoords[i - 1] + this.ppu.mode7A;
            this.mode7Ycoords[i] = this.mode7Ycoords[i - 1] + this.ppu.mode7C;
        }
    }

    /**
     * Pre-evaluates sprite coordinate limits and caches active attributes for the upcoming scanline.
     * @param {number} line - Active scanline index.
     */
    evaluateSprites(line) {
        let spriteCount = 0;
        let sliverCount = 0;

        let index = this.ppu.objPriority ? ((this.ppu.oamAddress & 0xFE) - 2) & 0xFF : 254;

        for (let i = 0; i < 128; i++) {
            let x = this.ppu.oam[index] & 0xFF;
            let y = (this.ppu.oam[index] & 0xFF00) >> 8;
            let tile = this.ppu.oam[index + 1] & 0xFF;
            let ex = (this.ppu.oam[index + 1] & 0xFF00) >> 8;
            
            x |= (this.ppu.highOam[index >> 4] >> (index & 0xF) & 0x1) << 8;
            let big = ((this.ppu.highOam[index >> 4] >> (index & 0xF)) & 0x2) > 0;
            x = x > 255 ? -(512 - x) : x;

            let size = this.ppu.spriteSizes[this.ppu.objSize + (big ? 8 : 0)];
            let sprRow = line - y;
            
            if (sprRow < 0 || sprRow >= size * (this.ppu.objInterlace ? 4 : 8)) {
                sprRow = line + (256 - y);
            }

            if (sprRow >= 0 && sprRow < size * (this.ppu.objInterlace ? 4 : 8) && x > -(size * 8)) {
                if (spriteCount === 32) break; // Physical sprite limit per scanline

                sprRow = this.ppu.objInterlace ? sprRow * 2 + (this.ppu.evenFrame ? 1 : 0) : sprRow;
                
                let adr = this.ppu.sprAdr1 + ((ex & 0x1) > 0 ? this.ppu.sprAdr2 : 0);
                sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
                let tileRow = sprRow >> 3;
                sprRow &= 0x7;

                for (let k = 0; k < size; k++) {
                    if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                        if (sliverCount === 34) {
                            sliverCount = 35;
                            break; // Tile fetch limit exceeded (34 8-pixel slivers)
                        }

                        let tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                        let tileNum = (tile + this.ppu.spriteTileOffsets[tileRow * 8 + tileColumn]) & 0xFF;
                        
                        let tileP1 = this.ppu.vram[(adr + tileNum * 16 + sprRow) & 0x7FFF];
                        let tileP2 = this.ppu.vram[(adr + tileNum * 16 + sprRow + 8) & 0x7FFF];
                        
                        for (let j = 0; j < 8; j++) {
                            let shift = ((ex & 0x40) > 0) ? j : 7 - j;
                            let tileData = (tileP1 >> shift) & 0x1;
                            tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
                            tileData |= ((tileP2 >> shift) & 0x1) << 2;
                            tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;
                            
                            let color = tileData + 16 * ((ex & 0xE) >> 1);
                            let xInd = x + k * 8 + j;
                            
                            if (tileData > 0 && xInd >= 0 && xInd < 256) {
                                this.spriteLineBuffer[xInd] = 0x80 + color;
                                this.spritePrioBuffer[xInd] = (ex & 0x30) >> 4;
                            }
                        }
                        sliverCount++;
                    }
                }
                if (sliverCount === 35) break;
                spriteCount++;
            }
            index = (index - 2) & 0xFF;
        }
    }

    /**
     * Renders a complete visible scanline row into the shared frame buffer.
     * @param {number} line - Active scanline index (0 to 239).
     * @param {Uint8ClampedArray} outBuffer - Frame buffer reference.
     */
    renderScanline(line, outBuffer) {
        if (line === 0) {
            this.ppu.frameOverscan = false;
            this.spriteLineBuffer.fill(0);
            if (!this.ppu.forcedBlank) {
                this.evaluateSprites(0);
            }
        } 
        else if (line > 0 && line < (this.ppu.frameOverscan ? 240 : 225)) {
            if (line === 1) this.ppu.mosaicStartLine = 1;
            
            if (this.ppu.mode === 7) {
                this.generateMode7Coords(line);
            }

            this.lastTileFetchedX = [-1, -1, -1, -1];
            this.lastTileFetchedY = [-1, -1, -1, -1];
            this.optHorBuffer = [0, 0];
            this.optVerBuffer = [0, 0];
            this.lastOrigTileX = [-1, -1];

            let bMult = this.ppu.brightnessMults[this.ppu.brightness];
            let outOffset = line * 256 * 4;

            for (let i = 0; i < 256; i++) {
                let r1 = 0, g1 = 0, b1 = 0;
                let r2 = 0, g2 = 0, b2 = 0;

                if (!this.ppu.forcedBlank) {
                    let colLay = this.getColor(false, i, line);
                    let color = colLay[0];

                    r2 = color & 0x1F;
                    g2 = (color & 0x3E0) >> 5;
                    b2 = (color & 0x7C00) >> 10;

                    // Apply windowing color clipping rules
                    if (this.ppu.colorClip === 3 || 
                       (this.ppu.colorClip === 2 && this.getWindowState(i, 5)) || 
                       (this.ppu.colorClip === 1 && !this.getWindowState(i, 5))) {
                        r2 = 0; g2 = 0; b2 = 0;
                    }

                    let secondLay = [0, 5, 0];
                    if (this.ppu.mode === 5 || this.ppu.mode === 6 || this.ppu.pseudoHires || 
                       (this.getMathEnabled(i, colLay[1], colLay[2]) && this.ppu.addSub)) {
                        secondLay = this.getColor(true, i, line);
                        r1 = secondLay[0] & 0x1F;
                        g1 = (secondLay[0] & 0x3E0) >> 5;
                        b1 = (secondLay[0] & 0x7C00) >> 10;
                    }

                    // Apply Color Math (Addition / Subtraction / Halving)
                    if (this.getMathEnabled(i, colLay[1], colLay[2])) {
                        if (this.ppu.subtractColors) {
                            r2 -= (this.ppu.addSub && secondLay[1] < 5) ? r1 : this.ppu.fixedColorR;
                            g2 -= (this.ppu.addSub && secondLay[1] < 5) ? g1 : this.ppu.fixedColorG;
                            b2 -= (this.ppu.addSub && secondLay[1] < 5) ? b1 : this.ppu.fixedColorB;
                        } else {
                            r2 += (this.ppu.addSub && secondLay[1] < 5) ? r1 : this.ppu.fixedColorR;
                            g2 += (this.ppu.addSub && secondLay[1] < 5) ? g1 : this.ppu.fixedColorG;
                            b2 += (this.ppu.addSub && secondLay[1] < 5) ? b1 : this.ppu.fixedColorB;
                        }

                        if (this.ppu.halfColors && (secondLay[1] < 5 || !this.ppu.addSub)) {
                            r2 >>= 1; g2 >>= 1; b2 >>= 1;
                        }

                        r2 = r2 > 31 ? 31 : (r2 < 0 ? 0 : r2);
                        g2 = g2 > 31 ? 31 : (g2 < 0 ? 0 : g2);
                        b2 = b2 > 31 ? 31 : (b2 < 0 ? 0 : b2);
                    }

                    if (!(this.ppu.mode === 5 || this.ppu.mode === 6 || this.ppu.pseudoHires)) {
                        r1 = r2; g1 = g2; b1 = b2;
                    }
                }

                // Decode to 24-bit sRGB mapped output
                outBuffer[outOffset++] = (r1 * bMult) & 0xFF;
                outBuffer[outOffset++] = (g1 * bMult) & 0xFF;
                outBuffer[outOffset++] = (b1 * bMult) & 0xFF;
                outBuffer[outOffset++] = 255; // Alpha channel opaque
            }

            // Flush sprite buffer and pre-calculate upcoming line
            this.spriteLineBuffer.fill(0);
            if (!this.ppu.forcedBlank) {
                this.evaluateSprites(line);
            }
        }
    }
}

window.SnesPpuRenderer = SnesPpuRenderer;