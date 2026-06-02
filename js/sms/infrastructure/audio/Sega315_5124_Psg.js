/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG (DRC & Cache Optimized)
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * Optimized with cached frequency phase steps to eliminate expensive floating-point
 * divisions inside the high-frequency audio synthesis hot path.
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

        // Hot Path Cache: Pre-calculated phase step sizes to eliminate divisions inside synthesis loop
        this.cachedStepSize = new Float32Array(4);

        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        this.isMuted = false;
        this.audioInitialized = false;

        // Pre-calculated pseudo-random noise buffer
        this.squareWaveLen = 8192;
        this.randDim = 65536;
        this.randBuffer = new Float32Array(this.randDim);
        for (let s = 0; s < this.randDim; s++) {
            this.randBuffer[s] = Math.random() * 1.0;
        }
        this.randPos = 0;

        // Constant derived from SMS Master Clock (3579545.0 / 0.37)
        this.PSG_CLOCK_CONSTANT = 9674445.945945946;

        // Web Audio components
        this.context = null;
        this.jsNode = null;
        this.gainNode = null;
        
        this.biquadFilterNode = null; 
        this.convolverNode = null;    
        this.delayNode = null;        
        this.panLeft = null;          
        this.panRight = null;         
        
        this.wetGain = null;          
        this.dryGain = null;          
        this.haasGain = null;         

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
     * Pre-calculates acoustic impulse response data to bypass network fetches.
     * @returns {AudioBuffer}
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
     * Changes active audio DSP paths dynamically.
     * @param {number} mode - Selected filter index.
     */
    setAudioFilter(mode) {
        this.audioFilterMode = mode;
        if (!this.audioInitialized) return;

        switch (mode) {
            case 1:
                this.biquadFilterNode.frequency.value = 3500; 
                this.dryGain.gain.value = 1.0;
                this.haasGain.gain.value = 0.0;
                this.wetGain.gain.value = 0.0; 
                break;
                
            case 2:
                this.biquadFilterNode.frequency.value = 5500; 
                this.dryGain.gain.value = 0.7;
                this.delayNode.delayTime.value = 0.02; 
                this.haasGain.gain.value = 0.7;
                this.wetGain.gain.value = 0.0; 
                break;

            case 3:
                this.biquadFilterNode.frequency.value = 6500; 
                this.dryGain.gain.value = 0.65; 
                this.delayNode.delayTime.value = 0.025; 
                this.haasGain.gain.value = 0.65;
                this.wetGain.gain.value = 0.80; 
                break;

            case 0:
            default:
                this.biquadFilterNode.frequency.value = 20000; 
                this.dryGain.gain.value = 1.0;
                this.haasGain.gain.value = 0.0;
                this.wetGain.gain.value = 0.0; 
                break;
        }
    }

    /**
     * Initializes the Web Audio API context and structures the parallel node graph.
     * @param {ZilogZ80} cpu - System CPU instance.
     */
    async startMix(cpu) {
        try {
            this.audioEnabled = true;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
            
            this.multiplier = Math.floor(cpu.clockRate / this.context.sampleRate);
            
            this.jsNode = this.context.createScriptProcessor(this.audioBufSize, 0, 1);
            this.jsNode.onaudioprocess = (e) => this.mixFunction(e);

            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.5; 
    
            this.biquadFilterNode = this.context.createBiquadFilter();
            this.biquadFilterNode.type = 'lowpass';

            this.convolverNode = this.context.createConvolver();
            this.convolverNode.buffer = this.synthesizeCabinetImpulseResponse(); 

            this.delayNode = this.context.createDelay();
            this.panLeft = this.context.createStereoPanner();
            this.panRight = this.context.createStereoPanner();
            this.panLeft.pan.value = -0.8;
            this.panRight.pan.value = 0.8;

            this.dryGain = this.context.createGain();
            this.haasGain = this.context.createGain();
            this.wetGain = this.context.createGain();

            this.jsNode.connect(this.biquadFilterNode);

            this.biquadFilterNode.connect(this.panLeft);
            this.panLeft.connect(this.dryGain);

            this.biquadFilterNode.connect(this.delayNode);
            this.delayNode.connect(this.panRight);
            this.panRight.connect(this.haasGain);

            this.biquadFilterNode.connect(this.convolverNode);
            this.convolverNode.connect(this.wetGain);

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
     * Recalculates and caches the phase step size of a voice.
     * Crucial optimization: eliminates divisions inside the active mix loop.
     * @param {number} voiceIndex - Target channel (0 to 3).
     */
    recalculateVoiceStep(voiceIndex) {
        const toneVal = this.toneregister[voiceIndex];
        if (toneVal === 0) {
            this.cachedStepSize[voiceIndex] = 0;
        } else {
            this.cachedStepSize[voiceIndex] = this.PSG_CLOCK_CONSTANT / (32 * toneVal);
        }
    }

    /**
     * Decodes 8-bit bus writes and enqueues events.
     * @param {number} eventByte - Value written to port.
     */
    writeByte(eventByte) {
        this.eventsQueue.push([eventByte, this.internalClock]);
        
        if (eventByte & 0x80) {
            this.chan2belatched = (eventByte >> 5) & 0x03;
            this.what2latch = ((eventByte & 0x10) === 0x10) ? 1 : 0;
        }
    }

    /**
     * Processes enqueued hardware writes up to a target clock.
     * @param {number} targetClock - Sync clock limit.
     */
    processEvents(targetClock) {
        while (this.eventsQueue.length > 0 && this.eventsQueue[0][1] <= targetClock) {
            const curEvent = this.eventsQueue.shift();
            const eventByte = curEvent[0];

            if (eventByte & 0x80) {
                this.chan2belatched = (eventByte >> 5) & 0x03;
                this.what2latch = ((eventByte & 0x10) === 0x10) ? 1 : 0;
                if (this.what2latch === 1) {
                    this.volregister[this.chan2belatched] = eventByte & 0x0f;
                } else {
                    this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((eventByte << 4) & 0x00FF);
                    this.recalculateVoiceStep(this.chan2belatched);
                }
            } else {
                if (this.what2latch === 1) {
                    this.volregister[this.chan2belatched] = eventByte & 0xf;
                } else {
                    this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff) | ((eventByte << 8) & 0x3F00);
                    this.recalculateVoiceStep(this.chan2belatched);
                }
            }
        }
    }

    /**
     * Evaluates clock drift between physical audio output and emulated CPU cycles.
     * @returns {number}
     */
    getClockDrift() {
        if (!this.audioInitialized) return 0;
        return this.internalClock - this.internalClockPos;
    }

    /**
     * Synthesizes audio samples synchronously.
     * Optimized to achieve O(1) step updates via pre-calculated phase step caching.
     * @param {AudioProcessingEvent} e
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) return;

        const data = e.outputBuffer.getChannelData(0);
        const dataLength = data.length;

        if (this.isMuted) {
            data.fill(0);
            return;
        }

        let numClocksToCover = this.internalClock - this.internalClockPos;

        // DRC Transient protection: snap timeline immediately if drift crosses buffer thresholds
        const maxAllowedDrift = this.multiplier * this.audioBufSize * 4;
        if (Math.abs(numClocksToCover) > maxAllowedDrift) {
            this.internalClockPos = this.internalClock;
            numClocksToCover = 0;
        }

        if (numClocksToCover <= 0) {
            data.fill(0);
            return;
        }
        
        const realStep = numClocksToCover / (this.multiplier * dataLength);

        for (let sampleIndex = 0; sampleIndex < dataLength; sampleIndex++) {
            const sampleClock = this.internalClockPos + (sampleIndex * realStep * this.multiplier);

            // Execute register updates synced to this exact sample
            this.processEvents(sampleClock);

            let finalSample = 0.0;

            // Synthesize Tone Channels (Voices 0 to 2)
            for (let voiceIndex = 0; voiceIndex < 3; voiceIndex++) {
                const vol = this.volregister[voiceIndex];
                if (vol !== 0xf && this.toneregister[voiceIndex] !== 0) {
                    const wavePhase = this.wavePos[voiceIndex] % this.squareWaveLen;
                    const curSamp = (wavePhase < (this.squareWaveLen >> 1)) ? 1.0 : 0.0;
                    
                    finalSample += curSamp * (15 - vol) * 0.066666666;

                    // Apply cached, pre-calculated step size increment
                    this.wavePos[voiceIndex] += this.cachedStepSize[voiceIndex];
                    if (this.wavePos[voiceIndex] >= this.squareWaveLen) {
                        this.wavePos[voiceIndex] %= this.squareWaveLen;
                    }
                }
            }

            // Synthesize Noise Channel (Voice 3)
            const noiseVol = this.volregister[3];
            if (noiseVol !== 0xf) {
                const curSamp = this.randBuffer[this.randPos] * 2.0;
                finalSample += curSamp * (15 - noiseVol) * 0.066666666;

                this.randPos = (this.randPos + 1) % this.randDim;
            }

            data[sampleIndex] = finalSample * 0.25;
        }

        this.internalClockPos += numClocksToCover;
    }

    /**
     * Fallback interface for abstract orchestrator implementations.
     */
    syncWorkletState() {}
}