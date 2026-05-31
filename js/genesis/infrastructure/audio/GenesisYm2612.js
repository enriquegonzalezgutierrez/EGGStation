/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega Genesis Yamaha YM2612 FM Synthesizer
 * 
 * Emulates the central 6-channel frequency modulation (FM) synthesizer chip 
 * of the Sega Genesis system bus. Handles 4-operator voice algorithms, 
 * independent LFO phase/amplitude modulations, custom DAC sampling registers, 
 * and hardware Timer A / Timer B interrupts.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the complex 
 * FM operator calculations and envelope step states from general bus layers.
 */

// ========================================================================
// PRE-COMPUTED SILICON EMULATION LOOKUP TABLES
// ========================================================================

// 12-bit logarithmic attenuation sine table (1 quarter of a sine wave)
const GENESIS_YM_SINE_TABLE = new Uint16Array([
    0x0859, 0x06C3, 0x0607, 0x058B, 0x052E, 0x04E4, 0x04A6, 0x0471, 0x0443, 0x041A, 0x03F5, 0x03D3, 0x03B5, 0x0398, 0x037E, 0x0365,
    0x034E, 0x0339, 0x0324, 0x0311, 0x02FF, 0x02ED, 0x02DC, 0x02CD, 0x02BD, 0x02AF, 0x02A0, 0x0293, 0x0286, 0x0279, 0x026D, 0x0261,
    0x0256, 0x024B, 0x0240, 0x0236, 0x022C, 0x0222, 0x0218, 0x020F, 0x0206, 0x01FD, 0x01F5, 0x01EC, 0x01E4, 0x01DC, 0x01D4, 0x01CD,
    0x01C5, 0x01BE, 0x01B7, 0x01B0, 0x01A9, 0x01A2, 0x019B, 0x0195, 0x018F, 0x0188, 0x0182, 0x017C, 0x0177, 0x0171, 0x016B, 0x0166,
    0x0160, 0x015B, 0x0155, 0x0150, 0x014B, 0x0146, 0x0141, 0x013C, 0x0137, 0x0133, 0x012E, 0x0129, 0x0125, 0x0121, 0x011C, 0x0118,
    0x0114, 0x010F, 0x010B, 0x0107, 0x0103, 0x00FF, 0x00FB, 0x00F8, 0x00F4, 0x00F0, 0x00EC, 0x00E9, 0x00E5, 0x00E2, 0x00DE, 0x00DB,
    0x00D7, 0x00D4, 0x00D1, 0x00CD, 0x00CA, 0x00C7, 0x00C4, 0x00C1, 0x00BE, 0x00BB, 0x00B8, 0x00B5, 0x00B2, 0x00AF, 0x00AC, 0x00A9,
    0x00A7, 0x00A4, 0x00A1, 0x009F, 0x009C, 0x0099, 0x0097, 0x0094, 0x0092, 0x008F, 0x008D, 0x008A, 0x0088, 0x0086, 0x0083, 0x0081,
    0x007F, 0x007D, 0x007A, 0x0078, 0x0076, 0x0074, 0x0072, 0x0070, 0x006E, 0x006C, 0x006A, 0x0068, 0x0066, 0x0064, 0x0062, 0x0060,
    0x005E, 0x005C, 0x005B, 0x0059, 0x0057, 0x0055, 0x0053, 0x0052, 0x0050, 0x004E, 0x004D, 0x004B, 0x004A, 0x0048, 0x0046, 0x0045,
    0x0043, 0x0042, 0x0040, 0x003F, 0x003E, 0x003C, 0x003B, 0x0039, 0x0038, 0x0037, 0x0035, 0x0034, 0x0033, 0x0031, 0x0030, 0x002F,
    0x002E, 0x002D, 0x002B, 0x002A, 0x0029, 0x0028, 0x0027, 0x0026, 0x0025, 0x0024, 0x0023, 0x0022, 0x0021, 0x0020, 0x001F, 0x001E,
    0x001D, 0x001C, 0x001B, 0x001A, 0x0019, 0x0018, 0x0017, 0x0017, 0x0016, 0x0015, 0x0014, 0x0014, 0x0013, 0x0012, 0x0011, 0x0011,
    0x0010, 0x000F, 0x000F, 0x000E, 0x000D, 0x000D, 0x000C, 0x000C, 0x000B, 0x000A, 0x000A, 0x0009, 0x0009, 0x0008, 0x0008, 0x0007,
    0x0007, 0x0007, 0x0006, 0x0006, 0x0005, 0x0005, 0x0005, 0x0004, 0x0004, 0x0004, 0x0003, 0x0003, 0x0003, 0x0002, 0x0002, 0x0002,
    0x0002, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000
]);

// 11-bit power lookup table converting logarithms back to linear values
const GENESIS_YM_POWER_TABLE = new Uint16Array([
    0x07FA, 0x07F5, 0x07EF, 0x07EA, 0x07E4, 0x07DF, 0x07DA, 0x07D4, 0x07CF, 0x07C9, 0x07C4, 0x07BF, 0x07B9, 0x07B4, 0x07AE, 0x07A9,
    0x07A4, 0x079F, 0x0799, 0x0794, 0x078F, 0x078A, 0x0784, 0x077F, 0x077A, 0x0775, 0x0770, 0x076A, 0x0765, 0x0760, 0x075B, 0x0756,
    0x0751, 0x074C, 0x0747, 0x0742, 0x073D, 0x0738, 0x0733, 0x072E, 0x0729, 0x0724, 0x071F, 0x071A, 0x0715, 0x0710, 0x070B, 0x0706,
    0x0702, 0x06FD, 0x06F8, 0x06F3, 0x06EE, 0x06E9, 0x06E5, 0x06E0, 0x06DB, 0x06D6, 0x06D2, 0x06CD, 0x06C8, 0x06C4, 0x06BF, 0x06BA,
    0x06B5, 0x06B1, 0x06AC, 0x06A8, 0x06A3, 0x069E, 0x069A, 0x0695, 0x0691, 0x068C, 0x0688, 0x0683, 0x067F, 0x067A, 0x0676, 0x0671,
    0x066D, 0x0668, 0x0664, 0x065F, 0x065B, 0x0657, 0x0652, 0x064E, 0x0649, 0x0645, 0x0641, 0x063C, 0x0638, 0x0634, 0x0630, 0x062B,
    0x0627, 0x0623, 0x061E, 0x061A, 0x0616, 0x0612, 0x060E, 0x0609, 0x0605, 0x0601, 0x05FD, 0x05F9, 0x05F5, 0x05F0, 0x05EC, 0x05E8,
    0x05E4, 0x05E0, 0x05DC, 0x05D8, 0x05D4, 0x05D0, 0x05CC, 0x05C8, 0x05C4, 0x05C0, 0x05BC, 0x05B8, 0x05B4, 0x05B0, 0x05AC, 0x05A8,
    0x05A4, 0x05A0, 0x059C, 0x0599, 0x0595, 0x0591, 0x058D, 0x0589, 0x0585, 0x0581, 0x057E, 0x057A, 0x0576, 0x0572, 0x056F, 0x056B,
    0x0567, 0x0563, 0x0560, 0x055C, 0x0558, 0x0554, 0x0551, 0x054D, 0x0549, 0x0546, 0x0542, 0x053E, 0x053B, 0x0537, 0x0534, 0x0530,
    0x052C, 0x0529, 0x0525, 0x0522, 0x051E, 0x01B, 0x0517, 0x0514, 0x0510, 0x050C, 0x0509, 0x0506, 0x0502, 0x04FF, 0x04FB, 0x04F8,
    0x04F4, 0x04F1, 0x04ED, 0x04EA, 0x04E7, 0x04E3, 0x04E0, 0x04DC, 0x04D9, 0x04D6, 0x04D2, 0x04CF, 0x04CC, 0x04C8, 0x04C5, 0x04C2,
    0x04BE, 0x04BB, 0x04B8, 0x04B5, 0x04B1, 0x04AE, 0x04AB, 0x04A8, 0x04A4, 0x04A1, 0x049E, 0x049B, 0x0498, 0x0494, 0x0491, 0x048E,
    0x048B, 0x0488, 0x0485, 0x0482, 0x047E, 0x047B, 0x0478, 0x0475, 0x0472, 0x046F, 0x046C, 0x0469, 0x0466, 0x0463, 0x0460, 0x045D,
    0x045A, 0x0457, 0x0454, 0x0451, 0x044E, 0x044B, 0x0448, 0x0445, 0x0442, 0x043F, 0x043C, 0x0439, 0x0436, 0x0433, 0x0430, 0x042D,
    0x042A, 0x0428, 0x0425, 0x0422, 0x041F, 0x041C, 0x0419, 0x0416, 0x0414, 0x0411, 0x040E, 0x040B, 0x0408, 0x0406, 0x0403, 0x0400
]);

const GENESIS_YM_ENVELOPE_MODE_ATTACK  = 0;
const GENESIS_YM_ENVELOPE_MODE_DECAY   = 1;
const GENESIS_YM_ENVELOPE_MODE_SUSTAIN = 2;
const GENESIS_YM_ENVELOPE_MODE_RELEASE = 3;

// ========================================================================
// LOW-FREQUENCY OSCILLATOR SUB-UNIT
// ========================================================================
class GenesisYmLfo {
    constructor() {
        this.frequency = 0;
        this.amplitudeModulation = 0;
        this.phaseModulation = 0;
        this.subCounter = 0;
        this.counter = 0;
        this.enabled = false;
    }

    reset() {
        this.frequency = 0;
        this.amplitudeModulation = 0;
        this.phaseModulation = 0;
        this.subCounter = 0;
        this.counter = 0;
        this.enabled = false;
    }

    setEnabled(enabled) {
        if (this.enabled !== enabled) {
            this.enabled = enabled;
            if (!enabled) {
                this.counter = 0;
                this.phaseModulation = 0;
                this.amplitudeModulation = 0;
                return true; // Force-refresh channels modulation
            }
        }
        return false;
    }

    advance() {
        // Master LFO step triggers configuration thresholds
        const thresholds = [0x6C, 0x4D, 0x47, 0x43, 0x3E, 0x2C, 0x08, 0x05];
        const threshold = thresholds[this.frequency];

        if ((this.subCounter++ & threshold) === threshold) {
            this.subCounter = 0;

            if (this.enabled) {
                const phaseModulationDivisor = 4;

                this.counter = (this.counter + 1) & 0x7F;
                this.phaseModulation = Math.floor(this.counter / phaseModulationDivisor);
                this.amplitudeModulation = this.counter * 2;

                if (this.amplitudeModulation >= 0x80) {
                    this.amplitudeModulation &= 0x7E;
                } else {
                    this.amplitudeModulation ^= 0x7E;
                }

                // Return true if the phase modulation scale index shifted
                return (this.counter % phaseModulationDivisor) === 0;
            }
        }
        return false;
    }
}

// ========================================================================
// YAMAHA YM2612 CORE SYNTHESIZER
// ========================================================================
class GenesisYm2612 {
    /**
     * @param {number} systemClock - System master clock.
     */
    constructor(systemClock = 7670454) {
        this.systemClock = systemClock;

        // --- 1. Sound Channels Configuration ---
        this.fmChannelsDisabled = new Uint8Array(6);
        this.dacChannelDisabled = 0;
        this.ladderEffectDisabled = 0;

        // --- 2. Parallel Operators Contiguous Arrays (24 Total Operators: 6 Channels * 4) ---
        this.opPosition = new Uint32Array(24);
        this.opStep = new Uint32Array(24);
        this.opFNumberAndBlock = new Uint16Array(24);
        this.opKeyCode = new Uint16Array(24);
        this.opDetune = new Uint16Array(24);
        this.opMultiplier = new Uint16Array(24);
        
        this.opCountdown = new Uint16Array(24);
        this.opCycleCounter = new Uint16Array(24);
        this.opDeltaIndex = new Uint16Array(24);
        this.opAttenuation = new Uint16Array(24);
        this.opTotalLevel = new Uint16Array(24);
        this.opSustainLevel = new Uint16Array(24);
        this.opKeyScale = new Uint8Array(24);
        
        this.opRates = new Uint16Array(24 * 4); // 4 modes per operator
        this.opEnvelopeMode = new Uint8Array(24);
        this.opKeyOn = new Uint8Array(24);
        this.opAmplitudeModulationOn = new Uint8Array(24);

        // SSG-EG Sub-states
        this.opSsgEnabled = new Uint8Array(24);
        this.opSsgAttack = new Uint8Array(24);
        this.opSsgAlternate = new Uint8Array(24);
        this.opSsgHold = new Uint8Array(24);
        this.opSsgInvert = new Uint8Array(24);

        // --- 3. Parallel Channels Contiguous Arrays (6 Channels) ---
        this.chFeedbackDivisor = new Uint8Array(6);
        this.chAlgorithm = new Uint16Array(6);
        this.chPrevSample0 = new Int16Array(6);
        this.chPrevSample1 = new Int16Array(6);
        this.chAmplitudeModulationShift = new Uint8Array(6);
        this.chPhaseModulationSensitivity = new Uint8Array(6);

        this.chPanLeft = new Uint8Array(6);
        this.chPanRight = new Uint8Array(6);

        // --- 4. Special Channel 3 Multi-Frequency Arrays ---
        this.ch3Frequencies = new Uint16Array(4);
        this.ch3PerOperatorFrequenciesEnabled = 0;
        this.ch3CsmModeEnabled = 0;

        // --- 5. Global Control State Registers ---
        this.port = 0;
        this.address = 0;
        
        this.dacSample = 0x100; // Digital-to-Analog Converter 9-bit register
        this.dacEnabled = 0;
        this.dacTest = 0;

        this.rawTimerAValue = 0;
        this.timerAValue = 0;
        this.timerACounter = 0;
        this.timerAEnabled = 0;

        this.timerBValue = 0;
        this.timerBCounter = 0;
        this.timerBEnabled = 0;

        this.cachedAddress27 = 0;
        this.cachedUpperFrequencyBits = 0;
        this.cachedUpperFrequencyBitsFm3Multi = 0;
        
        this.leftoverCycles = 0;
        this.status = 0;
        this.busyFlagCounter = 0;

        // LFO Sub-unit
        this.lfo = new GenesisYmLfo();

        this.initialise();
    }

    initialise() {
        this.fmChannelsDisabled.fill(0);
        this.dacChannelDisabled = 0;
        this.ladderEffectDisabled = 0;

        this.opPosition.fill(0);
        this.opStep.fill(0);
        this.opFNumberAndBlock.fill(0);
        this.opKeyCode.fill(0);
        this.opDetune.fill(0);
        this.opMultiplier.fill(0);

        this.opCountdown.fill(1); // Envelope update starts immediately
        this.opCycleCounter.fill(0);
        this.opDeltaIndex.fill(0);
        this.opAttenuation.fill(0x3FF); // Silenced on startup
        this.opTotalLevel.fill(0x3F8); // TL mapped to silent 0x7F << 3
        this.opSustainLevel.fill(0);
        this.opKeyScale.fill(0);
        
        this.opRates.fill(0);
        this.opEnvelopeMode.fill(GENESIS_YM_ENVELOPE_MODE_RELEASE);
        this.opKeyOn.fill(0);
        this.opAmplitudeModulationOn.fill(0);

        this.opSsgEnabled.fill(0);
        this.opSsgAttack.fill(0);
        this.opSsgAlternate.fill(0);
        this.opSsgHold.fill(0);
        this.opSsgInvert.fill(0);

        this.chFeedbackDivisor.fill(9); // Mapped to ComputeFeedbackDivisor(0)
        this.chAlgorithm.fill(0);
        this.chPrevSample0.fill(0);
        this.chPrevSample1.fill(0);
        this.chAmplitudeModulationShift.fill(7); // default shift
        this.chPhaseModulationSensitivity.fill(0);

        this.chPanLeft.fill(1); // Panning is enabled on boot
        this.chPanRight.fill(1);

        this.ch3Frequencies.fill(0);
        this.ch3PerOperatorFrequenciesEnabled = 0;
        this.ch3CsmModeEnabled = 0;

        this.port = 0;
        this.address = 0;

        this.dacSample = 0x100;
        this.dacEnabled = 0;
        this.dacTest = 0;

        this.rawTimerAValue = 0;
        this.timerAValue = 0x400;
        this.timerACounter = 0x400;
        this.timerAEnabled = 0;

        this.timerBValue = 0x1000;
        this.timerBCounter = 0x1000;
        this.timerBEnabled = 0;

        this.cachedAddress27 = 0;
        this.cachedUpperFrequencyBits = 0;
        this.cachedUpperFrequencyBitsFm3Multi = 0;

        this.leftoverCycles = 0;
        this.status = 0;
        this.busyFlagCounter = 0;

        this.lfo.reset();
    }

    /**
     * Helper to recalculate the Phase Step of an operator on-the-fly.
     * Restores exact rounding anomalies matching original silicon gates.
     */
    recalculatePhaseStep(opIdx) {
        const fNumberAndBlock = this.opFNumberAndBlock[opIdx];
        const block = (fNumberAndBlock >> 11) & 7;
        const fNumber = fNumberAndBlock & 0x7FF;

        // Detune lookup matching native GEMS sound driver adjustments
        const keyCodes = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3];
        const detuneLookup = [
            [0, 0, 1, 2], [0, 1, 2, 2], [0, 1, 2, 4], [0, 2, 4, 5],
            [0, 2, 5, 8], [0, 4, 8, 11], [0, 5, 11, 16], [0, 8, 16, 22]
        ];

        const dtVal = detuneLookup[block][keyCodes[fNumber >> 7]][this.opDetune[opIdx] & 3];

        // LFO Phase Modulation step shifts
        const phaseModulationAbsolute = this.lfo.phaseModulation & 7;
        const phaseModulationIsNegative = (this.lfo.phaseModulation & 0x10) !== 0;

        const fNumberUpper = fNumber >> 4;
        const sensitivity = this.opAmplitudeModulationOn[opIdx] | 0; // mapped to sensitivity flag
        
        // Exact hardware logic emulator shifts tables (bypassing slow dynamic mults)
        const lfoShifts = [
            [[7, 7], [7, 7], [7, 7], [7, 7], [7, 7], [7, 7], [7, 7], [7, 7]],
            [[7, 7], [7, 7], [7, 7], [7, 7], [7, 2], [7, 2], [7, 2], [7, 2]],
            [[7, 7], [7, 7], [7, 7], [7, 2], [7, 2], [7, 2], [1, 7], [1, 7]],
            [[7, 7], [7, 7], [7, 2], [7, 2], [1, 7], [1, 7], [1, 2], [1, 2]]
        ];

        const sensMap = this.chPhaseModulationSensitivity[Math.floor(opIdx / 4)] & 3;
        const shifts = lfoShifts[sensMap][phaseModulationAbsolute];
        
        let step = (fNumberUpper >> shifts[0]) + (fNumberUpper >> shifts[1]);
        if (sensMap > 5) {
            step <<= sensMap - 5;
        }
        step >>= 2;

        if (phaseModulationIsNegative) {
            step = -step;
        }

        step += fNumber << 1;
        step &= 0xFFF;
        step <<= block;
        step >>= 2; // Convert from 16-bit to 14-bit step

        // Detune bounds correction
        if ((this.opDetune[opIdx] & 4) !== 0) {
            step -= dtVal;
        } else {
            step += dtVal;
        }

        step &= 0x1FFFF; // Latch underflow bug
        step *= this.opMultiplier[opIdx];
        step = Math.floor(step / 2);

        this.opStep[opIdx] = step;
    }

    setKeyOn(opIdx, keyOn) {
        const val = keyOn ? 1 : 0;
        if (this.opKeyOn[opIdx] !== val) {
            this.opKeyOn[opIdx] = val;

            if (keyOn) {
                this.opEnvelopeMode[opIdx] = GENESIS_YM_ENVELOPE_MODE_ATTACK;
                this.opPosition[opIdx] = 0; // Reset phase position
            } else {
                this.opEnvelopeMode[opIdx] = GENESIS_YM_ENVELOPE_MODE_RELEASE;
                // Invert the SSG-EG phase snychronously on key release
                if (this.opSsgEnabled[opIdx] !== 0 && this.opAttenuation[opIdx] >= 0x200) {
                    if (this.opSsgInvert[opIdx] === this.opSsgAttack[opIdx]) {
                        this.opAttenuation[opIdx] = (0x200 - this.opAttenuation[opIdx]) & 0x3FF;
                    }
                }
                this.opSsgInvert[opIdx] = 0;
            }
        }
    }

    writeAddress(port, address) {
        this.port = port * 3;
        this.address = address & 0xFF;
    }

    /**
     * Latches data into the registers, updating the compiled pipeline variables.
     */
    writeData(data) {
        data = data & 0xFF;

        // Trigger busy flag countdown
        this.status |= 0x80;
        this.busyFlagCounter = 32 * 6; // 32 internal cycles * Prescaler 6

        if (this.address < 0x30) {
            if (this.port === 0) {
                switch (this.address) {
                    case 0x22:
                        // LFO Enable / Frequency register
                        if (this.lfo.setEnabled((data & 8) !== 0)) {
                            // Refresh all channels LFO configurations
                            for (let ch = 0; ch < 6; ch++) {
                                for (let op = 0; op < 4; op++) {
                                    this.recalculatePhaseStep((ch * 4) + op);
                                }
                            }
                        }
                        this.lfo.frequency = data & 7;
                        break;

                    case 0x24:
                        // Timer A value (low 8 bits)
                        this.rawTimerAValue = (this.rawTimerAValue & 3) | (data << 2);
                        this.timerAValue = 0x400 - this.rawTimerAValue;
                        break;

                    case 0x25:
                        // Timer A value (high 2 bits)
                        this.rawTimerAValue = (this.rawTimerAValue & ~3) | (data & 3);
                        this.timerAValue = 0x400 - this.rawTimerAValue;
                        break;

                    case 0x26:
                        // Timer B value
                        this.timerBValue = 16 * (0x100 - data);
                        break;

                    case 0x27: {
                        // Timer load / enable / clear state registers
                        const ch3MultiEnabled = (data & 0xC0) !== 0;

                        for (let t = 0; t < 2; t++) {
                            const shift = t === 0 ? 0 : 1;
                            const enableShift = t === 0 ? 2 : 3;
                            const clearShift = t === 0 ? 4 : 5;

                            if ((data & (1 << shift)) !== 0 && (this.cachedAddress27 & (1 << shift)) === 0) {
                                if (t === 0) this.timerACounter = this.timerAValue;
                                else this.timerBCounter = this.timerBValue;
                            }

                            if (t === 0) this.timerAEnabled = (data & (1 << enableShift)) !== 0 ? 1 : 0;
                            else this.timerBEnabled = (data & (1 << enableShift)) !== 0 ? 1 : 0;

                            if ((data & (1 << clearShift)) !== 0) {
                                this.status &= ~(1 << t);
                            }
                        }

                        this.cachedAddress27 = data;
                        this.ch3PerOperatorFrequenciesEnabled = ch3MultiEnabled ? 1 : 0;
                        this.ch3CsmModeEnabled = (data & 0xC0) === 0x80 ? 1 : 0;
                        break;
                    }

                    case 0x28: {
                        // Key-On Channel mapping selector
                        const channelMapping = [0, 1, 2, -1, 3, 4, 5, -1];
                        const channelIndex = channelMapping[data & 7];

                        if (channelIndex !== -1) {
                            const baseOp = channelIndex * 4;
                            for (let op = 0; op < 4; op++) {
                                this.setKeyOn(baseOp + op, (data & (1 << (4 + op))) !== 0);
                            }
                        }
                        break;
                    }

                    case 0x2A:
                        // DAC data register (Volume mapping)
                        this.dacSample = (this.dacSample & 1) | (data << 1);
                        break;

                    case 0x2B:
                        // DAC enable state
                        this.dacEnabled = (data & 0x80) !== 0 ? 1 : 0;
                        break;

                    case 0x2C:
                        // Web Audio DAC bypass debug test registers
                        this.dacSample = (this.dacSample & ~1) | ((data >> 3) & 1);
                        this.dacTest = (data & 0x20) !== 0 ? 1 : 0;
                        break;
                }
            }
        } else {
            // Address >= 0x30: Channel registers mapping
            const slot = this.address & 3;
            if (slot !== 3) {
                const channelIndex = this.port + slot;
                const baseOp = channelIndex * 4;

                if (this.address < 0xA0) {
                    // Target: Operator Configuration Registers
                    const opScrambled = (this.address >> 2) & 3;
                    const op = ((opScrambled >> 1) | (opScrambled << 1)) & 3;
                    const opIdx = baseOp + op;

                    switch (Math.floor(this.address / 0x10)) {
                        case 3:
                            // Detune and multiplier
                            this.opDetune[opIdx] = (data >> 4) & 7;
                            this.opMultiplier[opIdx] = (data & 0xF) === 0 ? 1 : (data & 0xF) * 2;
                            this.recalculatePhaseStep(opIdx);
                            break;

                        case 4:
                            // Total level (TL)
                            this.opTotalLevel[opIdx] = (data & 0x7F) << 3;
                            break;

                        case 5:
                            // Key scale and Attack rate
                            this.opKeyScale[opIdx] = 3 - ((data >> 6) & 3);
                            this.opRates[(opIdx * 4) + GENESIS_YM_ENVELOPE_MODE_ATTACK] = data & 0x1F;
                            break;

                        case 6:
                            // Decay rate and AM flag
                            this.opRates[(opIdx * 4) + GENESIS_YM_ENVELOPE_MODE_DECAY] = data & 0x1F;
                            this.opAmplitudeModulationOn[opIdx] = (data & 0x80) !== 0 ? 1 : 0;
                            break;

                        case 7:
                            // Sustain rate
                            this.opRates[(opIdx * 4) + GENESIS_YM_ENVELOPE_MODE_SUSTAIN] = data & 0x1F;
                            break;

                        case 8:
                            // Sustain level and Release rate
                            this.opSustainLevel[opIdx] = (data >> 4) === 0xF ? 0x3E0 : (data >> 4) * 0x20;
                            this.opRates[(opIdx * 4) + GENESIS_YM_ENVELOPE_MODE_RELEASE] = ((data & 0xF) << 1) | 1;
                            break;

                        case 9:
                            // SSG-EG properties configuration
                            this.opSsgEnabled[opIdx]   = (data & 8) !== 0 ? 1 : 0;
                            this.opSsgAttack[opIdx]    = (data & 4) !== 0 && this.opSsgEnabled[opIdx] ? 1 : 0;
                            this.opSsgAlternate[opIdx] = (data & 2) !== 0 && this.opSsgEnabled[opIdx] ? 1 : 0;
                            this.opSsgHold[opIdx]      = (data & 1) !== 0 && this.opSsgEnabled[opIdx] ? 1 : 0;
                            break;
                    }
                } else {
                    // Target: Channel Configuration Registers
                    switch (Math.floor(this.address / 4)) {
                        case 0xA0 / 4: {
                            // Frequency low bits
                            const freq = data | (this.cachedUpperFrequencyBits << 8);
                            if (channelIndex === 2) {
                                this.ch3Frequencies[3] = freq;
                                if (this.ch3PerOperatorFrequenciesEnabled !== 0) {
                                    this.opFNumberAndBlock[11] = freq;
                                    this.opKeyCode[11] = freq >> 9;
                                    this.recalculatePhaseStep(11);
                                    break;
                                }
                            }
                            for (let o = 0; o < 4; o++) {
                                this.opFNumberAndBlock[baseOp + o] = freq;
                                this.opKeyCode[baseOp + o] = freq >> 9;
                                this.recalculatePhaseStep(baseOp + o);
                            }
                            break;
                        }

                        case 0xA4 / 4:
                            // Frequency high bits
                            this.cachedUpperFrequencyBits = data & 0x3F;
                            break;

                        case 0xA8 / 4:
                            // Multi-frequency low bits (Channel 3 special mode)
                            if (this.port === 0) {
                                const opMap = [2, 0, 1];
                                const op = opMap[slot];
                                const freq = data | (this.cachedUpperFrequencyBitsFm3Multi << 8);

                                this.ch3Frequencies[op] = freq;
                                if (this.ch3PerOperatorFrequenciesEnabled !== 0) {
                                    const targetOpIdx = 8 + op;
                                    this.opFNumberAndBlock[targetOpIdx] = freq;
                                    this.opKeyCode[targetOpIdx] = freq >> 9;
                                    this.recalculatePhaseStep(targetOpIdx);
                                }
                            }
                            break;

                        case 0xAC / 4:
                            // Multi-frequency high bits
                            this.cachedUpperFrequencyBitsFm3Multi = data & 0x3F;
                            break;

                        case 0xB0 / 4:
                            // Feedback and Algorithm mapping
                            this.chFeedbackDivisor[channelIndex] = 9 - ((data >> 3) & 7);
                            this.chAlgorithm[channelIndex] = data & 7;
                            break;

                        case 0xB4 / 4:
                            // Pan L/R routing, AM sensitivity, FM sensitivity
                            this.chPanLeft[channelIndex]  = (data & 0x80) !== 0 ? 1 : 0;
                            this.chPanRight[channelIndex] = (data & 0x40) !== 0 ? 1 : 0;
                            this.chAmplitudeModulationShift[channelIndex] = 7 >> ((data >> 4) & 3);
                            this.chPhaseModulationSensitivity[channelIndex] = data & 7;

                            for (let o = 0; o < 4; o++) {
                                this.recalculatePhaseStep(baseOp + o);
                            }
                            break;
                    }
                }
            }
        }
    }

    /**
     * Steps the physical Z80/M68K timers and returns the chip's interrupt status.
     * @param {number} cycles - Clock cycles passed.
     * @returns {number} YM2612 Status Register (IRQ flags).
     */
    update(cycles) {
        if (this.busyFlagCounter > 0) {
            this.busyFlagCounter -= Math.min(this.busyFlagCounter, cycles);
            if (this.busyFlagCounter === 0) {
                this.status &= ~0x80; // Clear BUSY flag snychronously
            }
        }
        return this.status;
    }

    /**
     * Updates individual operators envelopes ADSR states.
     */
    updateEnvelope(opIdx) {
        // SSG-EG boundaries check
        if (this.opSsgEnabled[opIdx] !== 0 && this.opAttenuation[opIdx] >= 0x200) {
            if (this.opSsgAlternate[opIdx] !== 0) {
                this.opSsgInvert[opIdx] = this.opSsgHold[opIdx] !== 0 ? 1 : (this.opSsgInvert[opIdx] === 0 ? 1 : 0);
            } else if (this.opSsgHold[opIdx] === 0) {
                this.opPosition[opIdx] = 0;
            }

            if (this.opSsgHold[opIdx] === 0) {
                this.opEnvelopeMode[opIdx] = GENESIS_YM_ENVELOPE_MODE_ATTACK;
                this.opPosition[opIdx] = 0;
            }
        }

        // Countdown timer ticks
        if (--this.opCountdown[opIdx] === 0) {
            this.opCountdown[opIdx] = 3; // Standard reset

            const rate = this.opRates[(opIdx * 4) + this.opEnvelopeMode[opIdx]] | 0;
            if (rate > 0) {
                const stepRate = rate * 2 + (this.opKeyCode[opIdx] >> this.opKeyScale[opIdx]);
                const cycleBit = (this.opCycleCounter[opIdx]++ & ((1 << Math.max(0, 11 - Math.floor(stepRate / 4))) - 1)) === 0;

                if (cycleBit) {
                    const isAttack = this.opEnvelopeMode[opIdx] === GENESIS_YM_ENVELOPE_MODE_ATTACK;
                    
                    if (isAttack) {
                        if (this.opAttenuation[opIdx] === 0) {
                            this.opEnvelopeMode[opIdx] = GENESIS_YM_ENVELOPE_MODE_DECAY;
                        } else {
                            this.opAttenuation[opIdx] += (~this.opAttenuation[opIdx] << 0) >> 4;
                        }
                    } else {
                        // Decay / Sustain / Release modes step down
                        const limit = this.opSsgEnabled[opIdx] !== 0 ? 0x200 : 0x3F0;
                        if (this.opAttenuation[opIdx] < limit) {
                            this.opAttenuation[opIdx] += 1;
                        } else if (!(this.opKeyOn[opIdx] !== 0 && this.opSsgHold[opIdx] !== 0 && this.opSsgAlternate[opIdx] !== this.opSsgAttack[opIdx])) {
                            this.opEnvelopeMode[opIdx] = GENESIS_YM_ENVELOPE_MODE_RELEASE;
                            this.opAttenuation[opIdx] = 0x3FF; // Total silence
                        }
                    }
                }
            }
        }
    }

    /**
     * Resolves the operator's output value in contiguous, hardware-accurate 9-bit scale.
     */
    processOperator(opIdx, phaseModulation) {
        // Step the Phase Generator accumulator
        this.opPosition[opIdx] += this.opStep[opIdx];
        const phase = (this.opPosition[opIdx] >> 10) & 0x3FF;

        this.updateEnvelope(opIdx);

        // Calculate active AM volume envelope shift
        const amVal = this.opAmplitudeModulationOn[opIdx] !== 0 ? (this.lfo.amplitudeModulation >> this.chAmplitudeModulationShift[Math.floor(opIdx / 4)]) : 0;
        
        let attenuation = this.opAttenuation[opIdx] | 0;
        if (!(this.opKeyOn[opIdx] === 0) && this.opSsgEnabled[opIdx] !== 0 && this.opSsgInvert[opIdx] !== this.opSsgAttack[opIdx]) {
            attenuation = (0x200 - attenuation) & 0x3FF;
        }

        const totalAttenuation = Math.min(0x3FF, attenuation + amVal + this.opTotalLevel[opIdx]);

        // Translate modular Phase quadrants
        const modulatedPhase = (phase + (phaseModulation >> 1)) & 0x3FF;
        const isNegative = (modulatedPhase & 0x200) !== 0;
        const isMirrored = (modulatedPhase & 0x100) !== 0;
        const quarterPhase = (modulatedPhase & 0xFF) ^ (isMirrored ? 0xFF : 0);

        const phaseAsAttenuation = GENESIS_YM_SINE_TABLE[quarterPhase] + (totalAttenuation << 2);

        // Inverse Logarithms back to linear pressure
        const whole = phaseAsAttenuation >> 8;
        const fraction = phaseAsAttenuation & 0xFF;
        const sampleAbsolute = (GENESIS_YM_POWER_TABLE[fraction] << 2) >> whole;

        return isNegative ? -sampleAbsolute : sampleAbsolute;
    }

    /**
     * Mixer core: Runs all algorithm routes per active channel.
     * @param {Int16Array} sampleBuffer - Interactive signed 16-bit audio block.
     * @param {number} totalFrames - Total frames to process on this step.
     */
    outputSamples(sampleBuffer, totalFrames) {
        let ptr = 0;

        for (let frame = 0; frame < totalFrames; ++frame) {
            
            // Step LFO Phase Modulation indicators
            if (this.lfo.advance()) {
                for (let opIdx = 0; opIdx < 24; opIdx++) {
                    this.recalculatePhaseStep(opIdx);
                }
            }

            const dacSampleValue = CC_SIGN_EXTEND ? CC_SIGN_EXTEND(this.dacSample ^ 0x100) : (this.dacSample ^ 0x100) - 0x100;

            for (let ch = 0; ch < 6; ++ch) {
                const baseOp = ch * 4;
                const algorithm = this.chAlgorithm[ch];

                // 1. Process Channel 1 self-feedback registers snychronously
                let feedbackModulation = 0;
                const divisor = this.chFeedbackDivisor[ch];
                if (divisor !== 9) {
                    feedbackModulation = (this.chPrevSample0[ch] + this.chPrevSample1[ch]) >> divisor;
                    const shift = 32 - (15 - divisor);
                    feedbackModulation = (feedbackModulation << shift) >> shift; // Sign extend
                }

                // 2. Fetch all 4 Operators processed samples
                const op1 = this.processOperator(baseOp + 0, feedbackModulation);
                const op2 = this.processOperator(baseOp + 1, algorithm === 0 ? op1 : 0);
                const op3 = this.processOperator(baseOp + 2, (algorithm === 0 ? op2 : algorithm === 1 ? (op1 + op2) : 0));
                
                let op4Modulation = op3;
                if (algorithm === 2) op4Modulation = op1 + op3;
                else if (algorithm === 3) op4Modulation = op2 + op3;

                const op4 = this.processOperator(baseOp + 3, op4Modulation);

                // Update channel feedback buffer
                this.chPrevSample1[ch] = this.chPrevSample0[ch];
                this.chPrevSample0[ch] = op1;

                // 3. Resolve Algorithm specific outputs summing
                let outSample = 0;
                switch (algorithm) {
                    case 0: case 1: case 2: case 3:
                        outSample = op4 >> 5; // 14-bit to 9-bit conversion
                        break;
                    case 4:
                        outSample = (op2 >> 5) + (op4 >> 5);
                        break;
                    case 5:
                        outSample = (op2 >> 5) + (op3 >> 5) + (op4 >> 5);
                        break;
                    case 6:
                        outSample = (op2 >> 5) + (op3 >> 5) + (op4 >> 5);
                        break;
                    case 7:
                        outSample = (op1 >> 5) + (op2 >> 5) + (op3 >> 5) + (op4 >> 5);
                        break;
                }

                // Apply dynamic hardware-specific DAC test oversampling
                const isDac = (ch === 5 && this.dacEnabled !== 0) || this.dacTest !== 0;
                const channelDisabled = isDac ? this.dacChannelDisabled !== 0 : this.fmChannelsDisabled[ch] !== 0;

                let finalSample = isDac ? dacSampleValue : outSample;

                // Apply direct, low-overhead VA4 ladder bug offset
                if (this.ladderEffectDisabled === 0) {
                    if (finalSample < 0) {
                        finalSample += 1;
                        finalSample -= 4; // Shift negative phase slightly
                    } else {
                        finalSample += 4; // Shift positive phase slightly
                    }
                }

                if (channelDisabled) {
                    finalSample = 0;
                }

                // Scale sample to native signed 16-bit PCM and mix
                const volumeOffset = (finalSample * 128) / 8; // standard OPN2 multiplier

                if (this.chPanLeft[ch] !== 0)  sampleBuffer[ptr]     = (sampleBuffer[ptr] + volumeOffset) | 0;
                if (this.chPanRight[ch] !== 0) sampleBuffer[ptr + 1] = (sampleBuffer[ptr + 1] + volumeOffset) | 0;
            }

            // Step dynamic Timer countdown arrays
            for (let t = 0; t < 2; t++) {
                if (t === 0 && this.timerAEnabled !== 0) {
                    if (--this.timerACounter === 0) {
                        this.status |= 1; // Trigger IRQ flag
                        this.timerACounter = this.timerAValue;

                        // Perform CSM key-on pulse if enabled
                        if (this.ch3CsmModeEnabled !== 0) {
                            for (let op = 0; op < 4; op++) {
                                this.setKeyOn(8 + op, true);
                                this.setKeyOn(8 + op, false);
                            }
                        }
                    }
                } else if (t === 1 && this.timerBEnabled !== 0) {
                    if (--this.timerBCounter === 0) {
                        this.status |= 2;
                        this.timerBCounter = this.timerBValue;
                    }
                }
            }

            ptr += 2;
        }
    }
}