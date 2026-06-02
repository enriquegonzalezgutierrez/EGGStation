/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Super Nintendo PPU State Machine
 * 
 * Emulates the SNES PPU registers, coordinating visual modes and video memory transfers:
 * - 32KW VRAM (Video RAM)
 * - 256-word CGRAM (Color Palette RAM)
 * - 256-word OAM (Object Attribute Memory) & 16-word High OAM
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on registering, latching,
 *   and storing video configuration parameters, leaving rendering math to SnesPpuRenderer.
 */

class SnesPpu {
    constructor() {
        // --- Video Memories ---
        this.vram = new Uint16Array(0x8000); // 32KW Video RAM
        this.cgram = new Uint16Array(0x100); // 256-word Color RAM
        this.oam = new Uint16Array(0x100);   // 256-word Object Attribute Memory
        this.highOam = new Uint16Array(0x10); // 16-word Extra Sprite attribute bits

        // --- Core Status Parameters ---
        this.forcedBlank = true;
        this.brightness = 0xF; // 0-15 scale
        this.inVblank = false;
        this.inHblank = false;

        // --- Background Scroll & Layout Configurations ---
        this.mode = 0;       
        this.layer3Prio = false;
        this.bgHoff = new Uint16Array(4); 
        this.bgVoff = new Uint16Array(4); 
        this.bigTiles = new Array(4).fill(false); // false = 8x8, true = 16x16
        
        // --- Layer Main/Sub Screen Enables ---
        this.mainScreenEnabled = new Array(5).fill(false); 
        this.subScreenEnabled = new Array(5).fill(false);  

        // --- VRAM Access Port Registers ---
        this.vramIncStep = 1;
        this.vramAddress = 0;
        this.vramRemap = 0;
        this.vramIncOnHigh = false;
        this.vramReadBuffer = 0;

        // --- CGRAM Address Pointer ---
        this.cgramAddress = 0;
        this.cgramSecondWrite = false;
        this.cgramBuffer = 0;

        // --- OAM Address Pointer ---
        this.oamAddress = 0;
        this.oamSecondWrite = false;

        // --- Windowing State ---
        this.window1Left = 0;
        this.window1Right = 0;
        this.window2Left = 0;
        this.window2Right = 0;
        this.window1Enabled = new Array(6).fill(false);
        this.window2Enabled = new Array(6).fill(false);
        this.window1Inversed = new Array(6).fill(false);
        this.window2Inversed = new Array(6).fill(false);
        this.windowMaskLogic = new Array(6).fill(0);
        this.mainScreenWindow = new Array(5).fill(false);
        this.subScreenWindow = new Array(5).fill(false);

        // --- Resolution & Interlace Parameters ---
        this.yScreenLines = 224; 
        this.overscan = false;
        this.frameOverscan = false;
        this.interlace = false;
        this.objInterlace = false;
        this.pseudoHires = false;
        this.mode7ExBg = false;

        // --- Object / Sprites Parameters ---
        this.objSize = 0;
        this.sprAdr1 = 0;
        this.sprAdr2 = 0;

        this.tilemapWider = new Array(4).fill(false);
        this.tilemapHigher = new Array(4).fill(false);
        this.tilemapAdr = new Array(4).fill(0);
        this.tileAdr = new Array(4).fill(0);

        // --- Color Math Configurations ---
        this.colorClip = 0;
        this.preventMath = 0;
        this.addSub = false;
        this.directColor = false;
        this.subtractColors = false;
        this.halfColors = false;
        this.mathEnabled = new Array(6).fill(false);
        this.fixedColorB = 0;
        this.fixedColorG = 0;
        this.fixedColorR = 0;

        // --- Mosaic Configurations ---
        this.mosaicEnabled = new Array(5).fill(false);
        this.mosaicSize = 1;
        this.mosaicStartLine = 1;

        // --- Mode 7 Affine Matrix Registers ---
        this.mode7LargeField = false;
        this.mode7Char0fill = false;
        this.mode7FlipX = false;
        this.mode7FlipY = false;
        this.mode7Hoff = 0;
        this.mode7Voff = 0;
        this.mode7A = 0;
        this.mode7B = 0;
        this.mode7C = 0;
        this.mode7D = 0;
        this.mode7X = 0;
        this.mode7Y = 0;
        this.mode7Prev = 0;

        // --- Rendering Core Tables (SnesJs Accurate) ---
        this.layersPerMode = [
            4, 0, 1, 4, 0, 1, 4, 2, 3, 4, 2, 3, // Mode 0
            4, 0, 1, 4, 0, 1, 4, 2, 4, 2, 5, 5, // Mode 1
            4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, // Mode 2
            4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, // Mode 3
            4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, // Mode 4
            4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, // Mode 5
            4, 0, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5, // Mode 6
            4, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5, 5, // Mode 7
            2, 4, 0, 1, 4, 0, 1, 4, 2, 4, 5, 5, // Mode 1 (Priority BG3)
            4, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, 5  // Mode 7 (EXTBG)
        ];
        
        this.prioPerMode = [
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
        ];
        
        this.bitPerMode = [2, 2, 2, 2, 4, 4, 2, 5, 4, 4, 5, 5, 8, 4, 5, 5, 8, 2, 5, 5, 4, 2, 5, 5, 4, 5, 5, 5, 8, 5, 5, 5, 4, 4, 2, 5, 8, 7, 5, 5];
        this.layercountPerMode = [12, 10, 8, 8, 8, 8, 6, 5, 10, 7];
        this.brightnessMults = [0.1, 0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5, 6, 6.6, 7.1, 7.6, 8.2];
        
        this.spriteTileOffsets = [
            0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23, 32, 33, 34, 35, 36, 37, 38, 39,
            48, 49, 50, 51, 52, 53, 54, 55, 64, 65, 66, 67, 68, 69, 70, 71, 80, 81, 82, 83, 84, 85, 86, 87,
            96, 97, 98, 99, 100, 101, 102, 103, 112, 113, 114, 115, 116, 117, 118, 119
        ];
        this.spriteSizes = [1, 1, 1, 2, 2, 4, 2, 2, 2, 4, 8, 4, 8, 8, 4, 4];

        // --- Decoupled Renderer Hook ---
        this.renderer = null; // Instantiated by SnesOrchestrator

        // Pre-allocated frame buffer matching SNES standard dimensions (256x240, 4 channels)
        this.glbFrameBuffer = new Uint8ClampedArray(256 * 240 * 4);
    }

    /**
     * Resets visual registers and clears memories.
     */
    reset() {
        this.vram.fill(0);
        this.cgram.fill(0); // BUG FIXED: Safely clears the Color RAM array
        this.oam.fill(0);
        this.highOam.fill(0);
        this.glbFrameBuffer.fill(0);
        this.forcedBlank = true;
    }

    /**
     * Updates the frame overscan state based on hardware timing lines.
     * @param {number} line - Active scanline index
     */
    checkOverscan(line) {
        if (line === 225 && this.overscan) this.frameOverscan = true;
    }

    /**
     * Resolves VRAM address mapping based on active mapping modes.
     */
    getVramRemap() {
        let adr = this.vramAddress & 0x7FFF;
        if (this.vramRemap === 1) adr = (adr & 0xFF00) | ((adr & 0x00E0) >> 5) | ((adr & 0x001F) << 3);
        else if (this.vramRemap === 2) adr = (adr & 0xFE00) | ((adr & 0x01C0) >> 6) | ((adr & 0x003F) << 3);
        else if (this.vramRemap === 3) adr = (adr & 0xFC00) | ((adr & 0x0380) >> 7) | ((adr & 0x007F) << 3);
        return adr;
    }

    // ========================================================================
    // PPU HARDWARE REGISTER READS (0x2134 - 0x213F)
    // ========================================================================

    read(register) {
        register &= 0xFF;

        switch (register) {
            case 0x38: {
                // OAM Read Port
                let value = 0;
                if (!this.oamSecondWrite) {
                    value = this.oam[this.oamAddress] & 0xFF;
                    this.oamSecondWrite = true;
                } else {
                    value = (this.oam[this.oamAddress++] >> 8) & 0xFF;
                    this.oamAddress &= 0xFF;
                    this.oamSecondWrite = false;
                }
                return value;
            }

            case 0x39: {
                // VRAM Read Low Port
                let val = this.vramReadBuffer;
                if (!this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAddress = (this.vramAddress + this.vramIncStep) & 0xFFFF;
                }
                return val & 0xFF;
            }

            case 0x3A: {
                // VRAM Read High Port
                let val = this.vramReadBuffer;
                if (this.vramIncOnHigh) {
                    this.vramReadBuffer = this.vram[this.getVramRemap()];
                    this.vramAddress = (this.vramAddress + this.vramIncStep) & 0xFFFF;
                }
                return (val >> 8) & 0xFF;
            }

            case 0x3B: {
                // CGRAM Palette Read Port
                let value = 0;
                if (!this.cgramSecondWrite) {
                    value = this.cgram[this.cgramAddress] & 0xFF;
                    this.cgramSecondWrite = true;
                } else {
                    value = (this.cgram[this.cgramAddress++] >> 8) & 0xFF;
                    this.cgramAddress &= 0xFF;
                    this.cgramSecondWrite = false;
                }
                return value;
            }

            case 0x3E: {
                return 0x01; // Fake OAM status (To keep games happy)
            }

            case 0x3F: {
                return 0x03; // Fake Interlace status
            }
        }
        return 0;
    }

    // ========================================================================
    // PPU HARDWARE REGISTER WRITES (0x2100 - 0x2133)
    // ========================================================================

    write(register, value) {
        register &= 0xFF;
        value &= 0xFF;

        switch (register) {
            case 0x00: 
                // Screen Display / Forced Blank
                this.forcedBlank = (value & 0x80) > 0; 
                this.brightness = value & 0x0F; 
                break;

            case 0x01: 
                // Object Base Address & Sprite Size
                this.sprAdr1 = (value & 0x07) << 13; 
                this.sprAdr2 = ((value & 0x18) + 8) << 9; 
                this.objSize = (value & 0xE0) >> 5; 
                break;

            case 0x02: 
                // OAM Base Address Low
                this.oamAddress = value; 
                this.oamSecondWrite = false; 
                break;

            case 0x04: 
                // OAM Write Data Port
                if (!this.oamSecondWrite) {
                    this.oam[this.oamAddress] = (this.oam[this.oamAddress] & 0xFF00) | value;
                    this.oamSecondWrite = true;
                } else {
                    this.oam[this.oamAddress] = (this.oam[this.oamAddress] & 0x00FF) | (value << 8);
                    this.oamAddress = (this.oamAddress + 1) & 0xFF;
                    this.oamSecondWrite = false;
                }
                break;

            case 0x05: 
                // Background Mode and Tile Sizes
                this.mode = value & 0x07; 
                this.layer3Prio = (value & 0x08) > 0;
                this.bigTiles[0] = (value & 0x10) > 0; 
                this.bigTiles[1] = (value & 0x20) > 0; 
                this.bigTiles[2] = (value & 0x40) > 0; 
                this.bigTiles[3] = (value & 0x80) > 0; 
                break;

            case 0x06: 
                // Mosaic parameters
                this.mosaicEnabled[0] = (value & 0x01) > 0; 
                this.mosaicEnabled[1] = (value & 0x02) > 0; 
                this.mosaicEnabled[2] = (value & 0x04) > 0; 
                this.mosaicEnabled[3] = (value & 0x08) > 0; 
                this.mosaicSize = ((value & 0xF0) >> 4) + 1; 
                break;

            case 0x07: case 0x08: case 0x09: case 0x0A:
                // Tilemap base addresses and sizes
                this.tilemapWider[register - 7] = (value & 0x01) > 0;
                this.tilemapHigher[register - 7] = (value & 0x02) > 0;
                this.tilemapAdr[register - 7] = (value & 0xFC) << 8;
                break;

            case 0x0B: 
                this.tileAdr[0] = (value & 0x0F) << 12; 
                this.tileAdr[1] = (value & 0xF0) << 8; 
                break;

            case 0x0C: 
                this.tileAdr[2] = (value & 0x0F) << 12; 
                this.tileAdr[3] = (value & 0xF0) << 8; 
                break;

            case 0x0D: case 0x0F: case 0x11: case 0x13:
                // Horizontal Scroll
                this.bgHoff[(register - 0x0D) >> 1] = (value << 8) | (this.mode7Prev & 0xFF);
                this.mode7Prev = value;
                if(register === 0x0D) this.mode7Hoff = (value << 8) | this.mode7Prev;
                break;

            case 0x0E: case 0x10: case 0x12: case 0x14:
                // Vertical Scroll
                this.bgVoff[(register - 0x0E) >> 1] = (value << 8) | (this.mode7Prev & 0xFF);
                this.mode7Prev = value;
                if(register === 0x0E) this.mode7Voff = (value << 8) | this.mode7Prev;
                break;

            case 0x15:
                // VRAM Increment Mode
                this.vramIncStep = (value & 3) === 0 ? 1 : ((value & 3) === 1 ? 32 : 128);
                this.vramRemap = (value & 0x0C) >> 2;
                this.vramIncOnHigh = (value & 0x80) > 0;
                break;

            case 0x16: 
                // VRAM Address Low
                this.vramAddress = (this.vramAddress & 0xFF00) | value; 
                this.vramReadBuffer = this.vram[this.getVramRemap()]; 
                break;

            case 0x17: 
                // VRAM Address High
                this.vramAddress = (this.vramAddress & 0x00FF) | (value << 8); 
                this.vramReadBuffer = this.vram[this.getVramRemap()]; 
                break;

            case 0x18: {
                // VRAM Word Write Low (automatic increment if configured)
                const adr = this.getVramRemap();
                this.vram[adr] = (this.vram[adr] & 0xFF00) | value;
                if (!this.vramIncOnHigh) this.vramAddress = (this.vramAddress + this.vramIncStep) & 0xFFFF;
                break;
            }

            case 0x19: {
                // VRAM Word Write High
                const adr = this.getVramRemap();
                this.vram[adr] = (this.vram[adr] & 0x00FF) | (value << 8);
                if (this.vramIncOnHigh) this.vramAddress = (this.vramAddress + this.vramIncStep) & 0xFFFF;
                break;
            }

            case 0x1A: 
                // Mode 7 Initial Settings
                this.mode7LargeField = (value & 0x80) > 0; 
                this.mode7Char0fill = (value & 0x40) > 0; 
                this.mode7FlipY = (value & 0x02) > 0; 
                this.mode7FlipX = (value & 0x01) > 0; 
                break;

            case 0x1B: this.mode7A = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;
            case 0x1C: this.mode7B = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;
            case 0x1D: this.mode7C = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;
            case 0x1E: this.mode7D = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;
            case 0x1F: this.mode7X = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;
            case 0x20: this.mode7Y = ((value << 8) | this.mode7Prev); this.mode7Prev = value; break;

            case 0x21: 
                // CGRAM Palette Address Port
                this.cgramAddress = value; 
                this.cgramSecondWrite = false; 
                break;

            case 0x22:
                // CGRAM Palette Data Write Port
                if (!this.cgramSecondWrite) {
                    this.cgramBuffer = (this.cgramBuffer & 0xFF00) | value;
                    this.cgramSecondWrite = true;
                } else {
                    this.cgramBuffer = (this.cgramBuffer & 0x00FF) | (value << 8);
                    this.cgram[this.cgramAddress++] = this.cgramBuffer;
                    this.cgramAddress &= 0xFF;
                    this.cgramSecondWrite = false;
                }
                break;

            case 0x23: case 0x24: case 0x25: {
                // Window parameters
                const idx = (register - 0x23) * 2;
                this.window1Inversed[idx] = (value & 0x01) > 0; 
                this.window1Enabled[idx] = (value & 0x02) > 0;
                this.window2Inversed[idx] = (value & 0x04) > 0; 
                this.window2Enabled[idx] = (value & 0x08) > 0;
                this.window1Inversed[idx+1] = (value & 0x10) > 0; 
                this.window1Enabled[idx+1] = (value & 0x20) > 0;
                this.window2Inversed[idx+1] = (value & 0x40) > 0; 
                this.window2Enabled[idx+1] = (value & 0x80) > 0;
                break;
            }

            case 0x26: this.window1Left = value; break;
            case 0x27: this.window1Right = value; break;
            case 0x28: this.window2Left = value; break;
            case 0x29: this.window2Right = value; break;

            case 0x2A: 
                this.windowMaskLogic[0] = value & 3; 
                this.windowMaskLogic[1] = (value & 0xC) >> 2; 
                this.windowMaskLogic[2] = (value & 0x30) >> 4; 
                this.windowMaskLogic[3] = (value & 0xC0) >> 6; 
                break;

            case 0x2B: 
                this.windowMaskLogic[4] = value & 3; 
                this.windowMaskLogic[5] = (value & 0xC) >> 2; 
                break;

            case 0x2C: 
                // Main Screen Layer Enables
                this.mainScreenEnabled[0] = (value & 1) > 0; 
                this.mainScreenEnabled[1] = (value & 2) > 0; 
                this.mainScreenEnabled[2] = (value & 4) > 0; 
                this.mainScreenEnabled[3] = (value & 8) > 0; 
                this.mainScreenEnabled[4] = (value & 16) > 0; 
                break;

            case 0x2D: 
                // Sub Screen Layer Enables
                this.subScreenEnabled[0] = (value & 1) > 0; 
                this.subScreenEnabled[1] = (value & 2) > 0; 
                this.subScreenEnabled[2] = (value & 4) > 0; 
                this.subScreenEnabled[3] = (value & 8) > 0; 
                this.subScreenEnabled[4] = (value & 16) > 0; 
                break;

            case 0x2E: 
                this.mainScreenWindow[0] = (value & 1) > 0; 
                this.mainScreenWindow[1] = (value & 2) > 0; 
                this.mainScreenWindow[2] = (value & 4) > 0; 
                this.mainScreenWindow[3] = (value & 8) > 0; 
                this.mainScreenWindow[4] = (value & 16) > 0; 
                break;

            case 0x2F: 
                this.subScreenWindow[0] = (value & 1) > 0; 
                this.subScreenWindow[1] = (value & 2) > 0; 
                this.subScreenWindow[2] = (value & 4) > 0; 
                this.subScreenWindow[3] = (value & 8) > 0; 
                this.subScreenWindow[4] = (value & 16) > 0; 
                break;

            case 0x30: 
                this.colorClip = (value & 0xC0) >> 6; 
                this.preventMath = (value & 0x30) >> 4; 
                this.addSub = (value & 2) > 0; 
                this.directColor = (value & 1) > 0; 
                break;

            case 0x31: 
                this.subtractColors = (value & 0x80) > 0; 
                this.halfColors = (value & 0x40) > 0; 
                this.mathEnabled[0] = (value & 1) > 0; 
                this.mathEnabled[1] = (value & 2) > 0; 
                this.mathEnabled[2] = (value & 4) > 0; 
                this.mathEnabled[3] = (value & 8) > 0; 
                this.mathEnabled[4] = (value & 16) > 0; 
                this.mathEnabled[5] = (value & 32) > 0; 
                break;

            case 0x32: 
                if ((value & 0x80) > 0) this.fixedColorB = value & 0x1F; 
                if ((value & 0x40) > 0) this.fixedColorG = value & 0x1F; 
                if ((value & 0x20) > 0) this.fixedColorR = value & 0x1F; 
                break;

            case 0x33: 
                this.mode7ExBg = (value & 0x40) > 0;
                this.pseudoHires = (value & 0x08) > 0;
                this.overscan = (value & 0x04) > 0;
                this.objInterlace = (value & 0x02) > 0;
                this.interlace = (value & 0x01) > 0;
                break;
        }
    }
}

// Safely publish class to the window namespace
window.SnesPpu = SnesPpu;