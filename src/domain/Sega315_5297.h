/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: src/domain/Sega315_5297.h
 * 
 * Domain Layer: Sega 315-5297 Input/Output Chip
 * 
 * Role:
 * Pure C++ Domain Entity representing the Sega 315-5297 controller interface chip.
 * It handles the active-low digital logic for the DB-9 Gamepad ports (DC and DD registers).
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively defines the state and bit-masking
 *   logic of the two I/O ports. It has no knowledge of memory buses or host input devices.
 * - Interface Segregation Principle (ISP): Exposes minimal, targeted methods to read/write 
 *   specific pin masks without exposing internal bit manipulation directly.
 */

#ifndef SEGA_315_5297_H
#define SEGA_315_5297_H

#include <stdint.h>

class Sega315_5297 {
private:
    // Port 0xDC (Joypad 1 & Joypad 2 Up/Down)
    uint8_t portRegisterDC;
    
    // Port 0xDD (Joypad 2 Buttons & System State)
    uint8_t portRegisterDD;

public:
    Sega315_5297();
    ~Sega315_5297() = default;

    /**
     * Resets the I/O ports to their default cold-boot states.
     * Default state is 0xFF (VCC pull-up logic state: all inputs open/unpressed).
     */
    void initialize();
    
    /**
     * Toggles the Ground (low-level 0) state of a Port 0xDC register pin.
     * In active-low logic, pressing a button pulls the voltage down to 0.
     * 
     * @param mask The 8-bit mask of the target pin (e.g., 0x01 for UP).
     * @param isPressed True if the button is physically pressed.
     */
    void writePinStateDC(uint8_t mask, bool isPressed);
    
    /**
     * Toggles the Ground (low-level 0) state of a Port 0xDD register pin.
     * 
     * @param mask The 8-bit mask of the target pin.
     * @param isPressed True if the button is physically pressed.
     */
    void writePinStateDD(uint8_t mask, bool isPressed);
    
    /**
     * Reads the current multiplexed state of Port 0xDC.
     * 
     * @return 8-bit state of the port.
     */
    uint8_t readRegisterDC() const;
    
    /**
     * Reads the current multiplexed state of Port 0xDD.
     * 
     * @return 8-bit state of the port.
     */
    uint8_t readRegisterDD() const;

    /**
     * Domain State Restorer (For Temporal Physics / Savestates).
     * Allows the emulator to instantly reconstruct the exact hardware 
     * pin-out state during a real-time rewind operation.
     * 
     * @param dc The saved state of Port DC.
     * @param dd The saved state of Port DD.
     */
    void restoreState(uint8_t dc, uint8_t dd);
};

#endif // SEGA_315_5297_H