/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega315_5297
 * 
 * Emulates the physical Sega 315-5297 input/output controller chip.
 * It coordinates the DB-9 input pin active-low states, which drop to 0 volts (ground)
 * when a directional key or button is pressed, mirroring the real hardware behavior.
 */

// Hardware bitmasks representing each pin on Controller Port 1 and Port 2
const SEGA_IO_PIN_MASK = {
    PORT_1_UP:       0x01, // Bit 0: Up directional switch (Port 1)
    PORT_1_DOWN:     0x02, // Bit 1: Down directional switch (Port 1)
    PORT_1_LEFT:     0x04, // Bit 2: Left directional switch (Port 1)
    PORT_1_RIGHT:    0x08, // Bit 3: Right directional switch (Port 1)
    PORT_1_BUTTON_1: 0x10, // Bit 4: Button 1 / Fire 1 (Port 1 - TL line)
    PORT_1_BUTTON_2: 0x20, // Bit 5: Button 2 / Fire 2 (Port 1 - TR line)
    PORT_2_UP:       0x40, // Bit 6: Up directional switch (Port 2)
    PORT_2_DOWN:     0x80  // Bit 7: Down directional switch (Port 2)
};

class Sega315_5297 {
    constructor() {
        // Internal state registers default to 0xFF (VCC pull-up logic, inactive state)
        this.portRegisterDC = 0xff;
        this.portRegisterDD = 0xff; 
    }

    /**
     * Toggles the low-voltage ground state of a DB-9 register pin.
     * @param {string} pinName - Name of the pin defined in SEGA_IO_PIN_MASK.
     * @param {boolean} isPressed - True if active-low state is triggered (0V/Ground).
     */
    writePinState(pinName, isPressed) {
        if (isPressed) {
            this.portRegisterDC &= ~SEGA_IO_PIN_MASK[pinName]; // Drop to low-level (0)
        } else {
            this.portRegisterDC |= SEGA_IO_PIN_MASK[pinName];  // Return to pull-up (1)
        }
    }

    /**
     * Reads register 0xDC (exposes Port 1 buttons and partial Port 2 directionals).
     * @returns {number} 8-bit state.
     */
    readRegisterDC() {
        return this.portRegisterDC;
    }

    /**
     * Reads register 0xDD (exposes Port 2 buttons and system configuration switches).
     * @returns {number} 8-bit state.
     */
    readRegisterDD() {
        return this.portRegisterDD;
    }

    // ========================================================================
    // SEGA GAMEPAD DELEGATE INPUT INTERFACE
    // ========================================================================
    pressButton1()   { this.writePinState('PORT_1_BUTTON_1', true); }
    depressButton1() { this.writePinState('PORT_1_BUTTON_1', false); }
    pressButton2()   { this.writePinState('PORT_1_BUTTON_2', true); }
    depressButton2() { this.writePinState('PORT_1_BUTTON_2', false); }
    pressUp()        { this.writePinState('PORT_1_UP', true); }
    depressUp()      { this.writePinState('PORT_1_UP', false); }
    pressDown()      { this.writePinState('PORT_1_DOWN', true); }
    depressDown()    { this.writePinState('PORT_1_DOWN', false); }
    pressLeft()      { this.writePinState('PORT_1_LEFT', true); }
    depressLeft()    { this.writePinState('PORT_1_LEFT', false); }
    pressRight()     { this.writePinState('PORT_1_RIGHT', true); }
    depressRight()   { this.writePinState('PORT_1_RIGHT', false); }
}