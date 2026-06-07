/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/audio/SegaPsg.js
 * 
 * Infrastructure Layer: SegaPsg WebAssembly Bridge Adapter (SOLID LSP Compliant)
 * 
 * Role:
 * Implements the Adapter Pattern to wrap the compiled C++ WebAssembly module.
 * Exposes the exact same public interface as the legacy JavaScript SegaPsg class, 
 * allowing seamless drop-in integration with zero changes to any Orchestrator loops.
 * 
 * Design features:
 * - Zero-Copy Memory reads: Maps a Float32Array directly over the WebAssembly Linear 
 *   Memory Heap (HEAPF32) utilizing the shared buffer pointer.
 * - Bidirectional State Sync: Exposes proxy registers that sync seamlessly with Wasm 
 *   clocks to fully support real-time rewinding (Temporal Physics).
 */

class SegaPsg {
    constructor() {
        this.wasmInstance = null;
        this.sharedBufferPtr = 0;
        
        // This view will map directly over WebAssembly Linear Memory Heap
        this.sharedBufferView = null;
        this.audioInitialized = false;
        this.isMuted = false;

        // Mock state properties to satisfy serialization read requests (Rewind support)
        this.volregister = new Int16Array(4);
        this.toneregister = new Int16Array(4);
        this.wavePos = new Float32Array(4);
        this.chan2belatched = 0;
        this.what2latch = 0;

        // Dynamic Rate Control (DRC) synchronization properties
        this.internalClock = 0;
        this.internalClockPos = 0;

        // Web Audio components (For SMS active mode)
        this.context = null;
        this.jsNode = null;
        this.gainNode = null;
        this.biquadFilterNode = null; 
        this.audioBufSize = 2048;     
        this.multiplier = 0;
        this.audioEnabled = false;

        // Asynchronously load the modularized Emscripten WebAssembly output
        if (typeof SegaPsgWasm !== 'undefined') {
            SegaPsgWasm().then(instance => {
                this.wasmInstance = instance;
                
                // Retrieve the static shared memory address from C++
                this.sharedBufferPtr = this.wasmInstance._psg_get_buffer_pointer();
                
                // Map the Float32Array directly to the Wasm HEAPF32 memory buffer (Zero-Copy)
                this.sharedBufferView = new Float32Array(
                    this.wasmInstance.HEAPF32.buffer, 
                    this.sharedBufferPtr, 
                    this.audioBufSize
                );

                this.wasmInstance._psg_init();
                this.audioInitialized = true;
                console.log("[EGGStation::Wasm] SegaPsg C++ WebAssembly module linked successfully.");
            });
        } else {
            console.error("[EGGStation::Wasm] Fatal: SegaPsgWasm loader is not defined in the global scope.");
        }
    }

    initialise() {
        if (this.audioInitialized) {
            this.wasmInstance._psg_init();
            this.internalClock = 0;
            this.internalClockPos = 0;
            this.volregister.fill(0xF);
            this.toneregister.fill(0);
            this.wavePos.fill(0.0);
            this.chan2belatched = 0;
            this.what2latch = 0;
        }
    }

    initialize() {
        this.initialise();
    }

    setSampleRate(rate) {
        if (this.audioInitialized) {
            this.wasmInstance._psg_set_sample_rate(rate);
        }
    }

    writeByte(command) {
        if (this.audioInitialized) {
            this.wasmInstance._psg_write_command(command);
        }
    }

    writeCommand(command) {
        this.writeByte(command);
    }

    getSample() {
        if (!this.audioInitialized) return 0.0;
        return this.wasmInstance._psg_get_sample();
    }

    setMuted(shouldMute) {
        this.isMuted = shouldMute;
    }

    setAudioFilter(mode) {
        if (!this.audioInitialized || !this.biquadFilterNode) return;
        switch (parseInt(mode)) {
            case 1: this.biquadFilterNode.frequency.value = 3500; break;
            case 2: this.biquadFilterNode.frequency.value = 5500; break;
            case 3: this.biquadFilterNode.frequency.value = 6500; break;
            default: this.biquadFilterNode.frequency.value = 20000; break;
        }
    }

    setAudioEnabled(enabled) {
        this.audioEnabled = enabled;
        if (this.context) {
            if (enabled && this.context.state === 'suspended') this.context.resume().catch(() => {});
            else if (!enabled && this.context.state === 'running') this.context.suspend().catch(() => {});
        }
    }

    async startMix(cpu) {
        // SMS Active Audio Mode bootstrap
        try {
            this.audioEnabled = window.audioEnabledState !== false;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
            
            this.setSampleRate(this.context.sampleRate);
            this.multiplier = Math.floor(cpu.clockRate / this.context.sampleRate);
            
            this.jsNode = this.context.createScriptProcessor(this.audioBufSize, 0, 1);
            this.jsNode.onaudioprocess = (e) => this.mixFunction(e);

            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.6; 
    
            this.biquadFilterNode = this.context.createBiquadFilter();
            this.biquadFilterNode.type = 'lowpass';

            this.jsNode.connect(this.biquadFilterNode);
            this.biquadFilterNode.connect(this.gainNode);
            this.gainNode.connect(this.context.destination);

            if (!this.audioEnabled) this.context.suspend().catch(() => {});
        }
        catch(e) {
            console.error("SegaPsg::WasmAdapter failed to bootstrap Web Audio.", e);
            this.audioEnabled = false;
        }        
    }

    /**
     * Updates CPU execution cycles reference to compute Dynamic Rate Control (DRC) drift.
     */
    step(totCpuCycles) {
        this.internalClock = totCpuCycles;
    }

    /**
     * Calculates current WebAudio buffer delay deviation.
     */
    getClockDrift() {
        if (!this.audioInitialized) return 0;
        return this.internalClock - this.internalClockPos;
    }

    /**
     * Recalculates PSG channel phases when state is restored during rewinding.
     * Maps the local restored JS variables back to native C++ WebAssembly memory.
     */
    recalculateVoiceStep(voiceIndex) {
        if (!this.audioInitialized) return;
        this.wasmInstance._psg_restore_state(
            voiceIndex,
            this.volregister[voiceIndex],
            this.toneregister[voiceIndex],
            this.wavePos[voiceIndex],
            this.chan2belatched,
            this.what2latch
        );
    }

    /**
     * Fetches current C++ registers state back to the Javascript mapped properties.
     */
    syncFromWasm() {
        if (!this.audioInitialized) return;
        for (let i = 0; i < 4; i++) {
            this.volregister[i] = this.wasmInstance._psg_get_vol(i);
            this.toneregister[i] = this.wasmInstance._psg_get_tone(i);
            this.wavePos[i] = this.wasmInstance._psg_get_wave_pos(i);
        }
        this.chan2belatched = this.wasmInstance._psg_get_chan_latch();
        this.what2latch = this.wasmInstance._psg_get_what_latch();
    }

    /**
     * Genesis Passive Mode: Fills system buffer directly from the shared Wasm memory.
     */
    update(sampleBuffer, totalFrames) {
        if (!this.audioInitialized) return;

        // Tell C++ to fill its internal static buffer
        this.wasmInstance._psg_update_buffer(totalFrames);

        // Read directly from the shared Wasm Float32 heap and write to the output buffer
        let ptr = 0;
        for (let i = 0; i < totalFrames; i++) {
            const wasmSample = this.sharedBufferView[i];
            sampleBuffer[ptr] = (sampleBuffer[ptr] + (wasmSample * 32767)) | 0;
            ptr++;
        }

        // Sync local variables right after render to keep rewind state snapshots stable
        this.syncFromWasm();
    }

    /**
     * SMS Active Mode: Fills the audio node buffer sample-by-sample
     */
    mixFunction(e) {
        const data = e.outputBuffer.getChannelData(0);
        if (!this.audioEnabled || !this.audioInitialized || this.isMuted) {
            data.fill(0);
            return;
        }

        let numClocksToCover = this.internalClock - this.internalClockPos;
        const maxAllowedDrift = this.multiplier * this.audioBufSize * 4;
        if (Math.abs(numClocksToCover) > maxAllowedDrift) {
            this.internalClockPos = this.internalClock;
            numClocksToCover = 0;
        }

        if (numClocksToCover <= 0) {
            data.fill(0);
            return;
        }

        // Fill buffer instantly via WebAssembly C++ Generator
        this.wasmInstance._psg_update_buffer(data.length);
        for (let i = 0; i < data.length; i++) {
            data[i] = this.sharedBufferView[i];
        }

        // Increment reference play clock to balance drift
        this.internalClockPos += numClocksToCover;

        // Sync variables for active mode state serialization
        this.syncFromWasm();
    }

    syncWorkletState() {}
}

// Bind globally as a shared module
window.SegaPsg = SegaPsg;