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
 * 
 * OPTIMIZATIONS APPLIED:
 * - Cleaned redundant duplicated methods (`read`, `write`, `setPixels`) 
 *   which are already defined on the prototype in `SnesPpuCompositor.js`.
 * - Holds the high-speed pre-decoded VRAM cache (`vramCache`) and its 
 *   real-time update/rebuild handlers.
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

            // --- OPTIMIZATION: HIGH-SPEED VRAM CACHE ---
            // 32768 words * 8 pixels * 2 states (Normal & X-Flipped) = 524,288 bytes
            // Caches pre-decoded 2bpp bitplanes to eliminate bit-shifting in hot paths
            this.vramCache = new Uint8Array(524288);

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

            // GC-free pixel cache
            this.pixelOutputCache = new Int32Array(3);

            this.reset();
        }

        reset() {
            this.isPal = false;
            this.vram.fill(0);
            this.cgram.fill(0);
            this.oam.fill(0);
            this.highOam.fill(0);
            this.vramCache.fill(0); // Clear the pre-decoded VRAM cache

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

        // ====================================================================
        // VRAM CACHING SYSTEM (PRE-DECODING)
        // ====================================================================

        /**
         * Parses a written 16-bit word and extracts the 8 planar pixels immediately.
         * Creates both standard and X-Flipped arrays to completely avoid math at runtime.
         */
        updateVramCache(address, word) {
            const baseIdx = address << 3; // address * 8 pixels
            const bp0 = word & 0xff;
            const bp1 = word >> 8;
            
            // Expand planar formats into raw bitplane values
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
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesPpu;
    } else if (typeof window !== 'undefined') {
        window.SnesPpu = SnesPpu;
        window.Ppu = SnesPpu; // Backward compatibility alias
    }
}