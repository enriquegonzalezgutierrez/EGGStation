/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80Arithmetic.h
 * 
 * Domain Layer: Z80 Arithmetic and Logical Instruction Registry
 * 
 * Role:
 * Encapsulates all Z80 CPU instructions designed for arithmetic and 
 * logical operations on 8-bit and 16-bit operands. It delegates heavy mathematical 
 * calculations and flag updates directly to the Z80Alu instance.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for the 
 *    registration and routing of the arithmetic/logical instruction subset.
 * 2. Open/Closed Principle (OCP): Populates the CPU's opcode dictionary 
 *    without modifying the execution core.
 */

#ifndef Z80_ARITHMETIC_H
#define Z80_ARITHMETIC_H

#include "../ZilogZ80.h"

class Z80Arithmetic {
public:
    /**
     * Registers all Arithmetic and Logical opcodes onto the provided CPU opcode registry.
     * @param cpu The CPU Orchestrator instance.
     * @param registry The categorized opcode mapping structures.
     */
    static void registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry);
};

#endif // Z80_ARITHMETIC_H