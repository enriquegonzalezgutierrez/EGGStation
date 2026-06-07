/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpuSprite (OAM & Sprites Pipeline)
 * 
 * ROLE:
 * Handles Object Attribute Memory (OAM) scanning, sprites bounds, range checks,
 * and high-fidelity sprite blitting.
 * 
 * PHASE 4 OPTIMIZATION:
 * - Refactored `evaluateSprites` to utilize the high-speed pre-decoded `vramCache`.
 * - Leverages the X-Flipped cache partition (offset 262144) to entirely bypass 
 *   conditional coordinate flipping checks during the hot pixel rendering loop.
 * - Drastically accelerates active sprite rendering by removing all planar bit-shifting.
 */

{
    /**
     * Pre-evaluates the OAM table once per frame.
     * Distributes active sprites into scanline buckets to eliminate 
     * redundant coordinate checking during the active rendering loop.
     */
    SnesPpu.prototype.buildSpriteCache = function() {
        // Lazy initialize the GC-Free caches on the first frame
        if (!this.scanlineSprites) {
            // Maximum of 32 sprites allowed per scanline by SNES hardware
            this.scanlineSprites = Array.from({ length: 240 }, () => new Int16Array(32));
            this.scanlineSpriteCount = new Uint8Array(240);
            this.scanlineRangeOver = new Uint8Array(240);
        }

        // Clear previous frame data
        this.scanlineSpriteCount.fill(0);
        this.scanlineRangeOver.fill(0);

        // SNES OAM Priority Rotation: Start index depends on objPriority flag
        let index = this.objPriority ? ((this.oamAdr & 0xfe) - 2) & 0xff : 254;

        for (let i = 0; i < 128; i++) {
            let x = this.oam[index] & 0xff;
            x |= (this.highOam[index >> 4] >> (index & 0xf) & 0x1) << 8;
            x = x > 255 ? -(512 - x) : x;

            let y = (this.oam[index] & 0xff00) >> 8;
            let big = (this.highOam[index >> 4] >> (index & 0xf) & 0x2) > 0;
            let size = SnesPpu.spriteSizes[this.objSize + (big ? 8 : 0)];
            let spriteHeight = size * (this.objInterlace ? 4 : 8);

            // Only process if the sprite is horizontally within the screen bounds
            if (x > -(size * 8)) {
                for (let row = 0; row < spriteHeight; row++) {
                    let screenY = (y + row) & 0xff; // SNES Sprites wrap vertically around the screen
                    
                    if (screenY < 240) {
                        let count = this.scanlineSpriteCount[screenY];
                        if (count < 32) {
                            this.scanlineSprites[screenY][count] = index;
                            this.scanlineSpriteCount[screenY]++;
                        } else {
                            // Hardware limit: More than 32 sprites on one line triggers Range Over
                            this.scanlineRangeOver[screenY] = 1;
                        }
                    }
                }
            }
            index = (index - 2) & 0xff;
        }
    };

    /**
     * Highly optimized Sprite Renderer.
     * Consumes the pre-evaluated OAM cache and fast pre-decoded VRAM bitplanes.
     */
    SnesPpu.prototype.evaluateSprites = function(line) {
        // Rebuild the sprite cache only once per frame
        if (this.snes.frames !== this.spriteCacheFrame) {
            this.buildSpriteCache();
            this.spriteCacheFrame = this.snes.frames;
        }

        if (line >= 240) return; // Failsafe for overscan bounds

        // Hardware Range Over Flag
        if (this.scanlineRangeOver[line] === 1) {
            this.rangeOver = true;
        }

        let count = this.scanlineSpriteCount[line];
        let sliverCount = 0;

        // Iterate ONLY over the sprites that actually touch this scanline
        for (let i = 0; i < count; i++) {
            let index = this.scanlineSprites[line][i];

            let x = this.oam[index] & 0xff;
            let y = (this.oam[index] & 0xff00) >> 8;
            let tile = this.oam[index + 1] & 0xff;
            let ex = (this.oam[index + 1] & 0xff00) >> 8;
            
            x |= (this.highOam[index >> 4] >> (index & 0xf) & 0x1) << 8;
            let big = (this.highOam[index >> 4] >> (index & 0xf) & 0x2) > 0;
            x = x > 255 ? -(512 - x) : x;

            let size = SnesPpu.spriteSizes[this.objSize + (big ? 8 : 0)];
            let sprRow = line - y;
            
            if (sprRow < 0 || sprRow >= size * (this.objInterlace ? 4 : 8)) {
                sprRow = line + (256 - y);
            }

            sprRow = this.objInterlace ? sprRow * 2 + (this.evenFrame ? 1 : 0) : sprRow;
            let adr = this.sprAdr1 + ((ex & 0x1) > 0 ? this.sprAdr2 : 0);
            sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
            let tileRow = sprRow >> 3;
            sprRow &= 0x7;

            // --- OPTIMIZED CACHE PATTERN SELECTION ---
            // If the sprite is horizontally flipped, we read from the mirrored cache at 262144
            const xFlip = (ex & 0x40) > 0;
            const cacheBase = xFlip ? 262144 : 0;
            const paletteOffset = 16 * ((ex & 0xe) >> 1);
            const prio = (ex & 0x30) >> 4;
            
            for (let k = 0; k < size; k++) {
                if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                    if (sliverCount === 34) {
                        sliverCount = 35;
                        break; // Hardware limit: Max 34 slivers (8-pixel chunks) per line
                    }
                    
                    let tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                    let tileNum = tile + SnesPpu.spriteTileOffsets[tileRow * 8 + tileColumn];
                    tileNum &= 0xff;

                    // Calculate cached addresses for Plane 0/1 and Plane 2/3 (offset by 8 words)
                    const offset1 = (adr + tileNum * 16 + sprRow) & 0x7fff;
                    const offset2 = (offset1 + 8) & 0x7fff;

                    const p1Idx = cacheBase + (offset1 << 3); // offset1 * 8
                    const p2Idx = cacheBase + (offset2 << 3); // offset2 * 8
                    
                    for (let j = 0; j < 8; j++) {
                        // Decodes 4bpp pixel instantly combining the pre-decoded 2bpp bitplanes
                        const tileData = this.vramCache[p1Idx + j] | (this.vramCache[p2Idx + j] << 2);
                        
                        if (tileData > 0) {
                            let xInd = x + k * 8 + j;
                            if (xInd < 256 && xInd >= 0) {
                                this.spriteLineBuffer[xInd] = 0x80 + paletteOffset + tileData;
                                this.spritePrioBuffer[xInd] = prio;
                            }
                        }
                    }
                    sliverCount++;
                }
            }
            if (sliverCount === 35) {
                this.timeOver = true; // Hardware Time Over Flag
                break;
            }
        }
    };
}