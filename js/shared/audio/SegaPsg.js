/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/audio/SegaPsg.js
 * 
 * Role:
 * Infrastructure Layer: Sega SN76489-compatible Programmable Sound Generator (PSG).
 * Emulates three square-wave tone channels and one feedback noise channel. 
 * Supports both active Web Audio mixing (for SMS) and passive buffer-filling (for Genesis)
 * using a single, unified, mathematically perfect phase-step synthesizer.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for emulating 
 *    the Texas Instruments SN76489 sound chip (noise LFSR, tone generators, and attenuation).
 * 2. Liskov Substitution Principle (LSP): Fully interchangeable. It acts as a 
 *    standalone WebAudio node (SMS) or as a passive sample synthesizer (Genesis).
 * 3. Don't Repeat Yourself (DRY): Both systems now consume the exact same oscillator 
 *    math via `getSample()`, eliminating legacy double implementations.
 */

const SEGA_PSG_NOISE_TYPE_PERIODIC = 0;
const SEGA_PSG_NOISE_TYPE_WHITE    = 1;

class SegaPsg {
    constructor() {
        // Hardware Registers
        this.volregister = new Int16Array([0xf, 0xf, 0xf, 0xf]); 
        this.toneregister = new Int16Array([0, 0, 0, 0]);       
        this.wavePos = new Float32Array([0, 0, 0, 0]);            
        this.cachedStepSize = new Float32Array([0, 0, 0, 0]);

        this.chan2belatched = 0; 
        this.what2latch = 0;     

        // Noise Channel Registers
        this.noiseFreqMode = 0;
        this.noiseType = SEGA_PSG_NOISE_TYPE_PERIODIC;
        this.noiseShiftRegister = 0x8000;
        this.noiseOut = 0;
        this.noisePhase = 0.0;
        this.noiseStepSize = 0.0;

        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        this.isMuted = false;
        this.audioInitialized = false;

        this.squareWaveLen = 8192;
        this.sampleRate = 44100; // Default fallback sample rate

        // Web Audio components (For SMS active mode)
        this.context = null;
        this.jsNode = null;
        this.gainNode = null;
        this.biquadFilterNode = null; 
        this.delayNode = null;        
        
        this.audioBufSize = 2048;     
        this.multiplier = 0;
        this.audioEnabled = false;

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
        this.volregister.fill(0xf); // Silence
        this.toneregister.fill(0);
        this.wavePos.fill(0);
        this.cachedStepSize.fill(0);

        this.chan2belatched = 0;
        this.what2latch = 0;

        this.noiseFreqMode = 0;
        this.noiseType = SEGA_PSG_NOISE_TYPE_PERIODIC;
        this.noiseShiftRegister = 0x8000;
        this.noiseOut = 0;
        this.noisePhase = 0.0;
        this.noiseStepSize = 0.0;

        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;
    }

    /**
     * Sets the active host sample rate (Used to calculate precise analog wave phases).
     */
    setSampleRate(rate) {
        this.sampleRate = rate || 44100;
        for (let i = 0; i < 3; i++) this.recalculateVoiceStep(i);
        this.recalculateNoiseStep();
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

    /**
     * Bootstraps Web Audio API for Active Mode (Sega Master System).
     */
    async startMix(cpu) {
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

            this.audioInitialized = true;
            if (!this.audioEnabled) this.context.suspend().catch(() => {});
        }
        catch(e) {
            console.error("SegaPsg::Failed to bootstrap Web Audio.", e);
            this.audioEnabled = false;
        }        
    }

    setAudioEnabled(enabled) {
        this.audioEnabled = enabled;
        if (this.context) {
            if (enabled && this.context.state === 'suspended') this.context.resume().catch(() => {});
            else if (!enabled && this.context.state === 'running') this.context.suspend().catch(() => {});
        }
    }

    step(totCpuCycles) {
        this.internalClock = totCpuCycles;
    }

    /**
     * Calculates square wave phase increment based on the 3.58MHz master clock.
     */
    recalculateVoiceStep(voiceIndex) {
        const toneVal = this.toneregister[voiceIndex];
        if (toneVal === 0) {
            this.cachedStepSize[voiceIndex] = 0;
        } else {
            const freq = 3579545.0 / (32.0 * toneVal);
            this.cachedStepSize[voiceIndex] = (freq / this.sampleRate) * this.squareWaveLen;
        }
    }

    /**
     * Calculates Noise channel shift rate based on the 3.58MHz master clock.
     */
    recalculateNoiseStep() {
        if (this.noiseFreqMode < 3) {
            const divisors = [512, 1024, 2048];
            const freq = 3579545.0 / divisors[this.noiseFreqMode];
            this.noiseStepSize = (freq / this.sampleRate);
        } else {
            const toneVal = this.toneregister[2];
            if (toneVal === 0) {
                this.noiseStepSize = 0;
            } else {
                const freq = 3579545.0 / (32.0 * toneVal);
                this.noiseStepSize = (freq / this.sampleRate);
            }
        }
    }

    /**
     * Shared Command Latch Processor.
     * Maps physical Z80/M68K byte writes to the internal SN76489 registers.
     */
    applyCommand(command) {
        command &= 0xFF;
        if (command & 0x80) {
            this.chan2belatched = (command >> 5) & 3;
            this.what2latch = (command & 0x10) !== 0 ? 1 : 0;
            const ch = this.chan2belatched;

            if (this.what2latch === 1) {
                this.volregister[ch] = command & 0xF;
            } else {
                if (ch === 3) {
                    this.noiseFreqMode = command & 3;
                    this.noiseType = (command & 4) !== 0 ? SEGA_PSG_NOISE_TYPE_WHITE : SEGA_PSG_NOISE_TYPE_PERIODIC;
                    this.noiseShiftRegister = 0x8000;
                    this.recalculateNoiseStep();
                } else {
                    this.toneregister[ch] = (this.toneregister[ch] & 0xFFF0) | (command & 0x0F);
                    this.recalculateVoiceStep(ch);
                    if (ch === 2) this.recalculateNoiseStep(); // Noise Mode 3 tracks Tone 2
                }
            }
        } else {
            const ch = this.chan2belatched;
            if (this.what2latch === 1) {
                this.volregister[ch] = command & 0xF;
            } else if (ch !== 3) {
                this.toneregister[ch] = (this.toneregister[ch] & 0x000F) | ((command & 0x3F) << 4);
                this.recalculateVoiceStep(ch);
                if (ch === 2) this.recalculateNoiseStep();
            }
        }
    }

    // ========================================================================
    // SMS ACTIVE MODE: Queued execution to sync with CPU sub-cycles
    // ========================================================================
    writeByte(eventByte) {
        this.eventsQueue.push([eventByte, this.internalClock]);
    }

    processEvents(targetClock) {
        while (this.eventsQueue.length > 0 && this.eventsQueue[0][1] <= targetClock) {
            const curEvent = this.eventsQueue.shift();
            this.applyCommand(curEvent[0]);
        }
    }

    getClockDrift() {
        if (!this.audioInitialized) return 0;
        return this.internalClock - this.internalClockPos;
    }

    // ========================================================================
    // GENESIS PASSIVE MODE: Immediate execution without queueing
    // ========================================================================
    writeCommand(command) {
        this.applyCommand(command);
    }

    // ========================================================================
    // UNIFIED SYNTHESIS ENGINE (Polymorphic Math)
    // ========================================================================
    
    /**
     * Generates a single frame of audio (-1.0 to 1.0) mathematically.
     * Used synchronously by both SMS and Genesis.
     */
    getSample() {
        let finalSample = 0.0;

        // 1. Synthesize 3 Square Wave Tones
        for (let i = 0; i < 3; i++) {
            const vol = this.volregister[i];
            if (vol !== 0xf && this.toneregister[i] !== 0) {
                const curSamp = (this.wavePos[i] < (this.squareWaveLen >> 1)) ? 1.0 : -1.0;
                const volScale = (15 - vol) / 15.0; 
                finalSample += curSamp * volScale * 0.20; 
                
                this.wavePos[i] += this.cachedStepSize[i];
                if (this.wavePos[i] >= this.squareWaveLen) this.wavePos[i] %= this.squareWaveLen;
            }
        }

        // 2. Synthesize 1 LFSR Noise Channel
        const volNoise = this.volregister[3];
        if (volNoise !== 0xf) {
            this.noisePhase += this.noiseStepSize;
            while (this.noisePhase >= 1.0) {
                this.noisePhase -= 1.0;
                this.noiseOut = this.noiseShiftRegister & 1;
                this.noiseShiftRegister = (this.noiseShiftRegister >> 1) | (this.noiseShiftRegister << 15);
                
                // Sega specific XOR-feedback polynomial for White Noise
                if (this.noiseType === SEGA_PSG_NOISE_TYPE_WHITE && (this.noiseShiftRegister & 0x40)) {
                    this.noiseShiftRegister ^= 0x8000;
                }
            }
            const curSamp = this.noiseOut ? 1.0 : -1.0;
            const volScale = (15 - volNoise) / 15.0;
            finalSample += curSamp * volScale * 0.20;
        }

        return finalSample;
    }

    /**
     * SMS Active Node Output Generator.
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
        
        const realStep = numClocksToCover / (this.multiplier * data.length);

        for (let i = 0; i < data.length; i++) {
            const sampleClock = this.internalClockPos + (i * realStep * this.multiplier);
            this.processEvents(sampleClock);
            data[i] = this.getSample();
        }

        this.internalClockPos += numClocksToCover;
    }

    /**
     * Genesis Passive Buffer Output Generator.
     */
    update(sampleBuffer, totalFrames) {
        let ptr = 0;
        for (let i = 0; i < totalFrames; i++) {
            // Genesis FM mixer expects signed 16-bit integers
            const floatSample = this.getSample();
            sampleBuffer[ptr] = (sampleBuffer[ptr] + (floatSample * 32767)) | 0;
            ptr++;
        }
    }

    syncWorkletState() {}
}

// Bind globally as a shared module
window.SegaPsg = SegaPsg;