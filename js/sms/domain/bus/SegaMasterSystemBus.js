/**
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/domain/bus/SegaMasterSystemBus.js
 * 
 * Domain Layer: Sega Master System Memory and I/O Bus
 * 
 * Role:
 * Emulates the physical Address Bus and Control Bus of the Sega Master System.
 * Routes memory and I/O requests to the appropriate WebAssembly-powered 
 * hardware components.
 * 
 * SOLID Principles Applied:
 * - Dependency Inversion Principle (DIP): Instead of managing specific mapper 
 *   subclasses, it depends on the 'BaseMapper' proxy, which handles the 
 *   polymorphic C++ routing behind the scenes.
 */

class SegaMasterSystemBus {
    /**
     * @param {SegaMasterSystemCartridge} cartridge - The Wasm-enabled cartridge entity.
     * @param {Sega315_5124_Vdp} vdp - The Wasm-enabled VDP instance.
     * @param {SegaPsg} psg - The Wasm-enabled PSG instance.
     * @param {Sega315_5297} ioController - The Wasm-enabled I/O chip instance.
     */
    constructor(cartridge, vdp, psg, ioController) {
        this.cartridge = cartridge;
        this.vdp = vdp;
        this.psg = psg;
        this.ioController = ioController;

        // NEW: We no longer call a JS Factory. We instantiate the BaseMapper proxy.
        // The C++ side already handled the polymorphic creation inside cart_load().
        this.mapper = new BaseMapper(this.cartridge);

        // 8KB System Work RAM (0xC000 - 0xDFFF, mirrored at 0xE000 - 0xFFFF)
        this.systemWorkRam = new Uint8Array(0x2000).fill(0);
    }

    // ========================================================================
    // MEMORY REQUESTS (/MREQ)
    // ========================================================================

    mreqRead(address) {
        address &= 0xffff;

        if (address <= 0xbfff) {
            // Delegated to the Wasm-backed Mapper Proxy
            return this.mapper.read(address);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            return this.systemWorkRam[address - 0xc000];
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            return this.systemWorkRam[address - 0xe000];
        }
        return 0;
    }

    mreqWrite(address, data) {
        address &= 0xffff;
        data &= 0xff;

        if (address <= 0xbfff) {
            // Write to Cartridge Mapper registers or cartridge RAM in Wasm
            this.mapper.write(address, data);
        } 
        else if (address >= 0xc000 && address <= 0xdfff) {
            this.systemWorkRam[address - 0xc000] = data;
        } 
        else if (address >= 0xe000 && address <= 0xffff) {
            this.systemWorkRam[address - 0xe000] = data;
            // Sega Mapper control registers respond to writes on mirror RAM
            this.mapper.writeSystemRamOverride(address, data);
        }
    }

    mreqRead16bit(address) {
        return this.mreqRead(address) | (this.mreqRead(address + 1) << 8);        
    }

    mreqWrite16bit(address, word) {
        this.mreqWrite(address, word & 0xff);
        this.mreqWrite(address + 1, (word >> 8) & 0xff);
    }    

    // ========================================================================
    // I/O REQUESTS (/IORQ)
    // ========================================================================

    iorqRead(port) {
        port &= 0xff;

        if (port >= 0x40 && port < 0x80) {
            return this.vdp.readDataPort(port);
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            if ((port % 2) === 0) return this.vdp.readByteFromDataPort();
            else return this.vdp.readByteFromControlPort();
        } 
        else if (port >= 0xc0 && port <= 0xff) {
            if (port === 0xde || port === 0xdf) return 0xff; 
            if (port === 0xf2) return 0;

            if ((port % 2) === 0) return this.ioController.readRegisterDC();
            else return this.ioController.readRegisterDD();
        }
        return 0;
    }

    iorqWrite(port, data) {
        port &= 0xff;
        data &= 0xff;

        if (port >= 0x40 && port <= 0x7f) {
            this.psg.writeByte(data);
        } 
        else if (port >= 0x80 && port <= 0xbf) {
            if ((port % 2) === 0) this.vdp.writeByteToDataPort(data);
            else this.vdp.writeByteToControlPort(data);
        }
    }

    // --- Backward Compatibility Wrappers ---
    readAddr(address)             { return this.mreqRead(address); }
    writeAddr(address, data)       { this.mreqWrite(address, data); }
    readAddr16bit(address)        { return this.mreqRead16bit(address); }
    writeAddr16bit(address, word) { this.mreqWrite16bit(address, word); }
    readPort(port)                { return this.iorqRead(port); }
    writePort(port, data)         { this.iorqWrite(port, data); }
}