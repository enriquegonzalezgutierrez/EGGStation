/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega Genesis Video Display Processor (VDP)
 * 
 * Emulates the custom Sega Genesis VDP chip. Handles plane mapping grids, 
 * sprite caching/sorting lists, window boundary locks, H32 / H40 resolution modes, 
 * and advanced hardware-level pixel priorities (Shadow / Highlight).
 * 
 * Aligned with hardware standards observed in BlastEm & Charles MacDonald docs to resolve:
 * 1. Correct Shadow/Highlight Transparency: Colors 15 (0x3E) and 16 (0x3F) of 
 *    Palette Line 4 are treated as transparent, allowing the background planes to 
 *    show through while applying the correct luminance offset.
 * 2. Sega Genesis Sprite Masking (X = 0): Corrects the mask trigger coordinate. 
 *    A register value of rawX = 128 (0x80) represents screen coordinate 0 (128 - 128), 
 *    activating the masking state machine.
 * 3. Strict Hardware Scanline Limits: Enforces 20 sprites/320 pixels (H40) or 
 *    16 sprites/256 pixels (H32) per line to accurately emulate sprite drop-outs.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates visual rendering pathways, 
 *   CRAM/VSRAM/VRAM address decoders, and DMA registers from CPU and system bus execution.
 */

// ========================================================================
// SEGA GENESIS VDP LOW-LEVEL UTILITY HELPER FUNCTIONS
// ========================================================================

/**
 * Calculates the absolute VRAM address for the Sprite Attribute Table (SAT).
 */
function GetSpriteTableAddress(state) {
    const mask = ~(0x1FF) << (state.h40Enabled ? 1 : 0);
    return (state.spriteTableAddress & mask) >>> 0;
}

/**
 * Calculates the absolute VRAM address for the Window Plane.
 */
function GetWindowPlaneTableAddress(state) {
    const mask = ~(0x7FF) << (state.h40Enabled ? 1 : 0);
    return (state.windowAddress & mask) >>> 0;
}

/**
 * Retrieves and decodes a sprite directly from VRAM.
 * Reads directly from VRAM to prevent order-of-initialization bugs on Register 5 changes.
 */
function VDP_GetCachedSprite(state, spriteIndex) {
    const spriteTableBase = GetSpriteTableAddress(state) + (spriteIndex * 8);

    // Read Word 0 (Y Coordinate)
    const y = state.readVRAMWord(spriteTableBase) & (state.doubleResolutionEnabled ? 0x3FF : 0x1FF);
    
    // Read Word 1 (Size and Link)
    const word1 = state.readVRAMWord(spriteTableBase + 2);
    const link = word1 & 0x7F; // Link is strictly 7 bits (bits 0-6). Bit 7 is a hardware reserved flag.
    const width = ((word1 >> 10) & 3) + 1;
    const height = ((word1 >> 8) & 3) + 1;

    return { y, link, width, height };
}

class GenesisVdp {
    constructor() {
        this.vRam = new Uint8Array(0x10000); 
        this.cram = new Uint16Array(64);     
        this.vsram = new Uint16Array(64);    
        this.vsramCache = new Uint16Array(2);

        this.regs = new Uint8Array(0x20);

        this.spriteRowCacheTotal = new Uint8Array(256);
        this.spriteRowCacheTableIdx = new Uint8Array(256 * 20);
        this.spriteRowCacheYInSprite = new Uint8Array(256 * 20);
        this.spriteRowCacheWidth = new Uint8Array(256 * 20);
        this.spriteRowCacheHeight = new Uint8Array(256 * 20);

        this.spriteRowCacheNeedsUpdating = true;

        this.accessWritePending = false;
        this.accessAddressRegister = 0;
        this.accessCodeRegister = 0;
        this.accessSelectedBuffer = 0; 
        this.accessIncrement = 0;

        // DMA State Machine Registers
        this.dmaEnabled = false;
        this.dmaMode = 0; // 0/1 = Memory-to-VRAM, 2 = VRAM Fill, 3 = VRAM Copy
        this.dmaSourceAddressHigh = 0;
        this.dmaSourceAddressLow = 0;
        this.dmaLength = 0;
        this.dmaFillPending = false;
        this.dmaRunning = false; // Non-blocking transfer state flag

        // MDTracer Aligned: 131,072-word pre-flipped tile cache (32768 words * 4 mirroring states)
        this.rendererVram = new Uint32Array(32768 * 4);
        this.g_pattern_chk = new Uint8Array(2048);

        this.planeAAddress = 0;
        this.planeBAddress = 0;
        this.windowAddress = 0;
        this.spriteTableAddress = 0;
        this.hscrollAddress = 0;

        this.windowAlignedRight = false;
        this.windowAlignedBottom = false;
        this.windowHorizontalBoundary = 0;
        this.windowVerticalBoundary = 0;

        this.planeWidthShift = 5;
        this.planeHeightBitmask = 0x1F;

        this.extendedVramEnabled = false;
        this.displayEnabled = false;
        this.vIntEnabled = false;
        this.hIntEnabled = false;
        this.h40Enabled = false;
        this.v30Enabled = false;
        this.megaDriveModeEnabled = false;
        this.shadowHighlightEnabled = false;
        this.doubleResolutionEnabled = false;
        this.spriteTileIndexRebase = false;
        this.planeATileIndexRebase = false;
        this.planeBTileIndexRebase = false;

        this.backgroundColour = 0;
        this.register0a = 0; // Backup reload register for H-Blank Interrupts
        this.hIntInterval = 0;
        
        this.currentlyInVblank = true;
        this.vIntPending = false;  
        this.hblankToggle = false; 
        this.allowSpriteMasking = false;
        this.spriteCollisionFlag = false; // Sprite collision flag (Bit 5 of Status Register)

        this.hscrollMask = 0;
        this.vscrollMode = 0; 

        this.debugSelectedRegister = 0;
        this.debugHideLayers = false;
        this.debugForcedLayer = 0;

        this.kdebugBufferIndex = 0;
        this.kdebugBuffer = new Uint8Array(256);

        this.previousDataWrites = new Uint16Array(4);

        this.configSpritesDisabled = false;
        this.configWindowDisabled = false;
        this.configPlanesDisabled = new Uint8Array(2);
        this.configWidescreenTiles = 0;

        this.initialise();
    }

    /**
     * Resets VDP state to power-on defaults.
     */
    initialise() {
        this.vRam.fill(0);
        this.cram.fill(0);
        this.vsram.fill(0);
        this.vsramCache.fill(0);
        this.regs.fill(0);

        this.spriteRowCacheTotal.fill(0);
        this.spriteRowCacheTableIdx.fill(0);
        this.spriteRowCacheYInSprite.fill(0);
        this.spriteRowCacheWidth.fill(0);
        this.spriteRowCacheHeight.fill(0);

        this.spriteRowCacheNeedsUpdating = true;

        this.accessWritePending = false;
        this.accessAddressRegister = 0;
        this.accessCodeRegister = 0;
        this.accessSelectedBuffer = 0;
        this.accessIncrement = 0;

        this.dmaEnabled = false;
        this.dmaMode = 0;
        this.dmaSourceAddressHigh = 0;
        this.dmaSourceAddressLow = 0;
        this.dmaLength = 0;
        this.dmaFillPending = false;
        this.dmaRunning = false;

        this.rendererVram.fill(0);
        this.g_pattern_chk = new Uint8Array(2048);

        this.planeAAddress = 0;
        this.planeBAddress = 0;
        this.windowAddress = 0;
        this.spriteTableAddress = 0;
        this.hscrollAddress = 0;

        this.windowAlignedRight = false;
        this.windowAlignedBottom = false;
        this.windowHorizontalBoundary = 0;
        this.windowVerticalBoundary = 0;

        this.planeWidthShift = 5;
        this.planeHeightBitmask = 0x1F;

        this.extendedVramEnabled = false;
        this.displayEnabled = false;
        this.vIntEnabled = false;
        this.hIntEnabled = false;
        this.h40Enabled = false;
        this.v30Enabled = false;
        this.megaDriveModeEnabled = false;
        this.shadowHighlightEnabled = false;
        this.doubleResolutionEnabled = false;
        this.spriteTileIndexRebase = false;
        this.planeATileIndexRebase = false;
        this.planeBTileIndexRebase = false;

        this.backgroundColour = 0;
        this.register0a = 0; 
        this.hIntInterval = 0;
        
        this.currentlyInVblank = true;
        this.vIntPending = false;  
        this.hblankToggle = false;
        this.allowSpriteMasking = false;
        this.spriteCollisionFlag = false;

        this.hscrollMask = 0;
        this.vscrollMode = 0;

        this.debugSelectedRegister = 0;
        this.debugHideLayers = false;
        this.debugForcedLayer = 0;

        this.kdebugBufferIndex = 0;
        this.kdebugBuffer.fill(0);

        this.previousDataWrites.fill(0);

        this.configSpritesDisabled = false;
        this.configWindowDisabled = false;
        this.configPlanesDisabled.fill(0);
        this.configWidescreenTiles = 0;
    }

    getScreenWidthInTilePairs() { return this.h40Enabled ? 20 : 16; }
    getScreenWidthInTiles() { return this.getScreenWidthInTilePairs() * 2; }
    getScreenWidthInPixels() { return this.getScreenWidthInTiles() * 8; }
    getScreenHeightInTiles() { return this.v30Enabled ? 30 : 28; }
    getExtendedScreenWidthInTilePairs() {
        const widescreenOffsetPairs = Math.ceil(this.configWidescreenTiles / 2);
        return this.getScreenWidthInTilePairs() + widescreenOffsetPairs * 2;
    }
    getExtendedScreenWidthInTiles() { return this.getExtendedScreenWidthInTilePairs() * 2; }
    getExtendedScreenWidthInPixels() { return this.getExtendedScreenWidthInTiles() * 8; }

    /**
     * Standard 24-bit physical VRAM direct address mapping.
     */
    decodeVramAddress(address) {
        return address & 0xFFFF; 
    }

    readVRAM(address) { return this.vRam[this.decodeVramAddress(address)]; }

    writeVRAM(address, value) {
        const decoded = this.decodeVramAddress(address);

        if (decoded < 0x10000) {
            this.vRam[decoded] = value & 0xFF;
            this.pattern_chk(address);
            this.spriteRowCacheNeedsUpdating = true; 
        }
    }

    /**
     * Big-Endian standard 16-bit word reading (high-byte first).
     */
    readVRAMWord(address) {
        const decoded = this.decodeVramAddress(address);
        return (this.vRam[decoded] << 8) | this.vRam[(decoded + 1) & 0xFFFF];
    }

    incrementAccessAddressRegister() {
        this.accessAddressRegister = (this.accessAddressRegister + this.accessIncrement) & 0x1FFFF;
    }

    /**
     * Big-Endian standard 16-bit word writing.
     * Restored to linear high/low write to prevent byte-swapping conflicts on EGGStation VRAM.
     */
    writeAndIncrement(value, colorUpdatedCallback, callbackUserData) {
        switch (this.accessSelectedBuffer) {
            case 0: // VRAM
                this.writeVRAM(this.accessAddressRegister, (value >> 8) & 0xFF);
                this.writeVRAM(this.accessAddressRegister + 1, value & 0xFF);
                break;

            case 1: { // CRAM
                const color = value & 0xEEE;
                const cramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                this.cram[cramIdx] = color;

                // Pre-calculate Shadow & Highlight variations
                const normalColor = color | ((color & 0x888) >> 3);
                const shadowColor = color >> 1;
                const highlightColor = 0x888 + (color >> 1);

                colorUpdatedCallback(callbackUserData, 0x000 + cramIdx, normalColor);
                colorUpdatedCallback(callbackUserData, 0x040 + cramIdx, shadowColor);
                colorUpdatedCallback(callbackUserData, 0x080 + cramIdx, highlightColor);
                break;
            }

            case 2: { // VSRAM
                const vsramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                if (vsramIdx < 40) {
                    const vscroll = value & 0x7FF;
                    // Mirroring for specific indices
                    if (vsramIdx < 2) {
                        for (let i = 40 + vsramIdx; i < 64; i += 2) {
                            this.vsram[i] = vscroll;
                        }
                    }
                    this.vsram[vsramIdx] = vscroll;
                }
                break;
            }
        }
        this.incrementAccessAddressRegister();
    }

    readAndIncrement() {
        const wordAddress = Math.floor(this.accessAddressRegister / 2);
        let value = this.previousDataWrites[0] | 0;

        switch (this.accessSelectedBuffer) {
            case 0: // VRAM Word
                value = this.readVRAMWord(wordAddress * 2);
                break;

            case 1: // CRAM
                value = (value & ~0xEEE) | this.cram[wordAddress % 64];
                break;

            case 2: // VSRAM
                value = (value & ~0x7FF) | this.vsram[wordAddress % 64];
                break;

            case 3: // VRAM Byte
                value = (value & ~0xFF) | this.readVRAM(this.accessAddressRegister);
                break;
        }
        this.incrementAccessAddressRegister();
        return value;
    }

    readData() {
        this.accessWritePending = false;
        return this.readAndIncrement();
    }

    /**
     * Reads the VDP Status Register.
     * Aligned with BlastEm's FIFO empty/full and vblank/hblank flags.
     */
    readControl() {
        this.accessWritePending = false;
        const fifoEmpty = 0x200; // Bit 9: FIFO empty
        const fifoFull = 0x100;  // Bit 8: FIFO full
        
        const vblankFlag = this.currentlyInVblank ? 0x08 : 0;
        
        this.hblankToggle = !this.hblankToggle;
        const hblankFlag = (this.currentlyInVblank || this.hblankToggle) ? 0x04 : 0;
        
        const vIntFlag = this.vIntPending ? 0x80 : 0;
        this.vIntPending = false; 
        
        const dmaFlag = this.dmaRunning ? 0x02 : 0; // Bit 1: DMA execution status
        
        return vIntFlag | 
               ((this.spriteCollisionFlag ? 1 : 0) << 5) | 
               vblankFlag | 
               hblankFlag | 
               dmaFlag |
               fifoEmpty; // Report FIFO always empty for simple non-blocking cycles
    }

    updateFakeFIFO(value) {
        this.previousDataWrites[0] = this.previousDataWrites[1];
        this.previousDataWrites[1] = this.previousDataWrites[2];
        this.previousDataWrites[2] = this.previousDataWrites[3];
        this.previousDataWrites[3] = value & 0xFFFF;
    }

    // ========================================================================
    // YM2612 VERIFIED DMA FILL & COPY OPERATIONS
    // ========================================================================

    dmaRunMemory(readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle) {
        this.dmaRunning = true;
        const dmaCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        let sourceAddr = ((this.dmaSourceAddressHigh << 16) | this.dmaSourceAddressLow) << 1;
        let loopCount = dmaCount;

        do {
            const value = readCallback(readCallbackUserData, sourceAddr, targetCycle);
            this.writeAndIncrement(value, colorUpdatedCallback, callbackUserData);
            sourceAddr = (sourceAddr + 2) & 0xFFFFFF;
        } while (--loopCount > 0);

        this.dmaSourceAddressLow = (sourceAddr >> 1) & 0xFFFF;
        this.dmaSourceAddressHigh = (sourceAddr >> 17) & 0x7F; 
        this.dmaLength = 0;
        this.dmaRunning = false;
    }

    /**
     * VRAM DMA Fill (Hardware Compliant 8-bit Fill).
     * Sega Genesis VDP VRAM Fill is strictly an 8-bit byte-sized operation.
     * It writes the high byte of the data word to the target VRAM address, 
     * incrementing sequentially without word-swapping masks.
     */
    dmaRunFill(value, colorUpdatedCallback, callbackUserData) {
        this.dmaRunning = true;
        let loopCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        const fillByte = (value >> 8) & 0xFF; // Genesis VRAM Fill always uses the high byte

        if (this.accessSelectedBuffer === 0) { // VRAM Fill
            do {
                this.writeVRAM(this.accessAddressRegister, fillByte);
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (this.accessSelectedBuffer === 1) { 
            do {
                const cramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                this.cram[cramIdx] = value;
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (this.accessSelectedBuffer === 2) { 
            do {
                const vsramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                if (vsramIdx < 40) {
                    this.vsram[vsramIdx] = value;
                }
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        this.dmaLength = 0;
        this.dmaRunning = false;
    }

    /**
     * VRAM to VRAM Internal DMA Copy (Flat Array Aligned).
     * Since EGGStation utilizes a flat, non-interleaved VRAM array, 
     * bytes must be copied sequentially without the odd/even '^ 1' bit-mask
     * to prevent scrambling sprite attributes and tile data.
     */
    dmaRunCopy() {
        this.dmaRunning = true;
        let loopCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        let sourceAddr = ((this.dmaSourceAddressHigh << 16) | this.dmaSourceAddressLow) & 0xFFFF;

        if (this.accessSelectedBuffer === 0) { // VRAM Copy
            do {
                // Read and write sequentially to preserve the flat byte-order of VRAM
                const val = this.readVRAM(sourceAddr);
                this.writeVRAM(this.accessAddressRegister, val);
                
                sourceAddr = (sourceAddr + 1) & 0xFFFF;
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        this.dmaLength = 0;
        this.dmaRunning = false;
    }

    writeData(value, colorUpdatedCallback, callbackUserData) {
        this.accessWritePending = false;
        this.updateFakeFIFO(value);

        if (this.dmaFillPending) {
            this.dmaFillPending = false;
            this.dmaRunFill(value, colorUpdatedCallback, callbackUserData);
            return;
        }

        if (this.accessSelectedBuffer === 4) { 
            this.incrementAccessAddressRegister();
        } else {
            this.writeAndIncrement(value, colorUpdatedCallback, callbackUserData);

            if ((this.accessCodeRegister & 0x20) !== 0) {
                this.accessCodeRegister &= ~0x20; 

                do {
                    if (this.accessSelectedBuffer === 0) {
                        this.writeVRAM(this.accessAddressRegister, (value >> 8) & 0xFF);
                        this.incrementAccessAddressRegister();
                    } else {
                        this.writeAndIncrement(this.previousDataWrites[0], colorUpdatedCallback, callbackUserData);
                    }

                    this.dmaSourceAddressLow = (this.dmaSourceAddressLow + 1) & 0xFFFF;
                    this.dmaLength = (this.dmaLength - 1) & 0xFFFF;
                } while (this.dmaLength !== 0);
            }
        }
    }

    writeControl(value, colorUpdatedCallback, callbackUserData, dmaTransferBeginCallback, readCallback, readCallbackUserData, kdebugCallback, kdebugCallbackUserData, targetCycle) {
        if (this.accessWritePending || (value & 0xC000) !== 0x8000) {
            if (this.accessWritePending) {
                const codeBitmask = this.dmaEnabled ? 0x3C : 0x1C;
                this.accessWritePending = false;
                this.accessAddressRegister = (this.accessAddressRegister & 0x3FFF) | ((value & 7) << 14);
                this.accessCodeRegister = (this.accessCodeRegister & ~codeBitmask) | ((value >> 2) & codeBitmask);
            } else {
                this.accessWritePending = true;
                this.accessAddressRegister = (value & 0x3FFF) | (this.accessAddressRegister & (3 << 14));
                this.accessCodeRegister = ((value >> 14) & 3) | (this.accessCodeRegister & 0x3C);
            }

            switch ((this.accessCodeRegister >> 1) & 7) {
                case 0: this.accessSelectedBuffer = 0; break; 
                case 1: case 4: this.accessSelectedBuffer = 1; break; 
                case 2: this.accessSelectedBuffer = 2; break; 
                case 6: this.accessSelectedBuffer = 3; break; 
                default: this.accessSelectedBuffer = 4; break; 
            }

            if ((this.accessCodeRegister & 0x20) !== 0 && this.dmaEnabled) { 
                this.accessCodeRegister &= ~0x20;

                if (this.dmaMode === 0 || this.dmaMode === 1) { 
                    dmaTransferBeginCallback(readCallbackUserData, this.dmaLength, targetCycle);
                    this.dmaRunMemory(readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle);
                } else if (this.dmaMode === 2) { 
                    this.dmaFillPending = true;
                } else if (this.dmaMode === 3) { 
                    this.dmaRunCopy();
                }
            }
        } else {
            const reg = (value >> 8) & 0x1F;
            const data = value & 0xFF;
            this.accessSelectedBuffer = 4; 
            this.setRegister(reg, data);
        }
    }

    setRegister(reg, data) {
        if (reg <= 10 || this.megaDriveModeEnabled) {
            this.regs[reg] = data;

            switch (reg) {
                case 0: this.hIntEnabled = (data & 0x10) !== 0; break;
                case 1:
                    this.extendedVramEnabled = (data & 0x80) !== 0;
                    this.displayEnabled = (data & 0x40) !== 0;
                    this.vIntEnabled = (data & 0x20) !== 0;
                    this.dmaEnabled = (data & 0x10) !== 0;
                    this.v30Enabled = (data & 0x08) !== 0;
                    this.megaDriveModeEnabled = (data & 0x04) !== 0;
                    break;
                case 2: this.planeAAddress = (data & 0x78) << 10; break;
                case 3: this.windowAddress = (data & 0x7E) << 10; break;
                case 4: this.planeBAddress = (data & 0x0F) << 13; break;
                case 5: 
                    this.spriteTableAddress = data << 9; 
                    this.spriteRowCacheNeedsUpdating = true; // Invalidate cache when SAT base pointer updates
                    break;
                case 6: this.spriteTileIndexRebase = (data & 0x20) !== 0; break;
                case 7: this.backgroundColour = data & 0x3F; break;
                case 10:
                    this.register0a = data; 
                    break;
                case 11:
                    this.vscrollMode = (data & 4) !== 0 ? 1 : 0;
                    // Mode 1 (invalid) defaults to 0x00 full screen. Stops background shearing.
                    this.hscrollMask = [0x00, 0x00, 0xF8, 0xFF][data & 3]; 
                    break;
                case 12:
                    this.h40Enabled = (data & 0x81) !== 0;
                    this.shadowHighlightEnabled = (data & 0x08) !== 0;
                    this.doubleResolutionEnabled = ((data >> 1) & 3) === 3;
                    break;
                case 13: this.hscrollAddress = (data & 0x7F) << 10; break;
                case 14:
                    this.planeATileIndexRebase = (data & 0x01) !== 0;
                    this.planeBTileIndexRebase = (data & 0x10) !== 0 && this.planeATileIndexRebase;
                    break;
                case 15: this.accessIncrement = data; break;
                case 16:
                    this.planeHeightBitmask = (data << 1) | 0x1F;
                    switch (data & 3) {
                        case 0: this.planeWidthShift = 5; this.planeHeightBitmask &= 0x7F; break;
                        case 1: this.planeWidthShift = 6; this.planeHeightBitmask &= 0x3F; break;
                        case 2: this.planeWidthShift = 5; this.planeHeightBitmask &= 0; break;
                        case 3: this.planeWidthShift = 7; this.planeHeightBitmask &= 0x1F; break;
                    }
                    break;
                case 17:
                    this.windowAlignedRight = (data & 0x80) !== 0;
                    this.windowHorizontalBoundary = Math.min(32, data & 0x1F);
                    break;
                case 18:
                    this.windowAlignedBottom = (data & 0x80) !== 0;
                    this.windowVerticalBoundary = (data & 0x1F) << (3 + this.doubleResolutionEnabled);
                    break;
                case 19: this.dmaLength = (this.dmaLength & 0xFF00) | data; break;
                case 20: this.dmaLength = (this.dmaLength & 0x00FF) | (data << 8); break;
                case 21: this.dmaSourceAddressLow = (this.dmaSourceAddressLow & 0xFF00) | data; break;
                case 22: this.dmaSourceAddressLow = (this.dmaSourceAddressLow & 0x00FF) | (data << 8); break;
                case 23:
                    if ((data & 0x80) === 0) {
                        this.dmaSourceAddressHigh = data & 0x7F;
                    } else {
                        this.dmaSourceAddressHigh = data & 0x3F;
                    }
                    this.dmaMode = (data >> 6) & 3; 
                    break;
            }
        }
    }

    beginScanline() {
        this.vsramCache[0] = this.vsram[0];
        this.vsramCache[1] = this.vsram[1];
    }

    /**
     * Parses the VDP SAT (Sprite Attribute Table) and builds a scanline-optimized 
     * caching mechanism. Handles Sprite limits, dimensions, and the famous Sprite Drop Bug.
     */
    updateSpriteCache() {
        if (!this.spriteRowCacheNeedsUpdating) return;
        this.spriteRowCacheNeedsUpdating = false;

        this.spriteRowCacheTotal.fill(0);

        const tileHeightShift = 3 + this.doubleResolutionEnabled;
        const screenHeightTiles = this.getScreenHeightInTiles();
        const maxSprites = this.h40Enabled ? 80 : 64;

        let spriteIndex = 0;
        let spritesRemaining = maxSprites;
        let spriteMask1 = maxSprites; // Variable to simulate Sega Genesis Sprite masking

        do {
            const cached_sprite = VDP_GetCachedSprite(this, spriteIndex);
            
            // Sega Genesis Sprite Drop/Mask Bug Implementation
            // A value of rawX = 128 (0x80) represents the physical horizontal coordinate 0 
            // after subtracting the standard 128px border-offset.
            const spriteTableBase = GetSpriteTableAddress(this) + (spriteIndex * 8);
            const rawX = this.readVRAMWord(spriteTableBase + 6) & 0x1FF;
            
            if (rawX === 128) {
                spriteMask1 = spriteIndex;
            }
            if (rawX === 127 && spriteMask1 !== maxSprites) {
                break; // Masking triggered, effectively dropping remaining sprites in link chain
            }

            const blankLines = 128 << this.doubleResolutionEnabled;
            const startY = Math.max(blankLines, cached_sprite.y);
            const endY = Math.min(blankLines + (screenHeightTiles << tileHeightShift), cached_sprite.y + (cached_sprite.height << tileHeightShift));

            for (let i = startY; i < endY; i++) {
                const rowIdx = i - blankLines;
                
                // Safeguard against out of bound access for massive off-screen sprites
                if (rowIdx >= 0 && rowIdx < 256) {
                    const rowTotal = this.spriteRowCacheTotal[rowIdx];

                    // Respect the Genesis hardware limit of Sprites per scanline
                    if (rowTotal < this.getScreenWidthInTilePairs()) {
                        const cacheIndex = (rowIdx * 20) + rowTotal;
                        
                        this.spriteRowCacheTableIdx[cacheIndex] = spriteIndex;
                        this.spriteRowCacheWidth[cacheIndex] = cached_sprite.width;
                        this.spriteRowCacheHeight[cacheIndex] = cached_sprite.height;
                        this.spriteRowCacheYInSprite[cacheIndex] = i - cached_sprite.y;

                        this.spriteRowCacheTotal[rowIdx]++;
                    }
                }
            }

            if (cached_sprite.link >= 80) break;
            spriteIndex = cached_sprite.link;
        } while (spriteIndex !== 0 && --spritesRemaining !== 0);
    }

    getVScroll(planeIndex, col) {
        if (this.vscrollMode === 0) {
            return this.vsramCache[planeIndex];
        } else {
            return this.vsram[planeIndex + (col * 2)];
        }
    }

    /**
     * Aligned with MDTracer: Generates a pre-flipped VRAM map during writes.
     * This avoids calculating horizontal/vertical flips pixel-by-pixel in the render loop.
     */
    pattern_chk(address) {
        const w_address = address & 0xFFFE;
        const w_val = (this.vRam[w_address] << 8) | this.vRam[w_address + 1]; 
        
        const w_val_h = ((w_val >> 12) & 0x000F)
                      | ((w_val >> 4) & 0x00F0)
                      | ((w_val << 4) & 0x0F00)
                      | ((w_val << 12) & 0xF000);

        const w_addr = (address & 0xFFE0) >> 1;
        const wx = (address & 0x0002) >> 1;
        const wy = (address & 0x001F) >> 2;

        const VRAM_DATASIZE = 32768;

        this.rendererVram[w_address >> 1] = w_val;

        if (wx === 0) {
            this.rendererVram[VRAM_DATASIZE + w_addr + (wy << 1) + 1] = w_val_h;
            this.rendererVram[(VRAM_DATASIZE * 2) + w_addr + ((7 - wy) << 1)] = w_val;
            this.rendererVram[(VRAM_DATASIZE * 3) + w_addr + ((7 - wy) << 1) + 1] = w_val_h;
        } else {
            this.rendererVram[VRAM_DATASIZE + w_addr + (wy << 1)] = w_val_h;
            this.rendererVram[(VRAM_DATASIZE * 2) + w_addr + ((7 - wy) << 1) + 1] = w_val;
            this.rendererVram[(VRAM_DATASIZE * 3) + w_addr + ((7 - wy) << 1)] = w_val_h;
        }
    }

    /**
     * High-fidelity, pixel-perfect scanline rendering engine translated from MDTracer.
     * Uses pre-flipped rendererVram memory map to draw sprites and backgrounds bug-free.
     */
    endScanline(scanline, scanlineRenderedCallback, callbackUserData) {
        const w_display_xsize = this.getScreenWidthInPixels();
        const w_scroll_xcell = 1 << this.planeWidthShift;
        const w_scroll_xsize_mask = (w_scroll_xcell << 3) - 1;
        const vscrollMask = this.vscrollMode === 1 ? 0x000F : 0xFFFF;

        const w_game_cmap = new Uint8Array(w_display_xsize);
        const w_game_primap = new Uint8Array(w_display_xsize);
        const w_game_shadowmap = new Uint8Array(w_display_xsize);

        const VRAM_DATASIZE = 32768;

        this.updateSpriteCache();

        // 1. Render Background Plane (Scroll B) Pixel-by-Pixel
        if (this.displayEnabled && !this.configPlanesDisabled[1]) {
            const hscrollTableAddress = this.hscrollAddress + ((scanline >> this.doubleResolutionEnabled) & this.hscrollMask) * 4;
            const hscrollB = this.readVRAMWord(hscrollTableAddress + 2) & 0x3FF;

            const w_view_xB = ((w_scroll_xcell << 3 << 2) - hscrollB) & w_scroll_xsize_mask;

            let w_view_x = w_view_xB;
            let w_view_dy = 0;
            let w_view_addr = 0;
            let w_view_dx = 8;
            let w_priority = 0;
            let w_palette = 0;
            let w_reverse = 0;
            let w_char = 0;
            let w_pic_addr = 0;
            let w_pic_w = 0;

            for (let wx = 0; wx < w_display_xsize; wx++) {
                if ((wx & vscrollMask) === 0) {
                    const w_view_y = this.getVScroll(1, wx >> 4) + scanline;
                    w_view_dy = w_view_y & 7;

                    const tileY = (w_view_y >> 3) & this.planeHeightBitmask;
                    w_view_addr = (this.planeBAddress >> 1) + ((tileY & this.planeHeightBitmask) * w_scroll_xcell);
                    w_view_dx = 8;
                }
                if (w_view_dx === 8) {
                    w_view_x &= w_scroll_xsize_mask;
                    w_view_dx = w_view_x & 7;

                    const w_val = this.rendererVram[w_view_addr + (w_view_x >> 3)];
                    w_priority = (w_val >> 15) & 1;
                    w_palette = ((w_val >> 13) & 3) << 4;
                    w_reverse = (w_val >> 11) & 3;
                    w_char = w_val & 0x07FF;

                    w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + (w_view_dy << 1));
                    w_pic_w = this.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                } else if ((w_view_dx & 3) === 0) {
                    w_pic_w = this.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                }

                const w_pic = (w_pic_w >> ((3 - (w_view_dx & 3)) << 2)) & 0x0F;

                if (w_pic !== 0) {
                    w_game_cmap[wx] = w_palette + w_pic;
                    w_game_primap[wx] = w_priority;
                }
                if (this.shadowHighlightEnabled) {
                    w_game_shadowmap[wx] = w_priority;
                }

                w_view_x += 1;
                w_view_dx += 1;
            }
        }

        // 2. Render Foreground Plane (Scroll A / Window) Pixel-by-Pixel
        if (this.displayEnabled) {
            const hscrollTableAddress = this.hscrollAddress + ((scanline >> this.doubleResolutionEnabled) & this.hscrollMask) * 4;
            const hscrollA = this.readVRAMWord(hscrollTableAddress + 0) & 0x3FF;

            const w_view_xA = ((w_scroll_xcell << 3 << 2) - hscrollA) & w_scroll_xsize_mask;

            let w_view_x = w_view_xA;
            let w_view_dy = 0;
            let w_view_addr = 0;
            let w_view_dx = 8;
            let w_priority = 0;
            let w_palette = 0;
            let w_reverse = 0;
            let w_char = 0;
            let w_pic_addr = 0;
            let w_pic_w = 0;

            const isWindowY = (scanline < this.windowVerticalBoundary) !== this.windowAlignedBottom;

            for (let wx = 0; wx < w_display_xsize; wx++) {
                const isWindowX = ((wx >> 4) < this.windowHorizontalBoundary) !== this.windowAlignedRight;
                const isWindowActive = (isWindowY || isWindowX) && !this.configWindowDisabled;

                if (isWindowActive) {
                    const win_view_dx = wx & 7;
                    if (win_view_dx === 0 || wx === 0) {
                        const tileX = (wx >> 3) & 0x3F;
                        const tileY = (scanline >> 3) & this.planeHeightBitmask;
                        const winTable = GetWindowPlaneTableAddress(this);
                        
                        const w_val = this.rendererVram[(winTable >> 1) + (tileY * w_scroll_xcell + tileX)];
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + ((scanline & 7) << 1));
                        w_pic_w = this.rendererVram[w_pic_addr + (win_view_dx >> 2)];
                    } else if ((win_view_dx & 3) === 0) {
                        w_pic_w = this.rendererVram[w_pic_addr + (win_view_dx >> 2)];
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const w_pic = (w_pic_w >> ((3 - (win_view_dx & 3)) << 2)) & 0x0F;

                        if (w_pic !== 0) {
                            w_game_cmap[wx] = w_palette + w_pic;
                            w_game_primap[wx] = w_priority;
                        }
                        if (this.shadowHighlightEnabled) {
                            w_game_shadowmap[wx] |= w_priority;
                        }
                    }
                    w_view_x += 1;
                    w_view_dx += 1;
                } else if (!this.configPlanesDisabled[0]) {
                    if ((wx & vscrollMask) === 0) {
                        const w_view_y = this.getVScroll(0, wx >> 4) + scanline;
                        w_view_dy = w_view_y & 7;

                        const tileY = (w_view_y >> 3) & this.planeHeightBitmask;
                        w_view_addr = (this.planeAAddress >> 1) + ((tileY & this.planeHeightBitmask) * w_scroll_xcell);
                        w_view_dx = 8;
                    }
                    if (w_view_dx === 8) {
                        w_view_x &= w_scroll_xsize_mask;
                        w_view_dx = w_view_x & 7;

                        const w_val = this.rendererVram[w_view_addr + (w_view_x >> 3)];
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + (w_view_dy << 1));
                        w_pic_w = this.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                    } else if ((w_view_dx & 3) === 0) {
                        w_pic_w = this.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const w_pic = (w_pic_w >> ((3 - (w_view_dx & 3)) << 2)) & 0x0F;

                        if (w_pic !== 0) {
                            w_game_cmap[wx] = w_palette + w_pic;
                            w_game_primap[wx] = w_priority;
                        }
                        if (this.shadowHighlightEnabled) {
                            w_game_shadowmap[wx] |= w_priority;
                        }
                    }
                    w_view_x += 1;
                    w_view_dx += 1;
                }
            }
        }

        // 3. Render Sprites Pixel-by-Pixel using pre-flipped cached VRAM words
        if (this.displayEnabled && !this.configSpritesDisabled) {
            const rowTotal = this.spriteRowCacheTotal[scanline];
            const rowOffset = scanline * 20;

            for (let i = rowTotal - 1; i >= 0; i--) {
                const spriteRowCacheEntryIdx = rowOffset + i;
                const tableIndex = this.spriteRowCacheTableIdx[spriteRowCacheEntryIdx];
                const width = this.spriteRowCacheWidth[spriteRowCacheEntryIdx];
                const height = this.spriteRowCacheHeight[spriteRowCacheEntryIdx];

                const spriteTableBase = GetSpriteTableAddress(this) + tableIndex * 8;
                const rawX = this.readVRAMWord(spriteTableBase + 6) & 0x1FF;
                const x = rawX - 0x80;

                const word = this.readVRAMWord(spriteTableBase + 4);
                
                const tileIndexBase = word & 0x7FF;
                const xFlip = (word & 0x0800) !== 0;
                const yFlip = (word & 0x1000) !== 0;

                const paletteLineMask = ((word >> 13) & 3) << 4;
                const w_priority = (word >> 15) & 1;

                const yInSpriteNonFlipped = this.spriteRowCacheYInSprite[spriteRowCacheEntryIdx];
                const yInSprite = yFlip ? (height * 8) - yInSpriteNonFlipped - 1 : yInSpriteNonFlipped;
                
                const pixelYInTile = yInSpriteNonFlipped & 7;

                const w_reverse = (xFlip ? 1 : 0) | (yFlip ? 2 : 0);
                const w_reverse_addr = VRAM_DATASIZE * w_reverse;

                for (let j = 0; j < width; j++) {
                    const w_render_xcell = !xFlip ? j : width - j - 1;
                    const w_char_cur = (tileIndexBase + (w_render_xcell * height) + Math.floor(yInSprite / 8)) & 0x7FF;

                    const w_row_addr = (w_reverse_addr + (w_char_cur << 4) + (pixelYInTile << 1)) | 0;

                    const screenX = x + (j * 8);
                    const w_start_x = Math.max(0, screenX);
                    const w_end_x = Math.min(w_display_xsize, screenX + 8);

                    if (w_start_x >= w_end_x) continue;

                    let w_pic_w = 0;
                    for (let w_posx = w_start_x; w_posx < w_end_x; w_posx++) {
                        const w_cx = w_posx - screenX;
                        if ((w_cx & 3) === 0 || w_posx === w_start_x) {
                            w_pic_w = this.rendererVram[w_row_addr + (w_cx >> 2)];
                        }

                        if (w_game_primap[w_posx] <= w_priority) {
                            const w_pic = (w_pic_w >> ((3 - (w_cx & 3)) << 2)) & 0x0F;

                            if (w_pic !== 0) {
                                const w_color = paletteLineMask + w_pic;
                                
                                // ALIGNED WITH HARDWARE: Special 15/16 palette 4 Shadow/Highlight transparent masking
                                if (this.shadowHighlightEnabled && (w_color === 0x3E || w_color === 0x3F)) {
                                    // These pixels do NOT write solid colors to the color map (remain transparent)
                                    // but apply the corresponding shadow or highlight factor to the background pixel.
                                    if (w_color === 0x3E) { // Color 15: Highlight
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map < 2) w_game_shadowmap[w_posx] = w_map + 1;
                                    } else { // Color 16: Shadow
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map > 0) w_game_shadowmap[w_posx] = w_map - 1;
                                    }
                                    this.spriteCollisionFlag = true;
                                } else {
                                    // Standard Sprite rendering
                                    if (!this.shadowHighlightEnabled) {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        this.spriteCollisionFlag = true;
                                    } else if (w_color === 0x3E) {
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map < 2) w_game_shadowmap[w_posx] = w_map + 1;
                                    } else if (w_color === 0x3F) {
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map > 0) w_game_shadowmap[w_posx] = w_map - 1;
                                    } else if ((w_color & 0x0F) === 0x0E) {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        w_game_shadowmap[w_posx] = 0x1000;
                                        this.spriteCollisionFlag = true;
                                    } else {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        w_game_shadowmap[w_posx] |= w_priority;
                                        this.spriteCollisionFlag = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        scanlineRenderedCallback(callbackUserData, scanline, w_game_cmap, w_game_shadowmap, w_display_xsize, this.getScreenHeightInTiles() * 8);
    }
}