/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80DataTransfer.h
 * 
 * Domain Layer: Z80 CPU Data Transfer Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for moving and copying 
 * data (LD, PUSH, POP, EX, EXX). 
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for 
 *    register loading, stack push/pop, and atomic exchange operations.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_DATA_TRANSFER_H
#define Z80_DATA_TRANSFER_H

#include "../ZilogZ80.h"

class Z80DataTransfer {
public:
    /**
     * Registers all Data Transfer opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);
};

#endif // Z80_DATA_TRANSFER_H