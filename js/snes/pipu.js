/**
 * Project: EGGStation - Super Nintendo (SNES) Picture Processing Unit
 * Component: Ppu (Video Emulation Core - Scanline Compositor Edition)
 * Documented & Optimized: English comments, Hybrid Scanline Blitting Engine
 * 
 * ROLE:
 * Emulates the SNES Picture Processing Unit (PPU).
 * Coordinates screen mode configurations, background layouts, mosaic effects,
 * window clipping, color math, sprites (OBJ), and Mode 7 matrix translations.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Implements a Hybrid Scanline Blitting pipeline for high-speed Mode 0, 1, and 3 rendering.
 * - Pre-decodes tile spans into flat line-buffers once per tile row rather than once per pixel.
 * - Preserves the pixel-by-pixel raycast pipeline as an automatic fallback for complex modes.
 * - Utilizes zero-allocation typed array structures.
 */

function Ppu(snes) {

  this.snes = snes;

  // Video Memory buffers
  this.vram = new Uint16Array(0x8000);
  this.cgram = new Uint16Array(0x100);

  // Object Attribute Memory (Sprite metadata)
  this.oam = new Uint16Array(0x100);
  this.highOam = new Uint16Array(0x10);

  this.spriteLineBuffer = new Uint8Array(256);
  this.spritePrioBuffer = new Uint8Array(256);

  // Mode 7 matrix coordinate caches
  this.mode7Xcoords = new Int32Array(256);
  this.mode7Ycoords = new Int32Array(256);

  // Output frame composition array (Interlaced double height buffer)
  this.pixelOutput = new Uint16Array(512 * 3 * 240);

  // Pre-allocated fast row cache to optimize planar tile shifts
  this.decodedRow = [
    new Uint8Array(8), // BG1
    new Uint8Array(8), // BG2
    new Uint8Array(8), // BG3
    new Uint8Array(8)  // BG4
  ];

  // Pre-allocated window lookup masks (6 layers: 0-3 BG1-BG4, 4 OBJ, 5 Color Window)
  this.windowMasks = Array.from({ length: 6 }, () => new Uint8Array(256));

  // Pre-allocated high-speed flat background scanline buffers (Saves tile checks)
  this.bgBuffers = Array.from({ length: 4 }, () => new Uint16Array(256));
  this.bgPriorityBuffers = Array.from({ length: 4 }, () => new Uint8Array(256));

  // Layer configurations mapped per background mode
  this.layersPerMode = [
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
  ];

  // Priority structures mapped per background mode
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

  // Bit depths per layer configured per mode
  this.bitPerMode = [
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
  ];

  this.layercountPerMode = [12, 10, 8, 8, 8, 8, 6, 5, 10, 7];

  // Luminance level scaling multiplier configurations
  this.brightnessMults = [
    0.1, 0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5, 6, 6.6, 7.1, 7.6, 8.2
  ];

  this.spriteTileOffsets = [
    0, 1, 2, 3, 4, 5, 6, 7,
    16, 17, 18, 19, 20, 21, 22, 23,
    32, 33, 34, 35, 36, 37, 38, 39,
    48, 49, 50, 51, 52, 53, 54, 55,
    64, 65, 66, 67, 68, 69, 70, 71,
    80, 81, 82, 83, 84, 85, 86, 87,
    96, 97, 98, 99, 100, 101, 102, 103,
    112, 113, 114, 115, 116, 117, 118, 119
  ];

  this.spriteSizes = [
    1, 1, 1, 2, 2, 4, 2, 2,
    2, 4, 8, 4, 8, 8, 4, 4
  ];

  /**
   * Resets PPU variables to system default startup parameters.
   */
  this.reset = function() {
    clearArray(this.vram);
    clearArray(this.cgram);
    clearArray(this.oam);
    clearArray(this.highOam);

    clearArray(this.spriteLineBuffer);
    clearArray(this.spritePrioBuffer);
    clearArray(this.pixelOutput);

    clearArray(this.mode7Xcoords);
    clearArray(this.mode7Ycoords);

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
  this.reset();

  /**
   * Pre-renders an active background layer tile-by-tile for the current scanline.
   * Significantly reduces tile fetching, remapping, and bitplane decoding operations.
   */
  this.renderBgScanline = function(l, line) {
    const bgBuffer = this.bgBuffers[l];
    const bgPrioBuffer = this.bgPriorityBuffers[l];
    bgBuffer.fill(0);
    bgPrioBuffer.fill(0);

    if (!this.mainScreenEnabled[l] && !this.subScreenEnabled[l]) {
      return;
    }

    const hScroll = this.bgHoff[l];
    const vScroll = this.bgVoff[l];
    const y = line + vScroll;
    const mapWordBits = this.bitPerMode[this.mode * 4 + l];
    const paletteMul = mapWordBits === 2 ? 4 : (mapWordBits === 4 ? 16 : 256);
    const paletteBase = this.mode === 0 ? l * 8 : 0;

    // Render 33 tiles horizontally to cover the 256-pixel viewport under scrolling
    for (let tx = 0; tx < 33; tx++) {
      const screenX = (tx * 8) - (hScroll & 7);
      if (screenX >= 256) break;

      const mapX = hScroll + (tx * 8);
      
      this.fetchTileInBuffer(mapX, y, l, false);
      const mapWord = this.tilemapBuffer[l];
      const priority = (mapWord & 0x2000) >> 13;
      const paletteNum = ((mapWord & 0x1c00) >> 10) + paletteBase;
      const paletteOffset = paletteNum * paletteMul;
      const decodedRow = this.decodedRow[l];

      for (let px = 0; px < 8; px++) {
        const destX = screenX + px;
        if (destX >= 0 && destX < 256) {
          const colorVal = decodedRow[px];
          if (colorVal !== 0) {
            bgBuffer[destX] = paletteOffset + colorVal;
            bgPrioBuffer[destX] = priority;
          }
        }
      }
    }
  }

  /**
   * Tracks whether the frame dimensions will scale to overscan boundaries.
   */
  this.checkOverscan = function(line) {
    if(line === 225 && this.overscan) {
      this.frameOverscan = true;
    }
  }

  /**
   * Renders a single active scanline into the output viewport.
   * Leverages pre-computed scanline buffers for standard modes (Modes 0, 1, 3).
   */
  this.renderLine = function(line) {
    if(line === 0) {
      this.rangeOver = false;
      this.timeOver = false;
      this.frameOverscan = false;
      this.frameInterlace = false;
      clearArray(this.spriteLineBuffer);
      if(!this.forcedBlank) {
        this.evaluateSprites(0);
      }
    } else if(line === (this.frameOverscan ? 240 : 225)) {
      if(!this.forcedBlank) {
        this.oamAdr = this.oamRegAdr;
        this.oamInHigh = this.oamRegInHigh;
        this.oamSecond = false;
      }
      this.frameInterlace = this.interlace;
      this.evenFrame = !this.evenFrame;
    } else if(line > 0 && line < (this.frameOverscan ? 240 : 225)) {
      if(line === 1) {
        this.mosaicStartLine = 1;
      }
      if(this.mode === 7) {
        this.generateMode7Coords(line);
      }

      // --- PRE-CALCULATE SCANLINE WINDOW MASKS (High-speed caching) ---
      for (let l = 0; l < 6; l++) {
        const w1Enabled = this.window1Enabled[l];
        const w2Enabled = this.window2Enabled[l];
        const mask = this.windowMasks[l];
        
        if (!w1Enabled && !w2Enabled) {
          mask.fill(0);
          continue;
        }

        const w1Inv = this.window1Inversed[l];
        const w2Inv = this.window2Inversed[l];
        const left1 = this.window1Left;
        const right1 = this.window1Right;
        const left2 = this.window2Left;
        const right2 = this.window2Right;
        const logic = this.windowMaskLogic[l];

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

      this.lastTileFetchedX = [-1, -1, -1, -1];
      this.lastTileFetchedY = [-1, -1, -1, -1];
      this.optHorBuffer = [0, 0];
      this.optVerBuffer = [0, 0];
      this.lastOrigTileX = [-1, -1];

      // Local declarations to assist browser JIT compilation
      const bMult = this.brightnessMults[this.brightness];
      const lineOffset = line * 1536;
      const colorClipValue = this.colorClip;
      const colMask5 = this.windowMasks[5];
      const pixelOut = this.pixelOutput;
      const modeNum = this.mode;
      const isPseudoHires = this.pseudoHires;
      const isSubEnabled = this.addSub;

      // Select scanline pre-composition for eligible modes (Mode 0, 1, 3)
      const useScanlineFastPath = !this.pseudoHires && (modeNum === 0 || modeNum === 1 || modeNum === 3);

      if (useScanlineFastPath && !this.forcedBlank) {
        for (let l = 0; l < 4; l++) {
          this.renderBgScanline(l, line);
        }
      }

      let i = 0;
      while(i < 256) {
        let r1 = 0;
        let g1 = 0;
        let b1 = 0;
        let r2 = 0;
        let g2 = 0;
        let b2 = 0;

        if(!this.forcedBlank) {
          const colLay = useScanlineFastPath ? this.getColorFast(false, i, line) : this.getColor(false, i, line);
          const color = colLay[0];
          const activeLayer = colLay[1];
          const activePal = colLay[2];

          r2 = color & 0x1f;
          g2 = (color & 0x3e0) >> 5;
          b2 = (color & 0x7c00) >> 10;

          if(
            colorClipValue === 3 ||
            (colorClipValue === 2 && colMask5[i] === 1) ||
            (colorClipValue === 1 && colMask5[i] === 0)
          ) {
            r2 = 0;
            g2 = 0;
            b2 = 0;
          }

          let secondLay = null;
          const mathEnabled = this.getMathEnabled(i, activeLayer, activePal);
          
          if(
            modeNum === 5 || modeNum === 6 || isPseudoHires ||
            (mathEnabled && isSubEnabled)
          ) {
            secondLay = useScanlineFastPath ? this.getColorFast(true, i, line) : this.getColor(true, i, line);
            r1 = secondLay[0] & 0x1f;
            g1 = (secondLay[0] & 0x3e0) >> 5;
            b1 = (secondLay[0] & 0x7c00) >> 10;
          }

          if(mathEnabled) {
            const secondLayerNum = secondLay ? secondLay[1] : 5;
            const useSecondColor = isSubEnabled && secondLayerNum < 5;
            const mathR = useSecondColor ? r1 : this.fixedColorR;
            const mathG = useSecondColor ? g1 : this.fixedColorG;
            const mathB = useSecondColor ? b1 : this.fixedColorB;

            if(this.subtractColors) {
              r2 -= mathR;
              g2 -= mathG;
              b2 -= mathB;
            } else {
              r2 += mathR;
              g2 += mathG;
              b2 += mathB;
            }

            if(this.halfColors && (secondLayerNum < 5 || !isSubEnabled)) {
              r2 >>= 1;
              g2 >>= 1;
              b2 >>= 1;
            }
            if (r2 > 31) r2 = 31; else if (r2 < 0) r2 = 0;
            if (g2 > 31) g2 = 31; else if (g2 < 0) g2 = 0;
            if (b2 > 31) b2 = 31; else if (b2 < 0) b2 = 0;
          }

          if(!(modeNum === 5 || modeNum === 6 || isPseudoHires)) {
            r1 = r2;
            g1 = g2;
            b1 = b2;
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

      clearArray(this.spriteLineBuffer);
      if(!this.forcedBlank) {
        this.evaluateSprites(line);
      }
    }
  }

  /**
   * Fast-path compositing loop bypassing tile evaluation entirely.
   * Reads coordinates directly from pre-rendered arrays.
   */
  this.getColorFast = function(sub, x, y) {
    let modeIndex = this.layer3Prio && this.mode === 1 ? 96 : 12 * this.mode;
    modeIndex = this.mode7ExBg && this.mode === 7 ? 108 : modeIndex;
    let count = this.layercountPerMode[this.mode];

    let pixel = 0;
    let layer = 5;

    const subEnabled = this.subScreenEnabled;
    const mainEnabled = this.mainScreenEnabled;
    const subWindow = this.subScreenWindow;
    const mainWindow = this.mainScreenWindow;
    const winMasks = this.windowMasks;

    let j;
    for (j = 0; j < count; j++) {
      layer = this.layersPerMode[modeIndex + j];
      
      const isVisible = sub ? subEnabled[layer] : mainEnabled[layer];
      const isWindowRestricted = sub ? subWindow[layer] : mainWindow[layer];

      if (isVisible && (!isWindowRestricted || winMasks[layer][x] === 0)) {
        if (layer < 4) {
          // Direct read from the precompiled scanline buffers (Zero scrolling/tile math!)
          const priority = this.bgPriorityBuffers[layer][x];
          if (priority === this.prioPerMode[modeIndex + j]) {
            const colorIdx = this.bgBuffers[layer][x];
            if (colorIdx !== 0) {
              pixel = colorIdx;
              break;
            }
          }
        } else {
          // Sprite evaluation
          if (this.spritePrioBuffer[x] === this.prioPerMode[modeIndex + j]) {
            const colorIdx = this.spriteLineBuffer[x];
            if (colorIdx !== 0) {
              pixel = colorIdx;
              break;
            }
          }
        }
      }
    }

    layer = j === count ? 5 : layer;
    let color = this.cgram[pixel & 0xff];
    if (
      this.directColor && layer < 4 &&
      this.bitPerMode[this.mode * 4 + layer] === 8
    ) {
      let r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
      let g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
      let b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
      color = (b << 10) | (g << 5) | r;
    }

    return [color, layer, pixel];
  }

  /**
   * Fallback Pixel-by-pixel compositing. Primarily used for Mode 7 or Mode 2/4/6.
   */
  this.getColor = function(sub, x, y) {
    let modeIndex = this.layer3Prio && this.mode === 1 ? 96 : 12 * this.mode;
    modeIndex = this.mode7ExBg && this.mode === 7 ? 108 : modeIndex;
    let count = this.layercountPerMode[this.mode];

    let pixel = 0;
    let layer = 5;
    if(this.interlace && (this.mode === 5 || this.mode === 6)) {
      y = y * 2 + (this.evenFrame ? 1 : 0);
    }

    const subEnabled = this.subScreenEnabled;
    const mainEnabled = this.mainScreenEnabled;
    const subWindow = this.subScreenWindow;
    const mainWindow = this.mainScreenWindow;
    const winMasks = this.windowMasks;

    let j;
    for(j = 0; j < count; j++) {
      let lx = x;
      let ly = y;
      layer = this.layersPerMode[modeIndex + j];
      
      const isVisible = sub ? subEnabled[layer] : mainEnabled[layer];
      const isWindowRestricted = sub ? subWindow[layer] : mainWindow[layer];

      if (isVisible && (!isWindowRestricted || winMasks[layer][lx] === 0)) {
        if(this.mosaicEnabled[layer]) {
          lx -= lx % this.mosaicSize;
          ly -= (ly - this.mosaicStartLine) % this.mosaicSize;
        }
        lx += this.mode === 7 ? 0 : this.bgHoff[layer];
        ly += this.mode === 7 ? 0 : this.bgVoff[layer];
        let optX = lx - this.bgHoff[layer];
        if((this.mode === 5 || this.mode === 6) && layer < 4) {
          lx = lx * 2 + (sub ? 0 : 1);
          optX = optX * 2 + (sub ? 0 : 1);
        }

        if((this.mode === 2 || this.mode === 4 || this.mode === 6) && layer < 2) {
          let andVal = layer === 0 ? 0x2000 : 0x4000;
          if(x === 0) {
            this.lastOrigTileX[layer] = lx >> 3;
          }
          let tileStartX = optX - (lx - (lx & 0xfff8));
          if((lx >> 3) !== this.lastOrigTileX[layer] && x > 0) {
            this.fetchTileInBuffer(
              this.bgHoff[2] + ((tileStartX - 1) & 0x1f8),
              this.bgVoff[2], 2, true
            );
            this.optHorBuffer[layer] = this.tilemapBuffer[2];
            if(this.mode === 4) {
              if((this.optHorBuffer[layer] & 0x8000) > 0) {
                this.optVerBuffer[layer] = this.optHorBuffer[layer];
                this.optHorBuffer[layer] = 0;
              } else {
                this.optVerBuffer[layer] = 0;
              }
            } else {
              this.fetchTileInBuffer(
                this.bgHoff[2] + ((tileStartX - 1) & 0x1f8),
                this.bgVoff[2] + 8, 2, true
              );
              this.optVerBuffer[layer] = this.tilemapBuffer[2];
            }
            this.lastOrigTileX[layer] = lx >> 3;
          }
          if((this.optHorBuffer[layer] & andVal) > 0) {
            let add = ((tileStartX + 7) & 0x1f8);
            lx = (lx & 0x7) + ((this.optHorBuffer[layer] + add) & 0x1ff8);
          }
          if((this.optVerBuffer[layer] & andVal) > 0) {
            ly = (this.optVerBuffer[layer] & 0x1fff) + (ly - this.bgVoff[layer]);
          }
        }

        pixel = this.getPixelForLayer(
          lx, ly,
          layer,
          this.prioPerMode[modeIndex + j]
        );
      }
      if((pixel & 0xff) > 0) {
        break;
      }
    }
    layer = j === count ? 5 : layer;
    let color = this.cgram[pixel & 0xff];
    if(
      this.directColor && layer < 4 &&
      this.bitPerMode[this.mode * 4 + layer] === 8
    ) {
      let r = ((pixel & 0x7) << 2) | ((pixel & 0x100) >> 7);
      let g = ((pixel & 0x38) >> 1) | ((pixel & 0x200) >> 8);
      let b = ((pixel & 0xc0) >> 3) | ((pixel & 0x400) >> 8);
      color = (b << 10) | (g << 5) | r;
    }

    return [color, layer, pixel];
  }

  /**
   * Fast window status evaluator. Resolves directly via precomputed line arrays.
   */
  this.getWindowState = function(x, l) {
    return this.windowMasks[l][x] === 1;
  }

  /**
   * Checks whether the dynamic math filter affects the targeted layer.
   */
  this.getMathEnabled = function(x, l, pal) {
    if(
      this.preventMath === 3 ||
      (this.preventMath === 2 && this.windowMasks[5][x] === 1) ||
      (this.preventMath === 1 && this.windowMasks[5][x] === 0)
    ) {
      return false;
    }
    if(this.mathEnabled[l] && (l !== 4 || pal >= 0xc0)) {
      return true;
    }
    return false;
  }

  /**
   * Decodes background pixels. Reuses batched decoded line cache blocks.
   */
  this.getPixelForLayer = function(x, y, l, p) {
    if(l > 3) {
      if(this.spritePrioBuffer[x] !== p) {
        return 0;
      }
      return this.spriteLineBuffer[x];
    }

    if(this.mode === 7) {
      return this.getMode7Pixel(x, y, l, p);
    }

    const currentXTile = x >> 3;
    if(
      currentXTile !== this.lastTileFetchedX[l] ||
      y !== this.lastTileFetchedY[l]
    ) {
      this.fetchTileInBuffer(x, y, l, false);
      this.lastTileFetchedX[l] = currentXTile;
      this.lastTileFetchedY[l] = y;
    }

    let mapWord = this.tilemapBuffer[l];
    if(((mapWord & 0x2000) >> 13) !== p) {
      return 0;
    }

    const tileData = this.decodedRow[l][x & 0x7];
    if (tileData === 0) return 0;

    let paletteNum = (mapWord & 0x1c00) >> 10;
    paletteNum += this.mode === 0 ? l * 8 : 0;

    let bits = this.bitPerMode[this.mode * 4 + l];
    let mul = bits === 2 ? 4 : (bits === 4 ? 16 : 256);

    return paletteNum * mul + tileData;
  }

  /**
   * Fetches tile assets and decodes them directly into the target row array buffers.
   */
  this.fetchTileInBuffer = function(x, y, l, offset) {
    let rx = x;
    let ry = y;
    let useXbig = this.bigTiles[l] | this.mode === 5 | this.mode === 6;
    x >>= useXbig ? 1 : 0;
    y >>= this.bigTiles[l] ? 1 : 0;

    let adr = this.tilemapAdr[l] + (
      ((y & 0xff) >> 3) << 5 | ((x & 0xff) >> 3)
    );
    adr += ((x & 0x100) > 0 && this.tilemapWider[l]) ? 1024 : 0;
    adr += ((y & 0x100) > 0 && this.tilemapHigher[l]) ? (
      this.tilemapWider[l] ? 2048 : 1024
    ) : 0;
    this.tilemapBuffer[l] = this.vram[adr & 0x7fff];
    if(offset) {
      return;
    }
    let yFlip = (this.tilemapBuffer[l] & 0x8000) > 0;
    let xFlip = (this.tilemapBuffer[l] & 0x4000) > 0;
    let yRow = yFlip ? 7 - (ry & 0x7) : (ry & 0x7);
    let tileNum = this.tilemapBuffer[l] & 0x3ff;

    tileNum += useXbig && (rx & 0x8) === (xFlip ? 0 : 8) ? 1 : 0;
    tileNum += this.bigTiles[l] && (ry & 0x8) === (yFlip ? 0 : 8) ? 0x10 : 0;

    let bits = this.bitPerMode[this.mode * 4 + l];
    let tileBaseOffset = this.tileAdr[l] + tileNum * 4 * bits + yRow;

    const p1 = this.vram[tileBaseOffset & 0x7fff];
    this.tileBufferP1[l] = p1;

    let p2 = 0, p3 = 0, p4 = 0;
    if(bits > 2) {
      p2 = this.vram[(tileBaseOffset + 8) & 0x7fff];
      this.tileBufferP2[l] = p2;
    }
    if(bits > 4) {
      p3 = this.vram[(tileBaseOffset + 16) & 0x7fff];
      p4 = this.vram[(tileBaseOffset + 24) & 0x7fff];
      this.tileBufferP3[l] = p3;
      this.tileBufferP4[l] = p4;
    }

    const decoded = this.decodedRow[l];
    
    if (xFlip) {
      for (let j = 0; j < 8; j++) {
        let tileData = (p1 >> j) & 0x1;
        tileData |= ((p1 >> (8 + j)) & 0x1) << 1;
        if (bits > 2) {
          tileData |= ((p2 >> j) & 0x1) << 2;
          tileData |= ((p2 >> (8 + j)) & 0x1) << 3;
        }
        if (bits > 4) {
          tileData |= ((p3 >> j) & 0x1) << 4;
          tileData |= ((p3 >> (8 + j)) & 0x1) << 5;
          tileData |= ((p4 >> j) & 0x1) << 6;
          tileData |= ((p4 >> (8 + j)) & 0x1) << 7;
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
  }

  /**
   * Sorts and parses priority flags for operational sprites inside the scanline window.
   */
  this.evaluateSprites = function(line) {
    let spriteCount = 0;
    let sliverCount = 0;
    let index = this.objPriority ? ((this.oamAdr & 0xfe) - 2) & 0xff : 254;
    for(let i = 0; i < 128; i++) {
      let x = this.oam[index] & 0xff;
      let y = (this.oam[index] & 0xff00) >> 8;
      let tile = this.oam[index + 1] & 0xff;
      let ex = (this.oam[index + 1] & 0xff00) >> 8;
      x |= (this.highOam[index >> 4] >> (index & 0xf) & 0x1) << 8;
      let big = (this.highOam[index >> 4] >> (index & 0xf) & 0x2) > 0;
      x = x > 255 ? -(512 - x) : x;

      let size = this.spriteSizes[this.objSize + (big ? 8 : 0)];
      let sprRow = line - y;
      if(sprRow < 0 || sprRow >= size * (this.objInterlace ? 4 : 8)) {
        sprRow = line + (256 - y);
      }
      if(
        sprRow >= 0 && sprRow < size * (this.objInterlace ? 4 : 8) &&
        x > -(size * 8)
      ) {
        if(spriteCount === 32) {
          this.rangeOver = true;
          break;
        }
        sprRow = this.objInterlace ? sprRow * 2 + (
          this.evenFrame ? 1 : 0
        ) : sprRow;
        let adr = this.sprAdr1 + ((ex & 0x1) > 0 ? this.sprAdr2 : 0);
        sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
        let tileRow = sprRow >> 3;
        sprRow &= 0x7;
        for(let k = 0; k < size; k++) {
          if((x + k * 8) > -7 && (x + k * 8) < 256) {
            if(sliverCount === 34) {
              sliverCount = 35;
              break; 
            }
            let tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
            let tileNum = tile + this.spriteTileOffsets[
              tileRow * 8 + tileColumn
            ];
            tileNum &= 0xff;
            let tileP1 = this.vram[
              (adr + tileNum * 16 + sprRow) & 0x7fff
            ];
            let tileP2 = this.vram[
              (adr + tileNum * 16 + sprRow + 8) & 0x7fff
            ];
            for(let j = 0; j < 8; j++) {
              let shift = ((ex & 0x40) > 0) ? j : 7 - j;
              let tileData = (tileP1 >> shift) & 0x1;
              tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
              tileData |= ((tileP2 >> shift) & 0x1) << 2;
              tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;
              let color = tileData + 16 * ((ex & 0xe) >> 1);
              let xInd = x + k * 8 + j;
              if(tileData > 0 && xInd < 256 && xInd >= 0) {
                this.spriteLineBuffer[xInd] = 0x80 + color;
                this.spritePrioBuffer[xInd] = (ex & 0x30) >> 4;
              }
            }
            sliverCount++;
          }
        }
        if(sliverCount === 35) {
          this.timeOver = true;
          break;
        }

        spriteCount++;
      }

      index = (index - 2) & 0xff;
    }
  }

  /**
   * Sets the coordinate matrices required for Mode 7 translation scaling.
   */
  this.generateMode7Coords = function(y) {
    let rY = this.mode7FlipY ? 255 - y : y;

    let clippedH = this.mode7Hoff - this.mode7X;
    clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3ff) : (clippedH & 0x3ff);
    let clippedV = this.mode7Voff - this.mode7Y;
    clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3ff) : (clippedV & 0x3ff);

    let lineStartX = (
      ((this.mode7A * clippedH) & ~63) +
      ((this.mode7B * rY) & ~63) + ((this.mode7B * clippedV) & ~63) +
      (this.mode7X << 8)
    );
    let lineStartY = (
      ((this.mode7C * clippedH) & ~63) +
      ((this.mode7D * rY) & ~63) + ((this.mode7D * clippedV) & ~63) +
      (this.mode7Y << 8)
    );

    this.mode7Xcoords[0] = lineStartX;
    this.mode7Ycoords[0] = lineStartY;

    for(let i = 1; i < 256; i++) {
      this.mode7Xcoords[i] = this.mode7Xcoords[i - 1] + this.mode7A;
      this.mode7Ycoords[i] = this.mode7Ycoords[i - 1] + this.mode7C;
    }
  }

  /**
   * Resolves structural background pixel data output for Mode 7 coordinates.
   */
  this.getMode7Pixel = function(x, y, l, p) {
    let pixelData = this.tilemapBuffer[0];
    if(x !== this.lastTileFetchedX[0] || y !== this.lastTileFetchedY[0]) {
      let rX = this.mode7FlipX ? 255 - x : x;

      let px = this.mode7Xcoords[rX] >> 8;
      let py = this.mode7Ycoords[rX] >> 8;

      let pixelIsTransparent = false;

      if(this.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
        if(this.mode7Char0fill) {
          px &= 0x7;
          py &= 0x7;
        } else {
          pixelIsTransparent = true;
        }
      }
      let tileX = (px & 0x3f8) >> 3;
      let tileY = (py & 0x3f8) >> 3;

      let tileByte = this.vram[(tileY * 128 + tileX)] & 0xff;
      pixelData = this.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)];
      pixelData >>= 8;
      pixelData = pixelIsTransparent ? 0 : pixelData;
      this.tilemapBuffer[0] = pixelData;
      this.lastTileFetchedX[0] = x;
      this.lastTileFetchedY[0] = y;
    }

    if(l === 1 && (pixelData >> 7) !== p) {
      return 0;
    } else if(l === 1) {
      return pixelData & 0x7f;
    }

    return pixelData;
  }

  /**
   * Selects VRAM remapping patterns according to active hardware configs.
   */
  this.getVramRemap = function() {
    let adr = this.vramAdr & 0x7fff;
    if(this.vramRemap === 1) {
      adr = (adr & 0xff00) | ((adr & 0xe0) >> 5) | ((adr & 0x1f) << 3);
    } else if(this.vramRemap === 2) {
      adr = (adr & 0xfe00) | ((adr & 0x1c0) >> 6) | ((adr & 0x3f) << 3);
    } else if(this.vramRemap === 3) {
      adr = (adr & 0xfc00) | ((adr & 0x380) >> 7) | ((adr & 0x7f) << 3);
    }
    return adr;
  }

  this.get13Signed = function(val) {
    if((val & 0x1000) > 0) {
      return -(8192 - (val & 0xfff));
    }
    return (val & 0xfff);
  }

  this.get16Signed = function(val) {
    if((val & 0x8000) > 0) {
      return -(65536 - val);
    }
    return val;
  }

  this.getMultResult = function(a, b) {
    b = b < 0 ? 65536 + b : b;
    b >>= 8;
    b = ((b & 0x80) > 0) ? -(256 - b) : b;
    let ans = a * b;
    if(ans < 0) {
      return 16777216 + ans;
    }
    return ans;
  }

  /**
   * Reads from PPU configuration registers.
   */
  this.read = function(adr) {
    switch(adr) {
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
        if(this.snes.ppuLatch) {
          this.latchedHpos = this.snes.xPos >> 2;
          this.latchedVpos = this.snes.yPos;
          this.countersLatched = true;
        }
        return this.snes.openBus;
      }
      case 0x38: {
        let val;
        if(!this.oamSecond) {
          if(this.oamInHigh) {
            val = this.highOam[this.oamAdr & 0xf] & 0xff;
          } else {
            val = this.oam[this.oamAdr] & 0xff;
          }
          this.oamSecond = true;
        } else {
          if(this.oamInHigh) {
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
        if(!this.vramIncOnHigh) {
          this.vramReadBuffer = this.vram[this.getVramRemap()];
          this.vramAdr += this.vramInc;
          this.vramAdr &= 0xffff;
        }
        return val & 0xff;
      }
      case 0x3a: {
        let val = this.vramReadBuffer;
        if(this.vramIncOnHigh) {
          this.vramReadBuffer = this.vram[this.getVramRemap()];
          this.vramAdr += this.vramInc;
          this.vramAdr &= 0xffff;
        }
        return (val & 0xff00) >> 8;
      }
      case 0x3b: {
        let val;
        if(!this.cgramSecond) {
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
        if(!this.latchHsecond) {
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
        if(!this.latchVsecond) {
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
        return val | 0x1;
      }
      case 0x3f: {
        let val = this.evenFrame ? 0x80 : 0;
        val |= this.countersLatched ? 0x40 : 0;
        if(this.snes.ppuLatch) {
          this.countersLatched = false;
        }
        this.latchHsecond = false;
        this.latchVsecond = false;
        return val | 0x3;
      }
    }
    return this.snes.openBus;
  }

  /**
   * Writes value to targeted PPU configuration register.
   */
  this.write = function(adr, value) {
    switch(adr) {
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
        this.oamRegInHigh = this.oamInHigh
        this.oamSecond = false;
        return;
      }
      case 0x04: {
        if(!this.oamSecond) {
          if(this.oamInHigh) {
            this.highOam[
              this.oamAdr & 0xf
            ] = (this.highOam[this.oamAdr & 0xf] & 0xff00) | value;
          } else {
            this.oamBuffer = (this.oamBuffer & 0xff00) | value;
          }
          this.oamSecond = true;
        } else {
          if(this.oamInHigh) {
            this.highOam[
              this.oamAdr & 0xf
            ] = (this.highOam[this.oamAdr & 0xf] & 0xff) | (value << 8);
          } else {
            this.oamBuffer = (this.oamBuffer & 0xff) | (value << 8);
            this.oam[this.oamAdr] = this.oamBuffer;
          }
          this.oamAdr++;
          this.oamAdr &= 0xff;
          this.oamInHigh = (
            this.oamAdr === 0
          ) ? !this.oamInHigh : this.oamInHigh;
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
        this.bgHoff[
          (adr - 0xd) >> 1
        ] = (value << 8) | (this.offPrev1 & 0xf8) | (this.offPrev2 & 0x7);
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
        this.bgVoff[
          (adr - 0xe) >> 1
        ] = (value << 8) | (this.offPrev1 & 0xff);
        this.offPrev1 = value;
        return;
      }
      case 0x15: {
        let incVal = value & 0x3;
        if(incVal === 0) {
          this.vramInc = 1;
        } else if(incVal === 1) {
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
        let adr = this.getVramRemap();
        this.vram[adr] = (this.vram[adr] & 0xff00) | value;
        if(!this.vramIncOnHigh) {
          this.vramAdr += this.vramInc;
          this.vramAdr &= 0xffff;
        }
        return;
      }
      case 0x19: {
        let adr = this.getVramRemap();
        this.vram[adr] = (this.vram[adr] & 0xff) | (value << 8);
        if(this.vramIncOnHigh) {
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
        this.multResult = this.getMultResult(this.mode7A, this.mode7B);
        return;
      }
      case 0x1c: {
        this.mode7B = this.get16Signed((value << 8) | this.mode7Prev);
        this.mode7Prev = value;
        this.multResult = this.getMultResult(this.mode7A, this.mode7B);
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
        if(!this.cgramSecond) {
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
      case 0x2f: {
        this.subScreenWindow[0] = (value & 0x1) > 0;
        this.subScreenWindow[1] = (value & 0x2) > 0;
        this.subScreenWindow[2] = (value & 0x4) > 0;
        this.subScreenWindow[3] = (value & 0x8) > 0;
        this.subScreenWindow[4] = (value & 0x10) > 0;
        return;
      }
      case 0x30: {
        this.colorClip = (value & 0xc0) >> 6;
        this.preventMath = (value & 0x30) >> 4;
        this.addSub = (value & 0x2) > 0;
        this.directColor = (value & 0x1) > 0;
        return;
      }
      case 0x31: {
        this.subtractColors = (value & 0x80) > 0;
        this.halfColors = (value & 0x40) > 0;
        this.mathEnabled[0] = (value & 0x1) > 0;
        this.mathEnabled[1] = (value & 0x2) > 0;
        this.mathEnabled[2] = (value & 0x4) > 0;
        this.mathEnabled[3] = (value & 0x8) > 0;
        this.mathEnabled[4] = (value & 0x10) > 0;
        this.mathEnabled[5] = (value & 0x20) > 0;
        return;
      }
      case 0x32: {
        if((value & 0x80) > 0) {
          this.fixedColorB = value & 0x1f;
        }
        if((value & 0x40) > 0) {
          this.fixedColorG = value & 0x1f;
        }
        if((value & 0x20) > 0) {
          this.fixedColorR = value & 0x1f;
        }
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

  /**
   * Translates output buffer values to display-ready viewport canvases.
   */
  this.setPixels = function(arr) {

    if(!this.frameOverscan) {
      for(let i = 0; i < 512*16; i++) {
        let x = i % 512;
        let y = (i >> 9);
        let ind = (y * 512 + x) * 4;
        arr[ind + 3] = 0;
      }
      for(let i = 0; i < 512*16; i++) {
        let x = i % 512;
        let y = (i >> 9);
        let ind = ((y + 464) * 512 + x) * 4;
        arr[ind + 3] = 0;
      }
    }

    let addY = this.frameOverscan ? 0 : 14;

    for(let i = 512; i < 512 * (this.frameOverscan ? 240 : 225); i++) {
      let x = i % 512;
      let y = (i >> 9) * 2;
      let ind = ((y + addY) * 512 + x) * 4;
      let r = this.pixelOutput[i * 3];
      let g = this.pixelOutput[i * 3 + 1];
      let b = this.pixelOutput[i * 3 + 2];
      if(!this.frameInterlace || this.evenFrame) {
        arr[ind] = r;
        arr[ind + 1] = g;
        arr[ind + 2] = b;
        arr[ind + 3] = 255;
      }
      ind += 512 * 4;
      if(!this.frameInterlace || !this.evenFrame) {
        arr[ind] = r;
        arr[ind + 1] = g;
        arr[ind + 2] = b;
        arr[ind + 3] = 255;
      }
    }
  }

}