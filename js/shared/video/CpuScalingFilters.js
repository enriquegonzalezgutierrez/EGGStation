/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/video/CpuScalingFilters.js
 * 
 * Infrastructure Layer: CPU Video Scaling & Filtering Engine
 * 
 * Role:
 * Implements high-performance, CPU-bound video upscaling and post-processing filters.
 * Contains algorithms for Scale2X, Scale4X, scanline simulation, and NTSC RF bleed.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively contains raw pixel array 
 *   mathematical transformations, fully decoupled from GPU WebGL context managers.
 */

class CpuScalingFilters {
    /**
     * Highly optimized Scale2X CPU-side algorithm using Loop Boundary Separation 
     * to eliminate branch prediction stalls.
     */
    static scale2X(src32, dst32, width, height) {
        const outWidth = width * 2;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;

        for (let y = 0; y < height; y++) {
            const prevY = y > 0 ? y - 1 : 0;
            const nextY = y < heightMinus1 ? y + 1 : heightMinus1;

            const rowP = y * width;
            const rowA = prevY * width;
            const rowD = nextY * width;

            const outY = y * 2;
            const rowOut0 = outY * outWidth;
            const rowOut1 = (outY + 1) * outWidth;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < widthMinus1 ? x + 1 : widthMinus1;

                const p = src32[rowP + x];
                const a = src32[rowA + x];
                const b = src32[rowP + nextX];
                const c = src32[rowP + prevX];
                const d = src32[rowD + x];

                let e0 = p, e1 = p, e2 = p, e3 = p;

                if (c === a && c !== d && a !== b) e0 = a;
                if (a === b && a !== c && b !== d) e1 = b;
                if (d === c && d !== b && c !== a) e2 = c;
                if (b === d && b !== a && d !== c) e3 = d;

                const outX = x * 2;
                dst32[rowOut0 + outX] = e0;
                dst32[rowOut0 + outX + 1] = e1;
                dst32[rowOut1 + outX] = e2;
                dst32[rowOut1 + outX + 1] = e3;
            }
        }
    }

    /**
     * Executes two consecutive Scale2X steps using a pre-allocated intermediate buffer.
     * @param {Uint32Array} src32 - 32-bit packed source pixel array.
     * @param {Uint32Array} dst32 - 32-bit packed destination pixel array.
     * @param {number} width - Game screen resolution width.
     * @param {number} height - Game screen resolution height.
     * @param {Uint32Array} upscaledTemp32 - Pre-allocated intermediate 2x buffer.
     */
    static scale4X(src32, dst32, width, height, upscaledTemp32) {
        this.scale2X(src32, upscaledTemp32, width, height); 
        this.scale2X(upscaledTemp32, dst32, width * 2, height * 2);
    }

    /**
     * Applies a hardware-accurate scanline overlay filter, reducing odd row luminance by 60%.
     */
    static applyScanlines(src32, dst32, width, height) {
        const outWidth = width * 2;

        for (let y = 0; y < height; y++) {
            const rowP = y * width;
            const outY = y * 2;
            const rowOut0 = outY * outWidth;
            const rowOut1 = (outY + 1) * outWidth;

            for (let x = 0; x < width; x++) {
                const p = src32[rowP + x];
                const r = p & 0xff;
                const g = (p >> 8) & 0xff;
                const b = (p >> 16) & 0xff;
                
                // Emulate physical CRT shadow mask by reducing odd scanline luminance by 60%
                const rScan = (r * 0.4) | 0;
                const gScan = (g * 0.4) | 0;
                const bScan = (b * 0.4) | 0;
                const pScan = rScan | (gScan << 8) | (bScan << 16) | 0xff000000;

                const outX = x * 2;
                dst32[rowOut0 + outX] = p;
                dst32[rowOut0 + outX + 1] = p;
                dst32[rowOut1 + outX] = pScan;
                dst32[rowOut1 + outX + 1] = pScan;
            }
        }
    }

    /**
     * Simulates RF coaxial cable analog chroma bleed using horizontal Gaussian filtering.
     */
    static applyNtsdBleed(src32, dst32, width, height) {
        const src8 = new Uint8Array(src32.buffer, src32.byteOffset, src32.length * 4);

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width * 4;
            const dstRow = y * width;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = rowOffset + (x * 4);
                const prevIdx = rowOffset + (prevX * 4);
                const nextIdx = rowOffset + (nextX * 4);

                // Apply horizontal Gaussian filter to simulate RF coax cable luminance bleed
                const r = ((src8[prevIdx] * 0.25) + (src8[pIdx] * 0.50) + (src8[nextIdx] * 0.25)) | 0;
                const g = ((src8[prevIdx + 1] * 0.25) + (src8[pIdx + 1] * 0.50) + (src8[nextIdx + 1] * 0.25)) | 0;
                const b = ((src8[prevIdx + 2] * 0.25) + (src8[pIdx + 2] * 0.50) + (src8[nextIdx + 2] * 0.25)) | 0;

                dst32[dstRow + x] = r | (g << 8) | (b << 16) | 0xff000000;
            }
        }
    }
}