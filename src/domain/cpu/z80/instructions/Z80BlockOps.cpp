/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80BlockOps.cpp
 * 
 * Domain Layer: Z80 CPU Block Operations Instructions Implementation
 */

#include "Z80BlockOps.h"

void Z80BlockOps::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // ========================================================================
    // EXTENDED ED-PREFIXED SYSTEM & I/O OPERATIONS
    // ========================================================================
    registry.extended[0xA0] = { [](ZilogZ80& c) { executeLdi(c); }, 16 };
    registry.extended[0xA8] = { [](ZilogZ80& c) { executeLdd(c); }, 16 };
    registry.extended[0xB0] = { [](ZilogZ80& c) { executeLdir(c); }, 16 };
    registry.extended[0xB8] = { [](ZilogZ80& c) { executeLddr(c); }, 16 };

    registry.extended[0xA1] = { [](ZilogZ80& c) { executeCpi(c); }, 16 };
    registry.extended[0xA9] = { [](ZilogZ80& c) { executeCpd(c); }, 16 };
    registry.extended[0xB1] = { [](ZilogZ80& c) { executeCpir(c); }, 16 };
    registry.extended[0xB9] = { [](ZilogZ80& c) { executeCpdr(c); }, 16 };
}

// ========================================================================
// CORE BLOCK ALGORITHMS (1:1 PARITY WITH EMBEDDED INTEL TIMINGS)
// ========================================================================

void Z80BlockOps::executeLdi(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t de = cpu.registers.getDE();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writeAddr(de, byte);

    hl = (hl + 1) & 0xFFFF;
    de = (de + 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setDE(de);
    cpu.registers.setBC(bc);

    cpu.registers.f &= 0xC1; // Clear S, Z, H, P/V, N flags
    uint8_t testByte = (byte + cpu.registers.a) & 0xFF;

    if (bc > 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    cpu.incPc(2);
}

void Z80BlockOps::executeLdd(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t de = cpu.registers.getDE();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writeAddr(de, byte);

    hl = (hl - 1) & 0xFFFF;
    de = (de - 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setDE(de);
    cpu.registers.setBC(bc);

    cpu.registers.f &= 0xC1;
    uint8_t testByte = (byte + cpu.registers.a) & 0xFF;

    if (bc > 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    cpu.incPc(2);
}

void Z80BlockOps::executeLdir(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t de = cpu.registers.getDE();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writeAddr(de, byte);

    hl = (hl + 1) & 0xFFFF;
    de = (de + 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setDE(de);
    cpu.registers.setBC(bc);

    cpu.registers.f &= 0xC1;
    uint8_t testByte = (byte + cpu.registers.a) & 0xFF;

    if (bc > 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;

    if (bc > 0) {
        cpu.additionalCycles = 5; // Branch taken penalty
    } else {
        cpu.incPc(2);
    }
}

void Z80BlockOps::executeLddr(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t de = cpu.registers.getDE();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writeAddr(de, byte);

    hl = (hl - 1) & 0xFFFF;
    de = (de - 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setDE(de);
    cpu.registers.setBC(bc);

    cpu.registers.f &= 0xC1;
    uint8_t testByte = (byte + cpu.registers.a) & 0xFF;

    if (bc > 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;

    if (bc > 0) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}

void Z80BlockOps::executeCpi(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);

    hl = (hl + 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setBC(bc);

    uint8_t v1 = cpu.registers.a;
    uint8_t v2 = byte;
    uint8_t newValue = (v1 - v2) & 0xFF;

    cpu.registers.f &= 0x01; // Preserve C flag

    if ((v1 & 0x0F) - (v2 & 0x0F) < 0) {
        cpu.registers.f |= Z80Flags::FLAG_H;
    }

    uint8_t testByte = (v1 - v2 - ((cpu.registers.f & Z80Flags::FLAG_H) ? 1 : 0)) & 0xFF;

    cpu.registers.f |= Z80Flags::FLAG_N; // Subtraction set

    if (bc != 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;
    cpu.incPc(2);
}

void Z80BlockOps::executeCpd(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);

    hl = (hl - 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setBC(bc);

    uint8_t v1 = cpu.registers.a;
    uint8_t v2 = byte;
    uint8_t newValue = (v1 - v2) & 0xFF;

    cpu.registers.f &= 0x01;

    if ((v1 & 0x0F) - (v2 & 0x0F) < 0) {
        cpu.registers.f |= Z80Flags::FLAG_H;
    }

    uint8_t testByte = (v1 - v2 - ((cpu.registers.f & Z80Flags::FLAG_H) ? 1 : 0)) & 0xFF;

    cpu.registers.f |= Z80Flags::FLAG_N;

    if (bc != 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;
    cpu.incPc(2);
}

void Z80BlockOps::executeCpir(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);

    hl = (hl + 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setBC(bc);

    uint8_t v1 = cpu.registers.a;
    uint8_t v2 = byte;
    uint8_t newValue = (v1 - v2) & 0xFF;

    cpu.registers.f &= 0x01;

    if ((v1 & 0x0F) - (v2 & 0x0F) < 0) {
        cpu.registers.f |= Z80Flags::FLAG_H;
    }

    uint8_t testByte = (v1 - v2 - ((cpu.registers.f & Z80Flags::FLAG_H) ? 1 : 0)) & 0xFF;

    cpu.registers.f |= Z80Flags::FLAG_N;

    if (bc != 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x04) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;

    if ((bc != 0) && ((cpu.registers.f & Z80Flags::FLAG_Z) == 0)) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}

void Z80BlockOps::executeCpdr(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint16_t bc = cpu.registers.getBC();

    uint8_t byte = cpu.mmu->readAddr(hl);

    hl = (hl - 1) & 0xFFFF;
    bc = (bc - 1) & 0xFFFF;

    cpu.registers.setHL(hl);
    cpu.registers.setBC(bc);

    uint8_t v1 = cpu.registers.a;
    uint8_t v2 = byte;
    uint8_t newValue = (v1 - v2) & 0xFF;

    cpu.registers.f &= 0x01;

    if ((v1 & 0x0F) - (v2 & 0x0F) < 0) {
        cpu.registers.f |= Z80Flags::FLAG_H;
    }

    uint8_t testByte = (v1 - v2 - ((cpu.registers.f & Z80Flags::FLAG_H) ? 1 : 0)) & 0xFF;

    cpu.registers.f |= Z80Flags::FLAG_N;

    if (bc != 0) cpu.registers.f |= Z80Flags::FLAG_PV;
    if (testByte & 0x08) cpu.registers.f |= Z80Flags::FLAG_F3;
    if (testByte & 0x02) cpu.registers.f |= Z80Flags::FLAG_F5;
    if (newValue == 0) cpu.registers.f |= Z80Flags::FLAG_Z;
    if (newValue & 0x80) cpu.registers.f |= Z80Flags::FLAG_S;

    if ((bc != 0) && ((cpu.registers.f & Z80Flags::FLAG_Z) == 0)) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}