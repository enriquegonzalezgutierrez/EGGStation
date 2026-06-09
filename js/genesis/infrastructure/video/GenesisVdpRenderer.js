/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/infrastructure/video/GenesisVdpRenderer.js
 * 
 * Infrastructure Layer: Genesis VDP Rendering Subsystem
 * 
 * Role:
 * Handles the complex, high-performance rasterization of Sega Genesis video layers.
 * Responsible for compositing Scroll A, Scroll B, Window Plane, and active sprites 
 * on a pixel-by-pixel basis, resolving priorities, window boundaries, and 
 * shadow/highlight modes.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Isolates video scanline rasterization 
 *   and sprite caching entirely from VDP I/O register states and DMA controllers.
 */

class GenesisVdpRenderer {
    /**
     * Helper to retrieve and decode a sprite directly from VRAM.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     * @param {number} spriteIndex - Target index of the sprite in the SAT.
     * @returns {Object} Decoded sprite metadata.
     */
    static getCachedSprite(vdp, spriteIndex) {
        // Sprite Attribute Table (SAT) address mapping
        const mask = ~(0x1FF) << (vdp.h40Enabled ? 1 : 0);
        const spriteTableBase = (vdp.spriteTableAddress & mask) + (spriteIndex * 8);

        // Read Word 0 (Y Coordinate)
        const y = vdp.readVRAMWord(spriteTableBase) & (vdp.doubleResolutionEnabled ? 0x3FF : 0x1FF);
        
        // Read Word 1 (Size and Link)
        const word1 = vdp.readVRAMWord(spriteTableBase + 2);
        const link = word1 & 0x7F; // Link is strictly 7 bits (bits 0-6)
        const width = ((word1 >> 10) & 3) + 1;
        const height = ((word1 >> 8) & 3) + 1;

        return { y, link, width, height };
    }

    /**
     * Parses the VDP SAT (Sprite Attribute Table) and builds a scanline-optimized 
     * sprite sorting cache for the current frame.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     */
    static updateSpriteCache(vdp) {
        if (!vdp.spriteRowCacheNeedsUpdating) return;
        vdp.spriteRowCacheNeedsUpdating = false;

        vdp.spriteRowCacheTotal.fill(0);

        const tileHeightShift = 3 + vdp.doubleResolutionEnabled;
        const screenHeightTiles = vdp.v30Enabled ? 30 : 28;
        const maxSprites = vdp.h40Enabled ? 80 : 64;

        let spriteIndex = 0;
        let spritesRemaining = maxSprites;
        let spriteMask1 = maxSprites; // Simulates sprite masking

        // Obtain SAT base address
        const satMask = ~(0x1FF) << (vdp.h40Enabled ? 1 : 0);
        const satBase = vdp.spriteTableAddress & satMask;

        do {
            const cachedSprite = this.getCachedSprite(vdp, spriteIndex);
            
            // Sega Genesis Sprite Drop/Mask Bug Implementation:
            // A value of rawX = 128 (0x80) represents coordinate 0 (128 - 128 offset).
            const spriteTableBase = satBase + (spriteIndex * 8);
            const rawX = vdp.readVRAMWord(spriteTableBase + 6) & 0x1FF;
            
            if (rawX === 128) {
                spriteMask1 = spriteIndex;
            }
            if (rawX === 127 && spriteMask1 != maxSprites) {
                break; // Masking triggered, drop remaining sprites in the link chain
            }

            const blankLines = 128 << vdp.doubleResolutionEnabled;
            const startY = Math.max(blankLines, cachedSprite.y);
            const endY = Math.min(blankLines + (screenHeightTiles << tileHeightShift), cachedSprite.y + (cachedSprite.height << tileHeightShift));

            for (let i = startY; i < endY; i++) {
                const rowIdx = i - blankLines;
                
                if (rowIdx >= 0 && rowIdx < 256) {
                    const rowTotal = vdp.spriteRowCacheTotal[rowIdx];

                    // Enforce the physical Genesis hardware limit of active sprites per line
                    if (rowTotal < (vdp.h40Enabled ? 20 : 16)) {
                        const cacheIndex = (rowIdx * 20) + rowTotal;
                        
                        vdp.spriteRowCacheTableIdx[cacheIndex] = spriteIndex;
                        vdp.spriteRowCacheWidth[cacheIndex] = cachedSprite.width;
                        vdp.spriteRowCacheHeight[cacheIndex] = cachedSprite.height;
                        vdp.spriteRowCacheYInSprite[cacheIndex] = i - cachedSprite.y;

                        vdp.spriteRowCacheTotal[rowIdx]++;
                    }
                }
            }

            if (cachedSprite.link >= 80) break;
            spriteIndex = cachedSprite.link;
        } while (spriteIndex != 0 && --spritesRemaining != 0);
    }

    /**
     * Pre-calculates flipped VRAM tiles during CPU memory write cycles.
     * Drastically reduces branch prediction penalties during hot pixel loops.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     * @param {number} address - Target VRAM write address.
     */
    static patternCheck(vdp, address) {
        const w_address = address & 0xFFFE;
        const w_val = (vdp.vRam[w_address] << 8) | vdp.vRam[w_address + 1]; 
        
        const w_val_h = ((w_val >> 12) & 0x000F)
                      | ((w_val >> 4) & 0x00F0)
                      | ((w_val << 4) & 0x0F00)
                      | ((w_val << 12) & 0xF000);

        const w_addr = (address & 0xFFE0) >> 1;
        const wx = (address & 0x0002) >> 1;
        const wy = (address & 0x001F) >> 2;

        const VRAM_DATASIZE = 32768;

        vdp.rendererVram[w_address >> 1] = w_val;

        if (wx == 0) {
            vdp.rendererVram[VRAM_DATASIZE + w_addr + (wy << 1) + 1] = w_val_h;
            vdp.rendererVram[(VRAM_DATASIZE * 2) + w_addr + ((7 - wy) << 1)] = w_val;
            vdp.rendererVram[(VRAM_DATASIZE * 3) + w_addr + ((7 - wy) << 1) + 1] = w_val_h;
        } else {
            vdp.rendererVram[VRAM_DATASIZE + w_addr + (wy << 1)] = w_val_h;
            vdp.rendererVram[(VRAM_DATASIZE * 2) + w_addr + ((7 - wy) << 1) + 1] = w_val_h;
            vdp.rendererVram[(VRAM_DATASIZE * 3) + w_addr + ((7 - wy) << 1)] = w_val_h;
        }
    }

    /**
     * Main pixel-perfect compositing pipeline.
     * Composites backgrounds, window layers, and prioritized sprites onto the 2D scanline.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     * @param {number} scanline - The active scanline index.
     * @param {Function} scanlineRenderedCallback - Frontend blitting delegate.
     */
    static renderScanline(vdp, scanline, scanlineRenderedCallback) {
        const w_display_xsize = vdp.h40Enabled ? 320 : 256;
        const w_scroll_xcell = 1 << vdp.planeWidthShift;
        const w_scroll_xsize_mask = (w_scroll_xcell << 3) - 1;
        const vscrollMask = vdp.vscrollMode == 1 ? 0x000F : 0xFFFF;

        // Zero-allocation temporary scanline buffers
        const w_game_cmap = new Uint8Array(w_display_xsize);
        const w_game_primap = new Uint8Array(w_display_xsize);
        const w_game_shadowmap = new Uint8Array(w_display_xsize);

        const VRAM_DATASIZE = 32768;

        this.updateSpriteCache(vdp);

        // 1. Render Background Plane (Scroll B)
        if (vdp.displayEnabled && !vdp.configPlanesDisabled[1]) {
            const hscrollTableAddress = vdp.hscrollAddress + ((scanline >> vdp.doubleResolutionEnabled) & vdp.hscrollMask) * 4;
            const hscrollB = vdp.readVRAMWord(hscrollTableAddress + 2) & 0x3FF;

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
                if ((wx & vscrollMask) == 0) {
                    const w_view_y = vdp.getVScroll(1, wx >> 4) + scanline;
                    w_view_dy = w_view_y & 7;

                    const tileY = (w_view_y >> 3) & vdp.planeHeightBitmask;
                    w_view_addr = (vdp.planeBAddress >> 1) + ((tileY & vdp.planeHeightBitmask) * w_scroll_xcell);
                    w_view_dx = 8;
                }
                if (w_view_dx == 8) {
                    w_view_x &= w_scroll_xsize_mask;
                    w_view_dx = w_view_x & 7;

                    const w_val = vdp.rendererVram[w_view_addr + (w_view_x >> 3)];
                    w_priority = (w_val >> 15) & 1;
                    w_palette = ((w_val >> 13) & 3) << 4;
                    w_reverse = (w_val >> 11) & 3;
                    w_char = w_val & 0x07FF;

                    w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + (w_view_dy << 1));
                    w_pic_w = vdp.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                } else if ((w_view_dx & 3) == 0) {
                    w_pic_w = vdp.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                }

                const w_pic = (w_pic_w >> ((3 - (w_view_dx & 3)) << 2)) & 0x0F;

                if (w_pic != 0) {
                    w_game_cmap[wx] = w_palette + w_pic;
                    w_game_primap[wx] = w_priority;
                }
                if (vdp.shadowHighlightEnabled) {
                    w_game_shadowmap[wx] = w_priority;
                }

                w_view_x += 1;
                w_view_dx += 1;
            }
        }

        // 2. Render Foreground Plane (Scroll A / Window)
        if (vdp.displayEnabled) {
            const hscrollTableAddress = vdp.hscrollAddress + ((scanline >> vdp.doubleResolutionEnabled) & vdp.hscrollMask) * 4;
            const hscrollA = vdp.readVRAMWord(hscrollTableAddress + 0) & 0x3FF;

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

            const windowMaskY = vdp.windowVerticalBoundary;
            const isWindowY = (scanline < windowMaskY) != vdp.windowAlignedBottom;

            for (let wx = 0; wx < w_display_xsize; wx++) {
                const isWindowX = ((wx >> 4) < vdp.windowHorizontalBoundary) != vdp.windowAlignedRight;
                const isWindowActive = (isWindowY || isWindowX) && !vdp.configWindowDisabled;

                if (isWindowActive) {
                    const win_view_dx = wx & 7;
                    if (win_view_dx == 0 || wx == 0) {
                        const tileX = (wx >> 3) & 0x3F;
                        const tileY = (scanline >> 3) & vdp.planeHeightBitmask;
                        
                        const winTableMask = ~(0x7FF) << (vdp.h40Enabled ? 1 : 0);
                        const winTable = vdp.windowAddress & winTableMask;
                        
                        const w_val = vdp.rendererVram[(winTable >> 1) + (tileY * w_scroll_xcell + tileX)];
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + ((scanline & 7) << 1));
                        w_pic_w = vdp.rendererVram[w_pic_addr + (win_view_dx >> 2)];
                    } else if ((win_view_dx & 3) == 0) {
                        w_pic_w = vdp.rendererVram[w_pic_addr + (win_view_dx >> 2)];
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const w_pic = (w_pic_w >> ((3 - (win_view_dx & 3)) << 2)) & 0x0F;

                        if (w_pic != 0) {
                            w_game_cmap[wx] = w_palette + w_pic;
                            w_game_primap[wx] = w_priority;
                        }
                        if (vdp.shadowHighlightEnabled) {
                            w_game_shadowmap[wx] |= w_priority;
                        }
                    }
                    w_view_x += 1;
                    w_view_dx += 1;
                } else if (!vdp.configPlanesDisabled[0]) {
                    if ((wx & vscrollMask) == 0) {
                        const w_view_y = vdp.getVScroll(0, wx >> 4) + scanline;
                        w_view_dy = w_view_y & 7;

                        const tileY = (w_view_y >> 3) & vdp.planeHeightBitmask;
                        w_view_addr = (vdp.planeAAddress >> 1) + ((tileY & vdp.planeHeightBitmask) * w_scroll_xcell);
                        w_view_dx = 8;
                    }
                    if (w_view_dx == 8) {
                        w_view_x &= w_scroll_xsize_mask;
                        w_view_dx = w_view_x & 7;

                        const w_val = vdp.rendererVram[w_view_addr + (w_view_x >> 3)];
                        w_priority = (w_val >> 15) & 1;
                        w_palette = ((w_val >> 13) & 3) << 4;
                        w_reverse = (w_val >> 11) & 3;
                        w_char = w_val & 0x07FF;

                        w_pic_addr = ((w_reverse * VRAM_DATASIZE) + (w_char << 4) + (w_view_dy << 1));
                        w_pic_w = vdp.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                    } else if ((w_view_dx & 3) == 0) {
                        w_pic_w = vdp.rendererVram[w_pic_addr + (w_view_dx >> 2)];
                    }

                    if (w_game_primap[wx] <= w_priority) {
                        const w_pic = (w_pic_w >> ((3 - (w_view_dx & 3)) << 2)) & 0x0F;

                        if (w_pic != 0) {
                            w_game_cmap[wx] = w_palette + w_pic;
                            w_game_primap[wx] = w_priority;
                        }
                        if (vdp.shadowHighlightEnabled) {
                            w_game_shadowmap[wx] |= w_priority;
                        }
                    }
                    w_view_x += 1;
                    w_view_dx += 1;
                }
            }
        }

        // 3. Render Sprites
        if (vdp.displayEnabled && !vdp.configSpritesDisabled) {
            const rowTotal = vdp.spriteRowCacheTotal[scanline];
            const rowOffset = scanline * 20;

            const satMask = ~(0x1FF) << (vdp.h40Enabled ? 1 : 0);
            const satBase = vdp.spriteTableAddress & satMask;

            for (let i = rowTotal - 1; i >= 0; i--) {
                const spriteRowCacheEntryIdx = rowOffset + i;
                const tableIndex = vdp.spriteRowCacheTableIdx[spriteRowCacheEntryIdx];
                const width = vdp.spriteRowCacheWidth[spriteRowCacheEntryIdx];
                const height = vdp.spriteRowCacheHeight[spriteRowCacheEntryIdx];

                const spriteTableBase = satBase + tableIndex * 8;
                const rawX = vdp.readVRAMWord(spriteTableBase + 6) & 0x1FF;
                const x = rawX - 0x80;

                const word = vdp.readVRAMWord(spriteTableBase + 4);
                
                const tileIndexBase = word & 0x7FF;
                const xFlip = (word & 0x0800) != 0;
                const yFlip = (word & 0x1000) != 0;

                const paletteLineMask = ((word >> 13) & 3) << 4;
                const w_priority = (word >> 15) & 1;

                const yInSpriteNonFlipped = vdp.spriteRowCacheYInSprite[spriteRowCacheEntryIdx];
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
                        if ((w_cx & 3) == 0 || w_posx == w_start_x) {
                            w_pic_w = vdp.rendererVram[w_row_addr + (w_cx >> 2)];
                        }

                        if (w_game_primap[w_posx] <= w_priority) {
                            const w_pic = (w_pic_w >> ((3 - (w_cx & 3)) << 2)) & 0x0F;

                            if (w_pic != 0) {
                                const w_color = paletteLineMask + w_pic;
                                
                                // Hardware Shadow/Highlight 15/16 transparency masking rules
                                if (vdp.shadowHighlightEnabled && (w_color == 0x3E || w_color == 0x3F)) {
                                    if (w_color == 0x3E) { // Color 15: Highlight
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map < 2) w_game_shadowmap[w_posx] = w_map + 1;
                                    } else { // Color 16: Shadow
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map > 0) w_game_shadowmap[w_posx] = w_map - 1;
                                    }
                                    vdp.spriteCollisionFlag = true;
                                } else {
                                    if (!vdp.shadowHighlightEnabled) {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        vdp.spriteCollisionFlag = true;
                                    } else if (w_color == 0x3E) {
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map < 2) w_game_shadowmap[w_posx] = w_map + 1;
                                    } else if (w_color == 0x3F) {
                                        const w_map = w_game_shadowmap[w_posx];
                                        if (w_map > 0) w_game_shadowmap[w_posx] = w_map - 1;
                                    } else if ((w_color & 0x0F) == 0x0E) {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        w_game_shadowmap[w_posx] = 0x1000;
                                        vdp.spriteCollisionFlag = true;
                                    } else {
                                        w_game_cmap[w_posx] = w_color;
                                        w_game_primap[w_posx] = w_priority;
                                        w_game_shadowmap[w_posx] |= w_priority;
                                        vdp.spriteCollisionFlag = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        const screenHeightTiles = vdp.v30Enabled ? 30 : 28;
        scanlineRenderedCallback(null, scanline, w_game_cmap, w_game_shadowmap, w_display_xsize, screenHeightTiles * 8);
    }
}