/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 Custom PSG
 * 
 * Emulates the custom Programmable Sound Generator (PSG) chip integrated within 
 * the custom 315-5124 block (functionally matching the TI SN76489 standard).
 * Manages 4 channels (3 tones, 1 noise) and mixes output buffers using Web Audio.
 */

class Sega315_5124_Psg {
    constructor() {
        this.volregister = [0xf, 0xf, 0xf, 0xf]; // Volume attenuation registers (0x0 = Max, 0xF = Muted)
        this.toneregister = [0, 0, 0, 0];       // 10-bit tone/noise generator period registers
        this.wavePos = [0, 0, 0, 0];            // Internal wave phase position tracking

        this.chan2belatched = 0; // Latch targets (Channels 0-3)
        this.what2latch = 0;     // Latch category (0: Tone/Noise, 1: Volume)
        this.latch = 0;

        // Audio processing parameters
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

        this.audioInitialized = false;
    }

    /**
     * Bootstraps the Web Audio API context, node connections, and execution timing.
     * @param {ZilogZ80} thecpu - Reference to the system CPU for clock rate syncing.
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
            this.gainNode.gain.value = 0.5;
    
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
            console.error("PSG::Failed to initialize Web Audio API. Audio output is disabled.", e);
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
     * Core Web Audio callback that consumes and processes queued sound writes.
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
                // Consume audio control register write events matching the current execution timeline
                if ((this.eventsQueue.length > 0) && (this.eventsQueue[0][1] <= Math.floor(this.internalClockPos))) {
                    const curEvent = this.eventsQueue.shift();
                    const b = curEvent[0];

                    if (b & 0x80) {
                        // LATCH / DATA Byte
                        this.chan2belatched = (b >> 5) & 0x03;
                        this.what2latch = ((b & 0x10) === 0x10) ? 1 : 0; // 1: Volume, 0: Tone/Noise

                        if (this.what2latch === 1) {
                            this.volregister[this.chan2belatched] = b & 0x0f;
                        } else {
                            this.toneregister[this.chan2belatched] = (this.toneregister[this.chan2belatched] & 0xff00) | ((b << 4) & 0x00FF);
                        }
                    } else {
                        // Pure DATA Byte (updates high bits of currently latched register)
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

            dataL[s] = runningTotal;
            dataR[s] = runningTotal;
        }

        if (this.eventsQueue.length > 0) {
            this.eventsQueue = [];        
        }
    }

    /**
     * Mixes sample states from standard 3 tone voices and the un-pitched noise generator.
     */
    mixVoices() {
        if (glbMaxSpeed || (glbEmulatorStatus !== 1)) {
            return 0; // Mute when fast-forwarding or execution is paused/debugging
        }

        let finalSample = 0;

        for (let v = 0; v < 4; v++) {
            let curSamp = 0;

            if (this.volregister[v] !== 0xf) {
                if (this.toneregister[v] !== 0) {
                    if (v < 3) {
                        // Tone Channels: Square wave generation
                        const pos = Math.floor(this.wavePos[v] % this.squareWaveLen);
                        if (pos < (this.squareWaveLen / 2)) {
                            curSamp = 1.0;
                        }
                        const realFreq = (3579545.0 / (32 * this.toneregister[v])) / (this.multiplier * 0.37);
                        this.wavePos[v] += realFreq;
                        this.wavePos[v] %= this.squareWaveLen;
                    } else {
                        // Noise Channel: White noise random sample extraction
                        curSamp = this.randBuffer[this.randPos] * 2.0;
                        this.randPos++;
                        this.randPos %= this.randDim;
                    }
                }

                // Apply exponential volume attenuation (0xF is muted, 0x0 is maximum volume)
                curSamp = (curSamp * (0xf - this.volregister[v])) / 0x0f;
                finalSample += curSamp;
            }
        }

        return finalSample;
    }

    /**
     * Enqueues an 8-bit command byte matching a specific CPU cycle timestamp.
     * @param {number} b - Sound register parameter byte.
     */
    writeByte(b) {
        this.eventsQueue.push([b, this.internalClock]);
    }
}

// Global legacy alias to prevent breaking unrefactored application components
const sn79489 = Sega315_5124_Psg;