/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesClock (JIT-Optimized Execution Sync Engine - Compatibility Restored)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles system cycle synchronization, horizontal/vertical counters, 
 * interrupts (NMI/IRQ), DMA/HDMA trigger timing, and video scanline render scheduling.
 * 
 * SOLID Principles:
 * - SRP: Exclusively orchestrates the master execution clock and time-slice scheduling.
 */

class SnesClock {
    /**
     * @param {Object} bus - Central motherboard aggregate instance.
     */
    constructor(bus) {
        this.bus = bus;
        
        // APU clock multiplier ratio relative to the Master Clock
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        this.reset();
    }

    /**
     * Resets system timers, synchronization states, and interrupt lines.
     */
    reset() {
        // PPU/CPU Coordinate Sync counters
        this.xPos = 0;
        this.yPos = 0;
        this.frames = 0;

        // Reset overhead: 5 read cycles + 2 IO cycles
        this.cpuCyclesLeft = 5 * 8 + 12; 
        this.cpuMemOps = 0;
        
        // High-Performance Integer clock accumulator
        this.elapsedMasterCycles = 0;
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
     * Steps the system clock for exactly one master cycle (2 master clock ticks).
     * Highly optimized hot path executed ~178,000 times per frame.
     * @param {boolean} noPpu - True to suppress PPU rendering operations.
     */
    cycle(noPpu) {
        // Accumulate elapsed master cycles as an integer to prevent floating-point overhead in the hot loop
        this.elapsedMasterCycles += 2;

        // Strobe joypad registers synchronously to maintain register latching times
        this.bus.joypad.strobe();

        // DMA and HDMA triggers (highest priority bus activities)
        if (this.bus.dma.hdmaTimer > 0) {
            this.bus.dma.hdmaTimer -= 2;
        } else if (this.bus.dma.dmaBusy) {
            this.bus.dma.handleDma();
        } else if (this.xPos < 536 || this.xPos >= 576) {
            // CPU executing instructions (paused for DRAM refresh at xPos [536, 576))
            this.cpuCycle();
        }

        // Interrupt Line Queries (NMI / IRQ logic)
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

        // Hblank/Vblank logic gates
        if (this.xPos === 1024) {
            this.inHblank = true;
            if (!this.inVblank) {
                this.bus.dma.handleHdma();
            }
        } else if (this.xPos === 0) {
            this.inHblank = false;
            this.bus.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512 && !noPpu) {
            // Synchronously render active scanline to buffer
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

        // Stepping internal joypad clock to satisfy auto-reading timeouts ($4212 polling)
        this.bus.joypad.cycle();

        // Position progression
        this.xPos += 2;
        if (this.xPos === 1364) {
            this.xPos = 0;
            this.yPos++;
            
            if (this.yPos === 262) {
                this.yPos = 0;
                this.frames++;
                this.catchUpApu();
            }
        }
    }

    /**
     * Steps the Ricoh 5A22 CPU core cycles.
     */
    cpuCycle() {
        if (this.cpuCyclesLeft === 0) {
            this.bus.cpu.cyclesLeft = 0;
            this.cpuMemOps = 0;
            this.bus.cpu.cycle();
            this.cpuCyclesLeft += (this.bus.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
        }
        this.cpuCyclesLeft -= 2;
    }

    /**
     * Synchronizes and executes any pending APU cycles up to the current master clock timestamp.
     */
    catchUpApu() {
        // Flush integer-accumulated master clock steps into APU cycles prior to processing
        if (this.elapsedMasterCycles > 0) {
            this.apuCatchCycles += (this.elapsedMasterCycles * this.apuCyclesPerMaster);
            this.elapsedMasterCycles = 0;
        }

        const catchUpCycles = this.apuCatchCycles | 0; // Fast integer cast
        if (catchUpCycles > 0) {
            for (let i = 0; i < catchUpCycles; i++) {
                this.bus.apu.cycle();
            }
            this.apuCatchCycles -= catchUpCycles;
        }
    }

    /**
     * Runs hardware execution up to the boundaries of exactly one video frame.
     */
    runFrame(noPpu) {
        do {
            this.cycle(noPpu);
        } while (!(this.xPos === 0 && this.yPos === 0));
    }

    /**
     * SnesClock specific I/O Register reads.
     */
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

    /**
     * SnesClock specific I/O Register writes.
     */
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