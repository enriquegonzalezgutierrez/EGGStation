/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/GenesisZ80.cpp
 * 
 * Domain Layer: Sega Genesis Custom Z80 Sound Processor Core
 */

#include "GenesisZ80.h"

GenesisZ80::GenesisZ80(IZ80Bus* bus) : ZilogZ80(bus) {}

int GenesisZ80::executeOne() {
    int elapsedCycles = 0;
    additionalCycles = 0;

    // 1. Process Pending Non-Maskable Interrupts (NMI)
    if (NMIWaiting) {
        pushWord(isHalted ? registers.pc + 1 : registers.pc);
        registers.pc = 0x0066; // Standard NMI vector

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
        registers.pc = 0x0038; // Mode 1 Interrupt vector

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
        elapsedCycles = 4; 
        totCycles += elapsedCycles;
        return elapsedCycles;
    }

    m_bAfterEI = false;

    // Fetch primary opcode byte
    uint8_t b1 = mmu->readAddr(registers.pc);

    // 4. Decode Prefix Trees (With standard Z80 silicon prefix-skipping fallbacks)
    if (b1 == 0xCB) {
        uint8_t b2 = mmu->readAddr(registers.pc + 1);
        Z80Instruction& instr = opcodeTables.bitwise[b2];
        if (instr.executor) {
            instr.executor(*this);
            elapsedCycles = instr.baseCycles;
        } else {
            // Unhandled CB instruction: skip the prefix (PC + 1, 4 cycles)
            incPc(1);
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
            incPc(1);
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
                incPc(1);
                elapsedCycles = 4;
            }
        } else {
            Z80Instruction& instr = opcodeTables.indexedIX[b2];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                // Double prefix skipping: skip 1st prefix (PC + 1, 4 cycles)
                incPc(1);
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
                incPc(1);
                elapsedCycles = 4;
            }
        } else {
            Z80Instruction& instr = opcodeTables.indexedIY[b2];
            if (instr.executor) {
                instr.executor(*this);
                elapsedCycles = instr.baseCycles;
            } else {
                incPc(1);
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
            incPc(1);
            elapsedCycles = 4;
        }
    }

    elapsedCycles += additionalCycles;
    totCycles += elapsedCycles;
    
    return elapsedCycles;
}