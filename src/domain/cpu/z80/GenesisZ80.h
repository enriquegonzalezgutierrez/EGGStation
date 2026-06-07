/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/GenesisZ80.h
 * 
 * Domain Layer: Sega Genesis Custom Z80 Sound Processor Core
 * 
 * Role:
 * Extends the unified, shared Z80 CPU core to implement hardware-level 
 * index-register prefix-skipping behaviors required by Genesis sound drivers 
 * (GEMS, SMPS, etc.), keeping the Master System emulator core entirely untouched.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Isolates Sega Genesis sound driver CPU 
 *    execution anomalies from the standard, clean SMS Z80 execution pipeline.
 * 2. Open/Closed Principle (OCP): Dynamically extends standard Z80 instruction decoding 
 *    using class inheritance, avoiding modifying verified domain structures in-place.
 * 3. Liskov Substitution Principle (LSP): Fully substitutes ZilogZ80 in Genesis contexts 
 *    without violating execution contracts or breaking timings.
 */

#ifndef GENESIS_Z80_H
#define GENESIS_Z80_H

#include "ZilogZ80.h"

class GenesisZ80 : public ZilogZ80 {
public:
    /**
     * @param bus Pointer to the abstract Secondary sound MMU interface.
     */
    GenesisZ80(IZ80Bus* bus);
    virtual ~GenesisZ80() = default;

    /**
     * Performs a single fetch-decode-execute instruction cycle.
     * Overridden to implement hardware-accurate double-prefix index skipping 
     * required by Sega sound drivers.
     * 
     * @return The exact number of T-states (cycles) consumed.
     */
    int executeOne() override;
};

#endif // GENESIS_Z80_H