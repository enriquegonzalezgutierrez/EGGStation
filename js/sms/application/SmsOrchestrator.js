/**
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/application/SmsOrchestrator.js
 * 
 * ROLE:
 * Application Layer: Sega Master System (SMS) Orchestrator.
 * Coordinates system execution loops, schedules frame sync rates, and handles
 * pre-allocated state pools to achieve zero Garbage Collection allocations.
 * 
 * APPLIED OPTIMIZATIONS:
 * 1. 32-Bit VDP Graphics Pipeline: Overrides legacy drawLineTile and drawSpriteSlice 
 *    with packed 32-bit word writes (Uint32Array), speeding up video rendering.
 * 2. Death Spiral Protection: Caps the Delta-Time accumulator to prevent the 
 *    browser from crashing on older CPUs attempting to catch up with heavy lag.
 * 3. Fast-Forward Support: Accurately disables audio and pushes execution 
 *    cycles while correctly displaying "FFWD" on the UI counter.
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

        // Structured FPS counters aligned to 1-second real-world intervals
        this.fpsCount = 0;
        this.fpsTimer = 0;

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
        
        // Bind directly to the clean generic database client
        this.serializer = new IndexedDbManager(); 

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

    async loadRom(filename, arrayBuffer) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        this.cartridge = new SegaMasterSystemCartridge(filename);
        this.cartridge.load(arrayBuffer);
        
        this.vdp = new Sega315_5124_Vdp(this.vdpMode, this.glContext);
        
        // Inject 32-bit graphics acceleration patch into VDP
        this.injectOptimizedSmsVdp(this.vdp);

        // Instantiate the shared SegaPsg uncoupled audio core synchronously
        this.psg = new SegaPsg();
        
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
        this.accumulatedTime = 0.0;
        this.fpsCount = 0;
        this.fpsTimer = this.lastTime;

        console.log("[SmsOrchestrator] Engine Booted Successfully.");

        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    /**
     * Monkey-patches the standard Sega VDP class instances to support 
     * packed 32-bit color writes (Uint32Array) on scanline render passes.
     */
    injectOptimizedSmsVdp(vdpInstance) {
        vdpInstance.glbFrameBuffer32 = new Uint32Array(vdpInstance.glbFrameBuffer.buffer);

        // 1. Optimize Background Tile Line Renderer
        vdpInstance.drawLineTile = function(addr, x, y, pal, fliph, flipv, finescrolly, priFlag) {
            const offset = flipv ? (7 - ((y + finescrolly) % 8)) : ((y + finescrolly) % 8);
            const tileRowAddr = addr + (offset * 4);

            const byte0 = this.vRam[tileRowAddr];
            const byte1 = this.vRam[tileRowAddr + 1];
            const byte2 = this.vRam[tileRowAddr + 2];
            const byte3 = this.vRam[tileRowAddr + 3];

            const palOffset = pal * 16;
            let bufferIndex32 = x + (y * this.glbResolutionX);

            for (let xt = 0; xt < 8; xt++) {
                const shift = fliph ? xt : (7 - xt);
                const cramIdx = (((byte0 >> shift) & 1) | 
                                 (((byte1 >> shift) & 1) << 1) | 
                                 (((byte2 >> shift) & 1) << 2) | 
                                 (((byte3 >> shift) & 1) << 3)) & 0x0f;

                const colorValue = this.colorRam[cramIdx + palOffset];
                const xtile = x + xt;

                if (xtile >= 0 && xtile < 256 && y >= 0 && y < this.yScreenLines) {
                    const r = this.analogColorScale[colorValue & 0x03];
                    const g = this.analogColorScale[(colorValue & 0x0c) >> 2];
                    const b = this.analogColorScale[(colorValue & 0x30) >> 4];

                    // Write whole pixel in one single 32-bit packed word operation (ABGR format)
                    this.glbFrameBuffer32[bufferIndex32] = r | (g << 8) | (b << 16) | 0xff000000;
                    this.priBuffer[xtile + (y * this.glbResolutionX)] = (cramIdx !== 0) ? priFlag : 0;
                }
                
                bufferIndex32++; 
            }
        };

        // 2. Optimize Sprite Slice Renderer
        vdpInstance.drawSpriteSlice = function(addr, spriteX, scanlineNum, slicey) {
            const tileRowAddr = this.spritePatternGeneratorBaseAddress + addr + (slicey * 4);

            const byte0 = this.vRam[tileRowAddr];
            const byte1 = this.vRam[tileRowAddr + 1];
            const byte2 = this.vRam[tileRowAddr + 2];
            const byte3 = this.vRam[tileRowAddr + 3];

            for (let xt = 0; xt < 8; xt++) {
                const shift = 7 - xt;
                const cramIdx = (((byte0 >> shift) & 1) | 
                                 (((byte1 >> shift) & 1) << 1) | 
                                 (((byte2 >> shift) & 1) << 2) | 
                                 (((byte3 >> shift) & 1) << 3)) & 0x0f;

                if (cramIdx !== 0) {
                    const colorValue = this.colorRam[cramIdx + 16];
                    const cx = spriteX + xt;

                    if (cx >= 0 && cx < this.glbResolutionX && scanlineNum >= 0 && scanlineNum < this.yScreenLines) {
                        const linearIndex = cx + (scanlineNum * this.glbResolutionX);
                        
                        if (this.spriteBuffer[linearIndex] === 0) {
                            this.spriteBuffer[linearIndex] = 1;
                        } else {
                            this.statusFlags |= 0x20; 
                        }

                        if (this.priBuffer[linearIndex] === 0) {
                            const r = this.analogColorScale[colorValue & 0x03];
                            const g = this.analogColorScale[(colorValue & 0x0c) >> 2];
                            const b = this.analogColorScale[(colorValue & 0x30) >> 4];
                            
                            // Write Sprite pixel using 32-bit packed operations
                            this.glbFrameBuffer32[linearIndex] = r | (g << 8) | (b << 16) | 0xff000000;
                        }
                    }
                }
            }
        };

        // 3. Optimize Scanline Overscan Masking and Blanks
        vdpInstance.drawScanline = function(scanlineNum) {
            if (scanlineNum < 0 || scanlineNum >= this.yScreenLines) return;

            const fbY32 = scanlineNum * this.glbResolutionX;

            if (!(this.register01 & 0x40)) { // Screen blanked (Register 1, Bit 6)
                this.glbFrameBuffer32.fill(0, fbY32, fbY32 + 256);
                return;
            }

            // Draw Background Layer
            if ((this.register00 & 0x04) !== 0) {
                VdpMode4Renderer.renderScanline(this, scanlineNum);
            } else if ((this.register00 & 0x02) !== 0) {
                VdpMode2Renderer.renderScanline(this, scanlineNum);
            }

            // Draw Sprite Layer
            if ((this.register00 & 0x04) !== 0) {
                VdpSpriteManager.drawMode4(this, scanlineNum);
            } else if ((this.register00 & 0x02) !== 0) {
                VdpSpriteManager.drawMode2(this, scanlineNum);
            }

            // Overscan Border Masking (Register 0, Bit 5)
            if (this.register00 & 0x20) {
                const oscol = this.colorRam[(this.register07 & 0x0f) + 16];
                const r = this.analogColorScale[oscol & 0x03];
                const g = this.analogColorScale[(oscol & 0x0c) >> 2];
                const b = this.analogColorScale[(oscol & 0x30) >> 4];
                const border32 = r | (g << 8) | (b << 16) | 0xff000000;

                let borderOffset32 = scanlineNum * this.glbResolutionX;
                for (let x = 0; x < 8; x++) {
                    this.glbFrameBuffer32[borderOffset32] = border32;
                    borderOffset32++;
                }
            }
        };
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

    triggerPauseButton() {
        if (this.cpu && this.isRunning) {
            this.cpu.raiseNMI(); 
        }
    }

    /**
     * Self-serialize standard engine properties to be handled by the Database Client.
     */
    async saveState() {
        if (this.isRunning && this.cartridge) {
            try {
                // Collect mapper slots indices directly from DOM mapping
                const slotsIndices = [-1, -1, -1];
                if (this.mmu.mapper && this.mmu.mapper.romBanks) {
                    for (let i = 0; i < 3; i++) {
                        slotsIndices[i] = this.mmu.mapper.romBanks.indexOf(this.mmu.mapper.mapperSlots[i]);
                    }
                }

                const statePayload = {
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
                        colorRam: new Uint8Array(this.vdp.colorRam),
                        vRam: new Uint8Array(this.vdp.vRam),
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
                        cartridgeRam: this.mmu.mapper.cartridgeRam ? new Uint8Array(this.mmu.mapper.cartridgeRam) : null,
                        slotsIndices: slotsIndices
                    },
                    psg: {
                        volregister: [...this.psg.volregister],
                        toneregister: [...this.psg.toneregister],
                        wavePos: [...this.psg.wavePos],
                        chan2belatched: this.psg.chan2belatched,
                        what2latch: this.psg.what2latch,
                        latch: this.psg.latch,
                        internalClock: this.psg.internalClock,
                        internalClockPos: this.psg.internalClockPos
                    }
                };

                await this.serializer.save(this.cartridge.cartridgeName, statePayload);

                // Save UI snapshot thumbnail to localStorage
                if (this.vdp.glbFrameBuffer) {
                    const smallArray = Array.from(this.vdp.glbFrameBuffer);
                    localStorage.setItem('savestateScreenshot', JSON.stringify(smallArray));
                    localStorage.setItem('cartName', this.cartridge.cartridgeName);
                }

                console.log("[SmsOrchestrator] State Saved.");
            } catch (err) {
                console.error("[SmsOrchestrator] Save State failed:", err);
            }
        }
    }

    /**
     * Load and reconstruct serialized state values directly.
     */
    async loadState() {
        if (this.isRunning && this.cartridge) {
            try {
                const state = await this.serializer.load(this.cartridge.cartridgeName);
                if (!state) {
                    console.error(`[SmsOrchestrator] No saved state found for [${this.cartridge.cartridgeName}]`);
                    return;
                }

                // 1. Reconstitute CPU State
                Object.assign(this.cpu.registers, state.cpu.registers);
                Object.assign(this.cpu.shadowRegisters, state.cpu.shadowRegisters);
                this.cpu.maskableInterruptsEnabled = state.cpu.maskableInterruptsEnabled;
                this.cpu.maskableInterruptWaiting = state.cpu.maskableInterruptWaiting;
                this.cpu.interruptMode = state.cpu.interruptMode;
                this.cpu.totCycles = state.cpu.totCycles;
                this.cpu.NMIWaiting = state.cpu.NMIWaiting;
                this.cpu.m_bAfterEI = state.cpu.m_bAfterEI;

                // 2. Reconstitute VDP State
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

                // 3. Reconstitute Memory Bus State
                this.mmu.systemWorkRam.set(state.mmu.systemWorkRam);
                if (state.mmu.cartridgeRam && this.mmu.mapper?.cartridgeRam) {
                    this.mmu.mapper.cartridgeRam.set(state.mmu.cartridgeRam);
                }
                if (this.mmu.mapper) {
                    this.mmu.mapper.mapperSlot2IsCartridgeRam = state.mmu.mapperSlot2IsCartridgeRam;
                    const slotIndices = state.mmu.slotsIndices;
                    if (slotIndices[0] !== -1) this.mmu.mapper.mapperSlots[0] = this.mmu.mapper.romBanks[slotIndices[0]];
                    if (slotIndices[1] !== -1) this.mmu.mapper.mapperSlots[1] = this.mmu.mapper.romBanks[slotIndices[1]];
                    if (slotIndices[2] !== -1) this.mmu.mapper.mapperSlots[2] = this.mmu.mapper.romBanks[slotIndices[2]];
                }

                // 4. Reconstitute PSG Audio State
                this.psg.volregister = state.psg.volregister;
                this.psg.toneregister = state.psg.toneregister;
                this.psg.wavePos = state.psg.wavePos;
                this.psg.chan2belatched = state.psg.chan2belatched;
                this.psg.what2latch = state.psg.what2latch;
                this.psg.latch = state.psg.latch;
                this.psg.internalClock = state.psg.internalClock;
                this.psg.internalClockPos = state.psg.internalClockPos;

                this.psg.syncWorkletState();
                this.rewindActiveCount = 0;
                this.rewindHistoryPointer = 0;

                // Recalculate voice steps
                for (let i = 0; i < 4; i++) {
                    this.psg.recalculateVoiceStep(i);
                }

                console.log("[SmsOrchestrator] State Loaded.");
            } catch (err) {
                console.error("[SmsOrchestrator] Load State failed:", err);
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
        
        // Only copy Cartridge RAM if the active cartridge mapper supports it
        if (this.mmu.mapper.cartridgeRam) {
            state.mmu.cartridgeRam.set(this.mmu.mapper.cartridgeRam);
        }
        
        state.mmu.mapperSlot2IsCartridgeRam = this.mmu.mapperSlot2IsCartridgeRam;

        if (state.mmu.slot0Idx !== -1) this.mmu.mapper.mapperSlots[0] = this.mmu.mapper.romBanks[state.mmu.slot0Idx];
        if (state.mmu.slot1Idx !== -1) this.mmu.mapper.mapperSlots[1] = this.mmu.mapper.romBanks[state.mmu.slot1Idx];
        if (state.mmu.slot2Idx !== -1) this.mmu.mapper.mapperSlots[2] = this.mmu.mapper.romBanks[state.mmu.slot2Idx];

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
        
        // Only restore Cartridge RAM if the active cartridge mapper supports it
        if (state.mmu.cartridgeRam && this.mmu.mapper?.cartridgeRam) {
            this.mmu.mapper.cartridgeRam.set(state.mmu.cartridgeRam);
        }
        
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

        // Update emulator shortcut states dynamically from UniversalInput
        this.isRewinding = window.UniversalInput ? window.UniversalInput.isPressed("REWIND") : false;
        this.fastForward = window.UniversalInput ? window.UniversalInput.isPressed("FAST_FORWARD") : false;

        // Handle active rewinding
        if (this.isRewinding) {
            if (this.psg) {
                this.psg.setMuted(true);
            }
            
            if (this.rewindActiveCount > 0) {
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

        let elapsed = currentTime - this.lastTime;
        
        // Prevent massive time jumps when switching browser tabs
        if (elapsed > 100) {
            elapsed = 100;
        }

        this.lastTime = currentTime;
        this.accumulatedTime += elapsed;

        // CRITICAL OPTIMIZATION (Spiral of Death Protection):
        // If the CPU is too slow to maintain full speed, cap the accumulator 
        // to prevent the loop from trying to process too many frames at once and crashing the tab.
        if (this.accumulatedTime > targetFrameTime * 2) {
            this.accumulatedTime = targetFrameTime * 2;
        }

        let framesRun = 0;

        if (this.fastForward) {
            // Fast-Forward Logic: Accelerate execution and disable audio processing
            if (this.psg) this.psg.setMuted(true);
            for (let i = 0; i < 3; i++) {
                this.executeFrame(targetFps);
                this.fpsCount++;
                framesRun++;
            }
            this.accumulatedTime = 0; // Clear accumulator to prevent stuttering when releasing the button
        } else {
            // Normal Execution
            if (this.psg) this.psg.setMuted(false);
            while (this.accumulatedTime >= targetFrameTime) {
                this.executeFrame(targetFps);
                this.accumulatedTime -= targetFrameTime;
                this.fpsCount++;
                framesRun++;
            }
        }

        // Only draw the frame if execution actually stepped forward
        if (framesRun > 0 && !this.isPaused) {
            this.vdp.hyperBlit(this.videoContext, this.postProcessMode);
            
            if (!this.fastForward) {
                this.rewindFrameCount++;
                if (this.rewindFrameCount >= 6) {
                    this.captureRewindState();
                    this.rewindFrameCount = 0;
                }
            }
        }

        // True 1-second interval tracker for standard non-flickering FPS diagnostics
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

    // ========================================================================
    // DEVELOPER SUITE DIAGNOSTICS HOOKS (PHASE 4)
    // ========================================================================

    /**
     * Return current Z80 CPU registers as a polymorphic dictionary.
     */
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

    /**
     * Return the active program disassembly around PC as a string array.
     */
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
     * Render raw VRAM tile patterns onto the shared diagnostic canvas.
     */
    drawVramDiagnostics(ctx) {
        this.rasterizeVramTiles(ctx);
    }
}