/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega Master System Memory and I/O Bus
 * 
 * Emulates the physical Address Bus and Control Bus of the Sega Master System.
 * It decodes memory requests (/MREQ) and I/O requests (/IORQ) to route data 
 * cycles to their respective integrated circuits and memory blocks (SRP).
 */

class SegaMasterSystemBus {
    /**
     * @param {SegaMasterSystemCartridge} cartridge - The loaded physical cartridge.
     * @param {Sega315_5124_Vdp} vdp - Sega 315-5124 Video Display Processor.
     * @param {Sega315_5124_Psg} psg - Texas Instruments SN76489-compatible Programmable Sound Generator.
     * @param {Sega315_5297} ioController - Sega 315-5297 DB-9 Pin I/O Controller.
     */
    constructor(cartridge, vdp, psg, ioController) {
        this.cartridge = cartridge;
        this.vdp = vdp;
        this.psg = psg;

        // OCP: Instantiates the mapper strategy dynamically based on ROM parameters
        this.mapper = SegaMasterSystemMapperFactory.createMapper(this.cartridge);

        // Standard I/O chip. Fallback ensures runtime safety
        this.ioController = ioController || new Sega315_5297();

        // 8KB System Work RAM (0xC000 - 0xDFFF, mirrored at 0xE000 - 0xFFFF)
        this.systemWorkRam = new Uint8Array(0x2000).fill(0);
    }

    // ========================================================================
    // MEMORY REQUESTS (/MREQ)
    // ========================================================================

    /**
     * Reads an 8-bit byte from the memory address bus.
     * @param {number} address - 16-bit physical memory address.
     * @returns {number} 8-bit value.
     */
    mreqRead(address) {
        address &= 0xffff;

        if (address <= 0xbfff) {
            // Cartridge ROM/RAM Space (Delegated to active Mapper)
            return this.mapper.read(address);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // Main 8KB System Work RAM
            return this.systemWorkRam[address - 0xc000];
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // Mirrored System Work RAM space
            return this.systemWorkRam[address - 0xe000];
        }

        return 0;
    }

    /**
     * Writes an 8-bit byte to the memory address bus.
     * @param {number} address - 16-bit physical memory address.
     * @param {number} data - 8-bit value.
     */
    mreqWrite(address, data) {
        address &= 0xffff;
        data &= 0xff;

        if (address <= 0xbfff) {
            // Write to Cartridge Mapper registers or cartridge RAM
            this.mapper.write(address, data);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // Main 8KB System Work RAM
            this.systemWorkRam[address - 0xc000] = data;
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // Mirrored System Work RAM space
            this.systemWorkRam[address - 0xe000] = data;

            // Sega Mapper control registers respond to writes on mirror RAM (0xFFFC-0xFFFF)
            this.mapper.writeSystemRamOverride(address, data);
        }
    }

    /**
     * Reads a 16-bit word (little-endian) from the memory address bus.
     * @param {number} address - 16-bit physical address.
     * @returns {number} 16-bit word.
     */
    mreqRead16bit(address) {
        const byte1 = this.mreqRead(address);
        const byte2 = this.mreqRead(address + 1);
        return byte1 | (byte2 << 8);        
    }

    /**
     * Writes a 16-bit word (little-endian) to the memory address bus.
     * @param {number} address - 16-bit physical address.
     * @param {number} word - 16-bit word value.
     */
    mreqWrite16bit(address, word) {
        const byte1 = word & 0xff;
        const byte2 = (word >> 8) & 0xff;

        this.mreqWrite(address, byte1);
        this.mreqWrite(address + 1, byte2);
    }    

    // ========================================================================
    // I/O REQUESTS (/IORQ)
    // ========================================================================

    /**
     * Reads an 8-bit byte from an hardware I/O Port.
     * @param {number} port - 8-bit hardware port.
     * @returns {number} 8-bit register state.
     */
    iorqRead(port) {
        port &= 0xff;

        if (port >= 0x40 && port < 0x80) {
            // Video Display Processor Counters (Even: Vertical line, Odd: Horizontal beam)
            if ((port & 0x01) === 0x00) {
                return this.vdp.readDataPort(0x7e);
            } else {
                return this.vdp.readDataPort(0x7f);
            }
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            // Video Display Processor (Even: Data Port, Odd: Control Port)
            if ((port % 2) === 0) {
                return this.vdp.readByteFromDataPort();
            } else {
                return this.vdp.readByteFromControlPort();
            }        
        } 
        else if (port >= 0xc0 && port <= 0xff) {
            if (port === 0xde || port === 0xdf) {
                return 0xff; 
            }
            if (port === 0xf2) {
                return 0; // FM Synthesis (YM2413) slot (unpopulated)
            }

            if ((port % 2) === 0) {
                // Read Sega I/O Controller Register DC (Joypad 1 & Joypad 2 Up/Down)
                return this.ioController.readRegisterDC();
            } else {
                // Read Sega I/O Controller Register DD (Joypad 2 Buttons, System state)
                return this.ioController.readRegisterDD();
            }
        }

        return 0;
    }

    /**
     * Writes an 8-bit byte to an hardware I/O Port.
     * @param {number} port - 8-bit hardware port.
     * @param {number} data - 8-bit value.
     */
    iorqWrite(port, data) {
        port &= 0xff;
        data &= 0xff;

        if (port >= 0x40 && port <= 0x7f) {
            // Programmable Sound Generator Data Register (SN76489)
            this.psg.writeByte(data);
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            // Video Display Processor Command/Data Writes
            if ((port % 2) === 0) {
                this.vdp.writeByteToDataPort(data);
            } else {
                this.vdp.writeByteToControlPort(data);
            }
        }
    }

    // ========================================================================
    // BACKWARD COMPATIBILITY WRAPPERS
    // ========================================================================
    readAddr(address)             { return this.mreqRead(address); }
    writeAddr(address, data)       { this.mreqWrite(address, data); }
    readAddr16bit(address)        { return this.mreqRead16bit(address); }
    writeAddr16bit(address, word) { this.mreqWrite16bit(address, word); }
    readPort(port)                { return this.iorqRead(port); }
    writePort(port, data)         { this.iorqWrite(port, data); }

    // Joystick Event Wrappers
    pressButton1()   { this.ioController.pressButton1(); }
    depressButton1() { this.ioController.depressButton1(); }
    pressButton2()   { this.ioController.pressButton2(); }
    depressButton2() { this.ioController.depressButton2(); }
    pressDown()      { this.ioController.pressDown(); }
    depressDown()    { this.ioController.depressDown(); }
    pressUp()        { this.ioController.pressUp(); }
    depressUp()      { this.ioController.depressUp(); }
    pressLeft()      { this.ioController.pressLeft(); }
    depressLeft()    { this.ioController.depressLeft(); }
    pressRight()     { this.ioController.pressRight(); }
    depressRight()   { this.ioController.depressRight(); }
}