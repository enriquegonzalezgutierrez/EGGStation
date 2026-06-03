/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesDma (Highly Optimized DMA & HDMA Transfer Engine)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles high-speed Direct Memory Access (DMA) and Horizontal DMA (HDMA) transfers,
 * copying data blocks between Cartridge ROM, WRAM, VRAM, CGRAM, and OAM.
 * 
 * SOLID Principles:
 * - SRP: Exclusively handles hardware DMA/HDMA channels, triggers, and speed delays.
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

    /**
     * Handles active general DMA transfers between memory banks.
     * GC-FREE: Employs cached TypedArray references.
     */
    handleDma() {
        if (this.dmaTimer > 0) {
            this.dmaTimer -= 2;
            return;
        }

        // Cache typed arrays locally to prevent property lookups in the hot loop
        const dmaActive = this.dmaActive;
        const dmaMode = this.dmaMode;
        const dmaFromB = this.dmaFromB;
        const dmaBadr = this.dmaBadr;
        const dmaAadrBank = this.dmaAadrBank;
        const dmaAadr = this.dmaAadr;
        const dmaFixed = this.dmaFixed;
        const dmaDec = this.dmaDec;
        const dmaSize = this.dmaSize;
        const bus = this.bus;

        let i;
        for (i = 0; i < 8; i++) {
            if (dmaActive[i]) {
                break;
            }
        }
        if (i === 8) {
            this.dmaBusy = false;
            this.dmaOffIndex = 0;
            return;
        }

        const mode = dmaMode[i];
        const tableOff = (mode << 2) + this.dmaOffIndex++;
        this.dmaOffIndex &= 0x3;

        const badr = dmaBadr[i];
        const aadrBank = dmaAadrBank[i] << 16;
        const aadr = dmaAadr[i];

        if (dmaFromB[i]) {
            bus.write(
                aadrBank | aadr,
                bus.readBBus((badr + DMA_OFFS[tableOff]) & 0xff), 
                true
            );
        } else {
            bus.writeBBus(
                (badr + DMA_OFFS[tableOff]) & 0xff,
                bus.read(aadrBank | aadr, true)
            );
        }
        this.dmaTimer += 6;
        if (!dmaFixed[i]) {
            if (dmaDec[i]) {
                dmaAadr[i] = (aadr - 1) & 0xffff;
            } else {
                dmaAadr[i] = (aadr + 1) & 0xffff;
            }
        }
        dmaSize[i] = (dmaSize[i] - 1) & 0xffff;
        if (dmaSize[i] === 0) {
            this.dmaOffIndex = 0;
            dmaActive[i] = false;
            this.dmaTimer += 8;
        }
    }

    /**
     * Initializes Horizontal DMA (HDMA) registers at the start of VBlank.
     */
    initHdma() {
        this.hdmaTimer = 18;
        const bus = this.bus;
        
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i]) {
                this.dmaActive[i] = false;
                this.dmaOffIndex = 0;

                this.hdmaTableAdr[i] = this.dmaAadr[i];
                const aadrBank = this.dmaAadrBank[i] << 16;
                this.hdmaRepCount[i] = bus.read(aadrBank | this.hdmaTableAdr[i]++, true);
                this.hdmaTimer += 8;
                if (this.hdmaInd[i]) {
                    let size = bus.read(aadrBank | this.hdmaTableAdr[i]++, true);
                    size |= bus.read(aadrBank | this.hdmaTableAdr[i]++, true) << 8;
                    this.dmaSize[i] = size;
                    this.hdmaTimer += 16;
                }
                this.hdmaDoTransfer[i] = true;
            } else {
                this.hdmaDoTransfer[i] = false;
            }
            this.hdmaTerminated[i] = false;
        }
    }

    /**
     * Executes active HDMA transfers during HBlank.
     * GC-FREE: Employs local register buffers to prevent repeated typed array writes.
     */
    handleHdma() {
        this.hdmaTimer = 18;
        
        // Cache typed arrays locally to prevent index-validation penalties inside the inner loops
        const hdmaActive = this.hdmaActive;
        const hdmaTerminated = this.hdmaTerminated;
        const hdmaDoTransfer = this.hdmaDoTransfer;
        const dmaMode = this.dmaMode;
        const hdmaInd = this.hdmaInd;
        const dmaFromB = this.dmaFromB;
        const hdmaIndBank = this.hdmaIndBank;
        const dmaSize = this.dmaSize;
        const dmaBadr = this.dmaBadr;
        const dmaAadrBank = this.dmaAadrBank;
        const hdmaTableAdr = this.hdmaTableAdr;
        const hdmaRepCount = this.hdmaRepCount;
        const bus = this.bus;

        for (let i = 0; i < 8; i++) {
            if (hdmaActive[i] && !hdmaTerminated[i]) {
                this.dmaActive[i] = false;
                this.hdmaTimer += 8;
                if (hdmaDoTransfer[i]) {
                    const mode = dmaMode[i];
                    const offsetLength = DMA_OFF_LENGTHS[mode];
                    const badr = dmaBadr[i];
                    const modeOffset = mode << 2; // Fast left-shift multiplier replacing mode * 4
                    const fromB = dmaFromB[i];

                    if (hdmaInd[i]) {
                        const indBank = hdmaIndBank[i] << 16;
                        let size = dmaSize[i]; // Buffer in local register

                        for (let j = 0; j < offsetLength; j++) {
                            const tableOff = modeOffset + j;
                            this.hdmaTimer += 8;
                            if (fromB) {
                                bus.write(
                                    indBank | size,
                                    bus.readBBus((badr + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                bus.writeBBus(
                                    (badr + DMA_OFFS[tableOff]) & 0xff,
                                    bus.read(indBank | size, true)
                                );
                            }
                            size++;
                        }
                        dmaSize[i] = size; // Flush back exactly once
                    } else {
                        const aadrBank = dmaAadrBank[i] << 16;
                        let tableAdr = hdmaTableAdr[i]; // Buffer in local register

                        for (let j = 0; j < offsetLength; j++) {
                            const tableOff = modeOffset + j;
                            this.hdmaTimer += 8;
                            if (fromB) {
                                bus.write(
                                    aadrBank | tableAdr,
                                    bus.readBBus((badr + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                bus.writeBBus(
                                    (badr + DMA_OFFS[tableOff]) & 0xff,
                                    bus.read(aadrBank | tableAdr, true)
                                );
                            }
                            tableAdr++;
                        }
                        hdmaTableAdr[i] = tableAdr; // Flush back exactly once
                    }
                }
                
                let repCount = hdmaRepCount[i];
                repCount--;
                hdmaDoTransfer[i] = (repCount & 0x80) > 0;
                
                if ((repCount & 0x7f) === 0) {
                    const aadrBank = dmaAadrBank[i] << 16;
                    let tableAdr = hdmaTableAdr[i];
                    repCount = bus.read(aadrBank | tableAdr++, true);
                    hdmaTableAdr[i] = tableAdr;

                    if (hdmaInd[i]) {
                        let size = bus.read(aadrBank | tableAdr++, true);
                        size |= bus.read(aadrBank | tableAdr++, true) << 8;
                        hdmaTableAdr[i] = tableAdr;
                        dmaSize[i] = size;
                        this.hdmaTimer += 16;
                    }
                    if (repCount === 0) {
                        hdmaTerminated[i] = true;
                    }
                    hdmaDoTransfer[i] = true;
                }
                hdmaRepCount[i] = repCount;
            }
        }
    }

    /**
     * Reads DMA/HDMA specific I/O Registers ($4300-$437F range).
     */
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

    /**
     * Writes DMA/HDMA specific I/O Registers ($4300-$437F range).
     */
    writeReg(adr, value) {
        if (adr === 0x420b) {
            const dmaActive = this.dmaActive;
            dmaActive[0] = (value & 0x1) > 0;
            dmaActive[1] = (value & 0x2) > 0;
            dmaActive[2] = (value & 0x4) > 0;
            dmaActive[3] = (value & 0x8) > 0;
            dmaActive[4] = (value & 0x10) > 0;
            dmaActive[5] = (value & 0x20) > 0;
            dmaActive[6] = (value & 0x40) > 0;
            dmaActive[7] = (value & 0x80) > 0;
            this.dmaBusy = value > 0;
            this.dmaTimer += this.dmaBusy ? 8 : 0;
            return true;
        }

        if (adr === 0x420c) {
            const hdmaActive = this.hdmaActive;
            hdmaActive[0] = (value & 0x1) > 0;
            hdmaActive[1] = (value & 0x2) > 0;
            hdmaActive[2] = (value & 0x4) > 0;
            hdmaActive[3] = (value & 0x8) > 0;
            hdmaActive[4] = (value & 0x10) > 0;
            hdmaActive[5] = (value & 0x20) > 0;
            hdmaActive[6] = (value & 0x40) > 0;
            hdmaActive[7] = (value & 0x80) > 0;
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