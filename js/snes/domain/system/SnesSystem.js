/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/system/SnesSystem.js
 * 
 * Domain Layer: Super Nintendo (SNES) Master Control Unit
 * 
 * Role:
 * Orchestrates the master clock synchronization, line/screen timings, video frame pacing, 
 * interrupts, and coordinates execution between sub-processors.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively coordinates global clock ticks, 
 *   line position counters, and hardware interrupts. Delegates memory bus enrouting, 
 *   DMA transfers, and register I/O decoding to specialized sub-classes.
 * - Dependency Inversion Principle (DIP): Instantiates and interacts with SnesSystemBus, 
 *   SnesSystemDma, and SnesSystemIoPorts through generic decoupled abstractions.
 */

class SnesSystem {
    constructor() {
        // --- 1. SOLID Subsystems Instantiation (Must be instantiated first! - Circular Dependency Fix) ---
        this.bus = new SnesSystemBus(this);     // Encapsulated 24-bit physical memory Bus
        this.dma = new SnesSystemDma(this);    // Encapsulated DMA/HDMA Controller
        this.io = new SnesSystemIoPorts(this);   // Encapsulated CPU I/O Register Ports

        // --- 2. Hardware Cores Instantiation ---
        this.cpu = new Cpu(this);
        this.ppu = new Ppu(this);
        this.apu = new SnesApu(this);

        // System Work RAM (128 KB)
        this.ram = new Uint8Array(0x20000);
        this.cart = undefined;

        // NTSC execution clock ratio matching target hardware frequency
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        this.reset(true);
    }

    /**
     * Cold-boots the console, resetting all sub-systems, registers, and timers.
     * @param {boolean} hard - If true, clears the system work RAM.
     */
    reset(hard) {
        if (hard) {
            this.ram.fill(0);
        }

        this.cpu.reset();
        this.ppu.reset();
        this.apu.reset();
        
        // SOLID Fix: Delegates reset execution to DMA controller
        if (this.dma) {
            this.dma.reset(hard); 
        }

        if (this.cart) {
            this.cart.reset(hard);
        }

        this.xPos = 0;
        this.yPos = 0;
        this.frames = 0;

        this.cpuCyclesLeft = 5 * 8 + 12; // Reset cycle overhead
        this.cpuMemOps = 0;
        this.apuCatchCycles = 0;

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

        this.autoJoyRead = false;
        this.autoJoyTimer = 0;
        this.ppuLatch = true;

        this.joypad1Val = 0;
        this.joypad2Val = 0;
        this.joypad1State = 0;
        this.joypad2State = 0;
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypadStrobe = false;

        this.multiplyA = 0xff;
        this.divA = 0xffff;
        this.divResult = 0x101;
        this.mulResult = 0xfe01;

        this.fastMem = false;
        this.openBus = 0;
    }

    /**
     * Primary memory read enrouting. Delegates directly to SnesSystemBus (SRP).
     */
    read(adr, dma = false) {
        return this.bus.read(adr, dma);
    }

    /**
     * Primary memory write enrouting. Delegates directly to SnesSystemBus (SRP).
     */
    write(address, value, dma = false) {
        this.bus.write(address, value, dma);
    }

    /**
     * B-Bus read. Delegates directly to SnesSystemBus (SRP).
     */
    readBBus(adr) {
        return this.bus.readBBus(adr);
    }

    /**
     * B-Bus write. Delegates directly to SnesSystemBus (SRP).
     */
    writeBBus(adr, value) {
        this.bus.writeBBus(adr, value);
    }

    /**
     * Primary physical timing step. Triggers raster scanlines and clocks sub-processors.
     * @param {boolean} noPpu - If true, skips PPU line rendering (for fast-forward).
     */
    cycle(noPpu) {
        this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

        if (this.joypadStrobe) {
            this.joypad1Val = this.joypad1State;
            this.joypad2Val = this.joypad2State;
        }

        // SOLID Fix: Accesses timers and status flags through the DMA controller instance
        if (this.dma.hdmaTimer > 0) {
            this.dma.hdmaTimer -= 2;
        } else if (this.dma.dmaBusy) {
            this.dma.handleDma();
        } else if (this.xPos < 536 || this.xPos >= 576) {
            if (this.cpuCyclesLeft === 0) {
                this.cpu.cyclesLeft = 0;
                this.cpuMemOps = 0;
                this.cpu.cycle();
                this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
            }
            this.cpuCyclesLeft -= 2;
        }

        // Interrupt Line evaluations
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

        // H-Blank triggers
        if (this.xPos === 1024) {
            this.inHblank = true;
            if (!this.inVblank) {
                this.dma.handleHdma(); // SOLID Fix: Delegates HDMA update to DMA controller
            }
        } else if (this.xPos === 0) {
            this.inHblank = false;
            this.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512 && !noPpu) {
            this.ppu.renderLine(this.yPos);
        }

        // V-Blank triggers
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
            this.dma.initHdma(); // SOLID Fix: Delegates HDMA initialization to DMA controller
        }

        if (this.autoJoyTimer > 0) {
            this.autoJoyTimer -= 2;
        }

        this.xPos += 2;
        if (this.xPos === 1364) {
            this.xPos = 0;
            this.yPos++;
            
            const maxLines = (this.ppu && this.ppu.isPal) ? 312 : 262;
            if (this.yPos === maxLines) {
                this.catchUpApu();
                this.yPos = 0;
                this.frames++;
            }
        }
    }

    /**
     * Catches up the SPC700 sound core cycles at the end of a scanline frame.
     */
    catchUpApu() {
        let catchUpCycles = this.apuCatchCycles & 0xffffffff;
        for (let i = 0; i < catchUpCycles; i++) {
            this.apu.cycle();
        }
        this.apuCatchCycles -= catchUpCycles;
    }

    /**
     * Executes exactly one full video frame.
     */
    runFrame(noPpu) {
        do {
            this.cycle(noPpu);
        } while (!(this.xPos === 0 && this.yPos === 0));
    }

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

    /**
     * Loads a new SNES cartridge ROM.
     * @param {Uint8Array} rom - Cleaned ROM bytes.
     * @param {boolean} isHirom - Manual mapping override flag.
     * @returns {Promise<boolean>} True if loaded successfully.
     */
    async loadRom(rom, isHirom) {
        this.cart = new SnesCartridge();
        await this.cart.load(rom);
        this.ppu.isPal = this.cart.isPal;
        return true;
    }
}

// Backward Compatibility Aliases (SOLID LSP)
window.SnesSystem = SnesSystem;
window.Snes = SnesSystem;