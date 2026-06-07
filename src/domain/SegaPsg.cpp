/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SegaPsg.cpp
 * 
 * Domain Layer: Sega SN76489-compatible Programmable Sound Generator (PSG)
 * 
 * Role:
 * Implementation of the SN76489 PSG domain logic. Manages three tone channels 
 * (square wave oscillators) and one pseudo-random noise generator channel.
 */

#include "SegaPsg.h"

SegaPsg::SegaPsg() {
    initialize();
}

void SegaPsg::initialize() {
    for (int i = 0; i < 4; i++) {
        volregister[i] = 0xF; // Attenuate to silence on init
        toneregister[i] = 0;
        wavePos[i] = 0.0f;
        cachedStepSize[i] = 0.0f;
    }

    chan2belatched = 0;
    what2latch = 0;

    noiseFreqMode = 0;
    noiseType = SEGA_PSG_NOISE_TYPE_PERIODIC;
    noiseShiftRegister = 0x8000;
    noiseOut = 0;
    noisePhase = 0.0f;
    noiseStepSize = 0.0f;
    sampleRate = 44100.0f;
}

void SegaPsg::setSampleRate(float rate) {
    sampleRate = rate > 0.0f ? rate : 44100.0f;
    for (int i = 0; i < 3; i++) {
        recalculateVoiceStep(i);
    }
    recalculateNoiseStep();
}

void SegaPsg::recalculateVoiceStep(int voiceIndex) {
    int16_t toneVal = toneregister[voiceIndex];
    if (toneVal == 0) {
        cachedStepSize[voiceIndex] = 0.0f;
    } else {
        float freq = 3579545.0f / (32.0f * toneVal);
        cachedStepSize[voiceIndex] = (freq / sampleRate) * PSG_WAVE_LEN;
    }
}

void SegaPsg::recalculateNoiseStep() {
    if (noiseFreqMode < 3) {
        float divisors[3] = {512.0f, 1024.0f, 2048.0f};
        float freq = 3579545.0f / divisors[noiseFreqMode];
        noiseStepSize = (freq / sampleRate);
    } else {
        int16_t toneVal = toneregister[2];
        if (toneVal == 0) {
            noiseStepSize = 0.0f;
        } else {
            float freq = 3579545.0f / (32.0f * toneVal);
            noiseStepSize = (freq / sampleRate);
        }
    }
}

void SegaPsg::writeByte(uint8_t command) {
    if (command & 0x80) {
        chan2belatched = (command >> 5) & 3;
        what2latch = (command & 0x10) != 0 ? 1 : 0;
        int ch = chan2belatched;

        if (what2latch == 1) {
            volregister[ch] = command & 0xF;
        } else {
            if (ch == 3) {
                noiseFreqMode = command & 3;
                noiseType = (command & 4) != 0 ? SEGA_PSG_NOISE_TYPE_WHITE : SEGA_PSG_NOISE_TYPE_PERIODIC;
                noiseShiftRegister = 0x8000;
                recalculateNoiseStep();
            } else {
                toneregister[ch] = (toneregister[ch] & 0xFFF0) | (command & 0x0F);
                recalculateVoiceStep(ch);
                if (ch == 2) recalculateNoiseStep();
            }
        }
    } else {
        int ch = chan2belatched;
        if (what2latch == 1) {
            volregister[ch] = command & 0xF;
        } else if (ch != 3) {
            toneregister[ch] = (toneregister[ch] & 0x000F) | ((command & 0x3F) << 4);
            recalculateVoiceStep(ch);
            if (ch == 2) recalculateNoiseStep();
        }
    }
}

float SegaPsg::getSample() {
    float finalSample = 0.0f;

    // 1. Synthesize Tone Channels (Square wave oscillators)
    for (int i = 0; i < 3; i++) {
        int16_t vol = volregister[i];
        if (vol != 0xF && toneregister[i] != 0) {
            float curSamp = (wavePos[i] < (PSG_WAVE_LEN >> 1)) ? 1.0f : -1.0f;
            float volScale = (15.0f - vol) / 15.0f;
            finalSample += curSamp * volScale * 0.20f;

            wavePos[i] += cachedStepSize[i];
            if (wavePos[i] >= PSG_WAVE_LEN) {
                wavePos[i] = (float)((int)wavePos[i] % PSG_WAVE_LEN);
            }
        }
    }

    // 2. Synthesize Noise Channel (Linear Feedback Shift Register)
    int16_t volNoise = volregister[3];
    if (volNoise != 0xF) {
        noisePhase += noiseStepSize;
        while (noisePhase >= 1.0f) {
            noisePhase -= 1.0f;
            noiseOut = noiseShiftRegister & 1;
            noiseShiftRegister = (noiseShiftRegister >> 1) | (noiseShiftRegister << 15);

            if (noiseType == SEGA_PSG_NOISE_TYPE_WHITE && (noiseShiftRegister & 0x40)) {
                noiseShiftRegister ^= 0x8000;
            }
        }
        float curSamp = noiseOut ? 1.0f : -1.0f;
        float volScale = (15.0f - volNoise) / 15.0f;
        finalSample += curSamp * volScale * 0.20f;
    }

    return finalSample;
}

void SegaPsg::restoreState(int ch, int16_t vol, int16_t tone, float wave_pos, int chan_latch, int what_latch) {
    volregister[ch] = vol;
    toneregister[ch] = tone;
    wavePos[ch] = wave_pos;
    chan2belatched = chan_latch;
    what2latch = what_latch;

    // Recalculate internal step clocks immediately following a state restore
    recalculateVoiceStep(ch);
    if (ch == 2) {
        recalculateNoiseStep();
    }
}