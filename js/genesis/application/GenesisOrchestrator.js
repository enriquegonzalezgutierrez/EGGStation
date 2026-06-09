/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/application/GenesisOrchestrator.js
 * 
 * ROLE:
 * Application Layer: Sega Genesis Orchestrator.
 * Coordinates system execution loops, schedules frame sync rates, and handles
 * pre-allocated state pools to achieve zero Garbage Collection allocations.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Coordinates clock cycles, schedules frames, 
 *   and synchronizes inputs. Delegates audio mixing to UniversalAudioProcessor 
 *   and state serialization to individual hardware cores.
 * - Dependency Inversion Principle (DIP): Depends on the abstract UniversalAudioProcessor 
 *   service instead of directly instantiating low-level browser audio nodes.
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

        // Unified Audio Processor integration (DIP)
        this.audioProcessor = new UniversalAudioProcessor();
        this.audioProcessor.orchestrator = this;

        // Zero-Allocation audio buffers
        this.samplesPerFrame = Math.floor(this.audioProcessor.samplesPerFrame);
        this.tempFm = new Int16Array(this.samplesPerFrame * 2);
        this.tempPsg = new Int16Array(this.samplesPerFrame);
        this.transferBufferL = new Float32Array(this.samplesPerFrame);
        this.transferBufferR = new Float32Array(this.samplesPerFrame);

        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        
        this.fpsCount = 0;
        this.fpsTimer = 0;
        this.framesRendered = 0;

        // Savestate Serializer
        this.serializer = new IndexedDbManager();
        this.maxRewindStates = 100; 
        this.rewindHistory = [];
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;
        this.initializeStatePool();

        // Hardware Domain Instantiation
        this.vdp = new GenesisVdp();
        this.psg = new SegaPsg();
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
        
        this.glbFrameBuffer32 = new Uint32Array(this.glbFrameBuffer.buffer);
        this.prevFrameBuffer32 = new Uint32Array(this.prevFrameBuffer.buffer);

        this.postProcessMode = 0; 
        this.postProcessor = new UniversalPostProcessor(this.glContext);
        this.loop = this.loop.bind(this);
    }

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
        
        this.fpsCount = 0;
        this.fpsTimer = performance.now();

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
        this.audioProcessor.setFilterMode(mode);
    }

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

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
        
        this.audioProcessor.resume();
        this.setAudioEnabled(window.audioEnabledState);

        // Sound Synchronization Fix: Map the browser's dynamic sample rate to the WASM PSG bridge
        if (this.psg && this.audioProcessor.audioCtx) {
            this.psg.setSampleRate(this.audioProcessor.audioCtx.sampleRate);
        }

        this.isRunning = true;
        this.isPaused = false;
        this.isDebugging = false;
        this.breakpointAddress = null;

        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;

        this.lastTime = performance.now();
        this.accumulatedTime = 0;
        
        this.fpsCount = 0;
        this.fpsTimer = this.lastTime;

        console.log("[GenesisOrchestrator] Sega Genesis Engine Booted Successfully.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }
    
    stop() {
        this.isRunning = false;
        this.audioProcessor.stop();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    setAudioEnabled(enabled) {
        this.audioProcessor.setAudioEnabled(enabled);
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

    async saveState() {
        if (this.isRunning && this.bus.cartridge) { 
            try {
                // SOLID Fix: Clean, encapsulated serialization (Delegates work to cores)
                const statePayload = {
                    m68k: this.m68k.serializeState ? this.m68k.serializeState() : null,
                    vdp: this.vdp.serializeState ? this.vdp.serializeState() : null,
                    psg: this.psg.serializeState ? this.psg.serializeState() : null,
                    mmu: {
                        workRam: Array.from(this.bus.workRam)
                    },
                    mapper: this.bus.mapper ? this.bus.mapper.serializeState() : null
                };
                await this.serializer.save("GENESIS_SAVESTATE", statePayload);

                if (this.glbFrameBuffer) {
                    const src = this.glbFrameBuffer;
                    const dstWidth = 128;
                    const dstHeight = 120;
                    const smallArray = new Uint8Array(dstWidth * dstHeight * 4);
                    
                    for (let y = 0; y < dstHeight; y++) {
                        const srcY = Math.floor(y * 2) * 320 * 4; 
                        const dstY = y * dstWidth * 4;
                        for (let x = 0; x < dstWidth; x++) {
                            const srcX = Math.floor(x * 2.5) * 4; 
                            const srcIdx = srcY + srcX;
                            const dstIdx = dstY + (x * 4);
                            
                            smallArray[dstIdx] = src[srcIdx];
                            smallArray[dstIdx + 1] = src[srcIdx + 1];
                            smallArray[dstIdx + 2] = src[srcIdx + 2];
                            smallArray[dstIdx + 3] = 255;
                        }
                    }

                    localStorage.setItem('savestateScreenshot', JSON.stringify(Array.from(smallArray)));
                    localStorage.setItem('cartName', "GENESIS_SAVESTATE");
                }

                console.log("[GenesisOrchestrator] State Saved.");
            } catch (err) {
                console.error("[GenesisOrchestrator] Save State failed:", err);
            }
        }
    }

    async loadState() {
        if (this.isRunning && this.bus.cartridge) { 
            try {
                const state = await this.serializer.load("GENESIS_SAVESTATE");
                if (!state) return;

                // Restore M68K
                if (this.m68k.deserializeState && state.m68k) {
                    this.m68k.deserializeState(state.m68k);
                }

                // Restore VDP
                if (this.vdp.deserializeState && state.vdp) {
                    this.vdp.deserializeState(state.vdp);
                }

                // Restore MMU and Mapper
                this.bus.workRam.set(state.mmu.workRam);
                
                if (this.bus.mapper && state.mapper) {
                    this.bus.mapper.deserializeState(state.mapper);
                }

                // Restore PSG
                if (this.psg.deserializeState && state.psg) {
                    this.psg.deserializeState(state.psg);
                }

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
        
        if (deltaTime > 100) {
            deltaTime = targetFrameTime;
        }
        
        this.lastTime = currentTime;
        this.accumulatedTime += deltaTime;

        if (this.accumulatedTime > targetFrameTime * 2) {
            this.accumulatedTime = targetFrameTime * 2;
        }

        if (window.UniversalInput) {
            this.isRewinding = window.UniversalInput.isPressed("REWIND");
            this.fastForward = window.UniversalInput.isPressed("FAST_FORWARD");
        }

        let framesRun = 0;

        if (this.fastForward) {
            for (let i = 0; i < 3; i++) {
                this.executeFrame(targetFps, true);
                framesRun++;
            }
            this.executeFrame(targetFps, false);
            this.accumulatedTime = 0; 
        } else {
            let framesToRun = Math.floor(this.accumulatedTime / targetFrameTime);
            this.accumulatedTime %= targetFrameTime;

            for (let i = 0; i < framesToRun; i++) {
                const isLastFrame = (i === framesToRun - 1);
                const skipRendering = !isLastFrame && (framesToRun > 1);

                this.executeFrame(targetFps, skipRendering);
                framesRun++;
            }
        }

        if (currentTime - this.fpsTimer >= 1000) {
            if (this.onFpsUpdate) {
                this.onFpsUpdate(this.fastForward ? "FFWD" : this.fpsCount);
            }
            this.fpsCount = 0;
            this.fpsTimer = currentTime;
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    executeFrame(targetFps, skipRendering = false) {
        const totalScanlines = this.tvStandard === 1 ? 312 : 262;
        const activeHeight = this.vdp.v30Enabled ? 240 : 224;
        const masterClockSpeed = this.tvStandard === 1 ? 53203424 : 53693175;
        
        const m68kClockSpeed = Math.floor(masterClockSpeed / 7);
        const m68kCyclesPerScanline = Math.floor((m68kClockSpeed / targetFps) / totalScanlines);

        const dummyCallback = () => {};
        const renderCallback = skipRendering ? dummyCallback : (user_data, line, pixels, shadowMap, w, h) => {
            this.renderScanline(line, pixels, shadowMap, w, h);
        };

        for (let scanline = 0; scanline < totalScanlines; scanline++) {
            this.currentScanline = scanline;
            this.vdp.currentScanlineIndex = scanline < activeHeight ? scanline : 0;

            if (scanline < activeHeight) {
                this.vdp.currentlyInVblank = false;
                this.vdp.beginScanline();

                this.stepCPUs(Math.floor(m68kCyclesPerScanline / 2));

                this.vdp.endScanline(scanline, renderCallback, null);

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
        
        // Push-Based Audio Optimization: Synthesize and push frames to UniversalAudioProcessor
        if (!this.isPaused) {
            this.tempPsg.fill(0); // CRITICAL Fix: Zero-out PSG additive buffer to prevent "piiiii" tone saturation

            this.psg.update(this.tempPsg, this.samplesPerFrame);
            this.fm.outputSamples(this.tempFm, this.samplesPerFrame);

            for (let i = 0; i < this.samplesPerFrame; i++) {
                const fmIdx = i * 2;
                this.transferBufferL[i] = (this.tempFm[fmIdx] / 32768.0) + (this.tempPsg[i] / 32768.0);
                this.transferBufferR[i] = (this.tempFm[fmIdx + 1] / 32768.0) + (this.tempPsg[i] / 32768.0);
            }
            this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
        }
        
        if (!skipRendering) {
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
        }

        this.rewindFrameCount++;
        if (this.rewindFrameCount >= 6 && !skipRendering) {
            this.captureRewindState();
            this.rewindFrameCount = 0;
        }

        this.framesRendered++;
        this.fpsCount++; 
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
        
        // Sound Synchronization Fix: Tick internal FM timers cycle-by-cycle (Crucial)
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
        
        // Sound Synchronization Fix: Tick internal FM timers
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
        const destOffset32 = line * width;
        const glb32 = this.glbFrameBuffer32;

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

            glb32[destOffset32 + i] = r | (g << 8) | (b << 16) | 0xff000000;
        }
    }
}