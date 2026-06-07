/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/audio/GenesisYm2612.cpp
 * 
 * Domain Layer: Sega Genesis Yamaha YM2612 FM Synthesizer Implementation
 */

#include "GenesisYm2612.h"

// FIXED: Included standard C++ libraries instead of C-style headers 
// to properly map std::memset and standard math namespaces.
#include <cstring>
#include <cmath>

// ========================================================================
// STATIC HARDWARE LOOKUP TABLES DEFINITIONS (TI/Nuked-OPN compliant)
// ========================================================================

const uint16_t GenesisYm2612::sineTable[256] = {
    0x0859, 0x06C3, 0x0607, 0x058B, 0x052E, 0x04E4, 0x04A6, 0x0471, 0x0443, 0x041A, 0x03F5, 0x03D3, 0x03B5, 0x0398, 0x037E, 0x0365,
    0x034E, 0x0339, 0x0324, 0x0311, 0x02FF, 0x02ED, 0x02DC, 0x02CD, 0x02BD, 0x02AF, 0x02A0, 0x0293, 0x0286, 0x0279, 0x026D, 0x0261,
    0x0256, 0x024B, 0x0240, 0x0236, 0x022C, 0x0222, 0x0218, 0x020F, 0x0206, 0x01FD, 0x01F5, 0x01EC, 0x01E4, 0x01DC, 0x01D4, 0x01CD,
    0x01C5, 0x01BE, 0x01B7, 0x01B0, 0x01A9, 0x01A2, 0x019B, 0x0195, 0x018F, 0x0188, 0x0182, 0x017C, 0x0177, 0x0171, 0x016B, 0x0166,
    0x0160, 0x015B, 0x0155, 0x0150, 0x014B, 0x0146, 0x0141, 0x013C, 0x0137, 0x0133, 0x012E, 0x0129, 0x0125, 0x0121, 0x011C, 0x0118,
    0x0114, 0x010F, 0x010B, 0x0107, 0x0103, 0x00FF, 0x00FB, 0x00F8, 0x00F4, 0x00F0, 0x00EC, 0x00E9, 0x00E5, 0x00E2, 0x00DE, 0x00DB,
    0x00D7, 0x00D4, 0x00D1, 0x00CD, 0x00CA, 0x00C7, 0x00C4, 0x00C1, 0x00BE, 0x00BB, 0x00B8, 0x00B5, 0x00B2, 0x00AF, 0x00AC, 0x00A9,
    0x00A7, 0x00A4, 0x00A1, 0x009F, 0x009C, 0x0099, 0x0097, 0x0094, 0x0092, 0x008F, 0x008D, 0x008A, 0x0088, 0x0086, 0x0083, 0x0081,
    0x007F, 0x007D, 0x007A, 0x0078, 0x0076, 0x0074, 0x0072, 0x0070, 0x006E, 0x006C, 0x006A, 0x0068, 0x0066, 0x0064, 0x0062, 0x0060,
    0x005E, 0x005C, 0x005B, 0x0059, 0x0057, 0x0055, 0x0053, 0x0052, 0x0050, 0x004E, 0x004D, 0x004B, 0x004A, 0x0048, 0x0045, 0x0043,
    0x0042, 0x0040, 0x003F, 0x003E, 0x003C, 0x003B, 0x0039, 0x0038, 0x0037, 0x0035, 0x0034, 0x0033, 0x0031, 0x0030, 0x002F, 0x002E,
    0x002D, 0x002B, 0x002A, 0x0029, 0x0028, 0x0027, 0x0026, 0x0025, 0x0024, 0x0023, 0x0022, 0x0021, 0x0020, 0x001F, 0x001E, 0x001D,
    0x001C, 0x001B, 0x001A, 0x0019, 0x0018, 0x0017, 0x0017, 0x0016, 0x0015, 0x0014, 0x0014, 0x0013, 0x0012, 0x0011, 0x0011, 0x0010,
    0x000F, 0x000F, 0x000E, 0x000D, 0x000D, 0x000C, 0x000C, 0x000B, 0x000A, 0x000A, 0x0009, 0x0009, 0x0008, 0x0008, 0x0007, 0x0007,
    0x0007, 0x0006, 0x0006, 0x0005, 0x0005, 0x0005, 0x0004, 0x0004, 0x0004, 0x0003, 0x0003, 0x0003, 0x0002, 0x0002, 0x0002, 0x0002,
    0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000
};

const uint16_t GenesisYm2612::powerTable[256] = {
    0x07FA, 0x07F5, 0x07EF, 0x07EA, 0x07E4, 0x07DF, 0x07DA, 0x07D4, 0x07CF, 0x07C9, 0x07C4, 0x07BF, 0x07B9, 0x07B4, 0x07AE, 0x07A9,
    0x07A4, 0x079F, 0x0799, 0x0794, 0x078F, 0x078A, 0x0784, 0x077F, 0x077A, 0x0775, 0x0770, 0x076A, 0x0765, 0x0760, 0x075B, 0x0756,
    0x0751, 0x074C, 0x0747, 0x0742, 0x073D, 0x0738, 0x0733, 0x072E, 0x0729, 0x0724, 0x071F, 0x071A, 0x0715, 0x0710, 0x070B, 0x0706,
    0x0702, 0x06FD, 0x06F8, 0x06F3, 0x06EE, 0x06E9, 0x06E5, 0x06E0, 0x06DB, 0x06D6, 0x06D2, 0x06CD, 0x06C8, 0x06C4, 0x06BF, 0x06BA,
    0x06B5, 0x06B1, 0x06AC, 0x06A8, 0x06A3, 0x069E, 0x069A, 0x0695, 0x0691, 0x068C, 0x0688, 0x0683, 0x067F, 0x067A, 0x0676, 0x0671,
    0x066D, 0x0668, 0x0664, 0x065F, 0x065B, 0x0657, 0x0652, 0x064E, 0x0649, 0x0645, 0x0641, 0x063C, 0x0638, 0x0634, 0x0630, 0x062B,
    0x0627, 0x0623, 0x061E, 0x061A, 0x0616, 0x0612, 0x060E, 0x0609, 0x0605, 0x0601, 0x05FD, 0x05F9, 0x05F5, 0x05F0, 0x05EC, 0x05E8,
    0x05E4, 0x05E0, 0x05DC, 0x05D8, 0x05D4, 0x05D0, 0x05CC, 0x05C8, 0x05C4, 0x05C0, 0x05BC, 0x05B8, 0x05B4, 0x05B0, 0x05AC, 0x05A8,
    0x05A4, 0x05A0, 0x059C, 0x0599, 0x0595, 0x0591, 0x058D, 0x0589, 0x0585, 0x0581, 0x057E, 0x057A, 0x0572, 0x056F, 0x056B, 0x0567,
    0x0563, 0x0560, 0x055C, 0x0558, 0x0554, 0x0551, 0x054D, 0x0549, 0x0546, 0x0542, 0x053E, 0x053B, 0x0537, 0x0534, 0x0530, 0x052C,
    0x0529, 0x0525, 0x0522, 0x051E, 0x051B, 0x0517, 0x0514, 0x0510, 0x050C, 0x0509, 0x0506, 0x0502, 0x04FF, 0x04FB, 0x04F8, 0x04F4,
    0x04F1, 0x04ED, 0x04EA, 0x04E7, 0x04E3, 0x04E0, 0x04DC, 0x04D9, 0x04D6, 0x04D2, 0x04CF, 0x04CC, 0x04C8, 0x04C5, 0x04C2, 0x04BE,
    0x04BB, 0x04B8, 0x04B5, 0x04B1, 0x04AE, 0x04AB, 0x04A8, 0x04A4, 0x04A1, 0x049E, 0x049B, 0x0498, 0x0494, 0x0491, 0x048E, 0x048B,
    0x0488, 0x0485, 0x0482, 0x047E, 0x047B, 0x0478, 0x0475, 0x0472, 0x046F, 0x046C, 0x0469, 0x0466, 0x0463, 0x0460, 0x045D, 0x045A,
    0x0457, 0x0454, 0x0451, 0x044E, 0x044B, 0x0448, 0x0445, 0x0442, 0x043F, 0x043C, 0x0439, 0x0436, 0x0433, 0x0430, 0x042D, 0x042A,
    0x0428, 0x0425, 0x0422, 0x041F, 0x041C, 0x0419, 0x0416, 0x0414, 0x0411, 0x040E, 0x040B, 0x0408, 0x0406, 0x0403, 0x0400
};

// ========================================================================
// 5. LOW-FREQUENCY OSCILLATOR (LFO) LOGIC
// ========================================================================

YmLfo::YmLfo() {
    reset();
}

void YmLfo::reset() {
    frequency = 0;
    amplitudeModulation = 0;
    phaseModulation = 0;
    subCounter = 0;
    counter = 0;
    enabled = false;
}

bool YmLfo::setEnabled(bool isEnabled) {
    if (enabled != isEnabled) {
        enabled = isEnabled;
        if (!isEnabled) {
            counter = 0;
            phaseModulation = 0;
            amplitudeModulation = 0;
            return true; 
        }
    }
    return false;
}

bool YmLfo::advance() {
    const uint16_t thresholds[8] = {108, 77, 71, 67, 62, 44, 8, 5};
    uint16_t threshold = thresholds[frequency & 7];

    subCounter++;
    if (subCounter >= threshold) {
        subCounter = 0;

        if (enabled) {
            counter = (counter + 1) & 0x7F;
            phaseModulation = counter / 4;

            amplitudeModulation = counter * 2;
            if (amplitudeModulation >= 0x80) {
                amplitudeModulation &= 0x7E;
            } else {
                amplitudeModulation ^= 0x7E;
            }
            return (counter % 4) == 0;
        }
    }
    return false;
}

// ========================================================================
// 6. MAIN SYNTHESIZER LOGIC
// ========================================================================

GenesisYm2612::GenesisYm2612() {
    initialize();
}

void GenesisYm2612::initialize() {
    std::memset(fmChannelsDisabled, 0, sizeof(fmChannelsDisabled));
    dacChannelDisabled = 0;
    ladderEffectDisabled = 0;

    std::memset(channels, 0, sizeof(channels));
    std::memset(operators, 0, sizeof(operators));

    for (int i = 0; i < 6; i++) {
        channels[i].feedbackDivisor = 9;
        channels[i].panLeft = 1;
        channels[i].panRight = 1;
    }

    for (int i = 0; i < 24; i++) {
        operators[i].countdown = 1;
        operators[i].attenuation = 0x3FF;
        operators[i].totalLevel = 0x3F8;
        operators[i].envelopeMode = YM_ENV_RELEASE;
    }

    ch3Frequencies[0] = 0;
    ch3Frequencies[1] = 0;
    ch3Frequencies[2] = 0;
    ch3Frequencies[3] = 0;
    ch3PerOperatorFrequenciesEnabled = 0;
    ch3CsmModeEnabled = 0;

    port = 0;
    address = 0;

    dacSample = 0x100;
    dacEnabled = 0;
    dacTest = 0;

    rawTimerAValue = 0;
    timerAValue = 0x400;
    timerACounter = 0x400;
    timerAEnabled = 0;

    timerBValue = 0x1000;
    timerBCounter = 0x1000;
    timerBEnabled = 0;

    cachedUpperFrequencyBits = 0;
    cachedUpperFrequencyBitsFm3Multi = 0;

    status = 0;
    busyFlagCounter = 0;

    timerCycleAccumulator = 0;
    timerBAccumulator = 0;

    lfo.reset();
}

void GenesisYm2612::recalculatePhaseStep(int opIdx) {
    YmOperator& op = operators[opIdx];
    uint16_t block = (op.fNumberAndBlock >> 11) & 7;
    uint16_t fNumber = op.fNumberAndBlock & 0x7FF;

    const uint8_t keyCodes[16] = {0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3};

    const uint8_t detuneLookup[8][4][4] = {
        // Block 0
        { {0,0,0,0}, {0,0,0,0}, {0,0,0,0}, {0,0,0,0} },
        // Block 1
        { {0,0,1,2}, {0,1,2,2}, {0,1,2,4}, {0,2,4,5} },
        // Block 2
        { {0,0,2,4}, {0,2,4,4}, {0,2,4,8}, {0,4,8,10} },
        // Block 3
        { {0,0,3,6}, {0,3,6,6}, {0,3,6,12}, {0,6,12,15} },
        // Block 4
        { {0,0,4,8}, {0,4,8,8}, {0,4,8,16}, {0,8,16,20} },
        // Block 5
        { {0,0,5,10}, {0,5,10,10}, {0,5,10,20}, {0,10,20,25} },
        // Block 6
        { {0,0,6,12}, {0,6,12,12}, {0,6,12,24}, {0,12,24,30} },
        // Block 7
        { {0,0,7,14}, {0,7,14,14}, {0,7,14,28}, {0,14,28,35} }
    };

    uint8_t dtVal = detuneLookup[block][keyCodes[fNumber >> 7]][op.detune & 3];

    uint8_t pmAbsolute = lfo.phaseModulation & 7;
    bool pmIsNegative = (lfo.phaseModulation & 0x10) != 0;

    uint16_t fNumberUpper = fNumber >> 4;

    const uint8_t lfoShifts[4][8][2] = {
        { {7,7}, {7,7}, {7,7}, {7,7}, {7,7}, {7,7}, {7,7}, {7,7} },
        { {7,7}, {7,7}, {7,7}, {7,7}, {7,2}, {7,2}, {7,2}, {7,2} },
        { {7,7}, {7,7}, {7,7}, {7,2}, {7,2}, {7,2}, {1,7}, {1,7} },
        { {7,7}, {7,7}, {7,2}, {7,2}, {1,7}, {1,7}, {1,2}, {1,2} }
    };

    uint8_t sensMap = channels[opIdx / 4].phaseModulationSensitivity & 3;
    const uint8_t* shifts = lfoShifts[sensMap][pmAbsolute];

    int32_t step = (fNumberUpper >> shifts[0]) + (fNumberUpper >> shifts[1]);
    if (sensMap > 5) {
        step <<= sensMap - 5;
    }
    step >>= 2;

    if (pmIsNegative) {
        step = -step;
    }

    step += fNumber << 1;
    step &= 0xFFF;
    step <<= block;
    step >>= 2;

    if (op.detune & 4) {
        step -= dtVal;
    } else {
        step += dtVal;
    }

    step &= 0x1FFFF;
    step *= op.multiplier;
    step = step / 2;

    op.step = step;
}

void GenesisYm2612::setKeyOn(int opIdx, bool keyOn) {
    YmOperator& op = operators[opIdx];
    uint8_t val = keyOn ? 1 : 0;
    
    if (op.keyOn != val) {
        op.keyOn = val;

        if (keyOn) {
            op.envelopeMode = YM_ENV_ATTACK;
            op.position = 0;
        } else {
            op.envelopeMode = YM_ENV_RELEASE;
            if (op.ssgEnabled != 0 && op.attenuation >= 0x200) {
                if (op.ssgInvert == op.ssgAttack) {
                    op.attenuation = (0x200 - op.attenuation) & 0x3FF;
                }
            }
            op.ssgInvert = 0;
        }
    }
}

void GenesisYm2612::writeAddress(uint8_t targetPort, uint8_t targetAddress) {
    port = targetPort * 3;
    address = targetAddress;
}

void GenesisYm2612::writeData(uint8_t data) {
    status |= 0x80;
    busyFlagCounter = 32 * 6; // Hardware-accurate busy cycles latching delay

    if (address < 0x30) {
        if (port == 0) {
            switch (address) {
                case 0x22:
                    if (lfo.setEnabled((data & 8) != 0)) {
                        for (int ch = 0; ch < 6; ch++) {
                            for (int op = 0; op < 4; op++) {
                                recalculatePhaseStep((ch * 4) + op);
                            }
                        }
                    }
                    lfo.frequency = data & 7;
                    break;

                case 0x24:
                    rawTimerAValue = (rawTimerAValue & 3) | (data << 2);
                    timerAValue = 0x400 - rawTimerAValue;
                    break;

                case 0x25:
                    rawTimerAValue = (rawTimerAValue & ~3) | (data & 3);
                    timerAValue = 0x400 - rawTimerAValue;
                    break;

                case 0x26:
                    timerBValue = 16 * (0x100 - data);
                    break;

                case 0x27: {
                    bool ch3MultiEnabled = (data & 0xC0) != 0;

                    for (int t = 0; t < 2; t++) {
                        int shift = t == 0 ? 0 : 1;
                        int enableShift = t == 0 ? 2 : 3;
                        int clearShift = t == 0 ? 4 : 5;

                        if ((data & (1 << shift)) != 0 && (timerAEnabled & (1 << shift)) == 0) {
                            if (t == 0) timerACounter = timerAValue;
                            else timerBCounter = timerBValue;
                        }

                        if (t == 0) timerAEnabled = (data & (1 << enableShift)) != 0 ? 1 : 0;
                        else timerBEnabled = (data & (1 << enableShift)) != 0 ? 1 : 0;

                        if ((data & (1 << clearShift)) != 0) {
                            status &= ~(1 << t);
                        }
                    }

                    ch3PerOperatorFrequenciesEnabled = ch3MultiEnabled ? 1 : 0;
                    ch3CsmModeEnabled = (data & 0xC0) == 0x80 ? 1 : 0;
                    break;
                }

                case 0x28: {
                    const int8_t channelMapping[8] = {0, 1, 2, -1, 3, 4, 5, -1};
                    int8_t channelIndex = channelMapping[data & 7];

                    if (channelIndex != -1) {
                        int baseOp = channelIndex * 4;
                        for (int op = 0; op < 4; op++) {
                            setKeyOn(baseOp + op, (data & (1 << (4 + op))) != 0);
                        }
                    }
                    break;
                }

                case 0x2A:
                    dacSample = (dacSample & 1) | (data << 1);
                    break;

                case 0x2B:
                    dacEnabled = (data & 0x80) != 0 ? 1 : 0;
                    break;

                case 0x2C:
                    dacSample = (dacSample & ~1) | ((data >> 3) & 1);
                    dacTest = (data & 0x20) != 0 ? 1 : 0;
                    break;
            }
        }
    } else {
        uint8_t slot = address & 3;
        if (slot != 3) {
            uint8_t channelIndex = port + slot;
            int baseOp = channelIndex * 4;

            if (address < 0xA0) {
                uint8_t opScrambled = (address >> 2) & 3;
                uint8_t op = ((opScrambled >> 1) | (opScrambled << 1)) & 3;
                int opIdx = baseOp + op;
                YmOperator& yop = operators[opIdx];

                switch (address / 0x10) {
                    case 3:
                        yop.detune = (data >> 4) & 7;
                        yop.multiplier = (data & 0xF) == 0 ? 1 : (data & 0xF) * 2;
                        recalculatePhaseStep(opIdx);
                        break;

                    case 4:
                        yop.totalLevel = (data & 0x7F) << 3;
                        break;

                    case 5:
                        yop.keyScale = 3 - ((data >> 6) & 3);
                        yop.rates[YM_ENV_ATTACK] = data & 0x1F;
                        break;

                    case 6:
                        yop.rates[YM_ENV_DECAY] = data & 0x1F;
                        yop.amplitudeModulationOn = (data & 0x80) != 0 ? 1 : 0;
                        break;

                    case 7:
                        yop.rates[YM_ENV_SUSTAIN] = data & 0x1F;
                        break;

                    case 8:
                        yop.sustainLevel = (data >> 4) == 0xF ? 0x3E0 : (data >> 4) * 0x20;
                        yop.rates[YM_ENV_RELEASE] = ((data & 0xF) << 1) | 1;
                        break;

                    case 9:
                        yop.ssgEnabled   = (data & 8) != 0 ? 1 : 0;
                        yop.ssgAttack    = (data & 4) != 0 && yop.ssgEnabled ? 1 : 0;
                        yop.ssgAlternate = (data & 2) != 0 && yop.ssgEnabled ? 1 : 0;
                        yop.ssgHold      = (data & 1) != 0 && yop.ssgEnabled ? 1 : 0;
                        break;
                }
            } else {
                YmChannel& ch = channels[channelIndex];
                switch (address / 4) {
                    case 0xA0 / 4: {
                        uint16_t freq = data | (cachedUpperFrequencyBits << 8);
                        if (channelIndex == 2) {
                            ch3Frequencies[3] = freq;
                            if (ch3PerOperatorFrequenciesEnabled != 0) {
                                operators[11].fNumberAndBlock = freq;
                                operators[11].keyCode = freq >> 9;
                                recalculatePhaseStep(11);
                                break;
                            }
                        }
                        for (int o = 0; o < 4; o++) {
                            operators[baseOp + o].fNumberAndBlock = freq;
                            operators[baseOp + o].keyCode = freq >> 9;
                            recalculatePhaseStep(baseOp + o);
                        }
                        break;
                    }

                    case 0xA4 / 4:
                        cachedUpperFrequencyBits = data & 0x3F;
                        break;

                    case 0xA8 / 4:
                        if (port == 0) {
                            const uint8_t opMap[3] = {2, 0, 1};
                            uint8_t op = opMap[slot];
                            uint16_t freq = data | (cachedUpperFrequencyBitsFm3Multi << 8);

                            ch3Frequencies[op] = freq;
                            if (ch3PerOperatorFrequenciesEnabled != 0) {
                                int targetOpIdx = 8 + op;
                                operators[targetOpIdx].fNumberAndBlock = freq;
                                operators[targetOpIdx].keyCode = freq >> 9;
                                recalculatePhaseStep(targetOpIdx);
                            }
                        }
                        break;

                    case 0xAC / 4:
                        cachedUpperFrequencyBitsFm3Multi = data & 0x3F;
                        break;

                    case 0xB0 / 4:
                        ch.feedbackDivisor = 9 - ((data >> 3) & 7);
                        ch.algorithm = data & 7;
                        break;

                    case 0xB4 / 4:
                        ch.panLeft  = (data & 0x80) != 0 ? 1 : 0;
                        ch.panRight = (data & 0x40) != 0 ? 1 : 0;
                        ch.amplitudeModulationShift = 7 >> ((data >> 4) & 3);
                        ch.phaseModulationSensitivity = data & 7;

                        for (int o = 0; o < 4; o++) {
                            recalculatePhaseStep(baseOp + o);
                        }
                        break;
                }
            }
        }
    }
}

uint8_t GenesisYm2612::update(int cycles) {
    if (busyFlagCounter > 0) {
        busyFlagCounter -= (busyFlagCounter > (uint16_t)cycles) ? cycles : busyFlagCounter;
        if (busyFlagCounter == 0) {
            status &= ~0x80; // Release hardware busy flag
        }
    }

    timerCycleAccumulator += cycles;

    while (timerCycleAccumulator >= 144) {
        timerCycleAccumulator -= 144;

        if (timerAEnabled != 0) {
            if (--timerACounter == 0) {
                status |= 1; // Assert Timer A overflow flag
                timerACounter = timerAValue;

                if (ch3CsmModeEnabled != 0) {
                    for (int op = 0; op < 4; op++) {
                        setKeyOn(8 + op, true);
                        setKeyOn(8 + op, false);
                    }
                }
            }
        }

        timerBAccumulator++;
        if (timerBAccumulator >= 16) { 
            timerBAccumulator = 0;

            if (timerBEnabled != 0) {
                if (--timerBCounter == 0) {
                    status |= 2; // Assert Timer B overflow flag
                    timerBCounter = timerBValue;
                }
            }
        }
    }

    return status;
}

void GenesisYm2612::updateEnvelope(int opIdx) {
    YmOperator& op = operators[opIdx];

    if (op.ssgEnabled != 0 && op.attenuation >= 0x200) {
        if (op.ssgAlternate != 0) {
            op.ssgInvert = op.ssgHold != 0 ? 1 : (op.ssgInvert == 0 ? 1 : 0);
        } else if (op.ssgHold == 0) {
            op.position = 0;
        }

        if (op.ssgHold == 0) {
            op.envelopeMode = YM_ENV_ATTACK;
            op.position = 0;
        }
    }

    if (--op.countdown == 0) {
        op.countdown = 3; 

        uint16_t rate = op.rates[op.envelopeMode];
        if (rate > 0) {
            uint16_t stepRate = rate * 2 + (op.keyCode >> op.keyScale);
            bool cycleBit = (op.cycleCounter++ & ((1 << (11 - (stepRate / 4))) - 1)) == 0;

            if (cycleBit) {
                bool isAttack = op.envelopeMode == YM_ENV_ATTACK;
                
                if (isAttack) {
                    if (op.attenuation == 0) {
                        op.envelopeMode = YM_ENV_DECAY;
                    } else {
                        op.attenuation += (~op.attenuation) >> 4;
                    }
                } else {
                    uint16_t limit = op.ssgEnabled != 0 ? 0x200 : 0x3F0;
                    if (op.attenuation < limit) {
                        op.attenuation += 1;
                    } else if (!(op.keyOn != 0 && op.ssgHold != 0 && op.ssgAlternate != op.ssgAttack)) {
                        op.envelopeMode = YM_ENV_RELEASE;
                        op.attenuation = 0x3FF; 
                    }
                }
            }
        }
    }
}

int16_t GenesisYm2612::processOperator(int opIdx, int16_t phaseModulation) {
    YmOperator& op = operators[opIdx];
    op.position += op.step;
    uint16_t phase = (op.position >> 10) & 0x3FF;

    updateEnvelope(opIdx);

    uint16_t amVal = op.amplitudeModulationOn != 0 ? (lfo.amplitudeModulation >> channels[opIdx / 4].amplitudeModulationShift) : 0;
    
    uint16_t attenuation = op.attenuation;
    if (op.keyOn != 0 && op.ssgEnabled != 0 && op.ssgInvert != op.ssgAttack) {
        attenuation = (0x200 - attenuation) & 0x3FF;
    }

    uint16_t totalAttenuation = attenuation + amVal + op.totalLevel;
    if (totalAttenuation > 0x3FF) {
        totalAttenuation = 0x3FF;
    }

    uint16_t modulatedPhase = (phase + (phaseModulation >> 1)) & 0x3FF;
    bool isNegative = (modulatedPhase & 0x200) != 0;
    bool isMirrored = (modulatedPhase & 0x100) != 0;
    uint16_t quarterPhase = (modulatedPhase & 0xFF) ^ (isMirrored ? 0xFF : 0);

    uint32_t phaseAsAttenuation = sineTable[quarterPhase] + (totalAttenuation << 2);

    uint32_t whole = phaseAsAttenuation >> 8;
    uint32_t fraction = phaseAsAttenuation & 0xFF;
    int16_t sampleAbsolute = (powerTable[fraction] << 2) >> whole;

    return isNegative ? -sampleAbsolute : sampleAbsolute;
}

void GenesisYm2612::outputSamples(int16_t* sampleBuffer, int totalFrames) {
    int ptr = 0;

    for (int frame = 0; frame < totalFrames; ++frame) {
        
        if (lfo.advance()) {
            for (int opIdx = 0; opIdx < 24; opIdx++) {
                recalculatePhaseStep(opIdx);
            }
        }

        int32_t rawVal = (dacSample ^ 0x100) & 0x1FF;
        int16_t dacSampleValue = (rawVal & 0x100) != 0 ? rawVal - 512 : rawVal;

        int32_t lt = 0;
        int32_t rt = 0;

        for (int ch = 0; ch < 6; ++ch) {
            int baseOp = ch * 4;
            YmChannel& channel = channels[ch];
            uint16_t algorithm = channel.algorithm;

            int16_t feedbackModulation = 0;
            uint8_t divisor = channel.feedbackDivisor;
            if (divisor != 9) {
                feedbackModulation = (channel.prevSample0 + channel.prevSample1) >> divisor;
                int shift = 32 - (15 - divisor);
                feedbackModulation = (feedbackModulation << shift) >> shift; 
            }

            int16_t op1 = processOperator(baseOp + 0, feedbackModulation);
            int16_t op2 = processOperator(baseOp + 1, algorithm == 0 ? op1 : 0);
            int16_t op3 = processOperator(baseOp + 2, (algorithm == 0 ? op2 : algorithm == 1 ? (op1 + op2) : 0));
            
            int16_t op4Modulation = op3;
            if (algorithm == 2) op4Modulation = op1 + op3;
            else if (algorithm == 3) op4Modulation = op2 + op3;

            int16_t op4 = processOperator(baseOp + 3, op4Modulation);

            channel.prevSample1 = channel.prevSample0;
            channel.prevSample0 = op1;

            int32_t outSample = 0;
            switch (algorithm) {
                case 0: case 1: case 2: case 3:
                    outSample = op4 >> 5; 
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

            bool isDac = (ch == 5 && dacEnabled != 0) || dacTest != 0;
            bool channelDisabled = isDac ? dacChannelDisabled != 0 : fmChannelsDisabled[ch] != 0;

            int32_t finalSample = isDac ? dacSampleValue : outSample;

            if (channelDisabled) {
                finalSample = 0;
            }

            int32_t value = finalSample;
            if (value > 0x1FE0) {
                value = 0x1FE0; 
            } else if (value < -0x1FF0) {
                value = -0x1FF0; 
            } else {
                value &= 0x3FE0; 
                if (value & 0x2000) {
                    value |= 0xC000; 
                }
            }

            if (ladderEffectDisabled == 0) {
                if (value >= 0) {
                    value += 0x70; 
                } else {
                    value -= 0x70; 
                }
            }

            channel.output = value;

            if (channel.panLeft != 0)  lt += channel.output;
            if (channel.panRight != 0) rt += channel.output;
        }

        if (lt > 32767) lt = 32767;
        else if (lt < -32768) lt = -32768;
        if (rt > 32767) rt = 32767;
        else if (rt < -32768) rt = -32768;

        sampleBuffer[ptr] = lt;
        sampleBuffer[ptr + 1] = rt;

        ptr += 2;
    }
}