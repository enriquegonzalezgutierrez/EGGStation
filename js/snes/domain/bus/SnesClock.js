/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesClock (Ultra-Advanced Diagnostic Performance Breakdown)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles system clock, horizontal/vertical sync, timers, and schedules frame rendering.
 * It integrates a non-intrusive deductive performance profiler to measure 
 * CPU, Background Pixel Blending, Background Tile Fetching, Background Windowing,
 * Sprites, APU, and DMA/HDMA.
 */

class SnesClock {
    constructor(bus) {
        this.bus = bus;
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        // Profiler Timing Accumulators
        this.profPpu = 0;
        this.profSprite = 0;
        this.profFetch = 0;
        this.profWindow = 0;
        this.profBGPixel = 0;
        this.profApu = 0;
        this.profDma = 0;
        
        this.accumCpu = 0;
        this.accumBgPixel = 0;
        this.accumFetch = 0;
        this.accumWindow = 0;
        this.accumSprite = 0;
        this.accumApu = 0;
        this.accumDma = 0;
        this.accumTotal = 0;
        this.profFrameCount = 0;

        this.reset();
    }

    reset() {
        this.xPos = 0;
        this.yPos = 0;
        this.frames = 0;
        this.cpuCyclesLeft = 5 * 8 + 12; 
        this.cpuMemOps = 0;
        this.elapsedMasterCycles = 0;
        this.apuCatchCycles = 0;
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

    cycle(noPpu) {
        this.elapsedMasterCycles += 2;
        this.bus.joypad.strobe();

        if (this.bus.dma.hdmaTimer > 0) {
            this.bus.dma.hdmaTimer -= 2;
        } else if (this.bus.dma.dmaBusy) {
            // Measure active general DMA transfers
            const t0 = performance.now();
            this.bus.dma.handleDma();
            this.profDma += (performance.now() - t0);
        } else if (this.xPos < 536 || this.xPos >= 576) {
            this.cpuCycle();
        }

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

        if (this.xPos === 1024) {
            this.inHblank = true;
            if (!this.inVblank) {
                // Measure HDMA Transfers
                const t0 = performance.now();
                this.bus.dma.handleHdma();
                this.profDma += (performance.now() - t0);
            }
        } else if (this.xPos === 0) {
            this.inHblank = false;
            this.bus.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512 && !noPpu) {
            // Measure total PPU Scanline rendering
            const t0 = performance.now();
            this.bus.ppu.renderLine(this.yPos);
            this.profPpu += (performance.now() - t0);
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
                this.yPos = 0;
                this.frames++;
                this.catchUpApu();
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
        // Measure APU and DSP Cycle execution
        const t0 = performance.now();
        if (this.elapsedMasterCycles > 0) {
            this.apuCatchCycles += (this.elapsedMasterCycles * this.apuCyclesPerMaster);
            this.elapsedMasterCycles = 0;
        }

        const catchUpCycles = this.apuCatchCycles | 0;
        if (catchUpCycles > 0) {
            for (let i = 0; i < catchUpCycles; i++) {
                this.bus.apu.cycle();
            }
            this.apuCatchCycles -= catchUpCycles;
        }
        this.profApu += (performance.now() - t0);
    }

    /**
     * Executes one visible frame while measuring exact subcomponent timings.
     */
    runFrame(noPpu) {
        this.profPpu = 0;
        this.profApu = 0;
        this.profDma = 0;
        this.profSprite = 0;
        this.profFetch = 0;
        this.profWindow = 0;
        this.profBGPixel = 0;
        
        // Reset subcomponent timers
        if (this.bus.ppu) {
            this.bus.ppu.profSpriteTime = 0;
            this.bus.ppu.profFetchTime = 0;
            this.bus.ppu.profWindowTime = 0;
            this.bus.ppu.profBGPixelTime = 0;
        }

        const tStart = performance.now();

        do {
            this.cycle(noPpu);
        } while (!(this.xPos === 0 && this.yPos === 0));

        const tEnd = performance.now();
        
        // Deductive profiling calculation
        const totalFrameTime = tEnd - tStart;
        const cpuTime = totalFrameTime - (this.profPpu + this.profApu + this.profDma);
        
        const spriteTime = this.bus.ppu ? (this.bus.ppu.profSpriteTime || 0) : 0;
        const fetchTime = this.bus.ppu ? (this.bus.ppu.profFetchTime || 0) : 0;
        const windowTime = this.bus.ppu ? (this.bus.ppu.profWindowTime || 0) : 0;
        const bgPixelTime = this.bus.ppu ? (this.bus.ppu.profBGPixelTime || 0) : 0;

        this.accumCpu += cpuTime;
        this.accumBgPixel += bgPixelTime;
        this.accumFetch += fetchTime;
        this.accumWindow += windowTime;
        this.accumSprite += spriteTime;
        this.accumApu += this.profApu;
        this.accumDma += this.profDma;
        this.accumTotal += totalFrameTime;
        this.profFrameCount++;

        // Report diagnostic metrics once every 60 frames (~1 second)
        if (this.profFrameCount >= 60) {
            const avgCpu = (this.accumCpu / 60).toFixed(2);
            const avgBgPixel = (this.accumBgPixel / 60).toFixed(2);
            const avgFetch = (this.accumFetch / 60).toFixed(2);
            const avgWindow = (this.accumWindow / 60).toFixed(2);
            const avgSprite = (this.accumSprite / 60).toFixed(2);
            const avgApu = (this.accumApu / 60).toFixed(2);
            const avgDma = (this.accumDma / 60).toFixed(2);
            const avgTotal = (this.accumTotal / 60).toFixed(2);
            
            console.log(`[EGGStation Core Breakdown] Frame Time: ${avgTotal}ms | CPU: ${avgCpu}ms | BG-Pixel: ${avgBgPixel}ms | BG-Fetch: ${avgFetch}ms | BG-Window: ${avgWindow}ms | Sprite: ${avgSprite}ms | APU: ${avgApu}ms | DMA: ${avgDma}ms`);

            this.accumCpu = 0;
            this.accumBgPixel = 0;
            this.accumFetch = 0;
            this.accumWindow = 0;
            this.accumSprite = 0;
            this.accumApu = 0;
            this.accumDma = 0;
            this.accumTotal = 0;
            this.profFrameCount = 0;
        }
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
            case 0x420a:
                this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
                return true;
        }
        return false;
    }
}

window.SnesClock = SnesClock;