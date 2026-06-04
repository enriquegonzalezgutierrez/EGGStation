/**
 * Project: EGGStation - Super Nintendo (SNES) Audio Processor
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES Audio DSP & Synchronization Service
 * 
 * ROLE:
 * Bridges the SNES APU/DSP output to the Web Audio API.
 * Implements a high-capacity 32768-sample Ring Buffer to prevent
 * pointer-snapping and frequency modulation artifacts.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Manages audio buffering and DSP graph only.
 */

class SnesAudioProcessor {
    constructor() {
        this.audioEnabled = true;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        this.samplesPerFrame = this.audioCtx.sampleRate / 60;

        // Expanded Ring Buffer (32768 samples for high jitter absorption)
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
        
        this.delayL.delayTime.value = 0.005; 
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
        console.log(`[EGGStation::SNES] Audio Processor Synced. Buffer: 32768 samples.`);
    }

    resume() {
        if (this.audioEnabled && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

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

    stop() {
        this.inputBufferPos = 0;
        this.inputReadPos = 0;
        this.inputBufferL.fill(0);
        this.inputBufferR.fill(0);
    }

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
     * Pushes samples into the Ring Buffer using high speed masking (& 0x7fff)
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
     * Consumes samples using a safety cushion algorithm to avoid pitch warping.
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