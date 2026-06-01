/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Secondary Z80 CPU Memory Bus (CPU Compatibility Wrappers)
 * 
 * Emulates the memory address bus and port control logic of the secondary 
 * Zilog Z80 processor. Handles local 8KB RAM, FM YM2612 register bindings, 
 * VDP port mappings, and the 68K memory window banking register.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates the secondary Z80 
 *   memory bus execution from the primary 68K master bus.
 * - Dependency Inversion Principle (DIP): Injects external master bus delegate 
 *   readers and writers to avoid high-coupling or circular dependencies.
 */

class GenesisBusZ80 {
    /**
     * @param {GenesisYm2612} fm - Main FM Synthesizer.
     */
    constructor(fm) {
        this.fm = fm;

        // Dedicated Z80 local 8KB RAM buffer
        this.ram = new Uint8Array(0x2000);

        // 9-bit shifting banking register used to map into 68K memory space
        this.bankRegister = 0; 

        // Local state registers (DRC / Sync safe)
        this.busRequested = false;
        this.resetHeld = true; // Secondary CPU reset is asserted on boot
        
        // Reference to the active Z80 CPU to process synchronous resets
        this.z80Cpu = null;

        // Delegates for Master Bus interaction (DIP: Injected at boot time)
        this.m68kReadByteDelegate = null;
        this.m68kWriteByteDelegate = null;
    }

    /**
     * Cold-boots and cleans local registers.
     */
    initialise() {
        this.ram.fill(0);
        this.bankRegister = 0;
        this.busRequested = false;
        this.resetHeld = true;
    }

    /**
     * Binds the actual Z80 CPU core instance.
     * @param {ZilogZ80} z80Cpu - The Z80 CPU core.
     */
    bindCpu(z80Cpu) {
        this.z80Cpu = z80Cpu;
    }

    /**
     * Updates the reset line state, triggering a Z80 registers reset upon release.
     * @param {boolean} held - True if reset line is active.
     */
    setReset(held) {
        if (this.resetHeld && !held) {
            // Reset line transitioning from high (held) to low (released)
            if (this.z80Cpu) {
                this.z80Cpu.registers.pc = 0;
                this.z80Cpu.registers.iff1 = 0;
                this.z80Cpu.registers.iff2 = 0;
                this.z80Cpu.registers.interruptMode = 0;
                this.z80Cpu.isHalted = false;
            }
        }
        this.resetHeld = held;
    }

    /**
     * Binds the Master M68K bus access delegates.
     * @param {Function} readByteDelegate - (addr, cycles) => byte
     * @param {Function} writeByteDelegate - (addr, value, cycles) => void
     */
    bindMasterBus(readByteDelegate, writeByteDelegate) {
        this.m68kReadByteDelegate = readByteDelegate;
        this.m68kWriteByteDelegate = writeByteDelegate;
    }

    /**
     * Checks if the Z80 is currently frozen by active DMA bus locks or reset registers.
     * @returns {boolean} True if Z80 cannot execute instructions.
     */
    isZ80Frozen() {
        return this.busRequested || this.resetHeld;
    }

    /**
     * Synchronizes and reads an 8-bit byte from the Z80 memory bus.
     * @param {number} address - 16-bit address offset.
     * @param {number} targetCycle - Sync target clock cycle.
     * @returns {number} 8-bit data readout.
     */
    read(address, targetCycle) {
        address = address & 0xFFFF;
        const chunk = Math.floor(address / 0x2000) | 0;

        switch (chunk) {
            case 0: // 0x0000 - 0x1FFF
            case 1: // 0x2000 - 0x3FFF: 8KB Z80 Local RAM Mirroring
                return this.ram[address & 0x1FFF];

            case 2: // 0x4000 - 0x5FFF: YM2612 FM Ports
                if (this.fm) {
                    return this.fm.update(targetCycle) & 0xFF;
                }
                break;

            case 3: // 0x6000 - 0x7FFF
                if (address < 0x7F00) {
                    return 0xFF; // Reads on Bank Register or unused space return 0xFF
                } else {
                    // 0x7F00 - 0x7FFF: VDP Ports mapped via 68K space
                    const vdpAddr = 0xC00000 + (address & 0xFF);
                    return this.m68kReadByteDelegate ? this.m68kReadByteDelegate(vdpAddr, targetCycle) : 0xFF;
                }

            case 4: // 0x8000 - 0x9FFF
            case 5: // 0xA000 - 0xBFFF
            case 6: // 0xC000 - 0xDFFF
            case 7: // 0xE000 - 0xFFFF: 32KB Window mapped into 68K space using Bank Register
                const windowAddr = ((this.bankRegister * 0x8000) | (address & 0x7FFF)) >>> 0;
                return this.m68kReadByteDelegate ? this.m68kReadByteDelegate(windowAddr, targetCycle) : 0xFF;
        }

        return 0;
    }

    /**
     * Synchronizes and writes an 8-bit byte to the Z80 memory bus.
     * @param {number} address - 16-bit address offset.
     * @param {number} value - 8-bit data.
     * @param {number} targetCycle - Sync target clock cycle.
     */
    write(address, value, targetCycle) {
        address = address & 0xFFFF;
        value = value & 0xFF;
        const chunk = Math.floor(address / 0x2000) | 0;

        switch (chunk) {
            case 0: // 0x0000 - 0x1FFF
            case 1: // 0x2000 - 0x3FFF: 8KB Z80 Local RAM Mirroring
                this.ram[address & 0x1FFF] = value;
                break;

            case 2: // 0x4000 - 0x5FFF: YM2612 FM Ports
                if (this.fm) {
                    this.fm.update(targetCycle);
                    if ((address & 1) === 0) {
                        this.fm.writeAddress((address & 2) !== 0 ? 1 : 0, value);
                    } else {
                        this.fm.writeData(value);
                    }
                }
                break;

            case 3: // 0x6000 - 0x7FFF
                if (address < 0x6100) {
                    // Bank Register write: shifts the register 1 bit right, sets bit 8 from data bit 0
                    this.bankRegister = (this.bankRegister >> 1) & 0xFF;
                    this.bankRegister |= (value & 1) !== 0 ? 0x100 : 0;
                } else if (address >= 0x7F00) {
                    // VDP Ports mapped via 68K space
                    const vdpAddr = 0xC00000 + (address & 0xFF);
                    if (this.m68kWriteByteDelegate) {
                        this.m68kWriteByteDelegate(vdpAddr, value, targetCycle);
                    }
                }
                break;

            case 4: // 0x8000 - 0x9FFF
            case 5: // 0xA000 - 0xBFFF
            case 6: // 0xC000 - 0xDFFF
            case 7: // 0xE000 - 0xFFFF: 32KB Window mapped into 68K space using Bank Register
                const windowAddr = ((this.bankRegister * 0x8000) | (address & 0x7FFF)) >>> 0;
                if (this.m68kWriteByteDelegate) {
                    this.m68kWriteByteDelegate(windowAddr, value, targetCycle);
                }
                break;
        }
    }

    // ========================================================================
    // BACKWARD COMPATIBILITY WRAPPERS (ZilogZ80 Core Compatibility)
    // Bridges the shared SMS Z80 core with the secondary Genesis memory bus.
    // ========================================================================
    readAddr(address) {
        return this.read(address, 0); 
    }

    writeAddr(address, data) {
        this.write(address, data, 0);
    }

    readAddr16bit(address) {
        return this.read(address, 0) | (this.read(address + 1, 0) << 8);
    }

    writeAddr16bit(address, word) {
        this.write(address, word & 0xFF, 0);
        this.write(address + 1, (word >> 8) & 0xFF, 0);
    }

    readPort(port) {
        // I/O ports are not populated on Genesis (it uses memory mapped I/O at 0x4000)
        return 0xFF; 
    }

    writePort(port, data) {
        // Unused on Genesis
    }
}