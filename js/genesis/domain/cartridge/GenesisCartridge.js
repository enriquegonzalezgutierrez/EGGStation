/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cartridge/GenesisCartridge.js
 * 
 * Domain Layer: Sega Genesis / Mega Drive Cartridge Entity
 * 
 * Role:
 * Represents the physical Cartridge hardware. 
 * Responsibilities include holding the binary ROM payload, fixing byte-endianness 
 * for TypedArrays, and extracting physical header metadata (Region, SRAM, SSF2 signatures).
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively handles ROM data parsing and 
 *   header metadata extraction. It does NOT handle memory bus routing or bank switching.
 */

class GenesisCartridge {
    constructor() {
        // ROM Binary Buffers
        this.rom = null;
        this.length = 0;

        // Hardware Region Metadata
        this.tvStandard = 0; // 0 = NTSC (60Hz), 1 = PAL (50Hz)
        this.overseas = 1;   // 1 = Export (USA/Europe), 0 = Domestic (Japan)

        // Cartridge Internal Components Metadata
        this.hasSram = false;
        this.sramWritable = false;
        this.sramSize = 0;
        
        // Custom Mapper Signature
        this.isSegaMapper = false; // True if SSF2 (Super Street Fighter II) Bank Switching is required
    }

    /**
     * Loads a raw ArrayBuffer, aligns byte-endianness, and extracts metadata.
     * @param {ArrayBuffer} romBuffer - Raw ROM binary buffer.
     */
    load(romBuffer) {
        if (!romBuffer || !(romBuffer instanceof ArrayBuffer)) {
            throw new Error("[GenesisCartridge] Fatal: Invalid ROM ArrayBuffer.");
        }

        const clonedBuffer = romBuffer.slice(0);
        const rawBytes = new Uint8Array(clonedBuffer);

        this.detectAndFixEndianness(rawBytes);

        // Load byte-swapped buffer into a 16-bit word array
        this.rom = new Uint16Array(clonedBuffer);
        this.length = this.rom.length;

        this.parseRegion();
        this.parseSramMetadata();
        this.detectSegaMapper();

        console.log(`[GenesisCartridge] Loaded ${this.length * 2} bytes.`);
    }

    /**
     * Real Sega Genesis ROMs are Big-Endian ("SE" at offset 0x100).
     * Automatically byte-swaps the buffer if the ROM is Big-Endian on disk 
     * so that the Little-Endian Uint16Array reads it correctly.
     * @param {Uint8Array} rawBytes - 8-bit view of the ROM buffer.
     */
    detectAndFixEndianness(rawBytes) {
        if (rawBytes.length < 0x102) return;

        let needByteSwap = false;
        // Check for standard "SEGA" signature at 0x100
        if (rawBytes[0x100] === 0x53 && rawBytes[0x101] === 0x45) { // 'S' and 'E'
            needByteSwap = true;
            console.log("[GenesisCartridge] Big-Endian ROM detected on disk. Byte-swapping for Uint16Array alignment...");
        } else {
            console.log("[GenesisCartridge] Little-Endian ROM detected on disk. Skipping byte swap.");
        }

        if (needByteSwap) {
            for (let i = 0; i < rawBytes.length; i += 2) {
                const temp = rawBytes[i];
                rawBytes[i] = rawBytes[i + 1];
                rawBytes[i + 1] = temp;
            }
        }
    }

    /**
     * Autodetects the console TV/Region standard from Sega ROM header at offset 0x1F0.
     */
    parseRegion() {
        this.tvStandard = 0; // Default: NTSC (60Hz)
        this.overseas = 1;   // Default: Export (USA)

        if (!this.rom || this.length < 250) return;

        // Read Word 248 (0x1F0) and Word 249 (0x1F2)
        const r1 = this.rom[248];
        const r2 = this.rom[249];

        const char1 = String.fromCharCode(r1 >> 8);
        const char2 = String.fromCharCode(r1 & 0xFF);
        const char3 = String.fromCharCode(r2 >> 8);
        const char4 = String.fromCharCode(r2 & 0xFF);

        const regionString = (char1 + char2 + char3 + char4).toUpperCase();
        console.log(`[GenesisCartridge] Parsed Header Region String: "${regionString}"`);

        if (regionString.includes('E') || regionString.includes('F') || regionString.includes('P') || regionString.includes('PAL')) {
            this.tvStandard = 1;
            this.overseas = 1;
            console.log("%c[GenesisCartridge] Autodetected: Europe (PAL 50Hz)", "color: #ff007f; font-weight: bold;");
        } else if (regionString.includes('J') || regionString.includes('JPN')) {
            this.tvStandard = 0;
            this.overseas = 0;
            console.log("%c[GenesisCartridge] Autodetected: Japan (NTSC 60Hz)", "color: #7f00ff; font-weight: bold;");
        } else {
            this.tvStandard = 0;
            this.overseas = 1;
            console.log("%c[GenesisCartridge] Autodetected: USA (NTSC 60Hz)", "color: #04d361; font-weight: bold;");
        }
    }

    /**
     * Parses standard ROM header metadata to configure onboard backup SRAM.
     */
    parseSramMetadata() {
        this.hasSram = false;
        this.sramWritable = false;
        this.sramSize = 0;

        if (!this.rom || this.length < 0x100) return;

        // Read standard SRAM "RA" signature at address 0x1B0
        const sig = this.rom[0x1B0 / 2];
        if (sig === ((0x52 << 8) | 0x41)) { // 'R' and 'A'
            const metadata = this.rom[0x1B2 / 2];
            this.sramWritable = (metadata & 0x4000) !== 0;
            this.sramSize = 0x2000; // Standard 8KB backup RAM mapping size
            this.hasSram = true;
            console.log("[GenesisCartridge] On-board SRAM detected.");
        }
    }

    /**
     * Autodetects the presence of Sega Mapper / SSF2 banking registers by scanning
     * the standard "SEGA SSF" signature at ROM address 0x100.
     */
    detectSegaMapper() {
        this.isSegaMapper = false;
        if (!this.rom || this.length < 0x84) return;

        // Read words corresponding to bytes 0x100 - 0x107 (word indexes 0x80 to 0x83)
        const w0 = this.rom[0x80];
        const w1 = this.rom[0x81];
        const w2 = this.rom[0x82];
        const w3 = this.rom[0x83];

        const sig = String.fromCharCode(w0 >> 8) + String.fromCharCode(w0 & 0xFF) +
                    String.fromCharCode(w1 >> 8) + String.fromCharCode(w1 & 0xFF) +
                    String.fromCharCode(w2 >> 8) + String.fromCharCode(w2 & 0xFF) +
                    String.fromCharCode(w3 >> 8) + String.fromCharCode(w3 & 0xFF);

        if (sig.startsWith("SEGA SSF")) {
            this.isSegaMapper = true;
            console.log("%c[GenesisCartridge] Sega SSF2 Mapper detected.", "color: #ff007f; font-weight: bold;");
        }
    }
}