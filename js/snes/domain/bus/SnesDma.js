/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesDma
 * 
 * ROLE:
 * Handles Direct Memory Access (DMA) and Horizontal DMA (HDMA).
 */

const DMA_OFFS = Object.freeze([
    0, 0, 0, 0,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1,
    0, 1, 2, 3,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1
]);

const DMA_OFF_LENGTHS = Object.freeze([1, 2, 2, 4, 4, 4, 2, 4]);

class SnesDma {
    constructor(bus) {
        this.bus = bus;

        // Pre-allocated DMA & HDMA Registers (Channels 0-7)
        this.dmaBadr = new Uint8Array(8);
        this.dmaAadr = new Uint16Array(8);
        this.dmaAadrBank = new Uint8Array(8);
        this.dmaSize = new Uint16Array(8);
        this.hdmaIndBank = new Uint8Array(8);
        this.hdmaTableAdr = new Uint16Array(8);
        this.hdmaRepCount = new Uint8Array(8);
        this.dmaUnusedByte = new Uint8Array(8);

        this.dmaActive = [false, false, false, false, false, false, false, false];
        this.hdmaActive = [false, false, false, false, false, false, false, false];
        this.dmaMode = [0, 0, 0, 0, 0, 0, 0, 0];
        this.dmaFixed = [false, false, false, false, false, false, false, false];
        this.dmaDec = [false, false, false, false, false, false, false, false];
        this.hdmaInd = [false, false, false, false, false, false, false, false];
        this.dmaFromB = [false, false, false, false, false, false, false, false];
        this.dmaUnusedBit = [false, false, false, false, false, false, false, false];

        this.hdmaDoTransfer = [false, false, false, false, false, false, false, false];
        this.hdmaTerminated = [false, false, false, false, false, false, false, false];

        this.reset();
    }

    reset() {
        this.dmaBadr.fill(0);
        this.dmaAadr.fill(0);
        this.dmaAadrBank.fill(0);
        this.dmaSize.fill(0);
        this.hdmaIndBank.fill(0);
        this.hdmaTableAdr.fill(0);
        this.hdmaRepCount.fill(0);
        this.dmaUnusedByte.fill(0);

        this.dmaTimer = 0;
        this.hdmaTimer = 0;
        this.dmaBusy = false;
        
        for (let i = 0; i < 8; i++) {
            this.dmaActive[i] = false;
            this.hdmaActive[i] = false;
            this.dmaMode[i] = 0;
            this.dmaFixed[i] = false;
            this.dmaDec[i] = false;
            this.hdmaInd[i] = false;
            this.dmaFromB[i] = false;
            this.dmaUnusedBit[i] = false;
            this.hdmaDoTransfer[i] = false;
            this.hdmaTerminated[i] = false;
        }

        this.dmaOffIndex = 0;
    }

    handleDma() {
        if (this.dmaTimer > 0) {
            this.dmaTimer -= 2;
            return;
        }
        let i;
        for (i = 0; i < 8; i++) {
            if (this.dmaActive[i]) {
                break;
            }
        }
        if (i === 8) {
            this.dmaBusy = false;
            this.dmaOffIndex = 0;
            return;
        }
        const tableOff = this.dmaMode[i] * 4 + this.dmaOffIndex++;
        this.dmaOffIndex &= 0x3;
        if (this.dmaFromB[i]) {
            this.bus.write(
                (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
                this.bus.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                true
            );
        } else {
            this.bus.writeBBus(
                (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                this.bus.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
            );
        }
        this.dmaTimer += 6;
        if (!this.dmaFixed[i]) {
            if (this.dmaDec[i]) {
                this.dmaAadr[i]--;
            } else {
                this.dmaAadr[i]++;
            }
        }
        this.dmaSize[i]--;
        if (this.dmaSize[i] === 0) {
            this.dmaOffIndex = 0;
            this.dmaActive[i] = false;
            this.dmaTimer += 8;
        }
    }

    initHdma() {
        this.hdmaTimer = 18;
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i]) {
                this.dmaActive[i] = false;
                this.dmaOffIndex = 0;

                this.hdmaTableAdr[i] = this.dmaAadr[i];
                this.hdmaRepCount[i] = this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                this.hdmaTimer += 8;
                if (this.hdmaInd[i]) {
                    this.dmaSize[i] = this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                    this.dmaSize[i] |= this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true) << 8;
                    this.hdmaTimer += 16;
                }
                this.hdmaDoTransfer[i] = true;
            } else {
                this.hdmaDoTransfer[i] = false;
            }
            this.hdmaTerminated[i] = false;
        }
    }

    handleHdma() {
        this.hdmaTimer = 18;
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i] && !this.hdmaTerminated[i]) {
                this.dmaActive[i] = false;
                this.hdmaTimer += 8;
                if (this.hdmaDoTransfer[i]) {
                    for (let j = 0; j < DMA_OFF_LENGTHS[this.dmaMode[i]]; j++) {
                        const tableOff = this.dmaMode[i] * 4 + j;
                        this.hdmaTimer += 8;
                        if (this.hdmaInd[i]) {
                            if (this.dmaFromB[i]) {
                                this.bus.write(
                                    (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                                    this.bus.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                this.bus.writeBBus(
                                    (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                                    this.bus.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                                );
                            }
                            this.dmaSize[i]++;
                        } else {
                            if (this.dmaFromB[i]) {
                                this.bus.write(
                                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                                    this.bus.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                this.bus.writeBBus(
                                    (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                                    this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true)
                                );
                            }
                            this.hdmaTableAdr[i]++;
                        }
                    }
                }
                this.hdmaRepCount[i]--;
                this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
                if ((this.hdmaRepCount[i] & 0x7f) === 0) {
                    this.hdmaRepCount[i] = this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                    if (this.hdmaInd[i]) {
                        this.dmaSize[i] = this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                        this.dmaSize[i] |= this.bus.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true) << 8;
                        this.hdmaTimer += 16;
                    }
                    if (this.hdmaRepCount[i] === 0) {
                        this.hdmaTerminated[i] = true;
                    }
                    this.hdmaDoTransfer[i] = true;
                }
            }
        }
    }

    readReg(adr) {
        if (adr >= 0x4300 && adr < 0x4380) {
            const channel = (adr & 0xf0) >> 4;
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
                case 0x4301: return this.dmaBadr[channel];
                case 0x4302: return this.dmaAadr[channel] & 0xff;
                case 0x4303: return (this.dmaAadr[channel] & 0xff00) >> 8;
                case 0x4304: return this.dmaAadrBank[channel];
                case 0x4305: return this.dmaSize[channel] & 0xff;
                case 0x4306: return (this.dmaSize[channel] & 0xff00) >> 8;
                case 0x4307: return this.hdmaIndBank[channel];
                case 0x4308: return this.hdmaTableAdr[channel] & 0xff;
                case 0x4309: return (this.hdmaTableAdr[channel] & 0xff00) >> 8;
                case 0x430a: return this.hdmaRepCount[channel];
                case 0x430b:
                case 0x430f: return this.dmaUnusedByte[channel];
            }
        }
        return this.bus.openBus;
    }

    writeReg(adr, value) {
        if (adr === 0x420b) {
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
            return true;
        }

        if (adr === 0x420c) {
            this.hdmaActive[0] = (value & 0x1) > 0;
            this.hdmaActive[1] = (value & 0x2) > 0;
            this.hdmaActive[2] = (value & 0x4) > 0;
            this.hdmaActive[3] = (value & 0x8) > 0;
            this.hdmaActive[4] = (value & 0x10) > 0;
            this.hdmaActive[5] = (value & 0x20) > 0;
            this.hdmaActive[6] = (value & 0x40) > 0;
            this.hdmaActive[7] = (value & 0x80) > 0;
            return true;
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            const channel = (adr & 0xf0) >> 4;
            switch (adr & 0xff0f) {
                case 0x4300:
                    this.dmaMode[channel] = value & 0x7;
                    this.dmaFixed[channel] = (value & 0x08) > 0;
                    this.dmaDec[channel] = (value & 0x10) > 0;
                    this.dmaUnusedBit[channel] = (value & 0x20) > 0;
                    this.hdmaInd[channel] = (value & 0x40) > 0;
                    this.dmaFromB[channel] = (value & 0x80) > 0;
                    break;
                case 0x4301: this.dmaBadr[channel] = value; break;
                case 0x4302: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff00) | value; break;
                case 0x4303: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff) | (value << 8); break;
                case 0x4304: this.dmaAadrBank[channel] = value; break;
                case 0x4305: this.dmaSize[channel] = (this.dmaSize[channel] & 0xff00) | value; break;
                case 0x4306: this.dmaSize[channel] = (this.dmaSize[channel] & 0xff) | (value << 8); break;
                case 0x4307: this.hdmaIndBank[channel] = value; break;
                case 0x4308: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff00) | value; break;
                case 0x4309: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff) | (value << 8); break;
                case 0x430a: this.hdmaRepCount[channel] = value; break;
                case 0x430b:
                case 0x430f: this.dmaUnusedByte[channel] = value; break;
            }
            return true;
        }
        return false;
    }
}
window.SnesDma = SnesDma;
