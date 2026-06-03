/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuScanlineCompositor (Scanline Compositor & Color Blender)
 * Author: Enrique González Gutiérrez
 * 
 * SOLID Principles:
 * - SRP: Exclusively blends layers and outputs raw composited RGB rows.
 */

class SnesPpuScanlineCompositor {
    /**
     * Composites a full active scanline on the shared PPU viewport buffers.
     * GC-FREE: Resolves pixel values via modular reference injection.
     */
    static renderLine(ppu, line) {
        const heightLimit = ppu.frameOverscan ? 240 : 225;

        if (line === 0) {
            ppu.rangeOver = false;
            ppu.timeOver = false;
            ppu.frameOverscan = false;
            ppu.frameInterlace = false;
            ppu.spriteLineBuffer.fill(0);
            if (!ppu.forcedBlank) {
                SnesPpuSpriteEvaluator.evaluate(ppu, 0);
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
            let i = 0;

            while (i < 256) {
                let r1 = 0, g1 = 0, b1 = 0;
                let r2 = 0, g2 = 0, b2 = 0;

                if (!ppu.forcedBlank) {
                    SnesPpuBackgroundRenderer.resolveColor(ppu, false, i, line);
                    const color = ppu.resolvedColor;
                    const layer1 = ppu.resolvedLayer;
                    const pixel1 = ppu.resolvedPixel;

                    r2 = color & 0x1f;
                    g2 = (color & 0x3e0) >> 5;
                    b2 = (color & 0x7c00) >> 10;

                    if (ppu.colorClip === 3 ||
                        (ppu.colorClip === 2 && SnesPpuBackgroundRenderer.getWindowState(ppu, i, 5)) ||
                        (ppu.colorClip === 1 && !SnesPpuBackgroundRenderer.getWindowState(ppu, i, 5))) {
                        r2 = 0; g2 = 0; b2 = 0;
                    }

                    let secColor = 0;
                    let secLayer = 5;

                    if (ppu.mode === 5 || ppu.mode === 6 || ppu.pseudoHires ||
                        (ppu.getMathEnabled(i, layer1, pixel1) && ppu.addSub)) {
                        
                        SnesPpuBackgroundRenderer.resolveColor(ppu, true, i, line);
                        secColor = ppu.resolvedColor;
                        secLayer = ppu.resolvedLayer;

                        r1 = secColor & 0x1f;
                        g1 = (secColor & 0x3e0) >> 5;
                        b1 = (secColor & 0x7c00) >> 10;
                    }

                    if (ppu.getMathEnabled(i, layer1, pixel1)) {
                        if (ppu.subtractColors) {
                            r2 -= (ppu.addSub && secLayer < 5) ? r1 : ppu.fixedColorR;
                            g2 -= (ppu.addSub && secLayer < 5) ? g1 : ppu.fixedColorG;
                            b2 -= (ppu.addSub && secLayer < 5) ? b1 : ppu.fixedColorB;
                        } else {
                            r2 += (ppu.addSub && secLayer < 5) ? r1 : ppu.fixedColorR;
                            g2 += (ppu.addSub && secLayer < 5) ? g1 : ppu.fixedColorG;
                            b2 += (ppu.addSub && secLayer < 5) ? b1 : ppu.fixedColorB;
                        }

                        if (ppu.halfColors && (secLayer < 5 || !ppu.addSub)) {
                            r2 >>= 1; g2 >>= 1; b2 >>= 1;
                        }

                        r2 = Math.max(0, Math.min(31, r2));
                        g2 = Math.max(0, Math.min(31, g2));
                        b2 = Math.max(0, Math.min(31, b2));
                    }

                    if (!(ppu.mode === 5 || ppu.mode === 6 || ppu.pseudoHires)) {
                        r1 = r2; g1 = g2; b1 = b2;
                    }
                }

                const outIdx = line * 1536 + 6 * i;
                ppu.pixelOutput[outIdx]     = (r1 * bMult) & 0xff;
                ppu.pixelOutput[outIdx + 1] = (g1 * bMult) & 0xff;
                ppu.pixelOutput[outIdx + 2] = (b1 * bMult) & 0xff;
                ppu.pixelOutput[outIdx + 3] = (r2 * bMult) & 0xff;
                ppu.pixelOutput[outIdx + 4] = (g2 * bMult) & 0xff;
                ppu.pixelOutput[outIdx + 5] = (b2 * bMult) & 0xff;

                i++;
            }

            ppu.spriteLineBuffer.fill(0);
            if (!ppu.forcedBlank) {
                SnesPpuSpriteEvaluator.evaluate(ppu, line);
            }
        }
    }
}

window.SnesPpuScanlineCompositor = SnesPpuScanlineCompositor;