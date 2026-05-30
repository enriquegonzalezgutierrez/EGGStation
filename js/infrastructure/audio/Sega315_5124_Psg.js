/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * Optimized under Strategy B (Zero-Allocation) and integrated with dynamic
 * real-time software DSP filters, including native hardware-accelerated 
 * BiquadFilters and synthesized Acoustic Convolution Reverb.
 */

class Sega315_5124_Psg {
    constructor() {
        // Hardware Registers (0x0 = Max, 0xF = Muted)
        this.volregister = [0xf, 0xf, 0xf, 0xf]; 
        this.toneregister = [0, 0, 0, 0];       
        this.wavePos = [0, 0, 0, 0];            

        this.chan2belatched = 0; 
        this.what2latch = 0;     
        this.latch = 0;

        // Queue for thread-safe asynchronous sound register writes
        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        // White noise generator variables
        this.squareWaveLen = 8192;
        this.randDim = 65536;
        this.randBuffer = [];
        for (let s = 0; s < this.randDim; s++) {
            this.randBuffer.push(Math.random() * 1.0);
        }
        this.randPos = 0;

        // Play states
        this.isMuted = false;
        this.audioInitialized = false;

        // Web Audio API standard context and native DSP nodes
        this.context = null;
        this.gainNode = null;
        this.jsNode = null;
        this.biquadFilterNode = null; // Native C++ Low-Pass Filter
        this.convolverNode = null;     // Native C++ Convolution Reverb
        this.wetGain = null;          // Reverb volume mixer
        this.dryGain = null;          // Clean volume mixer

        this.audioBufSize = 2048; // Expanded buffer for Strategy B stability
        this.multiplier = 0;
        this.audioEnabled = false;

        // ========================================================================
        // HIGH-PERFORMANCE DSP PRE-ALLOCATED BUFFER ARRAYS (Strategy B)
        // ========================================================================
        this.audioFilterMode = 0; // 0: Mono, 1: Low-Pass, 2: Haas Stereo, 3: Spatial Atmos
        this.delayBuffer = new Float32Array(2048).fill(0.0); // Circular delay line
        this.delayBufferWritePos = 0;
        this.delayBufferReadPos = 0;
        this.delaySamplesLength = 882; // 20ms delay at 44.1kHz
        
        this.smoothedValue = 0.0; // Filter accumulator
        this.sampleOut = 0.0;

        // Pre-allocated loop variables to guarantee zero-heap-allocations on execution (Strategy B)
        this.runningTotal = 0.0;
        this.curSamp = 0.0;
        this.finalSample = 0.0;
        this.realStep = 0.0;
        this.numClocksToCover = 0;
        this.curEvent = null;
        this.eventByte = 0;
        
        this.sampleIndex = 0;
        this.multiplierIndex = 0;
        this.voiceIndex = 0;
        this.wavePhaseOffset = 0;
        this.vBlankFrequencyAdjustment = 0.0;
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
        const length = Math.floor(rate * 0.12); // Short 120ms decay is perfect for a small wood cabinet
        const buffer = this.context.createBuffer(2, length, rate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
            // Exponential decay envelope
            const decay = Math.exp(-i / (rate * 0.025)); // 25ms decay constant
            
            // Decaying white noise
            const noiseL = (Math.random() * 2.0 - 1.0) * decay;
            const noiseR = (Math.random() * 2.0 - 1.0) * decay;

            // Introduce slight phase delay between left and right channels to widen stereo field
            left[i] = noiseL;
            if (i > 100) {
                right[i] = noiseR * 0.85; // Slight volume attenuation and phase offset
            } else {
                right[i] = 0.0;
            }
        }

        return buffer;
    }

    /**
     * Dynamic routing changer. Adjusts parameters of native C++ Web Audio nodes 
     * on the fly, avoiding structural re-connections and pop noises.
     * @param {number} mode - Selected filter (0: Dry Mono, 1: Low-pass Cabinet, 2: Haas Stereo, 3: Spatial Atmos)
     */
    setAudioFilter(mode) {
        this.audioFilterMode = mode;
        if (!this.audioInitialized) return;

        switch (mode) {
            case 1: // Arcade Warmth (Low-pass)
                this.biquadFilterNode.frequency.value = 3500; // Cut off frequencies above 3.5kHz
                this.dryGain.gain.value = 1.0;
                this.wetGain.gain.value = 0.0; // Mute convolution
                this.delaySamplesLength = 0;   // Collapse to mono
                break;
                
            case 2: // Lush 3D Stereo (Haas spatializer)
                this.biquadFilterNode.frequency.value = 5500; // Smooth out high-end sutilmente
                this.dryGain.gain.value = 1.0;
                this.wetGain.gain.value = 0.0; // Mute convolution
                this.delaySamplesLength = Math.floor(0.02 * this.context.sampleRate); // 20ms delay
                break;

            case 3: // 2026 Spatial Atmos (Atmos Convolution + Haas Stereo!)
                this.biquadFilterNode.frequency.value = 6500; // Bright but smooth
                this.dryGain.gain.value = 0.65; // Mix clean stereo signal
                this.wetGain.gain.value = 0.80; // Mix physical room reflections
                this.delaySamplesLength = Math.floor(0.025 * this.context.sampleRate); // 25ms wide Haas delay
                break;

            case 0: // Original Mono (Sharp & Dry)
            default:
                this.biquadFilterNode.frequency.value = 20000; // Fully open (bypassed)
                this.dryGain.gain.value = 1.0;
                this.wetGain.gain.value = 0.0; // Mute convolution
                this.delaySamplesLength = 0;   // Collapse to mono
                break;
        }
    }

    /**
     * Initializes the host Web Audio API context and builds the parallel DSP node graph.
     * @param {ZilogZ80} cpu - System CPU reference used to sync internal clock steps.
     */
    startMix(cpu) {
        try {
            this.audioEnabled = true;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
    
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.5; // Master volume scale
    
            // Create snychronous raw sample generator node
            this.jsNode = this.context.createScriptProcessor(this.audioBufSize, 0, 2);
            this.jsNode.onaudioprocess = (e) => this.mixFunction(e);
    
            // ========================================================================
            // NATIVE WEB AUDIO DSP NODE GRAPH WITH CONVOLUTION (Option 2)
            // ========================================================================
            
            // 1. Create BiquadFilter (Hardware-accelerated Low-Pass)
            this.biquadFilterNode = this.context.createBiquadFilter();
            this.biquadFilterNode.type = 'lowpass';
            this.biquadFilterNode.frequency.value = 20000; // Default: open

            // 2. Create Convolver (Hardware-accelerated Reverb)
            this.convolverNode = this.context.createConvolver();
            this.convolverNode.buffer = this.synthesizeCabinetImpulseResponse(); // load in-memory IR

            // 3. Create Parallel Gain Mixers (Wet/Dry balance)
            this.dryGain = this.context.createGain();
            this.dryGain.gain.value = 1.0;

            this.wetGain = this.context.createGain();
            this.wetGain.gain.value = 0.0; // Default: muted

            // 4. Connect snychronous node to Low-Pass
            this.jsNode.connect(this.biquadFilterNode);

            // Split path into Parallel Dry and Wet channels
            // Path A: Dry Clean path
            this.biquadFilterNode.connect(this.dryGain);

            // Path B: Wet Convolution Reverb path
            this.biquadFilterNode.connect(this.convolverNode);
            this.convolverNode.connect(this.wetGain);

            // Merge paths back to the master Gain output
            this.dryGain.connect(this.gainNode);
            this.wetGain.connect(this.gainNode);

            this.gainNode.connect(this.context.destination);

            this.multiplier = Math.floor(cpu.clockRate / this.context.sampleRate);
            this.audioInitialized = true;
        }
        catch(e) {
            console.error("PSG::Failed to bootstrap Web Audio.", e);
            this.webAudioAPIsupported = false;
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
     * Enqueues an 8-bit command byte matching a specific CPU cycle timestamp.
     * @param {number} b - Sound register parameter byte.
     */
    writeByte(b) {
        this.eventsQueue.push([b, this.internalClock]);
    }

    /**
     * Audio Processor Callback. Consumes queued register updates on a timeline-accurate basis.
     * Pre-allocated loop variables are re-used to ensure zero-heap-allocations on execution.
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) return;

        const dataL = e.outputBuffer.getChannelData(0);
        const dataR = e.outputBuffer.getChannelData(1);

        this.numClocksToCover = this.internalClock - this.internalClockPos;
        if (this.numClocksToCover <= 0) return;
        
        this.realStep = this.numClocksToCover / (this.multiplier * this.audioBufSize);

        for (this.sampleIndex = 0; this.sampleIndex < this.audioBufSize; this.sampleIndex++) {
            this.runningTotal = 0.0;

            for (this.multiplierIndex = 0; this.multiplierIndex < this.multiplier; this.multiplierIndex++) {
                if ((this.eventsQueue.length > 0) && (this.eventsQueue[0][1] <= Math.floor(this.internalClockPos))) {
                    this.curEvent = this.eventsQueue.shift();
                    this.eventByte = this.curEvent[0];

                    if (this.eventByte & 0x80) {
                        this.chan2belatched = (this.eventByte >> 5) & 0x03;
                        this.what2latch = ((this.eventByte & 0x10) === 0x10) ? 1 : 0;

                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = this.eventByte & 0x0f;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((this.eventByte << 4) & 0x00FF);
                        }
                    } else {
                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = this.eventByte & 0xf;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff) | ((this.eventByte << 8) & 0x3F00);
                        }
                    }
                }

                this.runningTotal += this.mixVoices() * 0.25;                 
                this.internalClockPos += this.realStep;
            }

            this.runningTotal /= this.multiplier;

            this.sampleOut = this.runningTotal;

            // Apply Arcade Low-Pass filter (cures square wave harshness)
            if (this.audioFilterMode === 1) {
                this.smoothedValue += (this.runningTotal - this.smoothedValue) * 0.15; // IIR Filter
                this.sampleOut = this.smoothedValue;
            }

            // Apply dynamic 3D Stereo spatializer (Haas delay line)
            // Works for both standard Lush Stereo (mode 2) and Spatial Atmos (mode 3)
            if ((this.audioFilterMode === 2 || this.audioFilterMode === 3) && this.delaySamplesLength > 0) {
                this.delayBuffer[this.delayBufferWritePos] = this.sampleOut;
                this.delayBufferReadPos = (this.delayBufferWritePos - this.delaySamplesLength + 2048) % 2048;

                dataL[this.sampleIndex] = this.sampleOut;
                dataR[this.sampleIndex] = this.delayBuffer[this.delayBufferReadPos];
                
                this.delayBufferWritePos = (this.delayBufferWritePos + 1) % 2048;
            } else {
                dataL[this.sampleIndex] = this.sampleOut;
                dataR[this.sampleIndex] = this.sampleOut;
            }
        }

        if (this.eventsQueue.length > 0) {
            this.eventsQueue = [];        
        }
    }

    /**
     * Synthesizes waveforms for standard square-wave and noise generation buffers.
     * Uses zero-allocation logic.
     * @returns {number} Combined mono audio sample level.
     */
    mixVoices() {
        if (this.isMuted) {
            return 0; 
        }

        this.finalSample = 0.0;

        for (this.voiceIndex = 0; this.voiceIndex < 4; this.voiceIndex++) {
            this.curSamp = 0.0;

            if (this.volregister[this.voiceIndex] !== 0xf) {
                if (this.toneregister[this.voiceIndex] !== 0) {
                    if (this.voiceIndex < 3) {
                        this.wavePhaseOffset = Math.floor(this.wavePos[this.voiceIndex] % this.squareWaveLen);
                        if (this.wavePhaseOffset < (this.squareWaveLen >> 1)) {
                            this.curSamp = 1.0;
                        }
                        
                        this.vBlankFrequencyAdjustment = (3579545.0 / (32 * this.toneregister[this.voiceIndex])) / (this.multiplier * 0.37);
                        this.wavePos[this.voiceIndex] += this.vBlankFrequencyAdjustment;
                        this.wavePos[this.voiceIndex] %= this.squareWaveLen;
                    } else {
                        this.curSamp = this.randBuffer[this.randPos] * 2.0;
                        this.randPos = (this.randPos + 1) % this.randDim;
                    }
                }

                this.curSamp = (this.curSamp * (15 - this.volregister[this.voiceIndex])) * 0.066666666; 
                this.finalSample += this.curSamp;
            }
        }

        return this.finalSample;
    }
}