/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80ProgramFlow.cpp
 * 
 * Domain Layer: Z80 CPU Program Flow Instructions Implementation
 */

#include "Z80ProgramFlow.h"

void Z80ProgramFlow::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // ========================================================================
    // 1. STANDARD UNPREFIXED PROGRAM FLOW OPERATIONS
    // ========================================================================

    // --- Relative Jumps & Loops ---
    registry.standard[0x10] = { [](ZilogZ80& c) {  
        c.registers.b = (c.registers.b - 1) & 0xFF;
        uint8_t jq = c.mmu->readAddr(c.registers.pc + 1);
        c.incPc(2);
        if (c.registers.b != 0) {
            c.jumpRel(jq); 
            c.additionalCycles = 5; // Extra T-state penalty when branching occurs
        } 
    }, 8 };

    registry.standard[0x18] = { [](ZilogZ80& c) { uint8_t jq = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); c.jumpRel(jq); }, 12 };

    registry.standard[0x20] = { [](ZilogZ80& c) { 
        uint8_t jq = c.mmu->readAddr(c.registers.pc + 1); 
        c.incPc(2); 
        if (!(c.registers.f & Z80Flags::FLAG_Z)) {
            c.additionalCycles = 5;
            c.jumpRel(jq); 
        }
    }, 7 };

    registry.standard[0x28] = { [](ZilogZ80& c) { 
        uint8_t jq = c.mmu->readAddr(c.registers.pc + 1); 
        c.incPc(2); 
        if (c.registers.f & Z80Flags::FLAG_Z) {
            c.additionalCycles = 5;
            c.jumpRel(jq); 
        }
    }, 7 };

    registry.standard[0x30] = { [](ZilogZ80& c) { 
        uint8_t jq = c.mmu->readAddr(c.registers.pc + 1); 
        c.incPc(2); 
        if (!(c.registers.f & Z80Flags::FLAG_C)) {
            c.additionalCycles = 5;
            c.jumpRel(jq); 
        }
    }, 7 };

    registry.standard[0x38] = { [](ZilogZ80& c) { 
        uint8_t jq = c.mmu->readAddr(c.registers.pc + 1); 
        c.incPc(2); 
        if (c.registers.f & Z80Flags::FLAG_C) {
            c.additionalCycles = 5;
            c.jumpRel(jq); 
        }
    }, 7 };

    // --- Returns ---
    registry.standard[0xC0] = { [](ZilogZ80& c) {
        if (!(c.registers.f & Z80Flags::FLAG_Z)) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xC8] = { [](ZilogZ80& c) {
        if (c.registers.f & Z80Flags::FLAG_Z) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xC9] = { [](ZilogZ80& c) {
        c.registers.pc = c.popWord();
    }, 10 };

    registry.standard[0xD0] = { [](ZilogZ80& c) {
        if (!(c.registers.f & Z80Flags::FLAG_C)) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xD8] = { [](ZilogZ80& c) {
        if (c.registers.f & Z80Flags::FLAG_C) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xE0] = { [](ZilogZ80& c) {
        if (!(c.registers.f & Z80Flags::FLAG_PV)) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xE8] = { [](ZilogZ80& c) {
        if (c.registers.f & Z80Flags::FLAG_PV) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xF0] = { [](ZilogZ80& c) {
        if (!(c.registers.f & Z80Flags::FLAG_S)) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    registry.standard[0xF8] = { [](ZilogZ80& c) {
        if (c.registers.f & Z80Flags::FLAG_S) {
            c.registers.pc = c.popWord();
            c.additionalCycles = 6;
        } else {
            c.incPc(1);
        }
    }, 5 };

    // --- Absolute Jumps ---
    registry.standard[0xC2] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (!(c.registers.f & Z80Flags::FLAG_Z)) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xC3] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        c.registers.pc = (m2 << 8) | m1;
    }, 10 };

    registry.standard[0xCA] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if ((c.registers.f & Z80Flags::FLAG_Z) != 0) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xD2] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (!(c.registers.f & Z80Flags::FLAG_C)) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xDA] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (c.registers.f & Z80Flags::FLAG_C) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xE2] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (!(c.registers.f & Z80Flags::FLAG_PV)) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xEA] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (c.registers.f & Z80Flags::FLAG_PV) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xF2] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if ((c.registers.f & Z80Flags::FLAG_S) == 0) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xFA] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        if (c.registers.f & Z80Flags::FLAG_S) {
            c.registers.pc = (m2 << 8) | m1;
        } else {
            c.incPc(3);
        }
    }, 10 };

    // --- Indirect Jumps ---
    registry.standard[0xE9] = { [](ZilogZ80& c) { c.registers.pc = c.registers.getHL(); }, 4 };

    // --- Call Subroutines ---
    registry.standard[0xC4] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (!(c.registers.f & Z80Flags::FLAG_Z)) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xCC] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (c.registers.f & Z80Flags::FLAG_Z) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xCD] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        c.pushWord(c.registers.pc + 3);
        c.registers.pc = newaddr;
    }, 17 };

    registry.standard[0xD4] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (!(c.registers.f & Z80Flags::FLAG_C)) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xDC] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (c.registers.f & Z80Flags::FLAG_C) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);                
        }
    }, 10 };

    registry.standard[0xE4] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (!(c.registers.f & Z80Flags::FLAG_PV)) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xEC] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (c.registers.f & Z80Flags::FLAG_PV) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xF4] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (!(c.registers.f & Z80Flags::FLAG_S)) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    registry.standard[0xFC] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2);
        uint16_t newaddr = m1 | (m2 << 8);
        if (c.registers.f & Z80Flags::FLAG_S) {
            c.pushWord(c.registers.pc + 3);
            c.registers.pc = newaddr;
            c.additionalCycles = 7;
        } else {
            c.incPc(3);
        }
    }, 10 };

    // --- Software Restarts (RST) ---
    registry.standard[0xC7] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x00; }, 11 };
    registry.standard[0xCF] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x08; }, 11 };
    registry.standard[0xD7] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x10; }, 11 };
    registry.standard[0xDF] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x18; }, 11 };
    registry.standard[0xE7] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x20; }, 11 };
    registry.standard[0xEF] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x28; }, 11 };
    registry.standard[0xF7] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x30; }, 11 };
    registry.standard[0xFF] = { [](ZilogZ80& c) { c.pushWord(c.registers.pc + 1); c.registers.pc = 0x38; }, 11 };


    // ========================================================================
    // 2. EXTENDED ED-PREFIXED INTERRUPT RETURNS (RETI / RETN)
    // ========================================================================

    registry.extended[0x45] = { [](ZilogZ80& c) {
        c.registers.pc = c.popWord();
        c.registers.iff1 = c.registers.iff2;
    }, 14 };

    registry.extended[0x4D] = { [](ZilogZ80& c) {
        c.registers.pc = c.popWord();
        c.registers.iff1 = c.registers.iff2;
    }, 14 };
}