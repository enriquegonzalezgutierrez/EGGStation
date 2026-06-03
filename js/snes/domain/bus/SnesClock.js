/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesClock
 * 
 * ROLE:
 * Handles system cycle synchronization, H/V timers, interrupts (NMI/IRQ), 
 * and Hblank/Vblank logic.
 */

class SnesClock {
    constructor(bus) {
        this.bus = bus;
        
        // Calculate APU cycle ratio relative to Master Clock
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        this.reset();
    }

    reset() {
        // PPU/CPU Sync counters
        this.xPos = 0;
        this.yPos = 0;
        this.frames = 0;

        this.cpuCyclesLeft = 5 * 8 + 12; // Reset overhead: 5 read cycles + 2 IO cycles
        this.cpuMemOps = 0;
        this.apuCatchCycles = 0;

        // Interrupt and Timer Flags
        this.hIrqEnabled = false;
        this.vIrqEnabled = false;
        this.nmiEnabled = false;
        this.hTimer = 0x1ff;
        this.vTimer = 0x1ff;
        
        this.inNmi = false;
        this.inIrq = false;
        this.inHblank = false;
        this.inVblank = false;
    }

    /**
     * Steps the system clock for one master cycle.
     */
    cycle(noPpu) {
        this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

        this.bus.joypad.strobe();

        if (this.bus.dma.hdmaTimer > 0) {
            this.bus.dma.hdmaTimer -= 2;
        } else if (this.bus.dma.dmaBusy) {
            this.bus.dma.handleDma();
        } else if (this.xPos < 536 || this.xPos >= 576) {
            // CPU is paused for 40 cycles starting around dot 536
            this.cpuCycle();
        }

        // Interrupt line evaluations (IRQ/NMI)
        if (this.yPos === this.vTimer && this.vIrqEnabled) {
            if (!this.hIrqEnabled) {
                if (this.xPos === 0) {
                    this.inIrq = true;
                    this.bus.cpu.irqWanted = true;
                }
            } else {
                if (this.xPos === (this.hTimer * 4)) {
                    this.inIrq = true;
                    this.bus.cpu.irqWanted = true;
                }
            }
        } else if (this.xPos === (this.hTimer * 4) && this.hIrqEnabled && !this.vIrqEnabled) {
            this.inIrq = true;
            this.bus.cpu.irqWanted = true;
        }

        // Hblank/Vblank logic
        if (this.xPos === 1024) {
            this.inHblank = true;
            if (!this.inVblank) {
                this.bus.dma.handleHdma();
            }
        } else if (this.xPos === 0) {
            this.inHblank = false;
            this.bus.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512 && !noPpu) {
            this.bus.ppu.renderLine(this.yPos);
        }

        if (this.yPos === (this.bus.ppu.frameOverscan ? 240 : 225) && this.xPos === 0) {
            this.inNmi = true;
            this.inVblank = true;
            this.bus.joypad.startAutoRead();
            if (this.nmiEnabled) {
                this.bus.cpu.nmiWanted = true;
            }
        } else if (this.yPos === 0 && this.xPos === 0) {
            this.inNmi = false;
            this.inVblank = false;
            this.bus.dma.initHdma();
        }

        this.bus.joypad.cycle();

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
            this.bus.cpu.cyclesLeft = 0;
            this.cpuMemOps = 0;
            this.bus.cpu.cycle();
            this.cpuCyclesLeft += (this.bus.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
        }
        this.cpuCyclesLeft -= 2;
    }

    catchUpApu() {
        const catchUpCycles = this.apuCatchCycles & 0xffffffff;
        for (let i = 0; i < catchUpCycles; i++) {
            this.bus.apu.cycle();
        }
        this.apuCatchCycles -= catchUpCycles;
    }

    runFrame(noPpu) {
        do {
            this.cycle(noPpu);
        } while (!(this.xPos === 0 && this.yPos === 0));
    }

    readReg(adr) {
        switch (adr) {
            case 0x4210: {
                let val = 0x2;
                val |= this.inNmi ? 0x80 : 0;
                val |= this.bus.openBus & 0x70;
                this.inNmi = false;
                return val;
            }
            case 0x4211: {
                let val = this.inIrq ? 0x80 : 0;
                val |= this.bus.openBus & 0x7f;
                this.inIrq = false;
                this.bus.cpu.irqWanted = false;
                return val;
            }
            case 0x4212: {
                let val = (this.bus.joypad.autoJoyTimer > 0) ? 0x1 : 0;
                val |= this.inHblank ? 0x40 : 0;
                val |= this.inVblank ? 0x80 : 0;
                val |= this.bus.openBus & 0x3e;
                return val;
            }
        }
        return this.bus.openBus;
    }

    writeReg(adr, value) {
        switch (adr) {
            case 0x4200:
                this.bus.joypad.autoJoyRead = (value & 0x1) > 0;
                if (!this.bus.joypad.autoJoyRead) this.bus.joypad.autoJoyTimer = 0;
                this.hIrqEnabled = (value & 0x10) > 0;
                this.vIrqEnabled = (value & 0x20) > 0;
                this.nmiEnabled = (value & 0x80) > 0;
                if (!this.hIrqEnabled && !this.vIrqEnabled) {
                    this.bus.cpu.irqWanted = false;
                    this.inIrq = false;
                }
                return true;
            case 0x4207:
                this.hTimer = (this.hTimer & 0x100) | value;
                return true;
            case 0x4208:
                this.hTimer = (this.hTimer & 0xff) | ((value & 0x1) << 8);
                return true;
            case 0x4209:
                this.vTimer = (this.vTimer & 0x100) | value;
                return true;
            case 0x420a:
                this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
                return true;
        }
        return false;
    }
}
window.SnesClock = SnesClock;
