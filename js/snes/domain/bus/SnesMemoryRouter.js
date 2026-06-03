class SnesMemoryRouter {
    constructor(board) {
        this.board = board;
    }

    readReg(adr) {
        switch (adr) {
            case 0x4210:
            case 0x4211:
            case 0x4212:
                return this.board.clock.readReg(adr);
            case 0x4213:
                return this.board.ppuLatch ? 0x80 : 0;
            case 0x4214:
            case 0x4215:
            case 0x4216:
            case 0x4217:
                return this.board.math.readReg(adr);
            case 0x4218:
                return this.board.joypad.joypad1AutoRead & 0xff;
            case 0x4219:
                return (this.board.joypad.joypad1AutoRead & 0xff00) >> 8;
            case 0x421a:
                return this.board.joypad.joypad2AutoRead & 0xff;
            case 0x421b:
                return (this.board.joypad.joypad2AutoRead & 0xff00) >> 8;
            case 0x421c:
            case 0x421d:
            case 0x421e:
            case 0x421f:
                return 0;
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            return this.board.dma.readReg(adr);
        }
        return this.board.openBus;
    }

    writeReg(adr, value) {
        switch (adr) {
            case 0x4200:
                this.board.clock.writeReg(adr, value);
                return;
            case 0x4201:
                if (this.board.ppuLatch && (value & 0x80) === 0) {
                    this.board.ppu.latchedHpos = this.board.clock.xPos >> 2;
                    this.board.ppu.latchedVpos = this.board.clock.yPos;
                    this.board.ppu.countersLatched = true;
                }
                this.board.ppuLatch = (value & 0x80) > 0;
                return;
            case 0x4202:
            case 0x4203:
            case 0x4204:
            case 0x4205:
            case 0x4206:
                this.board.math.writeReg(adr, value);
                return;
            case 0x4207:
            case 0x4208:
            case 0x4209:
            case 0x420a:
                this.board.clock.writeReg(adr, value);
                return;
            case 0x420b:
            case 0x420c:
                this.board.dma.writeReg(adr, value);
                return;
            case 0x420d:
                this.board.fastMem = (value & 0x1) > 0;
                return;
        }

        if (adr >= 0x4300 && adr < 0x4380) {
            this.board.dma.writeReg(adr, value);
        }
    }

    readBBus(adr) {
        if (adr > 0x33 && adr < 0x40) return this.board.ppu.read(adr);
        if (adr >= 0x40 && adr < 0x80) {
            this.board.catchUpApu();
            return this.board.apu.spcWritePorts[adr & 0x3];
        }
        if (adr === 0x80) {
            const val = this.board.ram[this.board.ramAdr++];
            this.board.ramAdr &= 0x1ffff;
            return val;
        }
        return this.board.openBus;
    }

    writeBBus(adr, value) {
        if (adr < 0x34) {
            this.board.ppu.write(adr, value);
            return;
        }
        if (adr >= 0x40 && adr < 0x80) {
            this.board.catchUpApu();
            this.board.apu.spcReadPorts[adr & 0x3] = value;
            return;
        }
        switch (adr) {
            case 0x80:
                this.board.ram[this.board.ramAdr++] = value;
                this.board.ramAdr &= 0x1ffff;
                return;
            case 0x81:
                this.board.ramAdr = (this.board.ramAdr & 0x1ff00) | value;
                return;
            case 0x82:
                this.board.ramAdr = (this.board.ramAdr & 0x100ff) | (value << 8);
                return;
            case 0x83:
                this.board.ramAdr = (this.board.ramAdr & 0x0ffff) | ((value & 1) << 16);
                return;
        }
    }

    rread(adr) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (bank === 0x7e || bank === 0x7f) {
            return this.board.ram[((bank & 0x1) << 16) | offset];
        }
        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) return this.board.ram[offset & 0x1fff];
            if (offset >= 0x2100 && offset < 0x2200) return this.readBBus(offset & 0xff);
            if (offset === 0x4016) {
                return this.board.joypad.read4016();
            }
            if (offset === 0x4017) {
                return this.board.joypad.read4017();
            }
            if (offset >= 0x4200 && offset < 0x4380) return this.readReg(offset);
        }
        if (this.board.cart) {
            return this.board.cart.read(bank, offset);
        }
        return this.board.openBus;
    }

    read(adr, dma = false) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (!dma) {
            this.board.cpuMemOps++;
            
            let accessTime = 8;
            if (bank >= 0x40 && bank < 0x80) {
                accessTime = 8;
            } else if (bank >= 0xc0) {
                accessTime = this.board.fastMem ? 6 : 8;
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
                accessTime = (this.board.fastMem && bank >= 0x80) ? 6 : 8;
            }

            this.board.cpuCyclesLeft += accessTime;
        }

        let val;
        if (bank === 0x7e || bank === 0x7f) {
            val = this.board.ram[((bank & 0x1) << 16) | offset];
        } else if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) {
                val = this.board.ram[offset & 0x1fff];
            } else if (offset >= 0x2100 && offset < 0x2200) {
                val = this.readBBus(offset & 0xff);
            } else if (offset === 0x4016) {
                val = this.board.joypad.read4016();
            } else if (offset === 0x4017) {
                val = this.board.joypad.read4017();
            } else if (offset >= 0x4200 && offset < 0x4380) {
                val = this.readReg(offset);
            } else {
                val = this.board.openBus;
            }
        } else if (this.board.cart) {
            val = this.board.cart.read(bank, offset);
        } else {
            val = this.board.openBus;
        }

        this.board.openBus = val;
        return val;
    }

    write(adr, value, dma = false) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (!dma) {
            this.board.cpuMemOps++;
            
            let accessTime = 8;
            if (bank >= 0x40 && bank < 0x80) {
                accessTime = 8;
            } else if (bank >= 0xc0) {
                accessTime = this.board.fastMem ? 6 : 8;
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
                accessTime = (this.board.fastMem && bank >= 0x80) ? 6 : 8;
            }

            this.board.cpuCyclesLeft += accessTime;
        }

        this.board.openBus = value;

        if (bank === 0x7e || bank === 0x7f) {
            this.board.ram[((bank & 0x1) << 16) | offset] = value;
        }
        if (offset < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
            if (offset < 0x2000) {
                this.board.ram[offset & 0x1fff] = value;
            }
            if (offset >= 0x2100 && offset < 0x2200) {
                this.writeBBus(offset & 0xff, value);
            }
            if (offset === 0x4016) {
                this.board.joypad.joypadStrobe = (value & 0x1) > 0;
            }
            if (offset >= 0x4200 && offset < 0x4380) {
                this.writeReg(offset, value);
            }
        }
        if (this.board.cart) {
            this.board.cart.write(bank, offset, value);
        }
    }

    getAccessTime(adr) {
        const address = adr & 0xffffff;
        const bank = address >> 16;
        const offset = address & 0xffff;

        if (bank >= 0x40 && bank < 0x80) return 8;
        if (bank >= 0xc0) return this.board.fastMem ? 6 : 8;
        if (offset < 0x2000) return 8;
        if (offset < 0x4000) return 6;
        if (offset < 0x4200) return 12;
        if (offset < 0x6000) return 6;
        if (offset < 0x8000) return 8;
        return (this.board.fastMem && bank >= 0x80) ? 6 : 8;
    }
}

window.SnesMemoryRouter = SnesMemoryRouter;
