/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 custom PSG
 * 
 * Emulates the custom sound generator chip integrated within the standard system.
 * Manages 4 independent sound channels (3 square wave tone generators, 
 * 1 pseudo-random white noise generator) and mixes output buffers using Web Audio.
 */

class Sega315_5124_Psg {
    constructor() {
        this.volregister = [0xf, 0xf, 0xf, 0xf]; // Volume attenuation registers (0x0 = Max, 0xF = Muted)
        this.toneregister = [0, 0, 0, 0];       // 10-bit tone period registers
        this.wavePos = [0, 0, 0, 0];            // Internal phase accumulator

        this.chan2belatched = 0; // Currently latched target channel (0-3)
        this.what2latch = 0;     // Latch classification (0: Tone/Noise, 1: Volume)
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

        // Encapsulated state to replace old global variables
        this.isMuted = false;
        this.audioInitialized = false;
    }

    /**
     * Controls the active muting state of the audio output.
     * @param {boolean} shouldMute - True to mute the hardware voices.
     */
    setMuted(shouldMute) {
        this.isMuted = shouldMute;
    }

    /**
     * Initializes the host Web Audio API context, custom Script Nodes, and gain modules.
     * @param {ZilogZ80} cpu - System CPU reference used to sync internal clock steps.
     */
    startMix(thecpu) {
        try {
            this.audioEnabled = true;
            this.audioBufSize = 1024;

            const self = this;
            this.webAudioAPIsupported = true;
    
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();
    
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = 0.5; // Master volume scaling
    
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
     * Updates the internal elapsed cycles index.
     * @param {number} totCpuCycles - Global clock states.
     */
    step(totCpuCycles) {
        this.internalClock = totCpuCycles;
    }

    /**
     * Audio Processor Callback. Consumes queued register updates on a timeline-accurate basis.
     */
    mixFunction(e) {
        if (!this.audioEnabled || !this.audioInitialized) return;

        const dataL = e.outputBuffer.getChannelData(0);
        const dataR = e.outputBuffer.getChannelData(1);

        const numClocksToCover = this.internalClock - this.internalClockPos;
        if (numClocksToCover <= 0) return;
        const realStep = numClocksToCover / (this.multiplier * this.audioBufSize);

        for (let s = 0; s < this.audioBufSize; s++) {
            let runningTotal = 0.0;

            for (let cyc = 0; cyc < this.multiplier; cyc++) {
                // Dequeue any register configuration events scheduled at or before this clock offset
                if ((this.eventsQueue.length > 0) && (this.eventsQueue[0][1] <= Math.floor(this.internalClockPos))) {
                    const curEvent = this.eventsQueue.shift();
                    const b = curEvent[0];

                    if (b & 0x80) {
                        // LATCH / DATA control word
                        this.chan2belatched = (b >> 5) & 0x03;
                        this.what2latch = ((b & 0x10) === 0x10) ? 1 : 0; // 1: Volume registers, 0: Tone/Noise

                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = b & 0x0f;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((b << 4) & 0x00ff);
                        }
                    } else {
                        // DATA update word (applies to active latched selection)
                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = b & 0xf;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff) | ((b << 8) & 0x3F00);
                        }
                    }
                }

                runningTotal += this.mixVoices() / 4.0;                
                this.internalClockPos += realStep;
            }

            runningTotal /= this.multiplier;

            // Output mono mix to left/right stereo targets
            dataL[s] = runningTotal;
            dataR[s] = runningTotal;
        }

        if (this.eventsQueue.length > 0) {
            this.eventsQueue = [];        
        }
    }

    /**
     * Synthesizes waveforms for standard square-wave and noise generation buffers.
     * @returns {number} Combined mono audio sample level.
     */
    mixVoices() {
        // Safe check using private member state
        if (this.isMuted) {
            return 0; 
        }

        let finalSample = 0;

        for (let v = 0; v < 4; v++) {
            let curSamp = 0;

            if (this.volregister[v] !== 0xf) {
                if (this.toneregister[v] !== 0) {
                    if (v < 3) {
                        // Tone Channels: Generate square wave phase states
                        const pos = Math.floor(this.wavePos[v] % this.squareWaveLen);
                        if (pos < (this.squareWaveLen / 2)) {
                            curSamp = 1.0;
                        }
                        const realFreq = (3579545.0 / (32 * this.toneregister[v])) / (this.multiplier * 0.37);
                        this.wavePos[v] += realFreq;
                        this.wavePos[v] %= this.squareWaveLen;
                    } else {
                        // Noise Channel: Fetch pseudo-random white noise values
                        curSamp = this.randBuffer[this.randPos] * 2.0;
                        this.randPos++;
                        this.randPos %= this.randDim;
                    }
                }

                // Apply exponential volume attenuation (0x0 is max volume, 0xF is complete mute)
                curSamp = (curSamp * (0xf - this.volregister[v])) / 0x0f;
                finalSample += curSamp;
            }
        }

        return finalSample;
    }

    /**
     * Registers a sound control write operation.
     * @param {number} b - Sound register write value.
     */
    writeByte(b) {
        this.eventsQueue.push([b, this.internalClock]);
    }
}