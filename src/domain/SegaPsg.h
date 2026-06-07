/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/SegaPsg.h
 * 
 * Domain Layer: Sega SN76489-compatible Programmable Sound Generator (PSG)
 * 
 * Role:
 * Pure C++ Domain Entity representing the SN76489 sound chip. It is completely 
 * decoupled from any platform-specific APIs, runtime engines, or compilers (like Emscripten).
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Isolates strictly Texas Instruments SN76489 
 *   oscillation calculations and noise shift register logic from audio mixing graphs.
 * - Open/Closed Principle (OCP): Open for extension (e.g. subclassing for system-specific PSG 
 *   variants) but closed for modification.
 * - Liskov Substitution Principle (LSP): Fully interchangeable. It serves as the domain-logic 
 *   foundation for any host audio loop implementation.
 * - Interface Segregation Principle (ISP): Exposes only target operational methods 
 *   (initialize, writeByte, setSampleRate, getSample) rather than direct register mappings.
 * - Dependency Inversion Principle (DIP): Independent of browser Web Audio API contexts.
 */

#ifndef SEGA_PSG_H
#define SEGA_PSG_H

#include <stdint.h>

#define SEGA_PSG_NOISE_TYPE_PERIODIC 0
#define SEGA_PSG_NOISE_TYPE_WHITE    1
#define PSG_WAVE_LEN 8192

class SegaPsg {
private:
    int16_t volregister[4]; 
    int16_t toneregister[4];       
    float wavePos[4];            
    float cachedStepSize[4];

    int chan2belatched; 
    int what2latch;     

    int noiseFreqMode;
    int noiseType;
    uint16_t noiseShiftRegister;
    int noiseOut;
    float noisePhase;
    float noiseStepSize;

    float sampleRate;

    void recalculateVoiceStep(int voiceIndex);
    void recalculateNoiseStep();

public:
    SegaPsg();
    ~SegaPsg() = default;

    void initialize();
    void setSampleRate(float rate);
    void writeByte(uint8_t command);
    float getSample();

    // Domain State Getters (For real-time emulator state serialization/rewinding)
    int16_t getVol(int ch) const { return volregister[ch]; }
    int16_t getTone(int ch) const { return toneregister[ch]; }
    float getWavePos(int ch) const { return wavePos[ch]; }
    int getChanLatch() const { return chan2belatched; }
    int getWhatLatch() const { return what2latch; }

    // Domain State Restorer (For restoring full hardware state during real-time rewinding)
    void restoreState(int ch, int16_t vol, int16_t tone, float wave_pos, int chan_latch, int what_latch);
};

#endif // SEGA_PSG_H