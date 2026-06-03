/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Component: SnesOrchestrator (Application Ticker and Viewport Link)
 * Documented & Optimized: English comments, optimized pixel pipelines, GC-free audio transfers
 * 
 * ROLE:
 * Manages execution loops, synchronization ticks, input delivery, and transfers
 * video/audio output buffers to infrastructure processor nodes.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Dynamically overrides the hardware PPU `setPixels` loop-invariant indices with optimized offset additions.
 * - Utilizes high-performance native `TypedArray.prototype.fill` calls to clear border margins.
 * - Aligns internal transfer queues with native browser `Float32Array` specifications.
 */

class SnesOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Primary 2D Canvas Target.
     * @param {WebGL2RenderingContext} glContext - WebGL2 Context for Shaders.
     * @param {Function} fpsUpdateCallback - Diagnostics hook to display FPS.
     */
    constructor(videoContext, glContext, fpsUpdateCallback) {
        // Domain Core: Instantiate the emulation core
        this.hardware = new Snes();
        
        // Context Dependencies
        this.ctx = videoContext;
        this.gl = glContext;
        this.onFpsUpdate = fpsUpdateCallback;

        // Force viewport context dimension bounds
        this.ctx.canvas.width = 512;
        this.ctx.canvas.height = 480;

        // Pre-allocated Canvas ImageData for high-speed direct copying
        this.imgData = this.ctx.createImageData(512, 480);

        // Standardized Infrastructure Services
        this.postProcessor = new SnesPostProcessor(this.gl);
        this.audioProcessor = new SnesAudioProcessor();
        this.audioProcessor.orchestrator = this; // Circular backreference

        // Unified Options
        this.postProcessMode = 0; 
        this.audioFilterMode = 0; 

        // State Flags
        this.isRunning = false;
        this.isPaused = false;
        this.animationFrameId = null;

        // Diagnostics metrics
        this.fpsCount = 0;
        this.fpsTimer = 0;

        // Synchronize transfer queues with Float32Array precision standards
        this.samplesPerFrame = Math.floor(this.audioProcessor.samplesPerFrame);
        this.transferBufferL = new Float32Array(this.samplesPerFrame);
        this.transferBufferR = new Float32Array(this.samplesPerFrame);

        // Override original unoptimized pixel copy routine with high-speed implementation
        this.injectOptimizedPixelCopier();

        console.log("[EGGStation::SNES] Optimized Orchestrator Layer Initialized with Resolution Lock.");
    }

    /**
     * Injects an optimized loop-invariant alternative to setPixels on the PPU instance.
     * This avoids costly division and modulo operations inside high-frequency loops.
     */
    injectOptimizedPixelCopier() {
        this.hardware.ppu.setPixels = function(arr) {
            const frameOverscan = this.frameOverscan;
            const pixelOutput = this.pixelOutput;
            const evenFrame = this.evenFrame;
            const frameInterlace = this.frameInterlace;
            
            // 1. Clear top and bottom margins using native C++ fill operations
            if (!frameOverscan) {
                // Clear top 16 lines: 512 * 16 * 4 = 32768 bytes
                arr.fill(0, 0, 32768);
                // Clear bottom 16 lines: 512 * 16 * 4 = 32768 bytes starting at line 464 (464 * 512 * 4 = 950272)
                arr.fill(0, 950272, 983040);
            }

            const addY = frameOverscan ? 0 : 14;
            const limit = frameOverscan ? 240 : 225;
            
            // Pixel outputs start after the first line offset (512 * 3 = 1536)
            let srcIdx = 1536; 
            
            // 2. Scanline block parsing using optimized linear increments
            for (let y = 1; y < limit; y++) {
                const rowTarget1 = (y * 2 + addY) * 512 * 4;
                const rowTarget2 = rowTarget1 + 2048; // (512 * 4)
                
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
                        arr[destOffset2] = r;
                        arr[destOffset2 + 1] = g;
                        arr[destOffset2 + 2] = b;
                        arr[destOffset2 + 3] = 255;
                    }
                }
            }
        };
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
            // 1. Run frame tasks on internal hardware core
            this.hardware.runFrame(false);

            // 2. Extract generated samples and pass them directly into the audio buffer
            this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
            this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);

            // 3. Coordinate render pipelines
            const activeHeight = this.hardware.ppu.frameOverscan ? 240 : 224;

            if (this.postProcessMode === 0 || this.postProcessMode === 1) {
                // High-performance direct path using the overridden native copy procedure
                if (this.ctx.canvas.width !== 512 || this.ctx.canvas.height !== 480) {
                    this.ctx.canvas.width = 512;
                    this.ctx.canvas.height = 480;
                }
                this.hardware.setPixels(this.imgData.data);
                this.ctx.putImageData(this.imgData, 0, 0);
            } else {
                // Post-processed filtered paths
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

    /**
     * Packs raw 16-bit RGB video frames into 32-bit RGBA targets.
     */
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
}