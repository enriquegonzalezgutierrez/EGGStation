/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SegaMasterSystemBus
 * 
 * Emulates the physical Address Bus and Control Bus of the Sega Master System.
 * It decodes memory requests (/MREQ) and I/O requests (/IORQ) to route data 
 * cycles to their respective physical integrated circuits and memory blocks.
 */

class SegaMasterSystemBus {
    /**
     * @param {SegaMasterSystemCartridge} cartridge - The physical cartridge instance.
     * @param {Sega315_5124_Vdp} vdp - Sega 315-5124 Video Display Processor.
     * @param {Sega315_5124_Psg} psg - Texas Instruments SN76489 Programmable Sound Generator.
     * @param {Sega315_5297} ioController - Sega 315-5297 DB-9 Pin I/O Controller.
     */
    constructor(cartridge, vdp, psg, ioController) {
        this.cartridge = cartridge;
        this.vdp = vdp;
        this.psg = psg;

        // Factory-driven strategy pattern based on Cartridge ROM physical properties
        this.mapper = SegaMasterSystemMapperFactory.createMapper(this.cartridge);

        // Fallback implementation to handle hardware integration gracefully
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
            // Cartridge Space: Routed to the active Cartridge Mapper strategy
            return this.mapper.read(address);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // System Work RAM
            return this.systemWorkRam[address - 0xc000];
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // System Work RAM Mirror
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
            // Cartridge Space: Pass cycle to Cartridge Mapper (for bank switching or SRAM writes)
            this.mapper.write(address, data);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // System Work RAM
            this.systemWorkRam[address - 0xc000] = data;
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // System Work RAM Mirror
            this.systemWorkRam[address - 0xe000] = data;

            // Sega Mapper control registers respond to writes on mirror RAM (0xFFFC-0xFFFF)
            this.mapper.writeSystemRamOverride(address, data);
        }
    }

    /**
     * Reads a 16-bit word (little-endian) from the memory address bus.
     * @param {number} address - 16-bit starting physical address.
     * @returns {number} 16-bit word.
     */
    mreqRead16bit(address) {
        const byte1 = this.mreqRead(address);
        const byte2 = this.mreqRead(address + 1);
        return byte1 | (byte2 << 8);        
    }

    /**
     * Writes a 16-bit word (little-endian) to the memory address bus.
     * @param {number} address - 16-bit starting physical address.
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
     * @param {number} port - 8-bit physical port index.
     * @returns {number} 8-bit register state.
     */
    iorqRead(port) {
        port &= 0xff;

        if (port >= 0x40 && port < 0x80) {
            // Video Display Processor Counters (Even: Vertical Line, Odd: Horizontal Beam)
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
                return 0; // Legacy FM synthesis slot (unpopulated)
            }

            if ((port % 2) === 0) {
                // Sega DB-9 Input Controller Register DC (Controller Port 1 & Port 2 bits)
                return this.ioController.readRegisterDC();
            } else {
                // Sega DB-9 Input Controller Register DD (Port 2 bits & System state)
                return this.ioController.readRegisterDD();
            }
        }

        return 0;
    }

    /**
     * Writes an 8-bit byte to an hardware I/O Port.
     * @param {number} port - 8-bit physical port index.
     * @param {number} data - 8-bit value.
     */
    iorqWrite(port, data) {
        port &= 0xff;
        data &= 0xff;

        if (port >= 0x40 && port <= 0x7f) {
            // Sound Chip Data Register (SN76489)
            this.psg.writeByte(data);
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            // VDP Controller Ports
            if ((port % 2) === 0) {
                this.vdp.writeByteToDataPort(data);
            } else {
                this.vdp.writeByteToControlPort(data);
            }
        }
    }

    // ========================================================================
    // BACKWARD COMPATIBILITY & CPU INTERFACE WRAPPERS
    // ========================================================================
    readAddr(address)             { return this.mreqRead(address); }
    writeAddr(address, data)       { this.mreqWrite(address, data); }
    readAddr16bit(address)        { return this.mreqRead16bit(address); }
    writeAddr16bit(address, word) { this.mreqWrite16bit(address, word); }
    readPort(port)                { return this.iorqRead(port); }
    writePort(port, data)         { this.iorqWrite(port, data); }

    // Direct interface methods for hardware inputs
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

// Global legacy mapping to prevent runtime crashes during structural evolution
const smsMmu = SegaMasterSystemBus;