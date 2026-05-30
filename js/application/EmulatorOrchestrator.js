/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Emulator Orchestrator (With Audio Filter routing)
 * 
 * Coordinates system execution loops, schedules frame sync rates (NTSC/PAL),
 * and links the isolated Domain entities with Infrastructure services.
 * Decoupled from DOM rendering and browser event APIs (SRP).
 */

class EmulatorOrchestrator {
    /**
     * Initializes the Orchestrator.
     * @param {CanvasRenderingContext2D} videoContext - The HTML5 Canvas 2D context for video output.
     * @param {Function} onFpsUpdate - Callback function to notify the UI of FPS changes.
     */
    constructor(videoContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.onFpsUpdate = onFpsUpdate;
        
        // Emulation state machine
        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;
        
        // Visual post-processing filter configuration index (0: Sharp, 1: Bilinear, 2: Scale2X, 3: Scanlines, 4: Scale4X, 5: NTSC Bleed)
        this.postProcessMode = 0;

        // Audio DSP soundstage configuration index (0: Mono, 1: Arcade Warmth Low-Pass, 2: Lush 3D Stereo)
        this.audioFilterMode = 0;

        // Target timing metrics matching native hardware
        this.SMS_NTSC_FPS = 59.922743;
        this.SMS_PAL_FPS = 49.701459;
        this.vdpMode = 0; // 0: NTSC (60Hz), 1: PAL (50Hz)
        
        // High-precision requestAnimationFrame synchronization variables
        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        // Hardware Domain & Infrastructure Pointers
        this.cpu = null;
        this.mmu = null;
        this.vdp = null;
        this.psg = null;
        this.cartridge = null;
        
        // Instantiate persistent auxiliary hardware/services
        this.ioController = new Sega315_5297();
        this.serializer = new WebLocalStorageSerializer();

        // Hard bind the execution loop to preserve 'this' context in requestAnimationFrame
        this.loop = this.loop.bind(this);
    }

    /**
     * Sets the Video Display Processor standard.
     * @param {string} mode - "NTSC" or "PAL"
     */
    setVdpMode(mode) {
        this.vdpMode = (mode === "PAL") ? 1 : 0;
    }

    /**
     * Updates the active visual filter post-processing mode index.
     * @param {number} mode - Post-processing mode index.
     */
    setPostProcessMode(mode) {
        this.postProcessMode = mode;
    }

    /**
     * Updates the active audio DSP filter configuration index.
     * @param {number} mode - Audio DSP filter mode index.
     */
    setAudioFilterMode(mode) {
        this.audioFilterMode = mode;
        if (this.psg && this.isRunning) {
            this.psg.setAudioFilter(mode);
        }
    }

    /**
     * Bootstraps the emulator hardware, injects dependencies, and begins execution.
     * @param {string} filename - The name of the loaded ROM file.
     * @param {ArrayBuffer} arrayBuffer - The raw binary buffer of the ROM.
     */
    loadRom(filename, arrayBuffer) {
        // Prevent multiple loop collisions if a game is already running
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // 1. Initialize Domain Layer: Cartridge
        this.cartridge = new SegaMasterSystemCartridge(filename);
        this.cartridge.load(arrayBuffer);
        
        // 2. Initialize Infrastructure Layer: Co-processors
        this.vdp = new Sega315_5124_Vdp(this.vdpMode);
        this.psg = new Sega315_5124_Psg();
        
        // 3. Initialize Domain Layer: System Bus (MMU) & CPU
        this.mmu = new SegaMasterSystemBus(this.cartridge, this.vdp, this.psg, this.ioController);
        this.cpu = new ZilogZ80(this.mmu);
        
        // 4. Boot Web Audio API Context tied to CPU clock
        this.psg.startMix(this.cpu);
        
        // Apply pre-configured audio filters immediately upon hardware boot
        this.psg.setAudioFilter(this.audioFilterMode);

        // 5. Reset Timing and State
        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        console.log(`EmulatorOrchestrator::System Booted with ROM [${filename}]`);
        
        // Kick off the execution loop
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Toggles the software pause state of the emulator loop.
     */
    togglePause() {
        if (!this.isRunning) return;
        
        this.isPaused = !this.isPaused;
        
        // If resuming, reset the delta-time baseline to prevent frame skipping logic
        if (!this.isPaused) {
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.loop);
            console.log("EmulatorOrchestrator::Resumed Execution.");
        } else {
            console.log("EmulatorOrchestrator::Paused Execution.");
        }
    }

    /**
     * Triggers the physical SMS Console "PAUSE" button (which triggers a Non-Maskable Interrupt).
     */
    triggerPauseButton() {
        if (this.cpu && this.isRunning) {
            this.cpu.raiseNMI(); 
        }
    }

    /**
     * Serializes current hardware states to the browser's local storage.
     */
    saveState() {
        if (this.isRunning && this.cartridge) {
            this.serializer.serialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
        }
    }

    /**
     * Restores hardware states from the browser's local storage.
     */
    loadState() {
        if (this.isRunning && this.cartridge) {
            this.serializer.deserialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
        }
    }

    /**
     * The core emulation loop, driven by the browser's V-Sync.
     * Utilizes a delta-time accumulator to maintain correct internal clock speed 
     * regardless of monitor refresh rates (60Hz, 144Hz, etc.).
     * @param {number} currentTime - High-resolution timestamp provided by requestAnimationFrame.
     */
    loop(currentTime) {
        // Enforce total sound mute if system is paused or stopped
        if (!this.isRunning || this.isPaused) {
            if (this.psg) {
                this.psg.setMuted(true);
            }
            return;
        }

        const targetFps = (this.vdpMode === 1) ? this.SMS_PAL_FPS : this.SMS_NTSC_FPS;
        const targetFrameTime = 1000 / targetFps; // Expected milliseconds per frame

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Prevent the "Spiral of Death" if the user switches browser tabs
        if (deltaTime > 100) {
            deltaTime = targetFrameTime;
        }

        // Fast-Forward Mode: Ignore accurate timing and mute audio to prevent buffer pop noise
        if (this.fastForward) {
            if (this.psg) this.psg.setMuted(true);
            for (let i = 0; i < 4; i++) {
                this.executeFrame(targetFps);
            }
            this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
        } 
        // Normal Mode: Accumulate real-world time and execute matching frames
        else {
            if (this.psg) this.psg.setMuted(false);
            this.accumulatedTime += deltaTime;
            
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
            }
            this.vdp.hyperBlit(this.videoContext, this.postProcessMode); // Render visualizer frame with active post-processing
        }

        // Frame rendering statistics update
        this.framesRendered++;
        if (deltaTime > 0 && this.framesRendered % 10 === 0) { // Update UI every 10 frames to save DOM layout thrashing
            const currentFps = (1000 / deltaTime).toFixed(1);
            if (this.onFpsUpdate) this.onFpsUpdate(currentFps);
        }

        // Request next frame recursively
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Simulates exactly one frame's worth of CPU cycles and hardware updates.
     * @param {number} targetFps - The signal FPS target used to calculate cycles per frame.
     */
    executeFrame(targetFps) {
        let emulatedCycles = 0;
        const targetCycles = Math.floor(this.cpu.clockRate / targetFps);

        while (emulatedCycles < targetCycles) {
            const cyclesElapsed = this.cpu.executeOne();
            
            // Do not process audio during fast-forward to prevent buffer clipping noise
            if (!this.fastForward) {
                this.psg.step(this.cpu.totCycles);
            }
            
            this.vdp.update(this.cpu, cyclesElapsed);
            emulatedCycles += cyclesElapsed;
        }
    }
}