/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/domain/controller/Sega315_5297.js
 * 
 * Infrastructure Layer: Sega 315-5297 WebAssembly Bridge Adapter
 * 
 * Role:
 * Implements the Adapter Pattern to wrap the compiled C++ WebAssembly module.
 * Exposes the exact same public interface as the legacy JavaScript class, 
 * allowing seamless drop-in integration with zero changes to any Orchestrator loops.
 * 
 * SOLID Principles Applied:
 * - Liskov Substitution Principle (LSP): Fully interchangeable with the original 
 *   JS implementation. It provides the same delegator methods (pressUp, depressUp, etc.).
 * - Single Responsibility Principle (SRP): Handles only the asynchronous loading 
 *   of the Wasm binary and routes function calls. It provides a safety fallback state
 *   to prevent crashes if a user presses a button before the Wasm payload finishes loading.
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
        this.wasmInstance = null;
        this.isInitialized = false;

        // Safety fallback properties.
        // Used to queue and simulate hardware state if the user presses a button 
        // during the ~50ms window before Emscripten finishes compiling the module.
        this.fallbackDC = 0xff;
        this.fallbackDD = 0xff;

        // Asynchronously load the modularized Emscripten WebAssembly output
        if (typeof SegaIOWasm !== 'undefined') {
            SegaIOWasm().then(instance => {
                this.wasmInstance = instance;
                this.wasmInstance._io_init();
                
                // Sync any buttons pressed during the loading phase down to C++
                this.wasmInstance._io_restore_state(this.fallbackDC, this.fallbackDD);
                
                this.isInitialized = true;
                console.log("[EGGStation::Wasm] Sega 315-5297 I/O module linked successfully.");
            });
        } else {
            console.error("[EGGStation::Wasm] Fatal: SegaIOWasm loader is not defined in the global scope.");
        }
    }

    /**
     * Routes Port DC state changes to WebAssembly.
     * @param {string} pinName - Name of the pin defined in SegaIOPinMask.
     * @param {boolean} isPressed - True if active-low state is triggered.
     */
    writePinStateDC(pinName, isPressed) {
        if (this.isInitialized) {
            this.wasmInstance._io_write_pin_dc(SegaIOPinMask[pinName], isPressed);
        } else {
            if (isPressed) this.fallbackDC &= ~SegaIOPinMask[pinName];
            else this.fallbackDC |= SegaIOPinMask[pinName];
        }
    }

    /**
     * Routes Port DD state changes to WebAssembly.
     * @param {string} pinName - Name of the pin defined in SegaIOPinMask.
     * @param {boolean} isPressed - True if active-low state is triggered.
     */
    writePinStateDD(pinName, isPressed) {
        if (this.isInitialized) {
            this.wasmInstance._io_write_pin_dd(SegaIOPinMask[pinName], isPressed);
        } else {
            if (isPressed) this.fallbackDD &= ~SegaIOPinMask[pinName];
            else this.fallbackDD |= SegaIOPinMask[pinName];
        }
    }

    /**
     * Reads register 0xDC from WebAssembly.
     * @returns {number} 8-bit state.
     */
    readRegisterDC() {
        return this.isInitialized ? this.wasmInstance._io_read_dc() : this.fallbackDC;
    }

    /**
     * Reads register 0xDD from WebAssembly.
     * @returns {number} 8-bit state.
     */
    readRegisterDD() {
        return this.isInitialized ? this.wasmInstance._io_read_dd() : this.fallbackDD;
    }

    /**
     * Used by the Temporal Physics engine to sync rewind states instantly.
     */
    syncFromRewind(dc, dd) {
        if (this.isInitialized) {
            this.wasmInstance._io_restore_state(dc, dd);
        } else {
            this.fallbackDC = dc;
            this.fallbackDD = dd;
        }
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