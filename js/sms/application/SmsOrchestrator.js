/**
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/application/SmsOrchestrator.js
 * 
 * ROLE:
 * Application Layer: Sega Master System (SMS) Orchestrator.
 * Coordinates system execution loops, schedules frame sync rates, and handles
 * hardware component lifecycles.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Acts as the system's conductor. 
 *   It manages the main loop and browser API interactions, delegating 
 *   all hardware logic to the Wasm-backed Domain layers.
 */

class SmsOrchestrator {
    /**
     * @param {CanvasRenderingContext2D} videoContext
     * @param {WebGL2RenderingContext} glContext
     * @param {Function} onFpsUpdate
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
        
        this.postProcessMode = 0;
        this.audioFilterMode = 0;

        this.SMS_NTSC_FPS = 59.922743;
        this.SMS_PAL_FPS = 49.701459;
        this.vdpMode = 0; 
        
        this.animationFrameId = null;
        this.lastTime = 0;
        this.accumulatedTime = 0.0;

        this.fpsCount = 0;
        this.fpsTimer = 0;

        this.rewindFrameCount = 0;
        this.breakpointAddress = null;

        this.cpu = null;
        this.mmu = null;
        this.vdp = null;
        this.psg = null;
        this.cartridge = null;
        
        // The I/O Controller is a Wasm-backed Proxy
        this.ioController = new Sega315_5297();
        
        this.serializer = new IndexedDbManager(); 

        this.loop = this.loop.bind(this);
    }

    setVdpMode(mode) {
        this.vdpMode = (mode === "PAL") ? 1 : 0;
    }

    setPostProcessMode(mode) {
        this.postProcessMode = mode;
    }

    setAudioFilterMode(mode) {
        this.audioFilterMode = mode;
        if (this.psg && this.isRunning) {
            this.psg.setAudioFilter(mode);
        }
    }

    setAudioEnabled(enabled) {
        if (this.psg) {
            this.psg.setAudioEnabled(enabled);
        }
    }

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.vdp && this.vdp.postProcessor) {
            this.vdp.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    /**
     * Primary entry point to boot a game.
     */
    async loadRom(filename, arrayBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // 1. Initialize and Await the Wasm Cartridge/Mapper
        this.cartridge = new SegaMasterSystemCartridge(filename);
        await this.cartridge.load(arrayBuffer);
        
        // 2. Instantiate Wasm-backed Peripherals
        this.vdp = new Sega315_5124_Vdp(this.vdpMode, this.glContext);
        this.psg = new SegaPsg();
        
        // 3. Assemble the System Bus and CPU
        this.mmu = new SegaMasterSystemBus(this.cartridge, this.vdp, this.psg, this.ioController);
        this.cpu = new ZilogZ80(this.mmu);
        
        // 4. Start the Audio DSP Mixer
        await this.psg.startMix(this.cpu);
        this.psg.setAudioFilter(this.audioFilterMode);

        // 5. System State Initialization
        this.isRunning = true;
        this.isPaused = false;
        this.isRewinding = false;
        this.isDebugging = false;
        this.breakpointAddress = null;
        
        this.lastTime = performance.now();
        this.accumulatedTime = 0.0;
        this.fpsCount = 0;
        this.fpsTimer = this.lastTime;

        console.log("[SmsOrchestrator] SMS Engine Boot Sequence Complete.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.psg && this.psg.context && this.psg.context.state !== 'closed') {
            this.psg.context.close().catch(() => {});
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

    /**
     * Primary loop synchronization method.
     */
    loop(currentTime) {
        if (!this.isRunning || this.isPaused || this.isDebugging) {
            if (this.psg) this.psg.setMuted(true);
            if (this.isDebugging) {
                this.lastTime = currentTime;
                this.animationFrameId = requestAnimationFrame(this.loop);
            }
            return;
        }

        this.isRewinding = window.UniversalInput ? window.UniversalInput.isPressed("REWIND") : false;
        this.fastForward = window.UniversalInput ? window.UniversalInput.isPressed("FAST_FORWARD") : false;

        if (this.isRewinding) {
            this.lastTime = currentTime;
            this.animationFrameId = requestAnimationFrame(this.loop);
            return;
        }

        const targetFps = (this.vdpMode === 1) ? this.SMS_PAL_FPS : this.SMS_NTSC_FPS;
        const targetFrameTime = 1000 / targetFps;

        let elapsed = currentTime - this.lastTime;
        if (elapsed > 100) elapsed = 100;

        this.lastTime = currentTime;
        this.accumulatedTime += elapsed;

        if (this.accumulatedTime > targetFrameTime * 2) {
            this.accumulatedTime = targetFrameTime * 2;
        }

        let framesRun = 0;

        if (this.fastForward) {
            if (this.psg) this.psg.setMuted(true);
            for (let i = 0; i < 3; i++) {
                this.executeFrame(targetFps);
                this.fpsCount++;
                framesRun++;
            }
            this.accumulatedTime = 0;
        } else {
            if (this.psg) this.psg.setMuted(false);
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
                this.fpsCount++;
                framesRun++;
            }
        }

        if (framesRun > 0 && !this.isPaused) {
            // High-performance blit handled by the Wasm-backed VDP
            this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
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

    executeFrame(targetFps) {
        // SYNC HARDWARE INPUT PINS FROM UNIVERSAL INPUT SERVICE
        const io = this.ioController;
        if (io && window.UniversalInput) {
            if (window.UniversalInput.isPressed("UP")) io.pressUp(); else io.depressUp();
            if (window.UniversalInput.isPressed("DOWN")) io.pressDown(); else io.depressDown();
            if (window.UniversalInput.isPressed("LEFT")) io.pressLeft(); else io.depressLeft();
            if (window.UniversalInput.isPressed("RIGHT")) io.pressRight(); else io.depressRight();
            if (window.UniversalInput.isPressed("B")) io.pressButton1(); else io.depressButton1();
            if (window.UniversalInput.isPressed("A")) io.pressButton2(); else io.depressButton2();
        }

        let emulatedCycles = 0;
        let targetCycles = Math.floor(this.cpu.clockRate / targetFps);

        // Dynamic Rate Control (DRC)
        if (this.psg && this.psg.audioInitialized && !this.fastForward) {
            const drift = this.psg.getClockDrift();
            const targetDrift = this.psg.multiplier * this.psg.audioBufSize * 1.5;
            const error = targetDrift - drift;
            let adjustment = error * 0.003;
            const maxAdjustment = targetCycles * 0.08;
            if (adjustment > maxAdjustment) adjustment = maxAdjustment;
            if (adjustment < -maxAdjustment) adjustment = -maxAdjustment;
            targetCycles += Math.floor(adjustment);
        }

        while (emulatedCycles < targetCycles) {
            const cyclesElapsed = this.cpu.executeOne();
            if (!this.fastForward) {
                this.psg.step(this.cpu.totCycles);
            }
            // Wasm VDP processes timing and rasterization natively
            this.vdp.update(this.cpu, cyclesElapsed);
            emulatedCycles += cyclesElapsed;
        }
    }

    // ========================================================================
    // ENCAPSULATED STATE SERIALIZATION FOR SAVESTATES (SOLID)
    // ========================================================================

    async saveState() {
        if (!this.isRunning || !this.cpu) return;

        try {
            const statePayload = {
                cpu: {
                    pc: this.cpu.registers.pc,
                    sp: this.cpu.registers.sp,
                    af: this.cpu.registers.af,
                    bc: this.cpu.registers.bc,
                    de: this.cpu.registers.de,
                    hl: this.cpu.registers.hl,
                    ix: this.cpu.registers.ix,
                    iy: this.cpu.registers.iy
                },
                vdp: {
                    vram: Array.from(this.vdp.vRam),
                    cram: Array.from(this.vdp.colorRam),
                    regs: Array.from(this.vdp.registers),
                    // Internal state fields
                    scanlineIdx: this.vdp.currentScanlineIndex,
                    lineCnt: this.vdp.lineCounter,
                    ctrlFlag: this.vdp.controlWordFlag,
                    ctrlWord: this.vdp.controlWord,
                    dataAddr: this.vdp.dataPortReadWriteAddress,
                    writeMode: this.vdp.dataPortWriteMode,
                    readBuf: this.vdp.readBufferByte,
                    status: this.vdp.statusFlags
                },
                psg: this.psg ? this.psg.serializeState() : null,
                io: {
                    dc: this.ioController.readRegisterDC(),
                    dd: this.ioController.readRegisterDD()
                },
                mmu: {
                    workRam: Array.from(this.mmu.systemWorkRam)
                }
            };

            await this.serializer.save("SMS_SAVESTATE", statePayload);

            // Generate downsampled screenshot for the save state preview
            if (this.vdp && this.vdp.glbFrameBuffer) {
                const src = this.vdp.glbFrameBuffer;
                const dstWidth = 128;
                const dstHeight = 120;
                const smallArray = new Uint8Array(dstWidth * dstHeight * 4);
                const activeHeight = this.vdp.yScreenLines;
                
                for (let y = 0; y < dstHeight; y++) {
                    const srcY = Math.floor(y * (activeHeight / dstHeight)) * 256 * 4; 
                    const dstY = y * dstWidth * 4;
                    for (let x = 0; x < dstWidth; x++) {
                        const srcX = Math.floor(x * (256 / dstWidth)) * 4; 
                        const srcIdx = srcY + srcX;
                        const dstIdx = dstY + (x * 4);
                        
                        smallArray[dstIdx] = src[srcIdx];
                        smallArray[dstIdx + 1] = src[srcIdx + 1];
                        smallArray[dstIdx + 2] = src[srcIdx + 2];
                        smallArray[dstIdx + 3] = 255;
                    }
                }

                localStorage.setItem('savestateScreenshot', JSON.stringify(Array.from(smallArray)));
                localStorage.setItem('cartName', "SMS_SAVESTATE");
            }

            console.log("[SmsOrchestrator] SMS State Saved Successfully.");
        } catch (err) {
            console.error("[SmsOrchestrator] Save State failed:", err);
        }
    }

    async loadState() {
        if (!this.isRunning || !this.cpu) return;

        try {
            const state = await this.serializer.load("SMS_SAVESTATE");
            if (!state) {
                console.warn("[SmsOrchestrator] No save state found to load.");
                return;
            }

            // 1. Restore CPU Registers
            this.cpu.registers.pc = state.cpu.pc;
            this.cpu.registers.sp = state.cpu.sp;
            this.cpu.registers.af = state.cpu.af;
            this.cpu.registers.bc = state.cpu.bc;
            this.cpu.registers.de = state.cpu.de;
            this.cpu.registers.hl = state.cpu.hl;
            this.cpu.registers.ix = state.cpu.ix;
            this.cpu.registers.iy = state.cpu.iy;

            // 2. Restore VDP memory and registers
            this.vdp.vRam.set(state.vdp.vram);
            this.vdp.colorRam.set(state.vdp.cram);
            this.vdp.registers.set(state.vdp.regs);
            
            // Restore VDP Internal state fields
            this.vdp.currentScanlineIndex = state.vdp.scanlineIdx;
            this.vdp.lineCounter = state.vdp.lineCnt;
            this.vdp.controlWordFlag = state.vdp.ctrlFlag;
            this.vdp.controlWord = state.vdp.ctrlWord;
            this.vdp.dataPortReadWriteAddress = state.vdp.dataAddr;
            this.vdp.dataPortWriteMode = state.vdp.writeMode;
            this.vdp.readBufferByte = state.vdp.readBuf;
            this.vdp.statusFlags = state.vdp.status;

            // 3. Restore PSG state
            if (this.psg && state.psg) {
                this.psg.deserializeState(state.psg);
            }

            // 4. Restore I/O state
            this.ioController.syncFromRewind(state.io.dc, state.io.dd);

            // 5. Restore MMU RAM
            this.mmu.systemWorkRam.set(state.mmu.workRam);

            console.log("[SmsOrchestrator] SMS State Loaded Successfully.");
        } catch (err) {
            console.error("[SmsOrchestrator] Load State failed:", err);
        }
    }

    // --- Developer Suite Hooks ---
    getRegisters() {
        if (!this.cpu) return {};
        const reg = this.cpu.registers;
        return {
            AF: reg.af.toString(16).toUpperCase().padStart(4, '0'),
            BC: reg.bc.toString(16).toUpperCase().padStart(4, '0'),
            DE: reg.de.toString(16).toUpperCase().padStart(4, '0'),
            HL: reg.hl.toString(16).toUpperCase().padStart(4, '0'),
            IX: reg.ix.toString(16).toUpperCase().padStart(4, '0'),
            IY: reg.iy.toString(16).toUpperCase().padStart(4, '0'),
            SP: reg.sp.toString(16).toUpperCase().padStart(4, '0'),
            PC: reg.pc.toString(16).toUpperCase().padStart(4, '0')
        };
    }

    getDisassembly() {
        if (!this.cpu) return [];
        const lines = [];
        const instructions = Z80Disassembler.disassembleBlock(this.cpu, 5);
        instructions.forEach(instr => {
            const hexAddr = instr.address.toString(16).toUpperCase().padStart(4, '0');
            lines.push(`${hexAddr}: ${instr.decodedString}`);
        });
        return lines;
    }

    /**
     * Decode 4bpp planar patterns inside Master System VRAM directly from WebAssembly memory
     * to render the 16x24 diagnostic tile grid on the developer canvas.
     */
    rasterizeVramTiles(ctx) {
        if (!this.vdp || !this.vdp.isInitialized) return;
        
        const imgData = ctx.createImageData(128, 192); 
        const vram = this.vdp.vRam; 

        for (let tileIdx = 0; tileIdx < 384; tileIdx++) {
            const tileX = tileIdx % 16;
            const tileY = Math.floor(tileIdx / 16);
            const destBaseX = tileX * 8;
            const destBaseY = tileY * 8;

            for (let row = 0; row < 8; row++) {
                const rowAddr = tileIdx * 32 + row * 4;
                const byte0 = vram[rowAddr];
                const byte1 = vram[rowAddr + 1];
                const byte2 = vram[rowAddr + 2];
                const byte3 = vram[rowAddr + 3];

                for (let col = 0; col < 8; col++) {
                    const shift = 7 - col;
                    const colorIdx = (((byte0 >> shift) & 1) |
                                     (((byte1 >> shift) & 1) << 1) |
                                     (((byte2 >> shift) & 1) << 2) |
                                     (((byte3 >> shift) & 1) << 3)) & 0x0F;

                    const rgb = colorIdx * 17; 
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

    drawVramDiagnostics(ctx) {
        this.rasterizeVramTiles(ctx);
    }
}