/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: Genesis UI and Input Controller (Debugger & Filters)
 * 
 * Maps DOM interactions (buttons, file inputs, selects), keyboard/touch events, 
 * and physical input registers directly to the Sega Genesis Orchestrator.
 * Handles on-the-fly post-processing filter swaps, WebGL2 CRT Shader tuning,
 * and snychronous 68K debugger updates.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates UI event bindings and keyboard 
 *   layouts from the core execution clocks and system memory buses.
 * - Dependency Inversion Principle (DIP): Receives the orchestrator instance via 
 *   constructor injection to maintain decouple concern streams.
 */

class GenesisUIController {
    /**
     * Initializes the UI Controller and binds all browser and keyboard events.
     * @param {GenesisOrchestrator} orchestrator - The application layer service managing the emulator.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        
        // Dynamic key states dictionary (stores synchronous active states: true/false)
        this.keysActive = {};

        // Dynamic gamepad states dictionary for active button mapping
        this.gamepadState = {};

        this.bindEvents();

        // Synchronize initial slider states with GPU memory uniforms
        this.handleShaderTuningChange();

        // Swap the registers panel DOM layout to support the 16 M68K registers
        this.swapTo68kRegisters();

        // Initiate the physical gamepad polling loop
        this.pollGamepads();

        // Periodically refresh the registers, disassembly terminal and VRAM tile viewer 
        // twice a second (every 500ms) only when the Developer Suite is expanded on screen.
        this.devIntervalId = setInterval(() => {
            const devSuite = document.getElementById('developer-suite');
            
            // Memory Leak Prevention: If the active orchestrator has been hot-swapped or 
            // unloaded, clear the interval automatically to free up browser memory.
            if (typeof activeController !== 'undefined' && activeController !== this) {
                clearInterval(this.devIntervalId);
                return;
            }

            if (devSuite && !devSuite.classList.contains('hidden') && this.orchestrator.isRunning) {
                this.updateDebuggerUI();
            }
        }, 500);
    }

    /**
     * Attaches event listeners to the DOM elements and the window object.
     * Synchronously handles the Web Audio Context lifecycle during physical user interactions.
     */
    bindEvents() {
        // 1. ROM File Loader Button Proxy (Genesis-specific slot)
        const loaderBtn = document.getElementById('romLoaderBtn');
        const fileSelector = document.getElementById('cartridgeSelector');
        
        if (loaderBtn && fileSelector) {
            loaderBtn.addEventListener('click', () => { 
                // Synchronously initialize and resume the AudioContext 
                // directly inside the user-gesture click handler to prevent 
                // the browser from blocking audio playback under autoplay policies.
                if (this.orchestrator) {
                    this.orchestrator.startAudio();
                    if (this.orchestrator.audioCtx && this.orchestrator.audioCtx.state === 'suspended') {
                        this.orchestrator.audioCtx.resume().catch(() => {});
                    }
                }
                fileSelector.click();
            });

            fileSelector.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
            });
        }

        // 2. TV Signal Standard Selector (NTSC / PAL)
        const vdpModeSelector = document.getElementById('vdpModeSelector');
        if (vdpModeSelector) {
            vdpModeSelector.addEventListener('change', (e) => {
                this.orchestrator.setTvStandard(e.target.value);
            });
        }

        // 3. Post-Processing Visual Filters Selector
        const postProcessSelector = document.getElementById('postProcessSelector');
        if (postProcessSelector) {
            postProcessSelector.addEventListener('change', (e) => {
                const mode = parseInt(e.target.value, 10);
                this.handlePostProcessChange(mode);
            });
        }

        // 4. Keyboard Mappings for Controller and Emulator functions
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // 5. Page-Wide Interaction Audio Fallback Unlocker
        // Synchronously resumes the context on first user interaction if suspended
        const unlockAudio = () => {
            if (this.orchestrator && this.orchestrator.audioCtx) {
                if (this.orchestrator.audioCtx.state === 'suspended') {
                    this.orchestrator.audioCtx.resume().catch(() => {});
                }
            }
        };
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('keydown', unlockAudio, { once: true });

        // 6. WebGL2 CRT Shader Tuning Sliders
        const bindSlider = (id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.handleShaderTuningChange());
            }
        };
        bindSlider('sh-curvature');
        bindSlider('sh-scanlines');
        bindSlider('sh-phosphor');
        bindSlider('sh-bloom');

        // 7. Developer Mode Debugger Suite Buttons & Inputs (68K CPU Stepper)
        const dbgPlay = document.getElementById('dbg-play');
        const dbgPause = document.getElementById('dbg-pause');
        const dbgStep = document.getElementById('dbg-step');
        const dbgBpInput = document.getElementById('dbg-breakpoint');

        if (dbgPlay) {
            dbgPlay.addEventListener('click', () => {
                this.orchestrator.isDebugging = false;
                this.orchestrator.isPaused = false;
            });
        }

        if (dbgPause) {
            dbgPause.addEventListener('click', () => {
                this.orchestrator.isDebugging = true;
                this.updateDebuggerUI();
            });
        }

        if (dbgStep) {
            dbgStep.addEventListener('click', () => {
                if (this.orchestrator.isDebugging) {
                    this.orchestrator.stepInstruction();
                    this.updateDebuggerUI();
                }
            });
        }

        if (dbgBpInput) {
            dbgBpInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                if (val.length === 4) {
                    this.orchestrator.breakpointAddress = parseInt(val, 16);
                } else {
                    this.orchestrator.breakpointAddress = null;
                }
            });
        }

        // Listen for breakpoint break events dispatched from Orchestrator
        window.addEventListener('genesis-debugger-break', () => {
            this.updateDebuggerUI();
        });

        // 8. Physical Gamepad Connection Listener (Safe Global Binding to prevent event leaks)
        if (!window.__eggstation_gamepad_listeners_bound__) {
            window.__eggstation_gamepad_listeners_bound__ = true;

            window.addEventListener("gamepadconnected", (e) => {
                console.log(`GenesisUIController::Gamepad connected globally: [${e.gamepad.id}]`);
                if (typeof activeController !== 'undefined' && activeController && activeController.showGamepadNotification) {
                    activeController.showGamepadNotification(`Controller detected: ${e.gamepad.id.substring(0, 24)}...`);
                }
            });

            window.addEventListener("gamepaddisconnected", (e) => {
                console.log(`GenesisUIController::Gamepad disconnected globally: [${e.gamepad.id}]`);
                if (typeof activeController !== 'undefined' && activeController && activeController.showGamepadNotification) {
                    activeController.showGamepadNotification(`Controller disconnected: ${e.gamepad.id.substring(0, 24)}...`);
                }
            });
        }

        // 9. Inject the keyboard and gamepad poller into the hardware Controller Manager (DIP)
        if (this.orchestrator && this.orchestrator.controllerManager) {
            this.orchestrator.controllerManager.bindInputPoller((playerId, buttonId) => {
                return this.inputRequested(playerId, buttonId);
            });
        }
    }

    /**
     * Swaps the original Z80 register grid DOM layout snychronously to hold M68K registers.
     */
    swapTo68kRegisters() {
        const grid = document.querySelector('.registers-grid');
        if (grid) {
            grid.innerHTML = `
                <div>D0: <span id="reg-d0">00000000</span></div>
                <div>D1: <span id="reg-d1">00000000</span></div>
                <div>D2: <span id="reg-d2">00000000</span></div>
                <div>D3: <span id="reg-d3">00000000</span></div>
                <div>D4: <span id="reg-d4">00000000</span></div>
                <div>D5: <span id="reg-d5">00000000</span></div>
                <div>D6: <span id="reg-d6">00000000</span></div>
                <div>D7: <span id="reg-d7">00000000</span></div>
                <div>A0: <span id="reg-a0">00000000</span></div>
                <div>A1: <span id="reg-a1">00000000</span></div>
                <div>A2: <span id="reg-a2">00000000</span></div>
                <div>A3: <span id="reg-a3">00000000</span></div>
                <div>A4: <span id="reg-a4">00000000</span></div>
                <div>A5: <span id="reg-a5">00000000</span></div>
                <div>A6: <span id="reg-a6">00000000</span></div>
                <div>A7: <span id="reg-a7">00000000</span></div>
                <div style="grid-column: span 2;">PC: <span id="reg-pc">00000000</span></div>
                <div style="grid-column: span 2;">SR: <span id="reg-sr">0000</span></div>
            `;
        }
    }

    /**
     * Gathers, decodes and formats all 68K CPU register values, active program disassembly,
     * and maps active VDP memory patterns onto the secondary diagnostic canvas.
     */
    updateDebuggerUI() {
        if (!this.orchestrator.m68k || !this.orchestrator.isRunning) return;

        const m68k = this.orchestrator.m68k;

        // 1. Update all 8 Data Registers
        for (let i = 0; i < 8; i++) {
            const el = document.getElementById(`reg-d${i}`);
            if (el) el.textContent = m68k.d[i].toString(16).toUpperCase().padStart(8, '0');
        }

        // 2. Update all 8 Address Registers
        for (let i = 0; i < 8; i++) {
            const el = document.getElementById(`reg-a${i}`);
            if (el) el.textContent = m68k.a[i].toString(16).toUpperCase().padStart(8, '0');
        }

        // 3. Update Program Counter (PC)
        const pcEl = document.getElementById('reg-pc');
        if (pcEl) pcEl.textContent = m68k.pc.toString(16).toUpperCase().padStart(8, '0');

        // 4. Update Status Register (SR)
        const srEl = document.getElementById('reg-sr');
        if (srEl) srEl.textContent = m68k.sr.toString(16).toUpperCase().padStart(4, '0');

        // 5. Update Disassembly Terminal readout with PC and active hex opcode
        const disasmBox = document.getElementById('disasm-output');
        if (disasmBox) {
            disasmBox.innerHTML = '';
            const pcHex = m68k.pc.toString(16).toUpperCase().padStart(6, '0');
            const opHex = this.orchestrator.bus.readWord(m68k.pc, m68k.pc).toString(16).toUpperCase().padStart(4, '0');
            
            const line = document.createElement('div');
            line.className = 'disasm-line active';
            line.textContent = `${pcHex}: OPCODE 0x${opHex}`;
            disasmBox.appendChild(line);
        }

        // 6. Rasterize active 4bpp VRAM Pattern Tiles onto the secondary canvas
        const vramCanvas = document.getElementById('vram-canvas');
        if (vramCanvas) {
            const ctx = vramCanvas.getContext('2d');
            this.orchestrator.rasterizeVramTiles(ctx);
        }
    }

    /**
     * Renders a custom floating toast notification when gamepads are added or removed.
     * Styled to match EGGStation's signature synthwave retro neon aesthetic.
     * @param {string} message - Text notification string.
     */
    showGamepadNotification(message) {
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
        
        // Execute animation sequence
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

    /**
     * Continuous polling loop for the HTML5 Gamepad API.
     * Scans the full array to map the first active gamepad, regardless of index slots.
     */
    pollGamepads() {
        // Lifecycle Guard: Automatically release loop if the current active controller context changes.
        // Modified to allow the first frame call when activeController is null during constructor execution.
        if (typeof activeController !== 'undefined' && activeController !== null && activeController !== this) {
            return;
        }

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp = null;

        // Iterate dynamically to find the first non-null active gamepad lane
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                gp = gamepads[i];
                break;
            }
        }

        if (gp) {
            const DEADZONE = 0.5; // Threshold for analog stick drift

            // Advanced Fallback direction mapping for generic / ShanWan Gamepads under Linux
            const leftStickH = gp.axes[0] || 0;
            const leftStickV = gp.axes[1] || 0;
            const dpadAxisH  = gp.axes[4] || gp.axes[6] || gp.axes[2] || 0;
            const dpadAxisV  = gp.axes[5] || gp.axes[7] || gp.axes[3] || 0;

            this.gamepadState[GENESIS_CONTROLLER_UP]     = gp.buttons[12]?.pressed || leftStickV < -DEADZONE || dpadAxisV < -DEADZONE;
            this.gamepadState[GENESIS_CONTROLLER_DOWN]   = gp.buttons[13]?.pressed || leftStickV > DEADZONE  || dpadAxisV > DEADZONE;
            this.gamepadState[GENESIS_CONTROLLER_LEFT]   = gp.buttons[14]?.pressed || leftStickH < -DEADZONE || dpadAxisH < -DEADZONE;
            this.gamepadState[GENESIS_CONTROLLER_RIGHT]  = gp.buttons[15]?.pressed || leftStickH > DEADZONE  || dpadAxisH > DEADZONE;

            // Generic button-mappings fallbacks (A, B, C, X, Y, Z, Start, Mode)
            this.gamepadState[GENESIS_CONTROLLER_A]      = gp.buttons[0]?.pressed === true || gp.buttons[2]?.pressed === true; // Cross or Square
            this.gamepadState[GENESIS_CONTROLLER_B]      = gp.buttons[1]?.pressed === true || gp.buttons[3]?.pressed === true; // Circle or Triangle
            this.gamepadState[GENESIS_CONTROLLER_C]      = gp.buttons[5]?.pressed === true; // Right Bumper / R1
            this.gamepadState[GENESIS_CONTROLLER_X]      = gp.buttons[4]?.pressed === true; // Left Bumper / L1
            this.gamepadState[GENESIS_CONTROLLER_Y]      = gp.buttons[6]?.pressed === true; // Left Trigger / L2
            this.gamepadState[GENESIS_CONTROLLER_Z]      = gp.buttons[7]?.pressed === true; // Right Trigger / R2
            
            this.gamepadState[GENESIS_CONTROLLER_START]  = gp.buttons[9]?.pressed === true; // Start button
            this.gamepadState[GENESIS_CONTROLLER_MODE]   = gp.buttons[8]?.pressed === true; // Select button

            // Diagnostic Logger: Emits active button and axis parameters to the host debugger console
            for (let b = 0; b < gp.buttons.length; b++) {
                if (gp.buttons[b]?.pressed) {
                    console.log(`[EGGStation::MD Diagnostics] Button ${b} is PRESSED`);
                }
            }
            for (let a = 0; a < gp.axes.length; a++) {
                if (Math.abs(gp.axes[a]) > DEADZONE) {
                    console.log(`[EGGStation::MD Diagnostics] Axis ${a} Value is active: ${gp.axes[a].toFixed(2)}`);
                }
            }
        } else {
            // Nullify dictionary cache to prevent input lock states on controller unplug
            this.gamepadState = {};
        }

        // Loop execution synced to the browser's refresh rate
        requestAnimationFrame(() => this.pollGamepads());
    }

    /**
     * Reads the current keyboard or gamepad states and returns true if pressed.
     * Invoked automatically as a callback by the active Controller Manager.
     * Note: Uses GENESIS_CONTROLLER_* constants defined in GenesisControllerManager.js
     * 
     * @param {number} playerId - Player index (0 = P1, 1 = P2).
     * @param {number} buttonId - Mapped button ID constant.
     * @returns {boolean} True if pressed.
     */
    inputRequested(playerId, buttonId) {
        if (playerId !== 0) {
            return false; // Port 1 only mapped for standard keyboard/gamepad input
        }

        // Query physical gamepad state registers
        if (this.gamepadState && this.gamepadState[buttonId] === true) {
            return true;
        }

        // Cross-browser fallback checks added to handle older/alternative keyboard layouts
        switch (buttonId) {
            case GENESIS_CONTROLLER_UP:     
                return this.keysActive['ArrowUp'] === true || this.keysActive['Up'] === true;
            case GENESIS_CONTROLLER_DOWN:   
                return this.keysActive['ArrowDown'] === true || this.keysActive['Down'] === true;
            case GENESIS_CONTROLLER_LEFT:   
                return this.keysActive['ArrowLeft'] === true || this.keysActive['Left'] === true;
            case GENESIS_CONTROLLER_RIGHT:  
                return this.keysActive['ArrowRight'] === true || this.keysActive['Right'] === true;
            
            case GENESIS_CONTROLLER_A:      
                return this.keysActive['z'] === true || this.keysActive['Z'] === true; 
            case GENESIS_CONTROLLER_B:      
                return this.keysActive['x'] === true || this.keysActive['X'] === true; 
            case GENESIS_CONTROLLER_C:      
                return this.keysActive['c'] === true || this.keysActive['C'] === true; 
            
            case GENESIS_CONTROLLER_X:      
                return this.keysActive['a'] === true || this.keysActive['A'] === true; 
            case GENESIS_CONTROLLER_Y:      
                return this.keysActive['s'] === true || this.keysActive['S'] === true; 
            case GENESIS_CONTROLLER_Z:      
                return this.keysActive['d'] === true || this.keysActive['D'] === true; 
            
            case GENESIS_CONTROLLER_START:  
                return this.keysActive['Enter'] === true;
            case GENESIS_CONTROLLER_MODE:   
                return this.keysActive[' '] === true || this.keysActive['Spacebar'] === true; // Spacebar variants
        }

        return false;
    }

    /**
     * Reads the selected cartridge file and passes the raw binary buffer to the Orchestrator.
     * @param {FileList} files - The files selected by the user.
     */
    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        const fname = file.name.toLowerCase();

        // Validate supported Genesis / Mega Drive extensions
        if (!fname.endsWith('.md') && !fname.endsWith('.gen') && !fname.endsWith('.bin') && !fname.endsWith('.smd')) {
            alert("EGGStation::Error: Unsupported Sega Genesis ROM file format. Please use .md, .gen, or .bin");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target.result;
            this.orchestrator.loadRom(arrayBuffer);
            this.hideUIForGameplay();
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Handles keydown events, storing states inside the active register dictionary.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    handleKeyDown(e) {
        this.keysActive[e.key] = true;

        switch(e.key) {
            // Prevent browser scroll on arrow keys and spacebar
            case "ArrowUp":
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight":
            case "Up":
            case "Down":
            case "Left":
            case "Right":
            case " ":
            case "Spacebar":
                e.preventDefault();
                break;

            // Emulator control shortcuts
            case "p": 
            case "P":
                this.orchestrator.togglePause(); 
                break;
            case "\\": 
                this.orchestrator.fastForward = true; 
                e.preventDefault(); 
                break;
        }
    }

    /**
     * Handles keyup events to clear states from the active register dictionary.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    handleKeyUp(e) {
        this.keysActive[e.key] = false;

        switch(e.key) {
            case "\\": 
                this.orchestrator.fastForward = false; 
                break;
        }
    }

    /**
     * Handles changes in the post-processing filter, toggling canvas styles via inline JS.
     * @param {number} mode - Selected filter mode index.
     */
    handlePostProcessChange(mode) {
        const display2D = document.getElementById("smsdisplay");
        const displayGL = document.getElementById("webgldisplay");
        if (!display2D || !displayGL) return;

        if (mode === 6) {
            // Hide 2D Canvas completely and expose WebGL2 canvas
            display2D.classList.add('hidden');
            displayGL.classList.remove('hidden');
            
            // Explicitly override the inline styles
            displayGL.style.display = "block";
            displayGL.style.visibility = "visible";
            displayGL.style.position = "relative";
            
            // Re-apply slider multiples onto the GPU program
            this.handleShaderTuningChange();
        } else {
            // Restore standard canvas layout
            display2D.classList.remove('hidden');
            displayGL.classList.add('hidden');
            
            // Re-hide the WebGL canvas inline
            displayGL.style.display = "none";
            displayGL.style.visibility = "hidden";
            displayGL.style.position = "absolute";

            if (mode === 1) {
                display2D.style.imageRendering = "auto";
            } else {
                display2D.style.imageRendering = "pixelated";
            }
        }

        // Delegate the selected configuration to the Application orchestrator
        this.orchestrator.postProcessMode = mode;
    }

    /**
     * Gathers current range slider states, scales them to normalized WebGL ratio ranges, 
     * and streams them into active GPU uniform variables.
     */
    handleShaderTuningChange() {
        // Translate slider values into exact multipliers (1.0 = standard default)
        const curvVal = parseInt(document.getElementById('sh-curvature')?.value || "90", 10) / 90;
        const scanVal = parseInt(document.getElementById('sh-scanlines')?.value || "38", 10) / 38;
        const phosVal = parseInt(document.getElementById('sh-phosphor')?.value || "25", 10) / 25;
        const blmVal  = parseInt(document.getElementById('sh-bloom')?.value || "15", 10) / 15;

        // Pipe variables down to GPU memory space
        this.orchestrator.updateShaderUniforms(curvVal, scanVal, phosVal, blmVal);
    }

    /**
     * Cleans up the screen by hiding the file loading button once gameplay starts.
     */
    hideUIForGameplay() {
        const fileSelector = document.getElementById("fileselector");
        if (fileSelector) fileSelector.classList.add("hidden");
    }
}