/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Component: SnesOrchestrator (Adapter Version for Stable Core)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Coordinates the execution, timing, and buffer transfers of the SNES subsystem.
 * It acts as an Adapter to bridge the original unrefactored SNES core output
 * (Uint16Array RGB) to the EGGStation viewport, PostProcessor and AudioProcessor.
 * 
 * SOLID Principles:
 * - Liskov Substitution Principle (LSP): Fully compatible with EGGStation blit interfaces.
 * - Single Responsibility Principle (SRP): Manages orchestration state and loop rates.
 */

class SnesOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Primary 2D Canvas Target.
     * @param {WebGL2RenderingContext} glContext - WebGL2 Context for Shaders.
     * @param {Function} fpsUpdateCallback - Diagnostics hook to display FPS.
     */
    constructor(videoContext, glContext, fpsUpdateCallback) {
        // Domain Core: Instantiate original unrefactored "Snes" class
        this.hardware = new Snes();
        
        // Context Dependencies
        this.ctx = videoContext;
        this.gl = glContext;
        this.onFpsUpdate = fpsUpdateCallback;

        // CRITICAL RESOLUTION FIX: Forcefully resize the canvas to match SNES original output expectations
        this.ctx.canvas.width = 512;
        this.ctx.canvas.height = 480;

        // Pre-allocated Canvas ImageData for high-speed 2D direct blitting (60 FPS path)
        this.imgData = this.ctx.createImageData(512, 480);

        // Standardized Infrastructure Services
        this.postProcessor = new SnesPostProcessor(this.gl);
        this.audioProcessor = new SnesAudioProcessor();
        this.audioProcessor.orchestrator = this; // Bind circular backreference

        // Unified Options
        this.postProcessMode = 0; 
        this.audioFilterMode = 0; 

        // State Flags
        this.isRunning = false;
        this.isPaused = false;
        this.animationFrameId = null;

        // Diagnostics
        this.fpsCount = 0;
        this.fpsTimer = 0;

        // CRITICAL AUDIO SPEED FIX: Pre-allocated Float64Array to match original apu.js expectations
        this.samplesPerFrame = Math.floor(this.audioProcessor.samplesPerFrame);
        this.transferBufferL = new Float64Array(this.samplesPerFrame);
        this.transferBufferR = new Float64Array(this.samplesPerFrame);

        console.log("[EGGStation::SNES] Adapter Orchestrator Layer Initialized with Resolution Lock.");
    }

    /**
     * Updates the video filter mode dynamically from the UI.
     */
    setPostProcessMode(mode) {
        this.postProcessMode = parseInt(mode);
    }

    /**
     * Updates the active Audio DSP filter dynamically.
     */
    setAudioFilterMode(mode) {
        this.audioFilterMode = parseInt(mode);
        this.audioProcessor.setFilterMode(this.audioFilterMode);
    }

    setAudioEnabled(enabled) {
        if (this.audioProcessor) {
            this.audioProcessor.setAudioEnabled(enabled);
        }
    }

    /**
     * Updates WebGL shader variables from UI sliders.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    /**
     * Mounts the ROM data into the memory bus and resets the CPU registers.
     * @param {Uint8Array} romData 
     * @param {boolean} isHirom 
     */
    loadCartridge(romData, isHirom) {
        try {
            // Call original loader
            const loaded = this.hardware.loadRom(romData, isHirom);
            if (!loaded) throw new Error("ROM parsing failed.");

            this.hardware.reset(true);
            this.start();
        } catch (error) {
            console.error("[EGGStation::SNES] Core loading exception:", error);
            throw error;
        }
    }

    /**
     * Resumes audio buffers and starts the requestAnimationFrame ticker loop.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPaused = false;

        this.audioProcessor.resume();
        this.animationFrameId = requestAnimationFrame((t) => this.executionLoop(t));
    }

    /**
     * Stops the loop and clears the active Web Audio nodes.
     */
    stop() {
        this.isRunning = false;
        this.audioProcessor.stop();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
    }

    /**
     * Execution loop matching EGGStation standard pacing.
     */
    executionLoop(timestamp) {
        if (!this.isRunning) return;

        if (!this.isPaused) {
            // 1. Run original Frame
            this.hardware.runFrame(false);

            // 2. Extract original audio samples (Direct transfer)
            this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
            this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);

            // 3. Render Video (Dynamic Blitting routing)
            const activeHeight = this.hardware.ppu.frameOverscan ? 240 : 224; // PPU overscan lines boundary

            if (this.postProcessMode === 0 || this.postProcessMode === 1) {
                // 60 FPS DIRECT PATH: Direct copy of the pixel stream onto the 2D canvas (Zero allocation)
                // Force canvas resolution boundaries matching PPU output
                if (this.ctx.canvas.width !== 512 || this.ctx.canvas.height !== 480) {
                    this.ctx.canvas.width = 512;
                    this.ctx.canvas.height = 480;
                }
                this.hardware.setPixels(this.imgData.data);
                this.ctx.putImageData(this.imgData, 0, 0);
            } else {
                // FILTERED PATH: Convert original 16-bit RGB stream to RGBA texture on the fly
                if (!this.rgba32) {
                    this.rgba32 = new Uint32Array(this.postProcessor.rgbaBuffer.buffer);
                }
                this.convertOriginalRGBToRGBA(this.hardware.ppu.pixelOutput, this.rgba32, 512, activeHeight);
                this.postProcessor.blit(
                    this.ctx,
                    this.rgba32, // Passes the 32-bit converted RGBA array
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

    /**
     * Ultra-fast on-the-fly converter to feed the WebGL post-processing shaders.
     */
    convertOriginalRGBToRGBA(src16, dst32, width, height) {
        let srcIdx = 0;
        for (let y = 0; y < height; y++) {
            const dstRow1 = y * 2 * width;
            const dstRow2 = (y * 2 + 1) * width;
            
            for (let x = 0; x < width; x++) {
                const r = src16[srcIdx];
                const g = src16[srcIdx + 1];
                const b = src16[srcIdx + 2];
                srcIdx += 3;
                
                // Pack directly as 32-bit little-endian RGBA (0xFF000000 is Alpha)
                const pixel = r | (g << 8) | (b << 16) | 0xff000000;
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
}