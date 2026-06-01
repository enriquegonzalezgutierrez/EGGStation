/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Primary M68K CPU Master Memory Bus
 * 
 * Emulates the central physical memory bus of the Motorola 68000 processor. 
 * Decodes 24-bit physical address lines and routes synchronous data cycles 
 * to Cartridge ROM, 64KB Work RAM, VDP coprocessors, and secondary Z80 subsystems.
 * 
 * Aligned with hardware standards observed in BlastEm to resolve:
 * 1. Sega Mapper / SSF2 Bank-Switching: Supports games larger than 4MB by dividing 
 *    the ROM space into 8 configurable 512KB windows mapped via Bank Registers (0xA130F1 - 0xA130FF).
 * 2. Dynamic SRAM Toggling: Selectively maps/unmaps cartridge SRAM at 0x200000 
 *    based on Bank Register 0 status, avoiding ROM reading collision issues.
 * 3. Version Register Mirroring: Mirrors the version byte across both lanes of the 
 *    16-bit bus on word reads to prevent CPU checks on even/odd byte-lanes from failing.
 * 4. BUSREQ Handshake Alignment: Emulates correct active-low !BUSACK status line feedback.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates memory decoding, bank switching, 
 *   and I/O register line arbitration from CPU instruction execution.
 * - Dependency Inversion Principle (DIP): Injects peripheral co-processors via 
 *   constructor references, maintaining a decoupled communication layer.
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

        // Sega Mapper / SSF2 Bank Registers (8 slots controlling 512KB banks each)
        // Default mapping mirrors the flat ROM (0x000000 to 0x3FFFFF)
        this.bankRegisters = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        this.isSegaMapper = false;

        // TradeMark Security System (TMSS) Registers (Aligned with early Model 1 hardware by default)
        this.tmssString = new Uint16Array(2); // Stores words written to 0xA14000 and 0xA14002
        this.tmssEnabled = false; // Disabled by default to prevent false-positive lockouts on custom ROMs

        // Sega CD presence flag
        this.megaCdEnabled = false;

        // On-board I/O line status registers (Sega 315-5309 Controllers Chip)
        this.ioCtrl = new Uint8Array(3); // Ctrl 1, Ctrl 2, Ctrl 3 (0 = Input, 1 = Output)
        this.ioData = new Uint8Array([0xFF, 0xFF, 0xFF]); // Data 1, Data 2, Data 3 (Default: 0xFF VCC pull-up)

        // Hardware region standard registers (0 = NTSC, 1 = PAL)
        // Autodetected in real-time from ROM header
        this.tvStandard = 0; 
        this.overseas = 1; // 1 = Export (USA/Europe), 0 = Domestic (Japan)
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

        this.tvStandard = 0;
        this.overseas = 1;

        // Reset Sega Mapper slots to default 1:1 offsets
        this.bankRegisters.set([0, 1, 2, 3, 4, 5, 6, 7]);
        this.isSegaMapper = false;
    }

    /**
     * Mounts a ROM buffer, swaps bytes to align big-endian file structures 
     * with little-endian host platforms, parses standard SEGA headers,
     * and autodetects the console TV/Region standards.
     * @param {ArrayBuffer} romBuffer - Raw ROM binary.
     */
    setCartridge(romBuffer) {
        if (romBuffer) {
            // Clone the ArrayBuffer using .slice(0) to prevent mutating the original 
            // cached browser reference in-place, which would cause corrupt double byte-swapping 
            // on subsequent loads of the same file.
            const clonedBuffer = romBuffer.slice(0); 

            const rawBytes = new Uint8Array(clonedBuffer);
            for (let i = 0; i < rawBytes.length; i += 2) {
                const temp = rawBytes[i];
                rawBytes[i] = rawBytes[i + 1];
                rawBytes[i + 1] = temp;
            }

            this.cartridgeRom = new Uint16Array(clonedBuffer);
            this.cartridgeLength = this.cartridgeRom.length;
            
            // Detect if this is a Sega Mapper / SSF2 game (size >= 512KB and starts with "SEGA SSF" at 0x100)
            this.detectSegaMapper();

            this.setupExternalRam();

            // Autodetect console standard region from the ASCII header at offset 0x1F0 (Word index 248)
            this.autodetectRegion();
        } else {
            this.cartridgeRom = null;
            this.cartridgeLength = 0;
            this.tvStandard = 0;
            this.overseas = 1;
            this.isSegaMapper = false;
        }
    }

    /**
     * Autodetects the presence of Sega Mapper / SSF2 banking registers by scanning
     * the standard "SEGA SSF" signature at ROM address 0x100.
     */
    detectSegaMapper() {
        this.isSegaMapper = false;
        if (this.cartridgeRom && this.cartridgeLength >= 0x84) {
            // Read words corresponding to bytes 0x100 - 0x107 (word indexes 0x80 to 0x83)
            const w0 = this.cartridgeRom[0x80];
            const w1 = this.cartridgeRom[0x81];
            const w2 = this.cartridgeRom[0x82];
            const w3 = this.cartridgeRom[0x83];

            const sig = String.fromCharCode(w0 >> 8) + String.fromCharCode(w0 & 0xFF) +
                        String.fromCharCode(w1 >> 8) + String.fromCharCode(w1 & 0xFF) +
                        String.fromCharCode(w2 >> 8) + String.fromCharCode(w2 & 0xFF) +
                        String.fromCharCode(w3 >> 8) + String.fromCharCode(w3 & 0xFF);

            if (sig.startsWith("SEGA SSF")) {
                this.isSegaMapper = true;
                console.log("%c[EGGStation::Bus] Sega SSF2 Mapper detected. Bank-switching initialized.", "color: #ff007f; font-weight: bold;");
            }
        }
    }

    /**
     * Autodetects the console TV/Region standard from Sega ROM header at offset 0x1F0.
     */
    autodetectRegion() {
        this.tvStandard = 0; // Default: NTSC (60Hz)
        this.overseas = 1;   // Default: Export (USA)

        if (this.cartridgeRom && this.cartridgeLength >= 250) {
            // Read Word 248 (0x1F0) and Word 249 (0x1F2) synchronously
            const r1 = this.cartridgeRom[248];
            const r2 = this.cartridgeRom[249];

            const char1 = String.fromCharCode(r1 >> 8);
            const char2 = String.fromCharCode(r1 & 0xFF);
            const char3 = String.fromCharCode(r2 >> 8);
            const char4 = String.fromCharCode(r2 & 0xFF);

            const regionString = (char1 + char2 + char3 + char4).toUpperCase();
            console.log(`[EGGStation::RegionDetector] Parsed Header String: "${regionString}"`);

            // Check for European PAL region indicators ('E', 'F', 'P')
            if (regionString.includes('E') || regionString.includes('F') || regionString.includes('P') || regionString.includes('PAL')) {
                // Europe (PAL 50Hz, Export)
                this.tvStandard = 1;
                this.overseas = 1;
                console.log("%c[EGGStation::RegionDetector] Autodetected: Europe (PAL 50Hz)", "color: #ff007f; font-weight: bold;");
            } else if (regionString.includes('J') || regionString.includes('JPN')) {
                // Japan (NTSC 60Hz, Domestic)
                this.tvStandard = 0;
                this.overseas = 0;
                console.log("%c[EGGStation::RegionDetector] Autodetected: Japan (NTSC 60Hz)", "color: #7f00ff; font-weight: bold;");
            } else {
                // USA / Default (NTSC 60Hz, Export)
                this.tvStandard = 0;
                this.overseas = 1;
                console.log("%c[EGGStation::RegionDetector] Autodetected: USA (NTSC 60Hz)", "color: #04d361; font-weight: bold;");
            }
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
            case 1: { // 0x200000 - 0x3FFFFF
                // SRAM is mapped and enabled if SRAM is supported, and either it's a flat ROM 
                // or SRAM mapping is actively requested by Sega Mapper Register 0 (bit 0 is set)
                const sramEnabled = this.externalRamMappedIn && 
                                   (!this.isSegaMapper || (this.bankRegisters[0] & 1) === 1);

                if (sramEnabled && address >= 0x200000 && address < 0x200000 + this.externalRamSize) {
                    const offset = (address - 0x200000) & (this.externalRamSize - 1);
                    return (this.externalRam[offset] << 8) | this.externalRam[offset + 1];
                }

                // Standard ROM or Bank-Switched ROM Reading
                if (this.cartridgeRom) {
                    // Divide ROM space into 8 distinct 512KB memory slots (1 << 19 = 0x80000)
                    const slot = (address >> 19) & 7;
                    const mappedAddr = (this.bankRegisters[slot] * 0x80000) + (address & 0x7FFFF);
                    
                    const wordAddr = Math.floor(mappedAddr / 2) | 0;
                    if (wordAddr < this.cartridgeLength) {
                        return this.cartridgeRom[wordAddr];
                    }
                }
                break;
            }

            case 5: { // 0xA00000 - 0xBFFFFF
                // --- 2. I/O Ports & Co-processors Registers ---
                const ioSubChunk = (address >> 12) & 0xFF;

                if (ioSubChunk < 0x10) { // 0xA00000 - 0xA0FFFF: Z80 RAM and YM2612 Ports
                    const z80Addr = address & 0x7FFF;
                    
                    // YM2612 FM registers (0xA04000 - 0xA04003) are always readable by the 68K directly
                    const isYmPort = (z80Addr >= 0x4000 && z80Addr <= 0x4003);

                    if (isYmPort || (this.z80Bus && this.z80Bus.busRequested)) {
                        const byte = this.z80Bus.read(z80Addr, targetCycle) & 0xFF;
                        return (byte << 8) | byte; // Hardware repeats byte across 16-bit buses
                    }
                } else if (ioSubChunk === 0x10) { // 0xA10000 - 0xA10FFF: I/O Ports
                    const offset = address & 0x00FF;
                    switch (offset) {
                        case 0: case 1: { // Version Register (address odd 0xA10001)
                            const pal = this.tvStandard;      
                            const noCD = this.megaCdEnabled ? 0 : 0x20; // 0x20 represents NO_DISK (No CD connected)
                            const hardwareVer = 1; 
                            
                            const val = (this.overseas << 7) | (pal << 6) | noCD | hardwareVer; 
                            // Mirror across both lanes to support word-wide reads transparently
                            return (val << 8) | val;
                        }

                        // Gamepad Data Ports (Handshaked and filtered dynamically by active CTRL registers)
                        case 2: case 3: { // Data 1
                            const pad = this.controllerManager.read(0, targetCycle) & 0xFF;
                            const val = (pad & ~this.ioCtrl[0]) | (this.ioData[0] & this.ioCtrl[0]);
                            return (val << 8) | val;
                        }
                        case 4: case 5: { // Data 2
                            const pad = this.controllerManager.read(1, targetCycle) & 0xFF;
                            const val = (pad & ~this.ioCtrl[1]) | (this.ioData[1] & this.ioCtrl[1]);
                            return (val << 8) | val;
                        }
                        case 6: case 7: { // Data 3 / EXT
                            const val = this.ioData[2];
                            return (val << 8) | val;
                        }

                        // I/O Port Configuration Registers
                        case 8: case 9:     return (this.ioCtrl[0] << 8) | this.ioCtrl[0]; // Ctrl 1
                        case 10: case 11:   return (this.ioCtrl[1] << 8) | this.ioCtrl[1]; // Ctrl 2
                        case 12: case 13:   return (this.ioCtrl[2] << 8) | this.ioCtrl[2]; // Ctrl 3
                    }
                } else if (ioSubChunk === 0x11) { // 0xA11100 - 0xA11200: System Control
                    if ((address & 0xFFFF) === 0x1100) {
                        // Word read from 0xA11100 returns the Z80 !BUSACK status line in Bit 8.
                        // 0 = Z80 has released the bus (68K has control).
                        // 1 = Z80 has the bus (or is running).
                        // The lower byte returns 0xFF as a standard open-bus pull-up.
                        const busack = this.z80Bus.isZ80Frozen() ? 0 : 1;
                        return (busack << 8) | 0x00FF;
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
     * Writes a 16-bit word synchronously to the 68K bus.
     * @param {number} address - 24-bit physical address.
     * @param {number} value - Data word to write.
     * @param {number} mask - 16-bit operation mask.
     * @param {number} targetCycle - System clock cycle timestamp.
     */
    writeWord(address, value, mask, targetCycle) {
        address = address & 0xFFFFFF;
        value = value & 0xFFFF;
        mask = mask & 0xFFFF;
        const chunk = Math.floor(address / 0x200000) | 0;

        switch (chunk) {
            case 0: // 0x000000 - 0x1FFFFF
            case 1: { // 0x200000 - 0x3FFFFF
                // SRAM is mapped and writeable if SRAM is supported, and either it's flat ROM 
                // or we are in write-enabled state on Bank Register 0 (bit 0 is 1, and bit 1 is 0)
                const sramWriteEnabled = this.externalRamWritable && 
                                        (!this.isSegaMapper || (this.bankRegisters[0] & 3) === 1);

                if (sramWriteEnabled && address >= 0x200000 && address < 0x200000 + this.externalRamSize) {
                    const offset = (address - 0x200000) & (this.externalRamSize - 1);
                    if ((mask & 0xFF00) !== 0) this.externalRam[offset] = (value >> 8) & 0xFF;
                    if ((mask & 0x00FF) !== 0) this.externalRam[offset + 1] = value & 0xFF;
                }
                break;
            }

            case 5: { // 0xA00000 - 0xBFFFFF
                // --- 2. I/O Ports & Co-processors Registers ---
                const ioSubChunk = (address >> 12) & 0xFF;

                if (ioSubChunk < 0x10) { // Z80 RAM and YM2612 ports
                    const z80Addr = address & 0x7FFF;
                    
                    // Direct non-blocking access to YM2612 registers (0xA04000 - 0xA04003) 
                    // from the 68K CPU thread, bypassing active Z80 busreq checks.
                    const isYmPort = (z80Addr >= 0x4000 && z80Addr <= 0x4003);

                    if (isYmPort || (this.z80Bus && this.z80Bus.busRequested)) {
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
                                this.controllerManager.write(0, targetCycle, lowByte); 
                                break;
                            case 4: case 5: // Data 2
                                this.ioData[1] = lowByte;
                                this.controllerManager.write(1, targetCycle, lowByte);
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
                    // Direct precise 24-bit check on address registration, 
                    // preventing high-byte page masking from ignoring BUSREQ and RESET writes.
                    // This allows the secondary Z80 CPU to properly release from startup reset.
                    if (address === 0xA11100 && (mask & 0xFF00) !== 0) {
                        // Z80 BUSREQ trigger
                        const busReq = ((value >> 8) & 1) !== 0;
                        this.z80Bus.busRequested = busReq;
                    } else if (address === 0xA11200 && (mask & 0xFF00) !== 0) {
                        // Z80 RESET trigger
                        const resetHeld = ((value >> 8) & 1) === 0;
                        this.z80Bus.setReset(resetHeld);
                    }
                } else if (ioSubChunk === 0x13) {
                    // Sega Mapper / SSF2 Bank Registers (0xA130F1 - 0xA130FF)
                    // Intercepts writes on Bank Registers to swap ROM segments dynamically.
                    if (this.isSegaMapper && address >= 0xA130F0 && address <= 0xA130FF) {
                        if ((mask & 0x00FF) !== 0) {
                            const regIdx = ((address & 0xE) >> 1) & 7;
                            this.bankRegisters[regIdx] = value & 0xFF;
                        }
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
                        this.vdp.writeControl(
                            value, 
                            () => {}, 
                            null, 
                            () => {}, 
                            (userData, addr, cycle) => this.readWord(addr, cycle), 
                            null, 
                            () => {}, 
                            null, 
                            targetCycle
                        );
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
     * @param {number} address - 24-bit physical address.
     * @param {number} value - Data byte to write.
     * @param {number} targetCycle - System clock cycle timestamp.
     */
    writeByte(address, value, targetCycle) {
        const isOdd = (address & 1) !== 0;
        const mask = isOdd ? 0x00FF : 0xFF00;
        const shiftedValue = (value & 0xFF) << (isOdd ? 0 : 8);
        this.writeWord(address & ~1, shiftedValue, mask, targetCycle);
    }
}