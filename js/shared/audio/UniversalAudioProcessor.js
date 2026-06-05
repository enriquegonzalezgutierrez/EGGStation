/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/audio/UniversalAudioProcessor.js
 * 
 * Role:
 * Infrastructure Layer: Universal Web Audio DSP & Synchronization Service.
 * Bridges the emulated console APU/DSP audio sample outputs to the browser's 
 * Web Audio API. Implements a high-capacity 32,768-sample double Ring Buffer 
 * to prevent sound popping, pointer-snapping, and pitch-warping artifacts.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for managing 
 *    the Web Audio Context lifecycle, linear ring buffers, and soundstage DSP 
 *    node filters (low-pass, delays).
 * 2. Liskov Substitution Principle (LSP): Offers a uniform and generic audio-pushing 
 *    contract (pushSamples, resume, stop) that can be snychronously used by 
 *    SNES, NES, and other future emulated system audio units.
 */

class UniversalAudioProcessor {
    constructor() {
        this.audioEnabled = true;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Target sample rate pacing (Typically 44.1KHz or 48KHz divided by 60fps)
        this.samplesPerFrame = this.audioCtx.sampleRate / 60;

        // Expanded Double Ring Buffer (32,768 samples for high jitter absorption)
        this.inputBufferL = new Float64Array(32768);
        this.inputBufferR = new Float64Array(32768);
        this.inputBufferPos = 0;
        this.inputReadPos = 0;

        this.filterMode = 0;
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        
        this.lowPassFilter = this.audioCtx.createBiquadFilter();
        this.lowPassFilter.type = "lowpass";
        this.lowPassFilter.frequency.value = 3500;
        this.lowPassFilter.Q.value = 0.707;

        this.splitter = this.audioCtx.createChannelSplitter(2);
        this.merger = this.audioCtx.createChannelMerger(2);
        this.delayL = this.audioCtx.createDelay();
        this.delayR = this.audioCtx.createDelay();
        
        this.delayL.delayTime.value = 0.005; // 5ms Haas delay for Stereo widening
        this.delayR.delayTime.value = 0.0;
        
        this.splitter.connect(this.delayL, 0);
        this.splitter.connect(this.delayR, 1);
        this.delayL.connect(this.merger, 0, 0);
        this.delayR.connect(this.merger, 0, 1);

        this.scriptNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
        this.scriptNode.onaudioprocess = (e) => this.onAudioProcess(e);

        this.scriptNode.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);

        this.setAudioEnabled(window.audioEnabledState !== false);
        console.log(`[UniversalAudioProcessor] Web Audio DSP Node Active. Buffer: 32768 samples.`);
    }

    /**
     * Resumes the Web Audio Context after browser autoplay locks are resolved.
     */
    resume() {
        if (this.audioEnabled && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    /**
     * Dynamically suspends or resumes Web Audio contexts.
     */
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

    /**
     * Stops and flushes the active audio Ring Buffers.
     */
    stop() {
        this.inputBufferPos = 0;
        this.inputReadPos = 0;
        this.inputBufferL.fill(0);
        this.inputBufferR.fill(0);
    }

    /**
     * Re-wires the internal AudioNode routing graph on the fly to apply DSP filters.
     * @param {number} mode - 0: Bypass, 1: Low-pass (Analogue warmth), 2: Stereo Widener.
     */
    setFilterMode(mode) {
        this.filterMode = parseInt(mode);
        
        this.scriptNode.disconnect();
        this.lowPassFilter.disconnect();
        this.merger.disconnect();

        switch (this.filterMode) {
            case 1: 
                this.scriptNode.connect(this.lowPassFilter);
                this.lowPassFilter.connect(this.masterGain);
                break;
            case 2: 
                this.scriptNode.connect(this.splitter);
                this.merger.connect(this.masterGain);
                break;
            default: 
                this.scriptNode.connect(this.masterGain);
                break;
        }
    }

    /**
     * Pushes stereo samples into the circular Ring Buffer snychronously using high speed masking (& 0x7fff)
     * @param {Float32Array} left - Left channel samples array.
     * @param {Float32Array} right - Right channel samples array.
     * @param {number} count - Amount of samples to push.
     */
    pushSamples(left, right, count) {
        if (!this.audioEnabled) return;
        for (let i = 0; i < count; i++) {
            this.inputBufferL[this.inputBufferPos & 0x7fff] = left[i];
            this.inputBufferR[this.inputBufferPos & 0x7fff] = right[i];
            this.inputBufferPos++;
        }
    }

    /**
     * Core ScriptProcessorCallback loop. Consumes samples using a safety cushion algorithm 
     * to avoid pitch-warping or buffer starvation pops.
     */
    onAudioProcess(e) {
        const outputL = e.outputBuffer.getChannelData(0);
        const outputR = e.outputBuffer.getChannelData(1);
        
        let samplesAvailable = this.inputBufferPos - this.inputReadPos;
        
        // Safety Case: Underrun (Not enough samples to fill a whole 2048 block)
        if (samplesAvailable < 2048) {
            // Fill available samples and complete the rest with absolute silence.
            // This prevents pitch snaps and allows the emulator to naturally build up a cushion.
            for (let i = 0; i < 2048; i++) {
                if (i < samplesAvailable) {
                    outputL[i] = this.inputBufferL[this.inputReadPos & 0x7fff];
                    outputR[i] = this.inputBufferR[this.inputReadPos & 0x7fff];
                    this.inputReadPos++;
                } else {
                    outputL[i] = 0;
                    outputR[i] = 0;
                }
            }
            return;
        }
        
        // Safety Case: Overrun (Lag recovery when buffer gets too full, e.g., after tab unfocus)
        if (samplesAvailable > 16384) {
            this.inputReadPos = this.inputBufferPos - 4096; // Gently reset to a 4096 sample delay cushion
        }
        
        // Standard smooth play path
        for (let i = 0; i < 2048; i++) {
            outputL[i] = this.inputBufferL[this.inputReadPos & 0x7fff];
            outputR[i] = this.inputBufferR[this.inputReadPos & 0x7fff];
            this.inputReadPos++;
        }
    }
}

// Bind globally as a shared module
window.UniversalAudioProcessor = UniversalAudioProcessor;