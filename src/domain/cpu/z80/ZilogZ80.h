/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/ZilogZ80.h
 * 
 * Domain Layer: Zilog Z80 CPU Core Orchestrator
 * 
 * Role:
 * Coordinates the CPU emulation loop, processes interrupts (INT/NMI), and executes 
 * instructions based on dynamic functional mapping.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Handles strictly the CPU execution loop, 
 *    clock states, and interrupt lines.
 * 2. Open/Closed Principle (OCP): Instruction mappings are stored in arrays of 
 *    function pointers. Instructions can be registered or overridden (for Genesis) 
 *    without modifying the core `executeOne()` logic.
 */

#ifndef ZILOG_Z80_H
#define ZILOG_Z80_H

#include <stdint.h>
#include "Z80Registers.h"
#include "Z80Alu.h"
#include "IZ80Bus.h"

class ZilogZ80; // Forward declaration

// High-performance struct for instruction dispatching
struct Z80Instruction {
    void (*executor)(ZilogZ80& cpu);
    uint8_t baseCycles;
};

// Container for the multiple prefix mapping tables
struct Z80OpcodeRegistry {
    Z80Instruction standard[256];
    Z80Instruction bitwise[256];      // CB prefix
    Z80Instruction extended[256];     // ED prefix
    Z80Instruction indexedIX[256];    // DD prefix
    Z80Instruction indexedIY[256];    // FD prefix
    Z80Instruction bitwiseIX[256];    // DDCB prefix
    Z80Instruction bitwiseIY[256];    // FDCB prefix
};

class ZilogZ80 {
public:
    // Core Domain State Objects (Public for high-speed access by instruction modules)
    Z80Registers registers;
    Z80Alu alu;
    IZ80Bus* mmu;

    // Execution state configuration
    uint32_t clockRate;
    uint32_t totCycles;
    uint8_t additionalCycles; // Dynamic penalty cycles (e.g. branch taken)

    // Hardware lines & interrupts
    bool maskableInterruptsEnabled;
    bool maskableInterruptWaiting;
    bool NMIWaiting;
    uint8_t interruptMode;
    bool isHalted;
    bool m_bAfterEI; // Prevents interrupts immediately following an EI instruction

    // The polymorphic mapping tables
    Z80OpcodeRegistry opcodeTables;

    /**
     * @param bus Pointer to the abstract Memory Management Unit interface.
     */
    ZilogZ80(IZ80Bus* bus);
    virtual ~ZilogZ80() = default;

    // --- Execution Core ---
    virtual int executeOne();

    // --- Hardware Interrupt Triggers ---
    void raiseMaskableInterrupt();
    void raiseNMI();

    // --- Program Counter & Stack Helpers ---
    inline void incPc(uint16_t offset) { 
        registers.pc = (registers.pc + offset) & 0xFFFF; 
    }
    
    void jumpRel(uint8_t signedOffset);
    uint16_t popWord();
    void pushWord(uint16_t word);

protected:
    // Helper to register all standard domain instruction groups
    void bindInstructionModules();
};

#endif // ZILOG_Z80_H