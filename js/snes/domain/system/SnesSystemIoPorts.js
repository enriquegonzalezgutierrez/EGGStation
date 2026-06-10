/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/system/SnesSystemIoPorts.js
 * 
 * Domain Layer: Super Nintendo (SNES) Hardware I/O Registers Decoder
 * 
 * Role:
 * Emulates the memory-mapped CPU I/O control registers ($4200-$421F) and the 
 * DMA/HDMA configuration registers ($4300-$437F) of the Super Nintendo.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for parsing, 
 *   routing, and mutating CPU I/O register ports, delegating channel updates 
 *   directly to the sibling SnesSystemDma controller.
 */

class SnesSystemIoPorts {
    /**
     * @param {SnesSystem} snesSystem - Master system coordinator context (DIP).
     */
    constructor(snesSystem) {
        this.sys = snesSystem;
    }

    /**
     * Decodes and reads an 8-bit hardware control register.
     * @param {number} adr - 16-bit register address.
     * @returns {number} 8-bit register data.
     */
    readReg(adr) {
        switch (adr) {
            case 0x4210: {
                let val = 0x2;
                val |= this.sys.inNmi ? 0x80 : 0;
                val |= this.sys.openBus & 0x70;
                this.sys.inNmi = false;
                return val;
            }
            case 0x4211: {
                let val = this.sys.inIrq ? 0x80 : 0;
                val |= this.sys.openBus & 0x7f;
                this.sys.inIrq = false;
                this.sys.cpu.irqWanted = false;
                return val;
            }
            case 0x4212: {
                let val = (this.sys.autoJoyTimer > 0) ? 0x1 : 0;
                val |= this.sys.inHblank ? 0x40 : 0;
                val |= this.sys.inVblank ? 0x80 : 0;
                val |= this.sys.openBus & 0x3e;
                return val;
            }
            case 0x4213: {
                return this.sys.ppuLatch ? 0x80 : 0;
            }
            case 0x4214: {
                return this.sys.divResult & 0xff;
            }
            case 0x4215: {
                return (this.sys.divResult & 0xff00) >> 8;
            }
            case 0x4216: {
                return this.sys.mulResult & 0xff;
            }
            case 0x4217: {
                return (this.sys.mulResult & 0xff00) >> 8;
            }
            case 0x4218: {
                return this.sys.joypad1AutoRead & 0xff;
            }
            case 0x4219: {
                return (this.sys.joypad1AutoRead & 0xff00) >> 8;
            }
            case 0x421a: {
                return this.sys.joypad2AutoRead & 0xff;
            }
            case 0x421b: {
                return (this.sys.joypad2AutoRead & 0xff00) >> 8;
            }
            case 0x421c:
            case 0x421d:
            case 0x421e:
            case 0x421f: {
                return 0;
            }
        }

        // --- DMA / HDMA Channel Registers ($4300 - $437F) ---
        if (adr >= 0x4300 && adr < 0x4380) {
            const channel = (adr & 0xf0) >> 4;
            const dma = this.sys.dma; // Mapped directly to the encapsulated DMA controller (DIP)

            if (!dma) return this.sys.openBus;

            switch (adr & 0xff0f) {
                case 0x4300: {
                    let val = dma.dmaMode[channel];
                    val |= dma.dmaFixed[channel] ? 0x8 : 0;
                    val |= dma.dmaDec[channel] ? 0x10 : 0;
                    val |= dma.dmaUnusedBit[channel] ? 0x20 : 0;
                    val |= dma.hdmaInd[channel] ? 0x40 : 0;
                    val |= dma.dmaFromB[channel] ? 0x80 : 0;
                    return val;
                }
                case 0x4301: {
                    return dma.dmaBadr[channel];
                }
                case 0x4302: {
                    return dma.dmaAadr[channel] & 0xff;
                }
                case 0x4303: {
                    return (dma.dmaAadr[channel] & 0xff00) >> 8;
                }
                case 0x4304: {
                    return dma.dmaAadrBank[channel];
                }
                case 0x4305: {
                    return dma.dmaSize[channel] & 0xff;
                }
                case 0x4306: {
                    return (dma.dmaSize[channel] & 0xff00) >> 8;
                }
                case 0x4307: {
                    return dma.hdmaIndBank[channel];
                }
                case 0x4308: {
                    return dma.hdmaTableAdr[channel] & 0xff;
                }
                case 0x4309: {
                    return (dma.hdmaTableAdr[channel] & 0xff00) >> 8;
                }
                case 0x430a: {
                    return dma.hdmaRepCount[channel];
                }
                case 0x430b:
                case 0x430f: {
                    return dma.dmaUnusedByte[channel];
                }
            }
        }
        return this.sys.openBus;
    }

    /**
     * Decodes and writes an 8-bit payload to a hardware control register.
     * @param {number} adr - 16-bit register address.
     * @param {number} value - 8-bit data payload.
     */
    writeReg(adr, value) {
        switch (adr) {
            case 0x4200: {
                this.sys.autoJoyRead = (value & 0x1) > 0;
                if (!this.sys.autoJoyRead) {
                    this.sys.autoJoyTimer = 0;
                }
                this.sys.hIrqEnabled = (value & 0x10) > 0;
                this.sys.vIrqEnabled = (value & 0x20) > 0;
                this.sys.nmiEnabled = (value & 0x80) > 0;
                if (!this.sys.hIrqEnabled && !this.sys.vIrqEnabled) {
                    this.sys.cpu.irqWanted = false;
                    this.sys.inIrq = false;
                }
                return;
            }
            case 0x4201: {
                if (this.sys.ppuLatch && (value & 0x80) === 0) {
                    this.sys.ppu.latchedHpos = this.sys.xPos >> 2;
                    this.sys.ppu.latchedVpos = this.sys.yPos;
                    this.sys.ppu.countersLatched = true;
                }
                this.sys.ppuLatch = (value & 0x80) > 0;
                return;
            }
            case 0x4202: {
                this.sys.multiplyA = value;
                return;
            }
            case 0x4203: {
                this.sys.mulResult = this.sys.multiplyA * value;
                return;
            }
            case 0x4204: {
                this.sys.divA = (this.sys.divA & 0xff00) | value;
                return;
            }
            case 0x4205: {
                this.sys.divA = (this.sys.divA & 0xff) | (value << 8);
                return;
            }
            case 0x4206: {
                this.sys.divResult = 0xffff;
                this.sys.mulResult = this.sys.divA;
                if (value !== 0) {
                    this.sys.divResult = (this.sys.divA / value) & 0xffff;
                    this.sys.mulResult = this.sys.divA % value;
                }
                return;
            }
            case 0x4207: {
                this.sys.hTimer = (this.sys.hTimer & 0x100) | value;
                return;
            }
            case 0x4208: {
                this.sys.hTimer = (this.sys.hTimer & 0xff) | ((value & 0x1) << 8);
                return;
            }
            case 0x4209: {
                this.sys.vTimer = (this.sys.vTimer & 0x100) | value;
                return;
            }
            case 0x420a: {
                this.sys.vTimer = (this.sys.vTimer & 0xff) | ((value & 0x1) << 8);
                return;
            }
            case 0x420b: {
                const dma = this.sys.dma;
                if (dma) {
                    dma.dmaActive[0] = (value & 0x1) > 0;
                    dma.dmaActive[1] = (value & 0x2) > 0;
                    dma.dmaActive[2] = (value & 0x4) > 0;
                    dma.dmaActive[3] = (value & 0x8) > 0;
                    dma.dmaActive[4] = (value & 0x10) > 0;
                    dma.dmaActive[5] = (value & 0x20) > 0;
                    dma.dmaActive[6] = (value & 0x40) > 0;
                    dma.dmaActive[7] = (value & 0x80) > 0;
                    dma.dmaBusy = value > 0;
                    dma.dmaTimer += dma.dmaBusy ? 8 : 0;
                }
                return;
            }
            case 0x420c: {
                const dma = this.sys.dma;
                if (dma) {
                    dma.hdmaActive[0] = (value & 0x1) > 0;
                    dma.hdmaActive[1] = (value & 0x2) > 0;
                    dma.hdmaActive[2] = (value & 0x4) > 0;
                    dma.hdmaActive[3] = (value & 0x8) > 0;
                    dma.hdmaActive[4] = (value & 0x10) > 0;
                    dma.hdmaActive[5] = (value & 0x20) > 0;
                    dma.hdmaActive[6] = (value & 0x40) > 0;
                    dma.hdmaActive[7] = (value & 0x80) > 0;
                }
                return;
            }
            case 0x420d: {
                this.sys.fastMem = (value & 0x1) > 0;
                return;
            }
        }

        // --- DMA / HDMA Channel Registers ($4300 - $437F) ---
        if (adr >= 0x4300 && adr < 0x4380) {
            const channel = (adr & 0xf0) >> 4;
            const dma = this.sys.dma; // Mapped directly to the encapsulated DMA controller (DIP)

            if (!dma) return;

            switch (adr & 0xff0f) {
                case 0x4300: {
                    dma.dmaMode[channel] = value & 0x7;
                    dma.dmaFixed[channel] = (value & 0x08) > 0;
                    dma.dmaDec[channel] = (value & 0x10) > 0;
                    dma.dmaUnusedBit[channel] = (value & 0x20) > 0;
                    dma.hdmaInd[channel] = (value & 0x40) > 0;
                    dma.dmaFromB[channel] = (value & 0x80) > 0;
                    return;
                }
                case 0x4301: {
                    dma.dmaBadr[channel] = value;
                    return;
                }
                case 0x4302: {
                    dma.dmaAadr[channel] = (dma.dmaAadr[channel] & 0xff00) | value;
                    return;
                }
                case 0x4303: {
                    dma.dmaAadr[channel] = (dma.dmaAadr[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x4304: {
                    dma.dmaAadrBank[channel] = value;
                    return;
                }
                case 0x4305: {
                    dma.dmaSize[channel] = (dma.dmaSize[channel] & 0xff00) | value;
                    return;
                }
                case 0x4306: {
                    dma.dmaSize[channel] = (dma.dmaSize[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x4307: {
                    dma.hdmaIndBank[channel] = value;
                    return;
                }
                case 0x4308: {
                    dma.hdmaTableAdr[channel] = (dma.hdmaTableAdr[channel] & 0xff00) | value;
                    return;
                }
                case 0x4309: {
                    dma.hdmaTableAdr[channel] = (dma.hdmaTableAdr[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x430a: {
                    dma.hdmaRepCount[channel] = value;
                    return;
                }
                case 0x430b:
                case 0x430f: {
                    dma.dmaUnusedByte[channel] = value;
                    return;
                }
            }
        }
    }
}