/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Super Nintendo (SNES) 16MB Master System Bus
 * 
 * Emulates the physical central bus. Decodes 24-bit addresses, routing operations to:
 * - 128KB Main Work RAM (0x7E0000 - 0x7FFFFF)
 * - Cartridge Mapper ROM/SRAM (LoROM/HiROM)
 * - PPU Registers (0x2100 - 0x213F)
 * - APU Ports (0x2140 - 0x2143)
 * - CPU Hardware Registers (0x4200 - 0x421F)
 * - DMA/HDMA Channels (0x4300 - 0x437F)
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Concentrates physical address line arbitration,
 *   open-bus emulation, and hardware registers state decoding.
 */

class SnesBus {
    /**
     * @param {SnesPpu} ppu - Injected PPU co-processor.
     * @param {SnesApu} apu - Injected APU container.
     * @param {SnesOrchestrator} orchestrator - Master loop controller for sync access.
     */
    constructor(ppu, apu, orchestrator) {
        this.ppu = ppu;
        this.apu = apu;
        this.orchestrator = orchestrator;
        this.mapper = null; 

        // 128KB System Work RAM
        this.ram = new Uint8Array(0x20000);
        this.ramAdr = 0; // WRAM pointer for $2180 register access

        // --- CPU Status & Configuration Registers ($4200 - 0x421F) ---
        this.fastMem = false;
        this.openBus = 0;
        this.ppuLatch = true;

        // Hardware Multiply / Divide Registers
        this.multiplyA = 0xFF;
        this.divA = 0xFFFF;
        this.divResult = 0x0101;
        this.mulResult = 0xFE01;

        // Automatic Joypad Polling Registers
        this.autoJoyRead = false;
        this.autoJoyTimer = 0;
        this.joypad1Val = 0;
        this.joypad2Val = 0;
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypadStrobe = false;
        this.joypad1State = 0; 
        this.joypad2State = 0;

        // Hardware Interrupt Status Flags
        this.hIrqEnabled = false;
        this.vIrqEnabled = false;
        this.nmiEnabled = false;
        this.hTimer = 0x01FF;
        this.vTimer = 0x01FF;

        // DMA & HDMA Core Channels State (8 parallel channels)
        this.dmaActive = new Array(8).fill(false);
        this.hdmaActive = new Array(8).fill(false);
        this.dmaMode = new Uint8Array(8);
        this.dmaFixed = new Array(8).fill(false);
        this.dmaDec = new Array(8).fill(false);
        this.hdmaInd = new Array(8).fill(false);
        this.dmaFromB = new Array(8).fill(false);
        this.dmaUnusedBit = new Array(8).fill(false);
        
        this.dmaBadr = new Uint8Array(8);
        this.dmaAadr = new Uint16Array(8);
        this.dmaAadrBank = new Uint8Array(8);
        this.dmaSize = new Uint16Array(8);
        this.hdmaIndBank = new Uint8Array(8);
        this.hdmaTableAdr = new Uint16Array(8);
        this.hdmaRepCount = new Uint8Array(8);
        this.dmaUnusedByte = new Uint8Array(8);
        
        // System-wide DMA state flags
        this.dmaBusy = false;
        this.dmaTimer = 0;
        this.hdmaTimer = 0;
        this.dmaOffIndex = 0;
        this.hdmaDoTransfer = new Array(8).fill(false);
        this.hdmaTerminated = new Array(8).fill(false);

        // Constant offsets for DMA transfers
        this.dmaOffs = [
            0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1,
            0, 1, 2, 3, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1
        ];
        this.dmaOffLengths = [1, 2, 2, 4, 4, 4, 2, 4];
    }

    /**
     * Mounts a cartridge mapper strategy onto the bus.
     * @param {SnesMapper} mapper
     */
    mountCartridge(mapper) {
        this.mapper = mapper;
    }

    /**
     * Automates 16-bit controller serial reads triggered during V-Blank.
     */
    doAutoJoyRead() {
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypad1Val = this.joypad1State;
        this.joypad2Val = this.joypad2State;

        for (let i = 0; i < 16; i++) {
            let bit = this.joypad1Val & 0x01;
            this.joypad1Val >>= 1;
            this.joypad1Val |= 0x8000;
            this.joypad1AutoRead |= (bit << (15 - i));

            let bit2 = this.joypad2Val & 0x01;
            this.joypad2Val >>= 1;
            this.joypad2Val |= 0x8000;
            this.joypad2AutoRead |= (bit2 << (15 - i));
        }
    }

    // ========================================================================
    // DIRECT MEMORY ACCESS (DMA) STATE MACHINES
    // ========================================================================

    /**
     * Executes standard DMA transfers. Suspends CPU operation while busy.
     */
    handleDma() {
        if (this.dmaTimer > 0) {
            this.dmaTimer -= 2; 
            return;
        }

        let ch;
        for (ch = 0; ch < 8; ch++) {
            if (this.dmaActive[ch]) break;
        }

        if (ch === 8) {
            this.dmaBusy = false;
            this.dmaOffIndex = 0;
            return;
        }

        const tableOff = this.dmaMode[ch] * 4 + this.dmaOffIndex++;
        this.dmaOffIndex &= 0x03;

        // CORRECTED: We pass 'true' as the third parameter to prevent CPU cycle penalties during DMA
        if (this.dmaFromB[ch]) {
            this.write(
                (this.dmaAadrBank[ch] << 16) | this.dmaAadr[ch], 
                this.readBBus((this.dmaBadr[ch] + this.dmaOffs[tableOff]) & 0xFF), 
                true
            );
        } else {
            this.writeBBus(
                (this.dmaBadr[ch] + this.dmaOffs[tableOff]) & 0xFF, 
                this.read((this.dmaAadrBank[ch] << 16) | this.dmaAadr[ch], true)
            );
        }

        this.dmaTimer += 6;
        if (!this.dmaFixed[ch]) {
            if (this.dmaDec[ch]) this.dmaAadr[ch]--;
            else this.dmaAadr[ch]++;
        }

        this.dmaSize[ch]--;
        if (this.dmaSize[ch] === 0) {
            this.dmaOffIndex = 0;
            this.dmaActive[ch] = false;
            this.dmaTimer += 8; // Per-channel termination overhead penalty
        }
    }

    /**
     * Initializes Horizontal DMA (HDMA) registers at the start of a frame.
     */
    initHdma() {
        this.hdmaTimer = 18;
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i]) {
                this.dmaActive[i] = false;
                this.dmaOffIndex = 0;
                this.hdmaTableAdr[i] = this.dmaAadr[i];
                // CORRECTED: Added 'true' parameter to prevent CPU penalty cycles on read operations
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

    /**
     * Executes H-Blank DMA transfers across all active channels.
     */
    handleHdma() {
        this.hdmaTimer = 18;
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i] && !this.hdmaTerminated[i]) {
                this.dmaActive[i] = false;
                this.hdmaTimer += 8;

                if (this.hdmaDoTransfer[i]) {
                    const count = this.dmaOffLengths[this.dmaMode[i]];
                    for (let j = 0; j < count; j++) {
                        const tableOff = this.dmaMode[i] * 4 + j;
                        this.hdmaTimer += 8;

                        // CORRECTED: Added 'true' parameter to prevent CPU penalty cycles on read/write operations
                        if (this.hdmaInd[i]) {
                            if (this.dmaFromB[i]) {
                                this.write((this.hdmaIndBank[i] << 16) | this.dmaSize[i], this.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xFF), true);
                            } else {
                                this.writeBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xFF, this.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true));
                            }
                            this.dmaSize[i]++;
                        } else {
                            if (this.dmaFromB[i]) {
                                this.write((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], this.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xFF), true);
                            } else {
                                this.writeBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xFF, this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true));
                            }
                            this.hdmaTableAdr[i]++;
                        }
                    }
                }
                this.hdmaRepCount[i]--;
                this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
                
                if ((this.hdmaRepCount[i] & 0x7F) === 0) {
                    this.hdmaRepCount[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                    if (this.hdmaInd[i]) {
                        this.dmaSize[i] = this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true);
                        this.dmaSize[i] |= this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true) << 8;
                        this.hdmaTimer += 16;
                    }
                    if (this.hdmaRepCount[i] === 0) this.hdmaTerminated[i] = true;
                    this.hdmaDoTransfer[i] = true;
                }
            }
        }
    }

    // ========================================================================
    // B-BUS REGISTERS & CPU REGISTERS MAPPINGS
    // ========================================================================

    readBBus(offset) {
        if (offset > 0x33 && offset < 0x40) return this.ppu ? this.ppu.read(offset) : 0;
        if (offset >= 0x40 && offset < 0x80) {
            if (this.orchestrator) this.orchestrator.catchUpApu();
            return this.apu ? this.apu.readPort(offset & 3) : 0;
        }
        if (offset === 0x80) {
            const val = this.ram[this.ramAdr++];
            this.ramAdr &= 0x1FFFF;
            return val;
        }
        return this.openBus;
    }

    writeBBus(offset, value) {
        if (offset < 0x34) {
            if (this.ppu) this.ppu.write(offset, value);
            return;
        }
        if (offset >= 0x40 && offset < 0x80) {
            if (this.orchestrator) this.orchestrator.catchUpApu();
            if (this.apu) this.apu.writePort(offset & 3, value);
            return;
        }
        switch (offset) {
            case 0x80: this.ram[this.ramAdr++] = value; this.ramAdr &= 0x1FFFF; break;
            case 0x81: this.ramAdr = (this.ramAdr & 0x1FF00) | value; break;
            case 0x82: this.ramAdr = (this.ramAdr & 0x100FF) | (value << 8); break;
            case 0x83: this.ramAdr = (this.ramAdr & 0x0FFFF) | ((value & 1) << 16); break;
        }
    }

    /**
     * Resolves CPU internal and multiply/divide register reads.
     */
    readCpuReg(register) {
        register &= 0xFFFF;
        switch (register) {
            case 0x4210: {
                let val = 0x02; // SNES CPU standard version layout
                val |= this.inNmi ? 0x80 : 0;
                val |= this.openBus & 0x70;
                this.inNmi = false; // Reading clears NMI pending flags
                return val;
            }
            case 0x4211: {
                let val = this.inIrq ? 0x80 : 0;
                val |= this.openBus & 0x7F;
                this.inIrq = false;
                if (this.orchestrator.cpu) this.orchestrator.cpu.irqWanted = false; // Reading clears IRQ pending flags
                return val;
            }
            case 0x4212: {
                let val = (this.autoJoyTimer > 0) ? 0x01 : 0;
                val |= this.ppu && this.ppu.inHblank ? 0x40 : 0;
                val |= this.ppu && this.ppu.inVblank ? 0x80 : 0;
                val |= this.openBus & 0x3E;
                return val;
            }
            case 0x4213: return this.ppuLatch ? 0x80 : 0;
            case 0x4214: return this.divResult & 0xFF;
            case 0x4215: return (this.divResult >> 8) & 0xFF;
            case 0x4216: return this.mulResult & 0xFF;
            case 0x4217: return (this.mulResult >> 8) & 0xFF;
            case 0x4218: return this.joypad1AutoRead & 0xFF;
            case 0x4219: return (this.joypad1AutoRead >> 8) & 0xFF;
            case 0x421A: return this.joypad2AutoRead & 0xFF;
            case 0x421B: return (this.joypad2AutoRead >> 8) & 0xFF;
        }

        if (register >= 0x4300 && register < 0x4380) {
            const channel = (register & 0xF0) >> 4;
            switch (register & 0xFF0F) {
                case 0x4300: {
                    let val = this.dmaMode[channel];
                    val |= this.dmaFixed[channel] ? 0x08 : 0;
                    val |= this.dmaDec[channel] ? 0x10 : 0;
                    val |= this.dmaUnusedBit[channel] ? 0x20 : 0;
                    val |= this.hdmaInd[channel] ? 0x40 : 0;
                    val |= this.dmaFromB[channel] ? 0x80 : 0;
                    return val;
                }
                case 0x4301: return this.dmaBadr[channel];
                case 0x4302: return this.dmaAadr[channel] & 0xFF;
                case 0x4303: return (this.dmaAadr[channel] >> 8) & 0xFF;
                case 0x4304: return this.dmaAadrBank[channel];
                case 0x4305: return this.dmaSize[channel] & 0xFF;
                case 0x4306: return (this.dmaSize[channel] >> 8) & 0xFF;
                case 0x4307: return this.hdmaIndBank[channel];
                case 0x4308: return this.hdmaTableAdr[channel] & 0xFF;
                case 0x4309: return (this.hdmaTableAdr[channel] >> 8) & 0xFF;
                case 0x430A: return this.hdmaRepCount[channel];
                case 0x430B:
                case 0x430F: return this.dmaUnusedByte[channel];
            }
        }
        return this.openBus;
    }

    /**
     * Resolves CPU internal configurations and hardware math trigger writes.
     */
    writeCpuReg(register, value) {
        register &= 0xFFFF;
        value &= 0xFF;
        switch (register) {
            case 0x4200:
                this.autoJoyRead = (value & 0x01) > 0;
                if (!this.autoJoyRead) this.autoJoyTimer = 0;
                this.hIrqEnabled = (value & 0x10) > 0;
                this.vIrqEnabled = (value & 0x20) > 0;
                this.nmiEnabled = (value & 0x80) > 0;
                break;
            case 0x4201:
                if (this.ppuLatch && (value & 0x80) === 0 && this.ppu) {
                    this.ppu.latchedHpos = this.orchestrator.xPos >> 2;
                    this.ppu.latchedVpos = this.orchestrator.yPos;
                    this.ppu.countersLatched = true;
                }
                this.ppuLatch = (value & 0x80) > 0;
                break;
            case 0x4202: this.multiplyA = value; break;
            case 0x4203: this.mulResult = this.multiplyA * value; break;
            case 0x4204: this.divA = (this.divA & 0xFF00) | value; break;
            case 0x4205: this.divA = (this.divA & 0x00FF) | (value << 8); break;
            case 0x4206:
                this.divResult = 0xFFFF;
                this.mulResult = this.divA;
                if (value !== 0) {
                    this.divResult = Math.floor(this.divA / value) & 0xFFFF;
                    this.mulResult = (this.divA % value) & 0xFFFF;
                }
                break;
            case 0x4207: this.hTimer = (this.hTimer & 0x0100) | value; break;
            case 0x4208: this.hTimer = (this.hTimer & 0x00FF) | ((value & 0x01) << 8); break;
            case 0x4209: this.vTimer = (this.vTimer & 0x0100) | value; break;
            case 0x420A: this.vTimer = (this.vTimer & 0x00FF) | ((value & 0x01) << 8); break;
            case 0x420B:
                this.dmaActive[0] = (value & 0x01) > 0; this.dmaActive[1] = (value & 0x02) > 0;
                this.dmaActive[2] = (value & 0x04) > 0; this.dmaActive[3] = (value & 0x08) > 0;
                this.dmaActive[4] = (value & 0x10) > 0; this.dmaActive[5] = (value & 0x20) > 0;
                this.dmaActive[6] = (value & 0x40) > 0; this.dmaActive[7] = (value & 0x80) > 0;
                this.dmaBusy = value > 0;
                this.dmaTimer += this.dmaBusy ? 8 : 0;
                break;
            case 0x420C:
                this.hdmaActive[0] = (value & 0x01) > 0; this.hdmaActive[1] = (value & 0x02) > 0;
                this.hdmaActive[2] = (value & 0x04) > 0; this.hdmaActive[3] = (value & 0x08) > 0;
                this.hdmaActive[4] = (value & 0x10) > 0; this.hdmaActive[5] = (value & 0x20) > 0;
                this.hdmaActive[6] = (value & 0x40) > 0; this.hdmaActive[7] = (value & 0x80) > 0;
                break;
            case 0x420D: this.fastMem = (value & 0x01) > 0; break;
        }
        
        if (register >= 0x4300 && register < 0x4380) {
            const channel = (register & 0xF0) >> 4;
            switch (register & 0xFF0F) {
                case 0x4300:
                    this.dmaMode[channel] = value & 0x07;
                    this.dmaFixed[channel] = (value & 0x08) > 0;
                    this.dmaDec[channel] = (value & 0x10) > 0;
                    this.dmaUnusedBit[channel] = (value & 0x20) > 0;
                    this.hdmaInd[channel] = (value & 0x40) > 0;
                    this.dmaFromB[channel] = (value & 0x80) > 0;
                    break;
                case 0x4301: this.dmaBadr[channel] = value; break;
                case 0x4302: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xFF00) | value; break;
                case 0x4303: this.dmaAadr[channel] = (this.dmaAadr[channel] & 0x00FF) | (value << 8); break;
                case 0x4304: this.dmaAadrBank[channel] = value; break;
                case 0x4305: this.dmaSize[channel] = (this.dmaSize[channel] & 0xFF00) | value; break;
                case 0x4306: this.dmaSize[channel] = (this.dmaSize[channel] & 0x00FF) | (value << 8); break;
                case 0x4307: this.hdmaIndBank[channel] = value; break;
                case 0x4308: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0xFF00) | value; break;
                case 0x4309: this.hdmaTableAdr[channel] = (this.hdmaTableAdr[channel] & 0x00FF) | (value << 8); break;
                case 0x430A: this.hdmaRepCount[channel] = value; break;
                case 0x430B: case 0x430F: this.dmaUnusedByte[channel] = value; break;
            }
        }
    }

    // ========================================================================
    // PHYSICAL READS & WRITES (24-BIT ADDRESSING)
    // ========================================================================

    read(address, dma = false) {
        address &= 0xFFFFFF; // Security boundary mask for timing checks
        const bank = address >> 16;
        const offset = address & 0xFFFF;

        // CORRECTED: Apply Master Clock Cycle penalties automatically during standard CPU memory reads
        if (!dma && this.orchestrator) {
            this.orchestrator.cpu.cpuMemOps++;
            this.orchestrator.cpuCyclesLeft += this.getAccessTime(address);
        }

        if (bank === 0x7E || bank === 0x7F) {
            return this.ram[((bank & 0x01) << 16) | offset];
        }

        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xC0))) {
            if (offset < 0x2000) return this.ram[offset & 0x1FFF]; 
            if (offset >= 0x2100 && offset < 0x2200) return this.readBBus(offset & 0xFF);
            if (offset === 0x4016) {
                const val = this.joypad1Val & 0x01;
                this.joypad1Val = (this.joypad1Val >> 1) | 0x8000;
                return val;
            }
            if (offset === 0x4017) {
                const val = this.joypad2Val & 0x01;
                this.joypad2Val = (this.joypad2Val >> 1) | 0x8000;
                return val;
            }
            if (offset >= 0x4200 && offset < 0x4380) return this.readCpuReg(offset);
        }

        this.openBus = this.mapper ? this.mapper.read(bank, offset) : this.openBus;
        return this.openBus;
    }

    write(address, value, dma = false) {
        address &= 0xFFFFFF;
        value &= 0xFF;
        const bank = address >> 16;
        const offset = address & 0xFFFF;
        this.openBus = value;

        // CORRECTED: Apply Master Clock Cycle penalties automatically during standard CPU memory writes
        if (!dma && this.orchestrator) {
            this.orchestrator.cpu.cpuMemOps++;
            this.orchestrator.cpuCyclesLeft += this.getAccessTime(address);
        }

        if (bank === 0x7E || bank === 0x7F) {
            this.ram[((bank & 0x01) << 16) | offset] = value;
            return;
        }

        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xC0))) {
            if (offset < 0x2000) { this.ram[offset & 0x1FFF] = value; return; }
            if (offset >= 0x2100 && offset < 0x2200) { this.writeBBus(offset & 0xFF, value); return; }
            if (offset === 0x4016) { this.joypadStrobe = (value & 0x01) > 0; return; }
            if (offset >= 0x4200 && offset < 0x4380) { this.writeCpuReg(offset, value); return; }
        }

        if (this.mapper) this.mapper.write(bank, offset, value);
    }

    /**
     * Resolves physical bus access delays.
     * Returns cycle-delay penalties based on memory regions and FastROM toggles.
     * @param {number} address
     * @returns {number} Access T-states (cycles)
     */
    getAccessTime(address) {
        address &= 0xFFFFFF; // Security Mask
        const bank = address >> 16;
        const offset = address & 0xFFFF;
        if (bank >= 0x40 && bank < 0x80) return 8; 
        if (bank >= 0xC0) return this.fastMem ? 6 : 8; 
        if (offset < 0x2000) return 8; 
        if (offset < 0x4000) return 6; 
        if (offset < 0x4200) return 12; 
        return (this.fastMem && bank >= 0x80) ? 6 : 8;
    }
}

// Safely publish class to global namespace
window.SnesBus = SnesBus;