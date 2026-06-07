/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80ShiftRotate.cpp
 * 
 * Domain Layer: Z80 CPU Shift and Rotate Instructions Implementation
 */

#include "Z80ShiftRotate.h"

static inline uint16_t getDisplacement(ZilogZ80& cpu, uint16_t indexValue) {
    uint8_t d = cpu.mmu->readAddr(cpu.registers.pc + 2);
    int8_t incr = static_cast<int8_t>(d);
    return (indexValue + incr) & 0xFFFF;
}

// ========================================================================
// CORE SHIFT/ROTATE OPERATIONS (Specialized per register and operation)
// ========================================================================

template<int opType, int reg>
static void executeShiftRotate(ZilogZ80& c) {
    bool isHL = (reg == 6);
    uint8_t val = 0;

    if (isHL) {
        val = c.mmu->readAddr(c.registers.getHL());
    } else {
        if (reg == 0)      val = c.registers.b;
        else if (reg == 1) val = c.registers.c;
        else if (reg == 2) val = c.registers.d;
        else if (reg == 3) val = c.registers.e;
        else if (reg == 4) val = c.registers.h;
        else if (reg == 5) val = c.registers.l;
        else if (reg == 7) val = c.registers.a;
    }

    uint8_t res = 0;
    switch (opType) {
        case 0: res = c.alu.rlc_8bit(c.registers, val); break; // RLC
        case 1: res = c.alu.rrc_8bit(c.registers, val, false); break; // RRC
        case 2: res = c.alu.rl_8bit(c.registers, val, false); break;  // RL
        case 3: res = c.alu.rr_8bit(c.registers, val); break;  // RR
        case 4: res = c.alu.sla_8bit(c.registers, val); break; // SLA
        case 5: res = c.alu.sra_8bit(c.registers, val); break; // SRA
        case 6: res = c.alu.sll_8bit(c.registers, val); break; // SLL (Undocumented)
        case 7: res = c.alu.srl_8bit(c.registers, val); break; // SRL
    }

    if (isHL) {
        c.mmu->writeAddr(c.registers.getHL(), res);
    } else {
        // FIXED: Replaced second switch statement with clean if/else blocks
        // to prevent compiler warnings for unhandled static template specializations.
        if (reg == 0)      c.registers.b = res;
        else if (reg == 1) c.registers.c = res;
        else if (reg == 2) c.registers.d = res;
        else if (reg == 3) c.registers.e = res;
        else if (reg == 4) c.registers.h = res;
        else if (reg == 5) c.registers.l = res;
        else if (reg == 7) c.registers.a = res;
    }
    c.incPc(2);
}

// ========================================================================
// HIGH-PERFORMANCE STATIC INSTRUCTION BINDER (OCP & Legibility)
// ========================================================================

template<int opType, int reg>
static inline void bindInstruction(Z80OpcodeRegistry& registry) {
    constexpr uint8_t op = (opType * 8) + reg;
    registry.bitwise[op] = { &executeShiftRotate<opType, reg>, static_cast<uint8_t>(reg == 6 ? 15 : 8) };
}

// ========================================================================
// CORE REGISTRATION PIPELINE
// ========================================================================

void Z80ShiftRotate::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // --- 1. Accumulator-Specific Fast Rotates (Standard Opcode Map) ---
    registry.standard[0x07] = { [](ZilogZ80& c) { c.registers.a = c.alu.rlca_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };
    registry.standard[0x0F] = { [](ZilogZ80& c) { c.registers.a = c.alu.rrc_8bit(c.registers, c.registers.a, true); c.incPc(1); }, 4 };
    registry.standard[0x17] = { [](ZilogZ80& c) { c.registers.a = c.alu.rl_8bit(c.registers, c.registers.a, true); c.incPc(1); }, 4 };
    registry.standard[0x1F] = { [](ZilogZ80& c) { c.registers.a = c.alu.rra_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };

    // --- 2. Inlined Specialized Template Opcodes (CB Map 0x00 to 0x3F) ---
    
    // RLC (opType 0)
    bindInstruction<0, 0>(registry); bindInstruction<0, 1>(registry); bindInstruction<0, 2>(registry); bindInstruction<0, 3>(registry);
    bindInstruction<0, 4>(registry); bindInstruction<0, 5>(registry); bindInstruction<0, 6>(registry); bindInstruction<0, 7>(registry);

    // RRC (opType 1)
    bindInstruction<1, 0>(registry); bindInstruction<1, 1>(registry); bindInstruction<1, 2>(registry); bindInstruction<1, 3>(registry);
    bindInstruction<1, 4>(registry); bindInstruction<1, 5>(registry); bindInstruction<1, 6>(registry); bindInstruction<1, 7>(registry);

    // RL (opType 2)
    bindInstruction<2, 0>(registry); bindInstruction<2, 1>(registry); bindInstruction<2, 2>(registry); bindInstruction<2, 3>(registry);
    bindInstruction<2, 4>(registry); bindInstruction<2, 5>(registry); bindInstruction<2, 6>(registry); bindInstruction<2, 7>(registry);

    // RR (opType 3)
    bindInstruction<3, 0>(registry); bindInstruction<3, 1>(registry); bindInstruction<3, 2>(registry); bindInstruction<3, 3>(registry);
    bindInstruction<3, 4>(registry); bindInstruction<3, 5>(registry); bindInstruction<3, 6>(registry); bindInstruction<3, 7>(registry);

    // SLA (opType 4)
    bindInstruction<4, 0>(registry); bindInstruction<4, 1>(registry); bindInstruction<4, 2>(registry); bindInstruction<4, 3>(registry);
    bindInstruction<4, 4>(registry); bindInstruction<4, 5>(registry); bindInstruction<4, 6>(registry); bindInstruction<4, 7>(registry);

    // SRA (opType 5)
    bindInstruction<5, 0>(registry); bindInstruction<5, 1>(registry); bindInstruction<5, 2>(registry); bindInstruction<5, 3>(registry);
    bindInstruction<5, 4>(registry); bindInstruction<5, 5>(registry); bindInstruction<5, 6>(registry); bindInstruction<5, 7>(registry);

    // SLL (opType 6)
    bindInstruction<6, 0>(registry); bindInstruction<6, 1>(registry); bindInstruction<6, 2>(registry); bindInstruction<6, 3>(registry);
    bindInstruction<6, 4>(registry); bindInstruction<6, 5>(registry); bindInstruction<6, 6>(registry); bindInstruction<6, 7>(registry);

    // SRL (opType 7)
    bindInstruction<7, 0>(registry); bindInstruction<7, 1>(registry); bindInstruction<7, 2>(registry); bindInstruction<7, 3>(registry);
    bindInstruction<7, 4>(registry); bindInstruction<7, 5>(registry); bindInstruction<7, 6>(registry); bindInstruction<7, 7>(registry);


    // --- 3. BCD Extended Rotates (ED Map) ---
    registry.extended[0x67] = { [](ZilogZ80& c) { executeRrd(c); c.incPc(2); }, 18 };
    registry.extended[0x6F] = { [](ZilogZ80& c) { executeRld(c); c.incPc(2); }, 18 };

    // --- 4. Indexed Rotates (IX + d & IY + d) ---
    registry.indexedIX[0xE9] = { [](ZilogZ80& c) { c.registers.pc = c.registers.getIX(); }, 8 };
    registry.indexedIY[0xE9] = { [](ZilogZ80& c) { c.registers.pc = c.registers.getIY(); }, 8 };

    registry.bitwiseIX[0x06] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.rlc_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x0E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.rrc_8bit(c.registers, c.mmu->readAddr(adr), false)); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x16] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.rl_8bit(c.registers, c.mmu->readAddr(adr), false)); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x1E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.rr_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x26] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.sla_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x2E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.sra_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x36] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.sll_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIX[0x3E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIX()); c.mmu->writeAddr(adr, c.alu.srl_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };

    registry.bitwiseIY[0x06] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.rlc_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x0E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.rrc_8bit(c.registers, c.mmu->readAddr(adr), false)); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x16] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.rl_8bit(c.registers, c.mmu->readAddr(adr), false)); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x1E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.rr_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x26] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.sla_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x2E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.sra_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x36] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.sll_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
    registry.bitwiseIY[0x3E] = { [](ZilogZ80& c) { uint16_t adr = getDisplacement(c, c.registers.getIY()); c.mmu->writeAddr(adr, c.alu.srl_8bit(c.registers, c.mmu->readAddr(adr))); c.incPc(4); }, 23 };
}

// ========================================================================
// DECIMAL NIBBLE ROTATES IMPLEMENTATIONS
// ========================================================================

void Z80ShiftRotate::executeRld(ZilogZ80& cpu) {
    uint16_t address = cpu.registers.getHL();
    uint8_t byte = cpu.mmu->readAddr(address);

    uint8_t result = (cpu.registers.a & 0xF0) | ((byte >> 4) & 0x0F);
    cpu.mmu->writeAddr(address, ((byte << 4) & 0xF0) | (cpu.registers.a & 0x0F));
    cpu.registers.a = result;

    cpu.registers.f &= 0x01; // Preserve C flag

    if (cpu.alu.getParity(cpu.registers.a)) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (cpu.registers.a & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (cpu.registers.a & 0x20) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (cpu.registers.a == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (cpu.registers.a & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;
}

void Z80ShiftRotate::executeRrd(ZilogZ80& cpu) {
    uint16_t address = cpu.registers.getHL();
    uint8_t byte = cpu.mmu->readAddr(address);

    uint8_t nibble0 = (cpu.registers.a & 0x0F);
    uint8_t nibble1 = (byte & 0xF0) >> 4;
    uint8_t nibble2 = (byte & 0x0F);

    cpu.registers.a = (cpu.registers.a & 0xF0) | nibble2;
    byte = (nibble0 << 4) | nibble1;

    cpu.mmu->writeAddr(address, byte);

    cpu.registers.f &= 0x01; // Preserve C flag

    if (cpu.alu.getParity(cpu.registers.a)) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (cpu.registers.a & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (cpu.registers.a & 0x20) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (cpu.registers.a == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (cpu.registers.a & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;
}