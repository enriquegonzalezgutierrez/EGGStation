/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/audio/GenesisYm2612.h
 * 
 * Domain Layer: Sega Genesis Yamaha YM2612 FM Synthesizer
 * 
 * Role:
 * Defines the domain model, operator states, LFO controllers, and mixing 
 * registers for the 6-channel Yamaha YM2612 FM Synthesizer.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Isolates the complex FM mathematical 
 *    operator synthesis, envelope scaling, and LFO modulations into dedicated, 
 *    specialized structs and classes.
 * 2. Interface Segregation Principle (ISP): Exposes only standard operational 
 *    audio register hooks to the master memory Bus.
 */

#ifndef GENESIS_YM2612_H
#define GENESIS_YM2612_H

#include <stdint.h>

// Envelope mode constants
enum YmEnvelopeMode {
    YM_ENV_ATTACK  = 0,
    YM_ENV_DECAY   = 1,
    YM_ENV_SUSTAIN = 2,
    YM_ENV_RELEASE = 3
};

// ========================================================================
// 1. LOW-FREQUENCY OSCILLATOR (LFO) MODEL
// ========================================================================
class YmLfo {
public:
    uint8_t frequency;
    uint8_t amplitudeModulation;
    uint8_t phaseModulation;
    uint16_t subCounter;
    uint8_t counter;
    bool enabled;

    YmLfo();
    void reset();
    bool setEnabled(bool isEnabled);
    bool advance();
};

// ========================================================================
// 2. FM OPERATOR DOMAIN STRUCT
// ========================================================================
struct YmOperator {
    uint32_t position;
    uint32_t step;
    uint16_t fNumberAndBlock;
    uint16_t keyCode;
    uint16_t detune;
    uint16_t multiplier;
    
    uint16_t countdown;
    uint16_t cycleCounter;
    uint16_t deltaIndex;
    uint16_t attenuation;
    uint16_t totalLevel;
    uint16_t sustainLevel;
    uint8_t keyScale;
    
    uint16_t rates[4]; // Envelopes attack, decay, sustain, release rates
    uint8_t envelopeMode;
    uint8_t keyOn;
    uint8_t amplitudeModulationOn;

    // SSG-EG Sub-states
    uint8_t ssgEnabled;
    uint8_t ssgAttack;
    uint8_t ssgAlternate;
    uint8_t ssgHold;
    uint8_t ssgInvert;
};

// ========================================================================
// 3. FM CHANNEL DOMAIN STRUCT
// ========================================================================
struct YmChannel {
    uint8_t feedbackDivisor;
    uint16_t algorithm;
    int16_t prevSample0;
    int16_t prevSample1;
    uint8_t amplitudeModulationShift;
    uint8_t phaseModulationSensitivity;

    uint8_t panLeft;
    uint8_t panRight;

    int16_t output; // 14-bit resolved channel output
};

// ========================================================================
// 4. MAIN YAMAHA YM2612 SYNTHESIZER COORDINATOR
// ========================================================================
class GenesisYm2612 {
private:
    // Core Domain Entities (6 channels, 4 operators per channel = 24 operators)
    YmChannel channels[6];
    YmOperator operators[24];
    YmLfo lfo;

    // System hardware registers
    uint8_t fmChannelsDisabled[6];
    uint8_t dacChannelDisabled;
    uint8_t ladderEffectDisabled;

    // Special Channel 3 Multi-Frequency Registers
    uint16_t ch3Frequencies[4];
    uint8_t ch3PerOperatorFrequenciesEnabled;
    uint8_t ch3CsmModeEnabled;

    // Global IO port and latch registers
    uint8_t port;
    uint8_t address;
    
    // 9-Bit Sign-Magnitude DAC Registers
    int16_t dacSample; 
    uint8_t dacEnabled;
    uint8_t dacTest;

    // Hardware Timer Registers
    uint16_t rawTimerAValue;
    uint16_t timerAValue;
    uint16_t timerACounter;
    uint8_t timerAEnabled;

    uint16_t timerBValue;
    uint16_t timerBCounter;
    uint8_t timerBEnabled;

    uint8_t cachedUpperFrequencyBits;
    uint8_t cachedUpperFrequencyBitsFm3Multi;
    
    uint8_t status;
    uint16_t busyFlagCounter;

    uint32_t timerCycleAccumulator; // Snychronous master clock cycles accumulator
    uint32_t timerBAccumulator;     // Sub-scaler ticks for Timer B

    // Shared physical logarithmic and sine wave lookup tables
    static const uint16_t sineTable[256];
    static const uint16_t powerTable[256];

    // Internal sound synthesis helpers
    void recalculatePhaseStep(int opIdx);
    void setKeyOn(int opIdx, bool keyOn);
    void updateEnvelope(int opIdx);
    int16_t processOperator(int opIdx, int16_t phaseModulation);

public:
    GenesisYm2612();
    ~GenesisYm2612() = default;

    /**
     * Resets the entire FM chip states to hardware cold-boot defaults.
     */
    void initialize();

    /**
     * Latch-registers the target active address on a port write.
     * @param port Selector of the channel group (0 for Ch 1-3, 1 for Ch 4-6).
     * @param address Selector of the targeted registers.
     */
    void writeAddress(uint8_t port, uint8_t address);

    /**
     * Writes data into the previously latched register.
     * @param data 8-bit parameter payload.
     */
    void writeData(uint8_t data);

    /**
     * Steps the physical internal hardware timers.
     * @param cycles Master CPU clock cycles elapsed since last step.
     * @return Current status of the Timer IRQ flags.
     */
    uint8_t update(int cycles);

    /**
     * Synthesizes and mixes FM audio channels into the system backbuffer.
     * Emulates 9-bit sign-magnitude truncation and direct ladder crossover distortion.
     * 
     * @param sampleBuffer Target signed 16-bit stereo output buffer.
     * @param totalFrames Total sound frames (samples pairs) to generate.
     */
    void outputSamples(int16_t* sampleBuffer, int totalFrames);
};

#endif // GENESIS_YM2612_H