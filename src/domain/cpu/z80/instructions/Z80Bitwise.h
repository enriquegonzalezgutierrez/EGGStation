/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80Bitwise.h
 * 
 * Domain Layer: Z80 CPU Bitwise Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for individual bit 
 * manipulation (BIT, SET, RES). 
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for single-bit 
 *    test, set, and clear operation definitions. It isolates dynamic table mapping 
 *    logic completely from standard execution loops.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_BITWISE_H
#define Z80_BITWISE_H

#include "../ZilogZ80.h"

class Z80Bitwise {
public:
    /**
     * Registers all Bitwise opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);
};

#endif // Z80_BITWISE_H