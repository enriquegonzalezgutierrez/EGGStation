/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/system/SnesSystemBus.js
 * 
 * Domain Layer: Super Nintendo (SNES) 24-bit Master Memory Bus
 * 
 * Role:
 * Emulates the central physical memory bus of the SNES. Enforces 24-bit physical 
 * Bus-A address decoding, maps Bus-B coprocessor registers ($2100-$21FF), 
 * handles Work RAM mirroring, and calculates dynamic access cycle timings.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for memory mapping, 
 *   memory access timings (FastROM vs SlowROM), and peripheral address arbitration.
 */

class SnesSystemBus {
    /**
     * @param {SnesSystem} snesSystem - Master system coordinator context (DIP).
     */
    constructor(snesSystem) {
        this.sys = snesSystem;
    }

    /**
     * Reads a byte from the memory-mapped Bus-B ($2100 - $21FF / $4000 - $40FF).
     * @param {number} adr - 8-bit B-Bus address offset.
     * @returns {number} 8-bit data byte.
     */
    readBBus(adr) {
        if (adr > 0x33 && adr < 0x40) {
            return this.sys.ppu.read(adr);
        }
        if (adr >= 0x40 && adr < 0x80) {
            this.sys.catchUpApu();
            return this.sys.apu.spcWritePorts[adr & 0x3];
        }
        if (adr === 0x80) {
            let val = this.sys.ram[this.sys.ramAdr++];
            this.sys.ramAdr &= 0x1ffff;
            return val;
        }
        return this.sys.openBus;
    }

    /**
     * Writes a byte to the memory-mapped Bus-B ($2100 - $21FF / $4000 - $40FF).
     * @param {number} adr - 8-bit B-Bus address offset.
     * @param {number} value - 8-bit data payload.
     */
    writeBBus(adr, value) {
        if (adr < 0x34) {
            this.sys.ppu.write(adr, value);
            return;
        }
        if (adr >= 0x40 && adr < 0x80) {
            this.sys.catchUpApu();
            this.sys.apu.spcReadPorts[adr & 0x3] = value;
            return;
        }
        switch (adr) {
            case 0x80: {
                this.sys.ram[this.sys.ramAdr++] = value;
                this.sys.ramAdr &= 0x1ffff;
                return;
            }
            case 0x81: {
                this.sys.ramAdr = (this.sys.ramAdr & 0x1ff00) | value;
                return;
            }
            case 0x82: {
                this.sys.ramAdr = (this.sys.ramAdr & 0x100ff) | (value << 8);
                return;
            }
            case 0x83: {
                this.sys.ramAdr = (this.sys.ramAdr & 0x0ffff) | ((value & 1) << 16);
                return;
            }
        }
    }

    /**
     * Low-level raw read routine. Performs direct mapping without cycle timing side-effects.
     * @param {number} address - 24-bit physical address.
     * @returns {number} 8-bit data byte.
     */
    rread(address) {
        let adr = address & 0xffffff;
        let bank = adr >> 16;
        adr &= 0xffff;
        
        if (bank === 0x7e || bank === 0x7f) {
            return this.sys.ram[((bank & 0x1) << 16) | adr];
        }
        if (adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (adr < 0x2000) {
                return this.sys.ram[adr & 0x1fff];
            }
            if (adr >= 0x2100 && adr < 0x2200) {
                return this.readBBus(adr & 0xff);
            }
            if (adr === 0x4016) {
                let val = this.sys.joypad1Val & 0x1;
                this.sys.joypad1Val >>= 1;
                this.sys.joypad1Val |= 0x8000;
                return val;
            }
            if (adr === 0x4017) {
                let val = this.sys.joypad2Val & 0x1;
                this.sys.joypad2Val >>= 1;
                this.sys.joypad2Val |= 0x8000;
                return val;
            }
            if (adr >= 0x4200 && adr < 0x4380) {
                return this.sys.io.readReg(adr); // Mapped directly to SnesSystemIoPorts
            }
        }
        
        if (this.sys.cart) {
            return this.sys.cart.read(bank, adr);
        }
        return this.sys.openBus;
    }

    /**
     * Main CPU-Bus interface for reading. Calculates timing cycle penalties dynamically.
     * @param {number} adr - 24-bit address.
     * @param {boolean} dma - True if requested during a DMA transfer (bypasses CPU registers penalties).
     * @returns {number} 8-bit data byte.
     */
    read(adr, dma = false) {
        if (!dma) {
            this.sys.cpuMemOps++;
            this.sys.cpuCyclesLeft += this.getAccessTime(adr);
        }
        let val = this.rread(adr);
        this.sys.openBus = val;
        return val;
    }

    /**
     * Main CPU-Bus interface for writing. Calculates timing cycle penalties dynamically.
     * @param {number} address - 24-bit address.
     * @param {number} value - 8-bit data byte payload.
     * @param {boolean} dma - True if requested during a DMA transfer.
     */
    write(address, value, dma = false) {
        if (!dma) {
            this.sys.cpuMemOps++;
            this.sys.cpuCyclesLeft += this.getAccessTime(address);
        }

        this.sys.openBus = value;
        let adr = address & 0xffffff;
        let bank = adr >> 16;
        let offset = adr & 0xffff;
        
        if (bank === 0x7e || bank === 0x7f) {
            this.sys.ram[((bank & 0x1) << 16) | offset] = value;
        }
        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) {
                this.sys.ram[offset & 0x1fff] = value;
            }
            if (offset >= 0x2100 && offset < 0x2200) {
                this.writeBBus(offset & 0xff, value);
            }
            if (offset === 0x4016) {
                this.sys.joypadStrobe = (value & 0x1) > 0;
            }
            if (offset >= 0x4200 && offset < 0x4380) {
                this.sys.io.writeReg(offset, value); // Mapped directly to SnesSystemIoPorts
            }
        }
        
        if (this.sys.cart) {
            this.sys.cart.write(bank, offset, value);
        }
    }

    /**
     * Calculates the exact number of CPU master cycles required to access a specific memory address.
     * Based on the original hardware timing specifications (FastROM vs SlowROM, WRAM speed, I/O speed).
     * @param {number} address - 24-bit physical address.
     * @returns {number} CPU master cycles (6, 8, or 12).
     */
    getAccessTime(address) {
        const bank = (address >> 16) & 0xFF;
        const offset = address & 0xFFFF;
        
        // Banks 0x40-0x7F: Cartridge SlowROM / WRAM mirrors (Always 8 cycles)
        if (bank >= 0x40 && bank < 0x80) {
            return 8;
        }
        
        // Banks 0xC0-0xFF: Cartridge High Banks (Speed depends on FastROM toggle)
        if (bank >= 0xC0) {
            return this.sys.fastMem ? 6 : 8;
        }
        
        // Banks 0x00-0x3F and 0x80-0xBF (System Area & Low Cartridge Banks)
        if (offset < 0x2000) {
            return 8; // WRAM Mirrors (8 cycles)
        }
        if (offset < 0x4000) {
            return 6; // PPU / APU Hardware I/O Ports (Fast: 6 cycles)
        }
        if (offset < 0x4200) {
            return 12; // Old Joypad Ports / CPU Registers (X-Slow: 12 cycles)
        }
        if (offset < 0x6000) {
            return 6; // Hardware I/O Ports / DMA Registers (Fast: 6 cycles)
        }
        if (offset < 0x8000) {
            return 8; // Expansion RAM / DSP (8 cycles)
        }
        
        // Offset >= 0x8000 in low banks
        return (this.sys.fastMem && bank >= 0x80) ? 6 : 8;
    }
}