/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpu (Picture Processing Unit - GC-Free Edition)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the physical SNES Picture Processing Unit (PPU).
 * OPTIMIZED: Implements high-speed state injection on hot pixel rendering paths.
 * Eliminates up to 6.8 million array allocations per second by caching
 * pixel layers resolution into pre-allocated class fields (resolvedColor, etc.).
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles scanline pixel rendering and video RAM access.
 */

// Module-scoped Constants (Zero allocation lookups)
const LAYERS_PER_MODE = Object.freeze([
    4, 0, 1, 4, 0, 1, 4, 2, 3, 4, 2, 3,
    4, 0, 1, 4, 0, 1, 4, 2, 4, 2, 5, 5,
    4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
    4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
    4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
    4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
    4, 0, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5,
    4, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5, 5,
    2, 4, 0, 1, 4, 0, 1, 4, 2, 4, 5, 5,
    4, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, 5
]);

const PRIO_PER_MODE = Object.freeze([
    3, 1, 1, 2, 0, 0, 1, 1, 1, 0, 0, 0,
    3, 1, 1, 2, 0, 0, 1, 1, 0, 0, 5, 5,
    3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
    3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
    3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
    3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
    3, 1, 2, 1, 0, 0, 5, 5, 5, 5, 5, 5,
    3, 2, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5,
    1, 3, 1, 1, 2, 0, 0, 1, 0, 0, 5, 5,
    3, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5, 5
]);

const BIT_PER_MODE = Object.freeze([
    2, 2, 2, 2,
    4, 4, 2, 5,
    4, 4, 5, 5,
    8, 4, 5, 5,
    8, 2, 5, 5,
    4, 2, 5, 5,
    4, 5, 5, 5,
    8, 5, 5, 5,
    4, 4, 2, 5,
    8, 7, 5, 5
]);

const LAYER_COUNT_PER_MODE = Object.freeze([12, 10, 8, 8, 8, 8, 6, 5, 10, 7]);

const BRIGHTNESS_MULTS = Object.freeze([
    0.1, 0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5, 6, 6.6, 7.1, 7.6, 8.2
]);

const SPRITE_TILE_OFFSETS = Object.freeze([
    0, 1, 2, 3, 4, 5, 6, 7,
    16, 17, 18, 19, 20, 21, 22, 23,
    32, 33, 34, 35, 36, 37, 38, 39,
    48, 49, 50, 51, 52, 53, 54, 55,
    64, 65, 66, 67, 68, 69, 70, 71,
    80, 81, 82, 83, 84, 85, 86, 87,
    96, 97, 98, 99, 100, 101, 102, 103,
    112, 113, 114, 115, 116, 117, 118, 119
]);

const SPRITE_SIZES = Object.freeze([
    1, 1, 1, 2, 2, 4, 2, 2,
    2, 4, 8, 4, 8, 8, 4, 4
]);

class SnesPpu {
    /**
     * @param {Object} snes - Parent hardware aggregate core.
     */
    constructor(snes) {
        this.snes = snes;

        this.vram = new Uint16Array(0x8000);
        this.cgram = new Uint16Array(0x100);
        this.oam = new Uint16Array(0x100);
        this.highOam = new Uint16Array(0x10);

        this.spriteLineBuffer = new Uint8Array(256);
        this.spritePrioBuffer = new Uint8Array(256);

        this.mode7Xcoords = new Int32Array(256);
        this.mode7Ycoords = new Int32Array(256);

        // Pre-allocated properties for GC-Free pixel rendering pipeline
        this.resolvedColor = 0;
        this.resolvedLayer = 0;
        this.resolvedPixel = 0;

        // Primary internal RGB screen buffer (512x240 pixels)
        this.pixelOutput = new Uint16Array(512 * 3 * 240);

        this.reset();
    }

    reset() {
        this.vram.fill(0);
        this.cgram.fill(0);
        this.oam.fill(0);
        this.highOam.fill(0);

        this.spriteLineBuffer.fill(0);
        this.spritePrioBuffer.fill(0);
        this.pixelOutput.fill(0);

        this.mode7Xcoords.fill(0);
        this.mode7Ycoords.fill(0);

        this.resolvedColor = 0;
        this.resolvedLayer = 0;
        this.resolvedPixel = 0;

        // CGRAM State registers
        this.cgramAdr = 0;
        this.cgramSecond = false;
        this.cgramBuffer = 0;

        this.vramInc = 0;
        this.vramRemap = 0;
        this.vramIncOnHigh = false;
        this.vramAdr = 0;
        this.vramReadBuffer = 0;

        this.tilemapWider = [false, false, false, false];
        this.tilemapHigher = [false, false, false, false];
        this.tilemapAdr = [0, 0, 0, 0];
        this.tileAdr = [0, 0, 0, 0];

        this.bgHoff = [0, 0, 0, 0, 0];
        this.bgVoff = [0, 0, 0, 0, 0];
        this.offPrev1 = 0;
        this.offPrev2 = 0;

        this.mode = 0;
        this.layer3Prio = false;
        this.bigTiles = [false, false, false, false];

        this.mosaicEnabled = [false, false, false, false, false];
        this.mosaicSize = 1;
        this.mosaicStartLine = 1;

        this.mainScreenEnabled = [false, false, false, false, false];
        this.subScreenEnabled = [false, false, false, false, false];

        this.forcedBlank = true;
        this.brightness = 0;

        this.oamAdr = 0;
        this.oamRegAdr = 0;
        this.oamInHigh = false;
        this.oamRegInHigh = false;
        this.objPriority = false;
        this.oamSecond = false;
        this.oamBuffer = false;

        this.sprAdr1 = 0;
        this.sprAdr2 = 0;
        this.objSize = 0;

        this.rangeOver = false;
        this.timeOver = false;

        this.mode7ExBg = false;
        this.pseudoHires = false;
        this.overscan = false;
        this.objInterlace = false;
        this.interlace = false;

        this.frameOverscan = false;
        this.frameInterlace = false;
        this.evenFrame = false;

        this.latchedHpos = 0;
        this.latchedVpos = 0;
        this.latchHsecond = false;
        this.latchVsecond = false;
        this.countersLatched = false;

        this.mode7Hoff = 0;
        this.mode7Voff = 0;
        this.mode7A = 0;
        this.mode7B = 0;
        this.mode7C = 0;
        this.mode7D = 0;
        this.mode7X = 0;
        this.mode7Y = 0;
        this.mode7Prev = 0;
        this.multResult = 0;

        this.mode7LargeField = false;
        this.mode7Char0fill = false;
        this.mode7FlipX = false;
        this.mode7FlipY = false;

        this.window1Inversed = [false, false, false, false, false, false];
        this.window1Enabled = [false, false, false, false, false, false];
        this.window2Inversed = [false, false, false, false, false, false];
        this.window2Enabled = [false, false, false, false, false, false];
        this.windowMaskLogic = [0, 0, 0, 0, 0, 0];
        this.window1Left = 0;
        this.window1Right = 0;
        this.window2Left = 0;
        this.window2Right = 0;
        this.mainScreenWindow = [false, false, false, false, false];
        this.subScreenWindow = [false, false, false, false, false];

        this.colorClip = 0;
        this.preventMath = 0;
        this.addSub = false;
        this.directColor = false;

        this.subtractColors = false;
        this.halfColors = false;
        this.mathEnabled = [false, false, false, false, false, false];
        this.fixedColorB = 0;
        this.fixedColorG = 0;
        this.fixedColorR = 0;

        this.tilemapBuffer = [0, 0, 0, 0];
        this.tileBufferP1 = [0, 0, 0, 0];
        this.tileBufferP2 = [0, 0, 0, 0];
        this.tileBufferP3 = [0, 0, 0, 0];
        this.tileBufferP4 = [0, 0, 0, 0];
        this.lastTileFetchedX = [-1, -1, -1, -1];
        this.lastTileFetchedY = [-1, -1, -1, -1];
        this.optHorBuffer = [0, 0];
        this.optVerBuffer = [0, 0];
        this.lastOrigTileX = [-1, -1];
    }

    checkOverscan(line) {
        if (line === 225 && this.overscan) {
            this.frameOverscan = true;
        }
    }

    /**
     * Generates all pixels for the requested active scanline.
     * GC-FREE: Reads pixel colors directly from properties to prevent thrashing.
     */
    renderLine(line) {
        const heightLimit = this.frameOverscan ? 240 : 225;

        if (line === 0) {
            this.rangeOver = false;
            this.timeOver = false;
            this.frameOverscan = false;
            this.frameInterlace = false;
            this.spriteLineBuffer.fill(0);
            if (!this.forcedBlank) {
                this.evaluateSprites(0);
            }
        } else if (line === heightLimit) {
            if (!this.forcedBlank) {
                this.oamAdr = this.oamRegAdr;
                this.oamInHigh = this.oamRegInHigh;
                this.oamSecond = false;
            }
            this.frameInterlace = this.interlace;
            this.evenFrame = !this.evenFrame;
        } else if (line > 0 && line < heightLimit) {
            if (line === 1) {
                this.mosaicStartLine = 1;
            }
            if (this.mode === 7) {
                this.generateMode7Coords(line);
            }

            this.lastTileFetchedX.fill(-1);
            this.lastTileFetchedY.fill(-1);
            this.optHorBuffer.fill(0);
            this.optVerBuffer.fill(0);
            this.lastOrigTileX.fill(-1);

            const bMult = BRIGHTNESS_MULTS[this.brightness];
            let i = 0;

            while (i < 256) {
                let r1 = 0, g1 = 0, b1 = 0;
                let r2 = 0, g2 = 0, b2 = 0;

                if (!this.forcedBlank) {
                    // GC-FREE: Write result directly on class fields
                    this.resolveColor(false, i, line);
                    const color = this.resolvedColor;
                    const layer1 = this.resolvedLayer;
                    const pixel1 = this.resolvedPixel;

                    r2 = color & 0x1f;
                    g2 = (color & 0x3e0) >> 5;
                    b2 = (color & 0x7c00) >> 10;

                    if (this.colorClip === 3 ||
                        (this.colorClip === 2 && this.getWindowState(i, 5)) ||
                        (this.colorClip === 1 && !this.getWindowState(i, 5))) {
                        r2 = 0; g2 = 0; b2 = 0;
                    }

                    let secColor = 0;
                    let secLayer = 5;

                    if (this.mode === 5 || this.mode === 6 || this.pseudoHires ||
                        (this.getMathEnabled(i, layer1, pixel1) && this.addSub)) {
                        
                        this.resolveColor(true, i, line);
                        secColor = this.resolvedColor;
                        secLayer = this.resolvedLayer;

                        r1 = secColor & 0x1f;
                        g1 = (secColor & 0x3e0) >> 5;
                        b1 = (secColor & 0x7c00) >> 10;
                    }

                    if (this.getMathEnabled(i, layer1, pixel1)) {
                        if (this.subtractColors) {
                            r2 -= (this.addSub && secLayer < 5) ? r1 : this.fixedColorR;
                            g2 -= (this.addSub && secLayer < 5) ? g1 : this.fixedColorG;
                            b2 -= (this.addSub && secLayer < 5) ? b1 : this.fixedColorB;
                        } else {
                            r2 += (this.addSub && secLayer < 5) ? r1 : this.fixedColorR;
                            g2 += (this.addSub && secLayer < 5) ? g1 : this.fixedColorG;
                            b2 += (this.addSub && secLayer < 5) ? b1 : this.fixedColorB;
                        }

                        if (this.halfColors && (secLayer < 5 || !this.addSub)) {
                            r2 >>= 1; g2 >>= 1; b2 >>= 1;
                        }

                        r2 = Math.max(0, Math.min(31, r2));
                        g2 = Math.max(0, Math.min(31, g2));
                        b2 = Math.max(0, Math.min(31, b2));
                    }

                    if (!(this.mode === 5 || this.mode === 6 || this.pseudoHires)) {
                        r1 = r2; g1 = g2; b1 = b2;
                    }
                }

                const outIdx = line * 1536 + 6 * i;
                this.pixelOutput[outIdx]     = (r1 * bMult) & 0xff;
                this.pixelOutput[outIdx + 1] = (g1 * bMult) & 0xff;
                this.pixelOutput[outIdx + 2] = (b1 * bMult) & 0xff;
                this.pixelOutput[outIdx + 3] = (r2 * bMult) & 0xff;
                this.pixelOutput[outIdx + 4] = (g2 * bMult) & 0xff;
                this.pixelOutput[outIdx + 5] = (b2 * bMult) & 0xff;

                i++;
            }

            this.spriteLineBuffer.fill(0);
            if (!this.forcedBlank) {
                this.evaluateSprites(line);
            }
        }
    }

    /**
     * Resolves background pixel layers priorities.
     * GC-FREE: Writes results directly on class fields (resolvedColor, resolvedLayer, resolvedPixel)
     */
    resolveColor(sub, x, y) {
        let modeIndex = this.layer3Prio && this.mode === 1 ? 96 : 12 * this.mode;
        modeIndex = this.mode7ExBg && this.mode === 7 ? 108 : modeIndex;
        const count = LAYER_COUNT_PER_MODE[this.mode];

        let j;
        let pixel = 0;
        let layer = 5;

        if (this.interlace && (this.mode === 5 || this.mode === 6)) {
            y = y * 2 + (this.evenFrame ? 1 : 0);
        }

        for (j = 0; j < count; j++) {
            let lx = x;
            let ly = y;
            layer = LAYERS_PER_MODE[modeIndex + j];

            if ((!sub && this.mainScreenEnabled[layer] && (!this.mainScreenWindow[layer] || !this.getWindowState(lx, layer))) ||
                (sub && this.subScreenEnabled[layer] && (!this.subScreenWindow[layer] || !this.getWindowState(lx, layer)))) {
                
                if (this.mosaicEnabled[layer]) {
                    lx -= lx % this.mosaicSize;
                    ly -= (ly - this.mosaicStartLine) % this.mosaicSize;
                }

                lx += this.mode === 7 ? 0 : this.bgHoff[layer];
                ly += this.mode === 7 ? 0 : this.bgVoff[layer];
                const optX = lx - this.bgHoff[layer];

                if ((this.mode === 5 || this.mode === 6) && layer < 4) {
                    lx = lx * 2 + (sub ? 0 : 1);
                }

                // Handle Offset-Per-Tile calculations (Modes 2, 4, 6)
                if ((this.mode === 2 || this.mode === 4 || this.mode === 6) && layer < 2) {
                    const andVal = layer === 0 ? 0x2000 : 0x4000;
                    if (x === 0) {
                        this.lastOrigTileX[layer] = lx >> 3;
                    }
                    const tileStartX = optX - (lx - (lx & 0xfff8));
                    if ((lx >> 3) !== this.lastOrigTileX[layer] && x > 0) {
                        this.fetchTileInBuffer(this.bgHoff[2] + ((tileStartX - 1) & 0x1f8), this.bgVoff[2], 2, true);
                        this.optHorBuffer[layer] = this.tilemapBuffer[2];
                        
                        if (this.mode === 4) {
                            if ((this.optHorBuffer[layer] & 0x8000) > 0) {
                                this.optVerBuffer[layer] = this.optHorBuffer[layer];
                                this.optHorBuffer[layer] = 0;
                            } else {
                                this.optVerBuffer[layer] = 0;
                            }
                        } else {
                            this.fetchTileInBuffer(this.bgHoff[2] + ((tileStartX - 1) & 0x1f8), this.bgVoff[2] + 8, 2, true);
                            this.optVerBuffer[layer] = this.tilemapBuffer[2];
                        }
                        this.lastOrigTileX[layer] = lx >> 3;
                    }

                    if ((this.optHorBuffer[layer] & andVal) > 0) {
                        const add = ((tileStartX + 7) & 0x1f8);
                        lx = (lx & 0x7) + ((this.optHorBuffer[layer] + add) & 0x1ff8);
                    }
                    if ((this.optVerBuffer[layer] & andVal) > 0) {
                        ly = (this.optVerBuffer[layer] & 0x1fff) + (ly - this.bgVoff[layer]);
                    }
                }

                pixel = this.getPixelForLayer(lx, ly, layer, PRIO_PER_MODE[modeIndex + j]);
            }

            if ((pixel & 0xff) > 0) {
                break;
            }
        }

        layer = j === count ? 5 : layer;
        let color = this.cgram[pixel & 0xff];

        if (this.directColor && layer < 4 && BIT_PER_MODE[this.mode * 4 + layer] === 8) {
            const r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
            const g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
            const b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
            color = (b << 10) | (g << 5) | r;
        }

        // Writes result directly on instance fields to secure 0 alocations
        this.resolvedColor = color;
        this.resolvedLayer = layer;
        this.resolvedPixel = pixel;
    }

    getMathEnabled(x, l, pal) {
        if (this.preventMath === 3 ||
            (this.preventMath === 2 && this.getWindowState(x, 5)) ||
            (this.preventMath === 1 && !this.getWindowState(x, 5))) {
            return false;
        }
        return this.mathEnabled[l] && (l !== 4 || pal >= 0xc0);
    }

    getWindowState(x, l) {
        if (!this.window1Enabled[l] && !this.window2Enabled[l]) {
            return false;
        }
        if (this.window1Enabled[l] && !this.window2Enabled[l]) {
            const test = x >= this.window1Left && x <= this.window1Right;
            return this.window1Inversed[l] ? !test : test;
        }
        if (!this.window1Enabled[l] && this.window2Enabled[l]) {
            const test = x >= this.window2Left && x <= this.window2Right;
            return this.window2Inversed[l] ? !test : test;
        }

        let w1test = x >= this.window1Left && x <= this.window1Right;
        w1test = this.window1Inversed[l] ? !w1test : w1test;
        let w2test = x >= this.window2Left && x <= this.window2Right;
        w2test = this.window2Inversed[l] ? !w2test : w2test;

        switch (this.windowMaskLogic[l]) {
            case 0: return w1test || w2test;
            case 1: return w1test && w2test;
            case 2: return w1test !== w2test;
            case 3: return w1test === w2test;
            default: return false;
        }
    }

    getPixelForLayer(x, y, l, p) {
        if (l > 3) {
            if (this.spritePrioBuffer[x] !== p) return 0;
            return this.spriteLineBuffer[x];
        }

        if (this.mode === 7) {
            return this.getMode7Pixel(x, y, l, p);
        }

        if ((x >> 3) !== this.lastTileFetchedX[l] || y !== this.lastTileFetchedY[l]) {
            this.fetchTileInBuffer(x, y, l, false);
            this.lastTileFetchedX[l] = (x >> 3);
            this.lastTileFetchedY[l] = y;
        }

        const mapWord = this.tilemapBuffer[l];
        if (((mapWord & 0x2000) >> 13) !== p) return 0;

        let paletteNum = (mapWord & 0x1c00) >> 10;
        const xShift = (mapWord & 0x4000) > 0 ? (x & 0x7) : 7 - (x & 0x7);

        paletteNum += this.mode === 0 ? l * 8 : 0;

        const bits = BIT_PER_MODE[this.mode * 4 + l];
        let mul = 4;
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

    fetchTileInBuffer(x, y, l, offset) {
        const rx = x;
        const ry = y;
        const useXbig = this.bigTiles[l] | this.mode === 5 | this.mode === 6;
        x >>= useXbig ? 1 : 0;
        y >>= this.bigTiles[l] ? 1 : 0;

        let adr = this.tilemapAdr[l] + (((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3));
        adr += ((x & 0x100) > 0 && this.tilemapWider[l]) ? 1024 : 0;
        adr += ((y & 0x100) > 0 && this.tilemapHigher[l]) ? (this.tilemapWider[l] ? 2048 : 1024) : 0;
        
        this.tilemapBuffer[l] = this.vram[adr & 0x7fff];
        if (offset) return;

        const yFlip = (this.tilemapBuffer[l] & 0x8000) > 0;
        const xFlip = (this.tilemapBuffer[l] & 0x4000) > 0;
        const yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
        let tileNum = this.tilemapBuffer[l] & 0x3ff;

        tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
        tileNum += this.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

        const bits = BIT_PER_MODE[this.mode * 4 + l];

        this.tileBufferP1[l] = this.vram[(this.tileAdr[l] + tileNum * 4 * bits + yRow) & 0x7fff];
        if (bits > 2) {
            this.tileBufferP2[l] = this.vram[(this.tileAdr[l] + tileNum * 4 * bits + yRow + 8) & 0x7fff];
        }
        if (bits > 4) {
            this.tileBufferP3[l] = this.vram[(this.tileAdr[l] + tileNum * 4 * bits + yRow + 16) & 0x7fff];
            this.tileBufferP4[l] = this.vram[(this.tileAdr[l] + tileNum * 4 * bits + yRow + 24) & 0x7fff];
        }
    }

    evaluateSprites(line) {
        let spriteCount = 0;
        let sliverCount = 0;
        let index = this.objPriority ? ((this.oamAdr & 0xfe) - 2) & 0xff : 254;

        for (let i = 0; i < 128; i++) {
            let x = this.oam[index] & 0xff;
            const y = (this.oam[index] & 0xff00) >> 8;
            const tile = this.oam[index + 1] & 0xff;
            const ex = (this.oam[index + 1] & 0xff00) >> 8;
            
            x |= (this.highOam[index >> 4] >> (index & 0xf) & 0x1) << 8;
            const big = (this.highOam[index >> 4] >> (index & 0xf) & 0x2) > 0;
            x = x > 255 ? -(512 - x) : x;

            const size = SPRITE_SIZES[this.objSize + (big ? 8 : 0)];
            let sprRow = line - y;
            if (sprRow < 0 || sprRow >= size * (this.objInterlace ? 4 : 8)) {
                sprRow = line + (256 - y);
            }

            if (sprRow >= 0 && sprRow < size * (this.objInterlace ? 4 : 8) && x > -(size * 8)) {
                if (spriteCount === 32) {
                    this.rangeOver = true;
                    break;
                }
                sprRow = this.objInterlace ? sprRow * 2 + (this.evenFrame ? 1 : 0) : sprRow;
                const adr = this.sprAdr1 + ((ex & 0x1) > 0 ? this.sprAdr2 : 0);
                sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
                
                const tileRow = sprRow >> 3;
                sprRow &= 0x7;

                for (let k = 0; k < size; k++) {
                    if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                        if (sliverCount === 34) {
                            sliverCount = 35;
                            break;
                        }
                        const tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                        const tileNum = (tile + SPRITE_TILE_OFFSETS[tileRow * 8 + tileColumn]) & 0xff;

                        const tileP1 = this.vram[(adr + tileNum * 16 + sprRow) & 0x7fff];
                        const tileP2 = this.vram[(adr + tileNum * 16 + sprRow + 8) & 0x7fff];

                        for (let j = 0; j < 8; j++) {
                            const shift = ((ex & 0x40) > 0) ? j : 7 - j;
                            let tileData = (tileP1 >> shift) & 0x1;
                            tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
                            tileData |= ((tileP2 >> shift) & 0x1) << 2;
                            tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;

                            const color = tileData + 16 * ((ex & 0xe) >> 1);
                            const xInd = x + k * 8 + j;
                            if (tileData > 0 && xInd < 256 && xInd >= 0) {
                                this.spriteLineBuffer[xInd] = 0x80 + color;
                                this.spritePrioBuffer[xInd] = (ex & 0x30) >> 4;
                            }
                        }
                        sliverCount++;
                    }
                }

                if (sliverCount === 35) {
                    this.timeOver = true;
                    break;
                }
                spriteCount++;
            }
            index = (index - 2) & 0xff;
        }
    }

    generateMode7Coords(y) {
        const rY = this.mode7FlipY ? 255 - y : y;

        let clippedH = this.mode7Hoff - this.mode7X;
        clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3ff) : (clippedH & 0x3ff);
        let clippedV = this.mode7Voff - this.mode7Y;
        clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3ff) : (clippedV & 0x3ff);

        const lineStartX = (((this.mode7A * clippedH) & ~63) + ((this.mode7B * rY) & ~63) + ((this.mode7B * clippedV) & ~63) + (this.mode7X << 8));
        const lineStartY = (((this.mode7C * clippedH) & ~63) + ((this.mode7D * rY) & ~63) + ((this.mode7D * clippedV) & ~63) + (this.mode7Y << 8));

        this.mode7Xcoords[0] = lineStartX;
        this.mode7Ycoords[0] = lineStartY;

        for (let i = 1; i < 256; i++) {
            this.mode7Xcoords[i] = this.mode7Xcoords[i - 1] + this.mode7A;
            this.mode7Ycoords[i] = this.mode7Ycoords[i - 1] + this.mode7C;
        }
    }

    getMode7Pixel(x, y, l, p) {
        let pixelData = this.tilemapBuffer[0];
        if (x !== this.lastTileFetchedX[0] || y !== this.lastTileFetchedY[0]) {
            const rX = this.mode7FlipX ? 255 - x : x;
            const px = this.mode7Xcoords[rX] >> 8;
            const py = this.mode7Ycoords[rX] >> 8;
            let pixelIsTransparent = false;

            if (this.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
                if (this.mode7Char0fill) {
                    px &= 0x7; py &= 0x7;
                } else {
                    pixelIsTransparent = true;
                }
            }

            const tileX = (px & 0x3f8) >> 3;
            const tileY = (py & 0x3f8) >> 3;

            const tileByte = this.vram[(tileY * 128 + tileX)] & 0xff;
            pixelData = this.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)] >> 8;
            pixelData = pixelIsTransparent ? 0 : pixelData;

            this.tilemapBuffer[0] = pixelData;
            this.lastTileFetchedX[0] = x;
            this.lastTileFetchedY[0] = y;
        }

        if (l === 1 && (pixelData >> 7) !== p) return 0;
        if (l === 1) return pixelData & 0x7f;

        return pixelData;
    }

    getVramRemap() {
        let adr = this.vramAdr & 0x7fff;
        if (this.vramRemap === 1) {
            adr = (adr & 0xff00) | ((adr & 0xe0) >> 5) | ((adr & 0x1f) << 3);
        } else if (this.vramRemap === 2) {
            adr = (adr & 0xfe00) | ((adr & 0x1c0) >> 6) | ((adr & 0x3f) << 3);
        } else if (this.vramRemap === 3) {
            adr = (adr & 0xfc00) | ((adr & 0x380) >> 7) | ((adr & 0x7f) << 3);
        }
        return adr;
    }

    get13Signed(val) {
        return (val & 0x1000) > 0 ? -(8192 - (val & 0xfff)) : (val & 0xfff);
    }

    get16Signed(val) {
        return (val & 0x8000) > 0 ? -(65536 - val) : val;
    }

    getMultResult(a, b) {
        b = b < 0 ? 65536 + b : b;
        b >>= 8;
        b = ((b & 0x80) > 0) ? -(256 - b) : b;
        const ans = a * b;
        return ans < 0 ? 16777216 + ans : ans;
    }

    read(adr) {
        switch (adr) {
            case 0x34: return this.multResult & 0xff;
            case 0x35: return (this.multResult & 0xff00) >> 8;
            case 0x36: return (this.multResult & 0xff0000) >> 16;
            case 0x37:
                if (this.snes.ppuLatch) {
                    this.latchedHpos = this.snes.xPos >> 2;
                    this.latchedVpos = this.snes.yPos;
                    this.countersLatched = true;
                }
                return this.snes.openBus;
            case 0x38: {
                let val;
                if (!this.oamSecond) {
                    val = this.oamInHigh ? (this.highOam[this.oamAdr & 0xf] & 0xff) : (this.oam[this.oamAdr] & 0xff);
                    this.oamSecond = true;
                } else {
                    val = this.oamInHigh ? (this.highOam[this.oamAdr & 0xf] >> 8) : (this.oam[this.oamAdr] >> 8);
                    this.oamAdr = (this.oamAdr + 1) & 0xff;
                    this.oamInHigh = (this.oamAdr === 0) ? !this.oamInHigh : this.oamInHigh;
                    this.oamSecond = false;
                }
                return val;
            }
            case 0x39: {
                const val = this.vramReadBuffer;
                if (!this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAdr = (this.vramAdr + this.vramInc) & 0xffff;
                }
                return val & 0xff;
            }
            case 0x3a: {
                const val = this.vramReadBuffer;
                if (this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAdr = (this.vramAdr + this.vramInc) & 0xffff;
                }
                return (val & 0xff00) >> 8;
            }
            case 0x3b: {
                let val;
                if (!this.cgramSecond) {
                    val = this.cgram[this.cgramAdr] & 0xff;
                    this.cgramSecond = true;
                } else {
                    val = this.cgram[this.cgramAdr++] >> 8;
                    this.cgramAdr &= 0xff;
                    this.cgramSecond = false;
                }
                return val;
            }
            case 0x3c: {
                const val = !this.latchHsecond ? (this.latchedHpos & 0xff) : ((this.latchedHpos & 0xff00) >> 8);
                this.latchHsecond = !this.latchHsecond;
                return val;
            }
            case 0x3d: {
                const val = !this.latchVsecond ? (this.latchedVpos & 0xff) : ((this.latchedVpos & 0xff00) >> 8);
                this.latchVsecond = !this.latchVsecond;
                return val;
            }
            case 0x3e: {
                let val = this.timeOver ? 0x80 : 0;
                val |= this.rangeOver ? 0x40 : 0;
                return val | 0x1;
            }
            case 0x3f: {
                const val = (this.evenFrame ? 0x80 : 0) | (this.countersLatched ? 0x40 : 0);
                if (this.snes.ppuLatch) {
                    this.countersLatched = false;
                }
                this.latchHsecond = false;
                this.latchVsecond = false;
                return val | 0x3;
            }
            default:
                return this.snes.openBus;
        }
    }

    write(adr, value) {
        switch (adr) {
            case 0x00:
                this.forcedBlank = (value & 0x80) > 0;
                this.brightness = value & 0xf;
                break;
            case 0x01:
                this.sprAdr1 = (value & 0x7) << 13;
                this.sprAdr2 = ((value & 0x18) + 8) << 9;
                this.objSize = (value & 0xe0) >> 5;
                break;
            case 0x02:
                this.oamAdr = value;
                this.oamRegAdr = this.oamAdr;
                this.oamInHigh = this.oamRegInHigh;
                this.oamSecond = false;
                break;
            case 0x03:
                this.oamInHigh = (value & 0x1) > 0;
                this.objPriority = (value & 0x80) > 0;
                this.oamAdr = this.oamRegAdr;
                this.oamRegInHigh = this.oamInHigh;
                this.oamSecond = false;
                break;
            case 0x04:
                if (!this.oamSecond) {
                    if (this.oamInHigh) {
                        this.highOam[this.oamAdr & 0xf] = (this.highOam[this.oamAdr & 0xf] & 0xff00) | value;
                    } else {
                        this.oamBuffer = (this.oamBuffer & 0xff00) | value;
                    }
                    this.oamSecond = true;
                } else {
                    if (this.oamInHigh) {
                        this.highOam[this.oamAdr & 0xf] = (this.highOam[this.oamAdr & 0xf] & 0xff) | (value << 8);
                    } else {
                        this.oamBuffer = (this.oamBuffer & 0xff) | (value << 8);
                        this.oam[this.oamAdr] = this.oamBuffer;
                    }
                    this.oamAdr = (this.oamAdr + 1) & 0xff;
                    this.oamInHigh = (this.oamAdr === 0) ? !this.oamInHigh : this.oamInHigh;
                    this.oamSecond = false;
                }
                break;
            case 0x05:
                this.mode = value & 0x7;
                this.layer3Prio = (value & 0x08) > 0;
                this.bigTiles[0] = (value & 0x10) > 0;
                this.bigTiles[1] = (value & 0x20) > 0;
                this.bigTiles[2] = (value & 0x40) > 0;
                this.bigTiles[3] = (value & 0x80) > 0;
                break;
            case 0x06:
                this.mosaicEnabled[0] = (value & 0x1) > 0;
                this.mosaicEnabled[1] = (value & 0x2) > 0;
                this.mosaicEnabled[2] = (value & 0x4) > 0;
                this.mosaicEnabled[3] = (value & 0x8) > 0;
                this.mosaicSize = ((value & 0xf0) >> 4) + 1;
                this.mosaicStartLine = this.snes.yPos;
                break;
            case 0x07: case 0x08: case 0x09: case 0x0a:
                this.tilemapWider[adr - 7] = (value & 0x1) > 0;
                this.tilemapHigher[adr - 7] = (value & 0x2) > 0;
                this.tilemapAdr[adr - 7] = (value & 0xfc) << 8;
                break;
            case 0x0b:
                this.tileAdr[0] = (value & 0xf) << 12;
                this.tileAdr[1] = (value & 0xf0) << 8;
                break;
            case 0x0c:
                this.tileAdr[2] = (value & 0xf) << 12;
                this.tileAdr[3] = (value & 0xf0) << 8;
                break;
            case 0x0d:
                this.mode7Hoff = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.bgHoff[0] = (value << 8) | (this.offPrev1 & 0xf8) | (this.offPrev2 & 0x7);
                this.offPrev1 = value; this.offPrev2 = value;
                break;
            case 0x0f: case 0x11: case 0x13:
                this.bgHoff[(adr - 0xd) >> 1] = (value << 8) | (this.offPrev1 & 0xf8) | (this.offPrev2 & 0x7);
                this.offPrev1 = value; this.offPrev2 = value;
                break;
            case 0x0e:
                this.mode7Voff = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.bgVoff[0] = (value << 8) | (this.offPrev1 & 0xff);
                this.offPrev1 = value;
                break;
            case 0x10: case 0x12: case 0x14:
                this.bgVoff[(adr - 0xe) >> 1] = (value << 8) | (this.offPrev1 & 0xff);
                this.offPrev1 = value;
                break;
            case 0x15: {
                const incVal = value & 0x3;
                this.vramInc = (incVal === 0) ? 1 : (incVal === 1 ? 32 : 128);
                this.vramRemap = (value & 0x0c) >> 2;
                this.vramIncOnHigh = (value & 0x80) > 0;
                break;
            }
            case 0x16:
                this.vramAdr = (this.vramAdr & 0xff00) | value;
                this.vramReadBuffer = this.vram[this.getVramRemap()];
                break;
            case 0x17:
                this.vramAdr = (this.vramAdr & 0xff) | (value << 8);
                this.vramReadBuffer = this.vram[this.getVramRemap()];
                break;
            case 0x18:
                this.vram[this.getVramRemap()] = (this.vram[this.getVramRemap()] & 0xff00) | value;
                if (!this.vramIncOnHigh) {
                    this.vramAdr = (this.vramAdr + this.vramInc) & 0xffff;
                }
                break;
            case 0x19:
                this.vram[this.getVramRemap()] = (this.vram[this.getVramRemap()] & 0xff) | (value << 8);
                if (this.vramIncOnHigh) {
                    this.vramAdr = (this.vramAdr + this.vramInc) & 0xffff;
                }
                break;
            case 0x1a:
                this.mode7LargeField = (value & 0x80) > 0;
                this.mode7Char0fill = (value & 0x40) > 0;
                this.mode7FlipY = (value & 0x2) > 0;
                this.mode7FlipX = (value & 0x1) > 0;
                break;
            case 0x1b:
                this.mode7A = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.multResult = this.getMultResult(this.mode7A, this.mode7B);
                break;
            case 0x1c:
                this.mode7B = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.multResult = this.getMultResult(this.mode7A, this.mode7B);
                break;
            case 0x1d:
                this.mode7C = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                break;
            case 0x1e:
                this.mode7D = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                break;
            case 0x1f:
                this.mode7X = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                break;
            case 0x20:
                this.mode7Y = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                break;
            case 0x21:
                this.cgramAdr = value;
                this.cgramSecond = false;
                break;
            case 0x22:
                if (!this.cgramSecond) {
                    this.cgramBuffer = (this.cgramBuffer & 0xff00) | value;
                    this.cgramSecond = true;
                } else {
                    this.cgramBuffer = (this.cgramBuffer & 0xff) | (value << 8);
                    this.cgram[this.cgramAdr++] = this.cgramBuffer;
                    this.cgramAdr &= 0xff;
                    this.cgramSecond = false;
                }
                break;
            case 0x23:
                this.window1Inversed[0] = (value & 0x01) > 0;
                this.window1Enabled[0] = (value & 0x02) > 0;
                this.window2Inversed[0] = (value & 0x04) > 0;
                this.window2Enabled[0] = (value & 0x08) > 0;
                this.window1Inversed[1] = (value & 0x10) > 0;
                this.window1Enabled[1] = (value & 0x20) > 0;
                this.window2Inversed[1] = (value & 0x40) > 0;
                this.window2Enabled[1] = (value & 0x80) > 0;
                break;
            case 0x24:
                this.window1Inversed[2] = (value & 0x01) > 0;
                this.window1Enabled[2] = (value & 0x02) > 0;
                this.window2Inversed[2] = (value & 0x04) > 0;
                this.window2Enabled[2] = (value & 0x08) > 0;
                this.window1Inversed[3] = (value & 0x10) > 0;
                this.window1Enabled[3] = (value & 0x20) > 0;
                this.window2Inversed[3] = (value & 0x40) > 0;
                this.window2Enabled[3] = (value & 0x80) > 0;
                break;
            case 0x25:
                this.window1Inversed[4] = (value & 0x01) > 0;
                this.window1Enabled[4] = (value & 0x02) > 0;
                this.window2Inversed[4] = (value & 0x04) > 0;
                this.window2Enabled[4] = (value & 0x08) > 0;
                this.window1Inversed[5] = (value & 0x10) > 0;
                this.window1Enabled[5] = (value & 0x20) > 0;
                this.window2Inversed[5] = (value & 0x40) > 0;
                this.window2Enabled[5] = (value & 0x80) > 0;
                break;
            case 0x26: this.window1Left = value; break;
            case 0x27: this.window1Right = value; break;
            case 0x28: this.window2Left = value; break;
            case 0x29: this.window2Right = value; break;
            case 0x2a:
                this.windowMaskLogic[0] = value & 0x3;
                this.windowMaskLogic[1] = (value & 0xc) >> 2;
                this.windowMaskLogic[2] = (value & 0x30) >> 4;
                this.windowMaskLogic[3] = (value & 0xc0) >> 6;
                break;
            case 0x2b:
                this.windowMaskLogic[4] = value & 0x3;
                this.windowMaskLogic[5] = (value & 0xc) >> 2;
                break;
            case 0x2c:
                this.mainScreenEnabled[0] = (value & 0x1) > 0;
                this.mainScreenEnabled[1] = (value & 0x2) > 0;
                this.mainScreenEnabled[2] = (value & 0x4) > 0;
                this.mainScreenEnabled[3] = (value & 0x8) > 0;
                this.mainScreenEnabled[4] = (value & 0x10) > 0;
                break;
            case 0x2d:
                this.subScreenEnabled[0] = (value & 0x1) > 0;
                this.subScreenEnabled[1] = (value & 0x2) > 0;
                this.subScreenEnabled[2] = (value & 0x4) > 0;
                this.subScreenEnabled[3] = (value & 0x8) > 0;
                this.subScreenEnabled[4] = (value & 0x10) > 0;
                break;
            case 0x2e:
                this.mainScreenWindow[0] = (value & 0x1) > 0;
                this.mainScreenWindow[1] = (value & 0x2) > 0;
                this.mainScreenWindow[2] = (value & 0x4) > 0;
                this.mainScreenWindow[3] = (value & 0x8) > 0;
                this.mainScreenWindow[4] = (value & 0x10) > 0;
                break;
            case 0x2f:
                this.subScreenWindow[0] = (value & 0x1) > 0;
                this.subScreenWindow[1] = (value & 0x2) > 0;
                this.subScreenWindow[2] = (value & 0x4) > 0;
                this.subScreenWindow[3] = (value & 0x8) > 0;
                this.subScreenWindow[4] = (value & 0x10) > 0;
                break;
            case 0x30:
                this.colorClip = (value & 0xc0) >> 6;
                this.preventMath = (value & 0x30) >> 4;
                this.addSub = (value & 0x2) > 0;
                this.directColor = (value & 0x1) > 0;
                break;
            case 0x31:
                this.subtractColors = (value & 0x80) > 0;
                this.halfColors = (value & 0x40) > 0;
                this.mathEnabled[0] = (value & 0x1) > 0;
                this.mathEnabled[1] = (value & 0x2) > 0;
                this.mathEnabled[2] = (value & 0x4) > 0;
                this.mathEnabled[3] = (value & 0x8) > 0;
                this.mathEnabled[4] = (value & 0x10) > 0;
                this.mathEnabled[5] = (value & 0x20) > 0;
                break;
            case 0x32:
                if ((value & 0x80) > 0) this.fixedColorB = value & 0x1f;
                if ((value & 0x40) > 0) this.fixedColorG = value & 0x1f;
                if ((value & 0x20) > 0) this.fixedColorR = value & 0x1f;
                break;
            case 0x33:
                this.mode7ExBg = (value & 0x40) > 0;
                this.pseudoHires = (value & 0x08) > 0;
                this.overscan = (value & 0x04) > 0;
                this.objInterlace = (value & 0x02) > 0;
                this.interlace = (value & 0x01) > 0;
                break;
            default:
                break;
        }
    }

    /**
     * Legacy frame rendering. Keeped for total backward compatibility 
     * but bypassed by our modern SnesPostProcessor blitting.
     */
    setPixels(arr) {
        if (!this.frameOverscan) {
            for (let i = 0; i < 512 * 16; i++) {
                arr[(i >> 9) * 2048 + (i % 512) * 4 + 3] = 0;
                arr[((i >> 9) + 464) * 2048 + (i % 512) * 4 + 3] = 0;
            }
        }

        const addY = this.frameOverscan ? 0 : 14;
        const lineLimit = this.frameOverscan ? 240 : 225;

        for (let i = 512; i < 512 * lineLimit; i++) {
            const x = i % 512;
            const y = (i >> 9) * 2;
            const ind = ((y + addY) * 512 + x) * 4;
            const r = this.pixelOutput[i * 3];
            const g = this.pixelOutput[i * 3 + 1];
            const b = this.pixelOutput[i * 3 + 2];

            if (!this.frameInterlace || this.evenFrame) {
                arr[ind] = r; arr[ind + 1] = g; arr[ind + 2] = b; arr[ind + 3] = 255;
            }
            if (!this.frameInterlace || !this.evenFrame) {
                const nextRowIdx = ind + 2048;
                arr[nextRowIdx] = r; arr[nextRowIdx + 1] = g; arr[nextRowIdx + 2] = b; arr[nextRowIdx + 3] = 255;
            }
        }
    }
}

// Backward Compatibility Alias
window.Ppu = SnesPpu;