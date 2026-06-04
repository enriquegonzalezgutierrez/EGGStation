/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesPpuMode7 (Mode 7 Graphics Pipeline)
 * 
 * ROLE:
 * Performs linear coordinate scaling, rotation matrices translation,
 * and decodes screen pixels on the affine Mode 7 layer.
 */

{
    SnesPpu.prototype.generateMode7Coords = function(y) {
        let rY = this.mode7FlipY ? 255 - y : y;

        let clippedH = this.mode7Hoff - this.mode7X;
        clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3ff) : (clippedH & 0x3ff);
        let clippedV = this.mode7Voff - this.mode7Y;
        clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3ff) : (clippedV & 0x3ff);

        let lineStartX = (
            ((this.mode7A * clippedH) & ~63) +
            ((this.mode7B * rY) & ~63) + ((this.mode7B * clippedV) & ~63) +
            (this.mode7X << 8)
        );
        let lineStartY = (
            ((this.mode7C * clippedH) & ~63) +
            ((this.mode7D * rY) & ~63) + ((this.mode7D * clippedV) & ~63) +
            (this.mode7Y << 8)
        );

        this.mode7Xcoords[0] = lineStartX;
        this.mode7Ycoords[0] = lineStartY;

        for (let i = 1; i < 256; i++) {
            this.mode7Xcoords[i] = this.mode7Xcoords[i - 1] + this.mode7A;
            this.mode7Ycoords[i] = this.mode7Ycoords[i - 1] + this.mode7C;
        }
    };

    SnesPpu.prototype.getMode7Pixel = function(x, y, l, p) {
        let pixelData = this.tilemapBuffer[0];
        if (x !== this.lastTileFetchedX[0] || y !== this.lastTileFetchedY[0]) {
            let rX = this.mode7FlipX ? 255 - x : x;

            let px = this.mode7Xcoords[rX] >> 8;
            let py = this.mode7Ycoords[rX] >> 8;

            let pixelIsTransparent = false;

            if (this.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
                if (this.mode7Char0fill) {
                    px &= 0x7;
                    py &= 0x7;
                } else {
                    pixelIsTransparent = true;
                }
            }
            let tileX = (px & 0x3f8) >> 3;
            let tileY = (py & 0x3f8) >> 3;

            let tileByte = this.vram[(tileY * 128 + tileX)] & 0xff;
            pixelData = this.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)];
            pixelData >>= 8;
            pixelData = pixelIsTransparent ? 0 : pixelData;
            this.tilemapBuffer[0] = pixelData;
            this.lastTileFetchedX[0] = x;
            this.lastTileFetchedY[0] = y;
        }

        if (l === 1 && (pixelData >> 7) !== p) {
            return 0;
        } else if (l === 1) {
            return pixelData & 0x7f;
        }

        return pixelData;
    };

    SnesPpu.prototype.getMultResult = function(a, b) {
        b = b < 0 ? 65536 + b : b;
        b >>= 8;
        b = ((b & 0x80) > 0) ? -(256 - b) : b;
        let ans = a * b;
        if (ans < 0) {
            return 16777216 + ans;
        }
        return ans;
    };
}