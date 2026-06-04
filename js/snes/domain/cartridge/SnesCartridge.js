/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesCartridge (Cartridge & SRAM Controller)
 * Author: Enrique González Gutiérrez <enrique.gonzalez.gutierrez@gmail.com>
 * 
 * ROLE:
 * Manages the raw ROM buffer, battery-backed SRAM, and translates physical
 * memory address ranges into cartridge indices based on mapping rules (LoROM/HiROM).
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively manages cartridge data,
 *   SMC header stripping, and internal SNES header parsing.
 */

{
    class SnesCartridge {
        /**
         * @param {Uint8Array} romData - Cleaned headerless ROM buffer.
         * @param {Object} headerData - Parsed metadata from the internal SNES header.
         * @param {boolean} isHirom - Cartridge mapping mode flag (true: HiROM, false: LoROM).
         */
        constructor(romData, headerData, isHirom) {
            this.data = romData;
            this.header = headerData;
            this.isHirom = isHirom;

            this.sram = new Uint8Array(headerData.ramSize);
            this.hasSram = headerData.chips > 0;
            this.banks = headerData.romSize / 0x8000;
            this.sramSize = headerData.ramSize;

            log(
                "Loaded " + (this.isHirom ? "HiROM" : "LoROM") + " rom: \"" + headerData.name + "\"; " +
                "Banks: " + this.banks +
                "; Sram size: $" + getWordRep(this.hasSram ? this.sramSize : 0)
            );
        }

        /**
         * Resets SRAM (Wipes battery RAM on hard resets).
         * @param {boolean} hard - If true, clears the SRAM buffer.
         */
        reset(hard) {
            if (hard && this.hasSram) {
                this.sram.fill(0);
            }
        }

        /**
         * Reads a byte from the cartridge ROM or SRAM space.
         * @param {number} bank - 8-bit memory bank.
         * @param {number} adr - 16-bit offset address.
         * @returns {number} Unsigned 8-bit value.
         */
        read(bank, adr) {
            if (!this.isHirom) {
                // LoROM mapping rules
                if (adr < 0x8000) {
                    if (bank >= 0x70 && bank < 0x7E && this.hasSram) {
                        return this.sram[
                            (((bank - 0x70) << 15) | (adr & 0x7FFF)) & (this.sramSize - 1)
                        ];
                    }
                }
                return this.data[((bank & (this.banks - 1)) << 15) | (adr & 0x7FFF)];
            } else {
                // HiROM mapping rules
                if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
                    if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                        return this.sram[
                            (((bank & 0x3F) << 13) | (adr & 0x1FFF)) & (this.sramSize - 1)
                        ];
                    }
                }
                return this.data[(((bank & 0x3F) & (this.banks - 1)) << 16) | adr];
            }
        }

        /**
         * Writes a byte to the cartridge SRAM space.
         * @param {number} bank - 8-bit memory bank.
         * @param {number} adr - 16-bit offset address.
         * @param {number} value - Unsigned 8-bit value to write.
         */
        write(bank, adr, value) {
            if (!this.isHirom) {
                // LoROM mapping SRAM writes
                if (adr < 0x8000 && bank >= 0x70 && bank < 0x7E && this.hasSram) {
                    this.sram[
                        (((bank - 0x70) << 15) | (adr & 0x7FFF)) & (this.sramSize - 1)
                    ] = value;
                }
            } else {
                // HiROM mapping SRAM writes
                if (adr >= 0x6000 && adr < 0x8000 && this.hasSram) {
                    if (bank < 0x40 || (bank >= 0x80 && bank < 0xC0)) {
                        this.sram[
                            (((bank & 0x3F) << 13) | (adr & 0x1FFF)) & (this.sramSize - 1)
                        ] = value;
                    }
                }
            }
        }

        // ========================================================================
        // STATIC FACTORIES AND PARSERS
        // ========================================================================

        /**
         * Cleans legacy 512-byte SMC headers from raw ROM buffers if present.
         * @param {Uint8Array} rawData - Raw uploaded ROM buffer.
         * @returns {Uint8Array} Standard cleaned ROM buffer.
         */
        static stripSmcHeader(rawData) {
            if ((rawData.length - 512) % 0x8000 === 0) {
                log("Extracted legacy 512-byte SMC header.");
                return new Uint8Array(Array.prototype.slice.call(rawData, 512));
            }
            return rawData;
        }

        /**
         * Parses the internal SNES header metadata fields.
         * @param {Uint8Array} rom - Standard headerless ROM buffer.
         * @param {boolean} isHirom - Mapping mode flag.
         * @returns {Object} Structured metadata object.
         */
        static parseHeader(rom, isHirom) {
            let str = "";
            const headerOffset = isHirom ? 0xFFC0 : 0x7FC0;
            
            for (let i = 0; i < 21; i++) {
                str += String.fromCharCode(rom[headerOffset + i]);
            }
            
            const header = {
                name: str.trim(),
                type: rom[headerOffset + 0x15] & 0x0F,
                speed: rom[headerOffset + 0x15] >> 4,
                chips: rom[headerOffset + 0x16],
                romSize: 0x400 << rom[headerOffset + 0x17],
                ramSize: 0x400 << rom[headerOffset + 0x18]
            };

            if (header.romSize < rom.length) {
                let bankCount = Math.pow(2, Math.ceil(Math.log2(rom.length / 0x8000)));
                header.romSize = bankCount * 0x8000;
                log("Loaded with romSize of " + getLongRep(header.romSize));
            }

            return header;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesCartridge;
    } else if (typeof window !== 'undefined') {
        window.SnesCartridge = SnesCartridge;
        window.Cart = SnesCartridge; // Alias for backward compatibility
    }
}