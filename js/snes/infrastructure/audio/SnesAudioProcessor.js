/**
 * Project: EGGStation - Super Nintendo (SNES) Audio Processor
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES Audio DSP & Synchronization Service
 * 
 * ROLE:
 * Bridges the SNES APU/DSP output to the modern Web Audio API. 
 * Implements a robust Ring Buffer to decouple the emulator's video framerate 
 * (requestAnimationFrame) from the hardware audio sample rate, preventing crackling.
 * Applies standardized EGGStation audio filters (Low-Pass, Stereo Width).
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Manages audio buffering and DSP graph only.
 * - Open/Closed Principle (OCP): Filters can be expanded without altering the buffering logic.
 */

class SnesAudioProcessor {
    constructor() {
        this.audioEnabled = true;
        // Initialize Web Audio API
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ring Buffer Configuration (Holds ~4 frames of audio to absorb rAF jitter)
        this.bufferSize = 8192; 
        this.ringBufferL = new Float32Array(this.bufferSize);
        this.ringBufferR = new Float32Array(this.bufferSize);
        this.writePtr = 0;
        this.readPtr = 0;
        this.samplesInQueue = 0;

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
        
        // Slightly delay one channel to create a psychoacoustic wide stereo effect
        this.delayL.delayTime.value = 0.005; 
        this.delayR.delayTime.value = 0.0;
        
        this.splitter.connect(this.delayL, 0);
        this.splitter.connect(this.delayR, 1);
        this.delayL.connect(this.merger, 0, 0);
        this.delayR.connect(this.merger, 0, 1);

        // Processor Node to bridge JavaScript arrays to Web Audio
        // Note: ScriptProcessor is used here to maintain compatibility with legacy synchronous loops
        this.scriptNode = this.audioCtx.createScriptProcessor(2048, 0, 2);
        this.scriptNode.onaudioprocess = (event) => this.onAudioProcess(event);

        // Initial Routing (Bypass Filters)
        this.scriptNode.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);

        console.log("[EGGStation::SNES] Audio Processor & DSP Graph Initialized.");
        this.setAudioEnabled(window.audioEnabledState !== false);
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
        this.writePtr = 0;
        this.readPtr = 0;
        this.samplesInQueue = 0;
        this.ringBufferL.fill(0);
        this.ringBufferR.fill(0);
    }

    /**
     * Dynamically re-routes the Web Audio DSP graph based on UI selection.
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
            default: // Studio Clean (Bypass)
                this.scriptNode.connect(this.masterGain);
                break;
        }
    }

    /**
     * Pushes samples generated by the SNES APU into the Ring Buffer.
     * Called by the Orchestrator after every frame.
     * @param {Float32Array} left - Left channel samples.
     * @param {Float32Array} right - Right channel samples.
     * @param {number} count - Number of samples to push.
     */
    pushSamples(left, right, count) {
        if (this.audioEnabled === false) return;
        for (let i = 0; i < count; i++) {
            // Drop samples if buffer is full (prevents catastrophic lag pileups)
            if (this.samplesInQueue >= this.bufferSize) break;

            this.ringBufferL[this.writePtr] = left[i];
            this.ringBufferR[this.writePtr] = right[i];
            
            this.writePtr = (this.writePtr + 1) % this.bufferSize;
            this.samplesInQueue++;
        }
    }

    /**
     * Consumes samples from the Ring Buffer and outputs them to the speakers.
     * Triggered automatically by the Web Audio API.
     */
    onAudioProcess(event) {
        const outL = event.outputBuffer.getChannelData(0);
        const outR = event.outputBuffer.getChannelData(1);
        if (this.audioEnabled === false) {
            outL.fill(0.0);
            outR.fill(0.0);
            return;
        }
        const requestedSamples = outL.length;

        for (let i = 0; i < requestedSamples; i++) {
            if (this.samplesInQueue > 0) {
                outL[i] = this.ringBufferL[this.readPtr];
                outR[i] = this.ringBufferR[this.readPtr];
                
                this.readPtr = (this.readPtr + 1) % this.bufferSize;
                this.samplesInQueue--;
            } else {
                // Buffer underrun: output silence to prevent looping old noise
                outL[i] = 0.0;
                outR[i] = 0.0;
            }
        }
    }
}