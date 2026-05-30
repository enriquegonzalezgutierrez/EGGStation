/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG (DRC Optimized)
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * 
 * OPTIMIZED FOR PHASE 1 (DRC): Exposes high-precision clock drift error signals 
 * and handles temporal transience clamping to prevent audio popping and pitch-bend 
 * anomalies during emulator pauses, fast-forwards, or frame skips.
 */

class Sega315_5124_Psg {
    constructor() {
        // Hardware Registers
        this.volregister = [0xf, 0xf, 0xf, 0xf]; 
        this.toneregister = [0, 0, 0, 0];       
        this.wavePos = [0, 0, 0, 0];            
        this.chan2belatched = 0; 
        this.what2latch = 0;     
        this.latch = 0;

        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        this.isMuted = false;
        this.audioInitialized = false;

        // Zero-allocation noise buffer
        this.squareWaveLen = 8192;
        this.randDim = 65536;
        this.randBuffer = new Float32Array(this.randDim);
        for (let s = 0; s < this.randDim; s++) {
            this.randBuffer[s] = Math.random() * 1.0;
        }
        this.randPos = 0;

        // Web Audio API standard context and native dsp nodes
        this.context = null;
        this.jsNode = null;
        this.gainNode = null;
        
        // Hardware-Accelerated DSP Nodes
        this.biquadFilterNode = null; // Native Low-Pass Filter
        this.convolverNode = null;    // Native Convolution Reverb
        this.delayNode = null;        // Native Delay Node (for Haas Stereo)
        this.panLeft = null;          // Native Stereo Panner
        this.panRight = null;         // Native Stereo Panner
        
        this.wetGain = null;          // Reverb volume mixer
        this.dryGain = null;          // Clean volume mixer
        this.haasGain = null;         // Haas Stereo volume mixer

        this.audioBufSize = 2048;     
        this.multiplier = 0;
        this.audioEnabled = false;
        this.audioFilterMode = 0; 
    }

    /**
     * Controls the active muting state of the audio output.
     * @param {boolean} shouldMute - True to mute the hardware voices.
     */
    setMuted(shouldMute) {
        this.isMuted = shouldMute;
    }

    /**
     * Mathematically synthesizes the Acoustic Impulse Response (IR) of an 80s 
     * wood arcade cabinet, bypassing local CORS file loading blocks.
     * @returns {AudioBuffer} The synthesized stereo cabinet impulse response.
     */
    synthesizeCabinetImpulseResponse() {
        const rate = this.context.sampleRate;
        const length = Math.floor(rate * 0.12); 
        const buffer = this.context.createBuffer(2, length, rate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const decay = Math.exp(-i / (rate * 0.025)); 
            const noiseL = (Math.random() * 2.0 - 1.0) * decay;
            const noiseR = (Math.random() * 2.0 - 1.0) * decay;

            left[i] = noiseL;
            right[i] = (i > 100) ? noiseR * 0.85 : 0.0;
        }

        return buffer;
    }

    /**
     * Dynamic routing changer. Adjusts parameters of native C++ Web Audio nodes 
     * on the fly, avoiding structural re-connections and pop noises.
     * @param {number} mode - Selected filter
     */
    setAudioFilter(mode) {
        this.audioFilterMode = mode;
        if (!this.audioInitialized) return;

        switch (mode) {
            case 1: // Arcade Warmth (Low-pass Mono)
                this.biquadFilterNode.frequency.value = 3500; 
                this.dryGain.gain.value = 1.0;
                this.haasGain.gain.value = 0.0;
                this.wetGain.gain.value = 0.0; 
                break;
                
            case 2: // Lush 3D Stereo (Haas spatializer)
                this.biquadFilterNode.frequency.value = 5500; 
                this.dryGain.gain.value = 0.7;
                this.delayNode.delayTime.value = 0.02; // 20ms delay on right channel
                this.haasGain.gain.value = 0.7;
                this.wetGain.gain.value = 0.0; 
                break;

            case 3: // 2026 Spatial Atmos (Atmos Convolution + Haas Stereo)
                this.biquadFilterNode.frequency.value = 6500; 
                this.dryGain.gain.value = 0.65; 
                this.delayNode.delayTime.value = 0.025; // 25ms wide delay
                this.haasGain.gain.value = 0.65;
                this.wetGain.gain.value = 0.80; // Activate physical room reflections
                break;

            case 0: // Original Mono (Sharp & Dry)
            default:
                this.biquadFilterNode.frequency.value = 20000; 
                this.dryGain.gain.value = 1.0;
                this.haasGain.gain.value = 0.0;
                this.wetGain.gain.value = 0.0; 
                break;
        }
    }

    /**
     * Initializes the host Web Audio API context and builds the parallel DSP node graph.
     * @param {ZilogZ80} cpu - System CPU reference used to sync internal clock steps.
     */
    async startMix(cpu) {
        try {
            this.audioEnabled = true;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
            
            this.multiplier = Math.floor(cpu.clockRate / this.context.sampleRate);
            
            // Generate mono audio from JS, spatialization is handled by C++ nodes
            this.jsNode = this.context.createScriptProcessor(this.audioBufSize, 0, 1);
            this.jsNode.onaudioprocess = (e) => this.mixFunction(e);

            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.5; // Master volume scale
    
            // ========================================================================
            // NATIVE WEB AUDIO DSP NODE GRAPH WITH CONVOLUTION
            // ========================================================================
            
            // 1. Create BiquadFilter (Hardware-accelerated Low-Pass)
            this.biquadFilterNode = this.context.createBiquadFilter();
            this.biquadFilterNode.type = 'lowpass';

            // 2. Create Convolver (Hardware-accelerated Reverb)
            this.convolverNode = this.context.createConvolver();
            this.convolverNode.buffer = this.synthesizeCabinetImpulseResponse(); 

            // 3. Create Haas Delay Nodes (Stereo widening)
            this.delayNode = this.context.createDelay();
            this.panLeft = this.context.createStereoPanner();
            this.panRight = this.context.createStereoPanner();
            this.panLeft.pan.value = -0.8;
            this.panRight.pan.value = 0.8;

            // 4. Create Parallel Gain Mixers (Wet/Dry/Haas balance)
            this.dryGain = this.context.createGain();
            this.haasGain = this.context.createGain();
            this.wetGain = this.context.createGain();

            // Connect Generator to Filter
            this.jsNode.connect(this.biquadFilterNode);

            // Split into 3 parallel paths
            // Path A: Dry Left Channel
            this.biquadFilterNode.connect(this.panLeft);
            this.panLeft.connect(this.dryGain);

            // Path B: Haas Delayed Right Channel
            this.biquadFilterNode.connect(this.delayNode);
            this.delayNode.connect(this.panRight);
            this.panRight.connect(this.haasGain);

            // Path C: Wet Convolution Reverb path
            this.biquadFilterNode.connect(this.convolverNode);
            this.convolverNode.connect(this.wetGain);

            // Merge paths back to the master Gain output
            this.dryGain.connect(this.gainNode);
            this.haasGain.connect(this.gainNode);
            this.wetGain.connect(this.gainNode);

            this.gainNode.connect(this.context.destination);

            this.audioInitialized = true;
        }
        catch(e) {
            console.error("PSG::Failed to bootstrap Web Audio.", e);
            this.audioEnabled = false;
        }        
    }

    /**
     * Steps the internal PSG sound clock index.
     * @param {number} totCpuCycles - Global elapsed CPU cycles.
     */
    step(totCpuCycles) {
        this.internalClock = totCpuCycles;
    }

    /**
     * Sends an 8-bit command byte matching a specific CPU cycle timestamp to the queue.
     * @param {number} eventByte - Sound register parameter byte.
     */
    writeByte(eventByte) {
        this.eventsQueue.push([eventByte, this.internalClock]);
        
        // Shadow copy for savestates consistency
        if (eventByte & 0x80) {
            this.chan2belatched = (eventByte >> 5) & 0x03;
            this.what2latch = ((eventByte & 0x10) === 0x10) ? 1 : 0;
        }
    }

    /**
     * Returns the current Clock Drift of the audio engine.
     * High-precision feedback error signal utilized by the Orchestrator's DRC closed loop.
     * @returns {number} The difference between the simulated CPU clock and audio reproduction cursor.
     */
    getClockDrift() {
        if (!this.audioInitialized) return 0;
        return this.internalClock - this.internalClockPos;
    }

    /**
     * Audio Processor Callback. Consumes queued register updates on a timeline-accurate basis.
     * OPTIMIZED: Evaluates synthesis phase changes consolidated per audio sample.
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) return;

        const data = e.outputBuffer.getChannelData(0); // Mono processing

        if (this.isMuted) {
            for (let i = 0; i < data.length; i++) data[i] = 0;
            return;
        }

        let numClocksToCover = this.internalClock - this.internalClockPos;

        // DRC TRANSIENT CLAMPING:
        // If the CPU is way too far ahead or behind (e.g. paused, fast-forward, or system stutter),
        // snap the audio cursor directly to the CPU timeline to prevent audio popping or pitch-bend distortion.
        const maxAllowedDrift = this.multiplier * this.audioBufSize * 4; // Allow 4 audio buffer blocks of leeway
        if (Math.abs(numClocksToCover) > maxAllowedDrift) {
            this.internalClockPos = this.internalClock;
            numClocksToCover = 0;
        }

        if (numClocksToCover <= 0) {
            for (let i = 0; i < data.length; i++) data[i] = 0;
            return;
        }
        
        let realStep = numClocksToCover / (this.multiplier * data.length);

        for (let sampleIndex = 0; sampleIndex < data.length; sampleIndex++) {
            
            // Calculate current CPU clock limit matching this specific audio sample
            let sampleClock = this.internalClockPos + (sampleIndex * realStep * this.multiplier);

            // Process any written hardware registers up to this sample's clock timing
            while (this.eventsQueue.length > 0 && this.eventsQueue[0][1] <= sampleClock) {
                let curEvent = this.eventsQueue.shift();
                let eventByte = curEvent[0];

                if (eventByte & 0x80) {
                    this.chan2belatched = (eventByte >> 5) & 0x03;
                    this.what2latch = ((eventByte & 0x10) === 0x10) ? 1 : 0;
                    if (this.what2latch === 1) {
                        this.volregister[this.chan2belatched] = eventByte & 0x0f;
                    } else {
                        this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((eventByte << 4) & 0x00FF);
                    }
                } else {
                    if (this.what2latch === 1) {
                        this.volregister[this.chan2belatched] = eventByte & 0xf;
                    } else {
                        this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff) | ((eventByte << 8) & 0x3F00);
                    }
                }
            }

            // Synthesize active physical square/noise channels ONCE per audio sample
            let finalSample = 0.0;
            for (let voiceIndex = 0; voiceIndex < 4; voiceIndex++) {
                let curSamp = 0.0;
                if (this.volregister[voiceIndex] !== 0xf) {
                    if (this.toneregister[voiceIndex] !== 0) {
                        if (voiceIndex < 3) {
                            let wavePhaseOffset = Math.floor(this.wavePos[voiceIndex] % this.squareWaveLen);
                            if (wavePhaseOffset < (this.squareWaveLen >> 1)) curSamp = 1.0;
                            
                            // Consolidated frequency phase sum per single sample index
                            let vBlankFreqAdjust = (3579545.0 / (32 * this.toneregister[voiceIndex])) / 0.37;
                            this.wavePos[voiceIndex] += vBlankFreqAdjust;
                            this.wavePos[voiceIndex] %= this.squareWaveLen;
                        } else {
                            curSamp = this.randBuffer[this.randPos] * 2.0;
                            this.randPos = (this.randPos + 1) % this.randDim;
                        }
                    }
                    curSamp = (curSamp * (15 - this.volregister[voiceIndex])) * 0.066666666; 
                    finalSample += curSamp;
                }
            }
            data[sampleIndex] = (finalSample * 0.25);
        }

        this.internalClockPos += numClocksToCover;
    }

    /**
     * Fallback stub required by EmulatorOrchestrator integration.
     */
    syncWorkletState() {
        // No operation needed. Running synchronously.
    }
}