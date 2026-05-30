/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: VDP Post-Processor Service
 * 
 * Manages zero-allocation hardware upscalers (Scale2X, Scale4X), 
 * CRT Scanline emulators, and composite NTSC video filters (SRP / OCP).
 */

class VdpPostProcessor {
    /**
     * @param {Sega315_5124_Vdp} vdp - Reference to the core VDP co-processor.
     */
    constructor(vdp) {
        this.vdp = vdp;

        // Pre-allocated upscaling buffers to guarantee zero GC thrashing
        this.upscaledBuffer = new Uint8ClampedArray(512 * 480 * 4);
        this.scale4xBuffer = new Uint8ClampedArray(1024 * 960 * 4); // ~3.9 MB pre-allocated
        this.glbImgData = undefined;
    }

    /**
     * Sharp Scale2X upscaler. Interpolates pixel boundaries dynamically 
     * to smooth out jagged lines.
     * @param {Uint8ClampedArray} src - Source buffer (usually glbFrameBuffer, 256xY).
     * @param {Uint8ClampedArray} dst - Destination buffer (usually upscaledBuffer, 512xY*2).
     * @param {number} width - Base source width (256).
     * @param {number} height - Base source height (yScreenLines).
     */
    scale2X(src, dst, width, height) {
        const outWidth = width * 2;

        const same = (offsetA, offsetB) => {
            return src[offsetA] === src[offsetB] && 
                   src[offsetA + 1] === src[offsetB + 1] && 
                   src[offsetA + 2] === src[offsetB + 2];
        };

        for (let y = 0; y < height; y++) {
            const prevY = y > 0 ? y - 1 : 0;
            const nextY = y < height - 1 ? y + 1 : height - 1;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = (x + y * width) * 4;
                const aIdx = (x + prevY * width) * 4;
                const cIdx = (prevX + y * width) * 4;
                const bIdx = (nextX + y * width) * 4;
                const dIdx = (x + nextY * width) * 4;

                const pr = src[pIdx], pg = src[pIdx+1], pb = src[pIdx+2];

                let e0r = pr, e0g = pg, e0b = pb;
                let e1r = pr, e1g = pg, e1b = pb;
                let e2r = pr, e2g = pg, e2b = pb;
                let e3r = pr, e3g = pg, e3b = pb;

                if (same(cIdx, aIdx) && !same(cIdx, dIdx) && !same(aIdx, bIdx)) {
                    e0r = src[aIdx]; e0g = src[aIdx+1]; e0b = src[aIdx+2];
                }
                if (same(aIdx, bIdx) && !same(aIdx, cIdx) && !same(bIdx, dIdx)) {
                    e1r = src[bIdx]; e1g = src[bIdx+1]; e1b = src[bIdx+2];
                }
                if (same(dIdx, cIdx) && !same(dIdx, bIdx) && !same(cIdx, aIdx)) {
                    e2r = src[cIdx]; e2g = src[cIdx+1]; e2b = src[cIdx+2];
                }
                if (same(bIdx, dIdx) && !same(bIdx, aIdx) && !same(dIdx, cIdx)) {
                    e3r = src[dIdx]; e3g = src[dIdx+1]; e3b = src[dIdx+2];
                }

                const outY = y * 2;
                const outX = x * 2;
                const row0 = (outX + outY * outWidth) * 4;
                const row1 = (outX + (outY + 1) * outWidth) * 4;

                dst[row0] = e0r; dst[row0+1] = e0g; dst[row0+2] = e0b; dst[row0+3] = 255;
                dst[row0+4] = e1r; dst[row0+5] = e1g; dst[row0+6] = e1b; dst[row0+7] = 255;
                dst[row1] = e2r; dst[row1+1] = e2g; dst[row1+2] = e2b; dst[row1+3] = 255;
                dst[row1+4] = e3r; dst[row1+5] = e3g; dst[row1+6] = e3b; dst[row1+7] = 255;
            }
        }
    }

    /**
     * Scale4X upscaling pipeline (smart 4x depixelation filter).
     * Runs our optimized Scale2X algorithm sequentially twice.
     */
    scale4X(src, yScreenLines) {
        // Pass 1: Scale 256xY (FrameBuffer) -> 512xY*2 (upscaledBuffer)
        this.scale2X(src, this.upscaledBuffer, 256, yScreenLines);

        // Pass 2: Scale 512xY*2 (upscaledBuffer) -> 1024xY*4 (scale4xBuffer)
        this.scale2X(this.upscaledBuffer, this.scale4xBuffer, 512, yScreenLines * 2);
    }

    /**
     * Renders thin, high-resolution scanlines. It scales the image to 
     * $512 \times 480$ internally and darkens every alternate line.
     */
    applyScanlines(src, yScreenLines) {
        const dst = this.upscaledBuffer;
        const width = 256;
        const height = yScreenLines;
        const outWidth = 512;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pIdx = (x + y * width) * 4;
                const r = src[pIdx];
                const g = src[pIdx + 1];
                const b = src[pIdx + 2];

                const outY = y * 2;
                const outX = x * 2;
                const row0 = (outX + outY * outWidth) * 4;
                const row1 = (outX + (outY + 1) * outWidth) * 4;

                dst[row0] = r; dst[row0+1] = g; dst[row0+2] = b; dst[row0+3] = 255;
                dst[row0+4] = r; dst[row0+5] = g; dst[row0+6] = b; dst[row0+7] = 255;

                dst[row1] = Math.floor(r * 0.4); 
                dst[row1+1] = Math.floor(g * 0.4); 
                dst[row1+2] = Math.floor(b * 0.4); 
                dst[row1+3] = 255;
                
                dst[row1+4] = Math.floor(r * 0.4); 
                dst[row1+5] = Math.floor(g * 0.4); 
                dst[row1+6] = Math.floor(b * 0.4); 
                dst[row1+7] = 255;
            }
        }
    }

    /**
     * Implements an optimized 3-tap horizontal color blending filter 
     * to simulate standard analog RF/Composite TV signal leakage.
     */
    applyNtsdBleed(src, yScreenLines) {
        const dst = this.upscaledBuffer; // Re-use 512 buffer as standard 256 target
        const width = 256;
        const height = yScreenLines;

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width * 4;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = rowOffset + (x * 4);
                const prevIdx = rowOffset + (prevX * 4);
                const nextIdx = rowOffset + (nextX * 4);

                dst[pIdx] = Math.floor((src[prevIdx] * 0.25) + (src[pIdx] * 0.50) + (src[nextIdx] * 0.25));
                dst[pIdx + 1] = Math.floor((src[prevIdx + 1] * 0.25) + (src[pIdx + 1] * 0.50) + (src[nextIdx + 1] * 0.25));
                dst[pIdx + 2] = Math.floor((src[prevIdx + 2] * 0.25) + (src[pIdx + 2] * 0.50) + (src[nextIdx + 2] * 0.25));
                dst[pIdx + 3] = 255;
            }
        }
    }

    /**
     * Resizes and blits the active frame buffer.
     * @param {CanvasRenderingContext2D} ctx - Target Canvas context.
     * @param {Uint8ClampedArray} src - The core frame buffer.
     * @param {number} yScreenLines - Current active screen lines.
     * @param {number} postProcessMode - Selected filter.
     */
    blit(ctx, src, yScreenLines, postProcessMode) {
        let scaleFactor = 1;
        if (postProcessMode === 2 || postProcessMode === 3) scaleFactor = 2; // Scale2X and Scanlines scale to 2x (512x)
        if (postProcessMode === 4) scaleFactor = 4; // Scale4X Cartoon HD scales to 4x (1024x)

        const targetWidth = 256 * scaleFactor;
        const targetHeight = yScreenLines * scaleFactor;

        // Dynamically adjust the host canvas width and height properties to match
        if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
            ctx.canvas.width = targetWidth;
            ctx.canvas.height = targetHeight;
            this.glbImgData = undefined; // Force image data reconstitution
        }

        if (this.glbImgData === undefined) {
            this.glbImgData = ctx.createImageData(targetWidth, targetHeight);
        }

        // Active scale limits calculated to support safe array copy
        const activeLength = targetWidth * targetHeight * 4;

        // Apply visual upscaling or do standard blit
        if (postProcessMode === 2) {
            this.scale2X(src, this.upscaledBuffer, 256, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 3) {
            this.applyScanlines(src, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 4) {
            this.scale4X(src, yScreenLines);
            this.glbImgData.data.set(this.scale4xBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 5) {
            this.applyNtsdBleed(src, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else {
            // Sharp 1x or Bilinear
            this.glbImgData.data.set(src.subarray(0, activeLength));
        }

        ctx.putImageData(this.glbImgData, 0, 0);
    }
}