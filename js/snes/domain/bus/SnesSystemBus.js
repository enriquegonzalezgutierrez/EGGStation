/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSystemBus (Motherboard Bus Aggregate Root - JIT Optimized)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the main motherboard of the Super Nintendo. It acts as the central 
 * System Bus, routing memory accesses, managing DMA/HDMA channels, latching 
 * controller inputs, and synchronizing execution timings between CPU, PPU, and APU.
 * OPTIMIZED: Inlines access timing calculations inside read/write methods to
 * completely eliminate redundant function context calls and bit-shifting math.
 * 
 * SOLID Principles:
 * - SRP: Exclusively orchestrates component communication, memory maps, and DMA.
 * - DIP: Integrates modular SnesCpu, SnesPpu, SnesApu, and SnesCartridge instances.
 */

// Module-scoped Constants (Zero allocation, high performance lookups)

class Snes {
    constructor() {
        // Instantiate decoupled subsystem entities
        this.cpu = new SnesCpu(this);
        this.ppu = new SnesPpu(this);
        this.apu = new SnesApu(this);
        this.math = new SnesMathUnit();
        this.joypad = new SnesJoypad();

        // Standard 128KB Work RAM (WRAM)
        this.ram = new Uint8Array(0x20000);
        this.cart = undefined;

        // Calculate APU cycle ratio relative to Master Clock
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        this.dma = new SnesDma(this);
        this.clock = new SnesClock(this);

        this.reset();
    }

    /**
     * Complete motherboard and peripherals reset.
     */
    reset(hard = false) {
        if (hard) {
            this.ram.fill(0);
        }



        // Reset peripherals
        this.cpu.reset();
        this.ppu.reset();
        this.apu.reset();

        if (this.cart) {
            this.cart.reset(hard);
        }

        this.clock.reset();

        // Hardware CPU I/O Ports
        this.ramAdr = 0;

        // Joypad / Controllers auto-reading state
        this.joypad.reset();
        this.ppuLatch = true;

        // Arithmetic Registers
        this.math.reset();

        this.fastMem = false;

        // DMA & HDMA Controller
        this.dma.reset();

        this.openBus = 0;
    }

    // ========================================================================
    // SYSTEM CYCLE SYNCHRONIZATION
    // ========================================================================

    /**
     * Steps the system clock for one master cycle.
     */
    cycle(noPpu) {
        this.clock.cycle(noPpu);
    }

    cpuCycle() {
        this.clock.cpuCycle();
    }

    catchUpApu() {
        this.clock.catchUpApu();
    }

    runFrame(noPpu) {
        this.clock.runFrame(noPpu);
    }

    // ========================================================================
    // HARDWARE I/O READ/WRITE BUS INTERFACES
    // ========================================================================





    readReg(adr) {
        switch (adr) {
            case 0x4210:
            case 0x4211:
            case 0x4212:
                return this.clock.readReg(adr);
            case 0x4213:
                return this.ppuLatch ? 0x80 : 0;
            case 0x4214:
            case 0x4215:
            case 0x4216:
            case 0x4217:
                return this.math.readReg(adr);
            case 0x4218:
                return this.joypad.joypad1AutoRead & 0xff;
            case 0x4219:
                return (this.joypad.joypad1AutoRead & 0xff00) >> 8;
            case 0x421a:
                return this.joypad.joypad2AutoRead & 0xff;
            case 0x421b:
                return (this.joypad.joypad2AutoRead & 0xff00) >> 8;
            case 0x421c:
            case 0x421d:
            case 0x421e:
            case 0x421f:
                return 0;
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            return this.dma.readReg(adr);
        }
        return this.openBus;
    }

    writeReg(adr, value) {
        switch (adr) {
            case 0x4200:
                this.clock.writeReg(adr, value);
                return;
            case 0x4201:
                if (this.ppuLatch && (value & 0x80) === 0) {
                    this.ppu.latchedHpos = this.clock.xPos >> 2;
                    this.ppu.latchedVpos = this.clock.yPos;
                    this.ppu.countersLatched = true;
                }
                this.ppuLatch = (value & 0x80) > 0;
                return;
            case 0x4202:
            case 0x4203:
            case 0x4204:
            case 0x4205:
            case 0x4206:
                this.math.writeReg(adr, value);
                return;
            case 0x4207:
            case 0x4208:
            case 0x4209:
            case 0x420a:
                this.clock.writeReg(adr, value);
                return;
            case 0x420b:
            case 0x420c:
                this.dma.writeReg(adr, value);
                return;
            case 0x420d:
                this.fastMem = (value & 0x1) > 0;
                return;
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            this.dma.writeReg(adr, value);
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
                return this.joypad.read4016();
            }
            if (offset === 0x4017) {
                return this.joypad.read4017();
            }
            if (offset >= 0x4200 && offset < 0x4380) return this.readReg(offset);
        }
        if (this.cart) {
            return this.cart.read(bank, offset);
        }
        return this.openBus;
    }

    /**
     * UNIFIED JIT READ ROUTER (Access Time pre-evaluated dynamically inside)
     * Optimizes performance by removing redundant getAccessTime calculations.
     */
    read(adr, dma = false) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (!dma) {
            this.cpuMemOps++;
            
            // Optimized JIT Inlined Access Time calculation
            let accessTime = 8;
            if (bank >= 0x40 && bank < 0x80) {
                accessTime = 8;
            } else if (bank >= 0xc0) {
                accessTime = this.fastMem ? 6 : 8;
            } else if (offset < 0x2000) {
                accessTime = 8;
            } else if (offset < 0x4000) {
                accessTime = 6;
            } else if (offset < 0x4200) {
                accessTime = 12;
            } else if (offset < 0x6000) {
                accessTime = 6;
            } else if (offset < 0x8000) {
                accessTime = 8;
            } else {
                accessTime = (this.fastMem && bank >= 0x80) ? 6 : 8;
            }

            this.cpuCyclesLeft += accessTime;
        }

        // Standard rread process using local variables
        let val;
        if (bank === 0x7e || bank === 0x7f) {
            val = this.ram[((bank & 0x1) << 16) | offset];
        } else if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) {
                val = this.ram[offset & 0x1fff];
            } else if (offset >= 0x2100 && offset < 0x2200) {
                val = this.readBBus(offset & 0xff);
            } else if (offset === 0x4016) {
                val = this.joypad.read4016();
            } else if (offset === 0x4017) {
                val = this.joypad.read4017();
            } else if (offset >= 0x4200 && offset < 0x4380) {
                val = this.readReg(offset);
            } else {
                val = this.openBus;
            }
        } else if (this.cart) {
            val = this.cart.read(bank, offset);
        } else {
            val = this.openBus;
        }

        this.openBus = val;
        return val;
    }

    /**
     * UNIFIED JIT WRITE ROUTER
     */
    write(adr, value, dma = false) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (!dma) {
            this.cpuMemOps++;
            
            // Optimized JIT Inlined Access Time calculation
            let accessTime = 8;
            if (bank >= 0x40 && bank < 0x80) {
                accessTime = 8;
            } else if (bank >= 0xc0) {
                accessTime = this.fastMem ? 6 : 8;
            } else if (offset < 0x2000) {
                accessTime = 8;
            } else if (offset < 0x4000) {
                accessTime = 6;
            } else if (offset < 0x4200) {
                accessTime = 12;
            } else if (offset < 0x6000) {
                accessTime = 6;
            } else if (offset < 0x8000) {
                accessTime = 8;
            } else {
                accessTime = (this.fastMem && bank >= 0x80) ? 6 : 8;
            }

            this.cpuCyclesLeft += accessTime;
        }

        this.openBus = value;

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
                this.joypad.joypadStrobe = (value & 0x1) > 0;
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
        this.joypad.setPad1ButtonPressed(num);
    }

    setPad1ButtonReleased(num) {
        this.joypad.setPad1ButtonReleased(num);
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