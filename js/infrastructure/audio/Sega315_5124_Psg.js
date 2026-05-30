/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG (High-Performance Strategy B)
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * Optimized with pre-allocated properties to prevent Garbage Collection (GC) 
 * overhead on the browser's audio hot path.
 */

class Sega315_5124_Psg {
    constructor() {
        this.volregister = [0xf, 0xf, 0xf, 0xf]; // Volume registers (0x0 = Max, 0xF = Muted)
        this.toneregister = [0, 0, 0, 0];       // 10-bit tone period registers
        this.wavePos = [0, 0, 0, 0];            // Internal phase accumulator

        this.chan2belatched = 0; 
        this.what2latch = 0;     
        this.latch = 0;

        // Queue for thread-safe asynchronous sound register writes
        this.eventsQueue = [];
        this.internalClock = 0;
        this.internalClockPos = 0;

        this.squareWaveLen = 8192;
        this.randDim = 65536;
        this.randBuffer = [];
        for (let s = 0; s < this.randDim; s++) {
            this.randBuffer.push(Math.random() * 1.0);
        }
        this.randPos = 0;

        // Encapsulated state to control play states
        this.isMuted = false;
        this.audioInitialized = false;

        // ========================================================================
        // STRATEGY B: PRE-ALLOCATED MEMBERS TO PREVENT HOT-PATH GC OVERHEAD
        // ========================================================================
        this.runningTotal = 0.0;
        this.curSamp = 0.0;
        this.finalSample = 0.0;
        this.realStep = 0.0;
        this.numClocksToCover = 0;
        this.curEvent = null;
        this.eventByte = 0;
        
        // Loop indexes and temporary calculation registers
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
     * Initializes the host Web Audio API context with an expanded safety buffer size.
     * @param {ZilogZ80} cpu - System CPU reference used to sync internal clock steps.
     */
    startMix(thecpu) {
        try {
            this.audioEnabled = true;
            
            // Standard safety buffer expanded to 2048 to prevent thrashes
            this.audioBufSize = 2048; 

            const self = this;
            this.webAudioAPIsupported = true;
    
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
    
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.5; // Master volume scale
    
            this.jsNode = this.context.createScriptProcessor(this.audioBufSize, 0, 2);
            this.jsNode.onaudioprocess = function(e) {
                self.mixFunction(e);
            };
    
            this.jsNode.connect(this.gainNode);
            this.gainNode.connect(this.context.destination);

            this.multiplier = Math.floor(thecpu.clockRate / this.jsNode.context.sampleRate);
            this.audioInitialized = true;
        }
        catch(e) {
            console.error("PSG::Failed to bootstrap Web Audio context.", e);
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
     * Audio Processor Callback. Consumes queued register updates on a timeline-accurate basis.
     * Pre-allocated loop variables are re-used to ensure zero-heap-allocations on execution.
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) return;

        const dataL = e.outputBuffer.getChannelData(0);
        const dataR = e.outputBuffer.getChannelData(1);

        this.numClocksToCover = this.internalClock - this.internalClockPos;
        if (this.numClocksToCover <= 0) return;
        
        // Decouple division inside the hot path
        this.realStep = this.numClocksToCover / (this.multiplier * this.audioBufSize);

        for (this.sampleIndex = 0; this.sampleIndex < this.audioBufSize; this.sampleIndex++) {
            this.runningTotal = 0.0;

            for (this.multiplierIndex = 0; this.multiplierIndex < this.multiplier; this.multiplierIndex++) {
                // Process audio control register updates using pre-allocated references
                if ((this.eventsQueue.length > 0) && (this.eventsQueue[0][1] <= Math.floor(this.internalClockPos))) {
                    this.curEvent = this.eventsQueue.shift();
                    this.eventByte = this.curEvent[0];

                    if (this.eventByte & 0x80) {
                        // LATCH / DATA control word
                        this.chan2belatched = (this.eventByte >> 5) & 0x03;
                        this.what2latch = ((this.eventByte & 0x10) === 0x10) ? 1 : 0;

                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = this.eventByte & 0x0f;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((this.eventByte << 4) & 0x00FF);
                        }
                    } else {
                        // Pure DATA byte
                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = this.eventByte & 0xf;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff) | ((this.eventByte << 8) & 0x3F00);
                        }
                    }
                }

                this.runningTotal += this.mixVoices() * 0.25; // Division speed-optimized to multiply                
                this.internalClockPos += this.realStep;
            }

            this.runningTotal /= this.multiplier;

            dataL[this.sampleIndex] = this.runningTotal;
            dataR[this.sampleIndex] = this.runningTotal;
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
                        // Tone Channels: Square wave generation
                        this.wavePhaseOffset = Math.floor(this.wavePos[this.voiceIndex] % this.squareWaveLen);
                        if (this.wavePhaseOffset < (this.squareWaveLen >> 1)) {
                            this.curSamp = 1.0;
                        }
                        
                        // Optimized division factors
                        this.vBlankFrequencyAdjustment = (3579545.0 / (32 * this.toneregister[this.voiceIndex])) / (this.multiplier * 0.37);
                        this.wavePos[this.voiceIndex] += this.vBlankFrequencyAdjustment;
                        this.wavePos[this.voiceIndex] %= this.squareWaveLen;
                    } else {
                        // Noise Channel: White noise random sample extraction
                        this.curSamp = this.randBuffer[this.randPos] * 2.0;
                        this.randPos = (this.randPos + 1) % this.randDim;
                    }
                }

                // Volume attenuation scaling using pre-calculated factors
                this.curSamp = (this.curSamp * (15 - this.volregister[this.voiceIndex])) * 0.066666666; 
                this.finalSample += this.curSamp;
            }
        }

        return this.finalSample;
    }

    /**
     * Enqueues an 8-bit command byte matching a specific CPU cycle timestamp.
     * @param {number} b - Sound register parameter byte.
     */
    writeByte(b) {
        this.eventsQueue.push([b, this.internalClock]);
    }
}