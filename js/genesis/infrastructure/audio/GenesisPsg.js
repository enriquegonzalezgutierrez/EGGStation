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
 * Aligned with hardware standards observed in BlastEm to resolve:
 * 1. Genesis-Specific White Noise LFSR: Replicates the exact hardware gate logic 
 *    by rotating the 16-bit shift register right and applying a XOR-inversion (`0x8000`) 
 *    if bit 6 (`0x40`) is set, replacing the incorrect standard SMS polynomial.
 * 2. 2dB-Step Logarithmic Attenuation: Implements the authentic, physical volume table 
 *    of the SN76489 chip, mapping output levels to a normalized 16-bit range.
 * 3. Master Clock Division: Matches the 16-division step rate of the master clock 
 *    to preserve perfect musical pitch for backing tracks.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates raw register latch updates, 
 *   wave phase toggles, and noise generator clocks from general bus read/writes.
 */

// Flattened high-speed volume lookup table (16 attenuation levels)
// Aligned with the physical 2dB-step volume attenuation table from BlastEm (volume_table)
const GENESIS_PSG_VOLUME_TABLE = new Int16Array([
    2340, 1859, 1476, 1173, 931, 740, 587, 469, 370, 294, 234, 185, 147, 117, 93, 0
]);

const GENESIS_PSG_NOISE_TYPE_PERIODIC = 0;
const GENESIS_PSG_NOISE_TYPE_WHITE    = 1;

class GenesisPsg {
    constructor() {
        // --- 1. Channel Disable Configurations ---
        this.toneDisabled = new Uint8Array(3); // 0 = enabled, 1 = disabled
        this.noiseDisabled = 0;

        // --- 2. Tone Channels Contiguous Memory Buffers ---
        this.tonesCountdown = new Int16Array(4);       // Timer counters for the 4 channels
        this.tonesCountdownMaster = new Int16Array(4); // Reload latch values
        this.tonesAttenuation = new Uint8Array(4);     // Volume attenuation registers (0-15)
        this.tonesOutputState = new Uint8Array(4);     // Wave phase state (0 or 1)

        // --- 3. Noise Channel State ---
        this.noiseType = GENESIS_PSG_NOISE_TYPE_PERIODIC;
        this.noiseUseTone3 = false;
        this.noiseShiftRegister = 0x8000; // Reset state initialized to MSB set (BlastEm aligned)
        this.noiseOut = 0;

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
        this.tonesAttenuation.fill(0xF);  // Silence (0xF = maximum attenuation)
        this.tonesOutputState.fill(0);

        // Reset Noise register
        this.noiseType = GENESIS_PSG_NOISE_TYPE_PERIODIC;
        this.noiseUseTone3 = false;
        this.noiseShiftRegister = 0x8000;
        this.noiseOut = 0;

        // Reset Latched state
        this.latchedChannel = 0;
        this.latchedIsVolumeCommand = 0;

        this.toneDisabled.fill(0);
        this.noiseDisabled = 0;
    }

    /**
     * Writes an 8-bit command byte to latch registers or update state.
     * Aligned with BlastEm's register write latch state machine.
     * @param {number} command - 8-bit instruction written from the system bus.
     */
    writeCommand(command) {
        command = command & 0xFF;
        const isLatch = (command & 0x80) !== 0;

        if (isLatch) {
            // Update the synchronously latched register target
            this.latchedChannel = (command >> 5) & 3;
            this.latchedIsVolumeCommand = (command & 0x10) !== 0;

            const ch = this.latchedChannel;
            if (this.latchedIsVolumeCommand) {
                this.tonesAttenuation[ch] = command & 0xF;
            } else {
                if (ch === 3) {
                    // Noise Channel Frequency & Type update
                    const noiseFreqMode = command & 3;
                    switch (noiseFreqMode) {
                        case 0:
                        case 1:
                        case 2:
                            this.tonesCountdownMaster[3] = 0x10 << noiseFreqMode;
                            this.noiseUseTone3 = false;
                            break;
                        default:
                            this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                            this.noiseUseTone3 = true;
                            break;
                    }
                    this.noiseType = (command & 4) !== 0 ? GENESIS_PSG_NOISE_TYPE_WHITE : GENESIS_PSG_NOISE_TYPE_PERIODIC;
                    this.noiseShiftRegister = 0x8000; // Reset shift register upon noise mode changes
                } else {
                    // Update low frequency bits (0-3)
                    this.tonesCountdownMaster[ch] = (this.tonesCountdownMaster[ch] & 0x3F0) | (command & 0xF);
                    if (ch === 2 && this.noiseUseTone3) {
                        this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                    }
                }
            }
        } else {
            // Data Write (MSB = 0): Always updates frequency high bits (4-9) for the latched tone channel
            const ch = this.latchedChannel;
            if (ch !== 3 && !this.latchedIsVolumeCommand) {
                this.tonesCountdownMaster[ch] = (this.tonesCountdownMaster[ch] & 0x0F) | ((command & 0x3F) << 4);
                if (ch === 2 && this.noiseUseTone3) {
                    this.tonesCountdownMaster[3] = this.tonesCountdownMaster[2];
                }
            }
        }
    }

    /**
     * Steps the PSG clock generator synchronously and writes mono audio straight to the sample buffer.
     * Aligned with BlastEm's physical counter-decay and right-rotation white noise shift register.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} totalFrames - Total frames to process on this step.
     */
    update(sampleBuffer, totalFrames) {
        let ptr = 0;

        for (let frame = 0; frame < totalFrames; ++frame) {
            
            // 1. Process 4 independent audio channels (3 Tones + 1 Noise)
            for (let i = 0; i < 4; i++) {
                if (this.tonesCountdown[i] > 0) {
                    this.tonesCountdown[i] = (this.tonesCountdown[i] - 1) | 0;
                }

                if (this.tonesCountdown[i] === 0) {
                    this.tonesCountdown[i] = this.tonesCountdownMaster[i];
                    this.tonesOutputState[i] = this.tonesOutputState[i] === 0 ? 1 : 0;

                    // Noise channel shift-register right rotation and polynomial feedback (BlastEm aligned)
                    if (i === 3 && this.tonesOutputState[3] !== 0) {
                        this.noiseOut = this.noiseShiftRegister & 1;
                        this.noiseShiftRegister = (this.noiseShiftRegister >> 1) | (this.noiseShiftRegister << 15);
                        
                        if (this.noiseType === GENESIS_PSG_NOISE_TYPE_WHITE) {
                            // XOR-inversion if bit 6 (0x40) is set inside the shifted register
                            if ((this.noiseShiftRegister & 0x40) !== 0) {
                                this.noiseShiftRegister ^= 0x8000;
                            }
                        }
                    }
                }
            }

            // 2. Mix channel output amplitudes into a final mono signal
            let accum = 0;

            // Mix 3 Tone square-wave channels
            for (let i = 0; i < 3; i++) {
                if (this.toneDisabled[i] === 0 && this.tonesOutputState[i] !== 0) {
                    accum += GENESIS_PSG_VOLUME_TABLE[this.tonesAttenuation[i]];
                }
            }

            // Mix Noise channel
            if (this.noiseDisabled === 0 && this.noiseOut !== 0) {
                accum += GENESIS_PSG_VOLUME_TABLE[this.tonesAttenuation[3]];
            }

            // Write mono sample directly into the destination buffer (Int16)
            sampleBuffer[ptr] = (sampleBuffer[ptr] + accum) | 0;
            ptr++;
        }
    }
}