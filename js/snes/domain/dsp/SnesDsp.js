/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesDsp (Audio Synthesizer Core)
 * 
 * ROLE:
 * Synthesizes analog audio channels by processing ADSR/Gain envelopes, 
 * channel volume panning, and master mixing.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively orchestrates DSP registers,
 *   state buffers, and master audio mixing.
 */

{
    class SnesDsp {
        /**
         * @param {SnesApu} apu - Mapped sound processor unit context.
         */
        constructor(apu) {
            this.apu = apu;

            this.ram = new Uint8Array(0x80);

            // Float32 buffer outputs (GC-free pipeline mapping)
            this.samplesL = new Float32Array(534);
            this.samplesR = new Float32Array(534);
            this.sampleOffset = 0;

            // Decoded wave buffers
            this.decodeBuffer = new Int16Array(19 * 8);
            this.rateNums = new Int16Array(5 * 8);

            this.reset();
        }

        reset() {
            this.ram.fill(0);

            this.decodeBuffer.fill(0);
            this.rateNums.fill(0);
            
            for (let i = 0; i < 8; i++) {
                this.rateNums[i * 5 + 3] = 1;
            }

            this.pitch = [0, 0, 0, 0, 0, 0, 0, 0];
            this.counter = [0, 0, 0, 0, 0, 0, 0, 0];
            this.pitchMod = [false, false, false, false, false, false, false, false];

            this.srcn = [0, 0, 0, 0, 0, 0, 0, 0];
            this.decodeOffset = [0, 0, 0, 0, 0, 0, 0, 0];
            this.prevFlags = [0, 0, 0, 0, 0, 0, 0, 0];
            this.old = [0, 0, 0, 0, 0, 0, 0, 0];
            this.older = [0, 0, 0, 0, 0, 0, 0, 0];

            this.enableNoise = [false, false, false, false, false, false, false, false];
            this.noiseSample = -0x4000;
            this.noiseRate = 0;
            this.noiseCounter = 0;

            this.rateCounter = [0, 0, 0, 0, 0, 0, 0, 0];
            this.adsrState = [3, 3, 3, 3, 3, 3, 3, 3];
            this.sustainLevel = [0, 0, 0, 0, 0, 0, 0, 0];
            this.useGain = [false, false, false, false, false, false, false, false];
            this.gainMode = [0, 0, 0, 0, 0, 0, 0, 0];
            this.directGain = [false, false, false, false, false, false, false, false];
            this.gainValue = [0, 0, 0, 0, 0, 0, 0, 0];

            this.gain = [0, 0, 0, 0, 0, 0, 0, 0];

            this.channelVolumeL = [0, 0, 0, 0, 0, 0, 0, 0];
            this.channelVolumeR = [0, 0, 0, 0, 0, 0, 0, 0];
            this.volumeL = 0;
            this.volumeR = 0;
            this.mute = true;

            this.resetFlag = true;
            this.noteOff = [true, true, true, true, true, true, true, true];

            this.sampleOut = [0, 0, 0, 0, 0, 0, 0, 0];
            this.dirPage = 0;
        }

        /**
         * Main DSP processing step. Synthesizes and mixes channel samples.
         */
        cycle() {
            let totalL = 0;
            let totalR = 0;

            for (let i = 0; i < 8; i++) {
                this.cycleChannel(i);
                totalL += (this.sampleOut[i] * this.channelVolumeL[i]) >> 6;
                totalR += (this.sampleOut[i] * this.channelVolumeR[i]) >> 6;
                
                totalL = totalL < -0x8000 ? -0x8000 : (totalL > 0x7fff ? 0x7fff : totalL);
                totalR = totalR < -0x8000 ? -0x8000 : (totalR > 0x7fff ? 0x7fff : totalR);
            }

            totalL = (totalL * this.volumeL) >> 7;
            totalR = (totalR * this.volumeR) >> 7;
            totalL = totalL < -0x8000 ? -0x8000 : (totalL > 0x7fff ? 0x7fff : totalL);
            totalR = totalR < -0x8000 ? -0x8000 : (totalR > 0x7fff ? 0x7fff : totalR);
            
            if (this.mute) {
                totalL = 0;
                totalR = 0;
            }

            this.handleNoise();

            this.samplesL[this.sampleOffset] = totalL * SnesDsp.INV_32768;
            this.samplesR[this.sampleOffset] = totalR * SnesDsp.INV_32768;
            this.sampleOffset++;
            
            if (this.sampleOffset > 533) {
                this.sampleOffset = 533;
            }
        }

        read(address) {
            return this.ram[address & 0x7f];
        }

        write(address, value) {
            let channel = (address & 0x70) >> 4;
            const ch5 = channel * 5;
            
            switch (address) {
                case 0x0: case 0x10: case 0x20: case 0x30: case 0x40: case 0x50: case 0x60: case 0x70: {
                    this.channelVolumeL[channel] = (value > 0x7f ? value - 0x100 : value);
                    break;
                }
                case 0x1: case 0x11: case 0x21: case 0x31: case 0x41: case 0x51: case 0x61: case 0x71: {
                    this.channelVolumeR[channel] = (value > 0x7f ? value - 0x100 : value);
                    break;
                }
                case 0x2: case 0x12: case 0x22: case 0x32: case 0x42: case 0x52: case 0x62: case 0x72: {
                    this.pitch[channel] &= 0x3f00;
                    this.pitch[channel] |= value;
                    break;
                }
                case 0x3: case 0x13: case 0x23: case 0x33: case 0x43: case 0x53: case 0x63: case 0x73: {
                    this.pitch[channel] &= 0xff;
                    this.pitch[channel] |= (value << 8) & 0x3f00;
                    break;
                }
                case 0x4: case 0x14: case 0x24: case 0x34: case 0x44: case 0x54: case 0x64: case 0x74: {
                    this.srcn[channel] = value;
                    break;
                }
                case 0x5: case 0x15: case 0x25: case 0x35: case 0x45: case 0x55: case 0x65: case 0x75: {
                    this.rateNums[ch5 + 0] = SnesDsp.rates[(value & 0xf) * 2 + 1];
                    this.rateNums[ch5 + 1] = SnesDsp.rates[((value & 0x70) >> 4) * 2 + 16];
                    this.useGain[channel] = (value & 0x80) === 0;
                    break;
                }
                case 0x6: case 0x16: case 0x26: case 0x36: case 0x46: case 0x56: case 0x66: case 0x76: {
                    this.rateNums[ch5 + 2] = SnesDsp.rates[value & 0x1f];
                    this.sustainLevel[channel] = (((value & 0xe0) >> 5) + 1) * 0x100;
                    break;
                }
                case 0x7: case 0x17: case 0x27: case 0x37: case 0x47: case 0x57: case 0x67: case 0x77: {
                    if ((value & 0x80) > 0) {
                        this.directGain[channel] = false;
                        this.gainMode[channel] = (value & 0x60) >> 5;
                        this.rateNums[ch5 + 4] = SnesDsp.rates[value & 0x1f];
                    } else {
                        this.directGain[channel] = true;
                        this.gainValue[channel] = (value & 0x7f) * 16;
                    }
                    break;
                }
                case 0x0c: {
                    this.volumeL = (value > 0x7f ? value - 0x100 : value);
                    break;
                }
                case 0x1c: {
                    this.volumeR = (value > 0x7f ? value - 0x100 : value);
                    break;
                }
                case 0x2c: {
                    break;
                }
                case 0x3c: {
                    break;
                }
                case 0x4c: {
                    // Log KON (Key On) trigger events to see if sound channels are actually fired
                    // console.log(`%c[EGGStation::DSP-Diag] Key On (KON) Triggered: 0x${value.toString(16).toUpperCase()}`, "color: #04d361; font-weight: bold;");
                    let test = 1;
                    for (let i = 0; i < 8; i++) {
                        if ((value & test) > 0) {
                            this.prevFlags[i] = 0;
                            let sampleAdr = (this.dirPage << 8) + (this.srcn[i] * 4);
                            let startAdr = this.apu.ram[sampleAdr & 0xffff];
                            startAdr |= this.apu.ram[(sampleAdr + 1) & 0xffff] << 8;
                            this.decodeOffset[i] = startAdr;
                            this.gain[i] = 0;
                            if (this.useGain[i]) {
                                this.adsrState[i] = 4;
                            } else {
                                this.adsrState[i] = 0;
                            }
                            for (let j = 0; j < 19; j++) {
                                this.decodeBuffer[i * 19 + j] = 0;
                            }
                        }
                        test <<= 1;
                    }
                    break;
                }
                case 0x5c: {
                    let test = 1;
                    for (let i = 0; i < 8; i++) {
                        this.noteOff[i] = (value & test) > 0;
                        test <<= 1;
                    }
                    break;
                }
                case 0x6c: {
                    this.resetFlag = (value & 0x80) > 0;
                    this.mute = (value & 0x40) > 0;
                    this.noiseRate = SnesDsp.rates[value & 0x1f];
                    
                    // Log DSP Mute status modifications
                    // console.log(`%c[EGGStation::DSP-Diag] Synthesizer Mute State: ${this.mute} | Reset Flag: ${this.resetFlag}`, "color: #ff007f; font-weight: bold;");
                    break;
                }
                case 0x7c: {
                    this.ram[0x7c] = 0;
                    value = 0;
                    break;
                }
                case 0x0d: {
                    break;
                }
                case 0x2d: {
                    let test = 2;
                    for (let i = 1; i < 8; i++) {
                        this.pitchMod[i] = (value & test) > 0;
                        test <<= 1;
                    }
                    break;
                }
                case 0x3d: {
                    let test = 1;
                    for (let i = 0; i < 8; i++) {
                        this.enableNoise[i] = (value & test) > 0;
                        test <<= 1;
                    }
                    break;
                }
                case 0x4d: {
                    break;
                }
                case 0x5d: {
                    this.dirPage = value;
                    break;
                }
                case 0x6d: {
                    break;
                }
                case 0x7d: {
                    break;
                }
                case 0xf: case 0x1f: case 0x2f: case 0x3f: case 0x4f: case 0x5f: case 0x6f: case 0x7f: {
                    break;
                }
            }
            this.ram[address & 0x7f] = value;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesDsp;
    } else if (typeof window !== 'undefined') {
        window.SnesDsp = SnesDsp;
        window.Dsp = SnesDsp; // Backward compatibility alias
    }
}