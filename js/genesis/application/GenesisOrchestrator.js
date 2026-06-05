/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/application/GenesisOrchestrator.js
 * 
 * Role:
 * Application Layer: Sega Genesis Orchestrator.
 * Coordinates the master system synchronization, clock cycle divisions, 
 * frame pacing, and maps physical CPU buses to the VDP, PSG, and FM coprocessors.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Isolates loop orchestration, frame 
 *    timing, and audio buffer dispatching from the DOM.
 * 2. Liskov Substitution Principle (LSP): Fully implements the unified orchestrator 
 *    interface expected by the app.js Bootstrapper (loadRom, stop, setAudioEnabled).
 * 3. Dependency Inversion Principle (DIP): Relies directly on the abstract 
 *    Universal IndexedDbManager client rather than tightly coupling to legacy 
 *    custom serializer scripts.
 */

class GenesisOrchestrator {
    constructor(videoContext, glContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.glContext = glContext;
        this.onFpsUpdate = onFpsUpdate;

        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;
        this.isRewinding = false;
        this.isDebugging = false;
        this.breakpointAddress = null;

        this.tvStandard = 0; // 0 = NTSC (60Hz), 1 = PAL (50Hz)

        this.audioCtx = null;
        this.jsNode = null;
        this.gainNode = null;
        this.audioEnabled = true;

        this.maxAudioBufferSize = 2048;
        this.tempFm = new Int16Array(this.maxAudioBufferSize * 2);
        this.tempPsg = new Int16Array(this.maxAudioBufferSize);

        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;
        this.lastDeltaTime = 0; 

        // State Serializer and GC-Free Rewind Pool
        this.serializer = new IndexedDbManager();
        this.maxRewindStates = 100; 
        this.rewindHistory = [];
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;
        this.initializeStatePool();

        // Hardware Domain Instantiation
        this.vdp = new GenesisVdp();
        this.psg = new GenesisPsg();
        this.fm = new GenesisYm2612();
        this.controllerManager = new GenesisControllerManager();

        this.z80Bus = new GenesisBusZ80(this.fm);
        this.bus = new GenesisBusM68k(this.controllerManager, this.vdp, this.psg, this.fm, this.z80Bus);

        this.z80Bus.bindMasterBus(
            (addr, cycles) => this.bus.readByte(addr, cycles),
            (addr, val, cycles) => this.bus.writeByte(addr, val, cycles)
        );

        this.m68k = new M68000(this.bus);
        this.z80 = new GenesisZ80(this.z80Bus);
        this.z80Bus.bindCpu(this.z80);

        // Register 68K Instruction Sets
        if (typeof M68kDataTransfer !== 'undefined') this.m68k.registerModule(M68kDataTransfer.register);
        if (typeof M68kArithmetic !== 'undefined') this.m68k.registerModule(M68kArithmetic.register);
        if (typeof M68kLogical !== 'undefined') this.m68k.registerModule(M68kLogical.register);
        if (typeof M68kBitwise !== 'undefined') this.m68k.registerModule(M68kBitwise.register);
        if (typeof M68kShiftRotate !== 'undefined') this.m68k.registerModule(M68kShiftRotate.register);
        if (typeof M68kProgramFlow !== 'undefined') this.m68k.registerModule(M68kProgramFlow.register);
        if (typeof M68kSystemExceptions !== 'undefined') this.m68k.registerModule(M68kSystemExceptions.register);

        this.currentScanline = 0;
        this.currentCycle = 0;

        this.glbFrameBuffer = new Uint8ClampedArray(320 * 240 * 4);
        this.prevFrameBuffer = new Uint8ClampedArray(320 * 240 * 4);
        this.postProcessMode = 0; 

        // PHASE 4: Use the UniversalPostProcessor directly
        this.postProcessor = new UniversalPostProcessor(this.glContext);
        this.loop = this.loop.bind(this);
    }

    /**
     * Pre-allocates objects for the Real-Time Rewind state pool.
     */
    initializeStatePool() {
        this.rewindHistory = [];
        for (let i = 0; i < this.maxRewindStates; i++) {
            this.rewindHistory[i] = {
                m68k_pc: 0,
                m68k_sr: 0,
                vdp_regs: new Uint8Array(0x20)
            };
        }
    }

    initialise() {
        this.currentScanline = 0;
        this.currentCycle = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;
        this.lastDeltaTime = 0;

        this.glbFrameBuffer.fill(0);
        this.prevFrameBuffer.fill(0);

        this.vdp.initialise();
        this.psg.initialise();
        this.fm.initialise();
        this.controllerManager.initialise();
        this.z80Bus.initialise();
        this.bus.initialise();
        this.m68k.reset();
    }

    setTvStandard(standard) {
        this.tvStandard = standard === "PAL" ? 1 : 0;
        if (this.bus) this.bus.tvStandard = this.tvStandard;
    }

    setPostProcessMode(mode) {
        this.postProcessMode = mode;
    }

    setAudioFilterMode(mode) {
        if (this.psg && this.isRunning) {
            this.psg.setAudioFilter(mode);
        }
    }

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    startAudio() {
        if (this.audioCtx) return;
        this.audioEnabled = window.audioEnabledState !== false;
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0.5; 
        this.jsNode = this.audioCtx.createScriptProcessor(this.maxAudioBufferSize, 0, 2);
        this.jsNode.onaudioprocess = (e) => this.mixAudio(e);
        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        if (!this.audioEnabled) {
            this.audioCtx.suspend().catch(() => {});
        }
    }

    mixAudio(e) {
        if (!this.isRunning || this.isPaused || this.isRewinding || this.audioEnabled === false) {
            e.outputBuffer.getChannelData(0).fill(0);
            e.outputBuffer.getChannelData(1).fill(0);
            return;
        }

        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        const totalFrames = outL.length;

        if (totalFrames > this.tempPsg.length) {
            this.tempFm = new Int16Array(totalFrames * 2);
            this.tempPsg = new Int16Array(totalFrames);
        }

        this.tempFm.fill(0);
        this.tempPsg.fill(0);

        if (this.fm) this.fm.outputSamples(this.tempFm, totalFrames);
        if (this.psg) this.psg.update(this.tempPsg, totalFrames);

        for (let i = 0; i < totalFrames; i++) {
            const fmIdx = i * 2;
            const fmLeftNormalized = this.tempFm[fmIdx] / 32768.0;
            const fmRightNormalized = this.tempFm[fmIdx + 1] / 32768.0;
            const psgNormalized = this.tempPsg[i] / 32768.0;

            outL[i] = fmLeftNormalized + psgNormalized;
            outR[i] = fmRightNormalized + psgNormalized;
        }
    }

    /**
     * Loads a cartridge binary, mounts it on the bus, and then triggers the CPU hardware reset.
     * @param {string|ArrayBuffer} filenameOrBuffer - The ROM filename or raw buffer.
     * @param {ArrayBuffer} [optionalBuffer] - The raw ROM array buffer if filename is provided.
     */
    loadRom(filenameOrBuffer, optionalBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        const romBuffer = optionalBuffer !== undefined ? optionalBuffer : filenameOrBuffer;

        if (!romBuffer || !(romBuffer instanceof ArrayBuffer)) {
            console.error("[GenesisOrchestrator] Fatal: Invalid ROM ArrayBuffer passed to loadRom.");
            return;
        }

        this.initialise();
        this.bus.setCartridge(romBuffer);
        this.setTvStandard(this.bus.tvStandard === 1 ? "PAL" : "NTSC");
        this.m68k.reset();
        this.startAudio();

        this.isRunning = true;
        this.isPaused = false;
        this.isDebugging = false;
        this.breakpointAddress = null;

        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;

        this.lastTime = performance.now();
        this.accumulatedTime = 0;

        console.log("[GenesisOrchestrator] Sega Genesis Engine Booted Successfully.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close().catch(() => {});
        }
    }

    setAudioEnabled(enabled) {
        this.audioEnabled = enabled;
        if (this.audioCtx) {
            if (enabled) {
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().catch(() => {});
                }
            } else {
                if (this.audioCtx.state === 'running') {
                    this.audioCtx.suspend().catch(() => {});
                }
            }
        }
    }

    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        if (!this.isPaused) {
            this.lastTime = performance.now(); 
            this.animationFrameId = requestAnimationFrame(this.loop);
        }
    }

    triggerPauseButton() {
        if (this.controllerManager && this.isRunning) {
            this.controllerManager.write(0, this.currentCycle, 0);
        }
    }

    /**
     * PHASE 4: Self-serialize standard engine properties to be handled by the Database Client.
     */
    async saveState() {
        if (this.isRunning && this.bus.cartridgeRom) {
            try {
                const statePayload = {
                    m68k: {
                        d: Array.from(this.m68k.d),
                        a: Array.from(this.m68k.a),
                        pc: this.m68k.pc,
                        sr: this.m68k.sr,
                        usp: this.m68k.usp,
                        ssp: this.m68k.ssp,
                        irqPending: this.m68k.irqPending,
                        cyclesRemaining: this.m68k.cyclesRemaining,
                        flags: {
                            n: this.m68k.fN,
                            z: this.m68k.fZ,
                            v: this.m68k.fV,
                            c: this.m68k.fC,
                            x: this.m68k.fX
                        }
                    },
                    vdp: {
                        regs: Array.from(this.vdp.regs),
                        vram: Array.from(this.vdp.vRam),
                        cram: Array.from(this.vdp.cram),
                        vsram: Array.from(this.vdp.vsram)
                    },
                    mmu: {
                        workRam: Array.from(this.bus.workRam),
                        externalRam: Array.from(this.bus.externalRam),
                        bankRegisters: Array.from(this.bus.bankRegisters)
                    },
                    psg: {
                        tonesCountdown: Array.from(this.psg.tonesCountdown),
                        tonesCountdownMaster: Array.from(this.psg.tonesCountdownMaster),
                        tonesAttenuation: Array.from(this.psg.tonesAttenuation),
                        tonesOutputState: Array.from(this.psg.tonesOutputState),
                        noiseType: this.psg.noiseType,
                        noiseShiftRegister: this.psg.noiseShiftRegister,
                        noiseOut: this.psg.noiseOut
                    }
                };
                await this.serializer.save("GENESIS_SAVESTATE", statePayload);
                console.log("[GenesisOrchestrator] State Saved.");
            } catch (err) {
                console.error("[GenesisOrchestrator] Save State failed:", err);
            }
        }
    }

    /**
     * PHASE 4: Load and reconstruct serialized state values directly.
     */
    async loadState() {
        if (this.isRunning && this.bus.cartridgeRom) {
            try {
                const state = await this.serializer.load("GENESIS_SAVESTATE");
                if (!state) return;

                // Restore M68K
                this.m68k.d.set(state.m68k.d);
                this.m68k.a.set(state.m68k.a);
                this.m68k.pc = state.m68k.pc;
                this.m68k.sr = state.m68k.sr;
                this.m68k.usp = state.m68k.usp;
                this.m68k.ssp = state.m68k.ssp;
                this.m68k.irqPending = state.m68k.irqPending;
                this.m68k.cyclesRemaining = state.m68k.cyclesRemaining;
                this.m68k.fN = state.m68k.flags.n;
                this.m68k.fZ = state.m68k.flags.z;
                this.m68k.fV = state.m68k.flags.v;
                this.m68k.fC = state.m68k.flags.c;
                this.m68k.fX = state.m68k.flags.x;

                // Restore VDP
                this.vdp.regs.set(state.vdp.regs);
                this.vdp.vRam.set(state.vdp.vram);
                this.vdp.cram.set(state.vdp.cram);
                this.vdp.vsram.set(state.vdp.vsram);

                // Restore MMU
                this.bus.workRam.set(state.mmu.workRam);
                this.bus.externalRam.set(state.mmu.externalRam);
                this.bus.bankRegisters.set(state.mmu.bankRegisters);

                // Restore PSG
                this.psg.tonesCountdown.set(state.psg.tonesCountdown);
                this.psg.tonesCountdownMaster.set(state.psg.tonesCountdownMaster);
                this.psg.tonesAttenuation.set(state.psg.tonesAttenuation);
                this.psg.tonesOutputState.set(state.psg.tonesOutputState);
                this.psg.noiseType = state.psg.noiseType;
                this.psg.noiseShiftRegister = state.psg.noiseShiftRegister;
                this.psg.noiseOut = state.psg.noiseOut;

                this.rewindActiveCount = 0;
                this.rewindHistoryPointer = 0;
                console.log("[GenesisOrchestrator] State Loaded.");
            } catch (err) {
                console.error("[GenesisOrchestrator] Load State failed:", err);
            }
        }
    }

    captureRewindState() {
        if (!this.isRunning || this.isPaused || this.isRewinding) return;

        const state = this.rewindHistory[this.rewindHistoryPointer];
        
        state.m68k_pc = this.m68k.pc;
        state.m68k_sr = this.m68k.sr;
        state.vdp_regs.set(this.vdp.regs);

        this.rewindHistoryPointer = (this.rewindHistoryPointer + 1) % this.maxRewindStates;
        this.rewindActiveCount = Math.min(this.maxRewindStates, this.rewindActiveCount + 1);
    }

    restoreRewindState(state) {
        this.m68k.pc = state.m68k_pc;
        this.m68k.sr = state.m68k_sr;
        this.vdp.regs.set(state.vdp_regs);
    }

    loop(currentTime) {
        if (!this.isRunning || this.isPaused || this.isDebugging) {
            if (this.isDebugging) {
                this.lastTime = currentTime;
                this.animationFrameId = requestAnimationFrame(this.loop);
            }
            return;
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }

        // Handle Active Rewinding
        if (this.isRewinding) {
            if (this.rewindActiveCount > 0) {
                for (let i = 0; i < 2; i++) {
                    if (this.rewindActiveCount > 0) {
                        this.rewindHistoryPointer = (this.rewindHistoryPointer - 1 + this.maxRewindStates) % this.maxRewindStates;
                        this.rewindActiveCount--;
                    }
                }
                const state = this.rewindHistory[this.rewindHistoryPointer];
                this.restoreRewindState(state);
                
                const activeWidth = this.vdp.h40Enabled ? 320 : 256;
                const activeHeight = this.vdp.v30Enabled ? 240 : 224;
                if (this.postProcessor) {
                    this.postProcessor.blit(this.videoContext, this.glbFrameBuffer, activeWidth, activeHeight, this.postProcessMode, this.prevFrameBuffer);
                }
            }
            this.lastTime = currentTime;
            this.animationFrameId = requestAnimationFrame(this.loop);
            return;
        }

        const targetFps = this.tvStandard === 1 ? 50.0 : 59.94;
        const targetFrameTime = 1000 / targetFps;

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        if (deltaTime > 100) deltaTime = targetFrameTime;
        this.lastDeltaTime = deltaTime;

        if (this.fastForward) {
            for (let i = 0; i < 4; i++) {
                this.executeFrame(targetFps);
            }
        } else {
            this.accumulatedTime += deltaTime;
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
            }
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Simulates exactly one frame's worth of CPU and VDP scanlines.
     */
    executeFrame(targetFps) {
        const totalScanlines = this.tvStandard === 1 ? 312 : 262;
        const activeHeight = this.vdp.v30Enabled ? 240 : 224;
        const masterClockSpeed = this.tvStandard === 1 ? 53203424 : 53693175;
        
        const m68kClockSpeed = Math.floor(masterClockSpeed / 7);
        
        let targetCycles = Math.floor(m68kClockSpeed / targetFps);
        if (this.psg && this.audioCtx && !this.fastForward) {
            const drift = this.audioCtx.currentTime * this.audioCtx.sampleRate - this.framesRendered * (this.audioCtx.sampleRate / targetFps);
            if (Math.abs(drift) > 500) {
                targetCycles += Math.floor((500 - drift) * 0.05);
            }
        }

        const m68kCyclesPerScanline = Math.floor(targetCycles / totalScanlines);

        for (let scanline = 0; scanline < totalScanlines; scanline++) {
            this.currentScanline = scanline;
            this.vdp.currentScanlineIndex = scanline < activeHeight ? scanline : 0;

            if (scanline < activeHeight) {
                this.vdp.currentlyInVblank = false;
                this.vdp.beginScanline();

                this.stepCPUs(Math.floor(m68kCyclesPerScanline / 2));

                this.vdp.endScanline(scanline, (user_data, line, pixels, shadowMap, w, h) => {
                    this.renderScanline(line, pixels, shadowMap, w, h);
                }, null);

                this.stepCPUs(Math.floor(m68kCyclesPerScanline / 2));
            } else {
                if (scanline === activeHeight) {
                    this.vdp.currentlyInVblank = true;
                    this.vdp.vIntPending = true; 
                    if (this.vdp.vIntEnabled) this.m68k.irqPending = 6;
                    if (!this.z80Bus.isZ80Frozen()) this.z80.raiseMaskableInterrupt();
                } else if (scanline === activeHeight + 1) {
                    if (!this.z80Bus.isZ80Frozen()) this.z80.maskableInterruptWaiting = false;
                }
                this.stepCPUs(m68kCyclesPerScanline);
            }

            if (scanline < activeHeight) {
                if (this.vdp.hIntInterval-- <= 0) {
                    this.vdp.hIntInterval = this.vdp.register0a;
                    if (this.vdp.hIntEnabled) this.m68k.irqPending = 4;
                }
            }
        }
        
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

        const activeLength = activeWidth * activeHeight * 4;
        this.prevFrameBuffer.set(this.glbFrameBuffer.subarray(0, activeLength));

        this.rewindFrameCount++;
        if (this.rewindFrameCount >= 6) {
            this.captureRewindState();
            this.rewindFrameCount = 0;
        }

        this.framesRendered++;
        if (this.framesRendered % 10 === 0 && this.onFpsUpdate) {
            const currentFps = (this.lastDeltaTime > 0) ? (1000 / this.lastDeltaTime).toFixed(1) : (this.tvStandard === 1 ? "50.0" : "60.0");
            this.onFpsUpdate(this.fastForward ? "FFWD" : currentFps);
        }
    }

    stepCPUs(m68kCycles) {
        if (!this.isRunning || this.isPaused || this.isDebugging) return;

        if (this.breakpointAddress !== null && this.m68k.pc === this.breakpointAddress) {
            this.isDebugging = true;
            this.isPaused = false;
            window.dispatchEvent(new CustomEvent('genesis-debugger-break'));
            return;
        }

        this.m68k.execute(m68kCycles);

        if (!this.z80Bus.isZ80Frozen()) {
            const z80Cycles = Math.floor(m68kCycles / 2);
            let elapsed = 0;
            while (elapsed < z80Cycles) {
                elapsed += this.z80.executeOne(); 
            }
        }
        
        this.fm.update(m68kCycles);
    }

    stepInstruction() {
        if (!this.isRunning || !this.m68k) return;

        this.m68k.execute(4);

        if (!this.z80Bus.isZ80Frozen()) {
            const z80Cycles = 2; 
            let elapsed = 0;
            while (elapsed < z80Cycles) {
                elapsed += this.z80.executeOne();
            }
        }
        this.fm.update(4);
    }

    rasterizeVramTiles(ctx) {
        if (!this.vdp) return;
        const imgData = ctx.createImageData(128, 192); 
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
                    
                    const pixelNibble = (col % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                    const rgb = pixelNibble * 17;
                    const destIdx = ((destBaseX + col) + ((destBaseY + row) * 128)) * 4;

                    imgData.data[destIdx] = rgb;
                    imgData.data[destIdx + 1] = rgb;
                    imgData.data[destIdx + 2] = rgb;
                    imgData.data[destIdx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    renderScanline(line, pixels, shadowMap, width, height) {
        const shadowEnabled = this.vdp.shadowHighlightEnabled;
        const destOffset = line * width * 4;

        for (let i = 0; i < width; i++) {
            let colorIdx = pixels[i] & 0x3F;
            let cramOffset = 0x000; 

            if (shadowEnabled) {
                const shadowStatus = shadowMap[i];
                if (shadowStatus === 0) cramOffset = 0x040; 
                else if (shadowStatus === 2) cramOffset = 0x080; 
            }

            const rgb = this.vdp.cram[cramOffset + colorIdx]; 
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