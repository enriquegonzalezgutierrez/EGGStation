/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain/Infrastructure Layer: VDP Mode 2 Renderer Service
 * 
 * Handles the background tile plane rendering for SG-1000 legacy Mode 2 games.
 * Decouples older VDP mapping methods from the primary SMS Mode 4 pipeline (SRP).
 */

class VdpMode2Renderer {
    /**
     * Renders a single legacy tile scanline under Mode 2 (SG-1000).
     * @param {Sega315_5124_Vdp} vdp - The parent Video Display Processor.
     * @param {number} scanlineNum - Active scanline index.
     */
    static renderScanline(vdp, scanlineNum) {
        let nameTableBaseAddress = (vdp.nameTableBaseAddress & 0x0f) << 10;

        // Parse Name Table layout in standard 3-tiered segments of 256 tiles each
        const screenMap = [];
        for (let y = 0; y < 24; y++) {
            for (let x = 0; x < 32; x++) {
                let byte = vdp.vRam[nameTableBaseAddress];

                // Map tiles to standard character ranges per vertical tier
                if ((y >= 8) && (y < 16)) {
                    byte += 0x100;
                } else if (y >= 16) {
                    byte += 0x200;
                }

                screenMap.push(byte);
                nameTableBaseAddress += 1;             
            }
        }

        const yScreenMap = Math.floor(scanlineNum / 8);

        // Draw all 32 horizontal character tiles
        for (let x = 0; x < 32; x++) {
            const char = screenMap[x + (((yScreenMap) % 24) * 32)];
            vdp.drawScanlineM2Tile(char, (x * 8), scanlineNum);   
        }
    }
}