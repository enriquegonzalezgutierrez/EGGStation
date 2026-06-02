/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: SNES Core Loop & Master Bus Orchestrator
 * 
 * Coordinates the master frame timing, NTSC master clock divisions, and coordinates
 * all hardware components (Cpu, SnesPpu, SnesApu, SnesDsp, SnesBus) together.
 * Implements real-time gameplay rewinding, fast-forwarding, and asynchronous 
 * resampling of emulated 32040Hz audio to the host device sample rate.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Concentrates loop timing, frame pacing,
 *   and audio buffer dispatching into a dedicated, decoupled orchestration layer.
 */

class SnesOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext - 2D Canvas Context for frame rendering.
     * @param {WebGL2RenderingContext} glContext - WebGL2 Context for advanced GPU post-processing.
     * @param {Function} onFpsUpdate - Callback function triggered upon FPS recalculations.
     */
    constructor(videoContext, glContext, onFpsUpdate) {
        this.videoContext = videoContext;
        this.glContext = glContext;
        this.onFpsUpdate = onFpsUpdate;

        this.isRunning = false;
        this.isPaused = false;
        this.fastForward = false;
        this.isRewinding = false;
        this.isDebugging = false;

        this.fpsTarget = 60.0988; 
        this.frameTimeTarget = 1000 / this.fpsTarget;

        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        this.serializer = new WebIndexedDBSerializer();

        // Instantiate core graphics units
        this.ppu = new SnesPpu();
        this.ppu.renderer = new SnesPpuRenderer(this.ppu);

        // Instantiate audio units
        this.apu = new SnesApu();
        this.dsp = new SnesDsp();
        this.apu.bindModules(new Spc700(this.apu), this.dsp);

        // Instantiate bus and central processing unit
        this.bus = new SnesBus(this.ppu, this.apu, this);
        this.cpu = new Cpu(this.bus);
        
        // Dynamically register instruction sets on boot
        this.cpu.registerInstructionSet(CpuInstructions.register);

        this.xPos = 0;
        this.yPos = 0;

        this.postProcessor = new SnesPostProcessor(this.ppu, this.glContext);

        // NTSC Clock ratios
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);
        this.apuCatchCycles = 0;
        this.cpuCyclesLeft = 12; // Master clock cycle divider

        // Web Audio API components
        this.audioCtx = null;
        this.jsNode = null;
        this.gainNode = null;

        // High-performance asynchronous ring buffer for audio resampling
        this.ringBufferCapacity = 8192;
        this.ringBufferL = new Float64Array(this.ringBufferCapacity);
        this.ringBufferR = new Float64Array(this.ringBufferCapacity);
        this.audioWritePtr = 0;
        this.audioReadPtr = 0;

        // Real-Time Rewind historical state pool (Pre-allocated for zero Garbage Collection)
        this.maxRewindStates = 100;
        this.rewindHistory = [];
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;
        this.postProcessMode = 0;

        this.initializeStatePool();
        this.loop = this.loop.bind(this);
    }

    /**
     * Pre-allocates historical state entities to avoid run-time memory allocations
     * and secure flat GC execution paths during real-time rewinding.
     */
    initializeStatePool() {
        this.rewindHistory = [];
        for (let i = 0; i < this.maxRewindStates; i++) {
            this.rewindHistory[i] = {
                cpu: { pc: 0, pb: 0, db: 0, p: 0, e: false },
                ppu: { vram: new Uint16Array(0x8000), cgram: new Uint16Array(0x100) },
                ram: new Uint8Array(0x20000)
            };
        }
    }

    /**
     * Safe-starts the Web Audio API context and structures the output node graph
     * directly inside user-gesture interaction scopes to satisfy browser policies.
     */
    startAudio() {
        if (this.audioCtx) return;
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0.5;
        this.jsNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
        this.jsNode.onaudioprocess = (e) => this.mixAudio(e);
        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
    }

    /**
     * Resamples internal 32040Hz DSP samples to the sound card sample rate
     * using high-speed linear interpolation. Drops samples directly into the ring buffer.
     */
    resampleAndPushAudio() {
        if (!this.audioCtx || this.isPaused || this.isRewinding) return;

        const srcL = this.dsp.samplesL;
        const srcR = this.dsp.samplesR;
        const srcLength = this.dsp.sampleOffset; // Total samples produced in current frame (usually 534)
        if (srcLength === 0) return;

        const destRate = this.audioCtx.sampleRate;
        const srcRate = 32040;
        
        // Calculate exact target samples to generate for this frame duration
        const destLength = Math.round(srcLength * (destRate / srcRate));

        for (let i = 0; i < destLength; i++) {
            const srcPos = i * (srcLength / destLength);
            const idxLow = Math.floor(srcPos);
            const idxHigh = Math.min(srcLength - 1, idxLow + 1);
            const weight = srcPos - idxLow;

            // Linear interpolation
            const sampleL = srcL[idxLow] * (1 - weight) + srcL[idxHigh] * weight;
            const sampleR = srcR[idxLow] * (1 - weight) + srcR[idxHigh] * weight;

            // Write to the circular ring buffer
            const writePos = this.audioWritePtr & (this.ringBufferCapacity - 1);
            this.ringBufferL[writePos] = sampleL;
            this.ringBufferR[writePos] = sampleR;
            this.audioWritePtr++;
        }

        // Reset DSP sample pointer for the next frame
        this.dsp.sampleOffset = 0;
    }

    /**
     * Feeds the Web Audio API destination channels by pulling samples from the circular ring buffer.
     * Implements underrun protection to avoid popping.
     * @param {AudioProcessingEvent} e - Standard script processor event.
     */
    mixAudio(e) {
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        const length = outL.length;

        const available = this.audioWritePtr - this.audioReadPtr;

        if (available < length) {
            // Buffer underrun: drain remaining samples and pad with silence
            let i = 0;
            while (this.audioReadPtr < this.audioWritePtr) {
                const readPos = this.audioReadPtr & (this.ringBufferCapacity - 1);
                outL[i] = this.ringBufferL[readPos];
                outR[i] = this.ringBufferR[readPos];
                this.audioReadPtr++;
                i++;
            }
            while (i < length) {
                outL[i] = 0;
                outR[i] = 0;
                i++;
            }
        } else {
            // Standard read pass
            for (let i = 0; i < length; i++) {
                const readPos = this.audioReadPtr & (this.ringBufferCapacity - 1);
                outL[i] = this.ringBufferL[readPos];
                outR[i] = this.ringBufferR[readPos];
                this.audioReadPtr++;
            }
        }

        // Pointer overflow prevention safety check
        if (this.audioReadPtr > 0x10000000) {
            const diff = this.audioWritePtr - this.audioReadPtr;
            this.audioReadPtr = 0;
            this.audioWritePtr = diff;
        }
    }

    /**
     * Parses and mounts a cartridge ROM array buffer and boots up CPU vectors.
     * @param {string} filename - Target ROM file name.
     * @param {ArrayBuffer} arrayBuffer - Raw binary ROM data.
     */
    loadRom(filename, arrayBuffer) {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        const cartridge = new SnesCartridge(filename);
        cartridge.load(arrayBuffer);

        const mapper = new SnesMapper(cartridge);
        this.bus.mountCartridge(mapper);

        this.ppu.reset();
        this.apu.reset();
        this.cpu.reset();

        this.xPos = 0;
        this.yPos = 0;
        this.framesRendered = 0;
        this.accumulatedTime = 0;
        this.cpuCyclesLeft = 12;

        this.audioWritePtr = 0;
        this.audioReadPtr = 0;

        this.startAudio();

        this.isRunning = true;
        this.isPaused = false;
        this.isDebugging = false;
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;

        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this.loop);
        console.log(`SnesOrchestrator::Core Loop and memories synced for ROM: ${filename}`);
    }

    /**
     * Toggles system pause status.
     */
    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        if (!this.isPaused) {
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.loop);
        }
    }

    /**
     * Steps the master execution loop, ticking timers, DMA channels, and CPU clock boundaries.
     */
    stepMasterSystem() {
        this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

        if (this.bus.joypadStrobe) {
            this.bus.joypad1Val = this.bus.joypad1State;
            this.bus.joypad2Val = this.bus.joypad2State;
        }

        if (this.bus.hdmaTimer > 0) {
            this.bus.hdmaTimer -= 2;
        } else if (this.bus.dmaBusy) {
            this.bus.handleDma();
        } else if (this.xPos < 536 || this.xPos >= 576) {
            this.stepCpu();
        }

        if (this.yPos === this.bus.vTimer && this.bus.vIrqEnabled) {
            if (!this.bus.hIrqEnabled && this.xPos === 0) this.cpu.irqWanted = true;
            else if (this.bus.hIrqEnabled && this.xPos === (this.bus.hTimer * 4)) this.cpu.irqWanted = true;
        } else if (this.xPos === (this.bus.hTimer * 4) && this.bus.hIrqEnabled && !this.bus.vIrqEnabled) {
            this.cpu.irqWanted = true;
        }

        if (this.xPos === 1024) {
            this.ppu.inHblank = true;
            if (!this.ppu.inVblank) this.bus.handleHdma();
        } else if (this.xPos === 0) {
            this.ppu.inHblank = false;
            this.ppu.checkOverscan(this.yPos);
        } else if (this.xPos === 512) {
            if (this.ppu.renderer) this.ppu.renderer.renderScanline(this.yPos, this.ppu.glbFrameBuffer);
        }

        if (this.yPos === (this.ppu.frameOverscan ? 240 : 225) && this.xPos === 0) {
            this.ppu.inVblank = true;
            if (this.bus.autoJoyRead) {
                this.bus.autoJoyTimer = 4224;
                this.bus.doAutoJoyRead();
            }
            if (this.bus.nmiEnabled) this.cpu.nmiWanted = true;
        } else if (this.yPos === 0 && this.xPos === 0) {
            this.ppu.inVblank = false;
            this.bus.initHdma();
        }

        if (this.bus.autoJoyTimer > 0) this.bus.autoJoyTimer -= 2;

        this.xPos += 2;
        if (this.xPos === 1364) {
            this.xPos = 0;
            this.yPos++;
            if (this.yPos === 262) {
                this.catchUpApu();
                this.yPos = 0;
            }
        }
    }

    /**
     * Steps the main 65816 CPU clock relative to the system master clock.
     */
    stepCpu() {
        if (this.cpuCyclesLeft <= 0) {
            this.cpu.cyclesLeft = 0;
            this.cpu.cpuMemOps = 0;
            
            this.cpu.cycle(); 
            
            this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpu.cpuMemOps) * 6;
        }
        this.cpuCyclesLeft -= 2; 
    }

    /**
     * Synchronizes and steps the APU/SPC700 clock lines.
     */
    catchUpApu() {
        const catchUpCycles = this.apuCatchCycles & 0xFFFFFFFF;
        for (let i = 0; i < catchUpCycles; i++) {
            this.apu.cycle(); 
        }
        this.apuCatchCycles -= catchUpCycles;
    }

    /**
     * Captures a lightweight snapshot of the system memory to the Ring Buffer State Cache.
     */
    captureRewindState() {
        if (!this.isRunning || this.isPaused || this.isRewinding) return;
        const state = this.rewindHistory[this.rewindHistoryPointer];
        state.cpu.pc = this.cpu.registers.pc;
        state.cpu.pb = this.cpu.registers.pb;
        state.cpu.db = this.cpu.registers.db;
        state.cpu.p = this.cpu.registers.p;
        state.cpu.e = this.cpu.registers.e;
        state.ppu.vram.set(this.ppu.vram);
        state.ppu.cgram.set(this.ppu.cgram);
        state.ram.set(this.bus.ram);
        this.rewindHistoryPointer = (this.rewindHistoryPointer + 1) % this.maxRewindStates;
        this.rewindActiveCount = Math.min(this.maxRewindStates, this.rewindActiveCount + 1);
    }

    /**
     * Restores memory states from the Ring Buffer State Cache.
     * @param {Object} state - Target state snapshot.
     */
    restoreRewindState(state) {
        this.cpu.registers.pc = state.cpu.pc;
        this.cpu.registers.pb = state.cpu.pb;
        this.cpu.registers.db = state.cpu.db;
        this.cpu.registers.p = state.cpu.p;
        this.cpu.registers.e = state.cpu.e;
        this.ppu.vram.set(state.ppu.vram);
        this.ppu.cgram.set(state.ppu.cgram);
        this.bus.ram.set(state.ram);
    }

    /**
     * Central execution loop hook scheduled by requestAnimationFrame.
     * @param {DOMHighResTimeStamp} currentTime - Absolute timestamp.
     */
    loop(currentTime) {
        if (!this.isRunning || this.isPaused || this.isDebugging) return;

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
                if (this.ppu.glbFrameBuffer) this.postProcessor.blit(this.videoContext, this.ppu.glbFrameBuffer, this.ppu.frameOverscan ? 240 : 224, this.postProcessMode);
            }
            this.lastTime = currentTime;
            this.animationFrameId = requestAnimationFrame(this.loop);
            return;
        }

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        if (deltaTime > 100) deltaTime = this.frameTimeTarget;

        if (this.fastForward) {
            for (let i = 0; i < 4; i++) this.executeFrame();
        } else {
            this.accumulatedTime += deltaTime;
            while (this.accumulatedTime >= this.frameTimeTarget) {
                this.executeFrame();
                this.accumulatedTime -= this.frameTimeTarget;
            }
        }
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Executes exactly one full emulation frame (Scanlines 0 to 261).
     */
    executeFrame() {
        const totalClocksPerFrame = (1364 * 262) / 2;
        for (let i = 0; i < totalClocksPerFrame; i++) {
            this.stepMasterSystem();
        }

        if (this.ppu.glbFrameBuffer) {
            this.postProcessor.blit(this.videoContext, this.ppu.glbFrameBuffer, this.ppu.frameOverscan ? 240 : 224, this.postProcessMode);
        }

        // Mix and stream the generated sound buffer
        this.resampleAndPushAudio();

        this.rewindFrameCount++;
        if (this.rewindFrameCount >= 6) {
            this.captureRewindState();
            this.rewindFrameCount = 0;
        }

        this.framesRendered++;
        if (this.framesRendered % 10 === 0 && this.onFpsUpdate) {
            this.onFpsUpdate(this.fastForward ? "FFWD" : this.fpsTarget.toFixed(1));
        }
    }
}

window.SnesOrchestrator = SnesOrchestrator;