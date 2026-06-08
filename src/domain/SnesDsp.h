/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SnesDsp.h
 * 
 * Domain Layer: Super Nintendo (SNES) Sony DSP Audio Synthesizer
 * 
 * Role:
 * Defines the registers, ADSR envelope generators, noise generators, 
 * BRR decoding pipelines, and Gaussian interpolation functions for 
 * synthesizing 8-channel stereo audio on the SNES console.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on the
 *   digital processing, mixing, and generation of active sound channels.
 */

#ifndef SNES_DSP_H
#define SNES_DSP_H

#include <stdint.h>
#include <stdbool.h>

class SnesDsp {
private:
    uint8_t ram[0x80];                 // Internal DSP Registers ($00 to $7F)
    
    // Float output sample buffers (Zero-Copy layout)
    float samplesL[534];
    float samplesR[534];
    int sampleOffset;

    int16_t decodeBuffer[19 * 8];      // BRR block decoding history per channel
    int16_t rateNums[5 * 8];           // Pre-calculated ADSR phase decay intervals

    int16_t pitch[8];
    uint32_t counter[8];               // Frequency step accumulator
    bool pitchMod[8];

    uint8_t srcn[8];                   // Sample Source Directory index
    uint16_t decodeOffset[8];          // Current ROM offset inside APU RAM
    uint8_t prevFlags[8];              // BRR block loop/end control flags
    int16_t old[8];                    // Historical sample -1 for BRR filter prediction
    int16_t older[8];                  // Historical sample -2 for BRR filter prediction

    bool enableNoise[8];
    int16_t noiseSample;               // Current linear feedback shift register state
    uint16_t noiseRate;
    uint16_t noiseCounter;

    uint16_t rateCounter[8];
    uint8_t adsrState[8];              // Current ADSR envelope state (Attack, Decay, etc.)
    uint16_t sustainLevel[8];
    bool useGain[8];
    uint8_t gainMode[8];
    bool directGain[8];
    uint16_t gainValue[8];

    int16_t gain[8];                   // Current amplitude volume multiplier

    int16_t channelVolumeL[8];
    int16_t channelVolumeR[8];
    int16_t volumeL;
    int16_t volumeR;
    bool mute;

    bool resetFlag;
    bool noteOff[8];

    int16_t sampleOut[8];              // Last synthesized sample value
    uint8_t dirPage;                   // Directory Table page index ($XX00)

    uint8_t* apuRam;                   // Fast pointer to APU 64KB RAM for zero-overhead reads

    // --- Internal Synthesizer Engine (SRP) ---
    void handleNoise();
    void cycleChannel(int ch);
    void decodeBrr(int ch);
    int16_t interpolate(int ch, int sampleNum, int offset);

    static const float INV_32768;
    static const uint16_t rates[32];
    static const int16_t gaussVals[512];

public:
    SnesDsp();
    ~SnesDsp() = default;

    /**
     * Cold-boots registers, cleaning oscillators and buffers.
     */
    void initialize();

    /**
     * Binds the APU 64KB memory space directly.
     * @param ramPtr Pointer to the active APU RAM buffer on the WASM heap.
     */
    void setApuRamPointer(uint8_t* ramPtr);

    /**
     * Synthesizes a single stereo audio sample slice, processing all 8 channels.
     */
    void cycle();

    // --- System Bus Read/Write Hooks ---
    uint8_t read(uint8_t address);
    void write(uint8_t address, uint8_t value);

    // --- Audio Buffer Accessors ---
    float* getSamplesL() { return samplesL; }
    float* getSamplesR() { return samplesR; }
    int getSampleOffset() const { return sampleOffset; }
    void clearSampleOffset() { sampleOffset = 0; }

    // --- State Serialization Getters (Saves/Loads states) ---
    uint8_t* getRamPointer() { return ram; }
    uint8_t* getAdsrStatePointer() { return adsrState; }
    int16_t* getGainPointer() { return gain; }
    uint32_t* getCounterPointer() { return counter; }
};

#endif // SNES_DSP_H