/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: Snes (Motherboard Bus Aggregate Root - Robust Version)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the main motherboard of the Super Nintendo. It acts as the central 
 * System Bus, routing memory accesses, managing DMA/HDMA channels, latching 
 * controller inputs, and synchronizing execution timings between CPU, PPU, and APU.
 * 
 * SOLID Principles:
 * - SRP: Exclusively orchestrates component communication, memory maps, and DMA.
 * - DIP: Integrates modular SnesCpu, SnesPpu, SnesApu, and SnesCartridge instances.
 */

// Module-scoped Constants (Zero allocation, high performance lookups)
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

class Snes {
    constructor() {
        // Instantiate decoupled subsystem entities
        this.cpu = new SnesCpu(this);
        this.ppu = new SnesPpu(this);
        this.apu = new SnesApu(this);

        // Standard 128KB Work RAM (WRAM)
        this.ram = new Uint8Array(0x20000);
        this.cart = undefined;

        // Calculate APU cycle ratio relative to Master Clock
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        // Pre-allocated DMA & HDMA Registers (Channels 0-7)
        this.dmaBadr = new Uint8Array(8);
        this.dmaAadr = new Uint16Array(8);
        this.dmaAadrBank = new Uint8Array(8);
        this.dmaSize = new Uint16Array(8);
        this.hdmaIndBank = new Uint8Array(8);
        this.hdmaTableAdr = new Uint16Array(8);
        this.hdmaRepCount = new Uint8Array(8);
        this.dmaUnusedByte = new Uint8Array(8);

        this.reset();
    }

    /**
     * Complete motherboard and peripherals reset.
     */
    reset(hard = false) {
        if (hard) {
            this.ram.fill(0);
        }

        this.dmaBadr.fill(0);
        this.dmaAadr.fill(0);
        this.dmaAadrBank.fill(0);
        this.dmaSize.fill(0);
        this.hdmaIndBank.fill(0);
        this.hdmaTableAdr.fill(0);
        this.hdmaRepCount.fill(0);
        this.dmaUnusedByte.fill(0);

        // Reset peripherals
        this.cpu.reset();
        this.ppu.reset();
        this.apu.reset();

        if (this.cart) {
            this.cart.reset(hard);
        }

        // PPU/CPU Sync counters
        this.xPos = 0;
        this.yPos = 0;
        this.frames = 0;

        this.cpuCyclesLeft = 5 * 8 + 12; // Reset overhead: 5 read cycles + 2 IO cycles
        this.cpuMemOps = 0;
        this.apuCatchCycles = 0;

        // Hardware CPU I/O Ports
        this.ramAdr = 0;
        this.hIrqEnabled = false;
        this.vIrqEnabled = false;
        this.nmiEnabled = false;
        this.hTimer = 0x1ff;
        this.vTimer = 0x1ff;
        this.inNmi = false;
        this.inIrq = false;
        this.inHblank = false;
        this.inVblank = false;

        // Joypad / Controllers auto-reading state
        this.autoJoyRead = false;
        this.autoJoyTimer = 0;
        this.ppuLatch = true;

        this.joypad1Val = 0;
        this.joypad2Val = 0;
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypadStrobe = false;
        this.joypad1State = 0;
        this.joypad2State = 0;

        // Arithmetic Registers
        this.multiplyA = 0xff;
        this.divA = 0xffff;
        this.divResult = 0x101;
        this.mulResult = 0xfe01;

        this.fastMem = false;

        // DMA & HDMA Channel Flags
        this.dmaTimer = 0;
        this.hdmaTimer = 0;
        this.dmaBusy = false;
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
        this.dmaOffIndex = 0;

        this.openBus = 0;
    }

    // ========================================================================
    // SYSTEM CYCLE SYNCHRONIZATION
    // ========================================================================

    /**
     * Steps the system clock for one master cycle.
     */
    cycle(noPpu) {
        this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

        if (this.joypadStrobe) {
            this.joypad1Val = this.joypad1State;
            this.joypad2Val = this.joypad2State;
        }

        if (this.hdmaTimer > 0) {
            this.hdmaTimer -= 2;
        } else if (this.dmaBusy) {
            this.handleDma();
        } else if (this.xPos < 536 || this.xPos >= 576) {
            // CPU is paused for 40 cycles starting around dot 536
            this.cpuCycle();
        }

        // Interrupt line evaluations (IRQ/NMI)
        if (this.yPos === this.vTimer && this.vIrqEnabled) {
            if (!this.hIrqEnabled) {
                if (this.xPos === 0) {
                    this.inIrq = true;
                    this.cpu.irqWanted = true;
                }
            } else {
                if (this.xPos === (this.hTimer * 4)) {
                    this.inIrq = true;
                    this.cpu.irqWanted = true;
                }
            }
        } else if (this.xPos === (this.hTimer * 4) && this.hIrqEnabled && !this.vIrqEnabled) {
            this.inIrq = true;
            this.cpu.irqWanted = true;
        }

        // Hblank/Vblank logic
        if (this.xPos === 1024) {
            this.inHblank = true;
            if (!this.inVblank) {
                this.handleHdma();
            }
        } else if (this.xPos === 0) {
            this.inHblank = false;
            this.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512 && !noPpu) {
            this.ppu.renderLine(this.yPos);
        }

        if (this.yPos === (this.ppu.frameOverscan ? 240 : 225) && this.xPos === 0) {
            this.inNmi = true;
            this.inVblank = true;
            if (this.autoJoyRead) {
                this.autoJoyTimer = 4224;
                this.doAutoJoyRead();
            }
            if (this.nmiEnabled) {
                this.cpu.nmiWanted = true;
            }
        } else if (this.yPos === 0 && this.xPos === 0) {
            this.inNmi = false;
            this.inVblank = false;
            this.initHdma();
        }

        if (this.autoJoyTimer > 0) {
            this.autoJoyTimer -= 2;
        }

        this.xPos += 2;
        if (this.xPos === 1364) {
            this.xPos = 0;
            this.yPos++;
            if (this.yPos === 262) {
                this.catchUpApu();
                this.yPos = 0;
                this.frames++;
            }
        }
    }

    cpuCycle() {
        if (this.cpuCyclesLeft === 0) {
            this.cpu.cyclesLeft = 0;
            this.cpuMemOps = 0;
            this.cpu.cycle();
            this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
        }
        this.cpuCyclesLeft -= 2;
    }

    catchUpApu() {
        const catchUpCycles = this.apuCatchCycles & 0xffffffff;
        for (let i = 0; i < catchUpCycles; i++) {
            this.apu.cycle();
        }
        this.apuCatchCycles -= catchUpCycles;
    }

    runFrame(noPpu) {
        do {
            this.cycle(noPpu);
        } while (!(this.xPos === 0 && this.yPos === 0));
    }

    // ========================================================================
    // HARDWARE I/O READ/WRITE BUS INTERFACES
    // ========================================================================

    doAutoJoyRead() {
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypad1Val = this.joypad1State;
        this.joypad2Val = this.joypad2State;
        for (let i = 0; i < 16; i++) {
            let bit = this.joypad1Val & 0x1;
            this.joypad1Val >>= 1;
            this.joypad1Val |= 0x8000;
            this.joypad1AutoRead |= (bit << (15 - i));
            bit = this.joypad2Val & 0x1;
            this.joypad2Val >>= 1;
            this.joypad2Val |= 0x8000;
            this.joypad2AutoRead |= (bit << (15 - i));
        }
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
            this.write(
                (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
                this.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                true
            );
        } else {
            this.writeBBus(
                (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                this.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
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
                this.hdmaRepCount[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                this.hdmaTimer += 8;
                if (this.hdmaInd[i]) {
                    this.dmaSize[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                    this.dmaSize[i] |= this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true) << 8;
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
                                this.write(
                                    (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                                    this.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                this.writeBBus(
                                    (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                                    this.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                                );
                            }
                            this.dmaSize[i]++;
                        } else {
                            if (this.dmaFromB[i]) {
                                this.write(
                                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                                    this.readBBus((this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff), 
                                    true
                                );
                            } else {
                                this.writeBBus(
                                    (this.dmaBadr[i] + DMA_OFFS[tableOff]) & 0xff,
                                    this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true)
                                );
                            }
                            this.hdmaTableAdr[i]++;
                        }
                    }
                }
                this.hdmaRepCount[i]--;
                this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
                if ((this.hdmaRepCount[i] & 0x7f) === 0) {
                    this.hdmaRepCount[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                    if (this.hdmaInd[i]) {
                        this.dmaSize[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                        this.dmaSize[i] |= this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true) << 8;
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
            case 0x4213:
                return this.ppuLatch ? 0x80 : 0;
            case 0x4214:
                return this.divResult & 0xff;
            case 0x4215:
                return (this.divResult & 0xff00) >> 8;
            case 0x4216:
                return this.mulResult & 0xff;
            case 0x4217:
                return (this.mulResult & 0xff00) >> 8;
            case 0x4218:
                return this.joypad1AutoRead & 0xff;
            case 0x4219:
                return (this.joypad1AutoRead & 0xff00) >> 8;
            case 0x421a:
                return this.joypad2AutoRead & 0xff;
            case 0x421b:
                return (this.joypad2AutoRead & 0xff00) >> 8;
            case 0x421c:
            case 0x421d:
            case 0x421e:
            case 0x421f:
                return 0;
        }

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
        return this.openBus;
    }

    writeReg(adr, value) {
        switch (adr) {
            case 0x4200:
                this.autoJoyRead = (value & 0x1) > 0;
                if (!this.autoJoyRead) this.autoJoyTimer = 0;
                this.hIrqEnabled = (value & 0x10) > 0;
                this.vIrqEnabled = (value & 0x20) > 0;
                this.nmiEnabled = (value & 0x80) > 0;
                if (!this.hIrqEnabled && !this.vIrqEnabled) {
                    this.cpu.irqWanted = false;
                    this.inIrq = false;
                }
                return;
            case 0x4201:
                if (this.ppuLatch && (value & 0x80) === 0) {
                    this.ppu.latchedHpos = this.xPos >> 2;
                    this.ppu.latchedVpos = this.yPos;
                    this.ppu.countersLatched = true;
                }
                this.ppuLatch = (value & 0x80) > 0;
                return;
            case 0x4202:
                this.multiplyA = value;
                return;
            case 0x4203:
                this.mulResult = this.multiplyA * value;
                return;
            case 0x4204:
                this.divA = (this.divA & 0xff00) | value;
                return;
            case 0x4205:
                this.divA = (this.divA & 0xff) | (value << 8);
                return;
            case 0x4206:
                this.divResult = 0xffff;
                this.mulResult = this.divA;
                if (value !== 0) {
                    this.divResult = (this.divA / value) & 0xffff;
                    this.mulResult = this.divA % value;
                }
                return;
            case 0x4207:
                this.hTimer = (this.hTimer & 0x100) | value;
                return;
            case 0x4208:
                this.hTimer = (this.hTimer & 0xff) | ((value & 0x1) << 8);
                return;
            case 0x4209:
                this.vTimer = (this.vTimer & 0x100) | value;
                return;
            case 0x420a:
                this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
                return;
            case 0x420b:
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
            case 0x420c:
                this.hdmaActive[0] = (value & 0x1) > 0;
                this.hdmaActive[1] = (value & 0x2) > 0;
                this.hdmaActive[2] = (value & 0x4) > 0;
                this.hdmaActive[3] = (value & 0x8) > 0;
                this.hdmaActive[4] = (value & 0x10) > 0;
                this.hdmaActive[5] = (value & 0x20) > 0;
                this.hdmaActive[6] = (value & 0x40) > 0;
                this.hdmaActive[7] = (value & 0x80) > 0;
                return;
            case 0x420d:
                this.fastMem = (value & 0x1) > 0;
                return;
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
                    return;
                case 0x4301: this.dmaBadr[channel] = value; return;
                case 0x4302: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff00) | value; return;
                case 0x4303: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff) | (value << 8); return;
                case 0x4304: this.dmaAadrBank[channel] = value; return;
                case 0x4305: this.dmaSize[channel] = (this.dmaSize[channel] & 0xff00) | value; return;
                case 0x4306: this.dmaSize[channel] = (this.dmaSize[channel] & 0xff) | (value << 8); return;
                case 0x4307: this.hdmaIndBank[channel] = value; return;
                case 0x4308: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff00) | value; return;
                case 0x4309: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xff) | (value << 8); return;
                case 0x430a: this.hdmaRepCount[channel] = value; return;
                case 0x430b:
                case 0x430f: this.dmaUnusedByte[channel] = value; return;
            }
        }
    }

    readBBus(adr) {
        if (adr > 0x33 && adr < 0x40) return this.ppu.read(adr);
        if (adr >= 0x40 && adr < 0x80) {
            this.catchUpApu();
            return this.apu.spcWritePorts[adr & 0x3];
        }
        if (adr === 0x80) {
            const val = this.ram[this.ramAdr++];
            this.ramAdr &= 0x1ffff;
            return val;
        }
        return this.openBus;
    }

    writeBBus(adr, value) {
        if (adr < 0x34) {
            this.ppu.write(adr, value);
            return;
        }
        if (adr >= 0x40 && adr < 0x80) {
            this.catchUpApu();
            this.apu.spcReadPorts[adr & 0x3] = value;
            return;
        }
        switch (adr) {
            case 0x80:
                this.ram[this.ramAdr++] = value;
                this.ramAdr &= 0x1ffff;
                return;
            case 0x81:
                this.ramAdr = (this.ramAdr & 0x1ff00) | value;
                return;
            case 0x82:
                this.ramAdr = (this.ramAdr & 0x100ff) | (value << 8);
                return;
            case 0x83:
                this.ramAdr = (this.ramAdr & 0x0ffff) | ((value & 1) << 16);
                return;
        }
    }

    rread(adr) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (bank === 0x7e || bank === 0x7f) {
            return this.ram[((bank & 0x1) << 16) | offset];
        }
        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) return this.ram[offset & 0x1fff];
            if (offset >= 0x2100 && offset < 0x2200) return this.readBBus(offset & 0xff);
            if (offset === 0x4016) {
                const val = this.joypad1Val & 0x1;
                this.joypad1Val = (this.joypad1Val >> 1) | 0x8000;
                return val;
            }
            if (offset === 0x4017) {
                const val = this.joypad2Val & 0x1;
                this.joypad2Val = (this.joypad2Val >> 1) | 0x8000;
                return val;
            }
            if (offset >= 0x4200 && offset < 0x4380) return this.readReg(offset);
        }
        // PROTECTION: Ensure we only read from cartridge memory if mounted, preventing early reset failures
        if (this.cart) {
            return this.cart.read(bank, offset);
        }
        return this.openBus;
    }

    read(adr, dma = false) {
        if (!dma) {
            this.cpuMemOps++;
            this.cpuCyclesLeft += this.getAccessTime(adr);
        }
        const val = this.rread(adr);
        this.openBus = val;
        return val;
    }

    write(adr, value, dma = false) {
        if (!dma) {
            this.cpuMemOps++;
            this.cpuCyclesLeft += this.getAccessTime(adr);
        }
        this.openBus = value;
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (bank === 0x7e || bank === 0x7f) {
            this.ram[((bank & 0x1) << 16) | offset] = value;
        }
        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) {
                this.ram[offset & 0x1fff] = value;
            }
            if (offset >= 0x2100 && offset < 0x2200) {
                this.writeBBus(offset & 0xff, value);
            }
            if (offset === 0x4016) {
                this.joypadStrobe = (value & 0x1) > 0;
            }
            if (offset >= 0x4200 && offset < 0x4380) {
                this.writeReg(offset, value);
            }
        }
        if (this.cart) {
            this.cart.write(bank, offset, value);
        }
    }

    getAccessTime(adr) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (bank >= 0x40 && bank < 0x80) return 8;
        if (bank >= 0xc0) return this.fastMem ? 6 : 8;
        if (offset < 0x2000) return 8;
        if (offset < 0x4000) return 6;
        if (offset < 0x4200) return 12;
        if (offset < 0x6000) return 6;
        if (offset < 0x8000) return 8;
        return (this.fastMem && bank >= 0x80) ? 6 : 8;
    }

    setPixels(arr) {
        this.ppu.setPixels(arr);
    }

    setSamples(left, right, samples) {
        this.apu.setSamples(left, right, samples);
    }

    setPad1ButtonPressed(num) {
        this.joypad1State |= (1 << num);
    }

    setPad1ButtonReleased(num) {
        this.joypad1State &= (~(1 << num)) & 0xfff;
    }

    loadRom(rom, isHirom) {
        let header;
        if (rom.length % 0x8000 === 0) {
            header = this.parseHeader(rom, isHirom);
        } else if ((rom.length - 512) % 0x8000 === 0) {
            rom = new Uint8Array(Array.prototype.slice.call(rom, 512));
            header = this.parseHeader(rom, isHirom);
        } else {
            return false;
        }

        if (rom.length < header.romSize) {
            const extraData = rom.length - (header.romSize / 2);
            const nRom = new Uint8Array(header.romSize);
            for (let i = 0; i < nRom.length; i++) {
                if (i < (header.romSize / 2)) {
                    nRom[i] = rom[i];
                } else {
                    nRom[i] = rom[(header.romSize / 2) + (i % extraData)];
                }
            }
            rom = nRom;
        }
        this.cart = new SnesCartridge(rom, header, isHirom);
        return true;
    }

    parseHeader(rom, isHirom) {
        let str = "";
        let header;
        const offset = isHirom ? 0xffc0 : 0x7fc0;
        for (let i = 0; i < 21; i++) {
            str += String.fromCharCode(rom[offset + i]);
        }
        header = {
            name: str,
            type: rom[offset + 21] & 0xf,
            speed: rom[offset + 21] >> 4,
            chips: rom[offset + 22],
            romSize: 0x400 << rom[offset + 23],
            ramSize: 0x400 << rom[offset + 24]
        };

        if (header.romSize < rom.length) {
            const bankCount = Math.pow(2, Math.ceil(Math.log2(rom.length / 0x8000)));
            header.romSize = bankCount * 0x8000;
        }
        return header;
    }
}
window.Snes = Snes;