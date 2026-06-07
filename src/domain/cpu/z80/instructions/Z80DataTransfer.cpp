/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80DataTransfer.cpp
 * 
 * Domain Layer: Z80 CPU Data Transfer Instructions Implementation
 */

#include "Z80DataTransfer.h"

// Helper for displacement address computation used in index-relative addressing
static inline uint16_t getDisplacement(ZilogZ80& cpu, uint16_t indexValue) {
    uint8_t d = cpu.mmu->readAddr(cpu.registers.pc + 2);
    // Sign-extend the 8-bit displacement value (-128 to +127)
    int8_t incr = static_cast<int8_t>(d);
    return (indexValue + incr) & 0xFFFF;
}

void Z80DataTransfer::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // ========================================================================
    // 1. STANDARD UNPREFIXED DATA TRANSFER OPERATIONS (8-Bit & 16-Bit LD)
    // ========================================================================

    // --- 16-Bit Load Group ---
    registry.standard[0x01] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.registers.b = m2; c.registers.c = m1; c.incPc(3); 
    }, 10 };

    registry.standard[0x11] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.registers.d = m2; c.registers.e = m1; c.incPc(3); 
    }, 10 };

    registry.standard[0x21] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.registers.h = m2; c.registers.l = m1; c.incPc(3); 
    }, 10 };

    registry.standard[0x31] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.registers.sp = (m2 << 8) | m1; c.incPc(3); 
    }, 10 };

    registry.standard[0x22] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr((c.registers.pc + 1) & 0xFFFF); 
        uint8_t m2 = c.mmu->readAddr((c.registers.pc + 2) & 0xFFFF); 
        uint16_t addr = (m2 << 8) | m1; 
        c.mmu->writeAddr(addr, c.registers.l); 
        c.mmu->writeAddr(addr + 1, c.registers.h); 
        c.incPc(3); 
    }, 16 };

    registry.standard[0x2A] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        uint16_t addr = (m2 << 8) | m1; 
        uint16_t word = c.mmu->readAddr16bit(addr); 
        c.registers.h = (word >> 8) & 0xFF; 
        c.registers.l = word & 0xFF; 
        c.incPc(3); 
    }, 16 };

    registry.standard[0xF9] = { [](ZilogZ80& c) { 
        c.registers.sp = c.registers.getHL(); c.incPc(1); 
    }, 6 };

    // --- Indirect 8-Bit Load Group ---
    registry.standard[0x02] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getBC(), c.registers.a); c.incPc(1); }, 7 };
    registry.standard[0x0A] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(c.registers.getBC()); c.incPc(1); }, 7 };
    registry.standard[0x12] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getDE(), c.registers.a); c.incPc(1); }, 7 };
    registry.standard[0x1A] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(c.registers.getDE()); c.incPc(1); }, 7 };
    
    registry.standard[0x32] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.mmu->writeAddr((m2 << 8) | m1, c.registers.a); c.incPc(3); 
    }, 13 };

    registry.standard[0x3A] = { [](ZilogZ80& c) { 
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 1); 
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 2); 
        c.registers.a = c.mmu->readAddr((m2 << 8) | m1); c.incPc(3); 
    }, 13 };

    // --- Immediate 8-Bit Load Group ---
    registry.standard[0x06] = { [](ZilogZ80& c) { c.registers.b = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x0E] = { [](ZilogZ80& c) { c.registers.c = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x16] = { [](ZilogZ80& c) { c.registers.d = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x1E] = { [](ZilogZ80& c) { c.registers.e = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x26] = { [](ZilogZ80& c) { c.registers.h = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x2E] = { [](ZilogZ80& c) { c.registers.l = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };
    registry.standard[0x36] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.mmu->readAddr(c.registers.pc + 1)); c.incPc(2); }, 10 };
    registry.standard[0x3E] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(c.registers.pc + 1); c.incPc(2); }, 7 };

    // --- Register 8-Bit Load Group (LD r, r') ---
    registry.standard[0x40] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x41] = { [](ZilogZ80& c) { c.registers.b = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x42] = { [](ZilogZ80& c) { c.registers.b = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x43] = { [](ZilogZ80& c) { c.registers.b = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x44] = { [](ZilogZ80& c) { c.registers.b = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x45] = { [](ZilogZ80& c) { c.registers.b = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x46] = { [](ZilogZ80& c) { c.registers.b = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x47] = { [](ZilogZ80& c) { c.registers.b = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x48] = { [](ZilogZ80& c) { c.registers.c = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x49] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x4A] = { [](ZilogZ80& c) { c.registers.c = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x4B] = { [](ZilogZ80& c) { c.registers.c = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x4C] = { [](ZilogZ80& c) { c.registers.c = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x4D] = { [](ZilogZ80& c) { c.registers.c = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x4E] = { [](ZilogZ80& c) { c.registers.c = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x4F] = { [](ZilogZ80& c) { c.registers.c = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x50] = { [](ZilogZ80& c) { c.registers.d = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x51] = { [](ZilogZ80& c) { c.registers.d = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x52] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x53] = { [](ZilogZ80& c) { c.registers.d = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x54] = { [](ZilogZ80& c) { c.registers.d = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x55] = { [](ZilogZ80& c) { c.registers.d = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x56] = { [](ZilogZ80& c) { c.registers.d = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x57] = { [](ZilogZ80& c) { c.registers.d = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x58] = { [](ZilogZ80& c) { c.registers.e = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x59] = { [](ZilogZ80& c) { c.registers.e = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x5A] = { [](ZilogZ80& c) { c.registers.e = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x5B] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x5C] = { [](ZilogZ80& c) { c.registers.e = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x5D] = { [](ZilogZ80& c) { c.registers.e = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x5E] = { [](ZilogZ80& c) { c.registers.e = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x5F] = { [](ZilogZ80& c) { c.registers.e = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x60] = { [](ZilogZ80& c) { c.registers.h = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x61] = { [](ZilogZ80& c) { c.registers.h = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x62] = { [](ZilogZ80& c) { c.registers.h = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x63] = { [](ZilogZ80& c) { c.registers.h = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x64] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x65] = { [](ZilogZ80& c) { c.registers.h = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x66] = { [](ZilogZ80& c) { c.registers.h = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x67] = { [](ZilogZ80& c) { c.registers.h = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x68] = { [](ZilogZ80& c) { c.registers.l = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x69] = { [](ZilogZ80& c) { c.registers.l = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x6A] = { [](ZilogZ80& c) { c.registers.l = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x6B] = { [](ZilogZ80& c) { c.registers.l = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x6C] = { [](ZilogZ80& c) { c.registers.l = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x6D] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    registry.standard[0x6E] = { [](ZilogZ80& c) { c.registers.l = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x6F] = { [](ZilogZ80& c) { c.registers.l = c.registers.a; c.incPc(1); }, 4 };

    registry.standard[0x70] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.b); c.incPc(1); }, 7 };
    registry.standard[0x71] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.c); c.incPc(1); }, 7 };
    registry.standard[0x72] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.d); c.incPc(1); }, 7 };
    registry.standard[0x73] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.e); c.incPc(1); }, 7 };
    registry.standard[0x74] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.h); c.incPc(1); }, 7 };
    registry.standard[0x75] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.l); c.incPc(1); }, 7 };
    registry.standard[0x77] = { [](ZilogZ80& c) { c.mmu->writeAddr(c.registers.getHL(), c.registers.a); c.incPc(1); }, 7 };

    registry.standard[0x78] = { [](ZilogZ80& c) { c.registers.a = c.registers.b; c.incPc(1); }, 4 };
    registry.standard[0x79] = { [](ZilogZ80& c) { c.registers.a = c.registers.c; c.incPc(1); }, 4 };
    registry.standard[0x7A] = { [](ZilogZ80& c) { c.registers.a = c.registers.d; c.incPc(1); }, 4 };
    registry.standard[0x7B] = { [](ZilogZ80& c) { c.registers.a = c.registers.e; c.incPc(1); }, 4 };
    registry.standard[0x7C] = { [](ZilogZ80& c) { c.registers.a = c.registers.h; c.incPc(1); }, 4 };
    registry.standard[0x7D] = { [](ZilogZ80& c) { c.registers.a = c.registers.l; c.incPc(1); }, 4 };
    registry.standard[0x7E] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(c.registers.getHL()); c.incPc(1); }, 7 };
    registry.standard[0x7F] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };

    // --- Stack PUSH / POP ---
    registry.standard[0xC1] = { [](ZilogZ80& c) { c.registers.setBC(c.popWord()); c.incPc(1); }, 10 };
    registry.standard[0xD1] = { [](ZilogZ80& c) { c.registers.setDE(c.popWord()); c.incPc(1); }, 10 };
    registry.standard[0xE1] = { [](ZilogZ80& c) { c.registers.setHL(c.popWord()); c.incPc(1); }, 10 };
    registry.standard[0xF1] = { [](ZilogZ80& c) { c.registers.setAF(c.popWord()); c.incPc(1); }, 10 };

    registry.standard[0xC5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getBC()); c.incPc(1); }, 11 };
    registry.standard[0xD5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getDE()); c.incPc(1); }, 11 };
    registry.standard[0xE5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getHL()); c.incPc(1); }, 11 };
    registry.standard[0xF5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getAF()); c.incPc(1); }, 11 };

    // --- Exchange Registers Group ---
    registry.standard[0x08] = { [](ZilogZ80& c) { c.registers.exchangeAF(); c.incPc(1); }, 4 };
    registry.standard[0xD9] = { [](ZilogZ80& c) { c.registers.exchangeBC_DE_HL(); c.incPc(1); }, 4 };
    registry.standard[0xEB] = { [](ZilogZ80& c) { c.registers.exchangeDE_HL(); c.incPc(1); }, 4 };
    
    registry.standard[0xE3] = { [](ZilogZ80& c) { 
        uint8_t tmp = c.mmu->readAddr(c.registers.sp);
        c.mmu->writeAddr(c.registers.sp, c.registers.l);
        c.registers.l = tmp;

        tmp = c.mmu->readAddr((c.registers.sp + 1) & 0xFFFF);
        c.mmu->writeAddr((c.registers.sp + 1) & 0xFFFF, c.registers.h);
        c.registers.h = tmp;

        c.incPc(1); 
    }, 19 };


    // ========================================================================
    // 2. EXTENDED ED-PREFIXED DATA TRANSFER OPERATIONS
    // ========================================================================

    registry.extended[0x43] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t addr = (m2 << 8) | m1;
        c.mmu->writeAddr(addr, c.registers.c);
        c.mmu->writeAddr(addr + 1, c.registers.b);
        c.incPc(4);
    }, 20 };

    registry.extended[0x4B] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t word = c.mmu->readAddr16bit((m2 << 8) | m1);
        c.registers.b = (word >> 8) & 0xFF;
        c.registers.c = word & 0xFF;
        c.incPc(4);
    }, 20 };

    registry.extended[0x53] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t addr = (m2 << 8) | m1;
        c.mmu->writeAddr(addr, c.registers.e);
        c.mmu->writeAddr(addr + 1, c.registers.d);
        c.incPc(4);
    }, 20 };

    registry.extended[0x5B] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t word = c.mmu->readAddr16bit((m2 << 8) | m1);
        c.registers.d = (word >> 8) & 0xFF;
        c.registers.e = word & 0xFF;
        c.incPc(4);
    }, 20 };

    registry.extended[0x73] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr((c.registers.pc + 2) & 0xFFFF);
        uint8_t m2 = c.mmu->readAddr((c.registers.pc + 3) & 0xFFFF);
        uint16_t addr = (m2 << 8) | m1;
        c.mmu->writeAddr(addr, c.registers.sp & 0xFF);
        c.mmu->writeAddr(addr + 1, c.registers.sp >> 8);
        c.incPc(4);
    }, 20 };

    registry.extended[0x7B] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr((c.registers.pc + 2) & 0xFFFF);
        uint8_t m2 = c.mmu->readAddr((c.registers.pc + 3) & 0xFFFF);
        c.registers.sp = c.mmu->readAddr16bit((m2 << 8) | m1);
        c.incPc(4);
    }, 20 };

    // --- I / R Special Register Transfer ---
    registry.extended[0x47] = { [](ZilogZ80& c) { c.registers.i = c.registers.a; c.incPc(2); }, 9 };
    registry.extended[0x4F] = { [](ZilogZ80& c) { c.registers.r = c.registers.a; c.incPc(2); }, 9 };
    
    registry.extended[0x57] = { [](ZilogZ80& c) {
        c.registers.a = c.registers.i;
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        
        if ((c.registers.a & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        
        if (c.registers.a == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        
        if (c.registers.iff2) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        
        c.incPc(2);
    }, 9 };

    registry.extended[0x5F] = { [](ZilogZ80& c) {
        c.registers.r += 2;
        c.registers.r &= 0x7F;
        c.registers.a = c.registers.r;
        
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        
        if ((c.registers.a & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        
        if (c.registers.a == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        
        if (c.registers.iff2) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        
        c.incPc(2);
    }, 9 };


    // ========================================================================
    // 3. INDEXED DD-PREFIXED DATA TRANSFER OPERATIONS (IX)
    // ========================================================================

    // --- 16-Bit IX Loads ---
    registry.indexedIX[0x21] = { [](ZilogZ80& c) {
        c.registers.ixl = c.mmu->readAddr(c.registers.pc + 2);
        c.registers.ixh = c.mmu->readAddr(c.registers.pc + 3);
        c.incPc(4); 
    }, 14 };

    registry.indexedIX[0x22] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        c.mmu->writeAddr16bit(m1 | (m2 << 8), c.registers.getIX());
        c.incPc(4); 
    }, 20 };

    registry.indexedIX[0x2A] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t word = c.mmu->readAddr16bit(m1 | (m2 << 8));
        c.registers.ixh = (word >> 8) & 0xFF;
        c.registers.ixl = word & 0xFF;
        c.incPc(4); 
    }, 20 };

    registry.indexedIX[0xF9] = { [](ZilogZ80& c) { c.registers.sp = c.registers.getIX(); c.incPc(2); }, 10 };

    // --- 8-Bit Index Register Loads (IXH/IXL) ---
    registry.indexedIX[0x26] = { [](ZilogZ80& c) { c.registers.ixh = c.mmu->readAddr(c.registers.pc + 2); c.incPc(3); }, 11 };
    registry.indexedIX[0x2E] = { [](ZilogZ80& c) { c.registers.ixl = c.mmu->readAddr(c.registers.pc + 2); c.incPc(3); }, 11 };
    
    registry.indexedIX[0x44] = { [](ZilogZ80& c) { c.registers.b = c.registers.ixh; c.incPc(2); }, 8 };
    registry.indexedIX[0x45] = { [](ZilogZ80& c) { c.registers.b = c.registers.ixl; c.incPc(2); }, 8 };
    registry.indexedIX[0x54] = { [](ZilogZ80& c) { c.registers.d = c.registers.ixh; c.incPc(2); }, 8 };
    registry.indexedIX[0x5D] = { [](ZilogZ80& c) { c.registers.e = c.registers.ixl; c.incPc(2); }, 8 };
    
    registry.indexedIX[0x60] = { [](ZilogZ80& c) { c.registers.ixh = c.registers.b; c.incPc(2); }, 8 };
    registry.indexedIX[0x62] = { [](ZilogZ80& c) { c.registers.ixh = c.registers.d; c.incPc(2); }, 8 };
    registry.indexedIX[0x63] = { [](ZilogZ80& c) { c.registers.ixh = c.registers.e; c.incPc(2); }, 8 };
    registry.indexedIX[0x67] = { [](ZilogZ80& c) { c.registers.ixh = c.registers.a; c.incPc(2); }, 8 };
    registry.indexedIX[0x68] = { [](ZilogZ80& c) { c.registers.ixl = c.registers.b; c.incPc(2); }, 8 };
    registry.indexedIX[0x69] = { [](ZilogZ80& c) { c.registers.ixl = c.registers.c; c.incPc(2); }, 8 };
    registry.indexedIX[0x6B] = { [](ZilogZ80& c) { c.registers.ixl = c.registers.e; c.incPc(2); }, 8 };
    registry.indexedIX[0x6C] = { [](ZilogZ80& c) { c.registers.ixl = c.registers.ixh; c.incPc(2); }, 8 };
    registry.indexedIX[0x6F] = { [](ZilogZ80& c) { c.registers.ixl = c.registers.a; c.incPc(2); }, 8 };

    registry.indexedIX[0x7C] = { [](ZilogZ80& c) { c.registers.a = c.registers.ixh; c.incPc(2); }, 8 };
    registry.indexedIX[0x7D] = { [](ZilogZ80& c) { c.registers.a = c.registers.ixl; c.incPc(2); }, 8 };

    // --- Indirect 8-Bit Index Loads (IX + d) ---
    registry.indexedIX[0x46] = { [](ZilogZ80& c) { c.registers.b = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x4E] = { [](ZilogZ80& c) { c.registers.c = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x56] = { [](ZilogZ80& c) { c.registers.d = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x5E] = { [](ZilogZ80& c) { c.registers.e = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x66] = { [](ZilogZ80& c) { c.registers.h = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x6E] = { [](ZilogZ80& c) { c.registers.l = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };
    registry.indexedIX[0x7E] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(getDisplacement(c, c.registers.getIX())); c.incPc(3); }, 19 };

    registry.indexedIX[0x70] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.b); c.incPc(3); }, 19 };
    registry.indexedIX[0x71] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.c); c.incPc(3); }, 19 };
    registry.indexedIX[0x72] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.d); c.incPc(3); }, 19 };
    registry.indexedIX[0x73] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.e); c.incPc(3); }, 19 };
    registry.indexedIX[0x74] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.h); c.incPc(3); }, 19 };
    registry.indexedIX[0x75] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.l); c.incPc(3); }, 19 };
    registry.indexedIX[0x77] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), c.registers.a); c.incPc(3); }, 19 };
    registry.indexedIX[0x36] = { [](ZilogZ80& c) {
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        c.mmu->writeAddr(getDisplacement(c, c.registers.getIX()), m2);
        c.incPc(4); 
    }, 19 };

    // --- IX PUSH / POP ---
    registry.indexedIX[0xE1] = { [](ZilogZ80& c) { 
        uint16_t word = c.popWord(); 
        c.registers.ixh = (word >> 8) & 0xFF; 
        c.registers.ixl = word & 0xFF; 
        c.incPc(2); 
    }, 14 };

    registry.indexedIX[0xE5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getIX()); c.incPc(2); }, 15 };

    // --- IX Exchanges ---
    registry.indexedIX[0xE3] = { [](ZilogZ80& c) { 
        uint8_t tmp = c.mmu->readAddr(c.registers.sp);
        c.mmu->writeAddr(c.registers.sp, c.registers.ixl);
        c.registers.ixl = tmp;

        tmp = c.mmu->readAddr((c.registers.sp + 1) & 0xFFFF);
        c.mmu->writeAddr((c.registers.sp + 1) & 0xFFFF, c.registers.ixh);
        c.registers.ixh = tmp;

        c.incPc(2); 
    }, 23 };


    // ========================================================================
    // 4. INDEXED FD-PREFIXED DATA TRANSFER OPERATIONS (IY Loads & Exchanges)
    // ========================================================================

    // --- 16-Bit IY Loads ---
    registry.indexedIY[0x21] = { [](ZilogZ80& c) {
        c.registers.iyl = c.mmu->readAddr(c.registers.pc + 2);
        c.registers.iyh = c.mmu->readAddr(c.registers.pc + 3);
        c.incPc(4); 
    }, 14 };

    registry.indexedIY[0x22] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        c.mmu->writeAddr16bit(m1 | (m2 << 8), c.registers.getIY());
        c.incPc(4); 
    }, 20 };

    registry.indexedIY[0x2A] = { [](ZilogZ80& c) {
        uint8_t m1 = c.mmu->readAddr(c.registers.pc + 2);
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        uint16_t word = c.mmu->readAddr16bit(m1 | (m2 << 8));
        c.registers.iyh = (word >> 8) & 0xFF;
        c.registers.iyl = word & 0xFF;
        c.incPc(4); 
    }, 20 };

    registry.indexedIY[0xF9] = { [](ZilogZ80& c) { c.registers.sp = c.registers.getIY(); c.incPc(2); }, 10 };

    // --- 8-Bit Index Register Loads (IYH/IYL) ---
    registry.indexedIY[0x26] = { [](ZilogZ80& c) { c.registers.iyh = c.mmu->readAddr(c.registers.pc + 2); c.incPc(3); }, 11 };
    registry.indexedIY[0x2E] = { [](ZilogZ80& c) { c.registers.iyl = c.mmu->readAddr(c.registers.pc + 2); c.incPc(3); }, 11 };
    
    registry.indexedIY[0x44] = { [](ZilogZ80& c) { c.registers.b = c.registers.iyh; c.incPc(2); }, 8 };
    registry.indexedIY[0x45] = { [](ZilogZ80& c) { c.registers.b = c.registers.iyl; c.incPc(2); }, 8 };
    registry.indexedIY[0x4D] = { [](ZilogZ80& c) { c.registers.c = c.registers.iyl; c.incPc(2); }, 8 };
    registry.indexedIY[0x54] = { [](ZilogZ80& c) { c.registers.d = c.registers.iyh; c.incPc(2); }, 8 };
    registry.indexedIY[0x5D] = { [](ZilogZ80& c) { c.registers.e = c.registers.iyl; c.incPc(2); }, 8 };
    
    registry.indexedIY[0x60] = { [](ZilogZ80& c) { c.registers.iyh = c.registers.b; c.incPc(2); }, 8 };
    registry.indexedIY[0x62] = { [](ZilogZ80& c) { c.registers.iyh = c.registers.d; c.incPc(2); }, 8 };
    registry.indexedIY[0x67] = { [](ZilogZ80& c) { c.registers.iyh = c.registers.a; c.incPc(2); }, 8 };
    registry.indexedIY[0x68] = { [](ZilogZ80& c) { c.registers.iyl = c.registers.b; c.incPc(2); }, 8 };
    registry.indexedIY[0x69] = { [](ZilogZ80& c) { c.registers.iyl = c.registers.c; c.incPc(2); }, 8 };
    registry.indexedIY[0x6B] = { [](ZilogZ80& c) { c.registers.iyl = c.registers.e; c.incPc(2); }, 8 };
    registry.indexedIY[0x6F] = { [](ZilogZ80& c) { c.registers.iyl = c.registers.a; c.incPc(2); }, 8 };

    registry.indexedIY[0x7C] = { [](ZilogZ80& c) { c.registers.a = c.registers.iyh; c.incPc(2); }, 8 };
    registry.indexedIY[0x7D] = { [](ZilogZ80& c) { c.registers.a = c.registers.iyl; c.incPc(2); }, 8 };

    // --- Indirect 8-Bit Index Loads (IY + d) ---
    registry.indexedIY[0x46] = { [](ZilogZ80& c) { c.registers.b = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x4E] = { [](ZilogZ80& c) { c.registers.c = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x56] = { [](ZilogZ80& c) { c.registers.d = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x5E] = { [](ZilogZ80& c) { c.registers.e = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x66] = { [](ZilogZ80& c) { c.registers.h = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x6E] = { [](ZilogZ80& c) { c.registers.l = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };
    registry.indexedIY[0x7E] = { [](ZilogZ80& c) { c.registers.a = c.mmu->readAddr(getDisplacement(c, c.registers.getIY())); c.incPc(3); }, 19 };

    registry.indexedIY[0x70] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.b); c.incPc(3); }, 19 };
    registry.indexedIY[0x71] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.c); c.incPc(3); }, 19 };
    registry.indexedIY[0x72] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.d); c.incPc(3); }, 19 };
    registry.indexedIY[0x73] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.e); c.incPc(3); }, 19 };
    registry.indexedIY[0x74] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.h); c.incPc(3); }, 19 };
    registry.indexedIY[0x75] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.l); c.incPc(3); }, 19 };
    registry.indexedIY[0x77] = { [](ZilogZ80& c) { c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), c.registers.a); c.incPc(3); }, 19 };
    registry.indexedIY[0x36] = { [](ZilogZ80& c) {
        uint8_t m2 = c.mmu->readAddr(c.registers.pc + 3);
        c.mmu->writeAddr(getDisplacement(c, c.registers.getIY()), m2);
        c.incPc(4); 
    }, 19 };

    // --- IY PUSH / POP ---
    registry.indexedIY[0xE1] = { [](ZilogZ80& c) { 
        uint16_t word = c.popWord(); 
        c.registers.iyh = (word >> 8) & 0xFF; 
        c.registers.iyl = word & 0xFF; 
        c.incPc(2); 
    }, 14 };

    registry.indexedIY[0xE5] = { [](ZilogZ80& c) { c.pushWord(c.registers.getIY()); c.incPc(2); }, 15 };

    // --- IY Exchanges ---
    registry.indexedIY[0xE3] = { [](ZilogZ80& c) { 
        uint8_t tmp = c.mmu->readAddr(c.registers.sp);
        c.mmu->writeAddr(c.registers.sp, c.registers.iyl);
        c.registers.iyl = tmp;

        tmp = c.mmu->readAddr((c.registers.sp + 1) & 0xFFFF);
        c.mmu->writeAddr((c.registers.sp + 1) & 0xFFFF, c.registers.iyh);
        c.registers.iyh = tmp;

        c.incPc(2); 
    }, 23 };
}