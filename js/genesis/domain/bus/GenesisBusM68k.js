/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Primary M68K CPU Master Memory Bus
 * 
 * Emulates the central physical memory bus of the Motorola 68000 processor. 
 * Decodes 24-bit physical address lines and routes synchronous data cycles 
 * to Cartridge ROM, 64KB Work RAM, VDP coprocessors, and secondary Z80 subsystems.
 * Fully aligned with MDTracer reference standards to ensure accurate memory 
 * mapping and non-blocking VDP DMA transfers.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates 68K memory space decoding, 
 *   arbitration, and byte/word multiplexing from CPU execution pipelines.
 * - Dependency Inversion Principle (DIP): Receives hardware dependencies via 
 *   constructor injection rather than hard-coupling.
 */

class GenesisBusM68k {
    /**
     * @param {GenesisControllerManager} controllerManager - Input manager interface.
     * @param {GenesisVdp} vdp - Visual Display Processor interface.
     * @param {GenesisPsg} psg - SN76489-compatible PSG sound core.
     * @param {GenesisYm2612} fm - YM2612 FM synthesizer.
     * @param {GenesisBusZ80} z80Bus - Secondary Z80 memory bus interface.
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

        // TradeMark Security System (TMSS) Registers (Nuked-MD hardware-aligned)
        this.tmssString = new Uint16Array(2); // Stores words written to 0xA14000 and 0xA14002
        this.tmssEnabled = true;

        // Sega CD presence flag
        this.megaCdEnabled = false;

        // On-board I/O line status registers (Sega 315-5309 Controllers Chip)
        this.ioCtrl = new Uint8Array(3); // Ctrl 1, Ctrl 2, Ctrl 3 (0 = Input, 1 = Output)
        this.ioData = new Uint8Array([0xFF, 0xFF, 0xFF]); // Data 1, Data 2, Data 3 (Default: 0xFF VCC pull-up)
    }

    /**
     * Resets the Master Bus to cold-boot conditions.
     */
    initialise() {
        this.workRam.fill(0);
        this.externalRam.fill(0);
        this.externalRamSize = 0;
        this.externalRamMappedIn = false;
        this.externalRamWritable = false;
        this.megaCdEnabled = false;
        
        // Clear TMSS register string
        this.tmssString.fill(0);

        // Reset I/O Registers
        this.ioCtrl.fill(0);
        this.ioData.fill(0xFF);
    }

    /**
     * Mounts a ROM buffer, swaps bytes to align big-endian file structures 
     * with little-endian host platforms, and parses standard SEGA headers.
     * @param {ArrayBuffer} romBuffer - Raw ROM binary.
     */
    setCartridge(romBuffer) {
        if (romBuffer) {
            // Sega Genesis ROMs are stored in Big-Endian. 
            // We must byte-swap the data to read correct 16-bit words on little-endian host systems.
            const rawBytes = new Uint8Array(romBuffer);
            for (let i = 0; i < rawBytes.length; i += 2) {
                const temp = rawBytes[i];
                rawBytes[i] = rawBytes[i + 1];
                rawBytes[i + 1] = temp;
            }

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

    /**
     * Verifies if TMSS is unlocked ("SEGA" security string must match)
     * @returns {boolean} True if VDP/PSG access is permitted.
     */
    isTmssUnlocked() {
        if (!this.tmssEnabled) return true;
        return this.tmssString[0] === 0x5345 && this.tmssString[1] === 0x4741; // "SE" and "GA"
    }

    // ========================================================================
    // 24-BIT MASTER MEMORY READ CYCLES
    // ========================================================================

    /**
     * Reads a 16-bit word synchronously from the 68K bus.
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
                // --- 1. Cartridge ROM / Backup SRAM ---
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
                const ioSubChunk = (address >> 12) & 0xFF;

                if (ioSubChunk < 0x10) { // 0xA00000 - 0xA0FFFF: Z80 RAM and YM2612 Ports
                    if (this.z80Bus && this.z80Bus.busRequested) {
                        const z80Addr = address & 0x7FFF;
                        const byte = this.z80Bus.read(z80Addr, targetCycle) & 0xFF;
                        return (byte << 8) | byte; // Hardware repeats byte across 16-bit buses
                    }
                } else if (ioSubChunk === 0x10) { // 0xA10000 - 0xA10FFF: I/O Ports
                    const offset = address & 0x00FF;
                    switch (offset) {
                        case 0: case 1: { // Version Register (D7-D0, physically on address odd 0xA10001)
                            const overseas = 1; 
                            const pal = 0;      
                            const noCD = this.megaCdEnabled ? 0 : 1;
                            return (overseas << 7) | (pal << 6) | (noCD << 5); // Return in low byte
                        }

                        // Gamepad Data Ports (Handshaked and filtered dynamically by active CTRL registers)
                        case 2: case 3: { // Data 1
                            const pad = this.controllerManager.read(0, targetCycle) & 0xFF;
                            return (pad & ~this.ioCtrl[0]) | (this.ioData[0] & this.ioCtrl[0]);
                        }
                        case 4: case 5: { // Data 2
                            const pad = this.controllerManager.read(1, targetCycle) & 0xFF;
                            return (pad & ~this.ioCtrl[1]) | (this.ioData[1] & this.ioCtrl[1]);
                        }
                        case 6: case 7: { // Data 3 / EXT
                            return this.ioData[2];
                        }

                        // I/O Port Configuration Registers
                        case 8: case 9:     return this.ioCtrl[0]; // Ctrl 1
                        case 10: case 11:   return this.ioCtrl[1]; // Ctrl 2
                        case 12: case 13:   return this.ioCtrl[2]; // Ctrl 3
                    }
                } else if (ioSubChunk === 0x11) { // 0xA11100 - 0xA11200: System Control
                    if ((address & 0xFF00) === 0xA11100) {
                        // Z80 BUSREQ status register (Nuked-MD arbitration)
                        const busObtained = this.z80Bus.busRequested ? 0 : 1; // 0 = bus free to Z80
                        return (0xFF ^ busObtained) << 8;
                    }
                } else if (ioSubChunk === 0x14) { // 0xA14000 - 0xA140FF: TMSS Security Area
                    if (address === 0xA14000) return this.tmssString[0];
                    if (address === 0xA14002) return this.tmssString[1];
                }
                break;
            }

            case 6: // 0xC00000 - 0xDFFFFF
                // --- 3. VDP Ports Access ---
                if (!this.isTmssUnlocked()) {
                    return 0xFFFF; // Returns high impedance on locked bus
                }

                const vdpPort = (address >> 1) & 0x1F;
                switch (vdpPort) {
                    case 0: case 1:
                        return this.vdp.readData();

                    case 2: case 3:
                        return this.vdp.readControl();

                    case 4: case 5: case 6: case 7: {
                        const vCount = this.vdp.currentScanlineIndex & 0xFF;
                        const hCount = this.vdp.hcounter & 0xFF;
                        return (vCount << 8) | hCount;
                    }
                }
                break;

            case 7: // 0xE00000 - 0xFFFFFF
                // --- 4. Main 64KB Work RAM wrapping ---
                return this.workRam[Math.floor((address & 0xFFFF) / 2) | 0];
        }

        return 0;
    }

    /**
     * Reads an 8-bit byte synchronously from the 68K bus.
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
     * Writes a 16-bit word synchronously to the 68K bus.
     */
    writeWord(address, value, mask, targetCycle) {
        address = address & 0xFFFFFF;
        value = value & 0xFFFF;
        mask = mask & 0xFFFF;
        const chunk = Math.floor(address / 0x200000) | 0;

        switch (chunk) {
            case 0: // 0x000000 - 0x1FFFFF
            case 1: // 0x200000 - 0x3FFFFF
                // --- 1. Cartridge Backup SRAM writes ---
                if (this.externalRamWritable && address >= 0x200000 && address < 0x200000 + this.externalRamSize) {
                    const offset = (address - 0x200000) & 0xFFFF;
                    if ((mask & 0xFF00) !== 0) this.externalRam[offset] = (value >> 8) & 0xFF;
                    if ((mask & 0x00FF) !== 0) this.externalRam[offset + 1] = value & 0xFF;
                }
                break;

            case 5: { // 0xA00000 - 0xBFFFFF
                // --- 2. I/O Ports & Co-processors Registers ---
                const ioSubChunk = (address >> 12) & 0xFF;

                if (ioSubChunk < 0x10) { // Z80 RAM and YM2612 ports
                    if (this.z80Bus && this.z80Bus.busRequested) {
                        const z80Addr = address & 0x7FFF;
                        if ((mask & 0xFF00) !== 0) {
                            this.z80Bus.write(z80Addr, (value >> 8) & 0xFF, targetCycle);
                        } else {
                            this.z80Bus.write(z80Addr + 1, value & 0xFF, targetCycle);
                        }
                    }
                } else if (ioSubChunk === 0x10) { // I/O Ports
                    if ((mask & 0x00FF) !== 0) {
                        const lowByte = value & 0xFF;
                        const offset = address & 0x00FF;
                        switch (offset) {
                            case 2: case 3: // Data 1
                                this.ioData[0] = lowByte;
                                this.controllerManager.write(0, lowByte);
                                break;
                            case 4: case 5: // Data 2
                                this.ioData[1] = lowByte;
                                this.controllerManager.write(1, lowByte);
                                break;
                            case 6: case 7: // Data 3 / EXT
                                this.ioData[2] = lowByte;
                                break;
                            case 8: case 9: // Ctrl 1
                                this.ioCtrl[0] = lowByte;
                                break;
                            case 10: case 11: // Ctrl 2
                                this.ioCtrl[1] = lowByte;
                                break;
                            case 12: case 13: // Ctrl 3
                                this.ioCtrl[2] = lowByte;
                                break;
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
                } else if (ioSubChunk === 0x14) { // TMSS Register Check
                    if (address === 0xA14000) this.tmssString[0] = value & 0xFFFF;
                    if (address === 0xA14002) this.tmssString[1] = value & 0xFFFF;
                }
                break;
            }

            case 6: // 0xC00000 - 0xDFFFFF
                // --- 3. VDP Ports Access ---
                if (!this.isTmssUnlocked()) {
                    return; 
                }

                const vdpPort = (address >> 1) & 0x1F;
                switch (vdpPort) {
                    case 0: case 1:
                        this.vdp.writeData(value, () => {}, null);
                        break;

                    case 2: case 3:
                        // CRITICAL HARDWARE FIX: Injected 'this.readWord.bind(this)' as the primary DMA memory-fetcher!
                        this.vdp.writeControl(value, () => {}, null, () => {}, this.readWord.bind(this), null, () => {}, null, targetCycle);
                        break;

                    case 8: case 9: case 10: case 11:
                        if ((mask & 0x00FF) !== 0) {
                            this.psg.writeCommand(value & 0xFF);
                        }
                        break;
                }
                break;

            case 7: // 0xE00000 - 0xFFFFFF
                // --- 4. Main 64KB Work RAM wrapping ---
                const wordOffset = Math.floor((address & 0xFFFF) / 2) | 0;
                this.workRam[wordOffset] = (this.workRam[wordOffset] & ~mask) | (value & mask);
                break;
        }
    }

    /**
     * Writes an 8-bit byte synchronously to the 68K bus.
     */
    writeByte(address, value, targetCycle) {
        const isOdd = (address & 1) !== 0;
        const mask = isOdd ? 0x00FF : 0xFF00;
        const shiftedValue = (value & 0xFF) << (isOdd ? 0 : 8);
        this.writeWord(address & ~1, shiftedValue, mask, targetCycle);
    }
}