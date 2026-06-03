/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuSpriteEvaluator (OBJ/Sprite Sorting and Evaluation Processor)
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
        let spriteCount = 0;
        let sliverCount = 0;
        
        // Resolve sprite priority index from OAM start registers
        let index = ppu.objPriority ? ((ppu.oamAdr & 0xfe) - 2) & 0xff : 254;

        // SNES supports up to 128 active sprites in OAM
        for (let i = 0; i < 128; i++) {
            let x = ppu.oam[index] & 0xff;
            const y = (ppu.oam[index] & 0xff00) >> 8;
            const tile = ppu.oam[index + 1] & 0xff;
            const ex = (ppu.oam[index + 1] & 0xff00) >> 8;
            
            // Append 9th X bit and size bit from High OAM
            x |= (ppu.highOam[index >> 4] >> (index & 0xf) & 0x1) << 8;
            const big = (ppu.highOam[index >> 4] >> (index & 0xf) & 0x2) > 0;
            
            // Cast unsigned 9-bit X coordinate to signed integer
            x = x > 255 ? -(512 - x) : x;

            // Resolve physical sprite size (typically 8x8 up to 64x64)
            const size = SnesPpuMathUnit.SPRITE_SIZES[ppu.objSize + (big ? 8 : 0)];
            let sprRow = line - y;
            
            // Handle vertical wrap-around
            if (sprRow < 0 || sprRow >= size * (ppu.objInterlace ? 4 : 8)) {
                sprRow = line + (256 - y);
            }

            // If the sprite is on the current scanline, evaluate it
            if (sprRow >= 0 && sprRow < size * (ppu.objInterlace ? 4 : 8) && x > -(size * 8)) {
                if (spriteCount === 32) {
                    ppu.rangeOver = true; // Flag hardware boundary overload (Max 32 sprites per line)
                    break;
                }

                sprRow = ppu.objInterlace ? sprRow * 2 + (ppu.evenFrame ? 1 : 0) : sprRow;
                
                // Retrieve sprite pattern generator address
                const adr = ppu.sprAdr1 + ((ex & 0x1) > 0 ? ppu.sprAdr2 : 0);
                
                // Handle vertical flip
                sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
                
                const tileRow = sprRow >> 3;
                sprRow &= 0x7;

                // Loop through sprite tile columns (Slivers)
                for (let k = 0; k < size; k++) {
                    if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                        if (sliverCount === 34) {
                            sliverCount = 35; // Flag hardware bandwidth overflow (Max 34 slivers per line)
                            break;
                        }

                        // Handle horizontal flip
                        const tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                        const tileNum = (tile + SnesPpuMathUnit.SPRITE_TILE_OFFSETS[tileRow * 8 + tileColumn]) & 0xff;

                        // Fetch the 4bpp sprite plane tiles from VRAM
                        const tileP1 = ppu.vram[(adr + tileNum * 16 + sprRow) & 0x7fff];
                        const tileP2 = ppu.vram[(adr + tileNum * 16 + sprRow + 8) & 0x7fff];

                        // Draw the 8 pixels of this sliver
                        for (let j = 0; j < 8; j++) {
                            const shift = ((ex & 0x40) > 0) ? j : 7 - j;
                            
                            // Recompose 4-bit palette index
                            let tileData = (tileP1 >> shift) & 0x1;
                            tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
                            tileData |= ((tileP2 >> shift) & 0x1) << 2;
                            tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;

                            const color = tileData + 16 * ((ex & 0xe) >> 1);
                            const xInd = x + k * 8 + j;
                            
                            // Write directly on PPU scanline buffers
                            if (tileData > 0 && xInd < 256 && xInd >= 0) {
                                ppu.spriteLineBuffer[xInd] = 0x80 + color;
                                ppu.spritePrioBuffer[xInd] = (ex & 0x30) >> 4;
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
    }
}

// Global transitional alias for microphases compatibility
window.SnesPpuSpriteEvaluator = SnesPpuSpriteEvaluator;