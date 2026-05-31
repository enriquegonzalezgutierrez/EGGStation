/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega Genesis Video Display Processor (VDP)
 * 
 * Emulates the custom Sega Genesis VDP chip. Handles plane mapping grids, 
 * sprite caching/sorting lists, window boundary locks, H32 / H40 resolution modes, 
 * and advanced hardware-level pixel priorities (Shadow / Highlight).
 * Aligned with MDTracer reference standards to ensure proper H-Blank status 
 * toggling, V-Interrupt flag clearing, and pixel-perfect line-by-line rendering.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates the complex 2D scanline compositing 
 *   and priority-testing arithmetic from host system memory buses and timings.
 * - Open/Closed Principle (OCP): Supports custom screen sizing multipliers and 
 *   arbitrary resolution layers without altering the core tile rasterizer logic.
 */

// ========================================================================
// SEGA GENESIS VDP LOW-LEVEL UTILITY PORTED HELPER FUNCTIONS
// ========================================================================

function GetSpriteTableAddress(state) {
    const mask = ~(0x1FF) << (state.h40Enabled ? 1 : 0);
    return (state.spriteTableAddress & mask) >>> 0;
}

function GetWindowPlaneTableAddress(state) {
    const mask = ~(0x7FF) << (state.h40Enabled ? 1 : 0);
    return (state.windowAddress & mask) >>> 0;
}

function VDP_GetCachedSprite(state, spriteIndex) {
    const cacheOffset = spriteIndex * 4;
    const bytes = state.spriteTableCache;

    const y = (bytes[cacheOffset] | ((bytes[cacheOffset + 1] & 3) << 8)) & (state.doubleResolutionEnabled ? 0x3FF : 0x1FF);
    const link = bytes[cacheOffset + 2] & 0x7F;
    const width = ((bytes[cacheOffset + 3] >> 2) & 3) + 1;
    const height = (bytes[cacheOffset + 3] & 3) + 1;

    return { y, link, width, height };
}

class GenesisVdp {
    constructor() {
        this.vRam = new Uint8Array(0x10000); 
        this.cram = new Uint16Array(64);     
        this.vsram = new Uint16Array(64);    
        this.vsramCache = new Uint16Array(2);

        this.spriteTableCache = new Uint8Array(128 * 4); 

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

        this.dmaEnabled = false;
        this.dmaMode = 0; // 0/1 = Memory-to-VRAM, 2 = VRAM Fill, 3 = VRAM Copy
        this.dmaSourceAddressHigh = 0;
        this.dmaSourceAddressLow = 0;
        this.dmaLength = 0;
        this.dmaFillPending = false; // Flag to wait for fill byte to write to data port

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
        this.vIntPending = false;  // Aligned with MDTracer's V-Interrupt occurred/pending flag (Bit 7)
        this.hblankToggle = false; // Prevents infinite CPU execution wait loops
        this.allowSpriteMasking = false;

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

    initialise() {
        this.vRam.fill(0);
        this.cram.fill(0);
        this.vsram.fill(0);
        this.vsramCache.fill(0);
        this.spriteTableCache.fill(0);

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
        this.register0a = 0; // Reset reload interval state
        this.hIntInterval = 0;
        
        this.currentlyInVblank = true;
        this.vIntPending = false;  // Reset V-Int pending status
        this.hblankToggle = false;
        this.allowSpriteMasking = false;

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

    decodeVramAddress(address) {
        if (this.extendedVramEnabled) {
            return (((address & 0x1F802) >> 1) | ((address & 0x400) >> 9) | (address & 0x3FC) | ((address & 1) << 16)) ^ 1;
        }
        return (address & 0xFFFF) ^ 1; 
    }

    readVRAM(address) { return this.vRam[this.decodeVramAddress(address)]; }

    writeVRAM(address, value) {
        const decoded = this.decodeVramAddress(address);
        const spriteTableIndex = address - GetSpriteTableAddress(this);
        const maxTiles = this.getExtendedScreenWidthInTiles();
        
        if (spriteTableIndex >= 0 && spriteTableIndex < maxTiles * 16 && (spriteTableIndex & 4) === 0) {
            const cacheOffset = Math.floor(spriteTableIndex / 8) * 4;
            const subByteIdx = spriteTableIndex & 3;
            this.spriteTableCache[cacheOffset + subByteIdx] = value & 0xFF;
            this.spriteRowCacheNeedsUpdating = true;
        }

        if (decoded < 0x10000) {
            this.vRam[decoded] = value & 0xFF;
        }
    }

    readVRAMWord(address) {
        return this.vRam[this.decodeVramAddress(address) ^ 0] | (this.vRam[this.decodeVramAddress(address) ^ 1] << 8);
    }

    incrementAccessAddressRegister() {
        this.accessAddressRegister = (this.accessAddressRegister + this.accessIncrement) & 0x1FFFF;
    }

    writeAndIncrement(value, colorUpdatedCallback, callbackUserData) {
        switch (this.accessSelectedBuffer) {
            case 0: 
                this.writeVRAM(this.accessAddressRegister ^ 0, value & 0xFF);
                this.writeVRAM(this.accessAddressRegister ^ 1, (value >> 8) & 0xFF);
                break;

            case 1: { 
                const color = value & 0xEEE;
                const cramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                this.cram[cramIdx] = color;

                const normalColor = color | ((color & 0x888) >> 3);
                const shadowColor = color >> 1;
                const highlightColor = 0x888 + (color >> 1);

                colorUpdatedCallback(callbackUserData, 0x000 + cramIdx, normalColor);
                colorUpdatedCallback(callbackUserData, 0x040 + cramIdx, shadowColor);
                colorUpdatedCallback(callbackUserData, 0x080 + cramIdx, highlightColor);
                break;
            }

            case 2: { 
                const vsramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                if (vsramIdx < 40) {
                    const vscroll = value & 0x7FF;
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
            case 0: 
                value = this.readVRAMWord(wordAddress * 2);
                break;

            case 1: 
                value = (value & ~0xEEE) | this.cram[wordAddress % 64];
                break;

            case 2: 
                value = (value & ~0x7FF) | this.vsram[wordAddress % 64];
                break;

            case 3: 
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
     * Aligned with MDTracer to handle V-Int pending status (Bit 7) and H-Blank handshake.
     */
    readControl() {
        this.accessWritePending = false;
        const fifoEmpty = 1;
        const vblankFlag = this.currentlyInVblank ? 1 : 0;
        
        // Active H-Blank Handshake Toggling (Guarantees infinite loop exits)
        this.hblankToggle = !this.hblankToggle;
        const hblankFlag = (this.currentlyInVblank || this.hblankToggle) ? 1 : 0;
        
        // FIX: Read and clear V-Int Pending flag (Bit 7). 
        // Reading the status register on Sega hardware always clears the pending V-Int signal!
        const vIntFlag = this.vIntPending ? 1 : 0;
        this.vIntPending = false; 
        
        return 0x3400 | (vIntFlag << 7) | (fifoEmpty << 9) | (vblankFlag << 3) | (hblankFlag << 2);
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

    /**
     * Performs an authentic word-aligned Memory-to-VDP DMA transfer (Mode 0 / 1).
     */
    dmaRunMemory(readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle) {
        const dmaCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        let sourceAddr = ((this.dmaSourceAddressHigh << 16) | this.dmaSourceAddressLow) << 1;
        let loopCount = dmaCount;

        do {
            const value = readCallback(readCallbackUserData, sourceAddr, targetCycle);
            this.writeAndIncrement(value, colorUpdatedCallback, callbackUserData);

            sourceAddr = (sourceAddr + 2) & 0xFFFFFF;
        } while (--loopCount > 0);

        // Update registers with final address state
        this.dmaSourceAddressLow = (sourceAddr >> 1) & 0xFFFF;
        this.dmaSourceAddressHigh = (sourceAddr >> 17) & 0x3F;
        this.dmaLength = 0;
    }

    /**
     * Performs a byte-aligned VDP VRAM Fill (Mode 2).
     */
    dmaRunFill(value, colorUpdatedCallback, callbackUserData) {
        let loopCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        const fillByteLow = value & 0xFF;
        const fillByteHigh = (value >> 8) & 0xFF;

        if (this.accessSelectedBuffer === 0) { // VRAM Fill
            this.writeVRAM(this.accessAddressRegister, fillByteLow);
            do {
                this.writeVRAM(this.accessAddressRegister ^ 1, fillByteHigh);
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (this.accessSelectedBuffer === 1) { // CRAM Fill
            do {
                const cramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                this.cram[cramIdx] = value;
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (this.accessSelectedBuffer === 2) { // VSRAM Fill
            do {
                const vsramIdx = Math.floor(this.accessAddressRegister / 2) % 64;
                if (vsramIdx < 40) {
                    this.vsram[vsramIdx] = value;
                }
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        this.dmaLength = 0;
    }

    /**
     * Performs a byte-aligned VDP VRAM-to-VRAM Copy (Mode 3).
     */
    dmaRunCopy() {
        let loopCount = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
        let sourceAddr = ((this.dmaSourceAddressHigh << 16) | this.dmaSourceAddressLow) & 0xFFFF;

        if (this.accessSelectedBuffer === 0) { // VRAM Copy
            do {
                const val = this.readVRAM(sourceAddr);
                this.writeVRAM(this.accessAddressRegister, val);
                sourceAddr = (sourceAddr + 1) & 0xFFFF;
                this.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        this.dmaLength = 0;
    }

    writeData(value, colorUpdatedCallback, callbackUserData) {
        this.accessWritePending = false;
        this.updateFakeFIFO(value);

        // Handle delayed VRAM Fill (Mode 2) execution on data port write,
        // mirroring authentic Sega Genesis hardware protocols.
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

            // Removed the restrictive 'if (this.dmaEnabled)' check.
            // Under authentic Genesis hardware rules, writing a DMA command to the control register
            // triggers DMA transfer immediately on write, even if DMA enable bit in Reg 1 is not set.
            if ((this.accessCodeRegister & 0x20) !== 0) {
                this.accessCodeRegister &= ~0x20;

                if (this.dmaMode === 0 || this.dmaMode === 1) { // Memory-to-VRAM DMA
                    dmaTransferBeginCallback(readCallbackUserData, this.dmaLength, targetCycle);
                    this.dmaRunMemory(readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle);
                } else if (this.dmaMode === 2) { // VRAM Fill Pending
                    this.dmaFillPending = true;
                } else if (this.dmaMode === 3) { // VRAM-to-VRAM Copy
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

    /**
     * Resolves and updates internal VDP register configurations.
     * Segregated to comply with the Single Responsibility Principle.
     */
    setRegister(reg, data) {
        if (reg <= 10 || this.megaDriveModeEnabled) {
            switch (reg) {
                case 0:
                    this.hIntEnabled = (data & 0x10) !== 0;
                    break;

                case 1:
                    this.extendedVramEnabled = (data & 0x80) !== 0;
                    this.displayEnabled = (data & 0x40) !== 0;
                    this.vIntEnabled = (data & 0x20) !== 0;
                    this.dmaEnabled = (data & 0x10) !== 0;
                    this.v30Enabled = (data & 0x08) !== 0;
                    this.megaDriveModeEnabled = (data & 0x04) !== 0;
                    break;

                case 2:
                    this.planeAAddress = (data & 0x78) << 10;
                    break;

                case 3:
                    this.windowAddress = (data & 0x7E) << 10;
                    break;

                case 4:
                    this.planeBAddress = (data & 0x0F) << 13;
                    break;

                case 5:
                    this.spriteTableAddress = data << 9;
                    break;

                case 6:
                    this.spriteTileIndexRebase = (data & 0x20) !== 0;
                    break;

                case 7:
                    this.backgroundColour = data & 0x3F;
                    break;

                case 10:
                    this.hIntInterval = data;
                    this.register0a = data; // Keep reload backup synced with written interval data
                    break;

                case 11:
                    this.vscrollMode = (data & 4) !== 0 ? 1 : 0;
                    this.hscrollMask = [0x00, 0x07, 0xF8, 0xFF][data & 3];
                    break;

                case 12:
                    this.h40Enabled = (data & 0x81) !== 0;
                    this.shadowHighlightEnabled = (data & 0x08) !== 0;
                    this.doubleResolutionEnabled = ((data >> 1) & 3) === 3;
                    break;

                case 13:
                    this.hscrollAddress = (data & 0x7F) << 10;
                    break;

                case 14:
                    this.planeATileIndexRebase = (data & 0x01) !== 0;
                    this.planeBTileIndexRebase = (data & 0x10) !== 0 && this.planeATileIndexRebase;
                    break;

                case 15:
                    this.accessIncrement = data;
                    break;

                case 16:
                    this.planeHeightBitmask = (data << 1) | 0x1F;
                    switch (data & 3) {
                        case 0:
                            this.planeWidthShift = 5;
                            this.planeHeightBitmask &= 0x7F;
                            break;
                        case 1:
                            this.planeWidthShift = 6;
                            this.planeHeightBitmask &= 0x3F;
                            break;
                        case 2:
                            this.planeWidthShift = 5;
                            this.planeHeightBitmask &= 0;
                            break;
                        case 3:
                            this.planeWidthShift = 7;
                            this.planeHeightBitmask &= 0x1F;
                            break;
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

                case 19:
                    this.dmaLength = (this.dmaLength & 0xFF00) | data;
                    break;

                case 20:
                    this.dmaLength = (this.dmaLength & 0x00FF) | (data << 8);
                    break;

                case 21:
                    this.dmaSourceAddressLow = (this.dmaSourceAddressLow & 0xFF00) | data;
                    break;

                case 22:
                    this.dmaSourceAddressLow = (this.dmaSourceAddressLow & 0x00FF) | (data << 8);
                    break;

                case 23:
                    // FIX: Direct alignment with MDTracer's 23-5 DMA high source mask logic.
                    // If bit 7 of register 23 is 0, the source maps 7 bits of ROM address (0x7F).
                    // If bit 7 is 1, it maps 6 bits (0x3F).
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

    // ========================================================================
    // SCANLINE RASTERIZER SEQUENCERS (MDTRACER PIXEL-PERFECT PORT)
    // ========================================================================
    beginScanline() {
        this.vsramCache[0] = this.vsram[0];
        this.vsramCache[1] = this.vsram[1];
    }

    updateSpriteCache() {
        if (!this.spriteRowCacheNeedsUpdating) return;
        this.spriteRowCacheNeedsUpdating = false;

        this.spriteRowCacheTotal.fill(0);

        const tileHeightShift = 3 + this.doubleResolutionEnabled;
        const screenHeightTiles = this.getScreenHeightInTiles();
        const maxSprites = this.h40Enabled ? 80 : 64;

        let spriteIndex = 0;
        let spritesRemaining = maxSprites;

        do {
            const cached_sprite = VDP_GetCachedSprite(this, spriteIndex);

            const blankLines = 128 << this.doubleResolutionEnabled;
            const startY = Math.max(blankLines, cached_sprite.y);
            const endY = Math.min(blankLines + (screenHeightTiles << tileHeightShift), cached_sprite.y + (cached_sprite.height << tileHeightShift));

            for (let i = startY; i < endY; i++) {
                const rowIdx = i - blankLines;
                const rowTotal = this.spriteRowCacheTotal[rowIdx];

                if (rowTotal < this.getScreenWidthInTilePairs()) {
                    const cacheIndex = (rowIdx * 20) + rowTotal;
                    
                    this.spriteRowCacheTableIdx[cacheIndex] = spriteIndex;
                    this.spriteRowCacheWidth[cacheIndex] = cached_sprite.width;
                    this.spriteRowCacheHeight[cacheIndex] = cached_sprite.height;
                    this.spriteRowCacheYInSprite[cacheIndex] = i - cached_sprite.y;

                    this.spriteRowCacheTotal[rowIdx]++;
                }
            }

            if (cached_sprite.link >= maxSprites) break;
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
     * High-fidelity, pixel-perfect scanline rendering engine translated from MDTracer.
     * Replaces previous staggered tile-chunk methods.
     */
    endScanline(scanline, scanlineRenderedCallback, callbackUserData) {
        const w_display_xsize = this.getScreenWidthInPixels();
        const w_scroll_xcell = 1 << this.planeWidthShift;
        const w_scroll_xsize_mask = (w_scroll_xcell << 3) - 1;
        const vscrollMask = this.vscrollMode === 1 ? 0x000F : 0xFFFF;

        const w_game_cmap = new Uint8Array(w_display_xsize);
        const w_game_primap = new Uint8Array(w_display_xsize);
        const w_game_shadowmap = new Uint8Array(w_display_xsize);

        this.updateSpriteCache();

        // 1. Render Background Plane (Scroll B) Pixel-by-Pixel
        if (this.displayEnabled && !this.configPlanesDisabled[1]) {
            const hscrollTableAddress = this.hscrollAddress + 2 + ((scanline >> this.doubleResolutionEnabled) & this.hscrollMask) * 4;
            const hscrollB = this.readVRAMWord(hscrollTableAddress);

            let w_view_x = hscrollB;
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
                    w_view_addr = this.planeBAddress + (tileY << this.planeWidthShift) * 2;
                    w_view_dx = 8;
                }
                if (w_view_dx === 8) {
                    w_view_x &= w_scroll_xsize_mask;
                    w_view_dx = w_view_x & 7;

                    const w_val = this.readVRAMWord(w_view_addr + (w_view_x >> 3) * 2);
                    w_priority = (w_val >> 15) & 1;
                    w_palette = ((w_val >> 13) & 3) << 4;
                    w_reverse = (w_val >> 11) & 3;
                    w_char = w_val & 0x07FF;

                    const yFlip = (w_reverse & 2) !== 0;
                    const pixelYInTile = yFlip ? w_view_dy ^ 7 : w_view_dy;
                    w_pic_addr = (this.planeBTileIndexRebase ? 0x10000 : 0) + (w_char << 5) + (pixelYInTile << 2);
                    
                    w_pic_w = this.readVRAMWord(w_pic_addr + (w_view_dx >= 4 ? 2 : 0));
                } else if ((w_view_dx & 3) === 0) {
                    w_pic_w = this.readVRAMWord(w_pic_addr + (w_view_dx >= 4 ? 2 : 0));
                }

                const xFlip = (w_reverse & 1) !== 0;
                const shift = xFlip ? (w_view_dx & 3) * 4 : (3 - (w_view_dx & 3)) * 4;
                const w_pic = (w_pic_w >> shift) & 0x0F;

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
            const hscrollTableAddress = this.hscrollAddress + 0 + ((scanline >> this.doubleResolutionEnabled) & this.hscrollMask) * 4;
            const hscrollA = this.readVRAMWord(hscrollTableAddress);

            let w_view_x = hscrollA;
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
                    // --- Window Plane (Non-scrolling static overlay) ---
                    const win_view_dx = wx & 7;
                    if (win_view_dx === 0 || wx === 0) {
                        const tileX = (wx >> 3) & 0x3F;
                        const tileY = (scanline >> 3) & this.planeHeightBitmask;
                        const winTable = GetWindowPlaneTableAddress(this);
                        const w_val = this.readVRAMWord(winTable + (tileY * w_scroll_xcell + tileX) * 2);
                        
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        const yFlip = (w_reverse & 2) !== 0;
                        const pixelYInTile = yFlip ? (scanline & 7) ^ 7 : (scanline & 7);
                        w_pic_addr = (this.planeATileIndexRebase ? 0x10000 : 0) + (w_char << 5) + (pixelYInTile << 2);
                        w_pic_w = this.readVRAMWord(w_pic_addr + (win_view_dx >= 4 ? 2 : 0));
                    } else if ((win_view_dx & 3) === 0) {
                        w_pic_w = this.readVRAMWord(w_pic_addr + (win_view_dx >= 4 ? 2 : 0));
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const xFlip = (w_reverse & 1) !== 0;
                        const shift = xFlip ? (win_view_dx & 3) * 4 : (3 - (win_view_dx & 3)) * 4;
                        const w_pic = (w_pic_w >> shift) & 0x0F;

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
                    // --- Scroll A Plane ---
                    if ((wx & vscrollMask) === 0) {
                        const w_view_y = this.getVScroll(0, wx >> 4) + scanline;
                        w_view_dy = w_view_y & 7;

                        const tileY = (w_view_y >> 3) & this.planeHeightBitmask;
                        w_view_addr = this.planeAAddress + (tileY << this.planeWidthShift) * 2;
                        w_view_dx = 8;
                    }
                    if (w_view_dx === 8) {
                        w_view_x &= w_scroll_xsize_mask;
                        w_view_dx = w_view_x & 7;

                        const w_val = this.readVRAMWord(w_view_addr + (w_view_x >> 3) * 2);
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        const yFlip = (w_reverse & 2) !== 0;
                        const pixelYInTile = yFlip ? w_view_dy ^ 7 : w_view_dy;
                        w_pic_addr = (this.planeATileIndexRebase ? 0x10000 : 0) + (w_char << 5) + (pixelYInTile << 2);
                        w_pic_w = this.readVRAMWord(w_pic_addr + (w_view_dx >= 4 ? 2 : 0));
                    } else if ((w_view_dx & 3) === 0) {
                        w_pic_w = this.readVRAMWord(w_pic_addr + (w_view_dx >= 4 ? 2 : 0));
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const xFlip = (w_reverse & 1) !== 0;
                        const shift = xFlip ? (w_view_dx & 3) * 4 : (3 - (w_view_dx & 3)) * 4;
                        const w_pic = (w_pic_w >> shift) & 0x0F;

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

        // 3. Render Sprites Pixel-by-Pixel
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
                const pixelYInTile = yInSprite & 7;

                for (let j = 0; j < width; j++) {
                    const xInSprite = xFlip ? width - j - 1 : j;
                    const tileIdx = tileIndexBase + (Math.floor(yInSprite / 8)) + xInSprite * height;
                    const tileRowAddress = (this.spriteTileIndexRebase ? 0x10000 : 0) + (tileIdx << 5) + (pixelYInTile << 2);

                    const screenX = x + (j * 8);

                    for (let k = 0; k < 8; k++) {
                        const pixelIndex = screenX + k;
                        if (pixelIndex >= 0 && pixelIndex < w_display_xsize) {
                            if (w_game_primap[pixelIndex] <= w_priority) {
                                const w_pic_w = this.readVRAMWord(tileRowAddress + (k >= 4 ? 2 : 0));
                                const shift = xFlip ? (k & 3) * 4 : (3 - (k & 3)) * 4;
                                const w_pic = (w_pic_w >> shift) & 0x0F;

                                if (w_pic !== 0) {
                                    const w_color = paletteLineMask + w_pic;
                                    
                                    if (!this.shadowHighlightEnabled) {
                                        w_game_cmap[pixelIndex] = w_color;
                                        w_game_primap[pixelIndex] = w_priority;
                                        this.g_vdp_status_5_collision = 1;
                                    } else if (w_color === 0x3E) {
                                        const w_map = w_game_shadowmap[pixelIndex];
                                        if (w_map < 2) w_game_shadowmap[pixelIndex] = w_map + 1;
                                    } else if (w_color === 0x3F) {
                                        const w_map = w_game_shadowmap[pixelIndex];
                                        if (w_map > 0) w_game_shadowmap[pixelIndex] = w_map - 1;
                                    } else if ((w_color & 0x0F) === 0x0E) {
                                        w_game_cmap[pixelIndex] = w_color;
                                        w_game_primap[pixelIndex] = w_priority;
                                        w_game_shadowmap[pixelIndex] = 0x1000;
                                        this.g_vdp_status_5_collision = 1;
                                    } else {
                                        w_game_cmap[pixelIndex] = w_color;
                                        w_game_primap[pixelIndex] = w_priority;
                                        w_game_shadowmap[pixelIndex] |= w_priority;
                                        this.g_vdp_status_5_collision = 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Dispatch Rendered Scanline back to Orchestrator
        scanlineRenderedCallback(callbackUserData, scanline, w_game_cmap, w_game_shadowmap, w_display_xsize, this.getScreenHeightInTiles() * 8);
    }
}