/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Sega Genesis Master System Orchestrator (DRC & Dynamic Pacing)
 * 
 * Coordinates the master system synchronization, clock cycle divisions, 
 * frame pacing, and maps physical CPU buses to the VDP, PSG, and FM coprocessors.
 * Handles synchronous Web Audio stereo mixing and low-pass filter passes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates loop orchestration, frame 
 *   timing, audio buffer dispatching, and system state resets from the DOM.
 * - Dependency Inversion Principle (DIP): Decouples core clocks from browser-specific 
 *   execution lifecycles via delegated callback adapters.
 */

class GenesisOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Standard 2D Canvas context.
     * @param {Function} onFpsUpdate - Callback to update the FPS display.
     */
    constructor(videoContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.onFpsUpdate = onFpsUpdate;

        // Emulation state machine
        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;

        this.tvStandard = 0; // 0 = NTSC (60Hz), 1 = PAL (50Hz)

        // Web Audio API components
        this.audioCtx = null;
        this.jsNode = null;
        this.gainNode = null;

        // Pre-allocated Audio Synthesis buffers (Zero-Allocation Hot Path)
        this.maxAudioBufferSize = 2048;
        this.tempFm = new Int16Array(this.maxAudioBufferSize * 2);
        this.tempPsg = new Int16Array(this.maxAudioBufferSize);

        // High-precision sync timing variables
        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        // Hardware Domain & Infrastructure Instantiation (DIP: Injecting Dependencies)
        this.vdp = new GenesisVdp();
        this.psg = new GenesisPsg();
        this.fm = new GenesisYm2612();
        this.controllerManager = new GenesisControllerManager();

        // Instantiate Busses
        this.z80Bus = new GenesisBusZ80(this.fm);
        this.bus = new GenesisBusM68k(this.controllerManager, this.vdp, this.psg, this.fm, this.z80Bus);

        // Bind Secondary Z80 Bus to Primary 68K Bus to avoid Circular Dependencies
        this.z80Bus.bindMasterBus(
            (addr, cycles) => this.bus.readByte(addr, cycles),
            (addr, val, cycles) => this.bus.writeByte(addr, val, cycles)
        );

        // Core CPU instances
        this.m68k = new M68000(this.bus);
        this.z80 = new ZilogZ80(this.z80Bus); // Reusing the decoupled SMS Z80 core

        // Bind Z80 CPU to Z80 Bus to handle synchronous resets (PC, IFF1/IFF2, IM)
        this.z80Bus.bindCpu(this.z80);

        // Register all modular 68K instruction families safely once all scripts are loaded.
        // This adheres to the Open/Closed Principle (OCP) and prevents load-order crashes.
        if (typeof M68kDataTransfer !== 'undefined') this.m68k.registerModule(M68kDataTransfer.register);
        if (typeof M68kArithmetic !== 'undefined') this.m68k.registerModule(M68kArithmetic.register);
        if (typeof M68kLogical !== 'undefined') this.m68k.registerModule(M68kLogical.register);
        if (typeof M68kBitwise !== 'undefined') this.m68k.registerModule(M68kBitwise.register);
        if (typeof M68kShiftRotate !== 'undefined') this.m68k.registerModule(M68kShiftRotate.register);
        if (typeof M68kProgramFlow !== 'undefined') this.m68k.registerModule(M68kProgramFlow.register);
        if (typeof M68kSystemExceptions !== 'undefined') this.m68k.registerModule(M68kSystemExceptions.register);

        this.currentScanline = 0;
        this.currentCycle = 0;

        // Hard-bind loop to preserve 'this' context inside requestAnimationFrame closures
        this.loop = this.loop.bind(this);
    }

    /**
     * Resets the entire hardware state to cold-boot standards.
     */
    initialise() {
        this.currentScanline = 0;
        this.currentCycle = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        // Synchronously purge memory buffers and reset processors
        this.vdp.initialise();
        this.psg.initialise();
        this.fm.initialise();
        this.controllerManager.initialise();
        this.z80Bus.initialise();
        this.bus.initialise();
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

        // Create a synchronous stereo ScriptProcessor node with a 2048-sample safety buffer
        this.jsNode = this.audioCtx.createScriptProcessor(this.maxAudioBufferSize, 0, 2);
        this.jsNode.onaudioprocess = (e) => this.mixAudio(e);

        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
    }

    /**
     * Decodes and mixes all sound channels synchronously on the Audio thread.
     * Combines the YM2612 FM stereo and SN76489 PSG mono into a final output buffer.
     * @param {AudioProcessingEvent} e - The Web Audio API processing event.
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

        // Safety fallback: dynamically resize pre-allocated buffers if host requests larger block size
        if (totalFrames > this.tempPsg.length) {
            this.tempFm = new Int16Array(totalFrames * 2);
            this.tempPsg = new Int16Array(totalFrames);
        }

        // Clean arrays prior to sound generation passes
        this.tempFm.fill(0);
        this.tempPsg.fill(0);

        // 1. Output synchronous voice samples from hardware
        if (this.fm) this.fm.outputSamples(this.tempFm, totalFrames);
        if (this.psg) this.psg.update(this.tempPsg, totalFrames);

        // 2. Mix and convert to Float32 (-1.0 to +1.0 format expected by Web Audio)
        for (let i = 0; i < totalFrames; i++) {
            const fmIdx = i * 2;
            
            // Mix FM (Int16) and PSG (Int16) avoiding distortion/clipping math
            const fmLeftNormalized = this.tempFm[fmIdx] / 32768.0;
            const fmRightNormalized = this.tempFm[fmIdx + 1] / 32768.0;
            const psgNormalized = this.tempPsg[i] / 32768.0;

            outL[i] = fmLeftNormalized + psgNormalized;
            outR[i] = fmRightNormalized + psgNormalized;
        }
    }

    /**
     * Loads a cartridge binary, mounts it on the bus, and then triggers the CPU hardware reset.
     * @param {ArrayBuffer} romBuffer - Raw ROM array buffer.
     */
    loadRom(romBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // 1. Prepare system components (Clears old arrays)
        this.initialise();
        
        // 2. Mount the ROM cartridge into the 68K memory bus space
        this.bus.setCartridge(romBuffer);
        
        // 3. Trigger CPU hardware reset *AFTER* the ROM cartridge is successfully mounted!
        // This ensures the CPU correctly reads vector tables from address 0x000000 and 0x000004.
        this.m68k.reset();
        
        // 4. Fire up audio systems
        this.startAudio();

        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.accumulatedTime = 0;

        console.log("GenesisOrchestrator::Sega Genesis Engine Booted Successfully.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Toggles the software pause state of the emulator loop.
     */
    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        if (!this.isPaused) {
            this.lastTime = performance.now(); // Reset delta-time to avoid skipping frames upon resume
            this.animationFrameId = requestAnimationFrame(this.loop);
        }
    }

    /**
     * Main timing loop driven by the browser's V-Sync (requestAnimationFrame).
     * @param {number} currentTime - High-resolution timestamp provided by the browser.
     */
    loop(currentTime) {
        if (!this.isRunning || this.isPaused) return;

        // Silent auto-resume handshake on any user interaction/loop tick.
        // Bypasses browser autoplay restrictions completely without modifying HTML/CSS.
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }

        const targetFps = this.tvStandard === 1 ? 50.0 : 59.94;
        const targetFrameTime = 1000 / targetFps;

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Prevent "Spiral of Death" on browser tab switches
        if (deltaTime > 100) {
            deltaTime = targetFrameTime;
        }

        if (this.fastForward) {
            // Uncap FPS, process 4 hardware frames per V-Sync display tick
            for (let i = 0; i < 4; i++) {
                this.executeFrame();
            }
        } else {
            // Standard Timing Accumulator
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
     * Aligned with MDTracer's linear scanline processing for stable timings.
     */
    executeFrame() {
        const totalScanlines = this.tvStandard === 1 ? 312 : 262;
        const activeHeight = this.vdp.v30Enabled ? 240 : 224;
        const masterClockSpeed = this.tvStandard === 1 ? 53203424 : 53693175;
        
        // M68K runs at Master Clock / 7 (Approx 7.67 MHz NTSC)
        const m68kClockSpeed = Math.floor(masterClockSpeed / 7);
        const m68kCyclesPerScanline = Math.floor((m68kClockSpeed / (this.tvStandard === 1 ? 50 : 60)) / totalScanlines);

        // Linear frame loop, identical to MDTracer's stable model
        for (let scanline = 0; scanline < totalScanlines; scanline++) {
            this.currentScanline = scanline;
            this.vdp.currentScanlineIndex = scanline < activeHeight ? scanline : 0;

            if (scanline < activeHeight) {
                // --- Active Display Scanlines ---
                this.vdp.currentlyInVblank = false;
                this.vdp.beginScanline();

                // 1. Process first half of scanline CPU cycles
                this.stepCPUs(Math.floor(m68kCyclesPerScanline / 2));

                // 2. Rasterize background and sprite layers inside the VDP core
                this.vdp.endScanline(scanline, (user_data, line, pixels, shadowMap, w, h) => {
                    this.renderScanline(line, pixels, shadowMap, w, h);
                }, null);

                // 3. Process second half of scanline CPU cycles
                this.stepCPUs(Math.floor(m68kCyclesPerScanline / 2));
            } else {
                // --- Off-Screen Vertical Blanking lines ---
                if (scanline === activeHeight) {
                    this.vdp.currentlyInVblank = true;
                    this.vdp.vIntPending = true; // Assert V-Blank interrupt pending flag

                    // Trigger Vertical Interrupt (V-Int: M68K level 6 interrupt) if enabled
                    if (this.vdp.vIntEnabled) {
                        this.m68k.irqPending = 6;
                    }

                    // FIX: Trigger V-Blank Interrupt on the Z80 secondary CPU thread!
                    // Drives the sound playback driver (driving music/SFX on level loads).
                    if (!this.z80Bus.isZ80Frozen()) {
                        if (typeof this.z80.interrupt === 'function') {
                            this.z80.interrupt(0x38); // Standard Z80 Mode 1 V-Blank Interrupt
                        } else if (typeof this.z80.requestInterrupt === 'function') {
                            this.z80.requestInterrupt(0x38);
                        }
                    }
                }
                
                // Process full scanline's worth of CPU cycles for blanking period
                this.stepCPUs(m68kCyclesPerScanline);
            }

            // Handle Horizontal Interrupts (H-Int: M68K level 4 interrupt)
            if (scanline < activeHeight) {
                if (this.vdp.hIntInterval-- === 0) {
                    this.vdp.hIntInterval = this.vdp.register0a; // Reload interval
                    if (this.vdp.hIntEnabled) {
                        this.m68k.irqPending = 4;
                    }
                }
            }
        }
        
        // Update FPS Stats
        this.framesRendered++;
        if (this.framesRendered % 10 === 0 && this.onFpsUpdate) {
            this.onFpsUpdate(this.fastForward ? "FFWD" : (this.tvStandard === 1 ? "50 FPS" : "60 FPS"));
        }
    }

    /**
     * Steps both the primary M68K and secondary Z80 CPUs synchronously.
     * @param {number} m68kCycles - Motorola 68000 clock ticks to execute.
     */
    stepCPUs(m68kCycles) {
        if (!this.isRunning || this.isPaused) return;

        // Step Primary 68000 CPU
        this.m68k.execute(m68kCycles);

        // Step Secondary Z80 CPU (Z80 runs at approx half the speed of the 68K)
        if (!this.z80Bus.isZ80Frozen()) {
            const z80Cycles = Math.floor(m68kCycles / 2);
            let elapsed = 0;
            while (elapsed < z80Cycles) {
                elapsed += this.z80.executeOne(); // Delegate to decoupled Z80 Core
            }
        }
        
        // Sync Audio Timers
        this.fm.update(m68kCycles);
    }

    /**
     * Copies the rasterized pixel row to the main canvas context via ImageData buffering.
     * @param {number} line - The target Y coordinate on the canvas.
     * @param {Uint8Array} pixels - Raw 8-bit palette indices for the scanline.
     * @param {Uint8Array} shadowMap - Shadows/Highlights mapping bits.
     * @param {number} width - Total active VDP screen width.
     * @param {number} height - Total active VDP screen height.
     */
    renderScanline(line, pixels, shadowMap, width, height) {
        if (this.videoContext) {
            const canvas = this.videoContext.canvas;
            
            // Dynamically resize the internal width and height of the shared <canvas> element.
            // When switching to Genesis (320px or 256px wide), this prevents the browser from 
            // clipping/cutting off the right side of the screen, whilst keeping the shared HTML/CSS intact.
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            const imgData = this.videoContext.createImageData(width, 1);
            const shadowEnabled = this.vdp.shadowHighlightEnabled;
            
            // Fast direct 1D array pixel pushing
            for (let i = 0; i < width; i++) {
                let colorIdx = pixels[i] & 0x3F;
                
                // Default CRAM palette offset
                let cramOffset = 0x000; 

                if (shadowEnabled) {
                    const shadowStatus = shadowMap[i];
                    if (shadowStatus === 0) {
                        cramOffset = 0x040; // Apply shadow palette offset (1/2 luminance)
                    } else if (shadowStatus === 2) {
                        cramOffset = 0x080; // Apply highlight palette offset (double luminance)
                    }
                }

                const rgb = this.vdp.cram[cramOffset + colorIdx]; // Fetch the calculated RGB color

                // Convert SEGA RGB444 to standard 24-bit HTML5 RGB
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