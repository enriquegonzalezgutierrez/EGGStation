/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Component: SnesOrchestrator (Unified Version)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Coordinates the execution, timing, and buffer transfers of the SNES subsystem.
 * It adheres to the unified visual rendering contract by passing explicit 
 * physical coordinates (512x224/239) to the SnesPostProcessor, matching the 
 * interface design of Sega Genesis and Master System.
 * 
 * SOLID Principles:
 * - Liskov Substitution Principle (LSP): Integrates seamlessly with the 
 *   standardized blit interface.
 * - Single Responsibility Principle (SRP): Manages orchestration state, loop rates,
 *   and buffer pipeline routing.
 */

class SnesOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - Primary 2D Canvas Target.
     * @param {WebGL2RenderingContext} glContext - WebGL2 Context for Shaders.
     * @param {Function} fpsUpdateCallback - Diagnostics hook to display FPS.
     */
    constructor(videoContext, glContext, fpsUpdateCallback) {
        // Domain Core (Legacy Core Engine)
        this.hardware = new Snes();
        
        // Context Dependencies
        this.ctx = videoContext;
        this.gl = glContext;
        this.onFpsUpdate = fpsUpdateCallback;

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

        // Pre-allocated GC-Free Audio Transfer Buffers (44100Hz / 60fps = 735 samples)
        this.samplesPerFrame = 735;
        this.transferBufferL = new Float32Array(this.samplesPerFrame);
        this.transferBufferR = new Float32Array(this.samplesPerFrame);

        console.log("[EGGStation::SNES] Unified Orchestrator Layer Initialized.");
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
            const success = this.hardware.loadRom(romData, isHirom);
            if (!success) throw new Error("ROM parsing failed.");

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
     * High-performance execution loop. Synchronized at 60Hz.
     */
    executionLoop(timestamp) {
        if (!this.isRunning) return;

        if (!this.isPaused) {
            // 1. Core Hardware Tick (runs exactly one frame of cycles)
            this.hardware.runFrame(false);

            // 2. Audio DSP stream (retrieves and queues samples)
            this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
            this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);

            // 3. Standardized Visual Blit
            // Decides the active resolution height based on PPU overscan registers
            const activeWidth = 512;
            const activeHeight = this.hardware.ppu.frameOverscan ? 239 : 224;

            // UNIFIED SIGNATURE: Perfectly substitutes SMS and Genesis PostProcessor blit calls
            this.postProcessor.blit(
                this.ctx,
                this.hardware.ppu.pixelOutput,
                activeWidth,
                activeHeight,
                this.postProcessMode,
                null // SNES has no anaglyph 3D glasses, pass null
            );
        }

        this.updatePerformanceMetrics(timestamp);
        this.animationFrameId = requestAnimationFrame((t) => this.executionLoop(t));
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