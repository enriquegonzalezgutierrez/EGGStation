/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain/Infrastructure Layer: VDP Sprite Manager Service
 * 
 * Handles sprite coordinates wrapping, list parsing, scaling, rendering, 
 * and collision/overflow detection for both Mode 2 and Mode 4 (SRP).
 */

class VdpSpriteManager {
    /**
     * Parses the Sprite Attribute Table (SAT) and renders active sprites for Mode 4.
     * @param {Sega315_5124_Vdp} vdp - The parent Video Display Processor.
     * @param {number} scanlineNum - Active scanline index.
     */
    static drawMode4(vdp, scanlineNum) {
        const sat = vdp.spriteAttributeTableBaseAddress;

        // Standard behavior: Stop parsing sprites if vertical coordinate index 208 (0xD0) is found
        let stopDrawingSpritesWhenLine208IsFound = true;
        if ((vdp.yScreenLines === 224) || (vdp.yScreenLines === 240)) {
            stopDrawingSpritesWhenLine208IsFound = false;
        }

        // 1. Determine active sprite limit
        let maxSprite = 64;
        for (let s = 0; s < 64; s++) {
            const spriteY = vdp.vRam[sat + s];
            if ((spriteY === 0xd0) && stopDrawingSpritesWhenLine208IsFound) {
                maxSprite = s;
                break;
            }
        }

        if (maxSprite > 0) {
            maxSprite -= 1;
        }

        let numSpritesDrawnOnThisScanline = 0;
        
        // 2. Loop through and draw active sprites (processed backwards to respect priority layers)
        for (let s = maxSprite; s >= 0; s--) {
            let spriteY = vdp.vRam[sat + s];
            spriteY++;

            if ((spriteY > 0xd0) && stopDrawingSpritesWhenLine208IsFound) {
                spriteY -= 0x100;
            }

            // Fetch Horizontal coordinates from active SAT offsets
            let spriteX = vdp.vRam[sat + (s * 2) + (0x10 * 0x8)];

            // Handle Register 0 - Bit 3 (Shift Sprites Left 8 Pixels)
            if (vdp.register00 & 0x08) {
                spriteX -= 8;
            }

            let spriteIdx = vdp.vRam[sat + (s * 2) + (0x10 * 0x8) + 1];

            // Handle Register 1 - Bit 1 (Select 8x16 double-sized sprites)
            let spritesAre8x16 = false;
            if ((vdp.register00 & 0x04) && (vdp.register01 & 0x02)) {
                spritesAre8x16 = true;
                spriteIdx &= 0xfe; // LSB is ignored in 8x16 mode
            }

            // Draw primary 8-pixel slice if within scanline boundaries
            if ((scanlineNum >= spriteY) && (scanlineNum < (spriteY + 8))) {
                vdp.drawSpriteSlice(spriteIdx * 32, spriteX, scanlineNum, scanlineNum - spriteY);
                numSpritesDrawnOnThisScanline++;
            }

            // Draw secondary 8-pixel slice for double-sized 8x16 sprites
            if (spritesAre8x16) {
                spriteIdx++;
                if ((scanlineNum >= (spriteY + 8)) && (scanlineNum < (spriteY + 16))) {
                    vdp.drawSpriteSlice(spriteIdx * 32, spriteX, scanlineNum, scanlineNum - spriteY - 8);
                }
            }
        }

        // Trigger Sprite Overflow flag if >= 8 sprites occupy the same scanline
        if (numSpritesDrawnOnThisScanline >= 8) {
            vdp.statusFlags |= 0x40; // Set bit 6 of status register
        }
    }

    /**
     * Parses and renders active legacy sprites for SG-1000 Mode 2.
     * @param {Sega315_5124_Vdp} vdp - The parent Video Display Processor.
     * @param {number} scanlineNum - Active scanline index.
     */
    static drawMode2(vdp, scanlineNum) {
        const sprite_attribute_addr = (vdp.register05 & 0x7F) << 7;
        const sprite_size = ((vdp.register01 & 0x02) !== 0) ? 16 : 8;
        const sprite_pattern_addr = (vdp.register06 & 0x07) << 11;
        const sprite_zoom = false;

        let max_sprite = 31;

        for (let sprite = 0; sprite <= max_sprite; sprite++) {
            if (vdp.vRam[sprite_attribute_addr + (sprite << 2)] === 0xD0) {
                max_sprite = sprite - 1;
                break;
            }
        }

        for (let sprite = 0; sprite <= max_sprite; sprite++) {
            const sprite_attribute_offset = sprite_attribute_addr + (sprite << 2);
            let sprite_y = (vdp.vRam[sprite_attribute_offset] + 1) & 0xFF;

            if (sprite_y >= 0xE0) {
                sprite_y = -(0x100 - sprite_y);
            }

            if ((sprite_y > scanlineNum) || ((sprite_y + sprite_size) <= scanlineNum)) {
                continue;
            }

            const sprite_color = vdp.vRam[sprite_attribute_offset + 3] & 0x0F;

            if (sprite_color === 0) {
                continue;
            }

            const sprite_shift = (vdp.vRam[sprite_attribute_offset + 3] & 0x80) ? 32 : 0;
            const sprite_x = vdp.vRam[sprite_attribute_offset + 1] - sprite_shift;

            if (sprite_x >= vdp.glbResolutionX) {
                continue;
            }

            let sprite_tile = vdp.vRam[sprite_attribute_offset + 2];
            sprite_tile &= ((vdp.register01 & 0x02) !== 0) ? 0xFC : 0xFF;

            const sprite_line_addr = sprite_pattern_addr + (sprite_tile << 3) + ((scanlineNum - sprite_y) >> (sprite_zoom ? 1 : 0));

            for (let tile_x = 0; tile_x < sprite_size; tile_x++) {
                const sprite_pixel_x = sprite_x + tile_x;
                if (sprite_pixel_x >= vdp.glbResolutionX) {
                    break;
                }
                if (sprite_pixel_x < 0) {
                    continue;
                }

                let sprite_pixel = false;
                const tile_x_adjusted = tile_x >> (sprite_zoom ? 1 : 0);

                if (tile_x_adjusted < 8) {
                    sprite_pixel = ((vdp.vRam[sprite_line_addr] & (1 << (7 - tile_x_adjusted))) === 0) ? false : true;
                } else {
                    sprite_pixel = ((vdp.vRam[sprite_line_addr + 16] & (1 << (15 - tile_x_adjusted))) === 0) ? false : true;
                }

                if (sprite_pixel) {
                    const fbY = (scanlineNum * vdp.glbResolutionX * 4) + (sprite_pixel_x * 4);
                    vdp.glbFrameBuffer[fbY + 0] = vdp.sg1000palette[sprite_color * 3];
                    vdp.glbFrameBuffer[fbY + 1] = vdp.sg1000palette[sprite_color * 3 + 1];
                    vdp.glbFrameBuffer[fbY + 2] = vdp.sg1000palette[sprite_color * 3 + 2];
                    vdp.glbFrameBuffer[fbY + 3] = 255;
                }
            }
        }
    }
}