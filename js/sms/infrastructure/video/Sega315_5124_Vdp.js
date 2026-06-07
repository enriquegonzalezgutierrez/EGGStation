/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/infrastructure/video/Sega315_5124_Vdp.js
 * 
 * Presentation Layer: Sega 315-5124 VDP WebAssembly Bridge Adapter
 * 
 * Role:
 * Implements the Adapter Pattern to wrap the compiled C++ WebAssembly VDP module.
 * Maps WebAssembly linear memory directly to JavaScript typed arrays to allow 
 * Zero-Copy page flipping.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Serves as a perfect drop-in replacement 
 *   for the legacy JS VDP. The orchestrator continues to call `.update()` and 
 *   `.hyperBlit()` without noticing the change.
 * - Single Responsibility Principle (SRP): Handles only WebAssembly memory wrapping, 
 *   asynchronous loading, and routing data to the UniversalPostProcessor.
 */

class Sega315_5124_Vdp {
    static get Standard() {
        return { vdpNTSC: 0, vdpPAL: 1 };
    }

    /**
     * @param {number} vdpMode - 0: NTSC, 1: PAL
     * @param {WebGL2RenderingContext} glContext - Canvas WebGL context target for CRT shaders.
     */
    constructor(vdpMode, glContext) {
        this.vdpMode = vdpMode;
        this.glContext = glContext;
        this.isInitialized = false;

        // Allocating JS Fallback buffers to prevent crash on early startup
        this.vRam = new Uint8Array(0x4000);
        this.colorRam = new Uint8Array(0x20);
        this.glbFrameBuffer = new Uint8ClampedArray(256 * 240 * 4);
        this.glbFrameBuffer32 = new Uint32Array(this.glbFrameBuffer.buffer);

        // Pre-allocate temporary pointers for WASM stack allocation
        this.stackPtrs = null;

        // Asynchronously load the modularized Emscripten WebAssembly output
        if (typeof SegaVdpWasm !== 'undefined') {
            SegaVdpWasm().then(instance => {
                this.wasmInstance = instance;
                this.wasmInstance._vdp_init(this.vdpMode);

                this.bindWasmMemory();
                
                // Initialize the shared UniversalPostProcessor on the WebGL context
                this.postProcessor = new UniversalPostProcessor(this.glContext);
                
                this.isInitialized = true;
                console.log("[EGGStation::Wasm] Sega 315-5124 VDP module linked successfully.");
            });
        } else {
            console.error("[EGGStation::Wasm] Fatal: SegaVdpWasm loader is not defined in the global scope.");
        }
    }

    /**
     * Maps the C++ memory pointers directly to JavaScript typed arrays (Zero-Copy).
     */
    bindWasmMemory() {
        const wasm = this.wasmInstance;

        // 1. Get raw C++ Heap Pointers
        const fbPtr = wasm._vdp_get_framebuffer_pointer();
        const vramPtr = wasm._vdp_get_vram_pointer();
        const cramPtr = wasm._vdp_get_cram_pointer();
        const regsPtr = wasm._vdp_get_registers_pointer();

        // 2. Wrap JS views directly over the WebAssembly Linear Heap (Zero-Copy!)
        this.glbFrameBuffer = new Uint8ClampedArray(wasm.HEAPU8.buffer, fbPtr, 256 * 240 * 4);
        this.glbFrameBuffer32 = new Uint32Array(wasm.HEAP32.buffer, fbPtr, 256 * 240);
        this.vRam = new Uint8Array(wasm.HEAPU8.buffer, vramPtr, 0x4000);
        this.colorRam = new Uint8Array(wasm.HEAPU8.buffer, cramPtr, 0x20);
        this.registers = new Uint8Array(wasm.HEAPU8.buffer, regsPtr, 11);

        // Allocate memory on the WASM stack for state syncing (Used by get/set state getters)
        this.stackPtrs = {
            scanlineIdx: wasm._malloc(4),
            lineCnt: wasm._malloc(4),
            ctrlFlag: wasm._malloc(4),
            ctrlWord: wasm._malloc(2),
            dataAddr: wasm._malloc(2),
            writeMode: wasm._malloc(1),
            readBuf: wasm._malloc(1),
            status: wasm._malloc(1)
        };
    }

    writeByteToControlPort(value) {
        if (this.isInitialized) this.wasmInstance._vdp_write_control(value);
    }

    writeByteToDataPort(value) {
        if (this.isInitialized) this.wasmInstance._vdp_write_data(value);
    }

    readByteFromControlPort() {
        return this.isInitialized ? this.wasmInstance._vdp_read_control() : 0xFF;
    }

    readByteFromDataPort() {
        return this.isInitialized ? this.wasmInstance._vdp_read_data() : 0x00;
    }

    readDataPort(port) {
        return this.isInitialized ? this.wasmInstance._vdp_read_port(port) : 0x00;
    }

    /**
     * Steps the VDP cycle timer.
     * @param {Object} theCPU - The active Z80 CPU instance.
     * @param {number} cycles - CPU cycles elapsed.
     * @return {boolean} True if V-Blank was reached on this step.
     */
    update(theCPU, cycles) {
        if (!this.isInitialized) return false;

        const wasm = this.wasmInstance;
        
        // Pass a stack pointer to hold the raiseInterrupt IRQ out-value
        const irqOutPtr = this.stackPtrs.status; // Reusing a 1-byte pre-allocated stack allocation
        const vblankReached = wasm._vdp_update(cycles, irqOutPtr);

        const raiseInterrupt = wasm.HEAPU8[irqOutPtr] !== 0;
        if (raiseInterrupt && theCPU) {
            theCPU.raiseMaskableInterrupt();
        }

        return vblankReached;
    }

    /**
     * Delegates screen upscaling and WebGL shader tuning to the UniversalPostProcessor.
     */
    hyperBlit(ctx, postProcessMode) {
        if (this.isInitialized && this.postProcessor) {
            this.postProcessor.blit(ctx, this.glbFrameBuffer, this.yScreenLines, postProcessMode);
        }
    }

    // ========================================================================
    // COMPATIBILITY LAYER: ES6 GETTERS & SETTERS (LSP ALIGNMENT)
    // Map individual registers transparently to keep the JS Orchestrator's
    // Save/Load state serialization loops working flawlessly.
    // ========================================================================

    get register00() { return this.isInitialized ? this.registers[0] : 0x36; }
    set register00(v) { if (this.isInitialized) this.registers[0] = v; }

    get register01() { return this.isInitialized ? this.registers[1] : 0x80; }
    set register01(v) { if (this.isInitialized) this.registers[1] = v; }

    get register02() { return this.isInitialized ? this.registers[2] : 0xFF; }
    set register02(v) { if (this.isInitialized) this.registers[2] = v; }

    get register03() { return this.isInitialized ? this.registers[3] : 0xFF; }
    set register03(v) { if (this.isInitialized) this.registers[3] = v; }

    get register04() { return this.isInitialized ? this.registers[4] : 0xFF; }
    set register04(v) { if (this.isInitialized) this.registers[4] = v; }

    get register05() { return this.isInitialized ? this.registers[5] : 0xFF; }
    set register05(v) { if (this.isInitialized) this.registers[5] = v; }

    get register06() { return this.isInitialized ? this.registers[6] : 0xFB; }
    set register06(v) { if (this.isInitialized) this.registers[6] = v; }

    get register07() { return this.isInitialized ? this.registers[7] : 0x00; }
    set register07(v) { if (this.isInitialized) this.registers[7] = v; }

    get register08() { return this.isInitialized ? this.registers[8] : 0x00; }
    set register08(v) { if (this.isInitialized) this.registers[8] = v; }

    get register09() { return this.isInitialized ? this.registers[9] : 0x00; }
    set register09(v) { if (this.isInitialized) this.registers[9] = v; }

    get register0a() { return this.isInitialized ? this.registers[10] : 0xFF; }
    set register0a(v) { if (this.isInitialized) this.registers[10] = v; }

    get yScreenLines() {
        if (!this.isInitialized) return 192;
        if (this.registers[0] & 0x02) {
            if (this.registers[1] & 0x08) return 240;
            if (this.registers[1] & 0x10) return 224;
        }
        return 192;
    }

    // --- State Serialization Getters/Setters (Syncs internal C++ variables) ---

    get currentScanlineIndex() { return this.getInternalField('scanlineIdx'); }
    set currentScanlineIndex(v) { this.setInternalField('scanlineIdx', v); }

    get lineCounter() { return this.getInternalField('lineCnt'); }
    set lineCounter(v) { this.setInternalField('lineCnt', v); }

    get controlWordFlag() { return this.getInternalField('ctrlFlag') !== 0; }
    set controlWordFlag(v) { this.setInternalField('ctrlFlag', v ? 1 : 0); }

    get controlWord() { return this.getInternalField('ctrlWord'); }
    set controlWord(v) { this.setInternalField('ctrlWord', v); }

    get dataPortReadWriteAddress() { return this.getInternalField('dataAddr'); }
    set dataPortReadWriteAddress(v) { this.setInternalField('dataAddr', v); }

    get dataPortWriteMode() { return this.getInternalField('writeMode'); }
    set dataPortWriteMode(v) { this.setInternalField('writeMode', v); }

    get readBufferByte() { return this.getInternalField('readBuf'); }
    set readBufferByte(v) { this.setInternalField('readBuf', v); }

    get statusFlags() { return this.getInternalField('status'); }
    set statusFlags(v) { this.setInternalField('status', v); }

    // Helpers to easily query and write individual fields across the WASM stack boundary
    getInternalField(field) {
        if (!this.isInitialized) return 0;
        const wasm = this.wasmInstance;
        const s = this.stackPtrs;
        wasm._vdp_get_internal_state(s.scanlineIdx, s.lineCnt, s.ctrlFlag, s.ctrlWord, s.dataAddr, s.writeMode, s.readBuf, s.status);
        
        if (field === 'scanlineIdx') return wasm.HEAP32[s.scanlineIdx >> 2];
        if (field === 'lineCnt') return wasm.HEAP32[s.lineCnt >> 2];
        if (field === 'ctrlFlag') return wasm.HEAP32[s.ctrlFlag >> 2];
        if (field === 'ctrlWord') return wasm.HEAPU16[s.ctrlWord >> 1];
        if (field === 'dataAddr') return wasm.HEAPU16[s.dataAddr >> 1];
        if (field === 'writeMode') return wasm.HEAPU8[s.writeMode];
        if (field === 'readBuf') return wasm.HEAPU8[s.readBuf];
        if (field === 'status') return wasm.HEAPU8[s.status];
        return 0;
    }

    setInternalField(field, value) {
        if (!this.isInitialized) return;
        const wasm = this.wasmInstance;
        const s = this.stackPtrs;
        
        // 1. Fetch current states first
        wasm._vdp_get_internal_state(s.scanlineIdx, s.lineCnt, s.ctrlFlag, s.ctrlWord, s.dataAddr, s.writeMode, s.readBuf, s.status);
        
        // 2. Overwrite the specific target field
        if (field === 'scanlineIdx') wasm.HEAP32[s.scanlineIdx >> 2] = value;
        else if (field === 'lineCnt') wasm.HEAP32[s.lineCnt >> 2] = value;
        else if (field === 'ctrlFlag') wasm.HEAP32[s.ctrlFlag >> 2] = value;
        else if (field === 'ctrlWord') wasm.HEAPU16[s.ctrlWord >> 1] = value;
        else if (field === 'dataAddr') wasm.HEAPU16[s.dataAddr >> 1] = value;
        else if (field === 'writeMode') wasm.HEAPU8[s.writeMode] = value;
        else if (field === 'readBuf') wasm.HEAPU8[s.readBuf] = value;
        else if (field === 'status') wasm.HEAPU8[s.status] = value;

        // 3. Write back to C++ memory
        wasm._vdp_set_internal_state(
            wasm.HEAP32[s.scanlineIdx >> 2],
            wasm.HEAP32[s.lineCnt >> 2],
            wasm.HEAP32[s.ctrlFlag >> 2],
            wasm.HEAPU16[s.ctrlWord >> 1],
            wasm.HEAPU16[s.dataAddr >> 1],
            wasm.HEAPU8[s.writeMode],
            wasm.HEAPU8[s.readBuf],
            wasm.HEAPU8[s.status]
        );
    }
}