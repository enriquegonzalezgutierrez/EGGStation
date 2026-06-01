/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Sega Genesis Orchestrator
 * 
 * Coordinates the master system synchronization, clock cycle divisions, 
 * frame pacing, and maps physical CPU buses to the VDP, PSG, and FM coprocessors.
 * Handles synchronous Web Audio stereo mixing, low-pass filters, and delegates 
 * full-frame image rendering to the GenesisPostProcessor.
 * Incorporates real-time 68K instruction debugging, breakpoints, and VRAM visualizers.
 * 
 * Aligned with hardware standards observed in BlastEm to resolve:
 * 1. Isolated Z80 Sound Processor: Instantiates the new `GenesisZ80` subclass 
 *    instead of `ZilogZ80`, isolating execution-time prefix safety bypasses 
 *    from Master System dependencies.
 * 2. Standalone Sound Driver Clocking: Synchronizes level-triggered interrupt status 
 *    flags and steps the discrete YM2612 FM timers inside the main loop, restoring 
 *    silent game soundtrack pipelines.
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
     * @param {WebGL2RenderingContext} glContext - GPU WebGL2 rendering context.
     * @param {Function} onFpsUpdate - Callback to update the FPS display.
     */
    constructor(videoContext, glContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.glContext = glContext;
        this.onFpsUpdate = onFpsUpdate;

        // Emulation state machine
        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;

        // Debugger execution states (Synced synchronously with top-bar controls)
        this.isDebugging = false;
        this.breakpointAddress = null;

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
        this.lastDeltaTime = 0; // Tracks live delta-time for real-time FPS calculations

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
        this.z80 = new GenesisZ80(this.z80Bus); // Instantiate the dedicated sound Z80 subclass instead of ZilogZ80

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

        // Persistent full-frame buffers and Post-Processing selectors (Max bounds: 320x240)
        this.glbFrameBuffer = new Uint8ClampedArray(320 * 240 * 4);
        this.prevFrameBuffer = new Uint8ClampedArray(320 * 240 * 4);
        this.postProcessMode = 0; // Default: Bilinear

        // Initialize dedicated Genesis post-processor
        this.postProcessor = new GenesisPostProcessor(this.vdp, this.glContext);

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
        this.lastDeltaTime = 0;

        this.glbFrameBuffer.fill(0);
        this.prevFrameBuffer.fill(0);

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
        
        // Synchronize the TV standard with the master memory bus 
        // to ensure games can dynamically read the correct hardware region bits.
        if (this.bus) {
            this.bus.tvStandard = this.tvStandard;
        }
    }

    /**
     * Updates the active post processing shader uniforms.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
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

        // Synchronize the auto-detected TV standard and region speed directly 
        // with the orchestrator loop parameters. This guarantees that PAL region games 
        // will run synchronously at PAL speeds (50Hz) and bypass region checks successfully.
        this.setTvStandard(this.bus.tvStandard === 1 ? "PAL" : "NTSC");
        
        // 3. Trigger CPU hardware reset *AFTER* the ROM cartridge is successfully mounted!
        // This ensures the CPU correctly reads vector tables from address 0x000000 and 0x000004.
        this.m68k.reset();
        
        // 4. Fire up audio systems
        this.startAudio();

        this.isRunning = true;
        this.isPaused = false;
        this.isDebugging = false;
        this.breakpointAddress = null;
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
        if (!this.isRunning || this.isPaused || this.isDebugging) {
            if (this.isDebugging) {
                this.lastTime = currentTime;
                this.animationFrameId = requestAnimationFrame(this.loop);
            }
            return;
        }

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

        // Cache the delta time synchronously for performance and FPS monitor scaling
        this.lastDeltaTime = deltaTime;

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
     * Aligned with BlastEm's linear scanline processing for stable timings.
     */
    executeFrame() {
        const totalScanlines = this.tvStandard === 1 ? 312 : 262;
        const activeHeight = this.vdp.v30Enabled ? 240 : 224;
        const masterClockSpeed = this.tvStandard === 1 ? 53203424 : 53693175;
        
        // M68K runs at Master Clock / 7 (Approx 7.67 MHz NTSC)
        const m68kClockSpeed = Math.floor(masterClockSpeed / 7);
        const m68kCyclesPerScanline = Math.floor((m68kClockSpeed / (this.tvStandard === 1 ? 50 : 60)) / totalScanlines);

        // Linear frame loop, identical to BlastEm's stable model
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

                    // Trigger standard maskable interrupt on the Z80 secondary CPU thread.
                    // This uses the correct silicon-accurate hardware line method to synchronously 
                    // drive the music/sound effects driver, resolving the silent audio driver issue.
                    if (!this.z80Bus.isZ80Frozen()) {
                        this.z80.raiseMaskableInterrupt();
                    }
                } else if (scanline === activeHeight + 1) {
                    // Clears the level-triggered Z80 interrupt line after exactly 1 scanline.
                    // This matches CPU_Z80.set_irq_line(false) in vdp.cpp.
                    if (!this.z80Bus.isZ80Frozen()) {
                        this.z80.maskableInterruptWaiting = false;
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
        
        // End of frame: Blit the persistent 1D buffer to the screen using our post-processor!
        const activeWidth = this.vdp.h40Enabled ? 320 : 256;
        if (this.postProcessor) {
            this.postProcessor.blit(
                this.videoContext, 
                this.glbFrameBuffer, 
                activeWidth, 
                activeHeight, 
                this.postProcessMode, 
                this.prevFrameBuffer
            );
        }

        // Copy current frame to the previous frame buffer (needed for stereoscopic 3D glasses)
        const activeLength = activeWidth * activeHeight * 4;
        this.prevFrameBuffer.set(this.glbFrameBuffer.subarray(0, activeLength));

        // Update FPS Stats
        this.framesRendered++;
        if (this.framesRendered % 10 === 0 && this.onFpsUpdate) {
            // Calculate and format the actual real-time frames-per-second dynamically 
            const currentFps = (this.lastDeltaTime > 0) ? (1000 / this.lastDeltaTime).toFixed(1) : (this.tvStandard === 1 ? "50.0" : "60.0");
            this.onFpsUpdate(this.fastForward ? "FFWD" : currentFps);
        }
    }

    /**
     * Steps both the primary M68K and secondary Z80 CPUs synchronously.
     * @param {number} m68kCycles - Motorola 68000 clock ticks to execute.
     */
    stepCPUs(m68kCycles) {
        if (!this.isRunning || this.isPaused || this.isDebugging) return;

        // Check synchronous breakpoint assertion prior to executing CPU instructions
        if (this.breakpointAddress !== null && this.m68k.pc === this.breakpointAddress) {
            this.isDebugging = true;
            this.isPaused = false;
            window.dispatchEvent(new CustomEvent('genesis-debugger-break'));
            return;
        }

        // Step Primary 68000 CPU
        this.m68k.execute(m68kCycles);

        // Step Secondary Z80 CPU (Z80 runs at approx half the speed of the 68K)
        if (!this.z80Bus.isZ80Frozen()) {
            const z80Cycles = Math.floor(m68kCycles / 2);
            let elapsed = 0;
            while (elapsed < z80Cycles) {
                elapsed += this.z80.executeOne(); // Delegate to custom isolated GenesisZ80 subclass
            }
        }
        
        // Sync Audio Timers
        this.fm.update(m68kCycles);
    }

    /**
     * Executes precisely one instruction on the Motorola 68000 CPU (Step Into).
     */
    stepInstruction() {
        if (!this.isRunning || !this.m68k) return;

        // Executing for a minimum baseline of 4 cycles is the 68K standard 
        // to execute exactly one instruction from the PC.
        this.m68k.execute(4);

        // Safely step the secondary Z80 audio thread synchronously to keep them in phase
        if (!this.z80Bus.isZ80Frozen()) {
            const z80Cycles = 2; 
            let elapsed = 0;
            while (elapsed < z80Cycles) {
                elapsed += this.z80.executeOne();
            }
        }

        this.fm.update(4);
    }

    /**
     * Decodes and rasterizes 4bpp Sega Genesis VRAM pattern tiles onto the diagnostic Canvas.
     */
    rasterizeVramTiles(ctx) {
        if (!this.vdp) return;
        
        const imgData = ctx.createImageData(128, 192); // 16 columns * 8px = 128px, 24 rows * 8px = 192px
        const vram = this.vdp.vRam;

        for (let tileIdx = 0; tileIdx < 384; tileIdx++) {
            const tileX = tileIdx % 16;
            const tileY = Math.floor(tileIdx / 16);
            const destBaseX = tileX * 8;
            const destBaseY = tileY * 8;

            for (let row = 0; row < 8; row++) {
                const rowAddr = tileIdx * 32 + row * 4;
                for (let col = 0; col < 8; col++) {
                    const byteOffset = rowAddr + Math.floor(col / 2);
                    const byte = vram[byteOffset & 0xFFFF];
                    
                    // Extract the 4-bit pixel nibble (Sega Genesis tiles are stored as 4bpp)
                    const pixelNibble = (col % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                    
                    // Convert 4-bit pixel value to a 24-bit grayscale value for diagnostic preview
                    const r = pixelNibble * 17;
                    const g = pixelNibble * 17;
                    const b = pixelNibble * 17;

                    const pixelX = destBaseX + col;
                    const pixelY = destBaseY + row;
                    const destIdx = (pixelX + (pixelY * 128)) * 4;

                    imgData.data[destIdx]     = r;
                    imgData.data[destIdx + 1] = g;
                    imgData.data[destIdx + 2] = b;
                    imgData.data[destIdx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Copies the rasterized pixel row into the persistent 1D frame buffer.
     * @param {number} line - The target Y coordinate.
     * @param {Uint8Array} pixels - Raw 8-bit palette indices for the scanline.
     * @param {Uint8Array} shadowMap - Shadows/Highlights mapping bits.
     * @param {number} width - Total active VDP screen width.
     * @param {number} height - Total active VDP screen height.
     */
    renderScanline(line, pixels, shadowMap, width, height) {
        const shadowEnabled = this.vdp.shadowHighlightEnabled;
        
        // Calculate dynamic line offset in the 1D frame buffer array (256px or 320px width)
        const destOffset = line * width * 4;

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

            const dest = destOffset + (i * 4);
            this.glbFrameBuffer[dest]     = r;
            this.glbFrameBuffer[dest + 1] = g;
            this.glbFrameBuffer[dest + 2] = b;
            this.glbFrameBuffer[dest + 3] = 255;
        }
    }
}