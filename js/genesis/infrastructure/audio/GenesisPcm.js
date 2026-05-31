/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega CD Ricoh RF5C164 PCM sound chip
 * 
 * Emulates the 8-channel custom PCM hardware chip found on the Sega CD / Mega CD 
 * expansion board. Accesses a dedicated 64KB wave RAM buffer and handles stereo 
 * pan routing, custom envelope gain, and loop offsets.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the Ricoh PCM 
 * voice mixers and wave RAM read/writes from other sound generator cores.
 */

class GenesisPcm {
    constructor() {
        // --- 1. Global State Configuration ---
        this.channelsDisabledMask = new Uint8Array(8); // Boolean array mapped to integers (0 = enabled, 1 = disabled)
        
        // --- 2. Contiguous Channels Memory Buffers (8 Voices) ---
        this.chDisabled = new Uint8Array(8);
        this.chVolume = new Uint8Array(8);
        this.chPanningL = new Uint8Array(8);
        this.chPanningR = new Uint8Array(8);
        this.chFrequency = new Uint16Array(8);
        this.chLoopAddress = new Uint16Array(8);
        this.chStartAddress = new Uint8Array(8);
        this.chAddress = new Uint32Array(8); // 27-bit fixed-point frequency accumulator

        this.sounding = 0; // Global sound state (0 = disabled, 1 = enabled)
        this.currentWaveBank = 0;
        this.currentChannel = 0;

        // Dedicated 64KB on-board Wave RAM
        this.waveRam = new Uint8Array(0x10000);

        // --- 3. Pre-allocated Hot-Path Local Variables (Zero-Allocation) ---
        this.mixedSamples = new Uint32Array(2); // Left and Right channels mixers

        this.initialise();
    }

    /**
     * Resets PCM registers to default boot states.
     */
    initialise() {
        this.chDisabled.fill(1); // Channels disabled by default
        this.chVolume.fill(0);
        this.chPanningL.fill(0);
        this.chPanningR.fill(0);
        this.chFrequency.fill(0);
        this.chLoopAddress.fill(0);
        this.chStartAddress.fill(0);
        this.chAddress.fill(0);

        this.sounding = 0;
        this.currentWaveBank = 0;
        this.currentChannel = 0;

        this.waveRam.fill(0);
        this.channelsDisabledMask.fill(0);
    }

    /**
     * Checks if a specific voice channel is allowed to render active samples.
     * @param {number} ch - Channel index (0 to 7).
     * @returns {boolean} True if audible.
     */
    isChannelAudible(ch) {
        return this.chDisabled[ch] === 0 && this.sounding !== 0;
    }

    /**
     * Re-aligns frequency accumulators for muted channels.
     */
    checkChannelResets() {
        for (let i = 0; i < 8; i++) {
            if (!this.isChannelAudible(i)) {
                this.chAddress[i] = (this.chStartAddress[i] << 19) >>> 0;
            }
        }
    }

    /**
     * Writes an 8-bit value to a PCM controller register.
     * @param {number} reg - Register index.
     * @param {number} value - 8-bit instruction written from the system bus.
     */
    writeRegister(reg, value) {
        reg = reg & 0xFF;
        value = value & 0xFF;

        const ch = this.currentChannel;

        switch (reg) {
            case 0:
                // Channel Volume
                this.chVolume[ch] = value;
                break;
                
            case 1:
                // Channel Stereo Panning
                this.chPanningL[ch] = value & 0xF;        // Left pan bits (0-3)
                this.chPanningR[ch] = (value >> 4) & 0xF; // Right pan bits (4-7)
                break;
                
            case 2:
                // Channel Frequency (Low byte)
                this.chFrequency[ch] = (this.chFrequency[ch] & 0xFF00) | value;
                break;
                
            case 3:
                // Channel Frequency (High byte)
                this.chFrequency[ch] = (this.chFrequency[ch] & 0x00FF) | (value << 8);
                break;
                
            case 4:
                // Channel Loop Address (Low byte)
                this.chLoopAddress[ch] = (this.chLoopAddress[ch] & 0xFF00) | value;
                break;
                
            case 5:
                // Channel Loop Address (High byte)
                this.chLoopAddress[ch] = (this.chLoopAddress[ch] & 0x00FF) | (value << 8);
                break;

            case 6:
                // Channel Start Address
                this.chStartAddress[ch] = value;
                if (!this.isChannelAudible(ch)) {
                    this.chAddress[ch] = (value << 19) >>> 0;
                }
                break;

            case 7:
                // Sounding Control & Bank Mapping
                this.sounding = (value & 0x80) !== 0 ? 1 : 0;
                this.checkChannelResets();

                if ((value & 0x40) !== 0) {
                    this.currentChannel = value & 7;
                } else {
                    this.currentWaveBank = value & 0xF;
                }
                break;

            case 8:
                // Global Channels Enable Mask
                for (let i = 0; i < 8; ++i) {
                    this.chDisabled[i] = ((value >> i) & 1) !== 0 ? 1 : 0;
                }
                this.checkChannelResets();
                break;
        }
    }

    /**
     * Reads the current state of a PCM register.
     * @param {number} reg - Register index.
     * @returns {number} 8-bit register state.
     */
    readRegister(reg) {
        reg = reg & 0xFF;
        const ch = this.currentChannel;

        switch (reg) {
            case 0x00:
                return this.chVolume[ch];
                
            case 0x01:
                return (this.chPanningL[ch] << 0) | (this.chPanningR[ch] << 4);
                
            case 0x02:
                return (this.chFrequency[ch] >> 0) & 0xFF;
                
            case 0x03:
                return (this.chFrequency[ch] >> 8) & 0xFF;
                
            case 0x04:
                return (this.chLoopAddress[ch] >> 0) & 0xFF;
                
            case 0x05:
                return (this.chLoopAddress[ch] >> 8) & 0xFF;

            case 0x06:
                return this.chStartAddress[ch];

            case 0x08: {
                let mask = 0;
                for (let i = 0; i < 8; ++i) {
                    mask |= (this.chDisabled[i] & 1) << i;
                }
                return mask;
            }

            // High-speed memory tracking registers (registers 0x10 to 0x1F)
            case 0x10: case 0x12: case 0x14: case 0x16:
            case 0x18: case 0x1A: case 0x1C: case 0x1E:
                return (this.chAddress[(reg - 0x10) / 2] >> 11) & 0xFF;

            case 0x11: case 0x13: case 0x15: case 0x17:
            case 0x19: case 0x1B: case 0x1D: case 0x1F:
                return (this.chAddress[(reg - 0x11) / 2] >> 19) & 0xFF;
        }

        return 0;
    }

    /**
     * Reads an 8-bit value from current Wave RAM memory bank bounds.
     * @param {number} address - 16-bit address offset.
     * @returns {number} 8-bit wave sample.
     */
    readWaveRAM(address) {
        return this.waveRam[(this.currentWaveBank << 12) + (address & 0xFFF)];
    }

    /**
     * Writes an 8-bit value to current Wave RAM memory bank bounds.
     * @param {number} address - 16-bit address offset.
     * @param {number} value - 8-bit wave sample.
     */
    writeWaveRAM(address, value) {
        this.waveRam[(this.currentWaveBank << 12) + (address & 0xFFF)] = value & 0xFF;
    }

    /**
     * Fetches a raw audio sample from Wave RAM using the voice channel's frequency address.
     * @param {number} ch - Channel index.
     * @returns {number} Unsigned 8-bit sample.
     */
    fetchSample(ch) {
        return this.waveRam[(this.chAddress[ch] >> 11) & 0xFFFF];
    }

    /**
     * Advances frequency registers and fetches the next sample, checking for loop flags.
     * @param {number} ch - Channel index.
     * @returns {number} Unsigned 8-bit sample.
     */
    updateAddressAndFetchSample(ch) {
        let waveValue = 0;

        if (this.isChannelAudible(ch)) {
            // Read target sample first
            waveValue = this.fetchSample(ch);
            
            // Step frequency accumulator (masked to 27-bit bounds: 0x7FFFFFF)
            this.chAddress[ch] = (this.chAddress[ch] + this.chFrequency[ch]) & 0x7FFFFFF;

            // Handle the physical end-of-sample wrap loop (0xFF flag value)
            if (waveValue === 0xFF) {
                this.chAddress[ch] = (this.chLoopAddress[ch] << 11) >>> 0;
                waveValue = this.fetchSample(ch);
            }
        }

        return waveValue;
    }

    /**
     * Converts unsigned 16-bit raw PCM samples back to signed 16-bit variables.
     * @param {number} sample - Unsigned 16-bit sample.
     * @returns {number} Signed 16-bit sample.
     */
    unsignedToSigned(sample) {
        if (sample === 0) {
            return -0x7FFF;
        } else if ((sample & 0x8000) !== 0) {
            return (sample - 0x8000) | 0;
        } else {
            return -(0x8000 - sample) | 0;
        }
    }

    /**
     * Steps the Ricoh PCM clock and mixes active channels snychronously into signed 16-bit PCM.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} totalFrames - Total frames to process on this step.
     */
    update(sampleBuffer, totalFrames) {
        let ptr = 0;

        for (let currentFrame = 0; currentFrame < totalFrames; ++currentFrame) {
            // Unsigned 16-bit mid-bias center is 0x8000
            this.mixedSamples[0] = 0x8000;
            this.mixedSamples[1] = 0x8000;

            for (let ch = 0; ch < 8; ++ch) {
                const sample = this.updateAddressAndFetchSample(ch) | 0;

                if (this.isChannelAudible(ch) && this.channelsDisabledMask[ch] === 0) {
                    const absoluteSample = sample & 0x7F;
                    const addBit = (sample & 0x80) !== 0;
                    const volume = this.chVolume[ch] | 0;

                    // Apply Left Channel Volume panning
                    const scaleL = ((absoluteSample * volume * this.chPanningL[ch]) >> 5) | 0;
                    let mixedL = this.mixedSamples[0] | 0;

                    if (addBit) {
                        mixedL = (mixedL + scaleL) | 0;
                        if (mixedL > 0xFFFF) mixedL = 0xFFFF;
                    } else {
                        mixedL = (mixedL - scaleL) | 0;
                        if (mixedL > 0xFFFF) mixedL = 0x0000; // Underflow clamp
                    }
                    this.mixedSamples[0] = mixedL;

                    // Apply Right Channel Volume panning
                    const scaleR = ((absoluteSample * volume * this.chPanningR[ch]) >> 5) | 0;
                    let mixedR = this.mixedSamples[1] | 0;

                    if (addBit) {
                        mixedR = (mixedR + scaleR) | 0;
                        if (mixedR > 0xFFFF) mixedR = 0xFFFF;
                    } else {
                        mixedR = (mixedR - scaleR) | 0;
                        if (mixedR > 0xFFFF) mixedR = 0x0000;
                    }
                    this.mixedSamples[1] = mixedR;
                }
            }

            // Convert and add mixed signed 16-bit samples to the system output buffer
            sampleBuffer[ptr]     = (sampleBuffer[ptr] + this.unsignedToSigned(this.mixedSamples[0])) | 0;
            sampleBuffer[ptr + 1] = (sampleBuffer[ptr + 1] + this.unsignedToSigned(this.mixedSamples[1])) | 0;
            ptr += 2;
        }
    }
}