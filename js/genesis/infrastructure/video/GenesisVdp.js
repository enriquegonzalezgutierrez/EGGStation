/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/infrastructure/video/GenesisVdp.js
 * 
 * Infrastructure Layer: Sega Genesis Video Display Processor (VDP)
 * 
 * Role:
 * Emulates the physical registers, memories (VRAM, CRAM, VSRAM), and I/O status 
 * ports of the custom Sega Genesis VDP chip.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Handles strictly hardware state 
 *   preservation, write ports decoding, and address registers increment calculations. 
 *   Delegates heavy scanline compositing to GenesisVdpRenderer and DMA transitions 
 *   to GenesisDmaController.
 */

class GenesisVdp {
    constructor() {
        // Physical hardware memories
        this.vRam = new Uint8Array(0x10000); 
        this.cram = new Uint16Array(64);     
        this.vsram = new Uint16Array(64);    
        this.vsramCache = new Uint16Array(2);

        // Hardware control registers (0x00 to 0x1F)
        this.regs = new Uint8Array(0x20);

        // Scanline Sprites bucket Cache
        this.spriteRowCacheTotal = new Uint8Array(256);
        this.spriteRowCacheTableIdx = new Uint8Array(256 * 20);
        this.spriteRowCacheYInSprite = new Uint8Array(256 * 20);
        this.spriteRowCacheWidth = new Uint8Array(256 * 20);
        this.spriteRowCacheHeight = new Uint8Array(256 * 20);

        this.spriteRowCacheNeedsUpdating = true;

        // Auto-increment and Port routing variables
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
        this.dmaRunning = false; 

        // 131,072-word pre-flipped tile cache (32768 words * 4 mirroring states)
        this.rendererVram = new Uint32Array(32768 * 4);
        this.g_pattern_chk = new Uint8Array(2048);

        // Base Layer memory addresses
        this.planeAAddress = 0;
        this.planeBAddress = 0;
        this.windowAddress = 0;
        this.spriteTableAddress = 0;
        this.hscrollAddress = 0;

        // Window Plane boundary lock states
        this.windowAlignedRight = false;
        this.windowAlignedBottom = false;
        this.windowHorizontalBoundary = 0;
        this.windowVerticalBoundary = 0;

        this.planeWidthShift = 5;
        this.planeHeightBitmask = 0x1F;

        // System Toggles
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

        this.previousDataWrites = new Uint16Array(4);

        // Diagnostic debugging hooks
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
        this.g_pattern_chk.fill(0);

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

        this.previousDataWrites.fill(0);

        this.configSpritesDisabled = false;
        this.configWindowDisabled = false;
        this.configPlanesDisabled.fill(0);
        this.configWidescreenTiles = 0;
    }

    /**
     * Standard 24-bit physical VRAM direct address mapping.
     */
    decodeVramAddress(address) {
        return address & 0xFFFF; 
    }

    readVRAM(address) { 
        return this.vRam[this.decodeVramAddress(address)]; 
    }

    writeVRAM(address, value) {
        const decoded = this.decodeVramAddress(address);

        if (decoded < 0x10000) {
            this.vRam[decoded] = value & 0xFF;
            
            // Delegates pattern check to specialized Renderer subsystem
            GenesisVdpRenderer.patternCheck(this, address);
            
            this.spriteRowCacheNeedsUpdating = true; 
        }
    }

    readVRAMWord(address) {
        const decoded = this.decodeVramAddress(address);
        return (this.vRam[decoded] << 8) | this.vRam[(decoded + 1) & 0xFFFF];
    }

    incrementAccessAddressRegister() {
        this.accessAddressRegister = (this.accessAddressRegister + this.accessIncrement) & 0x1FFFF;
    }

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

    readControl() {
        this.accessWritePending = false;
        const fifoEmpty = 0x200; 
        const vblankFlag = this.currentlyInVblank ? 0x08 : 0;
        
        this.hblankToggle = !this.hblankToggle;
        const hblankFlag = (this.currentlyInVblank || this.hblankToggle) ? 0x04 : 0;
        
        const vIntFlag = this.vIntPending ? 0x80 : 0;
        this.vIntPending = false; 
        
        const dmaFlag = this.dmaRunning ? 0x02 : 0; 
        
        return vIntFlag | 
               ((this.spriteCollisionFlag ? 1 : 0) << 5) | 
               vblankFlag | 
               hblankFlag | 
               dmaFlag |
               fifoEmpty; 
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

        if (this.dmaFillPending) {
            this.dmaFillPending = false;
            
            // Delegates VRAM/CRAM Fill to specialized DMA controller
            GenesisDmaController.runFill(this, value, colorUpdatedCallback, callbackUserData);
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
                    
                    // Delegates Memory-to-VDP DMA to specialized DMA controller
                    GenesisDmaController.runMemory(this, readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle);
                } else if (this.dmaMode === 2) { 
                    this.dmaFillPending = true;
                } else if (this.dmaMode === 3) { 
                    
                    // Delegates VRAM-to-VRAM Copy DMA to specialized DMA controller
                    GenesisDmaController.runCopy(this);
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
                case 2: 
                    // HARDWARE FIX: Mask 0x38 isolates the exact address lines of Scroll A Name Table
                    this.planeAAddress = (data & 0x38) << 10; 
                    break;
                case 3: 
                    // HARDWARE FIX: Mask 0x3E isolates the exact address lines of Window Name Table
                    this.windowAddress = (data & 0x3E) << 10; 
                    break;
                case 4: 
                    // HARDWARE FIX: Mask 0x07 isolates the exact address lines of Scroll B Name Table
                    this.planeBAddress = (data & 0x07) << 13; 
                    break;
                case 5: 
                    // HARDWARE FIX: Mask 0x7F isolates the exact address lines of the Sprite Attribute Table (SAT)
                    this.spriteTableAddress = (data & 0x7F) << 9; 
                    this.spriteRowCacheNeedsUpdating = true; 
                    break;
                case 6: this.spriteTileIndexRebase = (data & 0x20) !== 0; break;
                case 7: this.backgroundColour = data & 0x3F; break;
                case 10:
                    this.register0a = data; 
                    break;
                case 11:
                    this.vscrollMode = (data & 4) !== 0 ? 1 : 0;
                    this.hscrollMask = [0x00, 0xFF, 0xF8, 0xFF][data & 3]; 
                    break;
                case 12:
                    // HARDWARE FIX: Check Bit 0 (RS0) is the real hardware selector for H40 (320px) vs H32 (256px)
                    this.h40Enabled = (data & 0x01) !== 0;
                    this.shadowHighlightEnabled = (data & 0x08) !== 0;
                    this.doubleResolutionEnabled = ((data >> 1) & 3) === 3;
                    break;
                case 13: 
                    // HARDWARE FIX: Mask 0x3F isolates the exact address lines of the Horizontal Scroll Table
                    this.hscrollAddress = (data & 0x3F) << 10; 
                    break;
                case 14:
                    this.planeATileIndexRebase = (data & 0x01) !== 0;
                    this.planeBTileIndexRebase = (data & 0x10) !== 0 && this.planeATileIndexRebase;
                    break;
                case 15: this.accessIncrement = data; break;
                case 16: {
                    // HARDWARE FIX: Correctly decode width/height exponents (Reg 16) without fallthrough corruption
                    const wCode = data & 3;
                    const hCode = (data >> 4) & 3;
                    
                    this.planeWidthShift = (wCode === 0) ? 5 : (wCode === 1 ? 6 : 7);
                    
                    const heightTiles = (hCode === 0) ? 32 : (hCode === 1) ? 64 : 128;
                    this.planeHeightBitmask = heightTiles - 1;
                    break;
                }
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
     * Resolves vertical scroll registers with column alignment.
     * BUGFIX: Replaced (col * 2) multiplication with (col & ~1) bitmasking to 
     * correctly map interleaved Plane A / Plane B 16-pixel column channels 
     * and prevent memory out-of-bounds heap reading.
     */
    getVScroll(planeIndex, col) {
        if (this.vscrollMode === 0) {
            return this.vsramCache[planeIndex];
        } else {
            return this.vsram[((col & ~1) + planeIndex) & 0x3F];
        }
    }

    /**
     * Delegates scanline composition to the specialized VdpRenderer subsystem.
     */
    endScanline(scanline, scanlineRenderedCallback, callbackUserData) {
        GenesisVdpRenderer.renderScanline(this, scanline, scanlineRenderedCallback);
    }

    /**
     * Generates active 4bpp VRAM pattern tiles.
     * FIX: Restored check for local properties rather than missing "this.vdp" reference.
     */
    rasterizeVramTiles(ctx) {
        const vram = this.vRam;
        if (!vram) return;
        const imgData = ctx.createImageData(128, 192); 

        for (let tileIdx = 0; tileIdx < 384; tileIdx++) {
            const tileX = tileIdx % 16;
            const tileY = Math.floor(tileIdx / 16);
            const destBaseX = tileX * 8;
            const destBaseY = tileY * 8;

            for (let row = 0; row < 8; row++) {
                const rowAddr = tileIdx * 32 + row * 4;
                for (let col = 0; col < 8; col++) {
                    const byteOffset = rowAddr + Math.floor(col / 2);
                    const byte = vram[byteOffset & 0xFFFF];
                    
                    const pixelNibble = (col % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                    const rgb = pixelNibble * 17;
                    const destIdx = ((destBaseX + col) + ((destBaseY + row) * 128)) * 4;

                    imgData.data[destIdx] = rgb;
                    imgData.data[destIdx + 1] = rgb;
                    imgData.data[destIdx + 2] = rgb;
                    imgData.data[destIdx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // ========================================================================
    // ENCAPSULATED STATE SERIALIZATION (SOLID)
    // ========================================================================

    serializeState() {
        return {
            regs: Array.from(this.regs),
            vram: Array.from(this.vRam),
            cram: Array.from(this.cram),
            vsram: Array.from(this.vsram)
        };
    }

    deserializeState(state) {
        if (!state) return;
        this.regs.set(state.regs);
        this.vRam.set(state.vram);
        this.cram.set(state.cram);
        this.vsram.set(state.vsram);
        this.spriteRowCacheNeedsUpdating = true; // Invalidate cache immediately on state load
    }
}