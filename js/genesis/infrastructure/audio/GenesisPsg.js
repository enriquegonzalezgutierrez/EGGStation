/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Genesis Programmable Sound Generator (PSG)
 * 
 * Emulates the Texas Instruments SN76489-compatible sound chip integrated 
 * within the Sega Genesis system bus. Handles three square-wave tone channels 
 * and one continuous feedback noise channel (periodic and white noise).
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates raw register latch updates, 
 *   wave phase toggles, and noise generator clocks from general bus read/writes.
 * - Open/Closed Principle (OCP): Designed with modular tone-generation loops 
 *   that synthesize sound samples independently of master bus timing standards.
 */

// Flattened high-speed volume lookup table (16 attenuation levels * 2 phase signs)
const GENESIS_PSG_VOLUMES = new Int16Array([
    0x1FFF, -0x1FFF, // Attenuation 0: Max Volume (+ / -)
    0x196A, -0x196A, // Attenuation 1
    0x1430, -0x1430, // Attenuation 2
    0x1009, -0x1009, // Attenuation 3
    0x0CBD, -0x0CBD, // Attenuation 4
    0x0A1E, -0x0A1E, // Attenuation 5
    0x0809, -0x0809, // Attenuation 6
    0x0662, -0x0662, // Attenuation 7
    0x0512, -0x0512, // Attenuation 8
    0x0407, -0x0407, // Attenuation 9
    0x0333, -0x0333, // Attenuation 10
    0x028A, -0x028A, // Attenuation 11
    0x0204, -0x0204, // Attenuation 12
    0x019A, -0x019A, // Attenuation 13
    0x0146, -0x0146, // Attenuation 14
    0x0000,  0x0000  // Attenuation 15: Muted
]);

const GENESIS_PSG_NOISE_TYPE_PERIODIC = 0;
const GENESIS_PSG_NOISE_TYPE_WHITE    = 1;

class GenesisPsg {
    constructor() {
        // --- 1. Channel Disable Configurations ---
        this.toneDisabled = new Uint8Array(3); // 0 = enabled, 1 = disabled
        this.noiseDisabled = 0;

        // --- 2. Tone Channels Contiguous Memory Buffers ---
        this.tonesCountdown = new Int16Array(3);
        this.tonesCountdownMaster = new Int16Array(3);
        this.tonesAttenuation = new Uint8Array(3);
        this.tonesOutputBit = new Uint8Array(3);

        // --- 3. Noise Channel State ---
        this.noiseCountdown = 0;
        this.noiseAttenuation = 0xF; // Muted on startup
        this.noiseFakeOutputBit = 0;
        this.noiseFrequencyMode = 0;
        this.noiseType = GENESIS_PSG_NOISE_TYPE_PERIODIC;
        this.noiseShiftRegister = 0x8000; // Reset state initialized to MSB set (Nuked-MD & MDTracer specs)

        // --- 4. Latched Command Status ---
        this.latchedChannel = 0;
        this.latchedIsVolumeCommand = 0;

        this.initialise();
    }

    /**
     * Resets all internal registers to cold-boot states.
     */
    initialise() {
        // Reset Tone registers (all silenced on boot)
        this.tonesCountdown.fill(0);
        this.tonesCountdownMaster.fill(1); // Safely default to 1 to prevent division/timer lockouts
        this.tonesAttenuation.fill(0xF);
        this.tonesOutputBit.fill(0);

        // Reset Noise register
        this.noiseCountdown = 0;
        this.noiseAttenuation = 0xF;
        this.noiseFakeOutputBit = 0;
        this.noiseFrequencyMode = 0;
        this.noiseType = GENESIS_PSG_NOISE_TYPE_PERIODIC;
        this.noiseShiftRegister = 0x8000;

        // Reset Latched state
        this.latchedChannel = 0;
        this.latchedIsVolumeCommand = 0;

        this.toneDisabled.fill(0);
        this.noiseDisabled = 0;
    }

    /**
     * Writes an 8-bit command byte to latch registers or update state.
     * Aligned with MDTracer's zero-frequency protection guards.
     * @param {number} command - 8-bit instruction written from the system bus.
     */
    writeCommand(command) {
        command = command & 0xFF;
        const isLatch = (command & 0x80) !== 0;

        if (isLatch) {
            // Update the synchronously latched register target
            this.latchedChannel = (command >> 5) & 3;
            this.latchedIsVolumeCommand = (command & 0x10) !== 0 ? 1 : 0;

            if (this.latchedChannel < 3) {
                const ch = this.latchedChannel;
                if (this.latchedIsVolumeCommand !== 0) {
                    this.tonesAttenuation[ch] = command & 0xF;
                } else {
                    // Update low frequency bits (0-3)
                    let freq = (this.tonesCountdownMaster[ch] & 0x3F0) | (command & 0xF);
                    if (freq === 0) freq = 1; // FIX: Prevent infinite loop or zero-frequency freeze
                    this.tonesCountdownMaster[ch] = freq;
                }
            } else {
                if (this.latchedIsVolumeCommand !== 0) {
                    this.noiseAttenuation = command & 0xF;
                } else {
                    this.noiseType = (command & 4) !== 0 ? GENESIS_PSG_NOISE_TYPE_WHITE : GENESIS_PSG_NOISE_TYPE_PERIODIC;
                    this.noiseFrequencyMode = command & 3;

                    // When the noise register is written, reset the 16-bit shift register state to 0x8000
                    this.noiseShiftRegister = 0x8000;
                }
            }
        } else {
            // Data Write (MSB = 0): Always updates frequency high bits (4-9) for the latched tone channel
            if (this.latchedChannel < 3) {
                let freq = (this.tonesCountdownMaster[this.latchedChannel] & 0x0F) | ((command & 0x3F) << 4);
                if (freq === 0) freq = 1; // FIX: Safety guard
                this.tonesCountdownMaster[this.latchedChannel] = freq;
            }
        }
    }

    /**
     * Steps the PSG clock generator synchronously and writes mono audio straight to the sample buffer.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} totalFrames - Total frames to process on this step.
     */
    update(sampleBuffer, totalFrames) {
        const tonesCount = 3;

        // --- 1. Step the 3 Square-Wave Tone Channels ---
        for (let i = 0; i < tonesCount; ++i) {
            if (this.toneDisabled[i] === 0) {
                const attenuation = this.tonesAttenuation[i] | 0;
                let countdown = this.tonesCountdown[i] | 0;
                const countdownMaster = this.tonesCountdownMaster[i] | 0;
                let outputBit = this.tonesOutputBit[i] | 0;

                let ptr = 0;

                for (let j = 0; j < totalFrames; ++j) {
                    if (countdown !== 0) {
                        countdown = (countdown - 1) | 0;
                    }

                    if (countdownMaster !== 0 && countdown === 0) {
                        // Reset timer countdown and toggle output wave phase
                        countdown = countdownMaster;
                        outputBit = outputBit === 0 ? 1 : 0;
                    }

                    // Direct 1D offset addition (extremely fast)
                    sampleBuffer[ptr] = (sampleBuffer[ptr] + GENESIS_PSG_VOLUMES[(attenuation * 2) + outputBit]) | 0;
                    ptr++;
                }

                this.tonesCountdown[i] = countdown;
                this.tonesOutputBit[i] = outputBit;
            }
        }

        // --- 2. Step the Noise Generator Channel ---
        if (this.noiseDisabled === 0) {
            const attenuation = this.noiseAttenuation | 0;
            let countdown = this.noiseCountdown | 0;
            const frequencyMode = this.noiseFrequencyMode | 0;
            let fakeOutputBit = this.noiseFakeOutputBit | 0;
            let shiftRegister = this.noiseShiftRegister | 0;
            const isWhiteNoise = this.noiseType === GENESIS_PSG_NOISE_TYPE_WHITE;

            const toneMaster3 = this.tonesCountdownMaster[2] | 0;

            let ptr = 0;

            for (let j = 0; j < totalFrames; ++j) {
                if (countdown !== 0) {
                    countdown = (countdown - 1) | 0;
                }

                if (countdown === 0) {
                    // Reset timer countdown
                    if (frequencyMode === 3) {
                        // Inherit frequency timer directly from Tone Channel 3
                        countdown = toneMaster3;
                    } else {
                        countdown = 0x10 << frequencyMode;
                    }

                    fakeOutputBit = fakeOutputBit === 0 ? 1 : 0;

                    if (fakeOutputBit !== 0) {
                        // FIX: Shift register is rotated right on fake output transition (0 to 1)
                        // This matches standard Texas Instruments SN76489 silicon behavior.
                        let feedbackBit = 0;
                        if (isWhiteNoise) {
                            // XOR taps at bit 0 and bit 3 for custom white noise generation
                            feedbackBit = (shiftRegister & 1) ^ ((shiftRegister >> 3) & 1);
                        } else {
                            // Periodic noise feeds back the LSB (bit 0) directly
                            feedbackBit = shiftRegister & 1;
                        }
                        
                        shiftRegister = (shiftRegister >> 1) | (feedbackBit << 15);
                    }
                }

                // Noise channel output level depends on the LSB of the LFSR shift register
                const outputValue = (shiftRegister & 1);

                // Direct 1D offset addition (extremely fast)
                sampleBuffer[ptr] = (sampleBuffer[ptr] + GENESIS_PSG_VOLUMES[(attenuation * 2) + outputValue]) | 0;
                ptr++;
            }

            this.noiseCountdown = countdown;
            this.noiseFakeOutputBit = fakeOutputBit;
            this.noiseShiftRegister = shiftRegister;
        }
    }
}