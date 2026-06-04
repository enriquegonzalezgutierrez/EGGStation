/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesDspChannel (DSP Channel Amplitude Processing)
 * 
 * ROLE:
 * Handles envelopes processing, noise generation, and processes amplitude steps 
 * of the individual active sound channels.
 */

{
    SnesDsp.prototype.handleNoise = function() {
        if (this.noiseRate !== 0) {
            this.noiseCounter++;
        }
        if (this.noiseRate !== 0 && this.noiseCounter >= this.noiseRate) {
            this.noiseCounter = 0;
            let bit0 = this.noiseSample & 1;
            let bit1 = (this.noiseSample >> 1) & 1;
            this.noiseSample = ((this.noiseSample >> 1) & 0x3fff) | ((bit0 ^ bit1) << 14);
            this.noiseSample = this.noiseSample > 0x3fff ? this.noiseSample - 0x8000 : this.noiseSample;
        }
    };

    SnesDsp.prototype.cycleChannel = function(ch) {
        let pitch = this.pitch[ch];
        if (this.pitchMod[ch]) {
            let factor = (this.sampleOut[ch - 1] >> 4) + 0x400;
            pitch = (pitch * factor) >> 10;
            pitch = pitch > 0x3fff ? 0x3fff : pitch;
        }
        this.counter[ch] += pitch;
        if (this.counter[ch] > 0xffff) {
            this.decodeBrr(ch);
        }
        this.counter[ch] &= 0xffff;
        
        let sample;
        if (this.enableNoise[ch]) {
            sample = this.noiseSample;
        } else {
            sample = this.interpolate(ch, this.counter[ch] >> 12, (this.counter[ch] >> 4) & 0xff);
        }

        if (this.noteOff[ch] || this.resetFlag) {
            this.adsrState[ch] = 3;
            if (this.resetFlag) {
                this.gain[ch] = 0;
            }
        }
        
        const ch5 = ch * 5;
        const ch16 = ch << 4;

        let rate = this.rateNums[ch5 + this.adsrState[ch]];
        if (rate !== 0) {
            this.rateCounter[ch]++;
        }
        if (rate !== 0 && this.rateCounter[ch] >= rate) {
            this.rateCounter[ch] = 0;
            if (!this.directGain[ch] || !this.useGain[ch] || this.adsrState[ch] === 3) {
                switch (this.adsrState[ch]) {
                    case 0: {
                        this.gain[ch] += rate === 1 ? 1024 : 32;
                        if (this.gain[ch] >= 0x7e0) {
                            this.adsrState[ch] = 1;
                        }
                        if (this.gain[ch] > 0x7ff) {
                            this.gain[ch] = 0x7ff;
                        }
                        break;
                    }
                    case 1: {
                        this.gain[ch] -= ((this.gain[ch] - 1) >> 8) + 1;
                        if (this.gain[ch] < this.sustainLevel[ch]) {
                            this.adsrState[ch] = 2;
                        }
                        break;
                    }
                    case 2: {
                        this.gain[ch] -= ((this.gain[ch] - 1) >> 8) + 1;
                        break;
                    }
                    case 3: {
                        this.gain[ch] -= 8;
                        if (this.gain[ch] < 0) {
                            this.gain[ch] = 0;
                        }
                        break;
                    }
                    case 4: {
                        switch (this.gainMode[ch]) {
                            case 0: {
                                this.gain[ch] -= 32;
                                if (this.gain[ch] < 0) {
                                    this.gain[ch] = 0;
                                }
                                break;
                            }
                            case 1: {
                                this.gain[ch] -= ((this.gain[ch] - 1) >> 8) + 1;
                                break;
                            }
                            case 2: {
                                this.gain[ch] += 32;
                                if (this.gain[ch] > 0x7ff) {
                                    this.gain[ch] = 0x7ff;
                                }
                                break;
                            }
                            case 3: {
                                this.gain[ch] += this.gain[ch] < 0x600 ? 32 : 8;
                                if (this.gain[ch] > 0x7ff) {
                                    this.gain[ch] = 0x7ff;
                                }
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        }
        if (this.directGain[ch] && this.useGain[ch] && this.adsrState[ch] !== 3) {
            this.gain[ch] = this.gainValue[ch];
        }
        
        let gainedVal = (sample * this.gain[ch]) >> 11;

        this.ram[ch16 | 8] = this.gain[ch] >> 4;
        this.ram[ch16 | 9] = gainedVal >> 7;
        this.sampleOut[ch] = gainedVal;
    };
}