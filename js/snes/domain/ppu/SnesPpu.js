/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpu (Picture Processing Unit - Core & I/O)
 * 
 * ROLE:
 * Manages VRAM, CGRAM, OAM arrays, and maps the physical hardware PPU 
 * video registers ($2100-$213F).
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively coordinates register
 *   access, memory ports, and lifecycle states of the video subsystem.
 */

{
    class SnesPpu {
        /**
         * @param {Snes} snes - Unified system main controller context.
         */
        constructor(snes) {
            this.snes = snes;

            // Video Memory Buffers (GC Free)
            this.vram = new Uint16Array(0x8000);
            this.cgram = new Uint16Array(0x100);

            // Object Attribute Memory
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
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesPpu;
    } else if (typeof window !== 'undefined') {
        window.SnesPpu = SnesPpu;
        window.Ppu = SnesPpu; // Backward compatibility alias
    }
}