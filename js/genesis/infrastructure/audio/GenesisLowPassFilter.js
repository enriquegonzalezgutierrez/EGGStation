/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Genesis Low-Pass Filter
 * 
 * Emulates the analog first-order and second-order low-pass filters integrated 
 * on the physical Genesis motherboard revisions (VA4 etc.) and Sega CD.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the digital DSP 
 * signal calculations from the emulator sound chips.
 */

/**
 * Emulates a digital first-order Low-Pass RC filter.
 * Typically used to filter the high frequencies of the YM2612 FM and PSG.
 */
class GenesisFirstOrderFilter {
    /**
     * @param {number} totalChannels - Number of audio channels (normally 2 for Stereo).
     */
    constructor(totalChannels = 2) {
        this.totalChannels = totalChannels;
        
        // Zero-allocation buffers to cache historical sample states snychronously
        this.previousSample = new Int16Array(this.totalChannels);
        this.previousOutput = new Int32Array(this.totalChannels);
    }

    /**
     * Resets the filter's internal history registers.
     */
    reset() {
        this.previousSample.fill(0);
        this.previousOutput.fill(0);
    }

    /**
     * Applies the first-order low-pass filter to a stereo signed 16-bit PCM buffer.
     * Emulates 32-bit fixed point mathematical divisions (1 << 16 base scale).
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} sampleMagic - Input coefficient multiplier.
     * @param {number} outputMagic - Feedback coefficient multiplier.
     */
    apply(sampleBuffer, sampleMagic, outputMagic) {
        const totalFrames = sampleBuffer.length / this.totalChannels;
        let ptr = 0;

        for (let currentFrame = 0; currentFrame < totalFrames; ++currentFrame) {
            for (let currentChannel = 0; currentChannel < this.totalChannels; ++currentChannel) {
                const sample = sampleBuffer[ptr];
                
                // Emulate the 32-bit fixed-point division base of 65536 (1 << 16)
                const output = Math.floor(
                    ((sample + this.previousSample[currentChannel]) * sampleMagic + 
                     this.previousOutput[currentChannel] * outputMagic) / 65536
                );

                this.previousSample[currentChannel] = sample;
                this.previousOutput[currentChannel] = output;

                sampleBuffer[ptr] = output;
                ptr++;
            }
        }
    }
}

/**
 * Emulates a digital second-order Low-Pass Butterworth filter.
 * Typically used on the Sega CD (Mega-CD) RF5C164 PCM audio output channels.
 */
class GenesisSecondOrderFilter {
    /**
     * @param {number} totalChannels - Number of audio channels (normally 2 for Stereo).
     */
    constructor(totalChannels = 2) {
        this.totalChannels = totalChannels;

        // Historical sample/output arrays matching second-order equations
        this.prevSamples0 = new Int16Array(this.totalChannels);
        this.prevSamples1 = new Int16Array(this.totalChannels);
        this.prevOutputs0 = new Int32Array(this.totalChannels);
        this.prevOutputs1 = new Int32Array(this.totalChannels);
    }

    /**
     * Resets the filter's internal history registers.
     */
    reset() {
        this.prevSamples0.fill(0);
        this.prevSamples1.fill(0);
        this.prevOutputs0.fill(0);
        this.prevOutputs1.fill(0);
    }

    /**
     * Applies the second-order low-pass filter to a stereo signed 16-bit PCM buffer.
     * Incorporates 16-bit clamping to prevent overflow saturation.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} sampleMagic - Input coefficient multiplier.
     * @param {number} outputMagic1 - Primary feedback multiplier.
     * @param {number} outputMagic2 - Secondary feedback multiplier.
     */
    apply(sampleBuffer, sampleMagic, outputMagic1, outputMagic2) {
        const totalFrames = sampleBuffer.length / this.totalChannels;
        let ptr = 0;

        for (let currentFrame = 0; currentFrame < totalFrames; ++currentFrame) {
            for (let currentChannel = 0; currentChannel < this.totalChannels; ++currentChannel) {
                const sample = sampleBuffer[ptr];

                // Emulate the second-order fixed-point multiplications
                const mulSample = Math.floor(((sample + this.prevSamples0[currentChannel]) * sampleMagic) / 65536);
                const mulPrevSample = Math.floor(((this.prevSamples0[currentChannel] + this.prevSamples1[currentChannel]) * sampleMagic) / 65536);
                const mulPrevOutput1 = Math.floor((this.prevOutputs0[currentChannel] * outputMagic1) / 65536);
                const mulPrevOutput2 = Math.floor((this.prevOutputs1[currentChannel] * outputMagic2) / 65536);

                let unclampedOutput = mulSample + mulPrevSample + mulPrevOutput1 - mulPrevOutput2;

                // Hardware-accurate clamp boundaries: enforce valid signed 16-bit ranges (-32767 to 32767)
                if (unclampedOutput > 32767) unclampedOutput = 32767;
                else if (unclampedOutput < -32767) unclampedOutput = -32767;

                this.prevSamples1[currentChannel] = this.prevSamples0[currentChannel];
                this.prevSamples0[currentChannel] = sample;
                this.prevOutputs1[currentChannel] = this.prevOutputs0[currentChannel];
                this.prevOutputs0[currentChannel] = unclampedOutput;

                sampleBuffer[ptr] = unclampedOutput;
                ptr++;
            }
        }
    }
}