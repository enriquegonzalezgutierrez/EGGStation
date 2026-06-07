/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/Sega315_5297.cpp
 * 
 * Domain Layer: Sega 315-5297 Input/Output Chip
 * 
 * Role:
 * Implementation of the Sega 315-5297 controller interface chip.
 * Processes the raw bitwise operations required to emulate physical active-low 
 * electrical circuits, keeping this mathematical logic entirely isolated 
 * from the JavaScript execution environment.
 */

#include "Sega315_5297.h"

Sega315_5297::Sega315_5297() {
    initialize();
}

void Sega315_5297::initialize() {
    // By default, the physical hardware utilizes VCC pull-up resistors.
    // Therefore, open circuits (unpressed buttons) are read as logical 1s (0xFF).
    portRegisterDC = 0xFF;
    portRegisterDD = 0xFF;
}

void Sega315_5297::writePinStateDC(uint8_t mask, bool isPressed) {
    if (isPressed) {
        // Active-low logic: Pressing a button pulls the pin down to Ground (0)
        portRegisterDC &= ~mask; 
    } else {
        // Releasing the button allows the pull-up resistor to pull it back high (1)
        portRegisterDC |= mask;  
    }
}

void Sega315_5297::writePinStateDD(uint8_t mask, bool isPressed) {
    if (isPressed) {
        portRegisterDD &= ~mask;
    } else {
        portRegisterDD |= mask;
    }
}

uint8_t Sega315_5297::readRegisterDC() const {
    return portRegisterDC;
}

uint8_t Sega315_5297::readRegisterDD() const {
    return portRegisterDD;
}

void Sega315_5297::restoreState(uint8_t dc, uint8_t dd) {
    portRegisterDC = dc;
    portRegisterDD = dd;
}