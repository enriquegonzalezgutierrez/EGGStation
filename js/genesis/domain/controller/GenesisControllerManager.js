/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Input Controllers and Multitaps
 * 
 * Emulates the multiplexing hardware of standard Sega Genesis controllers 
 * and multitap splitters. Processes active-low digital logic for Up, Down, 
 * Left, Right, A, B, C, X, Y, Z, Start, and Mode buttons depending on state strobes.
 * 
 * SOLID: Adheres to Interface Segregation (ISP) by grouping multitap variants 
 * (EA and Sega) under a unified manager while keeping individual controller 
 * polling logic completely isolated.
 */

// General standard button definitions
const GENESIS_CONTROLLER_UP     = 0;
const GENESIS_CONTROLLER_DOWN   = 1;
const GENESIS_CONTROLLER_LEFT   = 2;
const GENESIS_CONTROLLER_RIGHT  = 3;
const GENESIS_CONTROLLER_A      = 4;
const GENESIS_CONTROLLER_B      = 5;
const GENESIS_CONTROLLER_C      = 6;
const GENESIS_CONTROLLER_X      = 7;
const GENESIS_CONTROLLER_Y      = 8;
const GENESIS_CONTROLLER_Z      = 9;
const GENESIS_CONTROLLER_START  = 10;
const GENESIS_CONTROLLER_MODE   = 11;

// ========================================================================
// 1. STANDARD 3/6-BUTTON CONTROLLER CORE
// ========================================================================
class GenesisController {
    constructor() {
        this.countdown = 0; // Microsecond countdown until strobe resets (1.5ms threshold)
        this.strobes = 0;   // 6-button detection toggle pulse count
        this.thBit = 0;     // State of the physical TH pin (output/input select)
    }

    initialise() {
        this.countdown = 0;
        this.strobes = 0;
        this.thBit = 0;
    }

    /**
     * Reads the multiplexed 6-bit button data from the controller port.
     * @param {number} controllerIndex - Index of the player (0 to 3).
     * @param {Function} callback - Frontend input poller function.
     * @param {Object} userData - User context pointer.
     * @returns {number} Active-low 6-bit button state (0 = pressed).
     */
    read(controllerIndex, callback, userData) {
        // Helper to query active-low button bits: returns 0 if pressed, 1 if open
        const getButtonBit = (btn) => {
            return callback(userData, controllerIndex, btn) ? 0 : 1;
        };

        if (this.thBit !== 0) {
            // TH pin is HIGH: Read standard directions and B / C buttons
            switch (this.strobes) {
                default:
                    return (getButtonBit(GENESIS_CONTROLLER_C) << 5)
                         | (getButtonBit(GENESIS_CONTROLLER_B) << 4)
                         | (getButtonBit(GENESIS_CONTROLLER_RIGHT) << 3)
                         | (getButtonBit(GENESIS_CONTROLLER_LEFT) << 2)
                         | (getButtonBit(GENESIS_CONTROLLER_DOWN) << 1)
                         | (getButtonBit(GENESIS_CONTROLLER_UP) << 0);

                case 3:
                    // Strobe 3 HIGH: Read additional 6-button XYZ and Mode inputs
                    return (getButtonBit(GENESIS_CONTROLLER_C) << 5)
                         | (getButtonBit(GENESIS_CONTROLLER_B) << 4)
                         | (getButtonBit(GENESIS_CONTROLLER_MODE) << 3)
                         | (getButtonBit(GENESIS_CONTROLLER_X) << 2)
                         | (getButtonBit(GENESIS_CONTROLLER_Y) << 1)
                         | (getButtonBit(GENESIS_CONTROLLER_Z) << 0);
            }
        } else {
            // TH pin is LOW: Read Start and A buttons
            switch (this.strobes) {
                default:
                    return (getButtonBit(GENESIS_CONTROLLER_START) << 5)
                         | (getButtonBit(GENESIS_CONTROLLER_A) << 4)
                         | (getButtonBit(GENESIS_CONTROLLER_DOWN) << 1)
                         | (getButtonBit(GENESIS_CONTROLLER_UP) << 0);

                case 2:
                    return (getButtonBit(GENESIS_CONTROLLER_START) << 5)
                         | (getButtonBit(GENESIS_CONTROLLER_A) << 4);

                case 3:
                    // Strobe 3 LOW: Pulls up lower 4 bits to high-Z state (1s) to signal 6-button presence
                    return (getButtonBit(GENESIS_CONTROLLER_START) << 5)
                         | (getButtonBit(GENESIS_CONTROLLER_A) << 4)
                         | 0xF;
            }
        }
    }

    /**
     * Writes to the controller port to update the TH pin.
     * @param {number} value - 8-bit output byte from the Bus.
     */
    write(value) {
        const newThBit = (value & 0x40) !== 0 ? 1 : 0;

        if (newThBit !== 0 && this.thBit === 0) {
            // Increment selection strobe on rising edge of the TH pin
            this.strobes = (this.strobes + 1) % 4;
            this.countdown = 1500; // Reset watchdog timer to 1.5 milliseconds
        }

        this.thBit = newThBit;
    }

    /**
     * Steps the internal 1.5ms watchdog countdown timer.
     * If the watchdog expires, the selection strobe resets to 0.
     * @param {number} microseconds - Microseconds passed.
     */
    doMicroseconds(microseconds) {
        if (this.countdown >= microseconds) {
            this.countdown = (this.countdown - microseconds) | 0;
        } else {
            this.countdown = 0;
            this.strobes = 0; // Strobe reset (watchdog timed out)
        }
    }
}

// ========================================================================
// 2. EA 4-WAY PLAY MULTITAP SPLITTER
// ========================================================================
class GenesisMultitapEA {
    constructor() {
        this.controllers = [];
        for (let i = 0; i < 4; i++) {
            this.controllers[i] = new GenesisController();
        }
        this.selectedController = 0;
    }

    initialise() {
        for (let i = 0; i < 4; i++) {
            this.controllers[i].initialise();
        }
        this.selectedController = 0;
    }

    doMicroseconds(microseconds) {
        for (let i = 0; i < 4; i++) {
            this.controllers[i].doMicroseconds(microseconds);
        }
    }

    readPort(portIndex, microseconds, callback, userData) {
        switch (portIndex) {
            case 0:
                if (this.selectedController > 3) {
                    return 0x7C; // EA Multitap Identification signature byte
                }
                this.doMicroseconds(microseconds);
                return this.controllers[this.selectedController].read(this.selectedController, callback, userData);

            case 1:
                // Port 1 reads are unpopulated in standard EA protocols
                return 0xFF;
        }
        return 0xFF;
    }

    writePort(portIndex, microseconds, value) {
        switch (portIndex) {
            case 0:
                this.doMicroseconds(microseconds);
                this.controllers[this.selectedController].write(value);
                break;

            case 1:
                // EA Multitap controller selection register (bits 4-6)
                this.selectedController = (value >> 4) & 7;
                break;
        }
    }

    readController(controllerIndex, microseconds, callback, userData) {
        this.doMicroseconds(microseconds);
        return this.controllers[controllerIndex].read(controllerIndex, callback, userData);
    }

    writeController(controllerIndex, microseconds, value) {
        this.doMicroseconds(microseconds);
        this.controllers[controllerIndex].write(value);
    }
}

// ========================================================================
// 3. SEGA TAP MULTITAP SPLITTER
// ========================================================================
class GenesisMultitapSega {
    constructor() {
        this.thBit = 0;
        this.tlBit = 0;
        this.pulses = 0; // Number of shifted selection pulses
    }

    initialise() {
        this.thBit = 0;
        this.tlBit = 0;
        this.pulses = 0;
    }

    /**
     * Reads standard 4bpp button nibbles based on shift register indices.
     */
    getButtonNybble(callback, userData, controllerIndex, buttons) {
        const getBit = (btn) => {
            return callback(userData, controllerIndex, btn) ? 0 : 1;
        };

        let value = 0;
        for (let i = 0; i < 4; ++i) {
            value = (value << 1) | getBit(buttons[i]);
        }
        return value;
    }

    getNybble(callback, userData) {
        if (this.thBit !== 0) {
            return 3; // TH high state
        }

        switch (this.pulses) {
            case 0:
                return 0xF;

            case 1:
            case 2:
                return 0; // Standard Sega Tap signature identification

            case 3: case 4: case 5: case 6:
                return 1; // 6-button controller presence IDs

            default: {
                // Return standard 6-button mapped matrices on active shift phases
                const buttons = [
                    [GENESIS_CONTROLLER_RIGHT, GENESIS_CONTROLLER_LEFT, GENESIS_CONTROLLER_DOWN, GENESIS_CONTROLLER_UP],
                    [GENESIS_CONTROLLER_START, GENESIS_CONTROLLER_A,    GENESIS_CONTROLLER_C,    GENESIS_CONTROLLER_B],
                    [GENESIS_CONTROLLER_MODE,  GENESIS_CONTROLLER_X,    GENESIS_CONTROLLER_Y,    GENESIS_CONTROLLER_Z]
                ];

                const buttonIndex = (this.pulses - 7) % 3;
                const controllerIndex = Math.floor((this.pulses - 7) / 3);

                if (controllerIndex < 4) {
                    return this.getButtonNybble(callback, userData, controllerIndex, buttons[buttonIndex]);
                }
                break;
            }
        }

        return 0xF;
    }

    read(callback, userData) {
        return (this.tlBit << 4) | this.getNybble(callback, userData);
    }

    write(value) {
        const newTlBit = (value & 0x20) !== 0 ? 1 : 0;
        const newThBit = (value & 0x40) !== 0 ? 1 : 0;

        if (this.tlBit !== newTlBit) {
            this.tlBit = newTlBit;
            this.pulses++; // Toggle shift register on TL pin transition
        }

        if (this.thBit !== newThBit) {
            this.thBit = newThBit;
            this.pulses = 0; // Reset shift registers on TH transition
        }
    }
}

// ========================================================================
// 4. UNIFIED CONTROLLERS MANAGER
// ========================================================================
const GENESIS_CONTROLLER_PROTOCOL_STANDARD     = 0;
const GENESIS_CONTROLLER_PROTOCOL_SEGA_TAP     = 1;
const GENESIS_CONTROLLER_PROTOCOL_EA_MULTITAP = 2;

class GenesisControllerManager {
    constructor() {
        this.protocol = GENESIS_CONTROLLER_PROTOCOL_STANDARD;

        this.eaMultitap = new GenesisMultitapEA();
        this.segaMultitaps = [new GenesisMultitapSega(), new GenesisMultitapSega()];
    }

    initialise() {
        this.eaMultitap.initialise();
        this.segaMultitaps[0].initialise();
        this.segaMultitaps[1].initialise();
    }

    /**
     * Reads a byte from the target controller port.
     * @param {number} portIndex - Port index (0 = Port A, 1 = Port B).
     * @param {number} microseconds - CPU microsecond step timers.
     * @param {Function} callback - Input poller callback.
     * @param {Object} userData - User context pointer.
     * @returns {number} 8-bit port readout.
     */
    read(portIndex, microseconds, callback, userData) {
        portIndex = portIndex & 1;

        switch (this.protocol) {
            case GENESIS_CONTROLLER_PROTOCOL_STANDARD:
                return this.eaMultitap.readController(portIndex, microseconds, callback, userData);

            case GENESIS_CONTROLLER_PROTOCOL_EA_MULTITAP:
                return this.eaMultitap.readPort(portIndex, microseconds, callback, userData);

            case GENESIS_CONTROLLER_PROTOCOL_SEGA_TAP:
                return this.segaMultitaps[portIndex].read(callback, userData);
        }

        return 0xFF;
    }

    /**
     * Writes a byte to the target controller port.
     * @param {number} portIndex - Port index (0 = Port A, 1 = Port B).
     * @param {number} microseconds - CPU microsecond step timers.
     * @param {number} value - 8-bit data written from the Bus.
     */
    write(portIndex, microseconds, value) {
        portIndex = portIndex & 1;

        switch (this.protocol) {
            case GENESIS_CONTROLLER_PROTOCOL_STANDARD:
                this.eaMultitap.writeController(portIndex, microseconds, value);
                break;

            case GENESIS_CONTROLLER_PROTOCOL_EA_MULTITAP:
                this.eaMultitap.writePort(portIndex, microseconds, value);
                break;

            case GENESIS_CONTROLLER_PROTOCOL_SEGA_TAP:
                this.segaMultitaps[portIndex].write(value);
                break;
        }
    }
}