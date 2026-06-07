/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/ZilogZ80.cpp
 * 
 * Domain Layer: Zilog Z80 CPU Core Orchestrator
 * 
 * Role:
 * Implementation of the core fetch-decode-execute loop.
 * Evaluates hardware interrupts, reads from the abstract memory bus, 
 * decodes opcode prefixes, and executes the mapped instructions.
 */

#include "ZilogZ80.h"
#include <iostream>
#include <cstring>

// Hypothetical inclusions for the isolated instruction modules (to be implemented next)
#include "instructions/Z80DataTransfer.h"
#include "instructions/Z80Arithmetic.h"
#include "instructions/Z80Bitwise.h"
#include "instructions/Z80ShiftRotate.h"
#include "instructions/Z80ProgramFlow.h"
#include "instructions/Z80BlockOps.h"
#include "instructions/Z80SystemIO.h"

ZilogZ80::ZilogZ80(IZ80Bus* bus) : mmu(bus) {
    clockRate = 3579545; // Standard SMS NTSC Master Clock rating (3.58 MHz)
    totCycles = 0;
    additionalCycles = 0;

    maskableInterruptsEnabled = false;
    maskableInterruptWaiting = false;
    NMIWaiting = false;
    interruptMode = 0;
    isHalted = false;
    m_bAfterEI = false;

    // Zero-out all instruction tables to avoid dangling pointers
    std::memset(&opcodeTables, 0, sizeof(Z80OpcodeRegistry));

    // Delegate the population of the instruction tables to specialized modules
    bindInstructionModules();
}

void ZilogZ80::bindInstructionModules() {
    // SOLID (OCP): Modules dynamically inject their logic into the CPU's dispatch tables.
    Z80DataTransfer::registerInstructions(*this, opcodeTables);
    Z80Arithmetic::registerInstructions(*this, opcodeTables);
    Z80Bitwise::registerInstructions(*this, opcodeTables);
    Z80ShiftRotate::registerInstructions(*this, opcodeTables);
    Z80ProgramFlow::registerInstructions(*this, opcodeTables);
    Z80BlockOps::registerInstructions(*this, opcodeTables);
    Z80SystemIO::registerInstructions(*this, opcodeTables);
}

void ZilogZ80::raiseMaskableInterrupt() {
    if (maskableInterruptsEnabled) {
        maskableInterruptWaiting = true;
    }
}

void ZilogZ80::raiseNMI() {
    NMIWaiting = true;
}

void ZilogZ80::jumpRel(uint8_t signedOffset) {
    // Interpret the 8-bit offset as a signed 8-bit integer (-128 to +127)
    int8_t offset = static_cast<int8_t>(signedOffset);
    registers.pc = (registers.pc + offset) & 0xFFFF;
}

uint16_t ZilogZ80::popWord() {
    uint16_t word = mmu->readAddr16bit(registers.sp);
    registers.sp = (registers.sp + 2) & 0xFFFF;
    return word;
}

void ZilogZ80::pushWord(uint16_t word) {
    registers.sp = (registers.sp - 2) & 0xFFFF;
    mmu->writeAddr16bit(registers.sp, word);
}

// ========================================================================
// CORE FETCH-DECODE-EXECUTE PROCESSOR LOOP
// ========================================================================

int ZilogZ80::executeOne() {
    int elapsedCycles = 0;
    additionalCycles = 0;

    // 1. Process Pending Non-Maskable Interrupts (NMI)
    if (NMIWaiting) {
        pushWord(isHalted ? registers.pc + 1 : registers.pc);
        registers.pc = 0x0066; // Standard NMI vector jump destination

        registers.iff1 = 0;
        isHalted = false;
        NMIWaiting = false;

        elapsedCycles += 11;
        totCycles += elapsedCycles;
        return elapsedCycles;
    }
    
    // 2. Process Pending Maskable Interrupts (INT)
    if (registers.iff1 != 0 && maskableInterruptWaiting && !m_bAfterEI) {
        pushWord(isHalted ? registers.pc + 1 : registers.pc);
        registers.pc = 0x0038; // Mode 1 Interrupt vector jump destination (Standard SMS behavior)

        registers.iff1 = 0;
        registers.iff2 = 0;

        isHalted = false;
        maskableInterruptWaiting = false;
        maskableInterruptsEnabled = false;

        elapsedCycles += 13;
        totCycles += elapsedCycles;
        return elapsedCycles;
    }
    
    // 3. Process Halted State Idle Loops
    if (isHalted) {
        elapsedCycles = 4; // Flat idle execution cycles consumption 
        totCycles += elapsedCycles;
        return elapsedCycles;
    }

    m_bAfterEI = false;

    // Fetch primary opcode byte
    uint8_t b1 = mmu->readAddr(registers.pc);

    // 4. Decode Prefix Trees
    if (b1 == 0xCB) {
        uint8_t b2 = mmu->readAddr(registers.pc + 1);
        Z80Instruction& instr = opcodeTables.bitwise[b2];
        if (instr.executor) {
            instr.executor(*this);
            elapsedCycles = instr.baseCycles;
        } else {
            // Unhandled CB opcode fallback (treated as NOP-like skip)
            incPc(2);
            elapsedCycles = 4;
        }
    }
    else if (b1 == 0xED) {
        uint8_t b2 = mmu->readAddr(registers.pc + 1);
        Z80Instruction& instr = opcodeTables.extended[b2];
        if (instr.executor) {
            instr.executor(*this);
            elapsedCycles = instr.baseCycles;
        } else {
            incPc(2);
            elapsedCycles = 4;
        }
    }
    else if (b1 == 0xDD) {
        uint8_t b2 = mmu->readAddr(registers.pc + 1);
        if (b2 == 0xCB) {
            uint8_t b4 = mmu->readAddr(registers.pc + 3);
            Z80Instruction& instr = opcodeTables.bitwiseIX[b4];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                incPc(4);
                elapsedCycles = 4;
            }
        } else {
            Z80Instruction& instr = opcodeTables.indexedIX[b2];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                incPc(2);
                elapsedCycles = 4;
            }
        }
    }
    else if (b1 == 0xFD) {
        uint8_t b2 = mmu->readAddr(registers.pc + 1);
        if (b2 == 0xCB) {
            uint8_t b4 = mmu->readAddr(registers.pc + 3);
            Z80Instruction& instr = opcodeTables.bitwiseIY[b4];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                incPc(4);
                elapsedCycles = 4;
            }
        } else {
            Z80Instruction& instr = opcodeTables.indexedIY[b2];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                incPc(2);
                elapsedCycles = 4;
            }
        }
    }
    // 5. Decode Unprefixed Core Opcode
    else {
        Z80Instruction& instr = opcodeTables.standard[b1];
        if (instr.executor) {
            instr.executor(*this);
            elapsedCycles = instr.baseCycles;
        } else {
            // Log missing instructions safely in C++ context
            std::cout << "[ZilogZ80] Unhandled standard opcode: 0x" 
                      << std::hex << (int)b1 << " at PC: 0x" << registers.pc << std::dec << std::endl;
            incPc(1);
            elapsedCycles = 4;
        }
    }

    elapsedCycles += additionalCycles;
    totCycles += elapsedCycles;
    
    return elapsedCycles;
}