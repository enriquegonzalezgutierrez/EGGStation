/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuRegisterMapper (Bus Register Port Router)
 * Author: Enrique González Gutiérrez
 * 
 * SOLID Principles:
 * - SRP: Maps registers 0x2100 - 0x213F to state mutations on the PPU.
 */

class SnesPpuRegisterMapper {
    /**
     * Reads state from PPU registers.
     */
    static read(ppu, adr) {
        switch (adr) {
            case 0x34: return ppu.multResult & 0xff;
            case 0x35: return (ppu.multResult & 0xff00) >> 8;
            case 0x36: return (ppu.multResult & 0xff0000) >> 16;
            case 0x37:
                if (ppu.snes.ppuLatch) {
                    ppu.latchedHpos = ppu.snes.xPos >> 2;
                    ppu.latchedVpos = ppu.snes.yPos;
                    ppu.countersLatched = true;
                }
                return ppu.snes.openBus;
            case 0x38: {
                let val;
                if (!ppu.oamSecond) {
                    val = ppu.oamInHigh ? (ppu.highOam[ppu.oamAdr & 0xf] & 0xff) : (ppu.oam[ppu.oamAdr] & 0xff);
                    ppu.oamSecond = true;
                } else {
                    val = ppu.oamInHigh ? (ppu.highOam[ppu.oamAdr & 0xf] >> 8) : (ppu.oam[ppu.oamAdr] >> 8);
                    ppu.oamAdr = (ppu.oamAdr + 1) & 0xff;
                    ppu.oamInHigh = (ppu.oamAdr === 0) ? !ppu.oamInHigh : ppu.oamInHigh;
                    ppu.oamSecond = false;
                }
                return val;
            }
            case 0x39: {
                const val = ppu.vramReadBuffer;
                if (!ppu.vramIncOnHigh) {
                    ppu.vramReadBuffer = ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)];
                    ppu.vramAdr = (ppu.vramAdr + ppu.vramInc) & 0xffff;
                }
                return val & 0xff;
            }
            case 0x3a: {
                const val = ppu.vramReadBuffer;
                if (ppu.vramIncOnHigh) {
                    ppu.vramReadBuffer = ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)];
                    ppu.vramAdr = (ppu.vramAdr + ppu.vramInc) & 0xffff;
                }
                return (val & 0xff00) >> 8;
            }
            case 0x3b: {
                let val;
                if (!ppu.cgramSecond) {
                    val = ppu.cgram[ppu.cgramAdr] & 0xff;
                    ppu.cgramSecond = true;
                } else {
                    val = ppu.cgram[ppu.cgramAdr++] >> 8;
                    ppu.cgramAdr &= 0xff;
                    ppu.cgramSecond = false;
                }
                return val;
            }
            case 0x3c: {
                const val = !ppu.latchHsecond ? (ppu.latchedHpos & 0xff) : ((ppu.latchedHpos & 0xff00) >> 8);
                ppu.latchHsecond = !ppu.latchHsecond;
                return val;
            }
            case 0x3d: {
                const val = !ppu.latchVsecond ? (ppu.latchedVpos & 0xff) : ((ppu.latchedVpos & 0xff00) >> 8);
                ppu.latchVsecond = !ppu.latchVsecond;
                return val;
            }
            case 0x3e: {
                let val = ppu.timeOver ? 0x80 : 0;
                val |= ppu.rangeOver ? 0x40 : 0;
                return val | 0x1;
            }
            case 0x3f: {
                const val = (ppu.evenFrame ? 0x80 : 0) | (ppu.countersLatched ? 0x40 : 0);
                if (ppu.snes.ppuLatch) {
                    ppu.countersLatched = false;
                }
                ppu.latchHsecond = false;
                ppu.latchVsecond = false;
                return val | 0x3;
            }
            default:
                return ppu.snes.openBus;
        }
    }

    /**
     * Writes incoming register values directly into mapped physical states.
     */
    static write(ppu, adr, value) {
        switch (adr) {
            case 0x00:
                ppu.forcedBlank = (value & 0x80) > 0;
                ppu.brightness = value & 0xf;
                break;
            case 0x01:
                ppu.sprAdr1 = (value & 0x7) << 13;
                ppu.sprAdr2 = ((value & 0x18) + 8) << 9;
                ppu.objSize = (value & 0xe0) >> 5;
                break;
            case 0x02:
                ppu.oamAdr = value;
                ppu.oamRegAdr = ppu.oamAdr;
                ppu.oamInHigh = ppu.oamRegInHigh;
                ppu.oamSecond = false;
                break;
            case 0x03:
                ppu.oamInHigh = (value & 0x1) > 0;
                ppu.objPriority = (value & 0x80) > 0;
                ppu.oamAdr = ppu.oamRegAdr;
                ppu.oamRegInHigh = ppu.oamInHigh;
                ppu.oamSecond = false;
                break;
            case 0x04:
                if (!ppu.oamSecond) {
                    if (ppu.oamInHigh) {
                        ppu.highOam[ppu.oamAdr & 0xf] = (ppu.highOam[ppu.oamAdr & 0xf] & 0xff00) | value;
                    } else {
                        ppu.oamBuffer = (ppu.oamBuffer & 0xff00) | value;
                    }
                    ppu.oamSecond = true;
                } else {
                    if (ppu.oamInHigh) {
                        ppu.highOam[ppu.oamAdr & 0xf] = (ppu.highOam[ppu.oamAdr & 0xf] & 0xff) | (value << 8);
                    } else {
                        ppu.oamBuffer = (ppu.oamBuffer & 0xff) | (value << 8);
                        ppu.oam[ppu.oamAdr] = ppu.oamBuffer;
                    }
                    ppu.oamAdr = (ppu.oamAdr + 1) & 0xff;
                    ppu.oamInHigh = (ppu.oamAdr === 0) ? !ppu.oamInHigh : ppu.oamInHigh;
                    ppu.oamSecond = false;
                }
                break;
            case 0x05:
                ppu.mode = value & 0x7;
                ppu.layer3Prio = (value & 0x08) > 0;
                ppu.bigTiles[0] = (value & 0x10) > 0;
                ppu.bigTiles[1] = (value & 0x20) > 0;
                ppu.bigTiles[2] = (value & 0x40) > 0;
                ppu.bigTiles[3] = (value & 0x80) > 0;
                break;
            case 0x06:
                ppu.mosaicEnabled[0] = (value & 0x1) > 0;
                ppu.mosaicEnabled[1] = (value & 0x2) > 0;
                ppu.mosaicEnabled[2] = (value & 0x4) > 0;
                ppu.mosaicEnabled[3] = (value & 0x8) > 0;
                ppu.mosaicSize = ((value & 0xf0) >> 4) + 1;
                ppu.mosaicStartLine = ppu.snes.yPos;
                break;
            case 0x07: case 0x08: case 0x09: case 0x0a:
                ppu.tilemapWider[adr - 7] = (value & 0x1) > 0;
                ppu.tilemapHigher[adr - 7] = (value & 0x2) > 0;
                ppu.tilemapAdr[adr - 7] = (value & 0xfc) << 8;
                break;
            case 0x0b:
                ppu.tileAdr[0] = (value & 0xf) << 12;
                ppu.tileAdr[1] = (value & 0xf0) << 8;
                break;
            case 0x0c:
                ppu.tileAdr[2] = (value & 0xf) << 12;
                ppu.tileAdr[3] = (value & 0xf0) << 8;
                break;
            case 0x0d:
                ppu.mode7Hoff = SnesPpuMathUnit.get13Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                ppu.bgHoff[0] = (value << 8) | (ppu.offPrev1 & 0xf8) | (ppu.offPrev2 & 0x7);
                ppu.offPrev1 = value; ppu.offPrev2 = value;
                break;
            case 0x0f: case 0x11: case 0x13:
                ppu.bgHoff[(adr - 0xd) >> 1] = (value << 8) | (ppu.offPrev1 & 0xf8) | (ppu.offPrev2 & 0x7);
                ppu.offPrev1 = value; ppu.offPrev2 = value;
                break;
            case 0x0e:
                ppu.mode7Voff = SnesPpuMathUnit.get13Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                ppu.bgVoff[0] = (value << 8) | (ppu.offPrev1 & 0xff);
                ppu.offPrev1 = value;
                break;
            case 0x10: case 0x12: case 0x14:
                ppu.bgVoff[(adr - 0xe) >> 1] = (value << 8) | (ppu.offPrev1 & 0xff);
                ppu.offPrev1 = value;
                break;
            case 0x15: {
                const incVal = value & 0x3;
                ppu.vramInc = (incVal === 0) ? 1 : (incVal === 1 ? 32 : 128);
                ppu.vramRemap = (value & 0x0c) >> 2;
                ppu.vramIncOnHigh = (value & 0x80) > 0;
                break;
            }
            case 0x16:
                ppu.vramAdr = (ppu.vramAdr & 0xff00) | value;
                ppu.vramReadBuffer = ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)];
                break;
            case 0x17:
                ppu.vramAdr = (ppu.vramAdr & 0xff) | (value << 8);
                ppu.vramReadBuffer = ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)];
                break;
            case 0x18:
                ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)] = (ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)] & 0xff00) | value;
                if (!ppu.vramIncOnHigh) {
                    ppu.vramAdr = (ppu.vramAdr + ppu.vramInc) & 0xffff;
                }
                break;
            case 0x19:
                ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)] = (ppu.vram[SnesPpuMathUnit.getVramRemap(ppu)] & 0xff) | (value << 8);
                if (ppu.vramIncOnHigh) {
                    ppu.vramAdr = (ppu.vramAdr + ppu.vramInc) & 0xffff;
                }
                break;
            case 0x1a:
                ppu.mode7LargeField = (value & 0x80) > 0;
                ppu.mode7Char0fill = (value & 0x40) > 0;
                ppu.mode7FlipY = (value & 0x2) > 0;
                ppu.mode7FlipX = (value & 0x1) > 0;
                break;
            case 0x1b:
                ppu.mode7A = SnesPpuMathUnit.get16Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                ppu.multResult = SnesPpuMathUnit.getMultResult(ppu.mode7A, ppu.mode7B);
                break;
            case 0x1c:
                ppu.mode7B = SnesPpuMathUnit.get16Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                ppu.multResult = SnesPpuMathUnit.getMultResult(ppu.mode7A, ppu.mode7B);
                break;
            case 0x1d:
                ppu.mode7C = SnesPpuMathUnit.get16Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                break;
            case 0x1e:
                ppu.mode7D = SnesPpuMathUnit.get16Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                break;
            case 0x1f:
                ppu.mode7X = SnesPpuMathUnit.get13Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                break;
            case 0x20:
                ppu.mode7Y = SnesPpuMathUnit.get13Signed((value << 8) | ppu.mode7Prev);
                ppu.mode7Prev = value;
                break;
            case 0x21:
                ppu.cgramAdr = value;
                ppu.cgramSecond = false;
                break;
            case 0x22:
                if (!ppu.cgramSecond) {
                    ppu.cgramBuffer = (ppu.cgramBuffer & 0xff00) | value;
                    ppu.cgramSecond = true;
                } else {
                    ppu.cgramBuffer = (ppu.cgramBuffer & 0xff) | (value << 8);
                    ppu.cgram[ppu.cgramAdr++] = ppu.cgramBuffer;
                    ppu.cgramAdr &= 0xff;
                    ppu.cgramSecond = false;
                }
                break;
            case 0x23:
                ppu.window1Inversed[0] = (value & 0x01) > 0;
                ppu.window1Enabled[0] = (value & 0x02) > 0;
                ppu.window2Inversed[0] = (value & 0x04) > 0;
                ppu.window2Enabled[0] = (value & 0x08) > 0;
                ppu.window1Inversed[1] = (value & 0x10) > 0;
                ppu.window1Enabled[1] = (value & 0x20) > 0;
                ppu.window2Inversed[1] = (value & 0x40) > 0;
                ppu.window2Enabled[1] = (value & 0x80) > 0;
                break;
            case 0x24:
                ppu.window1Inversed[2] = (value & 0x01) > 0;
                ppu.window1Enabled[2] = (value & 0x02) > 0;
                ppu.window2Inversed[2] = (value & 0x04) > 0;
                ppu.window2Enabled[2] = (value & 0x08) > 0;
                ppu.window1Inversed[3] = (value & 0x10) > 0;
                ppu.window1Enabled[3] = (value & 0x20) > 0;
                ppu.window2Inversed[3] = (value & 0x40) > 0;
                ppu.window2Enabled[3] = (value & 0x80) > 0;
                break;
            case 0x25:
                ppu.window1Inversed[4] = (value & 0x01) > 0;
                ppu.window1Enabled[4] = (value & 0x02) > 0;
                ppu.window2Inversed[4] = (value & 0x04) > 0;
                ppu.window2Enabled[4] = (value & 0x08) > 0;
                ppu.window1Inversed[5] = (value & 0x10) > 0;
                ppu.window1Enabled[5] = (value & 0x20) > 0;
                ppu.window2Inversed[5] = (value & 0x40) > 0;
                ppu.window2Enabled[5] = (value & 0x80) > 0;
                break;
            case 0x26: ppu.window1Left = value; break;
            case 0x27: ppu.window1Right = value; break;
            case 0x28: ppu.window2Left = value; break;
            case 0x29: ppu.window2Right = value; break;
            case 0x2a:
                ppu.windowMaskLogic[0] = value & 0x3;
                ppu.windowMaskLogic[1] = (value & 0xc) >> 2;
                ppu.windowMaskLogic[2] = (value & 0x30) >> 4;
                ppu.windowMaskLogic[3] = (value & 0xc0) >> 6;
                break;
            case 0x2b:
                ppu.windowMaskLogic[4] = value & 0x3;
                ppu.windowMaskLogic[5] = (value & 0xc) >> 2;
                break;
            case 0x2c:
                ppu.mainScreenEnabled[0] = (value & 0x1) > 0;
                ppu.mainScreenEnabled[1] = (value & 0x2) > 0;
                ppu.mainScreenEnabled[2] = (value & 0x4) > 0;
                ppu.mainScreenEnabled[3] = (value & 0x8) > 0;
                ppu.mainScreenEnabled[4] = (value & 0x10) > 0;
                break;
            case 0x2d:
                ppu.subScreenEnabled[0] = (value & 0x1) > 0;
                ppu.subScreenEnabled[1] = (value & 0x2) > 0;
                ppu.subScreenEnabled[2] = (value & 0x4) > 0;
                ppu.subScreenEnabled[3] = (value & 0x8) > 0;
                ppu.subScreenEnabled[4] = (value & 0x10) > 0;
                break;
            case 0x2e:
                ppu.mainScreenWindow[0] = (value & 0x1) > 0;
                ppu.mainScreenWindow[1] = (value & 0x2) > 0;
                ppu.mainScreenWindow[2] = (value & 0x4) > 0;
                ppu.mainScreenWindow[3] = (value & 0x8) > 0;
                ppu.mainScreenWindow[4] = (value & 0x10) > 0;
                break;
            case 0x2f:
                ppu.subScreenWindow[0] = (value & 0x1) > 0;
                ppu.subScreenWindow[1] = (value & 0x2) > 0;
                ppu.subScreenWindow[2] = (value & 0x4) > 0;
                ppu.subScreenWindow[3] = (value & 0x8) > 0;
                ppu.subScreenWindow[4] = (value & 0x10) > 0;
                break;
            case 0x30:
                ppu.colorClip = (value & 0xc0) >> 6;
                ppu.preventMath = (value & 0x30) >> 4;
                ppu.addSub = (value & 0x2) > 0;
                ppu.directColor = (value & 0x1) > 0;
                break;
            case 0x31:
                ppu.subtractColors = (value & 0x80) > 0;
                ppu.halfColors = (value & 0x40) > 0;
                ppu.mathEnabled[0] = (value & 0x1) > 0;
                ppu.mathEnabled[1] = (value & 0x2) > 0;
                ppu.mathEnabled[2] = (value & 0x4) > 0;
                ppu.mathEnabled[3] = (value & 0x8) > 0;
                ppu.mathEnabled[4] = (value & 0x10) > 0;
                ppu.mathEnabled[5] = (value & 0x20) > 0;
                break;
            case 0x32:
                if ((value & 0x80) > 0) ppu.fixedColorB = value & 0x1f;
                if ((value & 0x40) > 0) ppu.fixedColorG = value & 0x1f;
                if ((value & 0x20) > 0) ppu.fixedColorR = value & 0x1f;
                break;
            case 0x33:
                ppu.mode7ExBg = (value & 0x40) > 0;
                ppu.pseudoHires = (value & 0x08) > 0;
                ppu.overscan = (value & 0x04) > 0;
                ppu.objInterlace = (value & 0x02) > 0;
                ppu.interlace = (value & 0x01) > 0;
                break;
            default:
                break;
        }
    }
}

window.SnesPpuRegisterMapper = SnesPpuRegisterMapper;