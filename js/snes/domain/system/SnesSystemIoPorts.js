/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSystemIoPorts (Hardware Register Mapping Extension)
 * 
 * ROLE:
 * Handles reads and writes of the physical control registers of the CPU
 * ($4200-$421F) and the DMA config slots ($4300-$437F).
 */

{
    SnesSystem.prototype.readReg = function(adr) {
        switch (adr) {
            case 0x4210: {
                let val = 0x2;
                val |= this.inNmi ? 0x80 : 0;
                val |= this.openBus & 0x70;
                this.inNmi = false;
                return val;
            }
            case 0x4211: {
                let val = this.inIrq ? 0x80 : 0;
                val |= this.openBus & 0x7f;
                this.inIrq = false;
                this.cpu.irqWanted = false;
                return val;
            }
            case 0x4212: {
                let val = (this.autoJoyTimer > 0) ? 0x1 : 0;
                val |= this.inHblank ? 0x40 : 0;
                val |= this.inVblank ? 0x80 : 0;
                val |= this.openBus & 0x3e;
                return val;
            }
            case 0x4213: {
                return this.ppuLatch ? 0x80 : 0;
            }
            case 0x4214: {
                return this.divResult & 0xff;
            }
            case 0x4215: {
                return (this.divResult & 0xff00) >> 8;
            }
            case 0x4216: {
                return this.mulResult & 0xff;
            }
            case 0x4217: {
                return (this.mulResult & 0xff00) >> 8;
            }
            case 0x4218: {
                return this.joypad1AutoRead & 0xff;
            }
            case 0x4219: {
                return (this.joypad1AutoRead & 0xff00) >> 8;
            }
            case 0x421a: {
                return this.joypad2AutoRead & 0xff;
            }
            case 0x421b: {
                return (this.joypad2AutoRead & 0xff00) >> 8;
            }
            case 0x421c:
            case 0x421d:
            case 0x421e:
            case 0x421f: {
                return 0;
            }
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            let channel = (adr & 0xf0) >> 4;
            switch (adr & 0xff0f) {
                case 0x4300: {
                    let val = this.dmaMode[channel];
                    val |= this.dmaFixed[channel] ? 0x8 : 0;
                    val |= this.dmaDec[channel] ? 0x10 : 0;
                    val |= this.dmaUnusedBit[channel] ? 0x20 : 0;
                    val |= this.hdmaInd[channel] ? 0x40 : 0;
                    val |= this.dmaFromB[channel] ? 0x80 : 0;
                    return val;
                }
                case 0x4301: {
                    return this.dmaBadr[channel];
                }
                case 0x4302: {
                    return this.dmaAadr[channel] & 0xff;
                }
                case 0x4303: {
                    return (this.dmaAadr[channel] & 0xff00) >> 8;
                }
                case 0x4304: {
                    return this.dmaAadrBank[channel];
                }
                case 0x4305: {
                    return this.dmaSize[channel] & 0xff;
                }
                case 0x4306: {
                    return (this.dmaSize[channel] & 0xff00) >> 8;
                }
                case 0x4307: {
                    return this.hdmaIndBank[channel];
                }
                case 0x4308: {
                    return this.hdmaTableAdr[channel] & 0xff;
                }
                case 0x4309: {
                    return (this.hdmaTableAdr[channel] & 0xff00) >> 8;
                }
                case 0x430a: {
                    return this.hdmaRepCount[channel];
                }
                case 0x430b:
                case 0x430f: {
                    return this.dmaUnusedByte[channel];
                }
            }
        }
        return this.openBus;
    };

    SnesSystem.prototype.writeReg = function(adr, value) {
        switch (adr) {
            case 0x4200: {
                this.autoJoyRead = (value & 0x1) > 0;
                if (!this.autoJoyRead) {
                    this.autoJoyTimer = 0;
                }
                this.hIrqEnabled = (value & 0x10) > 0;
                this.vIrqEnabled = (value & 0x20) > 0;
                this.nmiEnabled = (value & 0x80) > 0;
                if (!this.hIrqEnabled && !this.vIrqEnabled) {
                    this.cpu.irqWanted = false;
                    this.inIrq = false;
                }
                return;
            }
            case 0x4201: {
                if (this.ppuLatch && (value & 0x80) === 0) {
                    this.ppu.latchedHpos = this.xPos >> 2;
                    this.ppu.latchedVpos = this.yPos;
                    this.ppu.countersLatched = true;
                }
                this.ppuLatch = (value & 0x80) > 0;
                return;
            }
            case 0x4202: {
                this.multiplyA = value;
                return;
            }
            case 0x4203: {
                this.mulResult = this.multiplyA * value;
                return;
            }
            case 0x4204: {
                this.divA = (this.divA & 0xff00) | value;
                return;
            }
            case 0x4205: {
                this.divA = (this.divA & 0xff) | (value << 8);
                return;
            }
            case 0x4206: {
                this.divResult = 0xffff;
                this.mulResult = this.divA;
                if (value !== 0) {
                    this.divResult = (this.divA / value) & 0xffff;
                    this.mulResult = this.divA % value;
                }
                return;
            }
            case 0x4207: {
                this.hTimer = (this.hTimer & 0x100) | value;
                return;
            }
            case 0x4208: {
                this.hTimer = (this.hTimer & 0xff) | ((value & 0x1) << 8);
                return;
            }
            case 0x4209: {
                this.vTimer = (this.vTimer & 0x100) | value;
                return;
            }
            case 0x420a: {
                this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
                return;
            }
            case 0x420b: {
                this.dmaActive[0] = (value & 0x1) > 0;
                this.dmaActive[1] = (value & 0x2) > 0;
                this.dmaActive[2] = (value & 0x4) > 0;
                this.dmaActive[3] = (value & 0x8) > 0;
                this.dmaActive[4] = (value & 0x10) > 0;
                this.dmaActive[5] = (value & 0x20) > 0;
                this.dmaActive[6] = (value & 0x40) > 0;
                this.dmaActive[7] = (value & 0x80) > 0;
                this.dmaBusy = value > 0;
                this.dmaTimer += this.dmaBusy ? 8 : 0;
                return;
            }
            case 0x420c: {
                this.hdmaActive[0] = (value & 0x1) > 0;
                this.hdmaActive[1] = (value & 0x2) > 0;
                this.hdmaActive[2] = (value & 0x4) > 0;
                this.hdmaActive[3] = (value & 0x8) > 0;
                this.hdmaActive[4] = (value & 0x10) > 0;
                this.hdmaActive[5] = (value & 0x20) > 0;
                this.hdmaActive[6] = (value & 0x40) > 0;
                this.hdmaActive[7] = (value & 0x80) > 0;
                return;
            }
            case 0x420d: {
                this.fastMem = (value & 0x1) > 0;
                return;
            }
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            let channel = (adr & 0xf0) >> 4;
            switch (adr & 0xff0f) {
                case 0x4300: {
                    this.dmaMode[channel] = value & 0x7;
                    this.dmaFixed[channel] = (value & 0x08) > 0;
                    this.dmaDec[channel] = (value & 0x10) > 0;
                    this.dmaUnusedBit[channel] = (value & 0x20) > 0;
                    this.hdmaInd[channel] = (value & 0x40) > 0;
                    this.dmaFromB[channel] = (value & 0x80) > 0;
                    return;
                }
                case 0x4301: {
                    this.dmaBadr[channel] = value;
                    return;
                }
                case 0x4302: {
                    this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff00) | value;
                    return;
                }
                case 0x4303: {
                    this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x4304: {
                    this.dmaAadrBank[channel] = value;
                    return;
                }
                case 0x4305: {
                    this.dmaSize[channel] = (this.dmaSize[channel] & 0xff00) | value;
                    return;
                }
                case 0x4306: {
                    this.dmaSize[channel] = (this.dmaSize[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x4307: {
                    this.hdmaIndBank[channel] = value;
                    return;
                }
                case 0x4308: {
                    this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff00) | value;
                    return;
                }
                case 0x4309: {
                    this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff) | (value << 8);
                    return;
                }
                case 0x430a: {
                    this.hdmaRepCount[channel] = value;
                    return;
                }
                case 0x430b:
                case 0x430f: {
                    this.dmaUnusedByte[channel] = value;
                    return;
                }
            }
        }
    };
}