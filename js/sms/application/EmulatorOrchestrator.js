/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Layer: Emulator Orchestrator (With GC-Free State Pools)
 * 
 * Coordinates system execution loops, schedules frame sync rates, and handles
 * pre-allocated state pools to achieve zero Garbage Collection allocations.
 */

class EmulatorOrchestrator {
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
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        // GC-Free Static Buffer Ring Pool for real-time rewinding
        this.maxRewindStates = 100; 
        this.rewindHistory = [];
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        
        this.initializeStatePool();

        this.rewindFrameCount = 0;
        this.breakpointAddress = null;

        this.cpu = null;
        this.mmu = null;
        this.vdp = null;
        this.psg = null;
        this.cartridge = null;
        
        this.ioController = new Sega315_5297();
        this.serializer = new WebIndexedDBSerializer(); 

        this.loop = this.loop.bind(this);
    }

    /**
     * Allocates memory buffers once during startup.
     * Eliminates garbage collection pressure entirely during gameplay.
     */
    initializeStatePool() {
        this.rewindHistory = [];
        for (let i = 0; i < this.maxRewindStates; i++) {
            this.rewindHistory[i] = {
                cpu: {
                    a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0,
                    shadow: { a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0 },
                    ix: 0, iy: 0, pc: 0, sp: 0, r: 0, i: 0,
                    iff1: 0, iff2: 0,
                    maskableInterruptsEnabled: false,
                    maskableInterruptWaiting: false,
                    interruptMode: 0,
                    totCycles: 0,
                    NMIWaiting: false,
                    m_bAfterEI: false
                },
                vdp: {
                    vRam: new Uint8Array(0x4000),
                    colorRam: new Uint8Array(0x20),
                    currentScanlineIndex: 0,
                    lineCounter: 0,
                    controlWordFlag: false,
                    controlWord: 0,
                    dataPortReadWriteAddress: 0,
                    dataPortWriteMode: 0,
                    readBufferByte: 0,
                    statusFlags: 0,
                    nameTableBaseAddress: 0,
                    spriteAttributeTableBaseAddress: 0,
                    spritePatternGeneratorBaseAddress: 0,
                    vcounter: 0,
                    hcounter: 0,
                    register00: 0, register01: 0, register02: 0, register03: 0,
                    register04: 0, register05: 0, register06: 0, register07: 0,
                    register08: 0, register09: 0, register0a: 0
                },
                mmu: {
                    systemWorkRam: new Uint8Array(0x2000),
                    mapperSlot2IsCartridgeRam: false,
                    cartridgeRam: new Uint8Array(0x8000),
                    slot0Idx: -1,
                    slot1Idx: -1,
                    slot2Idx: -1
                },
                psg: {
                    volregister: new Int16Array(4),
                    toneregister: new Int16Array(4),
                    wavePos: new Float32Array(4),
                    chan2belatched: 0,
                    what2latch: 0,
                    internalClock: 0,
                    internalClockPos: 0
                }
            };
        }
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

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.vdp && this.vdp.postProcessor) {
            this.vdp.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    async loadRom(filename, arrayBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        this.cartridge = new SegaMasterSystemCartridge(filename);
        this.cartridge.load(arrayBuffer);
        
        this.vdp = new Sega315_5124_Vdp(this.vdpMode, this.glContext);
        this.psg = new Sega315_5124_Psg();
        
        this.mmu = new SegaMasterSystemBus(this.cartridge, this.vdp, this.psg, this.ioController);
        this.cpu = new ZilogZ80(this.mmu);
        
        await this.psg.startMix(this.cpu);
        this.psg.setAudioFilter(this.audioFilterMode);

        this.isRunning = true;
        this.isPaused = false;
        this.isRewinding = false;
        this.isDebugging = false;
        this.breakpointAddress = null;
        
        this.rewindHistoryPointer = 0;
        this.rewindActiveCount = 0;
        this.rewindFrameCount = 0;

        this.lastTime = performance.now();
        this.accumulatedTime = 0;
        this.framesRendered = 0;

        this.animationFrameId = requestAnimationFrame(this.loop);
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
        if (this.cpu && this.isRunning) {
            this.cpu.raiseNMI(); 
        }
    }

    async saveState() {
        if (this.isRunning && this.cartridge) {
            try {
                await this.serializer.serialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
            } catch (err) {
                console.error("EmulatorOrchestrator::Save State failed:", err);
            }
        }
    }

    async loadState() {
        if (this.isRunning && this.cartridge) {
            try {
                const status = await this.serializer.deserialize(this.cartridge.cartridgeName, this.cpu, this.vdp, this.mmu, this.psg);
                if (status === 0 && this.psg) {
                    this.psg.syncWorkletState();
                    this.rewindActiveCount = 0;
                    this.rewindHistoryPointer = 0;
                }
            } catch (err) {
                console.error("EmulatorOrchestrator::Load State failed:", err);
            }
        }
    }

    /**
     * Copy state directly into pre-allocated memory buffers.
     * Avoids instantiation to secure smooth GC execution.
     */
    captureRewindState() {
        if (!this.isRunning || this.isPaused || this.isRewinding) return;

        const state = this.rewindHistory[this.rewindHistoryPointer];
        
        // 1. Copy CPU registers
        const r = this.cpu.registers;
        state.cpu.a = r.a; state.cpu.b = r.b; state.cpu.c = r.c; state.cpu.d = r.d;
        state.cpu.e = r.e; state.cpu.h = r.h; state.cpu.l = r.l; state.cpu.f = r.f;
        state.cpu.ix = r.ix; state.cpu.iy = r.iy; state.cpu.pc = r.pc; state.cpu.sp = r.sp;
        state.cpu.r = r.r; state.cpu.i = r.i;
        state.cpu.iff1 = r.iff1; state.cpu.iff2 = r.iff2;

        const sh = r.shadow;
        state.cpu.shadow.a = sh.a; state.cpu.shadow.b = sh.b; state.cpu.shadow.c = sh.c;
        state.cpu.shadow.d = sh.d; state.cpu.shadow.e = sh.e; state.cpu.shadow.h = sh.h;
        state.cpu.shadow.l = sh.l; state.cpu.shadow.f = sh.f;

        state.cpu.maskableInterruptsEnabled = this.cpu.maskableInterruptsEnabled;
        state.cpu.maskableInterruptWaiting = this.cpu.maskableInterruptWaiting;
        state.cpu.interruptMode = this.cpu.interruptMode;
        state.cpu.totCycles = this.cpu.totCycles;
        state.cpu.NMIWaiting = this.cpu.NMIWaiting;
        state.cpu.m_bAfterEI = this.cpu.m_bAfterEI;

        // 2. Copy VDP arrays using high-performance typed array copy
        state.vdp.colorRam.set(this.vdp.colorRam);
        state.vdp.vRam.set(this.vdp.vRam);
        state.vdp.currentScanlineIndex = this.vdp.currentScanlineIndex;
        state.vdp.lineCounter = this.vdp.lineCounter;
        state.vdp.controlWordFlag = this.vdp.controlWordFlag;
        state.vdp.controlWord = this.vdp.controlWord;
        state.vdp.dataPortReadWriteAddress = this.vdp.dataPortReadWriteAddress;
        state.vdp.dataPortWriteMode = this.vdp.dataPortWriteMode;
        state.vdp.readBufferByte = this.vdp.readBufferByte;
        state.vdp.statusFlags = this.vdp.statusFlags;
        state.vdp.nameTableBaseAddress = this.vdp.nameTableBaseAddress;
        state.vdp.spriteAttributeTableBaseAddress = this.vdp.spriteAttributeTableBaseAddress;
        state.vdp.spritePatternGeneratorBaseAddress = this.vdp.spritePatternGeneratorBaseAddress;
        state.vdp.vcounter = this.vdp.vcounter;
        state.vdp.hcounter = this.vdp.hcounter;

        state.vdp.register00 = this.vdp.register00; state.vdp.register01 = this.vdp.register01;
        state.vdp.register02 = this.vdp.register02; state.vdp.register03 = this.vdp.register03;
        state.vdp.register04 = this.vdp.register04; state.vdp.register05 = this.vdp.register05;
        state.vdp.register06 = this.vdp.register06; state.vdp.register07 = this.vdp.register07;
        state.vdp.register08 = this.vdp.register08; state.vdp.register09 = this.vdp.register09;
        state.vdp.register0a = this.vdp.register0a;

        // 3. Copy Memory Bus
        state.mmu.systemWorkRam.set(this.mmu.systemWorkRam);
        state.mmu.cartridgeRam.set(this.mmu.mapper.cartridgeRam);
        state.mmu.mapperSlot2IsCartridgeRam = this.mmu.mapper.mapperSlot2IsCartridgeRam;

        state.mmu.slot0Idx = this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[0]);
        state.mmu.slot1Idx = this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[1]);
        state.mmu.slot2Idx = this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[2]);

        // 4. Copy sound state using dynamic parameter assignments
        state.psg.volregister.set(this.psg.volregister);
        state.psg.toneregister.set(this.psg.toneregister);
        state.psg.wavePos.set(this.psg.wavePos);
        state.psg.chan2belatched = this.psg.chan2belatched;
        state.psg.what2latch = this.psg.what2latch;
        state.psg.internalClock = this.psg.internalClock;
        state.psg.internalClockPos = this.psg.internalClockPos;

        // Advance ring buffer pointers
        this.rewindHistoryPointer = (this.rewindHistoryPointer + 1) % this.maxRewindStates;
        this.rewindActiveCount = Math.min(this.maxRewindStates, this.rewindActiveCount + 1);
    }

    /**
     * Restore state from pre-allocated memory buffers.
     * @param {Object} state
     */
    restoreRewindState(state) {
        const r = this.cpu.registers;
        r.a = state.cpu.a; r.b = state.cpu.b; r.c = state.cpu.c; r.d = state.cpu.d;
        r.e = state.cpu.e; r.h = state.cpu.h; r.l = state.cpu.l; r.f = state.cpu.f;
        r.ix = state.cpu.ix; r.iy = state.cpu.iy; r.pc = state.cpu.pc; r.sp = state.cpu.sp;
        r.r = state.cpu.r; r.i = state.cpu.i;
        r.iff1 = state.cpu.iff1; r.iff2 = state.cpu.iff2;

        const sh = r.shadow;
        sh.a = state.cpu.shadow.a; sh.b = state.cpu.shadow.b; sh.c = state.cpu.shadow.c;
        sh.d = state.cpu.shadow.d; sh.e = state.cpu.shadow.e; sh.h = state.cpu.shadow.h;
        sh.l = state.cpu.shadow.l; sh.f = state.cpu.shadow.f;

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

        // Safely restore sound register arrays element-by-element to avoid type prototype conflicts
        for (let i = 0; i < 4; i++) {
            this.psg.volregister[i] = state.psg.volregister[i];
            this.psg.toneregister[i] = state.psg.toneregister[i];
            this.psg.wavePos[i] = state.psg.wavePos[i];
        }
        this.psg.chan2belatched = state.psg.chan2belatched;
        this.psg.what2latch = state.psg.what2latch;
        this.psg.internalClock = state.psg.internalClock;
        this.psg.internalClockPos = state.psg.internalClockPos;

        // Force PSG frequency step recalculation upon state restores
        for (let i = 0; i < 4; i++) {
            this.psg.recalculateVoiceStep(i);
        }
    }

    stepInstruction() {
        if (!this.isRunning || !this.cpu) return;
        const cycles = this.cpu.executeOne();
        this.psg.step(this.cpu.totCycles);
        this.vdp.update(this.cpu, cycles);
        this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
    }

    rasterizeVramTiles(ctx) {
        if (!this.vdp) return;
        
        const imgData = ctx.createImageData(128, 192); 
        const vram = this.vdp.vRam;
        const cram = this.vdp.colorRam;
        const scale = this.vdp.analogColorScale;

        for (let tileIdx = 0; tileIdx < 384; tileIdx++) { 
            const vramBase = tileIdx * 32;
            const tileY = Math.floor(tileIdx / 16);
            const tileX = tileIdx % 16;
            const destBaseY = tileY * 8;
            const destBaseX = tileX * 8;

            for (let row = 0; row < 8; row++) {
                const rowAddr = vramBase + (row * 4);
                
                const b0 = vram[rowAddr];
                const b1 = vram[rowAddr + 1];
                const b2 = vram[rowAddr + 2];
                const b3 = vram[rowAddr + 3];

                for (let col = 0; col < 8; col++) {
                    const shift = 7 - col;
                    const bit0 = (b0 >> shift) & 1;
                    const bit1 = (b1 >> shift) & 1;
                    const bit2 = (b2 >> shift) & 1;
                    const bit3 = (b3 >> shift) & 1;

                    const cramIdx = bit0 | (bit1 << 1) | (bit2 << 2) | (bit3 << 3);
                    const colorByte = cram[cramIdx]; 

                    const red = scale[colorByte & 0x03];
                    const green = scale[(colorByte & 0x0c) >> 2];
                    const blue = scale[(colorByte & 0x30) >> 4];

                    const pixelX = destBaseX + col;
                    const pixelY = destBaseY + row;
                    const destIdx = (pixelX + (pixelY * 128)) * 4;

                    imgData.data[destIdx] = red;
                    imgData.data[destIdx + 1] = green;
                    imgData.data[destIdx + 2] = blue;
                    imgData.data[destIdx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
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

        // Handle active rewinding
        if (this.isRewinding) {
            if (this.psg) this.psg.setMuted(true);
            
            if (this.rewindActiveCount > 0) {
                // Shift rewind history backward by 2 steps per frame
                for (let i = 0; i < 2; i++) {
                    if (this.rewindActiveCount > 0) {
                        this.rewindHistoryPointer = (this.rewindHistoryPointer - 1 + this.maxRewindStates) % this.maxRewindStates;
                        this.rewindActiveCount--;
                    }
                }
                const state = this.rewindHistory[this.rewindHistoryPointer];
                this.restoreRewindState(state);
                this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
            }
            this.lastTime = currentTime;
            this.animationFrameId = requestAnimationFrame(this.loop);
            return;
        }

        const targetFps = (this.vdpMode === 1) ? this.SMS_PAL_FPS : this.SMS_NTSC_FPS;
        const targetFrameTime = 1000 / targetFps;

        let deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        if (deltaTime > 100) {
            deltaTime = targetFrameTime;
        }

        if (this.fastForward) {
            if (this.psg) this.psg.setMuted(true);
            for (let i = 0; i < 4; i++) {
                this.executeFrame(targetFps);
            }
            this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
        } else {
            if (this.psg) this.psg.setMuted(false);
            this.accumulatedTime += deltaTime;
            
            let frameExecuted = false;
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
                frameExecuted = true;
            }
            
            if (frameExecuted) {
                this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
                
                this.rewindFrameCount++;
                if (this.rewindFrameCount >= 6) {
                    this.captureRewindState();
                    this.rewindFrameCount = 0;
                }
            }
        }

        this.framesRendered++;
        if (deltaTime > 0 && this.framesRendered % 10 === 0) {
            const currentFps = (1000 / deltaTime).toFixed(1);
            if (this.onFpsUpdate) this.onFpsUpdate(currentFps);
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    executeFrame(targetFps) {
        let emulatedCycles = 0;
        let targetCycles = Math.floor(this.cpu.clockRate / targetFps);

        // DRC closed-loop rate control calculation
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
            if (this.breakpointAddress !== null && this.cpu.registers.pc === this.breakpointAddress) {
                this.isDebugging = true;
                this.isPaused = false;
                window.dispatchEvent(new CustomEvent('debugger-break'));
                break;
            }

            const cyclesElapsed = this.cpu.executeOne();
            if (!this.fastForward) {
                this.psg.step(this.cpu.totCycles);
            }
            this.vdp.update(this.cpu, cyclesElapsed);
            emulatedCycles += cyclesElapsed;
        }
    }
}