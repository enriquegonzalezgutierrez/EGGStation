/* 
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega 315-5297 I/O Controller Chip
 * 
 * Emulates the physical Sega 315-5297 input/output chip used in the Master System.
 * It manages the active-low voltage states of the DB-9 Controller Ports, exposing
 * them through virtual hardware registers mapped to I/O ports 0xDC and 0xDD.
 */

// Hardware active-low pin bitmasks for DB-9 Controller Port 1 (mapped to Port 0xDC)
const SEGA_IO_PIN_MASK = {
    PORT_1_UP:       0x01, // Bit 0: Controller Port 1 Up
    PORT_1_DOWN:     0x02, // Bit 1: Controller Port 1 Down
    PORT_1_LEFT:     0x04, // Bit 2: Controller Port 1 Left
    PORT_1_RIGHT:    0x08, // Bit 3: Controller Port 1 Right
    PORT_1_BUTTON_1: 0x10, // Bit 4: Controller Port 1 Button 1 / TL (Active-Low)
    PORT_1_BUTTON_2: 0x20, // Bit 5: Controller Port 1 Button 2 / TR (Active-Low)
    PORT_2_UP:       0x40, // Bit 6: Controller Port 2 Up
    PORT_2_DOWN:     0x80  // Bit 7: Controller Port 2 Down
};

class Sega315_5297 {
    constructor() {
        // Registers initialize to 0xFF (pull-up resistors mean 5V/Inactive when no buttons are pressed)
        this.portRegDC = 0xff;
        this.portRegDD = 0xff; 
    }

    /**
     * Set state of a physical pin on the controller ports.
     * Emulates active-low logic: pressing a button grounds the pin (voltage drops to 0).
     */
    writePinState(pin, isPressed) {
        if (isPressed) {
            this.portRegDC &= ~SEGA_IO_PIN_MASK[pin]; // Drop voltage to 0 (Active)
        } else {
            this.portRegDC |= SEGA_IO_PIN_MASK[pin];  // Pull-up to 1 (Inactive)
        }
    }

    /**
     * Reads register 0xDC (Port A/B inputs)
     */
    readRegisterDC() {
        return this.portRegDC;
    }

    /**
     * Reads register 0xDD (Port B / Misc inputs)
     */
    readRegisterDD() {
        return this.portRegDD;
    }

    // ------------------------------------------------------------------------
    // BACKWARD COMPATIBILITY ALIASES (For browser keyboard handlers)
    // ------------------------------------------------------------------------
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