/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpu (Picture Processing Unit - Unified State Repository)
 * Author: Enrique González Gutiérrez
 * 
 * SOLID Principles:
 * - SRP: Exclusively hosts the active physical memory buffers and state variables.
 * - OCP: Open to new composite pipelines via compositor/register mapper injection.
 * - LSP: Any compatible Compositor/Mapper conforming to the static signatures can be substituted.
 * - ISP: Keeps client components from depending on bloated multi-purpose interfaces.
 * - DIP: Depends directly on static structural contracts rather than inline hardcoded logic.
 */

class SnesPpu {
    /**
     * @param {Object} snes - Parent hardware aggregate core.
     * @param {Object} [mapper] - Pluggable I/O mapper (Defaults to SnesPpuRegisterMapper).
     * @param {Object} [compositor] - Pluggable video blender (Defaults to SnesPpuScanlineCompositor).
     */
    constructor(snes, mapper = SnesPpuRegisterMapper, compositor = SnesPpuScanlineCompositor) {
        this.snes = snes;
        
        // Injected Sub-Systems (DIP)
        this.mapper = mapper;
        this.compositor = compositor;

        this.vram = new Uint16Array(0x8000);
        this.cgram = new Uint16Array(0x100);
        this.oam = new Uint16Array(0x100);
        this.highOam = new Uint16Array(0x10);

        this.spriteLineBuffer = new Uint8Array(256);
        this.spritePrioBuffer = new Uint8Array(256);

        this.mode7Xcoords = new Int32Array(256);
        this.mode7Ycoords = new Int32Array(256);

        // Pre-allocated properties for GC-Free pipeline
        this.resolvedColor = 0;
        this.resolvedLayer = 0;
        this.resolvedPixel = 0;

        // RGB Output (512x240 pixels)
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

        // CGRAM Registers
        this.cgramAdr = 0;
        this.cgramSecond = false;
        this.cgramBuffer = 0;

        // VRAM Registers
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
     * GC-FREE: Delegates rendering steps to the injected Compositor.
     */
    renderLine(line) {
        this.compositor.renderLine(this, line);
    }

    /**
     * Resolves mathematical window clipping logic.
     */
    getMathEnabled(x, l, pal) {
        if (this.preventMath === 3 ||
            (this.preventMath === 2 && SnesPpuBackgroundRenderer.getWindowState(this, x, 5)) ||
            (this.preventMath === 1 && !SnesPpuBackgroundRenderer.getWindowState(this, x, 5))) {
            return false;
        }
        return this.mathEnabled[l] && (l !== 4 || pal >= 0xc0);
    }

    /**
     * Bus I/O Intercept: Delegate to Mapper (SRP)
     */
    read(adr) {
        return this.mapper.read(this, adr);
    }

    /**
     * Bus I/O Intercept: Delegate to Mapper (SRP)
     */
    write(adr, value) {
        this.mapper.write(this, adr, value);
    }
}

// Backward Compatibility Alias
window.SnesPpu = SnesPpu;
window.Ppu = SnesPpu;