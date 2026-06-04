/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSystem (Master Timing & Control Unit)
 * 
 * ROLE:
 * Coordinates the master clock sync, line/screen timings, video frame pacing, 
 * interrupts, and coordinates execution between sub-processors.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively manages global clock ticks,
 *   line position counters, and hardware interrupts.
 */

{
    class SnesSystem {
        constructor() {
            this.cpu = new Cpu(this);
            this.ppu = new Ppu(this);
            this.apu = new Apu(this);

            // System Work RAM (128 KB)
            this.ram = new Uint8Array(0x20000);
            this.cart = undefined;

            // DMA timing offsets & configuration parameters
            this.dmaOffs = [
                0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1,
                0, 1, 2, 3, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1
            ];
            this.dmaOffLengths = [1, 2, 2, 4, 4, 4, 2, 4];

            // NTSC execution clock ratio matching target hardware frequency
            this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

            // Allocation of registers for DMA/HDMA channels
            this.dmaBadr = new Uint8Array(8);
            this.dmaAadr = new Uint16Array(8);
            this.dmaAadrBank = new Uint8Array(8);
            this.dmaSize = new Uint16Array(8);
            this.hdmaIndBank = new Uint8Array(8);
            this.hdmaTableAdr = new Uint16Array(8);
            this.hdmaRepCount = new Uint8Array(8);
            this.dmaUnusedByte = new Uint8Array(8);

            this.reset(true);
        }

        reset(hard) {
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

            this.cpu.reset();
            this.ppu.reset();
            this.apu.reset();
            
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
            this.joypad1AutoRead = 0;
            this.joypad2AutoRead = 0;
            this.joypadStrobe = false;
            this.joypad1State = 0;
            this.joypad2State = 0;

            this.multiplyA = 0xff;
            this.divA = 0xffff;
            this.divResult = 0x101;
            this.mulResult = 0xfe01;

            this.fastMem = false;

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

        /**
         * Main physical timing step. Triggers raster scanlines and clocks sub-systems.
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
                // Inlined CPU clock step (eliminates fast path function call bounds)
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
                    this.handleHdma();
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
            let catchUpCycles = this.apuCatchCycles & 0xffffffff;
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

        loadRom(rom, isHirom) {
            rom = SnesCartridge.stripSmcHeader(rom);
            const header = SnesCartridge.parseHeader(rom, isHirom);
            this.cart = new SnesCartridge(rom, header, isHirom);
            return true;
        }

        parseHeader(rom, isHirom) {
            return SnesCartridge.parseHeader(rom, isHirom);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesSystem;
    } else if (typeof window !== 'undefined') {
        window.SnesSystem = SnesSystem;
        window.Snes = SnesSystem; // Backward compatibility alias
    }
}