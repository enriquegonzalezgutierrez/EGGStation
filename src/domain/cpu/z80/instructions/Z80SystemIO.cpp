/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/instructions/Z80SystemIO.cpp
 * 
 * Domain Layer: Z80 CPU System and I/O Instructions Implementation
 */

#include "Z80SystemIO.h"

void Z80SystemIO::registerInstructions(ZilogZ80& cpu, Z80OpcodeRegistry& registry) {

    // ========================================================================
    // 1. STANDARD UNPREFIXED SYSTEM & I/O OPERATIONS
    // ========================================================================

    // --- System Control ---
    registry.standard[0x00] = { [](ZilogZ80& c) { c.incPc(1); }, 4 };
    
    registry.standard[0x76] = { [](ZilogZ80& c) { c.isHalted = true; }, 4 };

    registry.standard[0xF3] = { [](ZilogZ80& c) { 
        c.registers.iff1 = 0; 
        c.registers.iff2 = 0; 
        c.maskableInterruptsEnabled = false; 
        c.incPc(1); 
    }, 4 };

    registry.standard[0xFB] = { [](ZilogZ80& c) { 
        c.m_bAfterEI = true; 
        c.registers.iff1 = 1; 
        c.registers.iff2 = 1; 
        c.maskableInterruptsEnabled = true; 
        c.incPc(1); 
    }, 4 };

    // --- Simple Port I/O ---
    registry.standard[0xD3] = { [](ZilogZ80& c) { 
        uint8_t port = c.mmu->readAddr(c.registers.pc + 1); 
        c.mmu->writePort(port, c.registers.a); 
        c.incPc(2); 
    }, 11 };

    registry.standard[0xDB] = { [](ZilogZ80& c) { 
        uint8_t port = c.mmu->readAddr(c.registers.pc + 1); 
        c.registers.a = c.mmu->readPort(port); 
        c.incPc(2); 
    }, 11 };


    // ========================================================================
    // 2. EXTENDED ED-PREFIXED SYSTEM & I/O OPERATIONS
    // ========================================================================

    // --- Extended Port Inputs ---
    registry.extended[0x40] = { [](ZilogZ80& c) {
        c.registers.b = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.b & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.b == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.b)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x48] = { [](ZilogZ80& c) {
        c.registers.c = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.c & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.c == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.c)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x50] = { [](ZilogZ80& c) {
        c.registers.d = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.d & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.d == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.d)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x58] = { [](ZilogZ80& c) {
        c.registers.e = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.e & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.e == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.e)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x60] = { [](ZilogZ80& c) {
        c.registers.h = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.h & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.h == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.h)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x68] = { [](ZilogZ80& c) {
        c.registers.l = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.l & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.l == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.l)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x70] = { [](ZilogZ80& c) {
        uint8_t byte = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((byte & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (byte == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(byte)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    registry.extended[0x78] = { [](ZilogZ80& c) {
        c.registers.a = c.mmu->readPort(c.registers.c);
        c.registers.f &= ~Z80Flags::FLAG_N;
        c.registers.f &= ~Z80Flags::FLAG_H;
        if ((c.registers.a & 0x80) != 0) c.registers.f |= Z80Flags::FLAG_S;
        else c.registers.f &= ~Z80Flags::FLAG_S;
        if (c.registers.a == 0) c.registers.f |= Z80Flags::FLAG_Z;
        else c.registers.f &= ~Z80Flags::FLAG_Z;
        if (c.alu.getParity(c.registers.a)) c.registers.f |= Z80Flags::FLAG_PV;
        else c.registers.f &= ~Z80Flags::FLAG_PV;
        c.incPc(2);
    }, 12 };

    // --- Extended Port Outputs ---
    registry.extended[0x41] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.b); c.incPc(2); }, 12 };
    registry.extended[0x51] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.d); c.incPc(2); }, 12 };
    registry.extended[0x59] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.e); c.incPc(2); }, 12 };
    registry.extended[0x61] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.h); c.incPc(2); }, 12 };
    registry.extended[0x69] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.l); c.incPc(2); }, 12 };
    registry.extended[0x71] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, 0); c.incPc(2); }, 12 };
    registry.extended[0x79] = { [](ZilogZ80& c) { c.mmu->writePort(c.registers.c, c.registers.a); c.incPc(2); }, 12 };

    // --- Interrupt Mode ---
    registry.extended[0x56] = { [](ZilogZ80& c) { c.interruptMode = 1; c.incPc(2); }, 8 };

    // --- Block Port I/O Operations ---
    registry.extended[0xA2] = { [](ZilogZ80& c) { executeIni(c); }, 16 };
    registry.extended[0xA3] = { [](ZilogZ80& c) { executeOuti(c); }, 16 };
    registry.extended[0xAB] = { [](ZilogZ80& c) { executeOutd(c); }, 16 };
    
    registry.extended[0xB2] = { [](ZilogZ80& c) { executeInir(c); }, 16 };
    registry.extended[0xB3] = { [](ZilogZ80& c) { executeOtir(c); }, 16 };
    registry.extended[0xBB] = { [](ZilogZ80& c) { executeOtdr(c); }, 16 };
}

// ========================================================================
// CORE SYSTEM I/O ALGORITHMS
// ========================================================================

void Z80SystemIO::executeIni(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();

    uint8_t byte = cpu.mmu->readPort(cpu.registers.c);
    cpu.mmu->writeAddr(hl, byte);

    hl = (hl + 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    if (byte & 0x80) cpu.registers.f |= Z80Flags::FLAG_N;
    else cpu.registers.f &= ~Z80Flags::FLAG_N;

    if ((byte + ((cpu.registers.c + 1) & 0xFF)) > 0xFF) {
        cpu.registers.f |= Z80Flags::FLAG_C;
        cpu.registers.f |= Z80Flags::FLAG_H;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_C;
        cpu.registers.f &= ~Z80Flags::FLAG_H;
    }

    if (cpu.alu.getParity((((byte + ((cpu.registers.c + 1) & 0xFF)) & 0x07) ^ cpu.registers.b))) {
        cpu.registers.f |= Z80Flags::FLAG_PV;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_PV;        
    }
    cpu.incPc(2);
}

void Z80SystemIO::executeInir(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();

    uint8_t byte = cpu.mmu->readPort(cpu.registers.c);
    cpu.mmu->writeAddr(hl, byte);

    hl = (hl + 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    if (cpu.registers.b > 0) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}

void Z80SystemIO::executeOuti(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writePort(cpu.registers.c, byte);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    hl = (hl + 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    if (byte & 0x80) cpu.registers.f |= Z80Flags::FLAG_N;
    else cpu.registers.f &= ~Z80Flags::FLAG_N;

    if ((cpu.registers.l + byte) > 0xFF) {
        cpu.registers.f |= Z80Flags::FLAG_C;
        cpu.registers.f |= Z80Flags::FLAG_H;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_C;
        cpu.registers.f &= ~Z80Flags::FLAG_H;
    }

    if (cpu.alu.getParity((((cpu.registers.l + byte) & 0x07) ^ cpu.registers.b))) {
        cpu.registers.f |= Z80Flags::FLAG_PV;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_PV;
    }
    cpu.incPc(2);
}

void Z80SystemIO::executeOtir(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();
    uint8_t valwritten = cpu.mmu->readAddr(hl);
    cpu.mmu->writePort(cpu.registers.c, valwritten);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    hl = (hl + 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    if (valwritten & 0x80) cpu.registers.f |= Z80Flags::FLAG_N;
    else cpu.registers.f &= ~Z80Flags::FLAG_N;

    if ((cpu.registers.l + valwritten) > 0xFF) {
        cpu.registers.f |= Z80Flags::FLAG_C;
        cpu.registers.f |= Z80Flags::FLAG_H;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_C;
        cpu.registers.f &= ~Z80Flags::FLAG_H;
    }

    if (cpu.alu.getParity((((cpu.registers.l + valwritten) & 0x07) ^ cpu.registers.b))) {
        cpu.registers.f |= Z80Flags::FLAG_PV;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_PV;
    }

    if (cpu.registers.b != 0) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}

void Z80SystemIO::executeOutd(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writePort(cpu.registers.c, byte);

    hl = (hl - 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    if (byte & 0x80) cpu.registers.f |= Z80Flags::FLAG_N;
    else cpu.registers.f &= ~Z80Flags::FLAG_N;

    if ((cpu.registers.l + byte) > 0xFF) {
        cpu.registers.f |= Z80Flags::FLAG_C;
        cpu.registers.f |= Z80Flags::FLAG_H;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_C;
        cpu.registers.f &= ~Z80Flags::FLAG_H;
    }

    if (cpu.alu.getParity((((cpu.registers.l + byte) & 0x07) ^ cpu.registers.b))) {
        cpu.registers.f |= Z80Flags::FLAG_PV;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_PV;
    }
    cpu.incPc(2);
}

void Z80SystemIO::executeOtdr(ZilogZ80& cpu) {
    uint16_t hl = cpu.registers.getHL();

    uint8_t byte = cpu.mmu->readAddr(hl);
    cpu.mmu->writePort(cpu.registers.c, byte);

    hl = (hl - 1) & 0xFFFF;
    cpu.registers.setHL(hl);

    cpu.registers.b = cpu.alu.dec_8bit(cpu.registers, cpu.registers.b);

    if (byte & 0x80) cpu.registers.f |= Z80Flags::FLAG_N;
    else cpu.registers.f &= ~Z80Flags::FLAG_N;

    if ((cpu.registers.l + byte) > 0xFF) {
        cpu.registers.f |= Z80Flags::FLAG_C;
        cpu.registers.f |= Z80Flags::FLAG_H;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_C;
        cpu.registers.f &= ~Z80Flags::FLAG_H;
    }

    if (cpu.alu.getParity((((cpu.registers.l + byte) & 0x07) ^ cpu.registers.b))) {
        cpu.registers.f |= Z80Flags::FLAG_PV;
    } else {
        cpu.registers.f &= ~Z80Flags::FLAG_PV;
    }

    if (cpu.registers.b != 0) {
        cpu.additionalCycles = 5;
    } else {
        cpu.incPc(2);
    }
}