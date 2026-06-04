/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSystemBus (Unified Bus Routing Extension)
 * 
 * ROLE:
 * Handles absolute 24-bit Bus-A decoding, Bus-B mapping ($2100-$21FF / $4000-$40FF),
 * joypads reads, and WRAM mirroring accesses.
 */

{
    SnesSystem.prototype.readBBus = function(adr) {
        if (adr > 0x33 && adr < 0x40) {
            return this.ppu.read(adr);
        }
        if (adr >= 0x40 && adr < 0x80) {
            this.catchUpApu();
            return this.apu.spcWritePorts[adr & 0x3];
        }
        if (adr === 0x80) {
            let val = this.ram[this.ramAdr++];
            this.ramAdr &= 0x1ffff;
            return val;
        }
        return this.openBus;
    };

    SnesSystem.prototype.writeBBus = function(adr, value) {
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
            case 0x80: {
                this.ram[this.ramAdr++] = value;
                this.ramAdr &= 0x1ffff;
                return;
            }
            case 0x81: {
                this.ramAdr = (this.ramAdr & 0x1ff00) | value;
                return;
            }
            case 0x82: {
                this.ramAdr = (this.ramAdr & 0x100ff) | (value << 8);
                return;
            }
            case 0x83: {
                this.ramAdr = (this.ramAdr & 0x0ffff) | ((value & 1) << 16);
                return;
            }
        }
    };

    SnesSystem.prototype.rread = function(address) {
        let adr = address & 0xffffff;
        let bank = adr >> 16;
        adr &= 0xffff;
        
        if (bank === 0x7e || bank === 0x7f) {
            return this.ram[((bank & 0x1) << 16) | adr];
        }
        if (adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (adr < 0x2000) {
                return this.ram[adr & 0x1fff];
            }
            if (adr >= 0x2100 && adr < 0x2200) {
                return this.readBBus(adr & 0xff);
            }
            if (adr === 0x4016) {
                let val = this.joypad1Val & 0x1;
                this.joypad1Val >>= 1;
                this.joypad1Val |= 0x8000;
                return val;
            }
            if (adr === 0x4017) {
                let val = this.joypad2Val & 0x1;
                this.joypad2Val >>= 1;
                this.joypad2Val |= 0x8000;
                return val;
            }
            if (adr >= 0x4200 && adr < 0x4380) {
                return this.readReg(adr);
            }
        }
        
        // Safety check to handle boot sequence before cartridge initialization
        if (this.cart) {
            return this.cart.read(bank, adr);
        }
        return this.openBus;
    };

    SnesSystem.prototype.read = function(adr, dma = false) {
        if (!dma) {
            this.cpuMemOps++;
            this.cpuCyclesLeft += this.getAccessTime(adr);
        }
        let val = this.rread(adr);
        this.openBus = val;
        return val;
    };

    SnesSystem.prototype.write = function(address, value, dma = false) {
        if (!dma) {
            this.cpuMemOps++;
            this.cpuCyclesLeft += this.getAccessTime(address);
        }

        this.openBus = value;
        let adr = address & 0xffffff;
        let bank = adr >> 16;
        let offset = adr & 0xffff;
        
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
    };

    SnesSystem.prototype.getAccessTime = function(adr) {
        return SnesMemoryMap.getAccessCycles(adr, this.fastMem);
    };
}