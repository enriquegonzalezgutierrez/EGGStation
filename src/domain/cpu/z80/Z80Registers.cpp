/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/Z80Registers.cpp
 * 
 * Domain Layer: Z80 CPU Registers Model
 * 
 * Role:
 * Implementation of the Z80 CPU registers state management.
 * Handles initialization and the atomic register exchange routines.
 */

#include "Z80Registers.h"

Z80Registers::Z80Registers() {
    reset();
}

void Z80Registers::reset() {
    // Primary 8-bit registers
    a = 0;
    b = 0;
    c = 0;
    d = 0;
    e = 0;
    h = 0;
    l = 0;
    f = 0x40; // Initialized with the Zero Flag set by default

    // 16-bit index registers halves
    ixh = 0xFF;
    ixl = 0xFF;
    iyh = 0xFF;
    iyl = 0xFF;

    // Special purpose registers
    pc = 0;
    sp = 0xDFF0; // Typically targets RAM limits at boot
    r = 0;
    i = 0;
    
    iff1 = 0;
    iff2 = 0;

    // Shadow / Alternate registers
    shadow.a = 0;
    shadow.b = 0;
    shadow.c = 0;
    shadow.d = 0;
    shadow.e = 0;
    shadow.h = 0;
    shadow.l = 0;
    shadow.f = 0;
}

void Z80Registers::exchangeAF() {
    uint8_t tempA = a;
    uint8_t tempF = f;

    a = shadow.a;
    f = shadow.f;

    shadow.a = tempA;
    shadow.f = tempF;
}

void Z80Registers::exchangeBC_DE_HL() {
    uint8_t tempB = b;
    uint8_t tempC = c;
    uint8_t tempD = d;
    uint8_t tempE = e;
    uint8_t tempH = h;
    uint8_t tempL = l;

    b = shadow.b;
    c = shadow.c;
    d = shadow.d;
    e = shadow.e;
    h = shadow.h;
    l = shadow.l;

    shadow.b = tempB;
    shadow.c = tempC;
    shadow.d = tempD;
    shadow.e = tempE;
    shadow.h = tempH;
    shadow.l = tempL;
}

void Z80Registers::exchangeDE_HL() {
    uint8_t tempD = d;
    uint8_t tempE = e;

    d = h;
    e = l;

    h = tempD;
    l = tempE;
}