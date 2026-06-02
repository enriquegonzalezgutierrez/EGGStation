/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Super Nintendo (SNES) Cartridge Entity
 * 
 * Manages raw ROM file parsing, copier header subtraction (e.g. 512-byte headers),
 * internal header validation (metadata, mapping classifications), and checksum calculations.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Confines raw ROM loading, format-boundary alignment,
 *   and internal static catalog parsing to a dedicated entity, decoupling it from memory maps.
 */

class SnesCartridge {
    /**
     * @param {string} filename - Cartridge ROM image filename.
     */
    constructor(filename) {
        this.filename = filename;
        this.romData = null; // Uint8Array containing pure aligned ROM data
        this.romSize = 0;
        this.sramSize = 0;

        // Internal parsed header metadata
        this.romName = "";
        this.mapperType = 0; // LoROM, HiROM, etc.
        this.hasSram = false;
        this.romChecksum = 0;
    }

    /**
     * Verifies and strips copier headers (e.g., 512-byte headers) if present.
     * @param {Uint8Array} rawBytes
     * @returns {Uint8Array} Pure aligned ROM binary
     */
    static stripCopierHeader(rawBytes) {
        const size = rawBytes.length;
        // Copier files usually have sizes like 0x8000 * n + 512 (or 32768 * n + 512)
        if ((size % 0x8000) === 512) {
            console.log(`SnesCartridge::Detected and stripped 512-byte copier header.`);
            return rawBytes.subarray(512);
        }
        return rawBytes;
    }

    /**
     * Synchronously decodes and parses the SNES ROM image.
     * @param {ArrayBuffer} arrayBuffer
     */
    load(arrayBuffer) {
        let rawBytes = new Uint8Array(arrayBuffer);
        
        // 1. Strip copiers header if detected
        rawBytes = SnesCartridge.stripCopierHeader(rawBytes);
        this.romSize = rawBytes.length;

        // 2. Auto-detect HiROM vs LoROM by looking up "TMC/SFC" signatures
        // Standard header offset is 0x7FC0 for LoROM, 0xFFC0 for HiROM.
        let isHirom = false;
        if (this.romSize >= 0x10000) {
            // Compare checksum complements to identify mapping structures
            const loCom = (rawBytes[0x7FDC] | (rawBytes[0x7FDD] << 8)) ^ 0xFFFF;
            const loChk = rawBytes[0x7FDE] | (rawBytes[0x7FDF] << 8);
            const hiCom = (rawBytes[0xFFDC] | (rawBytes[0xFFDD] << 8)) ^ 0xFFFF;
            const hiChk = rawBytes[0xFFDE] | (rawBytes[0xFFDF] << 8);

            if (hiChk === hiCom && loChk !== loCom) {
                isHirom = true;
            }
        }

        const headerOffset = isHirom ? 0xFFC0 : 0x7FC0;
        if (this.romSize < headerOffset + 0x40) {
            throw new Error("SnesCartridge::Fatal: ROM image is too small to contain a standard SNES header.");
        }

        // 3. Extract ROM Title (21 Bytes, ASCII representation)
        let title = "";
        for (let i = 0; i < 21; i++) {
            const charCode = rawBytes[headerOffset + i];
            if (charCode >= 32 && charCode <= 126) {
                title += String.fromCharCode(charCode);
            }
        }
        this.romName = title.trim();

        // 4. Decode system speed, mapper standard and optional coprocessors
        const mapModeByte = rawBytes[headerOffset + 0x15];
        this.mapperType = mapModeByte & 0x0F; // 0: LoROM, 1: HiROM

        const chipsByte = rawBytes[headerOffset + 0x16];
        this.hasSram = chipsByte > 0;

        const romSizeCode = rawBytes[headerOffset + 0x17];
        const ramSizeCode = rawBytes[headerOffset + 0x18];

        // Decodes sizes to physical byte measurements (shifted scaling)
        const expectedRomSize = 0x400 << romSizeCode;
        this.sramSize = ramSizeCode > 0 ? (0x400 << ramSizeCode) : 0;

        // Align ROM arrays if file has padding or missing segments
        if (this.romSize < expectedRomSize) {
            console.warn(`SnesCartridge::Warning: ROM size (${this.romSize}) is smaller than expected size (${expectedRomSize}). Extending...`);
            this.romData = new Uint8Array(expectedRomSize);
            this.romData.set(rawBytes, 0);
            
            // Mirror remaining blocks to satisfy mapper bounds
            const fillDelta = expectedRomSize - this.romSize;
            for (let i = 0; i < fillDelta; i++) {
                this.romData[this.romSize + i] = rawBytes[i % this.romSize];
            }
        } else {
            this.romData = rawBytes;
        }

        // Parse checksum
        this.romChecksum = rawBytes[headerOffset + 0x1E] | (rawBytes[headerOffset + 0x1F] << 8);

        console.log(`SnesCartridge::ROM Metadata Decoded:`);
        console.log(` - Title      : "${this.romName}"`);
        console.log(` - Mapper Type: ${isHirom ? "HiROM" : "LoROM"}`);
        console.log(` - Checksum   : 0x${this.romChecksum.toString(16).toUpperCase()}`);
        console.log(` - ROM Size   : ${this.romSize} bytes`);
        console.log(` - SRAM Size  : ${this.sramSize} bytes`);
    }
}