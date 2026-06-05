/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/UniversalInputManager.js
 * 
 * Role:
 * Presentation Layer: Universal Input Manager Service.
 * Centralizes keyboard event listeners, polls the HTML5 Gamepad API (gamepads), 
 * handles analog deadzones, and normalizes input triggers into a clean semantic 
 * virtual button map.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for capturing, 
 *    monitoring, and translating physical inputs into generic semantic buttons. 
 *    It contains no knowledge of emulator register structures or execution loops.
 * 2. Open/Closed Principle (OCP): New keyboard configurations or custom gamepad 
 *    mappings can be registered in the mapping dictionary without modifying 
 *    the core event capture loops.
 * 3. Liskov Substitution Principle (LSP): Offers a clean, standardized read interface 
 *    (isPressed) that can be easily mocked or replaced for unit tests or automated macros.
 * 4. Interface Segregation Principle (ISP): Exposes only essential read-only button 
 *    states to client UIControllers, keeping the API minimal and targeted.
 * 5. Dependency Inversion Principle (DIP): UIControllers depend on this high-level 
 *    input abstraction rather than directly binding low-level DOM keyboard listeners 
 *    or hardcoding raw controller hardware offsets.
 */

class UniversalInputManager {
    constructor() {
        // Semantic Button Map (Normalized virtual controller standard)
        this.virtualButtons = {
            UP: false,     DOWN: false,   LEFT: false,   RIGHT: false,
            A: false,      B: false,      X: false,      Y: false,
            L: false,      R: false,
            START: false,  SELECT: false,
            REWIND: false, FAST_FORWARD: false // Emulator actions
        };

        // Keyboard to Semantic Button Map Configuration
        this.keyboardConfig = {
            "ArrowUp":    "UP",     "Up":        "UP",
            "ArrowDown":  "DOWN",   "Down":      "DOWN",
            "ArrowLeft":  "LEFT",   "Left":      "LEFT",
            "ArrowRight": "RIGHT",  "Right":     "RIGHT",
            "z":          "B",      "Z":         "B",      // SMS Fire 1 / Genesis B / SNES B
            "x":          "A",      "X":         "A",      // SMS Fire 2 / Genesis C / SNES A
            "a":          "Y",      "A":         "Y",      // Genesis X / SNES Y
            "s":          "X",      "S":         "X",      // Genesis Y / SNES X
            "d":          "L",      "D":         "L",      // Genesis Z / SNES L
            "c":          "R",      "C":         "R",      // SNES R
            "Enter":      "START",
            "Shift":      "SELECT",
            "Backspace":  "REWIND",
            "\\":         "FAST_FORWARD"
        };

        // Cache for keyboard states
        this.keysActive = {};

        // Active Gamepad state cache
        this.gamepadActive = null;
        this.DEADZONE = 0.5;

        this.bindKeyboardEvents();
        this.bindGamepadConnectionEvents();
        this.pollGamepadsLoop();
    }

    /**
     * Binds native DOM keyboard listeners to track raw key states.
     */
    bindKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            this.keysActive[e.key] = true;
            this.updateKeyboardState();
            
            // Prevent standard browser scrolling behavior on gaming-related keys
            const keysToBlock = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Up", "Down", "Left", "Right", " "];
            if (keysToBlock.includes(e.key)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keysActive[e.key] = false;
            this.updateKeyboardState();
        });
    }

    /**
     * Translates active keyboard states to our generic semantic button states.
     */
    updateKeyboardState() {
        // Reset all keyboard mapped states first
        for (const semanticKey of Object.values(this.keyboardConfig)) {
            this.virtualButtons[semanticKey] = false;
        }

        // Apply active keyboard presses to our semantic map
        for (const [key, semanticKey] of Object.entries(this.keyboardConfig)) {
            if (this.keysActive[key] === true) {
                this.virtualButtons[semanticKey] = true;
            }
        }
    }

    /**
     * Sets up hardware connection triggers to detect Gamepads.
     */
    bindGamepadConnectionEvents() {
        window.addEventListener("gamepadconnected", (e) => {
            console.log(`[UniversalInputManager] Gamepad connected: [${e.gamepad.id}]`);
            this.showNotification(`Controller detected: ${e.gamepad.id.substring(0, 24)}...`);
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            console.log(`[UniversalInputManager] Gamepad disconnected: [${e.gamepad.id}]`);
            this.showNotification(`Controller disconnected: ${e.gamepad.id.substring(0, 24)}...`);
            this.gamepadActive = null;
        });
    }

    /**
     * Continuous loop using RequestAnimationFrame to poll the Gamepad API.
     */
    pollGamepadsLoop() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let activeGp = null;

        // Fetch the first active connected gamepad
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                activeGp = gamepads[i];
                break;
            }
        }

        if (activeGp) {
            this.gamepadActive = activeGp;
            
            const leftStickH = activeGp.axes[0] || 0;
            const leftStickV = activeGp.axes[1] || 0;
            const dpadAxisH  = activeGp.axes[4] || activeGp.axes[6] || activeGp.axes[2] || 0;
            const dpadAxisV  = activeGp.axes[5] || activeGp.axes[7] || activeGp.axes[3] || 0;

            // 1. Map Directions (DPad, Left Analog Stick and alternative axes)
            const up    = activeGp.buttons[12]?.pressed || leftStickV < -this.DEADZONE || dpadAxisV < -this.DEADZONE;
            const down  = activeGp.buttons[13]?.pressed || leftStickV > this.DEADZONE  || dpadAxisV > this.DEADZONE;
            const left  = activeGp.buttons[14]?.pressed || leftStickH < -this.DEADZONE || dpadAxisH < -this.DEADZONE;
            const right = activeGp.buttons[15]?.pressed || leftStickH > this.DEADZONE  || dpadAxisH > this.DEADZONE;

            // 2. Map Actions (B, Y, X, A mapping configurations)
            const b = activeGp.buttons[0]?.pressed === true; // South button (Cross)
            const a = activeGp.buttons[1]?.pressed === true; // East button  (Circle)
            const y = activeGp.buttons[2]?.pressed === true; // West button  (Square)
            const x = activeGp.buttons[3]?.pressed === true; // North button (Triangle)

            const l = activeGp.buttons[4]?.pressed === true; // Left shoulder trigger
            const r = activeGp.buttons[5]?.pressed === true; // Right shoulder trigger

            const select = activeGp.buttons[8]?.pressed === true; // Select / Back button
            const start  = activeGp.buttons[9]?.pressed === true; // Start button

            // Rewind (Left trigger) and Fast Forward (Right trigger)
            const rewind = activeGp.buttons[6]?.pressed === true; 
            const fastForward = activeGp.buttons[7]?.pressed === true;

            // Merge Gamepad states over existing keyboard states (Keyboard OR Gamepad)
            this.virtualButtons["UP"]     = this.virtualButtons["UP"]     || up;
            this.virtualButtons["DOWN"]   = this.virtualButtons["DOWN"]   || down;
            this.virtualButtons["LEFT"]   = this.virtualButtons["LEFT"]   || left;
            this.virtualButtons["RIGHT"]  = this.virtualButtons["RIGHT"]  || right;
            this.virtualButtons["B"]      = this.virtualButtons["B"]      || b;
            this.virtualButtons["A"]      = this.virtualButtons["A"]      || a;
            this.virtualButtons["Y"]      = this.virtualButtons["Y"]      || y;
            this.virtualButtons["X"]      = this.virtualButtons["X"]      || x;
            this.virtualButtons["L"]      = this.virtualButtons["L"]      || l;
            this.virtualButtons["R"]      = this.virtualButtons["R"]      || r;
            this.virtualButtons["START"]  = this.virtualButtons["START"]  || start;
            this.virtualButtons["SELECT"] = this.virtualButtons["SELECT"] || select;
            this.virtualButtons["REWIND"] = this.virtualButtons["REWIND"] || rewind;
            this.virtualButtons["FAST_FORWARD"] = this.virtualButtons["FAST_FORWARD"] || fastForward;
        }

        requestAnimationFrame(() => this.pollGamepadsLoop());
    }

    /**
     * Checks if a semantic virtual button is currently active (Pressed).
     * @param {string} buttonName - Button key identifier (e.g. "UP", "A", "START").
     * @returns {boolean} True if active.
     */
    isPressed(buttonName) {
        return this.virtualButtons[buttonName.toUpperCase()] === true;
    }

    /**
     * Displays a retro-neon styled toast notification on Gamepad connections.
     * @param {string} message - Notification text.
     */
    showNotification(message) {
        let toast = document.getElementById('eggstation-gamepad-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'eggstation-gamepad-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.right = '24px';
            toast.style.backgroundColor = 'rgba(20, 10, 35, 0.95)';
            toast.style.border = '2px solid #ff007f';
            toast.style.color = '#fff';
            toast.style.padding = '14px 24px';
            toast.style.borderRadius = '8px';
            toast.style.fontFamily = 'monospace';
            toast.style.fontSize = '0.9rem';
            toast.style.fontWeight = 'bold';
            toast.style.boxShadow = '0 0 20px rgba(255, 0, 127, 0.6)';
            toast.style.zIndex = '99999';
            toast.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span style="color: #ff007f;">[EGGStation]</span> ${message}`;
        
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        if (toast.timeoutId) {
            clearTimeout(toast.timeoutId);
        }
        toast.timeoutId = setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
        }, 4000);
    }
}

// Instantiated globally as a shared hardware input service
window.UniversalInput = new UniversalInputManager();