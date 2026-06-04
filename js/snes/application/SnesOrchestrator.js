/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Component: SnesOrchestrator (Application Ticker and Viewport Link)
 * 
 * ROLE:
 * Manages execution loops, synchronization ticks, input delivery, and transfers
 * video/audio output buffers to infrastructure processor nodes.
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

        this.postProcessor = new SnesPostProcessor(this.gl);
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

        console.log("[EGGStation::SNES] Orchestrator Layer Initialized with Delta-Time Sync.");
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
                        arr[destOffset2] = r;
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
            console.error("[EGGStation::SNES] Core loading exception:", error);
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
        
        // Prevent speed surges or spiral-of-death during sudden browser stutters
        if (elapsed > 100) {
            elapsed = 100;
        }

        this.lastFrameTime = timestamp;
        this.accumulatedTime += elapsed;

        const targetFrameDuration = 1000.0 / 60.098; // SNES exact frame interval
        let framesRun = 0;

        // Process frames synchronously with actual time elapsed
        while (this.accumulatedTime >= targetFrameDuration) {
            if (!this.isPaused) {
                this.hardware.runFrame(false);
                this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                
                this.fpsCount++; // Measure true emulated frames
                framesRun++;
            }
            this.accumulatedTime -= targetFrameDuration;
        }

        // OPTIMIZATION: Only redraw/convert if we actually ran at least one new frame!
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
}