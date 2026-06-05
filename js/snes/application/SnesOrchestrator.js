/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Author: Enrique González Gutiérrez
 * File: js/snes/application/SnesOrchestrator.js
 * 
 * Role:
 * Application Layer: SnesOrchestrator (Application Ticker and Viewport Link).
 * Manages execution loops, synchronization ticks, input delivery, and transfers
 * video/audio output buffers to infrastructure processor nodes.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively coordinates execution loops, 
 *    frame timing synchronization, and audio/video stream buffering.
 * 2. Liskov Substitution Principle (LSP): Fully implements the unified orchestrator 
 *    interface expected by the app.js Bootstrapper (loadRom, stop, setAudioEnabled).
 * 3. Dependency Inversion Principle (DIP): Depends directly on the shared 
 *    UniversalPostProcessor and IndexedDbManager abstractions rather than tight 
 *    coupling to legacy custom post-processors.
 */

class SnesOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Primary 2D Canvas Target.
     * @param {WebGL2RenderingContext} glContext - WebGL2 Context for Shaders.
     * @param {Function} fpsUpdateCallback - Diagnostics hook to display FPS.
     */
    constructor(videoContext, glContext, fpsUpdateCallback) {
        this.hardware = new Snes();
        
        this.ctx = videoContext;
        this.gl = glContext;
        this.onFpsUpdate = fpsUpdateCallback;

        this.ctx.canvas.width = 512;
        this.ctx.canvas.height = 480;

        this.imgData = this.ctx.createImageData(512, 480);

        // PHASE 4: Instantiate the UniversalPostProcessor directly
        this.postProcessor = new UniversalPostProcessor(this.gl);
        this.audioProcessor = new SnesAudioProcessor();
        this.audioProcessor.orchestrator = this;

        this.postProcessMode = 0; 
        this.audioFilterMode = 0; 

        this.isRunning = false;
        this.isPaused = false;
        this.animationFrameId = null;

        // Strict Delta-Time synchronization variables
        this.lastFrameTime = 0;
        this.accumulatedTime = 0.0;

        this.fpsCount = 0;
        this.fpsTimer = 0;

        this.samplesPerFrame = Math.floor(this.audioProcessor.samplesPerFrame);
        this.transferBufferL = new Float32Array(this.samplesPerFrame);
        this.transferBufferR = new Float32Array(this.samplesPerFrame);

        this.injectOptimizedPixelCopier();

        // PHASE 4: Bind directly to the generic database manager client
        this.serializer = new IndexedDbManager();

        console.log("[SnesOrchestrator] Orchestrator Layer Initialized.");
    }

    injectOptimizedPixelCopier() {
        this.hardware.ppu.setPixels = function(arr) {
            const frameOverscan = this.frameOverscan;
            const pixelOutput = this.pixelOutput;
            const evenFrame = this.evenFrame;
            const frameInterlace = this.frameInterlace;
            
            if (!frameOverscan) {
                arr.fill(0, 0, 32768);
                arr.fill(0, 950272, 983040);
            }

            const addY = frameOverscan ? 0 : 14;
            const limit = frameOverscan ? 240 : 225;
            let srcIdx = 1536; 
            
            for (let y = 1; y < limit; y++) {
                const rowTarget1 = (y * 2 + addY) * 512 * 4;
                const rowTarget2 = rowTarget1 + 2048; 
                
                const writeRow1 = !frameInterlace || evenFrame;
                const writeRow2 = !frameInterlace || !evenFrame;

                for (let x = 0; x < 512; x++) {
                    const r = pixelOutput[srcIdx];
                    const g = pixelOutput[srcIdx + 1];
                    const b = pixelOutput[srcIdx + 2];
                    srcIdx += 3;

                    const destOffset1 = rowTarget1 + (x * 4);
                    const destOffset2 = rowTarget2 + (x * 4);

                    if (writeRow1) {
                        arr[destOffset1] = r;
                        arr[destOffset1 + 1] = g;
                        arr[destOffset1 + 2] = b;
                        arr[destOffset1 + 3] = 255;
                    }
                    if (writeRow2) {
                        arr[destOffset2] = r; // <--- CORREGIDO
                        arr[destOffset2 + 1] = g;
                        arr[destOffset2 + 2] = b;
                        arr[destOffset2 + 3] = 255;
                    }
                }
            }
        };
    }

    setPostProcessMode(mode) {
        this.postProcessMode = parseInt(mode);
    }

    setAudioFilterMode(mode) {
        this.audioFilterMode = parseInt(mode);
        this.audioProcessor.setFilterMode(this.audioFilterMode);
    }

    setAudioEnabled(enabled) {
        if (this.audioProcessor) {
            this.audioProcessor.setAudioEnabled(enabled);
        }
    }

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    loadCartridge(romData, isHirom) {
        try {
            const loaded = this.hardware.loadRom(romData, isHirom);
            if (!loaded) throw new Error("ROM parsing failed.");

            this.hardware.reset(true);
            this.start();
        } catch (error) {
            console.error("[SnesOrchestrator] Core loading exception:", error);
            throw error;
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPaused = false;

        this.lastFrameTime = performance.now();
        this.accumulatedTime = 0.0;

        this.audioProcessor.resume();
        this.animationFrameId = requestAnimationFrame((t) => this.executionLoop(t));
    }

    stop() {
        this.isRunning = false;
        this.audioProcessor.stop();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
    }

    /**
     * Execution loop throttled and optimized to run at exact hardware speed.
     */
    executionLoop(timestamp) {
        if (!this.isRunning) return;

        let elapsed = timestamp - this.lastFrameTime;
        
        if (elapsed > 100) {
            elapsed = 100;
        }

        this.lastFrameTime = timestamp;
        this.accumulatedTime += elapsed;

        const targetFps = (this.hardware.ppu && this.hardware.ppu.isPal) ? 50.0 : 60.098;
        const targetFrameDuration = 1000.0 / targetFps;
        let framesRun = 0;

        while (this.accumulatedTime >= targetFrameDuration) {
            if (!this.isPaused) {
                // --- PHASE 4: SYNC INPUTS FROM UNIVERSAL INPUT DIRECTLY TO SNES PAD ON EACH FRAME ---
                if (window.UniversalInput) {
                    this.sendInput(0, window.UniversalInput.isPressed("B"));      // B
                    this.sendInput(1, window.UniversalInput.isPressed("Y"));      // Y
                    this.sendInput(2, window.UniversalInput.isPressed("SELECT")); // Select
                    this.sendInput(3, window.UniversalInput.isPressed("START"));  // Start
                    this.sendInput(4, window.UniversalInput.isPressed("UP"));     // Up
                    this.sendInput(5, window.UniversalInput.isPressed("DOWN"));   // Down
                    this.sendInput(6, window.UniversalInput.isPressed("LEFT"));   // Left
                    this.sendInput(7, window.UniversalInput.isPressed("RIGHT"));  // Right
                    this.sendInput(8, window.UniversalInput.isPressed("A"));      // A
                    this.sendInput(9, window.UniversalInput.isPressed("X"));      // X
                    this.sendInput(10, window.UniversalInput.isPressed("L"));     // L
                    this.sendInput(11, window.UniversalInput.isPressed("R"));     // R
                }

                this.hardware.runFrame(false);
                this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                
                this.fpsCount++; 
                framesRun++;
            }
            this.accumulatedTime -= targetFrameDuration;
        }

        if (framesRun > 0 && !this.isPaused) {
            const activeHeight = this.hardware.ppu.frameOverscan ? 240 : 224;

            if (this.postProcessMode === 0 || this.postProcessMode === 1) {
                if (this.ctx.canvas.width !== 512 || this.ctx.canvas.height !== 480) {
                    this.ctx.canvas.width = 512;
                    this.ctx.canvas.height = 480;
                }
                this.hardware.setPixels(this.imgData.data);
                this.ctx.putImageData(this.imgData, 0, 0);
            } else {
                if (!this.rgba32) {
                    this.rgba32 = new Uint32Array(this.postProcessor.rgbaBuffer.buffer);
                }
                this.convertOriginalRGBToRGBA(this.hardware.ppu.pixelOutput, this.rgba32, 512, activeHeight);
                this.postProcessor.blit(
                    this.ctx,
                    this.rgba32,
                    512,
                    activeHeight,
                    this.postProcessMode,
                    null
                );
            }
        }

        this.updatePerformanceMetrics(timestamp);
        this.animationFrameId = requestAnimationFrame((t) => this.executionLoop(t));
    }

    convertOriginalRGBToRGBA(src16, dst32, width, height) {
        let srcIdx = 0;
        const doubleWidth = width * 2;
        
        for (let y = 0; y < height; y++) {
            const dstRow1 = y * doubleWidth;
            const dstRow2 = dstRow1 + width;
            
            for (let x = 0; x < width; x++) {
                const pixel = src16[srcIdx] | (src16[srcIdx + 1] << 8) | (src16[srcIdx + 2] << 16) | 0xff000000;
                srcIdx += 3;
                dst32[dstRow1 + x] = pixel;
                dst32[dstRow2 + x] = pixel;
            }
        }
    }

    updatePerformanceMetrics(timestamp) {
        this.fpsCount++;
        if (timestamp - this.fpsTimer >= 1000) {
            if (this.onFpsUpdate) this.onFpsUpdate(this.fpsCount);
            this.fpsCount = 0;
            this.fpsTimer = timestamp;
        }
    }

    sendInput(buttonIndex, isPressed) {
        if (isPressed) {
            this.hardware.setPad1ButtonPressed(buttonIndex);
        } else {
            this.hardware.setPad1ButtonReleased(buttonIndex);
        }
    }

    reset(hard = false) {
        this.hardware.reset(hard);
    }

    /**
     * PHASE 4: Serializes the complete 16-bit SNES hardware memory buffers and chip states.
     */
    async saveState() {
        if (this.isRunning && this.hardware.cart) {
            try {
                const statePayload = {
                    cpu: {
                        r: Array.from(this.hardware.cpu.r),
                        br: Array.from(this.hardware.cpu.br),
                        flags: {
                            n: this.hardware.cpu.n, v: this.hardware.cpu.v, m: this.hardware.cpu.m,
                            x: this.hardware.cpu.x, d: this.hardware.cpu.d, i: this.hardware.cpu.i,
                            z: this.hardware.cpu.z, c: this.hardware.cpu.c, e: this.hardware.cpu.e
                        },
                        stopped: this.hardware.cpu.stopped,
                        waiting: this.hardware.cpu.waiting,
                        cyclesLeft: this.hardware.cpu.cyclesLeft
                    },
                    ppu: {
                        vram: Array.from(this.hardware.ppu.vram),
                        cgram: Array.from(this.hardware.ppu.cgram),
                        oam: Array.from(this.hardware.ppu.oam),
                        highOam: Array.from(this.hardware.ppu.highOam),
                        cgramAdr: this.hardware.ppu.cgramAdr,
                        vramAdr: this.hardware.ppu.vramAdr,
                        mode: this.hardware.ppu.mode,
                        forcedBlank: this.hardware.ppu.forcedBlank,
                        brightness: this.hardware.ppu.brightness,
                        // Advanced PPU layers properties (prevents graphical glitches)
                        tilemapWider: Array.from(this.hardware.ppu.tilemapWider),
                        tilemapHigher: Array.from(this.hardware.ppu.tilemapHigher),
                        tilemapAdr: Array.from(this.hardware.ppu.tilemapAdr),
                        tileAdr: Array.from(this.hardware.ppu.tileAdr),
                        bgHoff: Array.from(this.hardware.ppu.bgHoff),
                        bgVoff: Array.from(this.hardware.ppu.bgVoff)
                    },
                    apu: {
                        ram: Array.from(this.hardware.apu.ram),
                        spc_r: Array.from(this.hardware.apu.spc.r),
                        spc_br: Array.from(this.hardware.apu.spc.br),
                        // SPC700 Register Flags (Crucial fix! Prevents APU freezes on load!)
                        spc_flags: {
                            n: this.hardware.apu.spc.n, v: this.hardware.apu.spc.v, p: this.hardware.apu.spc.p,
                            b: this.hardware.apu.spc.b, h: this.hardware.apu.spc.h, i: this.hardware.apu.spc.i,
                            z: this.hardware.apu.spc.z, c: this.hardware.apu.spc.c
                        },
                        dsp_ram: Array.from(this.hardware.apu.dsp.ram)
                    },
                    ram: Array.from(this.hardware.ram),
                    sram: Array.from(this.hardware.cart.sram)
                };

                await this.serializer.save("SNES_SAVESTATE", statePayload);

                // PHASE 4: Re-render thumbnail snapshot to localStorage (Optimized Downsample 16x -> 128x120)
                if (this.imgData && this.imgData.data) {
                    const src = this.imgData.data;
                    const dstWidth = 128;
                    const dstHeight = 120;
                    const smallArray = new Uint8Array(dstWidth * dstHeight * 4);
                    
                    // Step snychronously over the buffer
                    for (let y = 0; y < dstHeight; y++) {
                        const srcY = (y * 4) * 512 * 4; 
                        const dstY = y * dstWidth * 4;
                        for (let x = 0; x < dstWidth; x++) {
                            const srcX = (x * 4) * 4;   
                            const srcIdx = srcY + srcX;
                            const dstIdx = dstY + (x * 4);
                            
                            smallArray[dstIdx] = src[srcIdx];
                            smallArray[dstIdx + 1] = src[srcIdx + 1];
                            smallArray[dstIdx + 2] = src[srcIdx + 2];
                            smallArray[dstIdx + 3] = 255;
                        }
                    }

                    localStorage.setItem('savestateScreenshot', JSON.stringify(Array.from(smallArray)));
                    localStorage.setItem('cartName', "SNES_SAVESTATE");
                }

                console.log("[SnesOrchestrator] State Saved.");
            } catch (err) {
                console.error("[SnesOrchestrator] Save State failed:", err);
            }
        }
    }

    /**
     * PHASE 4: Restores and rebuilds the SNES registers and memory buffers.
     */
    async loadState() {
        if (this.isRunning && this.hardware.cart) {
            try {
                const state = await this.serializer.load("SNES_SAVESTATE");
                if (!state) {
                    console.error("[SnesOrchestrator] No saved state found for SNES.");
                    return;
                }

                // 1. Reconstitute CPU
                this.hardware.cpu.r.set(state.cpu.r);
                this.hardware.cpu.br.set(state.cpu.br);
                this.hardware.cpu.n = state.cpu.flags.n;
                this.hardware.cpu.v = state.cpu.flags.v;
                this.hardware.cpu.m = state.cpu.flags.m;
                this.hardware.cpu.x = state.cpu.flags.x;
                this.hardware.cpu.d = state.cpu.flags.d;
                this.hardware.cpu.i = state.cpu.flags.i;
                this.hardware.cpu.z = state.cpu.flags.z;
                this.hardware.cpu.c = state.cpu.flags.c;
                this.hardware.cpu.e = state.cpu.flags.e;
                this.hardware.cpu.stopped = state.cpu.stopped;
                this.hardware.cpu.waiting = state.cpu.waiting;
                this.hardware.cpu.cyclesLeft = state.cpu.cyclesLeft;

                // 2. Reconstitute PPU
                this.hardware.ppu.vram.set(state.ppu.vram);
                this.hardware.ppu.cgram.set(state.ppu.cgram);
                this.hardware.ppu.oam.set(state.ppu.oam);
                this.hardware.ppu.highOam.set(state.ppu.highOam);
                this.hardware.ppu.cgramAdr = state.ppu.cgramAdr;
                this.hardware.ppu.vramAdr = state.ppu.vramAdr;
                this.hardware.ppu.mode = state.ppu.mode;
                this.hardware.ppu.forcedBlank = state.ppu.forcedBlank;
                this.hardware.ppu.brightness = state.ppu.brightness;
                
                // Advanced PPU layers properties - PHASE 4 FIX: direct array assignment (no .set method on standard Arrays)
                this.hardware.ppu.tilemapWider = state.ppu.tilemapWider;
                this.hardware.ppu.tilemapHigher = state.ppu.tilemapHigher;
                this.hardware.ppu.tilemapAdr = state.ppu.tilemapAdr;
                this.hardware.ppu.tileAdr = state.ppu.tileAdr;
                this.hardware.ppu.bgHoff = state.ppu.bgHoff;
                this.hardware.ppu.bgVoff = state.ppu.bgVoff;

                // 3. Reconstitute APU & SPC700
                this.hardware.apu.ram.set(state.apu.ram);
                this.hardware.apu.spc.r.set(state.apu.spc_r);
                this.hardware.apu.spc.br.set(state.apu.spc_br);
                
                // SPC700 Register Flags
                this.hardware.apu.spc.n = state.apu.spc_flags.n;
                this.hardware.apu.spc.v = state.apu.spc_flags.v;
                this.hardware.apu.spc.p = state.apu.spc_flags.p;
                this.hardware.apu.spc.b = state.apu.spc_flags.b;
                this.hardware.apu.spc.h = state.apu.spc_flags.h;
                this.hardware.apu.spc.i = state.apu.spc_flags.i;
                this.hardware.apu.spc.z = state.apu.spc_flags.z;
                this.hardware.apu.spc.c = state.apu.spc_flags.c;

                this.hardware.apu.dsp.ram.set(state.apu.dsp_ram);

                // 4. Reconstitute System RAM & Cartridge SRAM
                this.hardware.ram.set(state.ram);
                this.hardware.cart.sram.set(state.sram);

                console.log("[SnesOrchestrator] State Loaded.");
            } catch (err) {
                console.error("[SnesOrchestrator] Load State failed:", err);
            }
        }
    }
}