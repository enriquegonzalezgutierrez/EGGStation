/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesPpuMathUnit (Hardware Arithmetic, Address Remapper & Static Constants)
 * Author: Enrique González Gutiérrez
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles hardware translations, address remaps, signed casts, and PPU lookup tables.
 */

class SnesPpuMathUnit {
    // Shared zero-allocation lookups encapsulated inside the Math Unit
    static LAYERS_PER_MODE = Object.freeze([
        4, 0, 1, 4, 0, 1, 4, 2, 3, 4, 2, 3,
        4, 0, 1, 4, 0, 1, 4, 2, 4, 2, 5, 5,
        4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
        4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
        4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
        4, 0, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5,
        4, 0, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5,
        4, 4, 4, 0, 4, 5, 5, 5, 5, 5, 5, 5,
        2, 4, 0, 1, 4, 0, 1, 4, 2, 4, 5, 5,
        4, 4, 1, 4, 0, 4, 1, 5, 5, 5, 5, 5
    ]);

    static PRIO_PER_MODE = Object.freeze([
        3, 1, 1, 2, 0, 0, 1, 1, 1, 0, 0, 0,
        3, 1, 1, 2, 0, 0, 1, 1, 0, 0, 5, 5,
        3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
        3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
        3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
        3, 1, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5,
        3, 1, 2, 1, 0, 0, 5, 5, 5, 5, 5, 5,
        3, 2, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5,
        1, 3, 1, 1, 2, 0, 0, 1, 0, 0, 5, 5,
        3, 2, 1, 1, 0, 0, 0, 5, 5, 5, 5, 5
    ]);

    static BIT_PER_MODE = Object.freeze([
        2, 2, 2, 2,
        4, 4, 2, 5,
        4, 4, 5, 5,
        8, 4, 5, 5,
        8, 2, 5, 5,
        4, 2, 5, 5,
        4, 5, 5, 5,
        8, 5, 5, 5,
        4, 4, 2, 5,
        8, 7, 5, 5
    ]);

    static LAYER_COUNT_PER_MODE = Object.freeze([12, 10, 8, 8, 8, 8, 6, 5, 10, 7]);

    static BRIGHTNESS_MULTS = Object.freeze([
        0.1, 0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5, 6, 6.6, 7.1, 7.6, 8.2
    ]);

    static SPRITE_TILE_OFFSETS = Object.freeze([
        0, 1, 2, 3, 4, 5, 6, 7,
        16, 17, 18, 19, 20, 21, 22, 23,
        32, 33, 34, 35, 36, 37, 38, 39,
        48, 49, 50, 51, 52, 53, 54, 55,
        64, 65, 66, 67, 68, 69, 70, 71,
        80, 81, 82, 83, 84, 85, 86, 87,
        96, 97, 98, 99, 100, 101, 102, 103,
        112, 113, 114, 115, 116, 117, 118, 119
    ]);

    static SPRITE_SIZES = Object.freeze([
        1, 1, 1, 2, 2, 4, 2, 2,
        2, 4, 8, 4, 8, 8, 4, 4
    ]);

    /**
     * Translates a standard VRAM address into its remapped variant.
     */
    static getVramRemap(ppu) {
        let adr = ppu.vramAdr & 0x7fff;
        if (ppu.vramRemap === 1) {
            adr = (adr & 0xff00) | ((adr & 0xe0) >> 5) | ((adr & 0x1f) << 3);
        } else if (ppu.vramRemap === 2) {
            adr = (adr & 0xfe00) | ((adr & 0x1c0) >> 6) | ((adr & 0x3f) << 3);
        } else if (ppu.vramRemap === 3) {
            adr = (adr & 0xfc00) | ((adr & 0x380) >> 7) | ((adr & 0x7f) << 3);
        }
        return adr;
    }

    static get13Signed(val) {
        return (val & 0x1000) > 0 ? -(8192 - (val & 0xfff)) : (val & 0xfff);
    }

    static get16Signed(val) {
        return (val & 0x8000) > 0 ? -(65536 - val) : val;
    }

    /**
     * Emulates the physical SNES hardware multiplication register calculation.
     */
    static getMultResult(a, b) {
        b = b < 0 ? 65536 + b : b;
        b >>= 8;
        b = ((b & 0x80) > 0) ? -(256 - b) : b;
        const ans = a * b;
        return ans < 0 ? 16777216 + ans : ans;
    }
}

window.SnesPpuMathUnit = SnesPpuMathUnit;