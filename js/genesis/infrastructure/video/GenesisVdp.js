/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega Genesis Video Display Processor (VDP)
 * 
 * Emulates the custom Sega Genesis VDP chip. Handles plane mapping grids, 
 * sprite caching/sorting lists, window boundary locks, H32 / H40 resolution modes, 
 * and advanced hardware-level pixel priorities (Shadow / Highlight).
 * Aligned with MDTracer reference standards to ensure proper H-Blank status 
 * toggling and non-blocking register set commands.
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

const GENESIS_VDP_BLIT_NORMAL           = new Uint8Array(128 * 128);
const GENESIS_VDP_BLIT_SHADOW_HIGHLIGHT = new Uint8Array(128 * 128);
const GENESIS_VDP_BLIT_FORCED_LAYER     = new Uint8Array(128 * 128);

(function precomputeDepthTestTables() {
    for (let newPixel = 0; newPixel < 128; ++newPixel) {
        for (let oldPixel = 0; oldPixel < 128; ++oldPixel) {
            const oldPaletteLine = oldPixel & 0xF;
            const oldColourIdx = oldPixel & 0x3F;
            const oldPriority = (oldPixel & 0x40) !== 0;
            const oldNotShadowed = (oldPixel & 0x80) !== 0;

            const newPaletteLine = newPixel & 0xF;
            const newColourIdx = newPixel & 0x3F;
            const newPriority = (newPixel & 0x40) !== 0;
            const newNotShadowed = newPriority;

            const drawNewPixel = newPaletteLine !== 0 && (oldPaletteLine === 0 || !oldPriority || newPriority);

            let outputNormal = drawNewPixel ? newPixel : oldPixel;
            if (oldNotShadowed || newNotShadowed) {
                outputNormal |= 0x80; 
            }
            GENESIS_VDP_BLIT_NORMAL[(newPixel * 128) + oldPixel] = outputNormal;

            let outputSh = 0;
            if (drawNewPixel) {
                switch (newColourIdx) {
                    case 0x0E: case 0x1E: case 0x2E:
                        outputSh = newColourIdx | 0x00; 
                        break;
                    case 0x3E:
                        outputSh = oldColourIdx | (oldNotShadowed ? 0x80 : 0x00); 
                        break;
                    case 0x3F:
                        outputSh = oldColourIdx | 0x40; 
                        break;
                    default:
                        outputSh = newColourIdx | (newNotShadowed || oldNotShadowed ? 0x00 : 0x40);
                        break;
                }
            } else {
                outputSh = oldColourIdx | (oldNotShadowed ? 0x00 : 0x40);
            }
            GENESIS_VDP_BLIT_SHADOW_HIGHLIGHT[(newPixel * 128) + oldPixel] = outputSh;
            GENESIS_VDP_BLIT_FORCED_LAYER[(newPixel * 128) + oldPixel] = oldPixel & (newColourIdx | ~0x3F);
        }
    }
})();

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
        this.dmaMode = 0; 
        this.dmaSourceAddressHigh = 0;
        this.dmaSourceAddressLow = 0;
        this.dmaLength = 0;

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
        this.hIntInterval = 0;
        this.currentlyInVblank = true;
        this.hblankToggle = false; // Added to prevent infinite CPU wait loops
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
        this.hIntInterval = 0;
        this.currentlyInVblank = true;
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
     * Aligned with MDTracer to dynamically toggle H-Blank to prevent infinite CPU wait loops.
     */
    readControl() {
        this.accessWritePending = false;
        const fifoEmpty = 1;
        const vblankFlag = this.currentlyInVblank ? 1 : 0;
        
        // Active H-Blank Handshake Toggling (Guarantees infinite loop exits)
        this.hblankToggle = !this.hblankToggle;
        const hblankFlag = (this.currentlyInVblank || this.hblankToggle) ? 1 : 0;
        
        return 0x3400 | (fifoEmpty << 9) | (vblankFlag << 3) | (hblankFlag << 2);
    }

    updateFakeFIFO(value) {
        this.previousDataWrites[0] = this.previousDataWrites[1];
        this.previousDataWrites[1] = this.previousDataWrites[2];
        this.previousDataWrites[2] = this.previousDataWrites[3];
        this.previousDataWrites[3] = value & 0xFFFF;
    }

    writeData(value, colorUpdatedCallback, callbackUserData) {
        this.accessWritePending = false;
        this.updateFakeFIFO(value);

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
        } else {
            const reg = (value >> 8) & 0x1F;
            const data = value & 0xFF;

            this.accessSelectedBuffer = 4; 

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
                        if ((data & 0x80) !== 0) {
                            this.dmaSourceAddressHigh = data & 0x3F;
                            this.dmaMode = (data & 0x40) !== 0 ? 2 : 1; 
                        } else {
                            this.dmaSourceAddressHigh = data & 0x7F;
                            this.dmaMode = 0; 
                        }
                        break;
                }
            }
        }

        if (((this.accessCodeRegister & 0x20) !== 0) && this.dmaMode !== 1) {
            this.accessCodeRegister &= ~0x20; 

            const totalReads = this.dmaLength === 0 ? 0x10000 : this.dmaLength;
            dmaTransferBeginCallback(readCallbackUserData, totalReads, targetCycle);

            do {
                if (this.dmaMode === 0) { 
                    const addressWord = ((this.dmaSourceAddressHigh << 17) | (this.dmaSourceAddressLow << 1)) >>> 0;
                    const value = readCallback(readCallbackUserData, addressWord, targetCycle);
                    this.updateFakeFIFO(value);
                    this.writeAndIncrement(value, colorUpdatedCallback, callbackUserData);
                } else { 
                    this.writeVRAM(this.accessAddressRegister, this.readVRAM(this.dmaSourceAddressLow));
                    this.incrementAccessAddressRegister();
                }

                this.dmaSourceAddressLow = (this.dmaSourceAddressLow + 1) & 0xFFFF;
                this.dmaLength = (this.dmaLength - 1) & 0xFFFF;
            } while (this.dmaLength !== 0);
        }
    }

    // ========================================================================
    // SCANLINE RASTERIZER SEQUENCERS
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

    renderTilePair(pixelY, vramAddress, baseTileAddress, destBuffer, destPtr, blitTable) {
        const tileHeightShift = 3 + this.doubleResolutionEnabled;
        const tileHeightMask = (1 << tileHeightShift) - 1;
        const pixelYInTileUnflipped = pixelY & tileHeightMask;

        for (let i = 0; i < 2; i++) {
            const word = this.readVRAMWord(vramAddress + i * 2);
            const xFlip = (word & 0x800) !== 0;
            const yFlip = (word & 0x1000) !== 0;

            const pixelYInTile = yFlip ? pixelYInTileUnflipped ^ tileHeightMask : pixelYInTileUnflipped;
            const tileIdx = word & 0x7FF;

            const tileRowAddress = baseTileAddress + (((tileIdx << tileHeightShift) + pixelYInTile) << 2);

            const byteIndexXor = 1 ^ (xFlip ? 3 : 0);
            const shift1 = xFlip ? 0 : 4;
            const shift2 = 4 ^ shift1;

            const paletteLine = (word >> 13) & 3;
            const priority = (word >> 15) & 1;
            const basePixel = (priority << 6) | (paletteLine << 4);

            for (let j = 0; j < 4; j++) {
                const byte = this.vRam[(tileRowAddress + j) ^ byteIndexXor];

                const col1 = (byte >> shift1) & 0xF;
                const newPixel1 = basePixel | col1;
                destBuffer[destPtr] = blitTable[(newPixel1 * 128) + destBuffer[destPtr]];
                destPtr++;

                const col2 = (byte >> shift2) & 0xF;
                const newPixel2 = basePixel | col2;
                destBuffer[destPtr] = blitTable[(newPixel2 * 128) + destBuffer[destPtr]];
                destPtr++;
            }
        }
    }

    renderScrollingPlane(start, end, scanline, planeIndex, xOffset, destBuffer, blitLookupList) {
        const baseTileAddress = planeIndex === 0 ? (this.planeATileIndexRebase ? 0x10000 : 0) : (this.planeBTileIndexRebase ? 0x10000 : 0);
        const pitchShift = this.planeWidthShift;
        const widthMask = (1 << pitchShift) - 1;
        const heightMask = this.planeHeightBitmask;
        const tableAddress = planeIndex === 0 ? this.planeAAddress : this.planeBAddress;

        const tileHeightShift = 3 + this.doubleResolutionEnabled;

        const widescreenOffset = Math.ceil(this.configWidescreenTiles / 2);

        for (let i = start; i <= end && i < this.getExtendedScreenWidthInTilePairs() + 1; ++i) {
            let vscroll = 0;
            if (this.vscrollMode === 0) { 
                vscroll = this.vsramCache[planeIndex];
            } else { 
                vscroll = this.vsram[planeIndex + ((i - 1 - widescreenOffset) * 2) % 64];
            }

            const pixelY = vscroll + scanline;
            const clampedI = Math.max(start, i - 1);

            const tileX = ((xOffset + clampedI) * 2) & widthMask;
            const tileY = (pixelY >> tileHeightShift) & heightMask;
            const vramAddress = tableAddress + ((tileY << pitchShift) + tileX) * 2;

            let destPtr = i * 16;
            this.renderTilePair(pixelY, vramAddress, baseTileAddress, destBuffer, destPtr, blitLookupList);
        }
    }

    renderWindowPlane(start, end, scanline, destBuffer, blitLookupList) {
        const baseTileAddress = this.planeATileIndexRebase ? 0x10000 : 0;
        const tileY = scanline >> (3 + this.doubleResolutionEnabled);
        const pitchShift = 5 + this.h40Enabled;
        const widthMask = (1 << pitchShift) - 1;

        const tableAddressBase = GetWindowPlaneTableAddress(this); 
        const vramAddressBase = tableAddressBase + (tileY << pitchShift) * 2;
        
        const widescreenOffset = Math.ceil(this.configWidescreenTiles / 2) * 2;
        const tileXBase = (0 - widescreenOffset) & widthMask;

        for (let i = start; i < end && i < this.getExtendedScreenWidthInTilePairs(); ++i) {
            const vramAddress = vramAddressBase + ((tileXBase + i * 2) & widthMask) * 2;
            let destPtr = i * 16;
            this.renderTilePair(scanline, vramAddress, baseTileAddress, destBuffer, destPtr, blitLookupList);
        }
    }

    renderSprites(destBuffer, scanline) {
        const baseTileAddress = this.spriteTileIndexRebase ? 0x10000 : 0;
        const tileHeightShift = 3 + this.doubleResolutionEnabled;
        const tileHeightMask = (1 << tileHeightShift) - 1;

        const rowTotal = this.spriteRowCacheTotal[scanline];
        const rowOffset = scanline * 20;

        let pixelLimit = this.getExtendedScreenWidthInTilePairs() * 16;
        let masked = false;

        for (let i = 0; i < rowTotal; i++) {
            const spriteRowCacheEntryIdx = rowOffset + i;
            const tableIndex = this.spriteRowCacheTableIdx[spriteRowCacheEntryIdx];
            const width = this.spriteRowCacheWidth[spriteRowCacheEntryIdx];
            const height = this.spriteRowCacheHeight[spriteRowCacheEntryIdx];

            const tableOffset = GetSpriteTableAddress(this); 
            const spriteTableBase = tableOffset + tableIndex * 8;

            const rawX = this.readVRAMWord(spriteTableBase + 6) & 0x1FF;
            const widescreenOffsetPixels = Math.ceil(this.configWidescreenTiles / 2) * 16;
            const x = rawX + widescreenOffsetPixels;

            if (rawX === 0) {
                masked = this.allowSpriteMasking;
            } else {
                this.allowSpriteMasking = true;
            }

            if (masked || x + width * 8 <= 0x80 || x >= 0x80 + this.getExtendedScreenWidthInTiles() * 8) {
                if (pixelLimit <= width * 8) return;
                pixelLimit -= width * 8;
            } else {
                const word = this.readVRAMWord(spriteTableBase + 4);
                const tileIndexBase = word & 0x7FF;
                const xFlip = (word & 0x0800) !== 0;
                const yFlip = (word & 0x1000) !== 0;

                const paletteLineMask = (word >> 9) & 0x70;
                const byteIndexXor = 1 ^ (xFlip ? 3 : 0);

                const yInSpriteNonFlipped = this.spriteRowCacheYInSprite[spriteRowCacheEntryIdx];
                const yInSprite = yFlip ? (height << tileHeightShift) - yInSpriteNonFlipped - 1 : yInSpriteNonFlipped;
                const pixelYInTile = yInSprite & tileHeightMask;

                const shift1 = xFlip ? 0 : 4;
                const shift2 = 4 ^ shift1;

                for (let j = 0; j < width; j++) {
                    const xInSprite = xFlip ? width - j - 1 : j;
                    const tileIdx = tileIndexBase + (yInSprite >> tileHeightShift) + xInSprite * height;

                    const tileRowAddress = baseTileAddress + (((tileIdx << tileHeightShift) + pixelYInTile) << 2);

                    const screenX = x - 0x80 + (j * 8);

                    for (let k = 0; k < 4; k++) {
                        const byte = this.vRam[(tileRowAddress + k) ^ byteIndexXor];
                        
                        for (let l = 0; l < 2; l++) {
                            const shift = l === 0 ? shift1 : shift2;
                            const pixelIndex = screenX + (k * 2) + l;

                            if (pixelIndex >= 0 && pixelIndex < destBuffer.length) {
                                if ((destBuffer[pixelIndex] & 0xF) === 0) {
                                    const colorIdx = (byte >> shift) & 0xF;
                                    destBuffer[pixelIndex] = paletteLineMask | colorIdx;
                                }
                            }
                        }
                    }
                }
            }

            if (--pixelLimit === 0) return;
        }
        this.allowSpriteMasking = false;
    }

    renderForegroundPlane(left, right, scanline, destBuffer, windowPlane) {
        if (windowPlane && !this.configWindowDisabled) {
            this.renderWindowPlane(left, right, scanline, destBuffer, GENESIS_VDP_BLIT_NORMAL);
        } else {
            this.renderScrollPlane(left, right, scanline, destBuffer, 0);
        }
    }

    renderScrollPlane(left, right, scanline, destBuffer, planeIndex) {
        if (!this.configPlanesDisabled[planeIndex]) {
            const hscrollTableAddress = this.hscrollAddress + planeIndex * 2 + ((scanline >> this.doubleResolutionEnabled) & this.hscrollMask) * 4;
            const hscroll = this.readVRAMWord(hscrollTableAddress) + Math.ceil(this.configWidescreenTiles / 2) * 16;

            const scrollOffset = 16 - (hscroll % 16);
            const xOffset = -Math.floor(hscroll / 16);

            this.renderScrollingPlane(left, right, scanline, planeIndex, xOffset, destBuffer, GENESIS_VDP_BLIT_NORMAL);
        }
    }

    renderSpritePlane(destBuffer, spriteBuffer, blitLookup, leftPixels, rightPixels) {
        for (let i = leftPixels; i < rightPixels; i++) {
            destBuffer[i] = blitLookup[(spriteBuffer[i] * 128) + destBuffer[i]];
        }
    }

    renderForegroundAndSpritePlanes(scanline, destBuffer, spriteBuffer, windowPlane, scanlineRenderedCallback, callbackUserData) {
        const fullWindowLine = (scanline < this.windowVerticalBoundary) !== this.windowAlignedBottom;
        const widescreenOffsetPairs = Math.ceil(this.configWidescreenTiles / 2);
        
        const winHBoundary = this.windowHorizontalBoundary === 0 ? 0 : widescreenOffsetPairs + this.windowHorizontalBoundary;

        const left = fullWindowLine ? 0 : (this.windowAlignedRight === windowPlane ? winHBoundary : 0);
        const right = fullWindowLine ? (windowPlane ? this.getExtendedScreenWidthInTilePairs() : 0) : (this.windowAlignedRight === windowPlane ? this.getExtendedScreenWidthInTilePairs() : winHBoundary);

        const leftPixels = left * 16;
        const rightPixels = right * 16;

        if (left === right) return;

        if (this.displayEnabled) {
            if (!this.debugHideLayers) {
                this.renderForegroundPlane(left, right, scanline, destBuffer, windowPlane);

                if (this.shadowHighlightEnabled) {
                    this.renderSpritePlane(destBuffer, spriteBuffer, GENESIS_VDP_BLIT_SHADOW_HIGHLIGHT, leftPixels, rightPixels);
                } else {
                    this.renderSpritePlane(destBuffer, spriteBuffer, GENESIS_VDP_BLIT_NORMAL, leftPixels, rightPixels);
                }
            }
        }

        const inputExtraTilesInPixels = widescreenOffsetPairs * 16;
        const outputExtraTilesInPixels = this.configWidescreenTiles * 8;
        const xOffset = Math.floor((inputExtraTilesInPixels - outputExtraTilesInPixels) / 2);

        const outputWidth = this.getScreenWidthInPixels() + outputExtraTilesInPixels;
        const outputHeight = this.getScreenHeightInTiles() << (3 + this.doubleResolutionEnabled);

        const clampedLeft = Math.max(xOffset, Math.min(xOffset + outputWidth, leftPixels)) - xOffset;
        const clampedRight = Math.max(xOffset, Math.min(xOffset + outputWidth, rightPixels)) - xOffset;

        scanlineRenderedCallback(callbackUserData, scanline, destBuffer, clampedLeft, clampedRight, outputWidth, outputHeight);
    }

    endScanline(scanline, scanlineRenderedCallback, callbackUserData) {
        const bufferWidth = (2 + this.getExtendedScreenWidthInTilePairs()) * 16;
        
        const planeBuffer = new Uint8Array(bufferWidth);
        const spriteBuffer = new Uint8Array(bufferWidth);

        this.updateSpriteCache();

        if (!this.configSpritesDisabled) {
            this.renderSprites(spriteBuffer, scanline);
        }

        planeBuffer.fill(this.debugForcedLayer === 0 ? this.backgroundColour : 0x3F);

        if (this.displayEnabled && !this.debugHideLayers) {
            this.renderScrollPlane(0, this.getExtendedScreenWidthInTilePairs(), scanline, planeBuffer, 1);
        }

        this.renderForegroundAndSpritePlanes(scanline, planeBuffer, spriteBuffer, true, scanlineRenderedCallback, callbackUserData);
        this.renderForegroundAndSpritePlanes(scanline, planeBuffer, spriteBuffer, false, scanlineRenderedCallback, callbackUserData);
    }
}