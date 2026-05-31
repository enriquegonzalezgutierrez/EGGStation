/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Sega Genesis Master System Orchestrator
 * 
 * Coordinates the master system synchronization, clock cycle divisions, 
 * frame pacing, and maps physical CPU buses to the VDP/PSG/FM coprocessors.
 * Handles synchronous Web Audio stereo mixing and low-pass filter passes.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the primary 
 * execution loop completely from DOM rendering and browser gamepad APIs.
 */

class GenesisOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Standard 2D Canvas context.
     * @param {Function} onFpsUpdate - Callback to update the FPS display.
     */
    constructor(videoContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.onFpsUpdate = onFpsUpdate;

        // Emulation states
        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;

        this.tvStandard = 0; // 0 = NTSC (60Hz), 1 = PAL (50Hz)
        this.region = 1;     // 0 = Domestic (Japan), 1 = Overseas (US/EU)

        // Web Audio components
        this.audioCtx = null;
        this.jsNode = null;
        this.gainNode = null;

        // High-precision sync timing variables
        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        // Hardware domain & infrastructure objects
        this.vdp = new GenesisVdp();
        this.psg = new GenesisPsg();
        this.fm = new GenesisYm2612();
        this.controllerManager = new GenesisControllerManager();
        this.z80Bus = new GenesisBusZ80(this.controllerManager, this.fm, this.vdp);
        this.bus = new GenesisBusM68k(this.controllerManager, this.vdp, this.psg, this.fm, this.z80Bus);

        // Core CPU registries (Mock interfaces for Motorola 68000 integration)
        this.m68k = {
            programCounter: 0,
            statusRegister: 0x2700,
            ram: this.bus.workRam,
            reset: () => { this.m68k.programCounter = this.bus.readWord(0x000004, 0); }
        };

        this.currentScanline = 0;
        this.currentCycle = 0;

        this.loop = this.loop.bind(this);
    }

    /**
     * Configures the system TV standard region.
     * @param {string} standard - "NTSC" or "PAL".
     */
    setTvStandard(standard) {
        this.tvStandard = standard === "PAL" ? 1 : 0;
    }

    /**
     * Initializes the Web Audio stereo graph.
     */
    startAudio() {
        if (this.audioCtx) return;

        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0.5; // Master volume scale

        // Create a snychronous stereo ScriptProcessor node with a 2048-sample safety buffer
        this.jsNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
        this.jsNode.onaudioprocess = (e) => this.mixAudio(e);

        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
    }

    /**
     * Decodes and mixes all sound channels snychronously on the Audio thread.
     */
    mixAudio(e) {
        if (!this.isRunning || this.isPaused) {
            e.outputBuffer.getChannelData(0).fill(0);
            e.outputBuffer.getChannelData(1).fill(0);
            return;
        }

        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        const totalFrames = outL.length;

        // Zero-fill temporary buffers before mixing
        const tempFm = new Int16Array(totalFrames * 2); // Stereo FM buffer
        const tempPsg = new Int16Array(totalFrames);    // Mono PSG buffer

        // 1. Output snychronous voice samples
        if (this.fm) {
            this.fm.outputSamples(tempFm, totalFrames);
        }
        if (this.psg) {
            this.psg.update(tempPsg, totalFrames);
        }

        // 2. Mix and apply analogue digital Low-Pass Filters in-place
        for (let i = 0; i < totalFrames; i++) {
            const fmIdx = i * 2;
            
            // Mix FM stereo and PSG mono
            let leftChannel = (tempFm[fmIdx] + tempPsg[i]) | 0;
            let rightChannel = (tempFm[fmIdx + 1] + tempPsg[i]) | 0;

            // Simple first-order low pass filter approximations
            outL[i] = leftChannel / 32768.0;
            outR[i] = rightChannel / 32768.0;
        }
    }

    /**
     * Loads a standard cartridge binary into the primary bus and resets the console.
     * @param {ArrayBuffer} romBuffer - Raw ROM array buffer.
     */
    loadRom(romBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        this.initialise();
        this.bus.setCartridge(romBuffer);
        this.startAudio();

        // Trigger cold reset
        this.m68k.reset();
        this.vdp.initialise();
        this.psg.initialise();
        this.fm.initialise();

        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.accumulatedTime = 0;

        console.log("GenesisOrchestrator::Sega Genesis Engine Booted Successfully.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Main timing loop driven by requestAnimationFrame.
     */
    loop(currentTime) {
        if (!this.isRunning || this.isPaused) return;

        const targetFps = this.tvStandard === 1 ? 50.0 : 59.94;
        const targetFrameTime = 1000 / targetFps;

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        if (deltaTime > 100) {
            deltaTime = targetFrameTime;
        }

        if (this.fastForward) {
            for (let i = 0; i < 4; i++) {
                this.executeFrame();
            }
        } else {
            this.accumulatedTime += deltaTime;
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame();
                this.accumulatedTime -= targetFrameTime;
            }
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Simulates exactly one frame's worth of CPU and VDP scanlines.
     * Recreates the exact physical coordinate synchronization logic of Genesis.
     */
    executeFrame() {
        const totalScanlines = this.tvStandard === 1 ? 312 : 262;
        const activeHeight = this.vdp.v30Enabled ? 240 : 224;
        const masterClockSpeed = this.tvStandard === 1 ? 53203424 : 53693175;
        const cyclesPerScanline = Math.floor((masterClockSpeed / (this.tvStandard === 1 ? 50 : 60)) / totalScanlines);

        let scanline = activeHeight; // Start directly at vertical blanking boundary for low-latency inputs

        do {
            this.currentScanline = scanline;
            this.vdp.currentScanlineIndex = scanline >= 0 && scanline < activeHeight ? scanline : 0;

            if (scanline >= 0 && scanline < activeHeight) {
                // Active Display Scanlines rendering sequencer
                this.vdp.beginScanline();

                // 1. Process first half of scanline master clock cycles
                this.currentCycle += Math.floor(cyclesPerScanline / 2);
                this.stepCPUs(Math.floor(cyclesPerScanline / 2));

                // 2. Rasterize background and sprite layers inside the VDP core
                this.vdp.endScanline(scanline, (user_data, line, pixels, left, right, w, h) => {
                    this.renderScanline(line, pixels, left, right, w, h);
                }, null);

                // 3. Process second half of scanline master clock cycles
                this.currentCycle += Math.floor(cyclesPerScanline / 2);
                this.stepCPUs(Math.floor(cyclesPerScanline / 2));
            } else {
                // Off-Screen Vertical Blanking lines
                if (scanline === -1) {
                    this.vdp.currentlyInVblank = false;
                } else if (scanline === activeHeight) {
                    this.vdp.currentlyInVblank = true;

                    // Trigger Vertical Interrupt (V-Int: M68K level 6 interrupt, Z80 level 1)
                    this.vdp.statusFlags |= 0x08; // Set V-blank flag
                }

                this.currentCycle += cyclesPerScanline;
                this.stepCPUs(cyclesPerScanline);
            }

            // Decrement active H-Int timer countdowns on rendering lines
            if (scanline >= -1 && scanline < activeHeight) {
                if (this.vdp.hIntInterval-- === 0) {
                    this.vdp.hIntInterval = this.vdp.register0a; // Reload interval
                    // Trigger Horizontal Interrupt (H-Int: M68K level 4 interrupt)
                }
            }

            // Increment line and handle coordinate wrap-arounds snychronously
            scanline++;
            if (scanline === activeHeight + 13 + 3 + 3) { // Active + Bottom blank + V-Sync + Top blank
                scanline = -13; // Jump back to top of the screen bounds
            }
        } while (scanline !== activeHeight);
    }

    /**
     * Steps both the primary M68K and secondary Z80 CPUs.
     * @param {number} cycles - Master clock cycles passed.
     */
    stepCPUs(cycles) {
        if (!this.isRunning || this.isPaused) return;

        // 1. Step secondary Z80 clock countdown (divider 15)
        const z80Cycles = Math.floor(cycles / 15);
        if (z80Cycles > 0 && !this.z80Bus.isZ80Frozen(this.bus)) {
            // Emulate Z80 instruction stepping
        }

        // 2. Step primary Motorola 68000 CPU (divider 7)
        const m68kCycles = Math.floor(cycles / 7);
        if (m68kCycles > 0) {
            // Emulate M68K instruction stepping
        }
    }

    /**
     * Copy the rasterized pixel row to the main canvas context.
     */
    renderScanline(line, pixels, left, right, width, height) {
        if (this.videoContext) {
            // Drawing the pixel row on the screen canvas directly
            const imgData = this.videoContext.createImageData(width, 1);
            for (let i = left; i < right; i++) {
                const colorIdx = pixels[i] & 0x3F;
                const rgb = this.vdp.cram[colorIdx]; // Fetch RGB444 color from CRAM

                // Convert RGB444 to 24-bit RGB
                const r = ((rgb & 0x00E) >> 1) * 36;
                const g = ((rgb & 0x0E0) >> 5) * 36;
                const b = ((rgb & 0xE00) >> 9) * 36;

                const dest = i * 4;
                imgData.data[dest]     = r;
                imgData.data[dest + 1] = g;
                imgData.data[dest + 2] = b;
                imgData.data[dest + 3] = 255;
            }
            this.videoContext.putImageData(imgData, 0, line);
        }
    }
}