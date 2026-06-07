/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80Arithmetic.cpp
 * 
 * Domain Layer: Z80 CPU Arithmetic Instructions Implementation
 */

#include "Z80Arithmetic.h"

static inline uint16_t getDisplacement(ZilogZ80& cpu, uint16_t indexValue) {
    uint8_t d = cpu.mmu->readAddr(cpu.registers.pc + 2);
    int8_t incr = static_cast<int8_t>(d);
    return (indexValue + incr) & 0xFFFF;
}

void Z80Arithmetic::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // ========================================================================
    // 1. STANDARD UNPREFIXED ARITHMETIC / LOGICAL OPERATIONS
    // ========================================================================

    // --- 16-Bit Increment / Decrement ---
    registry.standard[0x03] = { [](ZilogZ80& c) { c.registers.setBC((c.registers.getBC() + 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x0B] = { [](ZilogZ80& c) { c.registers.setBC((c.registers.getBC() - 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x13] = { [](ZilogZ80& c) { c.registers.setDE((c.registers.getDE() + 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x1B] = { [](ZilogZ80& c) { c.registers.setDE((c.registers.getDE() - 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x23] = { [](ZilogZ80& c) { c.registers.setHL((c.registers.getHL() + 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x2B] = { [](ZilogZ80& c) { c.registers.setHL((c.registers.getHL() - 1) & 0xFFFF); c.incPc(1); }, 6 };
    registry.standard[0x33] = { [](ZilogZ80& c) { c.registers.sp = (c.registers.sp + 1) & 0xFFFF; c.incPc(1); }, 6 };
    registry.standard[0x3B] = { [](ZilogZ80& c) { c.registers.sp = (c.registers.sp - 1) & 0xFFFF; c.incPc(1); }, 6 };

    // --- 16-Bit Addition ---
    registry.standard[0x09] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.add_16bit(c.registers, c.registers.getHL(), c.registers.getBC())); c.incPc(1); }, 11 };
    registry.standard[0x19] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.add_16bit(c.registers, c.registers.getHL(), c.registers.getDE())); c.incPc(1); }, 11 };
    registry.standard[0x29] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.add_16bit(c.registers, c.registers.getHL(), c.registers.getHL())); c.incPc(1); }, 11 };
    registry.standard[0x39] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.add_16bit(c.registers, c.registers.getHL(), c.registers.sp)); c.incPc(1); }, 11 };

    // --- 8-Bit Increment / Decrement ---
    registry.standard[0x04] = { [](ZilogZ80& c) { c.registers.b = c.alu.inc_8bit(c.registers, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x05] = { [](ZilogZ80& c) { c.registers.b = c.alu.dec_8bit(c.registers, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x0C] = { [](ZilogZ80& c) { c.registers.c = c.alu.inc_8bit(c.registers, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x0D] = { [](ZilogZ80& c) { c.registers.c = c.alu.dec_8bit(c.registers, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x14] = { [](ZilogZ80& c) { c.registers.d = c.alu.inc_8bit(c.registers, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x15] = { [](ZilogZ80& c) { c.registers.d = c.alu.dec_8bit(c.registers, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x1C] = { [](ZilogZ80& c) { c.registers.e = c.alu.inc_8bit(c.registers, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x1D] = { [](ZilogZ80& c) { c.registers.e = c.alu.dec_8bit(c.registers, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x24] = { [](ZilogZ80& c) { c.registers.h = c.alu.inc_8bit(c.registers, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x25] = { [](ZilogZ80& c) { c.registers.h = c.alu.dec_8bit(c.registers, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x2C] = { [](ZilogZ80& c) { c.registers.l = c.alu.inc_8bit(c.registers, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x2D] = { [](ZilogZ80& c) { c.registers.l = c.alu.dec_8bit(c.registers, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x3C] = { [](ZilogZ80& c) { c.registers.a = c.alu.inc_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };
    registry.standard[0x3D] = { [](ZilogZ80& c) { c.registers.a = c.alu.dec_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0x34] = { [](ZilogZ80& c) {
        uint16_t hl = c.registers.getHL();
        uint8_t val = c.mmu->readAddr(hl);
        c.mmu->writeAddr(hl, c.alu.inc_8bit(c.registers, val));
        c.incPc(1);
    }, 11 };

    registry.standard[0x35] = { [](ZilogZ80& c) {
        uint16_t hl = c.registers.getHL();
        uint8_t val = c.mmu->readAddr(hl);
        c.mmu->writeAddr(hl, c.alu.dec_8bit(c.registers, val));
        c.incPc(1);
    }, 11 };

    // --- Decimal / Negation / Complement ---
    registry.standard[0x27] = { [](ZilogZ80& c) { c.registers.a = c.alu.daa_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };
    registry.standard[0x2F] = { [](ZilogZ80& c) { c.registers.a = c.alu.cpl_8bit(c.registers, c.registers.a); c.incPc(1); }, 4 };

    // --- Carry Flag Operations ---
    registry.standard[0x37] = { [](ZilogZ80& c) { 
        c.registers.f &= 0xC4; 
        c.registers.f |= Z80Flags::FLAG_C;
        c.incPc(1); 
    }, 4 };

    registry.standard[0x3F] = { [](ZilogZ80& c) { 
        bool oldC = (c.registers.f & Z80Flags::FLAG_C) != 0;
        c.registers.f &= 0xC4;
        if (!oldC) c.registers.f |= Z80Flags::FLAG_C;
        if (oldC)  c.registers.f |= Z80Flags::FLAG_H;
        c.incPc(1); 
    }, 4 };

    // --- 8-Bit Addition / Subtraction with Registers ---
    registry.standard[0x80] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x81] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x82] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x83] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x84] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x85] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x86] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0x87] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0x88] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x89] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x8A] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x8B] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x8C] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x8D] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x8E] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0x8F] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0x90] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x91] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x92] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x93] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x94] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x95] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x96] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0x97] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0x98] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0x99] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0x9A] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0x9B] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0x9C] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0x9D] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0x9E] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0x9F] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    // --- Logical Operations with Registers ---
    registry.standard[0xA0] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0xA1] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0xA2] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0xA3] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0xA4] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0xA5] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0xA6] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0xA7] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0xA8] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0xA9] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0xAA] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0xAB] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0xAC] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0xAD] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0xAE] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0xAF] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    registry.standard[0xB0] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0xB1] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0xB2] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0xB3] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0xB4] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0xB5] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0xB6] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0xB7] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    // --- Comparisons ---
    registry.standard[0xB8] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.b); c.incPc(1); }, 4 };
    registry.standard[0xB9] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.c); c.incPc(1); }, 4 };
    registry.standard[0xBA] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.d); c.incPc(1); }, 4 };
    registry.standard[0xBB] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.e); c.incPc(1); }, 4 };
    registry.standard[0xBC] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.h); c.incPc(1); }, 4 };
    registry.standard[0xBD] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.l); c.incPc(1); }, 4 };
    registry.standard[0xBE] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.getHL())); c.incPc(1); }, 7 };
    registry.standard[0xBF] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.a); c.incPc(1); }, 4 };

    // --- Immediate Arithmetic / Logical Group ---
    registry.standard[0xC6] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xCE] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xD6] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xDE] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xE6] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xEE] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xF6] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };
    registry.standard[0xFE] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 7 };


    // ========================================================================
    // 2. EXTENDED ED-PREFIXED ARITHMETIC OPERATIONS
    // ========================================================================

    // --- 16-Bit Subtract with Carry ---
    registry.extended[0x42] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.sbc_16bit(c.registers, c.registers.getHL(), c.registers.getBC())); c.incPc(2); }, 15 };
    registry.extended[0x52] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.sbc_16bit(c.registers, c.registers.getHL(), c.registers.getDE())); c.incPc(2); }, 15 };
    registry.extended[0x62] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.sbc_16bit(c.registers, c.registers.getHL(), c.registers.getHL())); c.incPc(2); }, 15 };

    // --- 16-Bit Add with Carry ---
    registry.extended[0x4A] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.adc_16bit(c.registers, c.registers.getHL(), c.registers.getBC())); c.incPc(2); }, 15 };
    registry.extended[0x5A] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.adc_16bit(c.registers, c.registers.getHL(), c.registers.getDE())); c.incPc(2); }, 15 };
    registry.extended[0x6A] = { [](ZilogZ80& c) { c.registers.setHL(c.alu.adc_16bit(c.registers, c.registers.getHL(), c.registers.getHL())); c.incPc(2); }, 15 };

    // --- Negation ---
    registry.extended[0x44] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, 0, c.registers.a); c.incPc(2); }, 8 };


    // ========================================================================
    // 3. INDEXED DD-PREFIXED ARITHMETIC OPERATIONS (IX Register math)
    // ========================================================================

    // --- IX Increment / Decrement ---
    registry.indexedIX[0x23] = { [](ZilogZ80& c) { c.registers.setIX((c.registers.getIX() + 1) & 0xFFFF); c.incPc(2); }, 10 };
    registry.indexedIX[0x2B] = { [](ZilogZ80& c) { c.registers.setIX((c.registers.getIX() - 1) & 0xFFFF); c.incPc(2); }, 10 };
    registry.indexedIX[0x24] = { [](ZilogZ80& c) { c.registers.ixh = c.alu.inc_8bit(c.registers, c.registers.ixh); c.incPc(2); }, 8 };
    registry.indexedIX[0x25] = { [](ZilogZ80& c) { c.registers.ixh = c.alu.dec_8bit(c.registers, c.registers.ixh); c.incPc(2); }, 8 };
    registry.indexedIX[0x2C] = { [](ZilogZ80& c) { c.registers.ixl = c.alu.inc_8bit(c.registers, c.registers.ixl); c.incPc(2); }, 8 };
    registry.indexedIX[0x2D] = { [](ZilogZ80& c) { c.registers.ixl = c.alu.dec_8bit(c.registers, c.registers.ixl); c.incPc(2); }, 8 };

    registry.indexedIX[0x34] = { [](ZilogZ80& c) {
        uint16_t addr = getDisplacement(c, c.registers.getIX());
        uint8_t mem = c.mmu->readAddr(addr);
        c.mmu->writeAddr(addr, c.alu.inc_8bit(c.registers, mem));
        c.incPc(3); 
    }, 23 };

    registry.indexedIX[0x35] = { [](ZilogZ80& c) {
        uint16_t addr = getDisplacement(c, c.registers.getIX());
        uint8_t mem = c.mmu->readAddr(addr);
        c.mmu->writeAddr(addr, c.alu.dec_8bit(c.registers, mem));
        c.incPc(3); 
    }, 23 };

    // --- 16-Bit IX Additions ---
    registry.indexedIX[0x09] = { [](ZilogZ80& c) { c.registers.setIX(c.alu.add_16bit(c.registers, c.registers.getIX(), c.registers.getBC())); c.incPc(2); }, 15 };
    registry.indexedIX[0x19] = { [](ZilogZ80& c) { c.registers.setIX(c.alu.add_16bit(c.registers, c.registers.getIX(), c.registers.getDE())); c.incPc(2); }, 15 };
    registry.indexedIX[0x29] = { [](ZilogZ80& c) { c.registers.setIX(c.alu.add_16bit(c.registers, c.registers.getIX(), c.registers.getIX())); c.incPc(2); }, 15 };
    registry.indexedIX[0x39] = { [](ZilogZ80& c) { c.registers.setIX(c.alu.add_16bit(c.registers, c.registers.getIX(), c.registers.sp)); c.incPc(2); }, 15 };

    // --- 8-Bit Index Add/Sub/Logical Operations (IXH / IXL) ---
    registry.indexedIX[0x84] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.ixh); c.incPc(2); }, 8 };
    registry.indexedIX[0x85] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.ixl); c.incPc(2); }, 8 };
    registry.indexedIX[0x94] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.ixh); c.incPc(2); }, 8 };
    registry.indexedIX[0xA5] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.registers.ixl); c.incPc(2); }, 8 };
    registry.indexedIX[0xB5] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.ixl); c.incPc(2); }, 8 };
    registry.indexedIX[0xBC] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.ixh); c.incPc(2); }, 8 };
    registry.indexedIX[0xBD] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.ixl); c.incPc(2); }, 8 };

    // --- 8-Bit Indirect IX-relative Operations (IX + d) ---
    registry.indexedIX[0x86] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0x8E] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0x96] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0x9E] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0xA6] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0xAE] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0xB6] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };
    registry.indexedIX[0xBE] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIX()))); c.incPc(3); }, 19 };


    // ========================================================================
    // 4. INDEXED FD-PREFIXED ARITHMETIC OPERATIONS (IY Register math)
    // ========================================================================

    // --- IY Increment / Decrement ---
    registry.indexedIY[0x23] = { [](ZilogZ80& c) { c.registers.setIY((c.registers.getIY() + 1) & 0xFFFF); c.incPc(2); }, 10 };
    registry.indexedIY[0x2B] = { [](ZilogZ80& c) { c.registers.setIY((c.registers.getIY() - 1) & 0xFFFF); c.incPc(2); }, 10 };
    registry.indexedIY[0x24] = { [](ZilogZ80& c) { c.registers.iyh = c.alu.inc_8bit(c.registers, c.registers.iyh); c.incPc(2); }, 8 };
    registry.indexedIY[0x25] = { [](ZilogZ80& c) { c.registers.iyh = c.alu.dec_8bit(c.registers, c.registers.iyh); c.incPc(2); }, 8 };
    registry.indexedIY[0x2C] = { [](ZilogZ80& c) { c.registers.iyl = c.alu.inc_8bit(c.registers, c.registers.iyl); c.incPc(2); }, 8 };
    registry.indexedIY[0x2D] = { [](ZilogZ80& c) { c.registers.iyl = c.alu.dec_8bit(c.registers, c.registers.iyl); c.incPc(2); }, 8 };

    registry.indexedIY[0x34] = { [](ZilogZ80& c) {
        uint16_t addr = getDisplacement(c, c.registers.getIY());
        uint8_t val = c.mmu->readAddr(addr);
        val = c.alu.inc_8bit(c.registers, val);
        c.mmu->writeAddr(addr, val);
        c.incPc(3); 
    }, 23 };

    registry.indexedIY[0x35] = { [](ZilogZ80& c) {
        uint16_t addr = getDisplacement(c, c.registers.getIY());
        uint8_t mem = c.mmu->readAddr(addr);
        c.mmu->writeAddr(addr, c.alu.dec_8bit(c.registers, mem));
        c.incPc(3); 
    }, 23 };

    // --- 16-Bit IY Additions ---
    registry.indexedIY[0x09] = { [](ZilogZ80& c) { c.registers.setIY(c.alu.add_16bit(c.registers, c.registers.getIY(), c.registers.getBC())); c.incPc(2); }, 15 };
    registry.indexedIY[0x19] = { [](ZilogZ80& c) { c.registers.setIY(c.alu.add_16bit(c.registers, c.registers.getIY(), c.registers.getDE())); c.incPc(2); }, 15 };
    registry.indexedIY[0x29] = { [](ZilogZ80& c) { c.registers.setIY(c.alu.add_16bit(c.registers, c.registers.getIY(), c.registers.getIY())); c.incPc(2); }, 15 };
    registry.indexedIY[0x39] = { [](ZilogZ80& c) { c.registers.setIY(c.alu.add_16bit(c.registers, c.registers.getIY(), c.registers.sp)); c.incPc(2); }, 15 };

    // --- 8-Bit Index Add/Sub/Logical Operations (IYH / IYL) ---
    registry.indexedIY[0x84] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.iyh); c.incPc(2); }, 8 };
    registry.indexedIY[0x85] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.registers.iyl); c.incPc(2); }, 8 };
    registry.indexedIY[0x94] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.iyh); c.incPc(2); }, 8 };
    registry.indexedIY[0x95] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.registers.iyl); c.incPc(2); }, 8 };
    registry.indexedIY[0xB4] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.iyh); c.incPc(2); }, 8 };
    registry.indexedIY[0xB5] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.registers.iyl); c.incPc(2); }, 8 };
    registry.indexedIY[0xBC] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.registers.iyh); c.incPc(2); }, 8 };

    // --- 8-Bit Indirect IY-relative Operations (IY + d) ---
    registry.indexedIY[0x86] = { [](ZilogZ80& c) { c.registers.a = c.alu.add_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0x8E] = { [](ZilogZ80& c) { c.registers.a = c.alu.adc_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0x96] = { [](ZilogZ80& c) { c.registers.a = c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0x9E] = { [](ZilogZ80& c) { c.registers.a = c.alu.sbc_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0xA6] = { [](ZilogZ80& c) { c.registers.a = c.alu.and_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0xAE] = { [](ZilogZ80& c) { c.registers.a = c.alu.xor_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0xB6] = { [](ZilogZ80& c) { c.registers.a = c.alu.or_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };
    registry.indexedIY[0xBE] = { [](ZilogZ80& c) { c.alu.sub_8bit(c.registers, c.registers.a, c.mmu->readAddr(getDisplacement(c, c.registers.getIY()))); c.incPc(3); }, 19 };

}