/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Emulator Orchestrator (With WebGL2, DRC, Rewind & Shader Tuning)
 * 
 * Coordinates system execution loops, schedules frame sync rates (NTSC/PAL),
 * and links the isolated Domain entities with Infrastructure services.
 * Decoupled from DOM rendering and browser event APIs (SRP).
 * 
 * OPTIMIZED FOR PHASE 4: Added a clean bridge wrapper to safely pipe interactive 
 * WebGL2 shader parameters into the active post-processing pipeline.
 */

class EmulatorOrchestrator {
    /**
     * Initializes the Orchestrator.
     * @param {CanvasRenderingContext2D} videoContext - The HTML5 Canvas 2D context for video output.
     * @param {WebGL2RenderingContext} glContext - The HTML5 Canvas WebGL2 context for GPU Shaders.
     * @param {Function} onFpsUpdate - Callback function to notify the UI of FPS changes.
     */
    constructor(videoContext, glContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.glContext = glContext;
        this.onFpsUpdate = onFpsUpdate;
        
        // Emulation state machine
        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;
        this.isRewinding = false; // State flag for active time-travel rewinding
        
        // Visual post-processing filter configuration index (0: Sharp, 1: Bilinear, etc.)
        this.postProcessMode = 0;

        // Audio DSP soundstage configuration index (0: Mono, 1: Arcade Warmth Low-Pass, 2: Haas Stereo)
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

        // In-Memory Rewind Ring Buffer configurations
        this.rewindHistory = [];
        this.maxRewindStates = 100; // Store last ~10 seconds of gameplay (approx. 2.5 MB in RAM)
        this.rewindFrameCount = 0;

        // Hardware Domain & Infrastructure Pointers
        this.cpu = null;
        this.mmu = null;
        this.vdp = null;
        this.psg = null;
        this.cartridge = null;
        
        // Instantiate persistent auxiliary hardware/services
        this.ioController = new Sega315_5297();
        this.serializer = new WebIndexedDBSerializer(); 

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
     * Propagates custom CRT WebGL2 shader values to the active post-processing engine.
     * @param {number} curvature - Scale factor of barrel screen bending.
     * @param {number} scanlines - Blending weight opacity of scanlines.
     * @param {number} phosphor - Intensity of the Trinitron subpixel grille.
     * @param {number} bloom - Strength of the horizontal bleed glow.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.vdp && this.vdp.postProcessor) {
            this.vdp.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    /**
     * Bootstraps the emulator hardware, injects dependencies, and begins execution.
     * @param {string} filename - The name of the loaded ROM file.
     * @param {ArrayBuffer} arrayBuffer - The raw binary buffer of the ROM.
     */
    async loadRom(filename, arrayBuffer) {
        // Prevent multiple loop collisions if a game is already running
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // 1. Initialize Domain Layer: Cartridge
        this.cartridge = new SegaMasterSystemCartridge(filename);
        this.cartridge.load(arrayBuffer);
        
        // 2. Initialize Infrastructure Layer: Co-processors (Injected with WebGL2 Context)
        this.vdp = new Sega315_5124_Vdp(this.vdpMode, this.glContext);
        this.psg = new Sega315_5124_Psg();
        
        // 3. Initialize Domain Layer: System Bus (MMU) & CPU
        this.mmu = new SegaMasterSystemBus(this.cartridge, this.vdp, this.psg, this.ioController);
        this.cpu = new ZilogZ80(this.mmu);
        
        // 4. Boot Web Audio API Context and Await Worklet Compilation
        await this.psg.startMix(this.cpu);
        
        // Apply pre-configured audio filters immediately upon hardware boot
        this.psg.setAudioFilter(this.audioFilterMode);

        // 5. Reset Timing, History, and State
        this.isRunning = true;
        this.isPaused = false;
        this.isRewinding = false;
        this.rewindHistory = [];
        this.rewindFrameCount = 0;
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
     * Serializes current hardware states to the browser's IndexedDB.
     */
    async saveState() {
        if (this.isRunning && this.cartridge) {
            try {
                await this.serializer.serialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
            } catch (err) {
                console.error("EmulatorOrchestrator::Save State failed:", err);
            }
        }
    }

    /**
     * Restores hardware states from the browser's IndexedDB.
     */
    async loadState() {
        if (this.isRunning && this.cartridge) {
            try {
                const status = await this.serializer.deserialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
                if (status === 0 && this.psg) {
                    this.psg.syncWorkletState();
                    this.rewindHistory = []; // Clear rewind buffers on hard state loads to prevent timeline conflicts
                }
            } catch (err) {
                console.error("EmulatorOrchestrator::Load State failed:", err);
            }
        }
    }

    /**
     * Captures a lightweight, synchronous in-memory snap of the complete emulator state.
     * Pushes it into our dynamic circular ring buffer.
     */
    captureRewindState() {
        if (!this.isRunning || this.isPaused || this.isRewinding) return;

        const stateSnap = {
            cpu: {
                registers: { ...this.cpu.registers },
                shadowRegisters: { ...this.cpu.shadowRegisters },
                maskableInterruptsEnabled: this.cpu.maskableInterruptsEnabled,
                maskableInterruptWaiting: this.cpu.maskableInterruptWaiting,
                interruptMode: this.cpu.interruptMode,
                totCycles: this.cpu.totCycles,
                NMIWaiting: this.cpu.NMIWaiting,
                m_bAfterEI: this.cpu.m_bAfterEI
            },
            vdp: {
                vRam: new Uint8Array(this.vdp.vRam), // Force deep array copy
                colorRam: new Uint8Array(this.vdp.colorRam),
                currentScanlineIndex: this.vdp.currentScanlineIndex,
                lineCounter: this.vdp.lineCounter,
                controlWordFlag: this.vdp.controlWordFlag,
                controlWord: this.vdp.controlWord,
                dataPortReadWriteAddress: this.vdp.dataPortReadWriteAddress,
                dataPortWriteMode: this.vdp.dataPortWriteMode,
                readBufferByte: this.vdp.readBufferByte,
                statusFlags: this.vdp.statusFlags,
                nameTableBaseAddress: this.vdp.nameTableBaseAddress,
                spriteAttributeTableBaseAddress: this.vdp.spriteAttributeTableBaseAddress,
                spritePatternGeneratorBaseAddress: this.vdp.spritePatternGeneratorBaseAddress,
                vcounter: this.vdp.vcounter,
                hcounter: this.vdp.hcounter,
                register00: this.vdp.register00, register01: this.vdp.register01,
                register02: this.vdp.register02, register03: this.vdp.register03,
                register04: this.vdp.register04, register05: this.vdp.register05,
                register06: this.vdp.register06, register07: this.vdp.register07,
                register08: this.vdp.register08, register09: this.vdp.register09,
                register0a: this.vdp.register0a
            },
            mmu: {
                systemWorkRam: new Uint8Array(this.mmu.systemWorkRam),
                mapperSlot2IsCartridgeRam: this.mmu.mapper.mapperSlot2IsCartridgeRam,
                cartridgeRam: new Uint8Array(this.mmu.mapper.cartridgeRam),
                slot0Idx: this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[0]),
                slot1Idx: this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[1]),
                slot2Idx: this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[2])
            },
            psg: {
                volregister: [...this.psg.volregister],
                toneregister: [...this.psg.toneregister],
                wavePos: [...this.psg.wavePos],
                chan2belatched: this.psg.chan2belatched,
                what2latch: this.psg.what2latch,
                internalClock: this.psg.internalClock,
                internalClockPos: this.psg.internalClockPos
            }
        };

        this.rewindHistory.push(stateSnap);
        if (this.rewindHistory.length > this.maxRewindStates) {
            this.rewindHistory.shift(); // Evicts oldest state to enforce circular buffer boundaries
        }
    }

    /**
     * Restores an in-memory lightweight state snap, synchronizing all reference pointers.
     * @param {Object} state - The state snap package to restore.
     */
    restoreRewindState(state) {
        Object.assign(this.cpu.registers, state.cpu.registers);
        Object.assign(this.cpu.shadowRegisters, state.cpu.shadowRegisters);
        this.cpu.maskableInterruptsEnabled = state.cpu.maskableInterruptsEnabled;
        this.cpu.maskableInterruptWaiting = state.cpu.maskableInterruptWaiting;
        this.cpu.interruptMode = state.cpu.interruptMode;
        this.cpu.totCycles = state.cpu.totCycles;
        this.cpu.NMIWaiting = state.cpu.NMIWaiting;
        this.cpu.m_bAfterEI = state.cpu.m_bAfterEI;

        this.vdp.colorRam.set(state.vdp.colorRam);
        this.vdp.vRam.set(state.vdp.vRam);
        this.vdp.currentScanlineIndex = state.vdp.currentScanlineIndex;
        this.vdp.lineCounter = state.vdp.lineCounter;
        this.vdp.controlWordFlag = state.vdp.controlWordFlag;
        this.vdp.controlWord = state.vdp.controlWord;
        this.vdp.dataPortReadWriteAddress = state.vdp.dataPortReadWriteAddress;
        this.vdp.dataPortWriteMode = state.vdp.dataPortWriteMode;
        this.vdp.readBufferByte = state.vdp.readBufferByte;
        this.vdp.statusFlags = state.vdp.statusFlags;
        this.vdp.nameTableBaseAddress = state.vdp.nameTableBaseAddress;
        this.vdp.spriteAttributeTableBaseAddress = state.vdp.spriteAttributeTableBaseAddress;
        this.vdp.spritePatternGeneratorBaseAddress = state.vdp.spritePatternGeneratorBaseAddress;
        this.vdp.vcounter = state.vdp.vcounter;
        this.vdp.hcounter = state.vdp.hcounter;
        this.vdp.register00 = state.vdp.register00; this.vdp.register01 = state.vdp.register01;
        this.vdp.register02 = state.vdp.register02; this.vdp.register03 = state.vdp.register03;
        this.vdp.register04 = state.vdp.register04; this.vdp.register05 = state.vdp.register05;
        this.vdp.register06 = state.vdp.register06; this.vdp.register07 = state.vdp.register07;
        this.vdp.register08 = state.vdp.register08; this.vdp.register09 = state.vdp.register09;
        this.vdp.register0a = state.vdp.register0a;

        this.mmu.systemWorkRam.set(state.mmu.systemWorkRam);
        this.mmu.mapper.cartridgeRam.set(state.mmu.cartridgeRam);
        this.mmu.mapper.mapperSlot2IsCartridgeRam = state.mmu.mapperSlot2IsCartridgeRam;

        if (state.mmu.slot0Idx !== -1) this.mmu.mapper.mapperSlots[0] = this.mmu.mapper.romBanks[state.mmu.slot0Idx];
        if (state.mmu.slot1Idx !== -1) this.mmu.mapper.mapperSlots[1] = this.mmu.mapper.romBanks[state.mmu.slot1Idx];
        if (state.mmu.slot2Idx !== -1) this.mmu.mapper.mapperSlots[2] = this.mmu.mapper.romBanks[state.mmu.slot2Idx];

        this.psg.volregister = [...state.psg.volregister];
        this.psg.toneregister = [...state.psg.toneregister];
        this.psg.wavePos = [...state.psg.wavePos];
        this.psg.chan2belatched = state.psg.chan2belatched;
        this.psg.what2latch = state.psg.what2latch;
        this.psg.internalClock = state.psg.internalClock;
        this.psg.internalClockPos = state.psg.internalClockPos;

        this.psg.syncWorkletState();
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

        // ========================================================================
        // TEMPORAL REWIND EXECUTION BRANCH
        // ========================================================================
        if (this.isRewinding) {
            if (this.psg) this.psg.setMuted(true); // Enforce total mute during timeline shifts
            
            if (this.rewindHistory.length > 0) {
                // Pop and restore multiple states per frame to make rewinding feel rapid and satisfying
                let stateToRestore = null;
                for (let i = 0; i < 2; i++) {
                    if (this.rewindHistory.length > 0) {
                        stateToRestore = this.rewindHistory.pop();
                    }
                }
                if (stateToRestore) {
                    this.restoreRewindState(stateToRestore);
                }
                this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
            }
            this.lastTime = currentTime; // Prevent time delta accumulations during rewind cycles
            this.animationFrameId = requestAnimationFrame(this.loop);
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
            
            let frameExecuted = false;
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
                frameExecuted = true;
            }
            
            if (frameExecuted) {
                this.vdp.hyperBlit(this.videoContext, this.postProcessMode); // Render visualizer frame with active post-processing
                
                // Track and save synchronous state checkpoints every 6 normal frames (approx. 100ms)
                this.rewindFrameCount++;
                if (this.rewindFrameCount >= 6) {
                    this.captureRewindState();
                    this.rewindFrameCount = 0;
                }
            }
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
     * Incorporates Proportional Dynamic Rate Control (DRC) to synchronize 
     * CPU cycles execution directly with sound card playback latency.
     * @param {number} targetFps - The signal FPS target used to calculate cycles per frame.
     */
    executeFrame(targetFps) {
        let emulatedCycles = 0;
        let targetCycles = Math.floor(this.cpu.clockRate / targetFps);

        // ========================================================================
        // DYNAMIC RATE CONTROL (DRC) PROPORTIONAL CONTROLLER
        // ========================================================================
        if (this.psg && this.psg.audioInitialized && !this.fastForward) {
            const drift = this.psg.getClockDrift();
            const targetDrift = this.psg.multiplier * this.psg.audioBufSize * 1.5; // Ideal buffer target
            const error = targetDrift - drift;

            // Proportional feedback factor (Kp = 0.003)
            let adjustment = error * 0.003;
            const maxAdjustment = targetCycles * 0.08; // Clamp drift adjustment bounds to ±8%
            
            if (adjustment > maxAdjustment) adjustment = maxAdjustment;
            if (adjustment < -maxAdjustment) adjustment = -maxAdjustment;

            targetCycles += Math.floor(adjustment);
        }

        while (emulatedCycles < targetCycles) {
            const cyclesElapsed = this.cpu.executeOne();
            
            // Do not step audio clock during fast-forward to prevent buffer clipping noise
            if (!this.fastForward) {
                this.psg.step(this.cpu.totCycles);
            }
            
            this.vdp.update(this.cpu, cyclesElapsed);
            emulatedCycles += cyclesElapsed;
        }
    }
}