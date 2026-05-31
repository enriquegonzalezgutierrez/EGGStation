/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Primary M68K CPU Master Memory Bus
 * 
 * Emulates the central physical memory bus of the Motorola 68000 processor. 
 * Decodes 24-bit physical address lines and routes snychronous data cycles 
 * to Cartridge ROM, 64KB Work RAM, VDP coprocessors, and secondary Z80 subsystems.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the primary 68K 
 * bus arbitration and byte/word multiplexing from individual CPU interpreters.
 */

class GenesisBusM68k {
    /**
     * @param {GenesisControllerManager} controllerManager - The inputs manager.
     * @param {GenesisVdp} vdp - Visual VDP Co-processor.
     * @param {GenesisPsg} psg - PSG sound card.
     * @param {GenesisYm2612} fm - Main FM Synthesizer.
     * @param {GenesisBusZ80} z80Bus - Secondary Z80 memory bus.
     */
    constructor(controllerManager, vdp, psg, fm, z80Bus) {
        this.controllerManager = controllerManager;
        this.vdp = vdp;
        this.psg = psg;
        this.fm = fm;
        this.z80Bus = z80Bus;

        // Dedicated 64KB Main Work RAM buffer (stored as 32K 16-bit words)
        this.workRam = new Uint16Array(0x8000);

        // Cartridge Save SRAM buffer (up to 64KB)
        this.externalRam = new Uint8Array(0x10000);
        this.externalRamSize = 0;
        this.externalRamMappedIn = false;
        this.externalRamWritable = false;

        // Cartridge ROM binary buffer (loaded as a 16-bit word array)
        this.cartridgeRom = null;
        this.cartridgeLength = 0;

        // Sega CD presence flag
        this.megaCdEnabled = false;
    }

    initialise() {
        this.workRam.fill(0);
        this.externalRam.fill(0);
        this.externalRamSize = 0;
        this.externalRamMappedIn = false;
        this.externalRamWritable = false;
        this.megaCdEnabled = false;
    }

    setCartridge(romBuffer) {
        if (romBuffer) {
            this.cartridgeRom = new Uint16Array(romBuffer);
            this.cartridgeLength = this.cartridgeRom.length;
            this.setupExternalRam();
        } else {
            this.cartridgeRom = null;
            this.cartridgeLength = 0;
        }
    }

    /**
     * Parses standard ROM header metadata to configure onboard backup SRAM.
     */
    setupExternalRam() {
        if (!this.cartridgeRom || this.cartridgeLength < 0x200 / 2) return;

        // Read standard SRAM "RA" signature at address 0x1B0
        const sig = this.cartridgeRom[0x1B0 / 2];
        if (sig === ((0x52 << 8) | 0x41)) { // "RA"
            const metadata = this.cartridgeRom[0x1B2 / 2];
            this.externalRamWritable = (metadata & 0x4000) !== 0;
            this.externalRamSize = 0x2000; // Standard 8KB backup RAM
            this.externalRamMappedIn = true;
        }
    }

    // ========================================================================
    // 24-BIT MASTER MEMORY READ CYCLES
    // ========================================================================

    /**
     * Reads a 16-bit word snychronously from the 68K bus.
     * @param {number} address - 24-bit physical address.
     * @param {number} targetCycle - System clock cycle timestamp.
     * @returns {number} 16-bit word data.
     */
    readWord(address, targetCycle) {
        address = address & 0xFFFFFF;
        const chunk = Math.floor(address / 0x200000) | 0;

        switch (chunk) {
            case 0: // 0x000000 - 0x1FFFFF
            case 1: // 0x200000 - 0x3FFFFF
            case 2: // 0x400000 - 0x5FFFFF
            case 3: // 0x600000 - 0x7FFFFF
                // --- 1. Cartridge ROM / Backup SRAM / Sega CD memory gates ---
                if (this.externalRamMappedIn && address >= 0x200000 && address < 0x200000 + this.externalRamSize) {
                    const offset = (address - 0x200000) & 0xFFFF;
                    return (this.externalRam[offset] << 8) | this.externalRam[offset + 1];
                }

                if (this.cartridgeRom) {
                    const wordAddr = Math.floor(address / 2) | 0;
                    if (wordAddr < this.cartridgeLength) {
                        return this.cartridgeRom[wordAddr];
                    }
                }
                break;

            case 5: { // 0xA00000 - 0xBFFFFF
                // --- 2. I/O Ports & Co-processors Registers ---
                const ioSubChunk = Math.floor(address / 0x1000) & 0xFFF;

                if (ioSubChunk < 0x10) { // 0xA00000 - 0xA0FFFF: Z80 RAM and YM2612 Ports
                    if (this.z80Bus) {
                        const z80Addr = address & 0x7FFF;
                        const byte = this.z80Bus.read(null, z80Addr, null, null, targetCycle) & 0xFF;
                        return (byte << 8) | byte; // Hardware repeats byte across 16-bit buses
                    }
                } else if (ioSubChunk === 0x10) { // 0xA10000 - 0xA10FFF: I/O Ports
                    switch (address & 0xFFFE) {
                        case 0xA10000:
                            // Version Register: overseas/domestic flag, PAL/NTSC flag, CD presence
                            const overseas = 1; // Export console standard
                            const pal = 0;      // NTSC 60Hz standard
                            const noCD = this.megaCdEnabled ? 0 : 1;
                            return ((overseas << 7) | (pal << 6) | (noCD << 5)) << 8;

                        case 0xA10002: case 0xA10004: case 0xA10006: {
                            const joyIdx = Math.floor((address - 0xA10002) / 2);
                            return this.controllerManager.read(joyIdx, 0, null, null) & 0xFF;
                        }

                        case 0xA10008: case 0xA1000A: case 0xA1000C: {
                            const joyIdx = Math.floor((address - 0xA10008) / 2);
                            return this.controllerManager.segaMultitaps[joyIdx].tlBit << 4; // Reads TL lines control
                        }
                    }
                } else if (ioSubChunk === 0x11) { // 0xA11100 - 0xA11200: System Control
                    if ((address & 0xFF00) === 0xA11100) {
                        // Z80 BUSREQ status register
                        const busObtained = 0; // standard status (0 = bus free)
                        return (0xFF ^ busObtained) << 8;
                    }
                }
                break;
            }

            case 6: // 0xC00000 - 0xDFFFFF
                // --- 3. VDP Ports Access ---
                const vdpPort = (address >> 1) & 0x1F;
                switch (vdpPort) {
                    case 0: case 1:
                        // VDP Data Port
                        return this.vdp.readData();

                    case 2: case 3:
                        // VDP Control Port
                        return this.vdp.readControl();

                    case 4: case 5: case 6: case 7: {
                        // VDP H/V Counters
                        const hCount = 0; // stub
                        const vCount = this.vdp.currentScanlineIndex & 0xFF;
                        return (vCount << 8) | hCount;
                    }
                }
                break;

            case 7: // 0xE00000 - 0xFFFFFF
                // --- 4. Main 64KB Work RAM snychronous wrapping ---
                return this.workRam[Math.floor((address & 0xFFFF) / 2) | 0];
        }

        return 0;
    }

    /**
     * Reads an 8-bit byte snychronously from the 68K bus.
     * @param {number} address - 24-bit physical address.
     * @param {number} targetCycle - System clock cycle timestamp.
     * @returns {number} 8-bit byte data.
     */
    readByte(address, targetCycle) {
        const isOdd = (address & 1) !== 0;
        const word = this.readWord(address & ~1, targetCycle);
        return (word >> (isOdd ? 0 : 8)) & 0xFF;
    }

    // ========================================================================
    // 24-BIT MASTER MEMORY WRITE CYCLES
    // ========================================================================

    /**
     * Writes a 16-bit word snychronously to the 68K bus.
     * @param {number} address - 24-bit physical address.
     * @param {number} value - 16-bit word data.
     * @param {number} mask - 16-bit write mask (0xFF00, 0x00FF, or 0xFFFF).
     * @param {number} targetCycle - System clock cycle timestamp.
     */
    writeWord(address, value, mask, targetCycle) {
        address = address & 0xFFFFFF;
        value = value & 0xFFFF;
        mask = mask & 0xFFFF;
        const chunk = Math.floor(address / 0x200000) | 0;

        switch (chunk) {
            case 0: // 0x000000 - 0x1FFFFF
            case 1: // 0x200000 - 0x3FFFFF
            case 2: // 0x400000 - 0x5FFFFF
            case 3: // 0x600000 - 0x7FFFFF
                // --- 1. Cartridge Backup SRAM writes ---
                if (this.externalRamWritable && address >= 0x200000 && address < 0x200000 + this.externalRamSize) {
                    const offset = (address - 0x200000) & 0xFFFF;
                    if ((mask & 0xFF00) !== 0) this.externalRam[offset] = (value >> 8) & 0xFF;
                    if ((mask & 0x00FF) !== 0) this.externalRam[offset + 1] = value & 0xFF;
                }
                break;

            case 5: { // 0xA00000 - 0xBFFFFF
                // --- 2. I/O Ports & Co-processors Registers ---
                const ioSubChunk = Math.floor(address / 0x1000) & 0xFFF;

                if (ioSubChunk < 0x10) { // Z80 RAM and YM2612 ports
                    if (this.z80Bus) {
                        const z80Addr = address & 0x7FFF;
                        if ((mask & 0xFF00) !== 0) {
                            this.z80Bus.write(null, z80Addr, (value >> 8) & 0xFF, null, null, targetCycle);
                        } else {
                            this.z80Bus.write(null, z80Addr + 1, value & 0xFF, null, null, targetCycle);
                        }
                    }
                } else if (ioSubChunk === 0x10) { // I/O Ports
                    if ((mask & 0x00FF) !== 0) {
                        const lowByte = value & 0xFF;
                        switch (address & 0xFFFE) {
                            case 0xA10002: case 0xA10004: case 0xA10006: {
                                const joyIdx = Math.floor((address - 0xA10002) / 2);
                                this.controllerManager.write(joyIdx, 0, lowByte);
                                break;
                            }
                        }
                    }
                } else if (ioSubChunk === 0x11) { // System control registers
                    if ((address & 0xFF00) === 0xA11100 && (mask & 0xFF00) !== 0) {
                        // Z80 BUSREQ trigger
                        const busReq = ((value >> 8) & 1) !== 0;
                        this.z80Bus.busRequested = busReq;
                    } else if ((address & 0xFF00) === 0xA11200 && (mask & 0xFF00) !== 0) {
                        // Z80 RESET trigger
                        const resetHeld = ((value >> 8) & 1) === 0;
                        this.z80Bus.resetHeld = resetHeld;
                    }
                }
                break;
            }

            case 6: // 0xC00000 - 0xDFFFFF
                // --- 3. VDP Ports Access ---
                const vdpPort = (address >> 1) & 0x1F;
                switch (vdpPort) {
                    case 0: case 1:
                        // VDP Data Port
                        this.vdp.writeData(value, () => {}, null);
                        break;

                    case 2: case 3:
                        // VDP Control Port (Registers / DMA)
                        this.vdp.writeControl(value, () => {}, null, () => {}, () => {}, null, () => {}, null, targetCycle);
                        break;

                    case 8: case 9: case 10: case 11:
                        // PSG Sound port (Active on odd-byte addresses)
                        if ((mask & 0x00FF) !== 0) {
                            this.psg.writeCommand(value & 0xFF);
                        }
                        break;
                }
                break;

            case 7: // 0xE00000 - 0xFFFFFF
                // --- 4. Main 64KB Work RAM snychronous wrapping ---
                const wordOffset = Math.floor((address & 0xFFFF) / 2) | 0;
                this.workRam[wordOffset] = (this.workRam[wordOffset] & ~mask) | (value & mask);
                break;
        }
    }

    /**
     * Writes an 8-bit byte snychronously to the 68K bus.
     * @param {number} address - 24-bit physical address.
     * @param {number} value - 8-bit byte data.
     * @param {number} targetCycle - System clock cycle timestamp.
     */
    writeByte(address, value, targetCycle) {
        const isOdd = (address & 1) !== 0;
        const mask = isOdd ? 0x00FF : 0xFF00;
        const shiftedValue = (value & 0xFF) << (isOdd ? 0 : 8);
        this.writeWord(address & ~1, shiftedValue, mask, targetCycle);
    }
}