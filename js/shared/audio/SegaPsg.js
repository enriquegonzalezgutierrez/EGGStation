/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/audio/SegaPsg.js
 * 
 * Role:
 * Infrastructure Layer: Sega SN76489-compatible Programmable Sound Generator (PSG).
 * Emulates three square-wave tone channels and one feedback noise channel. 
 * Supports both active Web Audio mixing (for SMS) and passive buffer-filling (for Genesis).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for emulating 
 *    the Texas Instruments SN76489 sound chip (noise LFSR, tone generators, and attenuation).
 * 2. Liskov Substitution Principle (LSP): Fully interchangeable. It can act as a 
 *    standalone WebAudio node (SMS) or as a passive sample synthesizer (Genesis) 
 *    without violating execution contracts.
 * 3. Open/Closed Principle (OCP): Soundstage DSP filters can be configured or 
 *    bypassed without altering the baseline square-wave frequency clock decay.
 */

// Attenuation volume mapping table (2dB steps - SN76489 standard)
const SEGA_PSG_VOLUME_TABLE = new Int16Array([
    2340, 1859, 1476, 1173, 931, 740, 587, 469, 370, 294, 234, 185, 147, 117, 93, 0
]);

const SEGA_PSG_NOISE_TYPE_PERIODIC = 0;
const SEGA_PSG_NOISE_TYPE_WHITE    = 1;

class SegaPsg {
    constructor() {
        // Hardware Registers
        this.volregister = [0xf, 0xf, 0xf, 0xf]; 
        this.toneregister = [0, 0, 0, 0];       
        this.wavePos = [0, 0, 0, 0];            
        this.chan2belatched = 0; 
        this.what2latch = 0;     
        this.latch = 0;

        // Genesis specific structures
        this.tonesCountdown = new Int16Array(4);       
        this.tonesCountdownMaster = new Int16Array(4); 
        this.tonesAttenuation = new Uint8Array(4);     
        this.tonesOutputState = new Uint8Array(4);     
        
        this.noiseType = SEGA_PSG_NOISE_TYPE_PERIODIC;
        this.noiseUseTone3 = false;
        this.noiseShiftRegister = 0x8000;
        this.noiseOut = 0;

        this.toneDisabled = new Uint8Array(3);
        this.noiseDisabled = 0;

        // Hot Path Cache: Pre-calculated phase step sizes to eliminate divisions
        this.cachedStepSize = new Float32Array(4);

        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        this.isMuted = false;
        this.audioInitialized = false;

        // Pre-calculated pseudo-random noise buffer for SMS
        this.squareWaveLen = 8192;
        this.randDim = 65536;
        this.randBuffer = new Float32Array(this.randDim);
        for (let s = 0; s < this.randDim; s++) {
            this.randBuffer[s] = Math.random() * 1.0;
        }
        this.randPos = 0;

        // Constant derived from SMS Master Clock (3579545.0 / 0.37)
        this.PSG_CLOCK_CONSTANT = 9674445.945945946;

        // Web Audio components (For SMS active mode)
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

        this.initialise();
    }

    /**
     * Resets internal audio registers and timing clocks back to default power-on states.
     * Supports both British (initialise) and American (initialize) spelling conventions.
     */
    initialise() {
        this.initialize();
    }

    initialize() {
        // Reset SMS structures
        this.volregister.fill(0xf); // Silence
        this.toneregister.fill(0);
        this.wavePos.fill(0);
        this.chan2belatched = 0;
        this.what2latch = 0;
        this.latch = 0;

        // Reset Genesis structures
        this.tonesCountdown.fill(0);
        this.tonesCountdownMaster.fill(1); // Set to 1 to prevent startup division-by-zero
        this.tonesAttenuation.fill(0xf);  // Silence
        this.tonesOutputState.fill(0);

        this.noiseType = SEGA_PSG_NOISE_TYPE_PERIODIC;
        this.noiseUseTone3 = false;
        this.noiseShiftRegister = 0x8000;
        this.noiseOut = 0;

        this.toneDisabled.fill(0);
        this.noiseDisabled = 0;

        this.cachedStepSize.fill(0);
        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;
        this.randPos = 0;
    }

    /**
     * Controls the active muting state of the audio output.
     */
    setMuted(shouldMute) {
        this.isMuted = shouldMute;
    }

    /**
     * Pre-calculates acoustic impulse response data to bypass network fetches.
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
     */
    async startMix(cpu) {
        try {
            this.audioEnabled = window.audioEnabledState !== false;
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
            if (!this.audioEnabled) {
                this.context.suspend().catch(() => {});
            }
        }
        catch(e) {
            console.error("SegaPsg::Failed to bootstrap Web Audio.", e);
            this.audioEnabled = false;
        }        
    }

    /**
     * Dynamically enables or disables Web Audio contexts and processing.
     */
    setAudioEnabled(enabled) {
        this.audioEnabled = enabled;
        if (this.context) {
            if (enabled) {
                if (this.context.state === 'suspended') {
                    this.context.resume().catch(() => {});
                }
            } else {
                if (this.context.state === 'running') {
                    this.context.suspend().catch(() => {});
                }
            }
        }
    }

    /**
     * Steps the internal PSG sound clock index.
     */
    step(totCpuCycles) {
        this.internalClock = totCpuCycles;
    }

    /**
     * Recalculates and caches the phase step size of a voice.
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
     */
    getClockDrift() {
        if (!this.audioInitialized) return 0;
        return this.internalClock - this.internalClockPos;
    }

    /**
     * Synthesizes audio samples synchronously.
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) {
            const data = e.outputBuffer.getChannelData(0);
            data.fill(0);
            return;
        }

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

    // ========================================================================
    // PASSIVE SAMPLING MIXER METHODS (For Sega Genesis integration)
    // ========================================================================

    /**
     * Compatibility alias.
     */
    writeCommand(command) {
        command = command & 0xFF;
        const isLatch = (command & 0x80) !== 0;

        if (isLatch) {
            this.chan2belatched = (command >> 5) & 3;
            this.what2latch = (command & 0x10) !== 0 ? 1 : 0;

            const ch = this.chan2belatched;
            if (this.what2latch === 1) {
                this.tonesAttenuation[ch] = command & 0xF;
            } else {
                if (ch === 3) {
                    const noiseFreqMode = command & 3;
                    switch (noiseFreqMode) {
                        case 0:
                        case 1:
                        case 2:
                            this.tonesCountdownMaster[3] = 0x10 << noiseFreqMode;
                            this.noiseUseTone3 = false;
                            break;
                        default:
                            this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                            this.noiseUseTone3 = true;
                            break;
                    }
                    this.noiseType = (command & 4) !== 0 ? SEGA_PSG_NOISE_TYPE_WHITE : SEGA_PSG_NOISE_TYPE_PERIODIC;
                    this.noiseShiftRegister = 0x8000;
                } else {
                    this.tonesCountdownMaster[ch] = (this.tonesCountdownMaster[ch] & 0x3F0) | (command & 0xF);
                    if (ch === 2 && this.noiseUseTone3) {
                        this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                    }
                }
            }
        } else {
            const ch = this.chan2belatched;
            if (ch !== 3 && this.what2latch === 0) {
                this.tonesCountdownMaster[ch] = (this.tonesCountdownMaster[ch] & 0x0F) | ((command & 0x3F) << 4);
                if (ch === 2 && this.noiseUseTone3) {
                    this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                }
            }
        }
    }

    /**
     * Passive frame timing step for Sega Genesis mixer buffers.
     */
    update(sampleBuffer, totalFrames) {
        let ptr = 0;

        for (let frame = 0; frame < totalFrames; ++frame) {
            for (let i = 0; i < 4; i++) {
                if (this.tonesCountdown[i] > 0) {
                    this.tonesCountdown[i] = (this.tonesCountdown[i] - 1) | 0;
                }

                if (this.tonesCountdown[i] === 0) {
                    this.tonesCountdown[i] = this.tonesCountdownMaster[i];
                    this.tonesOutputState[i] = this.tonesOutputState[i] === 0 ? 1 : 0;

                    if (i === 3 && this.tonesOutputState[3] !== 0) {
                        this.noiseOut = this.noiseShiftRegister & 1;
                        this.noiseShiftRegister = (this.noiseShiftRegister >> 1) | (this.noiseShiftRegister << 15);
                        
                        if (this.noiseType === SEGA_PSG_NOISE_TYPE_WHITE) {
                            if ((this.noiseShiftRegister & 0x40) !== 0) {
                                this.noiseShiftRegister ^= 0x8000;
                            }
                        }
                    }
                }
            }

            let accum = 0;

            for (let i = 0; i < 3; i++) {
                if (this.toneDisabled[i] === 0 && this.tonesOutputState[i] !== 0) {
                    accum += SEGA_PSG_VOLUME_TABLE[this.tonesAttenuation[i]];
                }
            }

            if (this.noiseDisabled === 0 && this.noiseOut !== 0) {
                accum += SEGA_PSG_VOLUME_TABLE[this.tonesAttenuation[3]];
            }

            sampleBuffer[ptr] = (sampleBuffer[ptr] + accum) | 0;
            ptr++;
        }
    }
}

// Bind globally as a shared module
window.SegaPsg = SegaPsg;