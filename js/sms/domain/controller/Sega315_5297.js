/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Sega 315-5297 Input/Output Chip
 * 
 * Emulates the physical Sega 315-5297 controller interface chip.
 * Coordinates pin-out states for standard DB-9 Gamepad ports using native 
 * active-low digital logic (low-voltage Ground reads as 0 when pressed).
 */

// General Bitmasks mapping DB-9 lines onto SMS Register Ports 0xDC and 0xDD
const SegaIOPinMask = {
    // Port Register 0xDC Bits
    PORT_1_UP:       0x01, // Bit 0: Gamepad 1 Up Direction
    PORT_1_DOWN:     0x02, // Bit 1: Gamepad 1 Down Direction
    PORT_1_LEFT:     0x04, // Bit 2: Gamepad 1 Left Direction
    PORT_1_RIGHT:    0x08, // Bit 3: Gamepad 1 Right Direction
    PORT_1_BUTTON_1: 0x10, // Bit 4: Gamepad 1 Button 1 (TL line)
    PORT_1_BUTTON_2: 0x20, // Bit 5: Gamepad 1 Button 2 (TR line)
    PORT_2_UP:       0x40, // Bit 6: Gamepad 2 Up Direction
    PORT_2_DOWN:     0x80, // Bit 7: Gamepad 2 Down Direction
    
    // Port Register 0xDD Bits
    PORT_2_LEFT:     0x01, // Bit 0: Gamepad 2 Left Direction
    PORT_2_RIGHT:    0x02, // Bit 1: Gamepad 2 Right Direction
    PORT_2_BUTTON_1: 0x04, // Bit 2: Gamepad 2 Button 1
    PORT_2_BUTTON_2: 0x08, // Bit 3: Gamepad 2 Button 2
    RESET_BUTTON:    0x10, // Bit 4: Console Soft Reset button
    EXPANSION_SLOT:  0x20, // Bit 5: Expansion slot detection
    PORT_A_TR:       0x40, // Bit 6: Port A TR state (output status)
    PORT_B_TR:       0x80  // Bit 7: Port B TR state (output status)
};

class Sega315_5297 {
    constructor() {
        // Registers default to 0xFF (VCC pull-up logic state: all inputs open)
        this.portRegisterDC = 0xff;
        this.portRegisterDD = 0xff; 
    }

    /**
     * Toggles the Ground (low-level 0) state of a Port 0xDC register pin.
     * @param {string} pinName - Name of the pin defined in SegaIOPinMask.
     * @param {boolean} isPressed - True if active-low state is triggered.
     */
    writePinStateDC(pinName, isPressed) {
        if (isPressed) {
            this.portRegisterDC &= ~SegaIOPinMask[pinName]; // Pull-down to 0 (pressed)
        } else {
            this.portRegisterDC |= SegaIOPinMask[pinName];  // Pull-up to 1 (unpressed)
        }
    }

    /**
     * Toggles the Ground (low-level 0) state of a Port 0xDD register pin.
     * @param {string} pinName - Name of the pin defined in SegaIOPinMask.
     * @param {boolean} isPressed - True if active-low state is triggered.
     */
    writePinStateDD(pinName, isPressed) {
        if (isPressed) {
            this.portRegisterDD &= ~SegaIOPinMask[pinName]; // Pull-down to 0
        } else {
            this.portRegisterDD |= SegaIOPinMask[pinName];  // Pull-up to 1
        }
    }

    /**
     * Reads register 0xDC.
     * @returns {number} 8-bit state.
     */
    readRegisterDC() {
        return this.portRegisterDC;
    }

    /**
     * Reads register 0xDD.
     * @returns {number} 8-bit state.
     */
    readRegisterDD() {
        return this.portRegisterDD;
    }

    // ========================================================================
    // GAMEPAD 1 PIN CONVENIENCE DELEGATOR METHODS
    // ========================================================================
    pressButton1()   { this.writePinStateDC('PORT_1_BUTTON_1', true); }
    depressButton1() { this.writePinStateDC('PORT_1_BUTTON_1', false); }
    pressButton2()   { this.writePinStateDC('PORT_1_BUTTON_2', true); }
    depressButton2() { this.writePinStateDC('PORT_1_BUTTON_2', false); }
    pressUp()        { this.writePinStateDC('PORT_1_UP', true); }
    depressUp()      { this.writePinStateDC('PORT_1_UP', false); }
    pressDown()      { this.writePinStateDC('PORT_1_DOWN', true); }
    depressDown()    { this.writePinStateDC('PORT_1_DOWN', false); }
    pressLeft()      { this.writePinStateDC('PORT_1_LEFT', true); }
    depressLeft()    { this.writePinStateDC('PORT_1_LEFT', false); }
    pressRight()     { this.writePinStateDC('PORT_1_RIGHT', true); }
    depressRight()   { this.writePinStateDC('PORT_1_RIGHT', false); }

    // ========================================================================
    // GAMEPAD 2 PIN CONVENIENCE DELEGATOR METHODS
    // ========================================================================
    pressButton1Player2()   { this.writePinStateDD('PORT_2_BUTTON_1', true); }
    depressButton1Player2() { this.writePinStateDD('PORT_2_BUTTON_1', false); }
    pressButton2Player2()   { this.writePinStateDD('PORT_2_BUTTON_2', true); }
    depressButton2Player2() { this.writePinStateDD('PORT_2_BUTTON_2', false); }
    pressUpPlayer2()        { this.writePinStateDC('PORT_2_UP', true); }
    depressUpPlayer2()      { this.writePinStateDC('PORT_2_UP', false); }
    pressDownPlayer2()      { this.writePinStateDC('PORT_2_DOWN', true); }
    depressDownPlayer2()    { this.writePinStateDC('PORT_2_DOWN', false); }
    pressLeftPlayer2()      { this.writePinStateDD('PORT_2_LEFT', true); }
    depressLeftPlayer2()    { this.writePinStateDD('PORT_2_LEFT', false); }
    pressRightPlayer2()     { this.writePinStateDD('PORT_2_RIGHT', true); }
    depressRightPlayer2()   { this.writePinStateDD('PORT_2_RIGHT', false); }
}