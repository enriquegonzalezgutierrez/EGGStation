/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80Bitwise.cpp
 * 
 * Domain Layer: Z80 CPU Bitwise Instructions Implementation
 */

#include "Z80Bitwise.h"

static inline uint16_t getDisplacement(ZilogZ80& cpu, uint16_t indexValue) {
    uint8_t d = cpu.mmu->readAddr(cpu.registers.pc + 2);
    int8_t incr = static_cast<int8_t>(d);
    return (indexValue + incr) & 0xFFFF;
}

// ========================================================================
// CORE BITWISE OPERATIONS TEMPLATES (Compile-time resolution)
// ========================================================================

template<int bit, int reg, bool isHL>
static void executeBit(ZilogZ80& c) {
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
    c.alu.bit_8bit(c.registers, val, 1 << bit);
    c.incPc(2);
}

template<int bit, int reg, bool isHL>
static void executeRes(ZilogZ80& c) {
    uint8_t notBitMask = ~(1 << bit) & 0xFF;
    if (isHL) {
        uint8_t val = c.mmu->readAddr(c.registers.getHL());
        val &= notBitMask;
        c.mmu->writeAddr(c.registers.getHL(), val);
    } else {
        if (reg == 0)      c.registers.b &= notBitMask;
        else if (reg == 1) c.registers.c &= notBitMask;
        else if (reg == 2) c.registers.d &= notBitMask;
        else if (reg == 3) c.registers.e &= notBitMask;
        else if (reg == 4) c.registers.h &= notBitMask;
        else if (reg == 5) c.registers.l &= notBitMask;
        else if (reg == 7) c.registers.a &= notBitMask;
    }
    c.incPc(2);
}

template<int bit, int reg, bool isHL>
static void executeSet(ZilogZ80& c) {
    uint8_t bitMask = 1 << bit;
    if (isHL) {
        uint8_t val = c.mmu->readAddr(c.registers.getHL());
        val |= bitMask;
        c.mmu->writeAddr(c.registers.getHL(), val);
    } else {
        if (reg == 0)      c.registers.b |= bitMask;
        else if (reg == 1) c.registers.c |= bitMask;
        else if (reg == 2) c.registers.d |= bitMask;
        else if (reg == 3) c.registers.e |= bitMask;
        else if (reg == 4) c.registers.h |= bitMask;
        else if (reg == 5) c.registers.l |= bitMask;
        else if (reg == 7) c.registers.a |= bitMask;
    }
    c.incPc(2);
}

// ========================================================================
// INDEXED BITWISE OPERATIONS TEMPLATES (DDCB / FDCB)
// ========================================================================

template<int bit>
static void executeBitIX(ZilogZ80& c) {
    uint8_t val = c.mmu->readAddr(getDisplacement(c, c.registers.getIX()));
    c.alu.bit_8bit(c.registers, val, 1 << bit);
    c.incPc(4);
}

template<int bit>
static void executeBitIY(ZilogZ80& c) {
    uint8_t val = c.mmu->readAddr(getDisplacement(c, c.registers.getIY()));
    c.alu.bit_8bit(c.registers, val, 1 << bit);
    c.incPc(4);
}

template<int bit>
static void executeResIX(ZilogZ80& c) {
    uint16_t addr = getDisplacement(c, c.registers.getIX());
    uint8_t val = c.mmu->readAddr(addr);
    val &= ~(1 << bit) & 0xFF;
    c.mmu->writeAddr(addr, val);
    c.incPc(4);
}

template<int bit>
static void executeResIY(ZilogZ80& c) {
    uint16_t addr = getDisplacement(c, c.registers.getIY());
    uint8_t val = c.mmu->readAddr(addr);
    val &= ~(1 << bit) & 0xFF;
    c.mmu->writeAddr(addr, val);
    c.incPc(4);
}

template<int bit>
static void executeSetIX(ZilogZ80& c) {
    uint16_t addr = getDisplacement(c, c.registers.getIX());
    uint8_t val = c.mmu->readAddr(addr);
    val |= 1 << bit;
    c.mmu->writeAddr(addr, val);
    c.incPc(4);
}

template<int bit>
static void executeSetIY(ZilogZ80& c) {
    uint16_t addr = getDisplacement(c, c.registers.getIY());
    uint8_t val = c.mmu->readAddr(addr);
    val |= 1 << bit;
    c.mmu->writeAddr(addr, val);
    c.incPc(4);
}

// ========================================================================
// HIGH-PERFORMANCE STATIC INSTRUCTION BINDERS
// ========================================================================

template<int bit, int reg>
static inline void bindBitwise(Z80OpcodeRegistry& registry) {
    constexpr bool isHL = (reg == 6);
    constexpr uint8_t opBit = 0x40 + (bit * 8) + reg;
    constexpr uint8_t opRes = 0x80 + (bit * 8) + reg;
    constexpr uint8_t opSet = 0xC0 + (bit * 8) + reg;

    registry.bitwise[opBit] = { &executeBit<bit, reg, isHL>, static_cast<uint8_t>(isHL ? 12 : 8) };
    registry.bitwise[opRes] = { &executeRes<bit, reg, isHL>, static_cast<uint8_t>(isHL ? 15 : 8) };
    registry.bitwise[opSet] = { &executeSet<bit, reg, isHL>, static_cast<uint8_t>(isHL ? 15 : 8) };
}

template<int bit>
static inline void bindIndexedBitwise(Z80OpcodeRegistry& registry) {
    constexpr uint8_t opBit = 0x40 + (bit * 8) + 6;
    constexpr uint8_t opRes = 0x80 + (bit * 8) + 6;
    constexpr uint8_t opSet = 0xC0 + (bit * 8) + 6;

    registry.bitwiseIX[opBit] = { &executeBitIX<bit>, 20 };
    registry.bitwiseIY[opBit] = { &executeBitIY<bit>, 20 };
    registry.bitwiseIX[opRes] = { &executeResIX<bit>, 23 };
    registry.bitwiseIY[opRes] = { &executeResIY<bit>, 23 };
    registry.bitwiseIX[opSet] = { &executeSetIX<bit>, 23 };
    registry.bitwiseIY[opSet] = { &executeSetIY<bit>, 23 };
}

// ========================================================================
// CORE REGISTRATION PIPELINE
// ========================================================================

void Z80Bitwise::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // --- 1. Bit 0 ---
    bindBitwise<0, 0>(registry); bindBitwise<0, 1>(registry); bindBitwise<0, 2>(registry); bindBitwise<0, 3>(registry);
    bindBitwise<0, 4>(registry); bindBitwise<0, 5>(registry); bindBitwise<0, 6>(registry); bindBitwise<0, 7>(registry);
    bindIndexedBitwise<0>(registry);

    // --- 2. Bit 1 ---
    bindBitwise<1, 0>(registry); bindBitwise<1, 1>(registry); bindBitwise<1, 2>(registry); bindBitwise<1, 3>(registry);
    bindBitwise<1, 4>(registry); bindBitwise<1, 5>(registry); bindBitwise<1, 6>(registry); bindBitwise<1, 7>(registry);
    bindIndexedBitwise<1>(registry);

    // --- 3. Bit 2 ---
    bindBitwise<2, 0>(registry); bindBitwise<2, 1>(registry); bindBitwise<2, 2>(registry); bindBitwise<2, 3>(registry);
    bindBitwise<2, 4>(registry); bindBitwise<2, 5>(registry); bindBitwise<2, 6>(registry); bindBitwise<2, 7>(registry);
    bindIndexedBitwise<2>(registry);

    // --- 4. Bit 3 ---
    bindBitwise<3, 0>(registry); bindBitwise<3, 1>(registry); bindBitwise<3, 2>(registry); bindBitwise<3, 3>(registry);
    bindBitwise<3, 4>(registry); bindBitwise<3, 5>(registry); bindBitwise<3, 6>(registry); bindBitwise<3, 7>(registry);
    bindIndexedBitwise<3>(registry);

    // --- 5. Bit 4 ---
    bindBitwise<4, 0>(registry); bindBitwise<4, 1>(registry); bindBitwise<4, 2>(registry); bindBitwise<4, 3>(registry);
    bindBitwise<4, 4>(registry); bindBitwise<4, 5>(registry); bindBitwise<4, 6>(registry); bindBitwise<4, 7>(registry);
    bindIndexedBitwise<4>(registry);

    // --- 6. Bit 5 ---
    bindBitwise<5, 0>(registry); bindBitwise<5, 1>(registry); bindBitwise<5, 2>(registry); bindBitwise<5, 3>(registry);
    bindBitwise<5, 4>(registry); bindBitwise<5, 5>(registry); bindBitwise<5, 6>(registry); bindBitwise<5, 7>(registry);
    bindIndexedBitwise<5>(registry);

    // --- 7. Bit 6 ---
    bindBitwise<6, 0>(registry); bindBitwise<6, 1>(registry); bindBitwise<6, 2>(registry); bindBitwise<6, 3>(registry);
    bindBitwise<6, 4>(registry); bindBitwise<6, 5>(registry); bindBitwise<6, 6>(registry); bindBitwise<6, 7>(registry);
    bindIndexedBitwise<6>(registry);

    // --- 8. Bit 7 ---
    bindBitwise<7, 0>(registry); bindBitwise<7, 1>(registry); bindBitwise<7, 2>(registry); bindBitwise<7, 3>(registry);
    bindBitwise<7, 4>(registry); bindBitwise<7, 5>(registry); bindBitwise<7, 6>(registry); bindBitwise<7, 7>(registry);
    bindIndexedBitwise<7>(registry);
}