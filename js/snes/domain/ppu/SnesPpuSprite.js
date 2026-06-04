/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpuSprite (OAM & Sprites Pipeline)
 * 
 * ROLE:
 * Handles Object Attribute Memory (OAM) scanning, sprites bounds, range checks,
 * and high-fidelity sprite blitting.
 */

{
    SnesPpu.prototype.evaluateSprites = function(line) {
        let spriteCount = 0;
        let sliverCount = 0;
        let index = this.objPriority ? ((this.oamAdr & 0xfe) - 2) & 0xff : 254;

        for (let i = 0; i < 128; i++) {
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
            if (
                sprRow >= 0 && sprRow < size * (this.objInterlace ? 4 : 8) &&
                x > -(size * 8)
            ) {
                if (spriteCount === 32) {
                    this.rangeOver = true;
                    break;
                }
                sprRow = this.objInterlace ? sprRow * 2 + (
                    this.evenFrame ? 1 : 0
                ) : sprRow;
                let adr = this.sprAdr1 + ((ex & 0x1) > 0 ? this.sprAdr2 : 0);
                sprRow = ((ex & 0x80) > 0) ? (size * 8) - 1 - sprRow : sprRow;
                let tileRow = sprRow >> 3;
                sprRow &= 0x7;
                
                for (let k = 0; k < size; k++) {
                    if ((x + k * 8) > -7 && (x + k * 8) < 256) {
                        if (sliverCount === 34) {
                            sliverCount = 35;
                            break; 
                        }
                        let tileColumn = ((ex & 0x40) > 0) ? size - 1 - k : k;
                        let tileNum = tile + SnesPpu.spriteTileOffsets[
                            tileRow * 8 + tileColumn
                        ];
                        tileNum &= 0xff;
                        let tileP1 = this.vram[
                            (adr + tileNum * 16 + sprRow) & 0x7fff
                        ];
                        let tileP2 = this.vram[
                            (adr + tileNum * 16 + sprRow + 8) & 0x7fff
                        ];
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
                    this.timeOver = true;
                    break;
                }
                spriteCount++;
            }
            index = (index - 2) & 0xff;
        }
    };
}