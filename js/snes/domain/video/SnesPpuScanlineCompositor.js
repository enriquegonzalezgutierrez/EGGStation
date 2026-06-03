/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuScanlineCompositor (JIT-Optimized Compositor & Diagnostic Timing)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Blends background and sprite layers together, processes math operations, 
 * windows clipping, sub/main screen priorities, and writes the final 
 * composited active scanline rows to the shared pixel buffer.
 * 
 * SOLID Principles:
 * - SRP: Exclusively blends active layers and generates color-blended scanline rows.
 */

class SnesPpuScanlineCompositor {
    /**
     * Composites a full active scanline on the shared PPU viewport buffers.
     * GC-FREE: Optimized execution hot-loop resolving colors with local variable caching.
     */
    static renderLine(ppu, line) {
        const heightLimit = ppu.frameOverscan ? 240 : 225;

        if (line === 0) {
            // Safe initialization of the diagnostic sprite timer
            ppu.profSpriteTime = 0;

            ppu.rangeOver = false;
            ppu.timeOver = false;
            ppu.frameOverscan = false;
            ppu.frameInterlace = false;
            ppu.spriteLineBuffer.fill(0);
            if (!ppu.forcedBlank) {
                const t0 = performance.now();
                SnesPpuSpriteEvaluator.evaluate(ppu, 0);
                ppu.profSpriteTime = (ppu.profSpriteTime || 0) + (performance.now() - t0);
            }
        } else if (line === heightLimit) {
            if (!ppu.forcedBlank) {
                ppu.oamAdr = ppu.oamRegAdr;
                ppu.oamInHigh = ppu.oamRegInHigh;
                ppu.oamSecond = false;
            }
            ppu.frameInterlace = ppu.interlace;
            ppu.evenFrame = !ppu.evenFrame;
        } else if (line > 0 && line < heightLimit) {
            if (line === 1) {
                ppu.mosaicStartLine = 1;
            }
            if (ppu.mode === 7) {
                SnesPpuMode7Renderer.generateCoords(ppu, line);
            }

            ppu.lastTileFetchedX.fill(-1);
            ppu.lastTileFetchedY.fill(-1);
            ppu.optHorBuffer.fill(0);
            ppu.optVerBuffer.fill(0);
            ppu.lastOrigTileX.fill(-1);

            const bMult = SnesPpuMathUnit.BRIGHTNESS_MULTS[ppu.brightness];
            const pixelOutput = ppu.pixelOutput;
            
            // Cache PPU state configurations to minimize object property lookup overhead in the pixel loop
            const forcedBlank = ppu.forcedBlank;
            const mode = ppu.mode;
            const colorClip = ppu.colorClip;
            const pseudoHires = ppu.pseudoHires;
            const addSub = ppu.addSub;
            const subtractColors = ppu.subtractColors;
            const halfColors = ppu.halfColors;
            const fixedColorR = ppu.fixedColorR;
            const fixedColorG = ppu.fixedColorG;
            const fixedColorB = ppu.fixedColorB;

            let i = 0;

            while (i < 256) {
                let r1 = 0, g1 = 0, b1 = 0;
                let r2 = 0, g2 = 0, b2 = 0;

                if (!forcedBlank) {
                    SnesPpuBackgroundRenderer.resolveColor(ppu, false, i, line);
                    const color = ppu.resolvedColor;
                    const layer1 = ppu.resolvedLayer;
                    const pixel1 = ppu.resolvedPixel;

                    r2 = color & 0x1f;
                    g2 = (color & 0x3e0) >> 5;
                    b2 = (color & 0x7c00) >> 10;

                    // Window clipping checks
                    if (colorClip === 3 ||
                        (colorClip === 2 && SnesPpuBackgroundRenderer.getWindowState(ppu, i, 5)) ||
                        (colorClip === 1 && !SnesPpuBackgroundRenderer.getWindowState(ppu, i, 5))) {
                        r2 = 0; g2 = 0; b2 = 0;
                    }

                    let secColor = 0;
                    let secLayer = 5;

                    // Evaluate math enabling exactly once per pixel to avoid expensive duplicate calls
                    const mathEnabled = ppu.getMathEnabled(i, layer1, pixel1);

                    if (mode === 5 || mode === 6 || pseudoHires || (mathEnabled && addSub)) {
                        SnesPpuBackgroundRenderer.resolveColor(ppu, true, i, line);
                        secColor = ppu.resolvedColor;
                        secLayer = ppu.resolvedLayer;

                        r1 = secColor & 0x1f;
                        g1 = (secColor & 0x3e0) >> 5;
                        b1 = (secColor & 0x7c00) >> 10;
                    }

                    if (mathEnabled) {
                        if (subtractColors) {
                            r2 -= (addSub && secLayer < 5) ? r1 : fixedColorR;
                            g2 -= (addSub && secLayer < 5) ? g1 : fixedColorG;
                            b2 -= (addSub && secLayer < 5) ? b1 : fixedColorB;
                        } else {
                            r2 += (addSub && secLayer < 5) ? r1 : fixedColorR;
                            g2 += (addSub && secLayer < 5) ? g1 : fixedColorG;
                            b2 += (addSub && secLayer < 5) ? b1 : fixedColorB;
                        }

                        if (halfColors && (secLayer < 5 || !addSub)) {
                            r2 >>= 1; g2 >>= 1; b2 >>= 1;
                        }

                        // Fast ternary boundary clamps (up to x10 speedup over Math.min/max)
                        r2 = r2 < 0 ? 0 : (r2 > 31 ? 31 : r2);
                        g2 = g2 < 0 ? 0 : (g2 > 31 ? 31 : g2);
                        b2 = b2 < 0 ? 0 : (b2 > 31 ? 31 : b2);
                    }

                    if (!(mode === 5 || mode === 6 || pseudoHires)) {
                        r1 = r2; g1 = g2; b1 = b2;
                    }
                }

                const outIdx = line * 512 + (i << 1); // Fast bitwise shift instead of multiplication
                const r1b = (r1 * bMult) | 0;
                const g1b = (g1 * bMult) | 0;
                const b1b = (b1 * bMult) | 0;
                const r2b = (r2 * bMult) | 0;
                const g2b = (g2 * bMult) | 0;
                const b2b = (b2 * bMult) | 0;

                pixelOutput[outIdx]     = r1b | (g1b << 8) | (b1b << 16) | 0xff000000;
                pixelOutput[outIdx + 1] = r2b | (g2b << 8) | (b2b << 16) | 0xff000000;

                i++;
            }

            ppu.spriteLineBuffer.fill(0);
            if (!forcedBlank) {
                const t0 = performance.now();
                SnesPpuSpriteEvaluator.evaluate(ppu, line);
                ppu.profSpriteTime = (ppu.profSpriteTime || 0) + (performance.now() - t0);
            }
        }
    }
}

window.SnesPpuScanlineCompositor = SnesPpuScanlineCompositor;