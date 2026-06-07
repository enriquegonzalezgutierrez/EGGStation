/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpuSprite (OAM & Sprites Pipeline)
 * 
 * ROLE:
 * Handles Object Attribute Memory (OAM) scanning, sprites bounds, range checks,
 * and high-fidelity sprite blitting.
 * 
 * PHASE 2 OPTIMIZATION:
 * - Implemented OAM Pre-evaluation (`buildSpriteCache`).
 * - Instead of evaluating 128 sprites per scanline (30,720 loops per frame),
 *   sprites are evaluated ONCE per frame and bucketed by scanline. The renderer 
 *   now only iterates over the exact visible sprites per line (~400 loops per frame).
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
     * Consumes the pre-evaluated OAM cache to draw only visible sprites.
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
            
            for (let k = 0; k < size; k++) {
                if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                    if (sliverCount === 34) {
                        sliverCount = 35;
                        break; // Hardware limit: Max 34 slivers (8-pixel chunks) per line
                    }
                    
                    let tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                    let tileNum = tile + SnesPpu.spriteTileOffsets[tileRow * 8 + tileColumn];
                    tileNum &= 0xff;
                    
                    let tileP1 = this.vram[(adr + tileNum * 16 + sprRow) & 0x7fff];
                    let tileP2 = this.vram[(adr + tileNum * 16 + sprRow + 8) & 0x7fff];
                    
                    for (let j = 0; j < 8; j++) {
                        let shift = ((ex & 0x40) > 0) ? j : 7 - j;
                        let tileData = (tileP1 >> shift) & 0x1;
                        tileData |= ((tileP1 >> (8 + shift)) & 0x1) << 1;
                        tileData |= ((tileP2 >> shift) & 0x1) << 2;
                        tileData |= ((tileP2 >> (8 + shift)) & 0x1) << 3;
                        
                        let color = tileData + 16 * ((ex & 0xe) >> 1);
                        let xInd = x + k * 8 + j;
                        
                        if (tileData > 0 && xInd < 256 && xInd >= 0) {
                            this.spriteLineBuffer[xInd] = 0x80 + color;
                            this.spritePrioBuffer[xInd] = (ex & 0x30) >> 4;
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