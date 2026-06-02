/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain/Infrastructure Layer: VDP Mode 4 Renderer Service
 * 
 * Handles the complete background tile plane rendering for Master System Mode 4.
 * Encapsulates standard horizontal/vertical hardware scrolling locks and mirroring (SRP).
 */

class VdpMode4Renderer {
    /**
     * Renders a single background scanline under Mode 4.
     * @param {Sega315_5124_Vdp} vdp - The parent Video Display Processor.
     * @param {number} scanlineNum - Active scanline index.
     */
    static renderScanline(vdp, scanlineNum) {
        let nameTableBaseAddressMask = 0x0e;
        let nameTableBaseAddressOffset = 0;
        
        // Adjust Name Table addressing rules for extended video resolutions (224/240 lines)
        if ((vdp.yScreenLines === 224) || (vdp.yScreenLines === 240)) {
            nameTableBaseAddressMask = 0x0c;
            nameTableBaseAddressOffset = 0x700;
        }
        
        let nameTableBaseAddress = ((vdp.nameTableBaseAddress & nameTableBaseAddressMask) << 10) | nameTableBaseAddressOffset;

        // Calculate scroll offsets and boundary parameters
        const initialTile = 32 - (((vdp.register08) >> 3) & 0x1f);
        let finescrollx = vdp.register08 & 0x7;
        const initialRow = Math.floor((vdp.register09) / 8);
        let finescrolly = (vdp.register09 % 8);

        let smLen = 28; // Active map height for standard 192 lines resolution
        if ((vdp.yScreenLines === 224) || (vdp.yScreenLines === 240)) {
            smLen = 32;
        }

        const yScreenMap = Math.floor(scanlineNum / 8);
        let adder = 0;
        if ((finescrolly + (scanlineNum % 8)) >= 8) {
            adder = 1;
        }

        // Fetch the 32-word array representing Name Table tiles for this row
        const screenMap = [];
        nameTableBaseAddress += (((yScreenMap + initialRow + adder) % smLen) * 32) * 2;
        for (let x = 0; x < 32; x++) {
            let word = vdp.vRam[nameTableBaseAddress];
            word |= vdp.vRam[nameTableBaseAddress + 1] << 8;
            screenMap.push(word);
            nameTableBaseAddress += 2;             
        }

        // Handle Vertical Scroll Lock (Register 0 - Bit 7): disables scrolling on columns 24-31
        const screenMapNoscroll = [];
        if (vdp.register00 & 0x80) { 
            let nameTableBaseAddressNoScroll = ((vdp.nameTableBaseAddress >> 1) & 0x07) << 11;
            nameTableBaseAddressNoScroll += (((yScreenMap) % smLen) * 32) * 2;
            for (let x = 0; x < 32; x++) {
                let word = vdp.vRam[nameTableBaseAddressNoScroll];
                word |= vdp.vRam[nameTableBaseAddressNoScroll + 1] << 8;
                screenMapNoscroll.push(word);
                nameTableBaseAddressNoScroll += 2;             
            }
        }

        // Loop through and render all 32 columns horizontally
        for (let x = 0; x < 32; x++) {
            let word;

            if ((x >= 24) && (vdp.register00 & 0x80)) {
                // Vertical scrolling disabled for rightmost columns
                word = screenMapNoscroll[((x + initialTile) % 32)];
                finescrolly = 0;
            }
            else if ((vdp.register00 & 0x40) && (scanlineNum < 16)) { 
                // Horizontal scrolling disabled for rows 0-1 (Register 0 - Bit 6)
                word = screenMap[x];
                finescrollx = 0;
            }
            else {
                word = screenMap[((x + initialTile) % 32)];
            }

            // Extract pattern flags (bit 9: H-Flip, bit 10: V-Flip, bit 11: Palette, bit 12: Priority)
            const flipH = (word >> 9) & 0x01;
            const flipV = (word >> 10) & 0x01;
            const pal = (word >> 11) & 0x01;
            const priFlag = (word >> 12) & 0x01;

            vdp.drawLineTile((word & 0x1ff) * 32, (x * 8) + finescrollx, scanlineNum, pal, flipH, flipV, finescrolly, priFlag);   
        }
    }
}