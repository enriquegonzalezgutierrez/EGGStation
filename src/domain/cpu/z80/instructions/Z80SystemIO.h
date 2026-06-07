/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80SystemIO.h
 * 
 * Domain Layer: Z80 System and I/O Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for hardware input/output 
 * port operations and processor state control.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for definition 
 *    and routing of system state controls and hardware I/O port instruction subsets.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_SYSTEM_IO_H
#define Z80_SYSTEM_IO_H

#include "../ZilogZ80.h"

class Z80SystemIO {
public:
    /**
     * Registers all System and I/O opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);

    // --- Static Block I/O Algorithms (SRP) ---
    static void executeIni(ZilogZ80& cpu);
    static void executeInir(ZilogZ80& cpu);
    static void executeOuti(ZilogZ80& cpu);
    static void executeOtir(ZilogZ80& cpu);
    static void executeOutd(ZilogZ80& cpu);
    static void executeOtdr(ZilogZ80& cpu);
};

#endif // Z80_SYSTEM_IO_H