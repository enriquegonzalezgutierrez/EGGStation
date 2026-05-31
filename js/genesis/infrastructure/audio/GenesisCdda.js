/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Mega CD Red Book CDDA Digital Audio
 * 
 * Emulates the Red Book CD-DA streaming audio mixer found on the Sega CD / Mega CD 
 * expansion board. Integrates volume attenuation, master volume scales, and 
 * snychronous volume envelope fade-ins/fade-outs.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the CD-DA 
 * stereo volume scaling and linear fade progression from other sound chip cores.
 */

const GENESIS_CDDA_MAX_VOLUME   = 1024;  // 0x400 maximum hardware volume base
const GENESIS_CDDA_VOLUME_MASK  = 0xFFF; // 12-bit register mask (BIOS discards upper 4 bits)

class GenesisCdda {
    constructor() {
        this.disabled = false;

        // Volume level registers (16-bit scale, default 0x400)
        this.volume = GENESIS_CDDA_MAX_VOLUME;
        this.masterVolume = GENESIS_CDDA_MAX_VOLUME;
        this.targetVolume = 0;
        this.fadeStep = 0;
        this.fadeRemaining = 0;
        
        this.subtractFadeStep = false;
        this.playing = false;
        this.paused = false;

        this.initialise();
    }

    initialise() {
        this.disabled = false;

        this.volume = GENESIS_CDDA_MAX_VOLUME;
        this.masterVolume = GENESIS_CDDA_MAX_VOLUME;
        this.targetVolume = 0;
        this.fadeStep = 0;
        this.fadeRemaining = 0;

        this.subtractFadeStep = false;
        this.playing = false;
        this.paused = false;
    }

    setPlaying(playing) {
        this.playing = playing;
    }

    setPaused(paused) {
        this.paused = paused;
    }

    /**
     * Helper to scale volume registers by the master volume.
     */
    scaleByMasterVolume(volume) {
        return Math.floor((volume * this.masterVolume) / GENESIS_CDDA_MAX_VOLUME) & GENESIS_CDDA_VOLUME_MASK;
    }

    /**
     * Updates the main channel volume attenuation.
     * @param {number} volume - 12-bit volume value.
     */
    setVolume(volume) {
        this.volume = this.scaleByMasterVolume(volume & GENESIS_CDDA_VOLUME_MASK);
        this.fadeRemaining = 0; // Terminate any active fade process
    }

    /**
     * Updates the global master volume attenuation, scaling current channels.
     * @param {number} masterVolume - 12-bit master volume value.
     */
    setMasterVolume(masterVolume) {
        // Unscale current volume by the old master volume
        const unscaledVolume = Math.floor((this.volume * GENESIS_CDDA_MAX_VOLUME) / this.masterVolume);
        
        this.masterVolume = masterVolume & GENESIS_CDDA_VOLUME_MASK;
        
        // Re-scale by the new master volume
        this.setVolume(unscaledVolume);
    }

    /**
     * Configures a snychronous linear volume fade-in or fade-out.
     * @param {number} targetVolume - Target volume.
     * @param {number} fadeStep - Volume offset added/subtracted per fade update step.
     */
    fadeToVolume(targetVolume, fadeStep) {
        this.targetVolume = this.scaleByMasterVolume(targetVolume);
        this.fadeStep = fadeStep;
        this.subtractFadeStep = targetVolume < this.volume;

        if (this.subtractFadeStep) {
            this.fadeRemaining = this.volume - this.targetVolume;
        } else {
            this.fadeRemaining = this.targetVolume - this.volume;
        }
    }

    /**
     * Steps the linear volume fade envelope.
     * Should be called snychronously 75 times a second (in sync with CDD sub-code frames).
     */
    updateFade() {
        if (this.fadeRemaining === 0) {
            return;
        }

        // Decrement remaining fade steps
        const step = Math.min(this.fadeRemaining, this.fadeStep);
        this.fadeRemaining -= step;

        if (this.subtractFadeStep) {
            this.volume = this.targetVolume + this.fadeRemaining;
        } else {
            this.volume = this.targetVolume - this.fadeRemaining;
        }
    }

    /**
     * Reads stereo digital audio from the CD and mixes it into the sample buffer.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} totalFrames - Total frames to process on this step.
     * @param {Function} cdAudioRead - Frontend CD sector reader callback.
     * @param {Object} userData - User context pointer.
     */
    update(sampleBuffer, totalFrames, cdAudioRead, userData) {
        const totalChannels = 2; // Red Book CDDA is strictly dual-channel stereo
        let framesRead = 0;

        if (this.playing && !this.paused) {
            // Read stereo signed 16-bit PCM frames from the CD
            framesRead = cdAudioRead(userData, sampleBuffer, totalFrames);
        }

        if (this.disabled) {
            framesRead = 0;
        }

        // Apply volume attenuation directly to the mixed samples
        const volumeScale = this.volume;
        const totalSamplesRead = framesRead * totalChannels;
        for (let i = 0; i < totalSamplesRead; ++i) {
            sampleBuffer[i] = Math.floor((sampleBuffer[i] * volumeScale) / GENESIS_CDDA_MAX_VOLUME);
        }

        // Zero-fill any unread portion of the buffer (underflow protection)
        const totalSamplesRequested = totalFrames * totalChannels;
        if (totalSamplesRead < totalSamplesRequested) {
            sampleBuffer.fill(0, totalSamplesRead, totalSamplesRequested);
        }
    }
}