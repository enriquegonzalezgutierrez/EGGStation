/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG (With Web Audio DSP Effects)
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * Optimized with pre-allocated properties to prevent Garbage Collection (GC) 
 * overhead, and integrated with dynamic Web Audio DSP filter routing.
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

        // Web Audio DSP Native Nodes
        this.filterNode = null;
        this.delayNode = null;
        this.splitterNode = null;
        this.mergerNode = null;

        // Pre-allocated members to prevent Garbage Collection (GC) overhead
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
     * Dynamic routing changer. Adjusts parameters of native Web Audio nodes 
     * on the fly, avoiding structural re-connections and pop noises.
     * @param {number} mode - Selected filter (0: Dry Mono, 1: Low-pass Cabinet, 2: Haas Stereo)
     */
    setAudioFilter(mode) {
        if (!this.audioInitialized) return;

        switch (mode) {
            case 1: // Arcade Warmth (Low-pass)
                this.filterNode.frequency.value = 3500; // Cut off frequencies above 3.5kHz
                this.delayNode.delayTime.value = 0.0;   // Collapse to mono
                break;
                
            case 2: // Lush 3D Stereo (Haas spatializer)
                this.filterNode.frequency.value = 6000; // Smooth out high-end slightly
                this.delayNode.delayTime.value = 0.02;  // 20ms delay on the right channel
                break;

            case 0: // Original Mono (Sharp & Dry)
            default:
                this.filterNode.frequency.value = 20000; // Fully open (bypassed)
                this.delayNode.delayTime.value = 0.0;    // Collapse to mono
                break;
        }
    }

    /**
     * Initializes the host Web Audio API context and builds the DSP node graph.
     * @param {ZilogZ80} cpu - System CPU reference used to sync internal clock steps.
     */
    startMix(thecpu) {
        try {
            this.audioEnabled = true;
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
    
            // ========================================================================
            // NATIVE WEB AUDIO DSP NODE GRAPH BUILD
            // ========================================================================
            this.filterNode = this.context.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.value = 20000; // Default: fully open (bypassed)

            this.delayNode = this.context.createDelay(1.0);
            this.delayNode.delayTime.value = 0.0; // Default: no delay (mono)

            this.splitterNode = this.context.createChannelSplitter(2);
            this.mergerNode = this.context.createChannelMerger(2);

            // Connect mono generator to the filter
            this.jsNode.connect(this.filterNode);
            
            // Connect filtered path to splitter (left and right extraction)
            this.filterNode.connect(this.splitterNode);

            // Left path: Connect splitter output 0 directly to merger input 0 (Left)
            this.splitterNode.connect(this.mergerNode, 0, 0);

            // Right path (Delayed): Route splitter output 0 through delayNode, then to merger input 1 (Right)
            this.splitterNode.connect(this.delayNode, 0);
            this.delayNode.connect(this.mergerNode, 0, 1);

            // Connect merged stereo output to master gain and destination speaker
            this.mergerNode.connect(this.gainNode);
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

            // Output generated mono sample stream to left/right arrays
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

    /**
     * Enqueues an 8-bit command byte matching a specific CPU cycle timestamp.
     * @param {number} b - Sound register parameter byte.
     */
    writeByte(b) {
        this.eventsQueue.push([b, this.internalClock]);
    }
}