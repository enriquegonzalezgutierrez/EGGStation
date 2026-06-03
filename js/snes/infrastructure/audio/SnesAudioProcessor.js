/**
 * Project: EGGStation - Super Nintendo (SNES) Audio Processor
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES Audio DSP & Synchronization Service (Stable 60 FPS Version)
 * 
 * ROLE:
 * Bridges the SNES APU/DSP output to the modern Web Audio API. 
 * Implements a lightweight, power-of-two Ring Buffer (4096 samples) matching the original 
 * standalone audio.js logic to prevent JIT performance drops.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Manages audio buffering and DSP graph only.
 * - Open/Closed Principle (OCP): Filters can be expanded without altering the buffering logic.
 */

class SnesAudioProcessor {
    constructor() {
        this.audioEnabled = true;
        // Initialize Web Audio API Context
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Exact samples rate matching host context (e.g. 44100 / 60 = 735)
        this.samplesPerFrame = this.audioCtx.sampleRate / 60;

        // Legacy Lightweight Ring Buffer (Power of 2 size for high-speed bitwise masking)
        this.inputBufferL = new Float64Array(4096);
        this.inputBufferR = new Float64Array(4096);
        this.inputBufferPos = 0;
        this.inputReadPos = 0;

        // DSP Graph Nodes
        this.filterMode = 0;
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        
        // 1. Low-Pass Filter (Simulates RF/CRT muffled audio ~3.5kHz)
        this.lowPassFilter = this.audioCtx.createBiquadFilter();
        this.lowPassFilter.type = "lowpass";
        this.lowPassFilter.frequency.value = 3500;
        this.lowPassFilter.Q.value = 0.707;

        // 2. Stereo Width Enhancer (Haas Effect using micro-delays)
        this.splitter = this.audioCtx.createChannelSplitter(2);
        this.merger = this.audioCtx.createChannelMerger(2);
        this.delayL = this.audioCtx.createDelay();
        this.delayR = this.audioCtx.createDelay();
        
        this.delayL.delayTime.value = 0.005; 
        this.delayR.delayTime.value = 0.0;
        
        this.splitter.connect(this.delayL, 0);
        this.splitter.connect(this.delayR, 1);
        this.delayL.connect(this.merger, 0, 0);
        this.delayR.connect(this.merger, 0, 1);

        // Processor Node to bridge JavaScript arrays to Web Audio
        this.scriptNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
        this.scriptNode.onaudioprocess = (e) => this.onAudioProcess(e);

        // Initial Routing: Direct Connection (Bypasses all slow filter nodes by default)
        this.scriptNode.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);

        this.setAudioEnabled(window.audioEnabledState !== false);
        console.log(`[EGGStation::SNES] High-Performance Audio Processor Initialized. Sample Rate: ${this.audioCtx.sampleRate} Hz`);
    }

    /**
     * Resumes the AudioContext. Must be called after a user interaction (e.g., clicking "Play").
     */
    resume() {
        if (this.audioEnabled && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    /**
     * Dynamically enables or disables Web Audio contexts and processing.
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
     * Stops the audio output and resets the ring buffer.
     */
    stop() {
        this.inputBufferPos = 0;
        this.inputReadPos = 0;
        this.inputBufferL.fill(0);
        this.inputBufferR.fill(0);
    }

    /**
     * Dynamically re-routes the Web Audio DSP graph based on UI selection.
     * Keeps direct bypass active if mode is 0 (Clean) to preserve CPU performance.
     * @param {number} mode - 0: Clean, 1: Low-Pass, 2: Stereo Width
     */
    setFilterMode(mode) {
        this.filterMode = parseInt(mode);
        
        // Disconnect all dynamic nodes
        this.scriptNode.disconnect();
        this.lowPassFilter.disconnect();
        this.merger.disconnect();

        switch (this.filterMode) {
            case 1: // Low-Pass RF Filter
                this.scriptNode.connect(this.lowPassFilter);
                this.lowPassFilter.connect(this.masterGain);
                break;
            case 2: // Analog Stereo Width
                this.scriptNode.connect(this.splitter);
                this.merger.connect(this.masterGain);
                break;
            default: // Studio Clean (Direct Bypass path - 100% fast)
                this.scriptNode.connect(this.masterGain);
                break;
        }
    }

    /**
     * Pushes samples generated by the SNES APU into the Ring Buffer.
     * Uses extremely fast bitwise mask (& 0xfff) instead of modulo arithmetic.
     * 
     * @param {Float64Array} left - Left channel samples.
     * @param {Float64Array} right - Right channel samples.
     * @param {number} count - Number of samples to push.
     */
    pushSamples(left, right, count) {
        if (!this.audioEnabled) return;
        for (let i = 0; i < count; i++) {
            this.inputBufferL[this.inputBufferPos & 0xfff] = left[i];
            this.inputBufferR[this.inputBufferPos & 0xfff] = right[i];
            this.inputBufferPos++;
        }
    }

    /**
     * Consumes samples from the Ring Buffer and outputs them to the speakers.
     */
    onAudioProcess(e) {
        if (this.inputReadPos + 2048 > this.inputBufferPos) {
            // Buffer overrun adjustment
            this.inputReadPos = this.inputBufferPos - 2048;
        }
        if (this.inputReadPos + 4096 < this.inputBufferPos) {
            // Buffer underrun adjustment
            this.inputReadPos += 2048;
        }
        const outputL = e.outputBuffer.getChannelData(0);
        const outputR = e.outputBuffer.getChannelData(1);
        
        for (let i = 0; i < 2048; i++) {
            outputL[i] = this.inputBufferL[this.inputReadPos & 0xfff];
            outputR[i] = this.inputBufferR[this.inputReadPos & 0xfff];
            this.inputReadPos++;
        }
    }
}