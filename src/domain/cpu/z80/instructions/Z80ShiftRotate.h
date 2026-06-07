/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80ShiftRotate.h
 * 
 * Domain Layer: Z80 CPU Shift and Rotate Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for bit shifts and 
 * rotations (SLA, SRL, SRA, SLL, RL, RR, RLC, RRC, and BCD-related RLD/RRD). 
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for defining 
 *    logical/arithmetic shifts, bit rotations, and BCD decimal rotates.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_SHIFT_ROTATE_H
#define Z80_SHIFT_ROTATE_H

#include "../ZilogZ80.h"

class Z80ShiftRotate {
public:
    /**
     * Registers all Shift and Rotate opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);

    // --- BCD Nibble Rotates (Static Helpers) ---
    static void executeRld(ZilogZ80& cpu);
    static void executeRrd(ZilogZ80& cpu);
};

#endif // Z80_SHIFT_ROTATE_H