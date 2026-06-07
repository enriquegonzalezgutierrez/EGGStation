/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80ProgramFlow.h
 * 
 * Domain Layer: Z80 Program Flow Instructions
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions that modify the Program Counter (PC),
 * controlling branching, loops, subroutine calls, software restarts, and interrupt returns.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for executing 
 *    jumps, relative branches, subroutine calls, and return operations safely.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_PROGRAM_FLOW_H
#define Z80_PROGRAM_FLOW_H

#include "../ZilogZ80.h"

class Z80ProgramFlow {
public:
    /**
     * Registers all Program Flow opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);
};

#endif // Z80_PROGRAM_FLOW_H