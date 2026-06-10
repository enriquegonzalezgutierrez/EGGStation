/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/ppu/SnesPpu.js
 * 
 * Domain Layer: Super Nintendo (SNES) Picture Processing Unit (PPU)
 * 
 * Role:
 * Emulates the physical registers, memories (VRAM, CGRAM, OAM), and I/O registers 
 * mapping ($2100-$213F) of the custom SNES PPU.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for memory state 
 *   preservation, VRAM address remapping, write ports register decoding, and caching. 
 *   Delegates rendering to SnesPpuBackground, SnesPpuSprite, SnesPpuMode7, and SnesPpuCompositor.
 */

class SnesPpu {
    /**
     * @param {SnesSystem} snes - Unified system main controller context (DIP).
     */
    constructor(snes) {
        this.snes = snes;

        // Video Memory Buffers (GC Free)
        this.vram = new Uint16Array(0x8000);
        this.cgram = new Uint16Array(0x100); // FIXED: Named cgram to match original hardware and compositor references

        // High-Speed VRAM Cache (32768 words * 8 pixels * 2 states = 524,288 bytes)
        this.vramCache = new Uint8Array(524288);

        // Object Attribute Memory (Sprites)
        this.oam = new Uint16Array(0x100);
        this.highOam = new Uint16Array(0x10);

        this.spriteLineBuffer = new Uint8Array(256);
        this.spritePrioBuffer = new Uint8Array(256);

        this.mode7Xcoords = new Int32Array(256);
        this.mode7Ycoords = new Int32Array(256);

        // Double height resolution layout buffer
        this.pixelOutput = new Uint16Array(512 * 3 * 240);

        // Pre-allocated high speed planar row cache
        this.decodedRow = [
            new Uint8Array(8), new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)
        ];

        // Window clipping lookup masks
        this.windowMasks = Array.from({ length: 6 }, () => new Uint8Array(256));

        // High speed flat scanline background cache buffers
        this.bgBuffers = Array.from({ length: 4 }, () => new Uint16Array(256));
        this.bgPriorityBuffers = Array.from({ length: 4 }, () => new Uint8Array(256));

        // GC-free pixel cache
        this.pixelOutputCache = new Int32Array(3);

        this.reset();
    }

    /**
     * Resets PPU registers and caches to power-on defaults.
     */
    reset() {
        this.isPal = false;
        this.vram.fill(0);
        this.cgram.fill(0); // FIXED: Clears CGRAM correctly
        this.oam.fill(0);
        this.highOam.fill(0);
        this.vramCache.fill(0); 

        this.spriteLineBuffer.fill(0);
        this.spritePrioBuffer.fill(0);
        this.pixelOutput.fill(0);
        this.pixelOutputCache.fill(0);

        this.mode7Xcoords.fill(0);
        this.mode7Ycoords.fill(0);

        for (let i = 0; i < 4; i++) {
            this.decodedRow[i].fill(0);
            this.bgBuffers[i].fill(0);
            this.bgPriorityBuffers[i].fill(0);
        }
        for (let i = 0; i < 6; i++) {
            this.windowMasks[i].fill(0);
        }

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
        if ((val & 0x1000) > 0) {
            return -(8192 - (val & 0xfff));
        }
        return (val & 0xfff);
    }

    get16Signed(val) {
        if ((val & 0x8000) > 0) {
            return -(65536 - val);
        }
        return val;
    }

    /**
     * Parses a written 16-bit word and extracts the 8 planar pixels immediately.
     */
    updateVramCache(address, word) {
        const baseIdx = address << 3; 
        const bp0 = word & 0xff;
        const bp1 = word >> 8;
        
        const c0 = ((bp0 >> 7) & 1) | (((bp1 >> 7) & 1) << 1);
        const c1 = ((bp0 >> 6) & 1) | (((bp1 >> 6) & 1) << 1);
        const c2 = ((bp0 >> 5) & 1) | (((bp1 >> 5) & 1) << 1);
        const c3 = ((bp0 >> 4) & 1) | (((bp1 >> 4) & 1) << 1);
        const c4 = ((bp0 >> 3) & 1) | (((bp1 >> 3) & 1) << 1);
        const c5 = ((bp0 >> 2) & 1) | (((bp1 >> 2) & 1) << 1);
        const c6 = ((bp0 >> 1) & 1) | (((bp1 >> 1) & 1) << 1);
        const c7 = (bp0 & 1) | ((bp1 & 1) << 1);
        
        this.vramCache[baseIdx]     = c0;
        this.vramCache[baseIdx + 1] = c1;
        this.vramCache[baseIdx + 2] = c2;
        this.vramCache[baseIdx + 3] = c3;
        this.vramCache[baseIdx + 4] = c4;
        this.vramCache[baseIdx + 5] = c5;
        this.vramCache[baseIdx + 6] = c6;
        this.vramCache[baseIdx + 7] = c7;
        
        // Generate X-Flipped version mapped at memory offset + 256KB
        const flipBaseIdx = 262144 + baseIdx;
        this.vramCache[flipBaseIdx]     = c7;
        this.vramCache[flipBaseIdx + 1] = c6;
        this.vramCache[flipBaseIdx + 2] = c5;
        this.vramCache[flipBaseIdx + 3] = c4;
        this.vramCache[flipBaseIdx + 4] = c3;
        this.vramCache[flipBaseIdx + 5] = c2;
        this.vramCache[flipBaseIdx + 6] = c1;
        this.vramCache[flipBaseIdx + 7] = c0;
    }

    /**
     * Rebuilds the entire VRAM cache. Used when restoring Savestates.
     */
    rebuildVramCache() {
        for(let i = 0; i < 32768; i++) {
            this.updateVramCache(i, this.vram[i]);
        }
    }

    // ========================================================================
    // CORES DELEGATES WRAPPERS (SOLID SRP/DIP Compliance)
    // ========================================================================

    renderLine(line) {
        // Delegates rasterization and blending to the specialized compositor class
        SnesPpuCompositor.renderLine(this, line);
    }

    setPixels(arr) {
        // Delegates canvas array blitting to the specialized compositor class
        SnesPpuCompositor.setPixels(this, arr);
    }

    evaluateSprites(line) {
        // Delegates sprites evaluations to the specialized OAM class
        SnesPpuSprite.evaluateSprites(this, line);
    }

    renderBgScanline(l, line) {
        // Delegates background plane rendering to the specialized Bg class
        SnesPpuBackground.renderBgScanline(this, l, line);
    }

    // ========================================================================
    // HARDWARE REGISTER PORTS READS & WRITES
    // ========================================================================

    read(adr) {
        switch (adr) {
            case 0x34: {
                return this.multResult & 0xff;
            }
            case 0x35: {
                return (this.multResult & 0xff00) >> 8;
            }
            case 0x36: {
                return (this.multResult & 0xff0000) >> 16;
            }
            case 0x37: {
                if (this.snes.ppuLatch) {
                    this.latchedHpos = this.snes.xPos >> 2;
                    this.latchedVpos = this.snes.yPos;
                    this.countersLatched = true;
                }
                return this.snes.openBus;
            }
            case 0x38: {
                let val;
                if (!this.oamSecond) {
                    if (this.oamInHigh) {
                        val = this.highOam[this.oamAdr & 0xf] & 0xff;
                    } else {
                        val = this.oam[this.oamAdr] & 0xff;
                    }
                    this.oamSecond = true;
                } else {
                    if (this.oamInHigh) {
                        val = this.highOam[this.oamAdr & 0xf] >> 8;
                    } else {
                        val = this.oam[this.oamAdr] >> 8;
                    }
                    this.oamAdr++;
                    this.oamAdr &= 0xff;
                    this.oamInHigh = (
                        this.oamAdr === 0
                    ) ? !this.oamInHigh : this.oamInHigh;
                    this.oamSecond = false;
                }
                return val;
            }
            case 0x39: {
                let val = this.vramReadBuffer;
                if (!this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAdr += this.vramInc;
                    this.vramAdr &= 0xffff;
                }
                return val & 0xff;
            }
            case 0x3a: {
                let val = this.vramReadBuffer;
                if (this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAdr += this.vramInc;
                    this.vramAdr &= 0xffff;
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
                let val;
                if (!this.latchHsecond) {
                    val = this.latchedHpos & 0xff;
                    this.latchHsecond = true;
                } else {
                    val = (this.latchedHpos & 0xff00) >> 8;
                    this.latchHsecond = false;
                }
                return val;
            }
            case 0x3d: {
                let val;
                if (!this.latchVsecond) {
                    val = this.latchedVpos & 0xff;
                    this.latchVsecond = true;
                } else {
                    val = (this.latchedVpos & 0xff00) >> 8;
                    this.latchVsecond = false;
                }
                return val;
            }
            case 0x3e: {
                let val = this.timeOver ? 0x80 : 0;
                val |= this.rangeOver ? 0x40 : 0;
                val |= this.isPal ? 0x10 : 0;
                return val | 0x1;
            }
            case 0x3f: {
                let val = this.evenFrame ? 0x80 : 0;
                val |= this.countersLatched ? 0x40 : 0;
                val |= this.isPal ? 0x10 : 0;
                if (this.snes.ppuLatch) {
                    this.countersLatched = false;
                }
                this.latchHsecond = false;
                this.latchVsecond = false;
                return val | 0x3;
            }
        }
        return this.snes.openBus;
    }

    write(adr, value) {
        switch (adr) {
            case 0x00: {
                this.forcedBlank = (value & 0x80) > 0;
                this.brightness = value & 0xf;
                return;
            }
            case 0x01: {
                this.sprAdr1 = (value & 0x7) << 13;
                this.sprAdr2 = ((value & 0x18) + 8) << 9;
                this.objSize = (value & 0xe0) >> 5;
                return;
            }
            case 0x02: {
                this.oamAdr = value;
                this.oamRegAdr = this.oamAdr;
                this.oamInHigh = this.oamRegInHigh;
                this.oamSecond = false;
                return;
            }
            case 0x03: {
                this.oamInHigh = (value & 0x1) > 0;
                this.objPriority = (value & 0x80) > 0;
                this.oamAdr = this.oamRegAdr;
                this.oamInHigh = this.oamInHigh;
                this.oamSecond = false;
                return;
            }
            case 0x04: {
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
                    this.oamAdr++;
                    this.oamAdr &= 0xff;
                    this.oamInHigh = (this.oamAdr === 0) ? !this.oamInHigh : this.oamInHigh;
                    this.oamSecond = false;
                }
                return;
            }
            case 0x05: {
                this.mode = value & 0x7;
                this.layer3Prio = (value & 0x08) > 0;
                this.bigTiles[0] = (value & 0x10) > 0;
                this.bigTiles[1] = (value & 0x20) > 0;
                this.bigTiles[2] = (value & 0x40) > 0;
                this.bigTiles[3] = (value & 0x80) > 0;
                return;
            }
            case 0x06: {
                this.mosaicEnabled[0] = (value & 0x1) > 0;
                this.mosaicEnabled[1] = (value & 0x2) > 0;
                this.mosaicEnabled[2] = (value & 0x4) > 0;
                this.mosaicEnabled[3] = (value & 0x8) > 0;
                this.mosaicSize = ((value & 0xf0) >> 4) + 1;
                this.mosaicStartLine = this.snes.yPos;
                return;
            }
            case 0x07:
            case 0x08:
            case 0x09:
            case 0x0a: {
                this.tilemapWider[adr - 7] = (value & 0x1) > 0;
                this.tilemapHigher[adr - 7] = (value & 0x2) > 0;
                this.tilemapAdr[adr - 7] = (value & 0xfc) << 8;
                return;
            }
            case 0x0b: {
                this.tileAdr[0] = (value & 0xf) << 12;
                this.tileAdr[1] = (value & 0xf0) << 8;
                return;
            }
            case 0x0c: {
                this.tileAdr[2] = (value & 0xf) << 12;
                this.tileAdr[3] = (value & 0xf0) << 8;
                return;
            }
            case 0x0d: {
                this.mode7Hoff = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
            }
            case 0x0f:
            case 0x11:
            case 0x13: {
                this.bgHoff[(adr - 0xd) >> 1] = (value << 8) | (this.offPrev1 & 0xf8) | (this.offPrev2 & 0x7);
                this.offPrev1 = value;
                this.offPrev2 = value;
                return;
            }
            case 0x0e: {
                this.mode7Voff = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
            }
            case 0x10:
            case 0x12:
            case 0x14: {
                this.bgVoff[(adr - 0xe) >> 1] = (value << 8) | (this.offPrev1 & 0xff);
                this.offPrev1 = value;
                return;
            }
            case 0x15: {
                let incVal = value & 0x3;
                if (incVal === 0) {
                    this.vramInc = 1;
                } else if (incVal === 1) {
                    this.vramInc = 32;
                } else {
                    this.vramInc = 128;
                }
                this.vramRemap = (value & 0x0c) >> 2;
                this.vramIncOnHigh = (value & 0x80) > 0;
                return;
            }
            case 0x16: {
                this.vramAdr = (this.vramAdr & 0xff00) | value;
                this.vramReadBuffer = this.vram[this.getVramRemap()];
                return;
            }
            case 0x17: {
                this.vramAdr = (this.vramAdr & 0xff) | (value << 8);
                this.vramReadBuffer = this.vram[this.getVramRemap()];
                return;
            }
            case 0x18: {
                let adrV = this.getVramRemap();
                this.vram[adrV] = (this.vram[adrV] & 0xff00) | value;
                
                this.updateVramCache(adrV, this.vram[adrV]);

                if (!this.vramIncOnHigh) {
                    this.vramAdr += this.vramInc;
                    this.vramAdr &= 0xffff;
                }
                return;
            }
            case 0x19: {
                let adrV = this.getVramRemap();
                this.vram[adrV] = (this.vram[adrV] & 0xff) | (value << 8);
                
                this.updateVramCache(adrV, this.vram[adrV]);

                if (this.vramIncOnHigh) {
                    this.vramAdr += this.vramInc;
                    this.vramAdr &= 0xffff;
                }
                return;
            }
            case 0x1a: {
                this.mode7LargeField = (value & 0x80) > 0;
                this.mode7Char0fill = (value & 0x40) > 0;
                this.mode7FlipY = (value & 0x2) > 0;
                this.mode7FlipX = (value & 0x1) > 0;
                return;
            }
            case 0x1b: {
                this.mode7A = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.multResult = SnesPpuMode7.getMultResult(this.mode7A, this.mode7B);
                return;
            }
            case 0x1c: {
                this.mode7B = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                this.multResult = SnesPpuMode7.getMultResult(this.mode7A, this.mode7B);
                return;
            }
            case 0x1d: {
                this.mode7C = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                return;
            }
            case 0x1e: {
                this.mode7D = this.get16Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                return;
            }
            case 0x1f: {
                this.mode7X = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                return;
            }
            case 0x20: {
                this.mode7Y = this.get13Signed((value << 8) | this.mode7Prev);
                this.mode7Prev = value;
                return;
            }
            case 0x21: {
                this.cgramAdr = value;
                this.cgramSecond = false;
                return;
            }
            case 0x22: {
                if (!this.cgramSecond) {
                    this.cgramBuffer = (this.cgramBuffer & 0xff00) | value;
                    this.cgramSecond = true;
                } else {
                    this.cgramBuffer = (this.cgramBuffer & 0xff) | (value << 8);
                    this.cgram[this.cgramAdr++] = this.cgramBuffer;
                    this.cgramAdr &= 0xff;
                    this.cgramSecond = false;
                }
                return;
            }
            case 0x23: {
                this.window1Inversed[0] = (value & 0x01) > 0;
                this.window1Enabled[0] = (value & 0x02) > 0;
                this.window2Inversed[0] = (value & 0x04) > 0;
                this.window2Enabled[0] = (value & 0x08) > 0;
                this.window1Inversed[1] = (value & 0x10) > 0;
                this.window1Enabled[1] = (value & 0x20) > 0;
                this.window2Inversed[1] = (value & 0x40) > 0;
                this.window2Enabled[1] = (value & 0x80) > 0;
                return;
            }
            case 0x24: {
                this.window1Inversed[2] = (value & 0x01) > 0;
                this.window1Enabled[2] = (value & 0x02) > 0;
                this.window2Inversed[2] = (value & 0x04) > 0;
                this.window2Enabled[2] = (value & 0x08) > 0;
                this.window1Inversed[3] = (value & 0x10) > 0;
                this.window1Enabled[3] = (value & 0x20) > 0;
                this.window2Inversed[3] = (value & 0x40) > 0;
                this.window2Enabled[3] = (value & 0x80) > 0;
                return;
            }
            case 0x25: {
                this.window1Inversed[4] = (value & 0x01) > 0;
                this.window1Enabled[4] = (value & 0x02) > 0;
                this.window2Inversed[4] = (value & 0x04) > 0;
                this.window2Enabled[4] = (value & 0x08) > 0;
                this.window1Inversed[5] = (value & 0x10) > 0;
                this.window1Enabled[5] = (value & 0x20) > 0;
                this.window2Inversed[5] = (value & 0x40) > 0;
                this.window2Enabled[5] = (value & 0x80) > 0;
                return;
            }
            case 0x26: {
                this.window1Left = value;
                return;
            }
            case 0x27: {
                this.window1Right = value;
                return;
            }
            case 0x28: {
                this.window2Left = value;
                return;
            }
            case 0x29: {
                this.window2Right = value;
                return;
            }
            case 0x2a: {
                this.windowMaskLogic[0] = value & 0x3;
                this.windowMaskLogic[1] = (value & 0xc) >> 2;
                this.windowMaskLogic[2] = (value & 0x30) >> 4;
                this.windowMaskLogic[3] = (value & 0xc0) >> 6;
                return;
            }
            case 0x2b: {
                this.windowMaskLogic[4] = value & 0x3;
                this.windowMaskLogic[5] = (value & 0xc) >> 2;
                return;
            }
            case 0x2c: {
                this.mainScreenEnabled[0] = (value & 0x1) > 0;
                this.mainScreenEnabled[1] = (value & 0x2) > 0;
                this.mainScreenEnabled[2] = (value & 0x4) > 0;
                this.mainScreenEnabled[3] = (value & 0x8) > 0;
                this.mainScreenEnabled[4] = (value & 0x10) > 0;
                return;
            }
            case 0x2d: {
                this.subScreenEnabled[0] = (value & 0x1) > 0;
                this.subScreenEnabled[1] = (value & 0x2) > 0;
                this.subScreenEnabled[2] = (value & 0x4) > 0;
                this.subScreenEnabled[3] = (value & 0x8) > 0;
                this.subScreenEnabled[4] = (value & 0x10) > 0;
                return;
            }
            case 0x2e: {
                this.mainScreenWindow[0] = (value & 0x1) > 0;
                this.mainScreenWindow[1] = (value & 0x2) > 0;
                this.mainScreenWindow[2] = (value & 0x4) > 0;
                this.mainScreenWindow[3] = (value & 0x8) > 0;
                this.mainScreenWindow[4] = (value & 0x10) > 0;
                return;
            }
            case 0x33: {
                this.mode7ExBg = (value & 0x40) > 0;
                this.pseudoHires = (value & 0x08) > 0;
                this.overscan = (value & 0x04) > 0;
                this.objInterlace = (value & 0x02) > 0;
                this.interlace = (value & 0x01) > 0;
                return;
            }
        }
    }

    // ========================================================================
    // ENCAPSULATED STATE SERIALIZATION (SOLID SRP / MEMENTO PATTERN)
    // ========================================================================

    /**
     * Serializes the entire physical PPU core registers and memory.
     * Removes structural state-mapping burdens from the Orchestrator (SRP).
     * 
     * @returns {Object} Packed PPU state object.
     */
    serializeState() {
        return {
            vram: Array.from(this.vram),
            cgram: Array.from(this.cgram),
            oam: Array.from(this.oam),
            highOam: Array.from(this.highOam),
            cgramAdr: this.cgramAdr,
            vramAdr: this.vramAdr,
            mode: this.mode,
            forcedBlank: this.forcedBlank,
            brightness: this.brightness,
            tilemapWider: Array.from(this.tilemapWider),
            tilemapHigher: Array.from(this.tilemapHigher),
            tilemapAdr: Array.from(this.tilemapAdr),
            tileAdr: Array.from(this.tileAdr),
            bgHoff: Array.from(this.bgHoff),
            bgVoff: Array.from(this.bgVoff)
        };
    }

    /**
     * Restores the physical PPU core states back to a saved state.
     * Automatically triggers core cache rebuilds.
     * 
     * @param {Object} state - Saved PPU state.
     */
    deserializeState(state) {
        if (!state) return;
        this.vram.set(state.vram);
        this.rebuildVramCache(); // Synchronize the 4bpp fast patterns cache instantly
        this.cgram.set(state.cgram);
        this.oam.set(state.oam);
        this.highOam.set(state.highOam);
        this.cgramAdr = state.cgramAdr;
        this.vramAdr = state.vramAdr;
        this.mode = state.mode;
        this.forcedBlank = state.forcedBlank;
        this.brightness = state.brightness;
        this.tilemapWider = state.tilemapWider;
        this.tilemapHigher = state.tilemapHigher;
        this.tilemapAdr = state.tilemapAdr;
        this.tileAdr = state.tileAdr;
        this.bgHoff = state.bgHoff;
        this.bgVoff = state.bgVoff;
    }
}

// Backward Compatibility Aliases (SOLID LSP)
window.SnesPpu = SnesPpu;
window.Ppu = SnesPpu;