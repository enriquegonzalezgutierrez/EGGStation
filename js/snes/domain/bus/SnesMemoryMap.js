/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesMemoryMap
 * Author: Enrique González Gutiérrez <enrique.gonzalez.gutierrez@gmail.com>
 * 
 * ROLE:
 * Defines the physical memory layout, address decoding rules, and access 
 * timings for the SNES architecture.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively calculates memory speed 
 *   cycles based on the physical address, keeping the CPU bus timing clean.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Block-scoped block to prevent global variable and identifier collisions.
 * - Pure static calculation designed for rapid JIT compilation inlining.
 */

{
    class SnesMemoryMap {
        /**
         * Calculates the exact number of CPU master cycles required to access a specific memory address.
         * Based on the original hardware timing specifications (FastROM vs SlowROM, WRAM speed, I/O speed).
         * 
         * @param {number} address - 24-bit physical address.
         * @param {boolean} fastMemEnabled - Indicates if the CPU has FastROM enabled.
         * @returns {number} CPU master cycles (6, 8, or 12).
         */
        static getAccessCycles(address, fastMemEnabled) {
            const bank = (address >> 16) & 0xFF;
            const offset = address & 0xFFFF;
            
            // Banks 0x40-0x7F: Cartridge SlowROM / WRAM mirrors (Always 8 cycles)
            if (bank >= 0x40 && bank < 0x80) {
                return 8;
            }
            
            // Banks 0xC0-0xFF: Cartridge High Banks (Speed depends on FastROM toggle)
            if (bank >= 0xC0) {
                return fastMemEnabled ? 6 : 8;
            }
            
            // Banks 0x00-0x3F and 0x80-0xBF (System Area & Low Cartridge Banks)
            if (offset < 0x2000) {
                return 8; // WRAM Mirrors (8 cycles)
            }
            if (offset < 0x4000) {
                return 6; // PPU / APU Hardware I/O Ports (Fast: 6 cycles)
            }
            if (offset < 0x4200) {
                return 12; // Old Joypad Ports / CPU Registers (X-Slow: 12 cycles)
            }
            if (offset < 0x6000) {
                return 6; // Hardware I/O Ports / DMA Registers (Fast: 6 cycles)
            }
            if (offset < 0x8000) {
                return 8; // Expansion RAM / DSP (8 cycles)
            }
            
            // Offset >= 0x8000 in low banks
            return (fastMemEnabled && bank >= 0x80) ? 6 : 8;
        }
    }

    // Export for module systems (Node/Bundlers) or attach to global scope
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesMemoryMap;
    } else if (typeof window !== 'undefined') {
        window.SnesMemoryMap = SnesMemoryMap;
    }
}