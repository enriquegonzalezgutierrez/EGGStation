/**
 * Project: EGGStation - Super Nintendo (SNES) Application Layer
 * Author: Enrique González Gutiérrez
 * File: js/snes/application/SnesOrchestrator.js
 * 
 * ROLE:
 * Application Layer: SnesOrchestrator (High-Performance Revision)
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively coordinates execution loops, 
 *   cycles scheduling, and dynamic frameskip algorithms. Delegates state serialization 
 *   to individual hardware components (Cpu, Ppu, Apu) to decouple the persistence layer.
 */

class SnesOrchestrator {
    constructor(videoContext, glContext, fpsUpdateCallback) {
        this.hardware = new Snes();
        
        this.ctx = videoContext;
        this.gl = glContext;
        this.onFpsUpdate = fpsUpdateCallback;

        this.ctx.canvas.width = 512;
        this.ctx.canvas.height = 480;

        this.imgData = this.ctx.createImageData(512, 480);
        
        // 32-bit View for High-Performance Canvas Blitting
        this.imgData32 = new Uint32Array(this.imgData.data.buffer);

        this.postProcessor = new UniversalPostProcessor(this.gl);
        this.audioProcessor = new UniversalAudioProcessor();
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

        // Dynamic Frameskip Control Safeguard (SOLID SRP)
        this.lastFrameSkipped = false;

        this.injectOptimizedPixelCopier();

        this.serializer = new IndexedDbManager();

        console.log("[SnesOrchestrator] Orchestrator Layer Initialized with Audio-Safe Frameskip.");
    }

    /**
     * Highly optimized 32-bit packed word copier for the PPU.
     */
    injectOptimizedPixelCopier() {
        const targetBuffer32 = this.imgData32; 

        this.hardware.ppu.setPixels = function() {
            const frameOverscan = this.frameOverscan;
            const pixelOutput = this.pixelOutput;
            const evenFrame = this.evenFrame;
            const frameInterlace = this.frameInterlace;
            
            if (!frameOverscan) {
                targetBuffer32.fill(0, 0, 8192); 
                targetBuffer32.fill(0, 237568, 245760);
            }

            const addY = frameOverscan ? 0 : 14;
            const limit = frameOverscan ? 240 : 225;
            let srcIdx = 1536; 
            
            for (let y = 1; y < limit; y++) {
                const rowTarget1 = (y * 2 + addY) * 512;
                const rowTarget2 = rowTarget1 + 512; 
                
                const writeRow1 = !frameInterlace || evenFrame;
                const writeRow2 = !frameInterlace || !evenFrame;

                for (let x = 0; x < 512; x++) {
                    const r = pixelOutput[srcIdx];
                    const g = pixelOutput[srcIdx + 1];
                    const b = pixelOutput[srcIdx + 2];
                    srcIdx += 3;

                    // Pack RGBA channels into one 32-bit word (ABGR little-endian format)
                    const color32 = r | (g << 8) | (b << 16) | 0xff000000;

                    if (writeRow1) targetBuffer32[rowTarget1 + x] = color32;
                    if (writeRow2) targetBuffer32[rowTarget2 + x] = color32;
                }
            }
        };
    }

    setPostProcessMode(mode) { this.postProcessMode = parseInt(mode); }
    setAudioFilterMode(mode) {
        this.audioFilterMode = parseInt(mode);
        this.audioProcessor.setFilterMode(this.audioFilterMode);
    }
    setAudioEnabled(enabled) { if (this.audioProcessor) this.audioProcessor.setAudioEnabled(enabled); }
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.postProcessor) {
            this.postProcessor.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    /**
     * Loads a new SNES Cartridge asynchronously and begins processing.
     * 
     * @param {Uint8Array} romData - Raw binary cartridge image.
     * @param {boolean} isHirom - Manual mapping override flag.
     */
    async loadCartridge(romData, isHirom) {
        try {
            const loaded = await this.hardware.loadRom(romData, isHirom);
            if (!loaded) throw new Error("ROM parsing failed.");
            this.hardware.reset(true);
            this.start();
        } catch (error) {
            console.error("[SnesOrchestrator] Core loading exception:", error);
            throw error;
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPaused = false;

        this.lastFrameTime = performance.now();
        this.fpsTimer = this.lastFrameTime;
        this.accumulatedTime = 0.0;
        this.fpsCount = 0;

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

    togglePause() { this.isPaused = !this.isPaused; }

    /**
     * Highly optimized execution loop featuring intelligent dynamic frameskip.
     * Audio synchronization is safely decoupled from rendering skips.
     */
    executionLoop(timestamp) {
        if (!this.isRunning) return;

        let elapsed = timestamp - this.lastFrameTime;
        if (elapsed > 100) elapsed = 100; 

        this.lastFrameTime = timestamp;
        this.accumulatedTime += elapsed;

        const targetFps = (this.hardware.ppu && this.hardware.ppu.isPal) ? 50.0 : 60.098;
        const targetFrameDuration = 1000.0 / targetFps;

        // Death Spiral Protection: Extended boundary to 4 frame intervals to absorb minor browser jitters
        if (this.accumulatedTime > targetFrameDuration * 4) {
            this.accumulatedTime = targetFrameDuration * 4;
        }

        const isFastForward = window.UniversalInput && window.UniversalInput.isPressed("FAST_FORWARD");
        let framesRun = 0;
        let renderedThisFrame = false;

        if (isFastForward && !this.isPaused) {
            this.audioProcessor.setAudioEnabled(false);
            for (let i = 0; i < 3; i++) {
                this.pollInputs();
                this.hardware.runFrame(true); 
                this.fpsCount++;
                framesRun++;
            }
            this.hardware.ppu.setPixels();
            renderedThisFrame = true;
            this.accumulatedTime = 0; 
        } else {
            this.audioProcessor.setAudioEnabled(window.audioEnabledState);
            while (this.accumulatedTime >= targetFrameDuration) {
                if (!this.isPaused) {
                    this.pollInputs();

                    // DYNAMIC FRAMESKIP with Consecutive Skip Protection
                    let skipRendering = this.accumulatedTime >= (targetFrameDuration * 1.5);
                    if (skipRendering && this.lastFrameSkipped) {
                        skipRendering = false; // Force render if previous frame was skipped
                    }

                    this.hardware.runFrame(skipRendering);
                    this.lastFrameSkipped = skipRendering;

                    // ALWAYS fetch and push audio samples to keep the WebAudio buffer full
                    this.hardware.setSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                    this.audioProcessor.pushSamples(this.transferBufferL, this.transferBufferR, this.samplesPerFrame);
                    
                    if (!skipRendering) {
                        renderedThisFrame = true;
                    }
                    
                    this.fpsCount++; 
                    framesRun++;
                }
                this.accumulatedTime -= targetFrameDuration;
            }
        }

        // Handle PPU video blitting only if we processed a non-skipped frame
        if (framesRun > 0 && renderedThisFrame && !this.isPaused) {
            const activeHeight = this.hardware.ppu.frameOverscan ? 240 : 224;

            if (this.postProcessMode === 0 || this.postProcessMode === 1) {
                this.hardware.ppu.setPixels(); 

                // Guarantee internal canvas resolution is restored to 1x boundaries
                if (this.ctx.canvas.width !== 512 || this.ctx.canvas.height !== 480) {
                    this.ctx.canvas.width = 512;
                    this.ctx.canvas.height = 480;
                    this.ctx.imageSmoothingEnabled = (this.postProcessMode === 1);
                }

                this.ctx.putImageData(this.imgData, 0, 0);
            } else {
                if (!this.rgba32) {
                    this.rgba32 = new Uint32Array(this.postProcessor.rgbaBuffer.buffer);
                }
                this.convertOriginalRGBToRGBA(this.hardware.ppu.pixelOutput, this.rgba32, 512, activeHeight);
                this.postProcessor.blit(this.ctx, this.rgba32, 512, activeHeight, this.postProcessMode, null);
            }
        }

        this.updatePerformanceMetrics(timestamp, isFastForward);
        this.animationFrameId = requestAnimationFrame((t) => this.executionLoop(t));
    }

    pollInputs() {
        if (window.UniversalInput) {
            this.sendInput(0, window.UniversalInput.isPressed("B"));      
            this.sendInput(1, window.UniversalInput.isPressed("Y"));      
            this.sendInput(2, window.UniversalInput.isPressed("SELECT")); 
            this.sendInput(3, window.UniversalInput.isPressed("START"));  
            this.sendInput(4, window.UniversalInput.isPressed("UP"));     
            this.sendInput(5, window.UniversalInput.isPressed("DOWN"));   
            this.sendInput(6, window.UniversalInput.isPressed("LEFT"));   
            this.sendInput(7, window.UniversalInput.isPressed("RIGHT"));  
            this.sendInput(8, window.UniversalInput.isPressed("A"));      
            this.sendInput(9, window.UniversalInput.isPressed("X"));      
            this.sendInput(10, window.UniversalInput.isPressed("L"));     
            this.sendInput(11, window.UniversalInput.isPressed("R"));     
        }
    }

    /**
     * Unrolled additive color conversion. Eliminates multiplication math 
     * inside the loop to drastically improve performance.
     */
    convertOriginalRGBToRGBA(src16, dst32, width, height) {
        let srcIdx = 0;
        let dstIdx = 0;
        
        for (let y = 0; y < height; y++) {
            const nextRowOffset = width;
            for (let x = 0; x < width; x++) {
                const r = src16[srcIdx];
                const g = src16[srcIdx + 1];
                const b = src16[srcIdx + 2];
                srcIdx += 3;
                
                const pixel = r | (g << 8) | (b << 16) | 0xff000000;
                dst32[dstIdx] = pixel;
                dst32[dstIdx + nextRowOffset] = pixel;
                dstIdx++;
            }
            dstIdx += width; 
        }
    }

    updatePerformanceMetrics(timestamp, isFastForward) {
        if (timestamp - this.fpsTimer >= 1000) {
            if (this.onFpsUpdate) {
                this.onFpsUpdate(isFastForward ? "FFWD" : this.fpsCount);
            }
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

    // ========================================================================
    // ENCAPSULATED STATE SERIALIZATION FOR SAVESTATES (SOLID MEMENTO)
    // ========================================================================

    async saveState() {
        if (this.isRunning && this.hardware.cart) {
            try {
                // Delegate states serialization to individual hardware components (SRP)
                const statePayload = {
                    cpu: this.hardware.cpu.serializeState(),
                    ppu: this.hardware.ppu.serializeState(),
                    apu: this.hardware.apu.serializeState(),
                    ram: Array.from(this.hardware.ram),
                    // Null-guard to support ROM cartridges with 0 bytes of SRAM (preserves serialization integrity)
                    sram: this.hardware.cart.sram ? Array.from(this.hardware.cart.sram) : []
                };

                await this.serializer.save("SNES_SAVESTATE", statePayload);

                if (this.imgData && this.imgData.data) {
                    const src = this.imgData.data;
                    const dstWidth = 128;
                    const dstHeight = 120;
                    const smallArray = new Uint8Array(dstWidth * dstHeight * 4);
                    
                    for (let y = 0; y < dstHeight; y++) {
                        const srcY = (y * 4) * 512 * 4; 
                        const dstY = y * dstWidth * 4;
                        for (let x = 0; x < dstWidth; x++) {
                            const srcX = (x * 4) * 4;   
                            const srcIdx = srcY + srcX;
                            const dstIdx = dstY + (x * 4);
                            
                            smallArray[dstIdx] = src[srcIdx];
                            smallArray[dstIdx + 1] = src[srcIdx + 1];
                            smallArray[dstIdx + 2] = src[srcIdx + 2];
                            smallArray[dstIdx + 3] = 255;
                        }
                    }

                    localStorage.setItem('savestateScreenshot', JSON.stringify(Array.from(smallArray)));
                    localStorage.setItem('cartName', "SNES_SAVESTATE");
                }

                console.log("[SnesOrchestrator] State Saved.");
            } catch (err) {
                console.error("[SnesOrchestrator] Save State failed:", err);
            }
        }
    }

    async loadState() {
        if (this.isRunning && this.hardware.cart) {
            try {
                const state = await this.serializer.load("SNES_SAVESTATE");
                if (!state) {
                    console.error("[SnesOrchestrator] No saved state found for SNES.");
                    return;
                }

                // Delegate states restoration to individual hardware components (SRP / DIP)
                this.hardware.cpu.deserializeState(state.cpu);
                this.hardware.ppu.deserializeState(state.ppu);
                this.hardware.apu.deserializeState(state.apu);

                // Restore System RAM & Cartridge SRAM
                this.hardware.ram.set(state.ram);
                
                // Null-guard to restore SRAM only if the physical cartridge has SRAM allocated
                if (this.hardware.cart.sram && state.sram && state.sram.length > 0) {
                    this.hardware.cart.sram.set(state.sram);
                }

                console.log("[SnesOrchestrator] State Loaded.");
            } catch (err) {
                console.error("[SnesOrchestrator] Load State failed:", err);
            }
        }
    }

    getRegisters() {
        if (!this.hardware || !this.hardware.cpu) return {};
        const cpu = this.hardware.cpu;
        const getWordRep = (val) => ("000" + val.toString(16)).slice(-4).toUpperCase();
        const getByteRep = (val) => ("0" + val.toString(16)).slice(-2).toUpperCase();
        
        return {
            A: getWordRep(cpu.br[0]),
            X: getWordRep(cpu.br[1]),
            Y: getWordRep(cpu.br[2]),
            SP: getWordRep(cpu.br[3]),
            PC: getWordRep(cpu.br[4]),
            DPR: getWordRep(cpu.br[5]),
            DBR: getByteRep(cpu.r[0]),
            K: getByteRep(cpu.r[1]),
            P: getByteRep(cpu.getP())
        };
    }

    getDisassembly() {
        if (!this.hardware || !this.hardware.cpu) return [];
        const lines = [];
        const cpu = this.hardware.cpu;
        const pcHex = ((cpu.r[1] << 16) | cpu.br[4]).toString(16).toUpperCase().padStart(6, '0');
        const opHex = this.hardware.read((cpu.r[1] << 16) | cpu.br[4]).toString(16).toUpperCase().padStart(2, '0');
        lines.push(`${pcHex}: OPCODE 0x${opHex}`);
        return lines;
    }

    drawVramDiagnostics(ctx) {
        if (!this.hardware || !this.hardware.ppu) return;
        
        const imgData = ctx.createImageData(128, 192);
        const vram = this.hardware.ppu.vram; 
        const bg1CharBase = this.hardware.ppu.tileAdr[0] || 0x2000;
        const spriteCharBase = this.hardware.ppu.sprAdr1 || 0x4000;
        const remapMode = this.hardware.ppu.vramRemap;

        const getRemappedAddress = (adr) => {
            let a = adr & 0x7fff;
            if (remapMode === 1) {
                a = (a & 0xff00) | ((adr & 0xe0) >> 5) | ((adr & 0x1f) << 3);
            } else if (remapMode === 2) {
                a = (a & 0xfe00) | ((adr & 0x1c0) >> 6) | ((adr & 0x3f) << 3);
            } else if (remapMode === 3) {
                a = (a & 0xfc00) | ((adr & 0x380) >> 7) | ((adr & 0x7f) << 3);
            }
            return a;
        };

        for (let tileIdx = 0; tileIdx < 384; tileIdx++) {
            const tileX = tileIdx % 16;
            const tileY = Math.floor(tileIdx / 16);
            const destBaseX = tileX * 8;
            const destBaseY = tileY * 8;
            
            const isSpriteTile = tileIdx >= 192;
            const baseWordOffset = isSpriteTile ? spriteCharBase : bg1CharBase;
            const relativeTileIdx = isSpriteTile ? (tileIdx - 192) : tileIdx;
            
            const tileWordOffset = baseWordOffset + (relativeTileIdx * 16);
            
            for (let row = 0; row < 8; row++) {
                const wordA = vram[getRemappedAddress((tileWordOffset + row) & 0x7fff)];
                const wordB = vram[getRemappedAddress((tileWordOffset + 8 + row) & 0x7fff)];
                
                for (let col = 0; col < 8; col++) {
                    const shift = 7 - col;
                    
                    const bit0 = (wordA >> shift) & 1;
                    const bit1 = (wordA >> (8 + shift)) & 1;
                    const bit2 = (wordB >> shift) & 1;
                    const bit3 = (wordB >> (8 + shift)) & 1;
                    
                    const colorIdx = bit0 | (bit1 << 1) | (bit2 << 2) | (bit3 << 3);
                    const rgb = colorIdx * 17; 
                    
                    const pixelX = destBaseX + col;
                    const pixelY = destBaseY + row;
                    const destIdx = (pixelX + (pixelY * 128)) * 4;
                    
                    imgData.data[destIdx]     = rgb;
                    imgData.data[destIdx + 1] = rgb;
                    imgData.data[destIdx + 2] = rgb;
                    imgData.data[destIdx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
}