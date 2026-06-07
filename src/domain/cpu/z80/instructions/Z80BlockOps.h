/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80BlockOps.h
 * 
 * Domain Layer: Z80 Block Operations Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for block memory 
 * transfers and block searches (LDI, LDIR, LDD, LDDR, CPI, CPIR, CPD, CPDR).
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for block memory 
 *    transfers, block copies, and block search instruction routines.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_BLOCK_OPS_H
#define Z80_BLOCK_OPS_H

#include "../ZilogZ80.h"

class Z80BlockOps {
public:
    /**
     * Registers all Block Operations opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);

    // --- Static Block Algorithms (SRP) ---
    static void executeLdi(ZilogZ80& cpu);
    static void executeLdd(ZilogZ80& cpu);
    static void executeLdir(ZilogZ80& cpu);
    static void executeLddr(ZilogZ80& cpu);
    static void executeCpi(ZilogZ80& cpu);
    static void executeCpd(ZilogZ80& cpu);
    static void executeCpir(ZilogZ80& cpu);
    static void executeCpdr(ZilogZ80& cpu);
};

#endif // Z80_BLOCK_OPS_H