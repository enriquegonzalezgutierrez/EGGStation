/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuSpriteEvaluator (OBJ/Sprite Sorting and Evaluation Processor with Timing)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles the complete sprite (OBJ) processing pipeline of the SNES PPU.
 * It traverses the Object Attribute Memory (OAM), checks if sprites lie on the 
 * current scanline, calculates horizontal/vertical flipping, decodes the sprite 
 * palette, and writes pixels directly to the PPU line buffers.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles hardware sprite sorting, boundaries, and line-buffering.
 */

class SnesPpuSpriteEvaluator {
    /**
     * Evaluates all active sprites for the requested visible scanline.
     * Writes pixel index values directly to ppu.spriteLineBuffer and priorities 
     * to ppu.spritePrioBuffer to achieve GC-Free rendering.
     * @param {SnesPpu} ppu - Active PPU instance.
     * @param {number} line - Active visible scanline.
     */
    static evaluate(ppu, line) {
        // Safe high-resolution timing capture of the Sprite Processor
        const t0 = performance.now();

        let spriteCount = 0;
        let sliverCount = 0;
        
        // Cache PPU state configurations to minimize object property lookup overhead in the loop
        const oam = ppu.oam;
        const vram = ppu.vram;
        const highOam = ppu.highOam;
        const spriteLineBuffer = ppu.spriteLineBuffer;
        const spritePrioBuffer = ppu.spritePrioBuffer;
        const objPriority = ppu.objPriority;
        const objSize = ppu.objSize;
        const objInterlace = ppu.objInterlace;
        const evenFrame = ppu.evenFrame;
        const sprAdr1 = ppu.sprAdr1;
        const sprAdr2 = ppu.sprAdr2;

        // Resolve sprite priority index from OAM start registers
        let index = objPriority ? ((ppu.oamAdr & 0xfe) - 2) & 0xff : 254;

        // SNES supports up to 128 active sprites in OAM
        for (let i = 0; i < 128; i++) {
            let x = oam[index] & 0xff;
            const y = (oam[index] & 0xff00) >> 8;
            const tile = oam[index + 1] & 0xff;
            const ex = (oam[index + 1] & 0xff00) >> 8;
            
            // Append 9th X bit and size bit from Cached High OAM
            const highWord = highOam[index >> 4];
            const shiftAmount = index & 0xf;
            x |= ((highWord >> shiftAmount) & 0x1) << 8;
            const big = ((highWord >> shiftAmount) & 0x2) > 0;
            
            // Cast unsigned 9-bit X coordinate to signed integer
            x = x > 255 ? -(512 - x) : x;

            // Resolve physical sprite size (typically 8x8 up to 64x64)
            const size = SnesPpuMathUnit.SPRITE_SIZES[objSize + (big ? 8 : 0)];
            let sprRow = line - y;
            
            // Handle vertical wrap-around
            const interlaceFactor = objInterlace ? 4 : 8;
            if (sprRow < 0 || sprRow >= size * interlaceFactor) {
                sprRow = line + (256 - y);
            }

            // If the sprite is on the current scanline, evaluate it
            if (sprRow >= 0 && sprRow < size * interlaceFactor && x > -(size * 8)) {
                if (spriteCount === 32) {
                    ppu.rangeOver = true; // Flag hardware boundary overload (Max 32 sprites per line)
                    break;
                }

                sprRow = objInterlace ? (sprRow << 1) + (evenFrame ? 1 : 0) : sprRow;
                
                // Retrieve sprite pattern generator address
                const adr = sprAdr1 + ((ex & 0x1) > 0 ? sprAdr2 : 0);
                
                // Handle vertical flip
                sprRow = ((ex & 0x80) > 0) ? (size << 3) - 1 - sprRow : sprRow;
                
                const tileRow = sprRow >> 3;
                sprRow &= 0x7;

                // Pre-calculated offset parameters for the sliver loop
                const isHFlip = (ex & 0x40) > 0;
                const paletteOffset = (ex & 0xe) << 3; // Bitwise shift replacing division/multiplication
                const prio = (ex & 0x30) >> 4;

                // Loop through sprite tile columns (Slivers)
                for (let k = 0; k < size; k++) {
                    const sliverX = x + (k << 3);
                    if (sliverX > -7 && sliverX < 256) {
                        if (sliverCount === 34) {
                            sliverCount = 35; // Flag hardware bandwidth overflow (Max 34 slivers per line)
                            break;
                        }

                        // Handle horizontal flip
                        const tileColumn = isHFlip ? size - 1 - k : k;
                        const tileNum = (tile + SnesPpuMathUnit.SPRITE_TILE_OFFSETS[tileRow * 8 + tileColumn]) & 0xff;

                        // Fetch the 4bpp sprite plane tiles from VRAM
                        const baseVramOffset = adr + (tileNum << 4) + sprRow;
                        const tileP1 = vram[baseVramOffset & 0x7fff];
                        const tileP2 = vram[(baseVramOffset + 8) & 0x7fff];

                        // Draw the 8 pixels of this sliver
                        if (isHFlip) {
                            // Flipped Loop: Eliminates branching on every single pixel
                            for (let j = 0; j < 8; j++) {
                                let tileData = (tileP1 >> j) & 0x1;
                                tileData |= ((tileP1 >> (8 + j)) & 0x1) << 1;
                                tileData |= ((tileP2 >> j) & 0x1) << 2;
                                tileData |= ((tileP2 >> (8 + j)) & 0x1) << 3;

                                const xInd = sliverX + j;
                                if (tileData > 0 && xInd < 256 && xInd >= 0) {
                                    spriteLineBuffer[xInd] = 0x80 + tileData + paletteOffset;
                                    spritePrioBuffer[xInd] = prio;
                                }
                            }
                        } else {
                            // Normal Loop: Eliminates branching on every single pixel
                            for (let j = 0; j < 8; j++) {
                                const shift = 7 - j;
                                let tileData = (tileP1 >> shift) & 0x1;
                                tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
                                tileData |= ((tileP2 >> shift) & 0x1) << 2;
                                tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;

                                const xInd = sliverX + j;
                                if (tileData > 0 && xInd < 256 && xInd >= 0) {
                                    spriteLineBuffer[xInd] = 0x80 + tileData + paletteOffset;
                                    spritePrioBuffer[xInd] = prio;
                                }
                            }
                        }
                        sliverCount++;
                    }
                }

                if (sliverCount === 35) {
                    ppu.timeOver = true;
                    break;
                }
                spriteCount++;
            }
            index = (index - 2) & 0xff;
        }

        // Accumulate elapsed execution time safely
        ppu.profSpriteTime = (ppu.profSpriteTime || 0) + (performance.now() - t0);
    }
}

// Global transitional alias for microphases compatibility
window.SnesPpuSpriteEvaluator = SnesPpuSpriteEvaluator;