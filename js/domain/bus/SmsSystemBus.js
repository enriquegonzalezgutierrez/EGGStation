/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: SmsSystemBus
 * 
 * Emulates the physical Address Bus and Control Bus of the Sega Master System.
 * It routes memory requests (/MREQ) and I/O requests (/IORQ) to their respective
 * integrated chips based on the physical address decoding of the system.
 */

class SmsSystemBus {
    constructor(cartridge, vdp, psg, ioController) {
        this.theCartridge = cartridge;
        this.theVDP = vdp;
        this.theSoundchip = psg;
        
        // Restore Mapper Strategy initialization from Factory (OCP)
        this.mapper = SmsMapperFactory.createMapper(this.theCartridge);

        // Defensive Design: If instantiated with legacy 3-parameters, auto-instantiate the I/O Controller
        this.ioController = ioController || new Sega315_5297();

        this.systemRam = new Uint8Array(0x2000).fill(0); // 8KB System SRAM
    }

    // ------------------------------------------------------------------------
    // MEMORY REQUEST BUS CYCLE (/MREQ)
    // ------------------------------------------------------------------------

    /**
     * Emulates Memory Read Cycle (/MREQ + /RD)
     */
    mreqRead(address) {
        address &= 0xffff;

        if (address <= 0xbfff) {
            // Memory addresses below 0xC000 are delegated to the Cartridge Mapper
            return this.mapper.read(address);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // Main 8KB System Work RAM
            return this.systemRam[address - 0xc000];
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // Mirror of System Work RAM
            return this.systemRam[address - 0xe000];
        } 
        else {
            console.warn(`SystemBus::Unresolved Memory Read at [0x${address.toString(16)}]`);
            return 0;
        }
    }

    /**
     * Emulates Memory Write Cycle (/MREQ + /WR)
     */
    mreqWrite(address, data) {
        address &= 0xffff;
        data &= 0xff;

        if (address <= 0xbfff) {
            // Route write to cartridge mapper (write protection or bank registers)
            this.mapper.write(address, data);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            // Main 8KB System Work RAM
            this.systemRam[address - 0xc000] = data;
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            // System Work RAM Mirror
            this.systemRam[address - 0xe000] = data;

            // Sega Mapper control registers mapped to the mirror RAM addresses (0xFFFC-0xFFFF)
            this.mapper.writeSystemRamOverride(address, data);
        }
    }

    mreqRead16bit(address) {
        const byte1 = this.mreqRead(address);
        const byte2 = this.mreqRead(address + 1);
        return byte1 | (byte2 << 8);        
    }

    mreqWrite16bit(address, word) {
        const byte1 = word & 0xff;
        const byte2 = (word >> 8) & 0xff;

        this.mreqWrite(address, byte1);
        this.mreqWrite(address + 1, byte2);
    }    

    // ------------------------------------------------------------------------
    // I/O REQUEST BUS CYCLE (/IORQ)
    // ------------------------------------------------------------------------

    /**
     * Emulates I/O Port Read Cycle (/IORQ + /RD)
     */
    iorqRead(port) {
        port &= 0xff;

        if (port >= 0x40 && port < 0x80) {
            // VDP Counter reads (Even: Vertical Line, Odd: Horizontal Beam)
            if ((port & 0x01) === 0x00) {
                return this.theVDP.readDataPort(0x7e);
            } else {
                return this.theVDP.readDataPort(0x7f);
            }
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            // VDP interface read (Even: Data Port, Odd: Status Control Port)
            if ((port % 2) === 0) {
                return this.theVDP.readByteFromDataPort();
            } else {
                return this.theVDP.readByteFromControlPort();
            }        
        } 
        else if (port >= 0xc0 && port <= 0xff) {
            if (port === 0xde || port === 0xdf) return 0xff; 
            if (port === 0xf2) return 0; // YM2413 FM sound chip (absent)

            if (port % 2 === 0) {
                // Sega I/O Controller Register 0xDC (Joypad states)
                return this.ioController.readRegisterDC();
            } else {
                // Sega I/O Controller Register 0xDD (Jumper/Misc states)
                return this.ioController.readRegisterDD();
            }
        } 
        else {
            console.warn(`SystemBus::Unresolved I/O Port Read at [0x${port.toString(16)}]`);
        }

        return 0;
    }

    /**
     * Emulates I/O Port Write Cycle (/IORQ + /WR)
     */
    iorqWrite(port, data) {
        port &= 0xff;
        data &= 0xff;

        if (port >= 0x40 && port <= 0x7f) {
            // Write audio samples to the Texas Instruments SN76489 sound chip
            this.theSoundchip.writeByte(data);
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            // Write coordinates/commands to the VDP
            if ((port % 2) === 0) {
                this.theVDP.writeByteToDataPort(data);
            } else {
                this.theVDP.writeByteToControlPort(data);
            }
        } 
        else if (port >= 0xc0 && port <= 0xff) {
            // No effect.
        } else {
            console.log(`SystemBus::Unresolved I/O Port Write at [0x${port.toString(16)}] of value ${data}`);
        }
    }

    // ------------------------------------------------------------------------
    // BACKWARD COMPATIBILITY WRAPPERS (For CPU and legacy components)
    // ------------------------------------------------------------------------
    readAddr(address)             { return this.mreqRead(address); }
    writeAddr(address, data)       { this.mreqWrite(address, data); }
    readAddr16bit(address)        { return this.mreqRead16bit(address); }
    writeAddr16bit(address, word) { this.mreqWrite16bit(address, word); }
    readPort(port)                { return this.iorqRead(port); }
    writePort(port, data)         { this.iorqWrite(port, data); }

    // Controller events delegation wrappers
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

// Global Legacy Alias to support unrefactored entry points (main.js)
const smsMmu = SmsSystemBus;