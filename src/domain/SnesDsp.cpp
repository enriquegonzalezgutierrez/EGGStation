/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SnesDsp.cpp
 * 
 * Domain Layer: Super Nintendo (SNES) Sony DSP Audio Synthesizer
 * 
 * Role:
 * Implements ADSR envelope progression, BRR block decoding, Gaussian 
 * interpolation, and 8-channel stereo mixing.
 */

#include "SnesDsp.h"
#include <string.h>
#include <algorithm>

// Pre-calculated divisions and multipliers
const float SnesDsp::INV_32768 = 1.0f / 32768.0f;

const uint16_t SnesDsp::rates[32] = {
    0, 2048, 1536, 1280, 1024, 768, 640, 512,
    384, 320, 256, 192, 160, 128, 96, 80,
    64, 48, 40, 32, 24, 20, 16, 12,
    10, 8, 6, 5, 4, 3, 2, 1
};

// Sony DSP Gaussian interpolation lookup table
const int16_t SnesDsp::gaussVals[512] = {
    0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000,
    0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x002, 0x002, 0x002, 0x002, 0x002,
    0x002, 0x002, 0x003, 0x003, 0x003, 0x003, 0x003, 0x004, 0x004, 0x004, 0x004, 0x004, 0x005, 0x005, 0x005, 0x005,
    0x006, 0x006, 0x006, 0x006, 0x007, 0x007, 0x007, 0x008, 0x008, 0x008, 0x009, 0x009, 0x009, 0x00A, 0x00A, 0x00A,
    0x00B, 0x00B, 0x00B, 0x00C, 0x00C, 0x00D, 0x00D, 0x00E, 0x00E, 0x00F, 0x00F, 0x00F, 0x010, 0x010, 0x011, 0x011,
    0x012, 0x013, 0x013, 0x014, 0x014, 0x015, 0x015, 0x016, 0x017, 0x017, 0x018, 0x018, 0x019, 0x01A, 0x01B, 0x01B,
    0x01C, 0x01D, 0x01D, 0x01E, 0x01F, 0x020, 0x020, 0x021, 0x022, 0x023, 0x024, 0x024, 0x025, 0x026, 0x027, 0x028,
    0x029, 0x02A, 0x02B, 0x02C, 0x02D, 0x02E, 0x02F, 0x030, 0x031, 0x032, 0x033, 0x034, 0x035, 0x036, 0x037, 0x038,
    0x03A, 0x03B, 0x03C, 0x03D, 0x03E, 0x040, 0x041, 0x042, 0x043, 0x045, 0x046, 0x047, 0x049, 0x04A, 0x04C, 0x04D,
    0x04E, 0x050, 0x051, 0x053, 0x054, 0x056, 0x057, 0x059, 0x05A, 0x05C, 0x05E, 0x05F, 0x061, 0x063, 0x064, 0x066,
    0x068, 0x06A, 0x06B, 0x06D, 0x06F, 0x071, 0x073, 0x075, 0x076, 0x078, 0x07A, 0x07C, 0x07E, 0x080, 0x082, 0x084,
    0x086, 0x089, 0x08B, 0x08D, 0x08F, 0x091, 0x093, 0x096, 0x098, 0x09A, 0x09C, 0x09F, 0x0A1, 0x0A3, 0x0A6, 0x0A8,
    0x0AB, 0x0AD, 0x0AF, 0x0B2, 0x0B4, 0x0B7, 0x0BA, 0x0BC, 0x0BF, 0x0C1, 0x0C4, 0x0C7, 0x0C9, 0x0CC, 0x0CF, 0x0D2,
    0x0D4, 0x0D7, 0x0DA, 0x0DD, 0x0E0, 0x0E3, 0x0E6, 0x0E9, 0x0EC, 0x0EF, 0x0F2, 0x0F5, 0x0F8, 0x0FB, 0x0FE, 0x101,
    0x104, 0x107, 0x10B, 0x10E, 0x111, 0x114, 0x118, 0x11B, 0x11E, 0x122, 0x125, 0x129, 0x12C, 0x130, 0x133, 0x137,
    0x13A, 0x13E, 0x141, 0x145, 0x148, 0x14C, 0x150, 0x153, 0x157, 0x15B, 0x15F, 0x162, 0x166, 0x16A, 0x16E, 0x172,
    0x176, 0x17A, 0x17D, 0x181, 0x185, 0x189, 0x18D, 0x191, 0x195, 0x19A, 0x19E, 0x1A2, 0x1A6, 0x1AA, 0x1AE, 0x1B2,
    0x1B7, 0x1BB, 0x1BF, 0x1C3, 0x1C8, 0x1CC, 0x1D0, 0x1D5, 0x1D9, 0x1DD, 0x1E2, 0x1E6, 0x1EB, 0x1EF, 0x1F3, 0x1F8,
    0x1FC, 0x201, 0x205, 0x20A, 0x20F, 0x213, 0x218, 0x21C, 0x221, 0x226, 0x22A, 0x22F, 0x233, 0x238, 0x23D, 0x241,
    0x246, 0x24B, 0x250, 0x254, 0x259, 0x25E, 0x263, 0x267, 0x26C, 0x271, 0x276, 0x27B, 0x280, 0x284, 0x289, 0x28E,
    0x293, 0x298, 0x29D, 0x2A2, 0x2A6, 0x2AB, 0x2B0, 0x2B5, 0x2BA, 0x2BF, 0x2C4, 0x2C9, 0x2CE, 0x2D3, 0x2D8, 0x2DC,
    0x2E1, 0x2E6, 0x2EB, 0x2F0, 0x2F5, 0x2FA, 0x2FF, 0x304, 0x309, 0x30E, 0x313, 0x318, 0x31D, 0x322, 0x326, 0x32B,
    0x330, 0x335, 0x33A, 0x33F, 0x344, 0x349, 0x34E, 0x353, 0x357, 0x35C, 0x361, 0x366, 0x36B, 0x370, 0x374, 0x379,
    0x37E, 0x383, 0x388, 0x38C, 0x391, 0x396, 0x39B, 0x39F, 0x3A4, 0x3A9, 0x3AD, 0x3B2, 0x3B7, 0x3BB, 0x3C0, 0x3C5,
    0x3C9, 0x3CE, 0x3D2, 0x3D7, 0x3DC, 0x3E0, 0x3E5, 0x3E9, 0x3ED, 0x3F2, 0x3F6, 0x3FB, 0x3FF, 0x403, 0x408, 0x40C,
    0x410, 0x415, 0x419, 0x41D, 0x421, 0x425, 0x42A, 0x42E, 0x432, 0x436, 0x43A, 0x43E, 0x442, 0x446, 0x44A, 0x44E,
    0x452, 0x455, 0x459, 0x45D, 0x461, 0x465, 0x468, 0x46C, 0x470, 0x473, 0x477, 0x47A, 0x47E, 0x481, 0x485, 0x488,
    0x48C, 0x48F, 0x492, 0x496, 0x499, 0x49C, 0x49F, 0x4A2, 0x4A6, 0x4A9, 0x4AC, 0x4AF, 0x4B2, 0x4B5, 0x4B7, 0x4BA,
    0x4BD, 0x4C0, 0x4C3, 0x4C5, 0x4C8, 0x4CB, 0x4CD, 0x4D0, 0x4D2, 0x4D5, 0x4D7, 0x4D9, 0x4DC, 0x4DE, 0x4E0, 0x4E3,
    0x4E5, 0x4E7, 0x4E9, 0x4EB, 0x4ED, 0x4EF, 0x4F1, 0x4F3, 0x4F5, 0x4F6, 0x4F8, 0x4FA, 0x4FB, 0x4FD, 0x4FF, 0x500,
    0x502, 0x503, 0x504, 0x506, 0x507, 0x508, 0x50A, 0x50B, 0x50C, 0x50D, 0x50E, 0x50F, 0x510, 0x511, 0x511, 0x512,
    0x513, 0x514, 0x514, 0x515, 0x516, 0x516, 0x517, 0x517, 0x517, 0x518, 0x518, 0x518, 0x518, 0x518, 0x519, 0x519,
};

SnesDsp::SnesDsp() : sampleOffset(0), apuRam(nullptr) {
    initialize();
}

void SnesDsp::initialize() {
    memset(ram, 0, sizeof(ram));
    memset(samplesL, 0, sizeof(samplesL));
    memset(samplesR, 0, sizeof(samplesR));
    sampleOffset = 0;

    memset(decodeBuffer, 0, sizeof(decodeBuffer));
    memset(rateNums, 0, sizeof(rateNums));

    for (int i = 0; i < 8; i++) {
        rateNums[i * 5 + 3] = 1; // Default release rate multiplier
    }

    memset(pitch, 0, sizeof(pitch));
    memset(counter, 0, sizeof(counter));
    memset(pitchMod, 0, sizeof(pitchMod));

    memset(srcn, 0, sizeof(srcn));
    memset(decodeOffset, 0, sizeof(decodeOffset));
    memset(prevFlags, 0, sizeof(prevFlags));
    memset(old, 0, sizeof(old));
    memset(older, 0, sizeof(older));

    memset(enableNoise, 0, sizeof(enableNoise));
    noiseSample = -0x4000;
    noiseRate = 0;
    noiseCounter = 0;

    memset(rateCounter, 0, sizeof(rateCounter));
    memset(adsrState, 3, sizeof(adsrState)); // Start in release state
    memset(sustainLevel, 0, sizeof(sustainLevel));
    memset(useGain, 0, sizeof(useGain));
    memset(gainMode, 0, sizeof(gainMode));
    memset(directGain, 0, sizeof(directGain));
    memset(gainValue, 0, sizeof(gainValue));

    memset(gain, 0, sizeof(gain));
    memset(channelVolumeL, 0, sizeof(channelVolumeL));
    memset(channelVolumeR, 0, sizeof(channelVolumeR));

    volumeL = 0;
    volumeR = 0;
    mute = true;

    resetFlag = true;
    memset(noteOff, 1, sizeof(noteOff)); // Note off active initially
    memset(sampleOut, 0, sizeof(sampleOut));
    dirPage = 0;
}

void SnesDsp::setApuRamPointer(uint8_t* ramPtr) {
    apuRam = ramPtr;
}

uint8_t SnesDsp::read(uint8_t address) {
    return ram[address & 0x7F];
}

void SnesDsp::write(uint8_t address, uint8_t value) {
    address &= 0x7F; // Safe hardware-level address masking
    uint8_t channel = (address & 0x70) >> 4;
    int ch5 = channel * 5;

    switch (address) {
        case 0x00: case 0x10: case 0x20: case 0x30: case 0x40: case 0x50: case 0x60: case 0x70:
            channelVolumeL[channel] = (value > 0x7F) ? value - 0x100 : value;
            break;

        case 0x01: case 0x11: case 0x21: case 0x31: case 0x41: case 0x51: case 0x61: case 0x71:
            channelVolumeR[channel] = (value > 0x7F) ? value - 0x100 : value;
            break;

        case 0x02: case 0x12: case 0x22: case 0x32: case 0x42: case 0x52: case 0x62: case 0x72:
            pitch[channel] = (pitch[channel] & 0x3F00) | value;
            break;

        case 0x03: case 0x13: case 0x23: case 0x33: case 0x43: case 0x53: case 0x63: case 0x73:
            pitch[channel] = (pitch[channel] & 0xFF) | ((value << 8) & 0x3F00);
            break;

        case 0x04: case 0x14: case 0x24: case 0x34: case 0x44: case 0x54: case 0x64: case 0x74:
            srcn[channel] = value;
            break;

        case 0x05: case 0x15: case 0x25: case 0x35: case 0x45: case 0x55: case 0x65: case 0x75:
            rateNums[ch5 + 0] = rates[(value & 0x0F) * 2 + 1];
            rateNums[ch5 + 1] = rates[((value & 0x70) >> 4) * 2 + 16];
            useGain[channel] = (value & 0x80) == 0;
            break;

        case 0x06: case 0x16: case 0x26: case 0x36: case 0x46: case 0x56: case 0x66: case 0x76:
            rateNums[ch5 + 2] = rates[value & 0x1F];
            sustainLevel[channel] = (((value & 0xE0) >> 5) + 1) * 0x100;
            break;

        case 0x07: case 0x17: case 0x27: case 0x37: case 0x47: case 0x57: case 0x67: case 0x77:
            if (value & 0x80) {
                directGain[channel] = false;
                gainMode[channel] = (value & 0x60) >> 5;
                rateNums[ch5 + 4] = rates[value & 0x1F];
            } else {
                directGain[channel] = true;
                gainValue[channel] = (value & 0x7F) * 16;
            }
            break;

        case 0x0C:
            volumeL = (value > 0x7F) ? value - 0x100 : value;
            break;

        case 0x1C:
            volumeR = (value > 0x7F) ? value - 0x100 : value;
            break;

        case 0x4C: { // KON - Key On (CORRECTED from 0x3C to hardware-accurate 0x4C)
            for (int i = 0; i < 8; i++) {
                if (value & (1 << i)) {
                    prevFlags[i] = 0;
                    uint16_t sampleAdr = (dirPage << 8) + (srcn[i] * 4);
                    if (apuRam) {
                        uint16_t startAdr = apuRam[sampleAdr & 0xFFFF];
                        startAdr |= apuRam[(sampleAdr + 1) & 0xFFFF] << 8;
                        decodeOffset[i] = startAdr;
                    }
                    gain[i] = 0;
                    if (useGain[i]) {
                        adsrState[i] = 4;
                    } else {
                        adsrState[i] = 0;
                    }
                    memset(&decodeBuffer[i * 19], 0, 19 * sizeof(int16_t));
                }
            }
            break;
        }

        case 0x5C: { // KOF - Key Off
            for (int i = 0; i < 8; i++) {
                noteOff[i] = (value & (1 << i)) > 0;
            }
            break;
        }

        case 0x6C: // FLG - Control Flags
            resetFlag = (value & 0x80) > 0;
            mute = (value & 0x40) > 0;
            noiseRate = rates[value & 0x1F];
            break;

        case 0x7C: // ENDX
            ram[0x7C] = 0;
            value = 0;
            break;

        case 0x2D: { // PMON - Pitch Modulation
            for (int i = 1; i < 8; i++) {
                pitchMod[i] = (value & (1 << i)) > 0;
            }
            break;
        }

        case 0x3D: { // NON - Noise Enable
            for (int i = 0; i < 8; i++) {
                enableNoise[i] = (value & (1 << i)) > 0;
            }
            break;
        }

        case 0x5D: // DIR - Directory Page Table offset
            dirPage = value;
            break;

        case 0x7D:
            break;
    }

    ram[address & 0x7F] = value;
}

void SnesDsp::cycle() {
    int32_t totalL = 0;
    int32_t totalR = 0;

    for (int i = 0; i < 8; i++) {
        cycleChannel(i);
        totalL += (sampleOut[i] * channelVolumeL[i]) >> 6;
        totalR += (sampleOut[i] * channelVolumeR[i]) >> 6;

        totalL = totalL < -0x8000 ? -0x8000 : (totalL > 0x7FFF ? 0x7FFF : totalL);
        totalR = totalR < -0x8000 ? -0x8000 : (totalR > 0x7FFF ? 0x7FFF : totalR);
    }

    totalL = (totalL * volumeL) >> 7;
    totalR = (totalR * volumeR) >> 7;
    totalL = totalL < -0x8000 ? -0x8000 : (totalL > 0x7FFF ? 0x7FFF : totalL);
    totalR = totalR < -0x8000 ? -0x8000 : (totalR > 0x7FFF ? 0x7FFF : totalR);

    if (mute) {
        totalL = 0;
        totalR = 0;
    }

    handleNoise();

    samplesL[sampleOffset] = (float)totalL * INV_32768;
    samplesR[sampleOffset] = (float)totalR * INV_32768;
    sampleOffset++;

    if (sampleOffset > 533) {
        sampleOffset = 533;
    }
}

void SnesDsp::handleNoise() {
    if (noiseRate != 0) {
        noiseCounter++;
    }
    if (noiseRate != 0 && noiseCounter >= noiseRate) {
        noiseCounter = 0;
        uint16_t bit0 = noiseSample & 1;
        uint16_t bit1 = (noiseSample >> 1) & 1;
        noiseSample = ((noiseSample >> 1) & 0x3FFF) | ((bit0 ^ bit1) << 14);
        noiseSample = noiseSample > 0x3FFF ? noiseSample - 0x8000 : noiseSample;
    }
}

void SnesDsp::cycleChannel(int ch) {
    int16_t currentPitch = pitch[ch];
    if (pitchMod[ch] && ch > 0) {
        int32_t factor = (sampleOut[ch - 1] >> 4) + 0x400;
        currentPitch = (currentPitch * factor) >> 10;
        currentPitch = currentPitch > 0x3FFF ? 0x3FFF : currentPitch;
    }

    counter[ch] += currentPitch;
    if (counter[ch] > 0xFFFF) {
        decodeBrr(ch);
    }
    counter[ch] &= 0xFFFF;

    int16_t sample;
    if (enableNoise[ch]) {
        sample = noiseSample;
    } else {
        sample = interpolate(ch, counter[ch] >> 12, (counter[ch] >> 4) & 0xFF);
    }

    if (noteOff[ch] || resetFlag) {
        adsrState[ch] = 3; // Force Release State
        if (resetFlag) {
            gain[ch] = 0;
        }
    }

    const int ch5 = ch * 5;
    const int ch16 = ch << 4;

    uint16_t rate = rateNums[ch5 + adsrState[ch]];
    if (rate != 0) {
        rateCounter[ch]++;
    }
    if (rate != 0 && rateCounter[ch] >= rate) {
        rateCounter[ch] = 0;
        if (!directGain[ch] || !useGain[ch] || adsrState[ch] == 3) {
            switch (adsrState[ch]) {
                case 0: // Attack
                    gain[ch] += (rate == 1) ? 1024 : 32;
                    if (gain[ch] >= 0x7E0) {
                        adsrState[ch] = 1;
                    }
                    if (gain[ch] > 0x7FF) {
                        gain[ch] = 0x7FF;
                    }
                    break;

                case 1: // Decay
                    gain[ch] -= ((gain[ch] - 1) >> 8) + 1;
                    if (gain[ch] < sustainLevel[ch]) {
                        adsrState[ch] = 2;
                    }
                    break;

                case 2: // Sustain
                    gain[ch] -= ((gain[ch] - 1) >> 8) + 1;
                    break;

                case 3: // Release
                    gain[ch] -= 8;
                    if (gain[ch] < 0) {
                        gain[ch] = 0;
                    }
                    break;

                case 4: // Custom Gain
                    switch (gainMode[ch]) {
                        case 0:
                            gain[ch] -= 32;
                            if (gain[ch] < 0) gain[ch] = 0;
                            break;
                        case 1:
                            gain[ch] -= ((gain[ch] - 1) >> 8) + 1;
                            break;
                        case 2:
                            gain[ch] += 32;
                            if (gain[ch] > 0x7FF) gain[ch] = 0x7FF;
                            break;
                        case 3:
                            gain[ch] += (gain[ch] < 0x600) ? 32 : 8;
                            if (gain[ch] > 0x7FF) gain[ch] = 0x7FF;
                            break;
                    }
                    break;
            }
        }
    }

    if (directGain[ch] && useGain[ch] && adsrState[ch] != 3) {
        gain[ch] = gainValue[ch];
    }

    int32_t gainedVal = (sample * gain[ch]) >> 11;

    ram[ch16 | 8] = gain[ch] >> 4;
    ram[ch16 | 9] = gainedVal >> 7;
    sampleOut[ch] = gainedVal;
}

void SnesDsp::decodeBrr(int ch) {
    if (!apuRam) return;

    const int ch19 = ch * 19;
    decodeBuffer[ch19] = decodeBuffer[ch19 + 16];
    decodeBuffer[ch19 + 1] = decodeBuffer[ch19 + 17];
    decodeBuffer[ch19 + 2] = decodeBuffer[ch19 + 18];

    if (prevFlags[ch] == 1 || prevFlags[ch] == 3) {
        uint16_t sampleAdr = (dirPage << 8) + (srcn[ch] * 4);
        uint16_t loopAdr = apuRam[(sampleAdr + 2) & 0xFFFF];
        loopAdr |= apuRam[(sampleAdr + 3) & 0xFFFF] << 8;
        decodeOffset[ch] = loopAdr;

        if (prevFlags[ch] == 1) {
            gain[ch] = 0;
            adsrState[ch] = 3;
        }
        ram[0x7C] |= (1 << ch);
    }

    uint8_t header = apuRam[decodeOffset[ch]++];
    decodeOffset[ch] &= 0xFFFF;
    
    uint8_t shift = header >> 4;
    uint8_t filter = (header & 0x0C) >> 2;
    prevFlags[ch] = header & 0x03;
    uint8_t byte = 0;

    for (int i = 0; i < 16; i++) {
        // Core Alignment Fix: declare 's' as standard 32-bit signed integer (int32_t)
        // to prevent 16-bit shift overflows on high ranges and fully match JS bitwise engine.
        int32_t s = byte & 0x0F;
        if ((i & 1) == 0) {
            byte = apuRam[decodeOffset[ch]++];
            decodeOffset[ch] &= 0xFFFF;
            s = byte >> 4;
        }
        s = s > 7 ? s - 16 : s;
        if (shift <= 0x0C) {
            s = (s << shift) >> 1;
        } else {
            s = s < 0 ? -2048 : 2048;
        }
        
        // Load history predictors explicitly as standard 32-bit values
        int32_t oldVal = old[ch];
        int32_t olderVal = older[ch];

        switch (filter) {
            case 1:
                s = s + oldVal * 1 + ((-oldVal * 1) >> 4);
                break;
            case 2:
                s = s + oldVal * 2 + ((-oldVal * 3) >> 5) - olderVal + ((olderVal * 1) >> 4);
                break;
            case 3:
                s = s + oldVal * 2 + ((-oldVal * 13) >> 6) - olderVal + ((olderVal * 3) >> 4);
                break;
        }

        s = s > 0x7FFF ? 0x7FFF : s;
        s = s < -0x8000 ? -0x8000 : s;
        s &= 0x7FFF;
        s = s > 0x3FFF ? s - 0x8000 : s;

        older[ch] = old[ch];
        old[ch] = s;
        decodeBuffer[ch19 + i + 3] = s;
    }
}

int16_t SnesDsp::interpolate(int ch, int sampleNum, int offset) {
    const int chOffset = ch * 19 + sampleNum;
    const int16_t news = decodeBuffer[chOffset + 3];
    const int16_t oldVal = decodeBuffer[chOffset + 2];
    const int16_t olderVal = decodeBuffer[chOffset + 1];
    const int16_t oldest = decodeBuffer[chOffset];

    // Explicit 32-bit casts on coefficients to avoid precision truncation before shift
    int32_t out = ((int32_t)gaussVals[0xFF - offset] * (int32_t)oldest) >> 10;
    out += ((int32_t)gaussVals[0x1FF - offset] * (int32_t)olderVal) >> 10;
    out += ((int32_t)gaussVals[0x100 + offset] * (int32_t)oldVal) >> 10;
    out &= 0xFFFF;
    out = out > 0x7FFF ? out - 0x10000 : out;
    out += ((int32_t)gaussVals[offset] * (int32_t)news) >> 10;
    out = out > 0x7FFF ? 0x7FFF : (out < -0x8000 ? -0x8000 : out);

    return out >> 1;
}