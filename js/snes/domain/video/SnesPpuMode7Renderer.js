/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuMode7Renderer (Highly Optimized Mode 7 Affine Processor)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles the mathematical coordinate calculations and perspective projection
 * matrix for the SNES Mode 7. It processes affine matrices (A, B, C, D) and 
 * origin offsets (X, Y) to render 3D-like backgrounds.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles Mode 7 affine projections and texture lookups.
 */

class SnesPpuMode7Renderer {
    /**
     * Calculates the coordinate projection scanline for the affine matrix.
     * GC-FREE: Writes coordinates directly to pre-allocated typed arrays of the PPU.
     * @param {SnesPpu} ppu - Active PPU instance.
     * @param {number} y - Active visible scanline.
     */
    static generateCoords(ppu, y) {
        const rY = ppu.mode7FlipY ? 255 - y : y;

        // Apply matrix camera boundaries
        let clippedH = ppu.mode7Hoff - ppu.mode7X;
        clippedH = (clippedH & 0x2000) > 0 ? (clippedH | ~0x3ff) : (clippedH & 0x3ff);
        let clippedV = ppu.mode7Voff - ppu.mode7Y;
        clippedV = (clippedV & 0x2000) > 0 ? (clippedV | ~0x3ff) : (clippedV & 0x3ff);

        // Core SNES Mode 7 matrix calculation formula
        const lineStartX = (
            ((ppu.mode7A * clippedH) & ~63) +
            ((ppu.mode7B * rY) & ~63) + ((ppu.mode7B * clippedV) & ~63) +
            (ppu.mode7X << 8)
        );
        const lineStartY = (
            ((ppu.mode7C * clippedH) & ~63) +
            ((ppu.mode7D * rY) & ~63) + ((ppu.mode7D * clippedV) & ~63) +
            (ppu.mode7Y << 8)
        );

        // Cache typed arrays and values to eliminate property access overhead in the projection loop
        const mode7Xcoords = ppu.mode7Xcoords;
        const mode7Ycoords = ppu.mode7Ycoords;
        const mode7A = ppu.mode7A;
        const mode7C = ppu.mode7C;

        mode7Xcoords[0] = lineStartX;
        mode7Ycoords[0] = lineStartY;

        // Project pixels on the scanline using matricial increments (A and C)
        for (let i = 1; i < 256; i++) {
            mode7Xcoords[i] = mode7Xcoords[i - 1] + mode7A;
            mode7Ycoords[i] = mode7Ycoords[i - 1] + mode7C;
        }
    }

    /**
     * Resolves and fetches a specific projected pixel on Mode 7 layers.
     * @param {SnesPpu} ppu - Active PPU instance.
     * @param {number} x - Pixel column.
     * @param {number} y - Scanline row.
     * @param {number} layer - Active background layer (always BG1).
     * @param {number} priority - Render priority.
     */
    static getPixel(ppu, x, y, layer, priority) {
        let pixelData = ppu.tilemapBuffer[0];
        
        if (x !== ppu.lastTileFetchedX[0] || y !== ppu.lastTileFetchedY[0]) {
            const rX = ppu.mode7FlipX ? 255 - x : x;
            
            // Decoupled let declaration to allow proper local bitwise mutation (Fixed constant crash!)
            let px = ppu.mode7Xcoords[rX] >> 8;
            let py = ppu.mode7Ycoords[rX] >> 8;
            let pixelIsTransparent = false;

            // Handle wrap-around / large field boundaries
            if (ppu.mode7LargeField && (px < 0 || px >= 1024 || py < 0 || py >= 1024)) {
                if (ppu.mode7Char0fill) {
                    px &= 0x7; 
                    py &= 0x7; // Mutate localized variables safely
                } else {
                    pixelIsTransparent = true; // Output transparency
                }
            }

            // Decode active tilemap byte
            const tileX = (px & 0x3f8) >> 3;
            const tileY = (py & 0x3f8) >> 3;

            const tileByte = ppu.vram[(tileY * 128 + tileX)] & 0xff;
            
            // Read and decode tile pixel data
            pixelData = ppu.vram[tileByte * 64 + (py & 0x7) * 8 + (px & 0x7)] >> 8;
            if (pixelIsTransparent) {
                pixelData = 0;
            }

            ppu.tilemapBuffer[0] = pixelData;
            ppu.lastTileFetchedX[0] = x;
            ppu.lastTileFetchedY[0] = y;
        }

        if (layer === 1) {
            if ((pixelData >> 7) !== priority) return 0;
            return pixelData & 0x7f;
        }

        return pixelData;
    }
}

// Global transitional alias for microphases compatibility
window.SnesPpuMode7Renderer = SnesPpuMode7Renderer;