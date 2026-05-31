/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: UI Controller (With Cache-Proof Layout Controls, Gamepad, Rewinding & Phaser)
 * 
 * Maps DOM interactions (buttons, file inputs, selects), keyboard/touch events, 
 * and Physical USB/Bluetooth Gamepads to the Emulator Orchestrator. 
 * Swaps viewports via clean display rules to prevent flexbox offset anomalies (SRP).
 * 
 * OPTIMIZED FOR PHASE 3: Added touch/mouse handlers to emulate the SMS Light Phaser 
 * and latch coordinates directly into VDP counter registers.
 */

class UIController {
    /**
     * Initializes the UI Controller and binds all browser, touch, and gamepad events.
     * @param {EmulatorOrchestrator} orchestrator - The application layer service managing the emulator.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        
        // State tracker for physical gamepads to process edge-detection (press/release only)
        this.gamepadState = {
            up: false, down: false, left: false, right: false,
            btn1: false, btn2: false, pause: false,
            rewind: false // Tracks active gamepad rewinding state
        };

        this.bindEvents();

        // Initiate the hardware gamepad polling loop
        this.pollGamepads();
    }

    /**
     * Attaches event listeners to the DOM elements and the window object.
     */
    bindEvents() {
        // 1. ROM File Loader Button Proxy
        const loaderBtn = document.getElementById('romLoaderBtn');
        const fileSelector = document.getElementById('cartridgeSelector');
        
        if (loaderBtn && fileSelector) {
            loaderBtn.addEventListener('click', () => { 
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
                this.orchestrator.setVdpMode(e.target.value);
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

        // 4. Audio DSP Soundstage Selector
        const audioFilterSelector = document.getElementById('audioFilterSelector');
        if (audioFilterSelector) {
            audioFilterSelector.addEventListener('change', (e) => {
                const mode = parseInt(e.target.value, 10);
                this.orchestrator.setAudioFilterMode(mode);
            });
        }

        // 5. Fullscreen Hook
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());

        // 6. Keyboard Mappings for Controller and Emulator functions
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // 7. Mobile Virtual Gamepad Touch Mappings
        this.bindVirtualGamepadEvents();

        // 8. Physical Gamepad Connection Listener (Diagnostic)
        window.addEventListener("gamepadconnected", (e) => {
            console.log(`UIController::Gamepad connected: [${e.gamepad.id}]`);
        });

        // 9. Light Phaser Mouse & Touch Event Listeners
        const crtWrapper = document.getElementById('crt-wrapper');
        if (crtWrapper) {
            crtWrapper.addEventListener('mousedown', (e) => this.handlePhaserClick(e));
            crtWrapper.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) {
                    this.handlePhaserClick(e.touches[0]);
                }
            });
        }
    }

    /**
     * Intercepts pointer coordinates over the CRT wrapper and translates them into 
     * 256x240 pixel space, triggering the physical light phaser registers.
     * @param {MouseEvent|Touch} e - The raw pointer coordinate event.
     */
    handlePhaserClick(e) {
        // Query the standard canvas element to resolve coordinates relative to its rendered rectangle
        const display2D = document.getElementById("smsdisplay");
        if (!display2D || !this.orchestrator.isRunning) return;

        const rect = display2D.getBoundingClientRect();
        
        // Translate absolute mouse pointer positions to physical VDP coordinate matrices
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * 256);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * 240);

        // Confirm coordinates sit within native hardware limits
        if (x >= 0 && x < 256 && y >= 0 && y < 240) {
            const vdp = this.orchestrator.vdp;
            const io = this.orchestrator.ioController;

            if (vdp && io) {
                vdp.phaserClicked = true;
                vdp.phaserX = x;
                vdp.phaserY = y;

                // 1. Pull the physical trigger (Button 1 of Player 1) LOW
                io.pressButton1();

                // 2. Latch the Lightgun Photo-Receptor Sensor (PORT_A_TR pin on Port 0xDD) LOW
                io.writePinStateDD('PORT_A_TR', true);

                // 3. Keep registers latched for exactly 80ms (roughly 5 frames) then release
                setTimeout(() => {
                    vdp.phaserClicked = false;
                    io.depressButton1();
                    io.writePinStateDD('PORT_A_TR', false);
                }, 80);
            }
        }
    }

    /**
     * Continuous polling loop for the HTML5 Gamepad API.
     * Detects button and axis changes to trigger the emulator I/O chip.
     */
    pollGamepads() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0]; // Capture the first connected controller

        if (gp && this.orchestrator.ioController) {
            const io = this.orchestrator.ioController;
            const DEADZONE = 0.5; // Threshold for analog stick drift

            // Standard Gamepad Mapping
            // D-Pad: 12 (Up), 13 (Down), 14 (Left), 15 (Right)
            // Axes: 0 (Horizontal Left Stick), 1 (Vertical Left Stick)
            const up = gp.buttons[12]?.pressed || gp.axes[1] < -DEADZONE;
            const down = gp.buttons[13]?.pressed || gp.axes[1] > DEADZONE;
            const left = gp.buttons[14]?.pressed || gp.axes[0] < -DEADZONE;
            const right = gp.buttons[15]?.pressed || gp.axes[0] > DEADZONE;

            // Face Buttons: 0 (A/Cross), 1 (B/Circle), 2 (X/Square), 3 (Y/Triangle)
            const btn1 = gp.buttons[0]?.pressed || gp.buttons[2]?.pressed; // Primary Fire
            const btn2 = gp.buttons[1]?.pressed || gp.buttons[3]?.pressed; // Secondary Fire / Jump

            // Pause: 9 (Start button)
            const pause = gp.buttons[9]?.pressed;

            // Rewind: 6 (Left Trigger / L2) or 4 (Left Bumper / L1)
            const rewind = gp.buttons[6]?.pressed || gp.buttons[4]?.pressed;

            // Helper to trigger hardware pins only on state change (edge detection)
            const triggerInput = (key, isPressed, onPress, onRelease) => {
                if (isPressed && !this.gamepadState[key]) {
                    onPress.call(io);
                    this.gamepadState[key] = true;
                } else if (!isPressed && this.gamepadState[key]) {
                    onRelease.call(io);
                    this.gamepadState[key] = false;
                }
            };

            // Execute input mapping evaluations
            triggerInput('up', up, io.pressUp, io.depressUp);
            triggerInput('down', down, io.pressDown, io.depressDown);
            triggerInput('left', left, io.pressLeft, io.depressLeft);
            triggerInput('right', right, io.pressRight, io.depressRight);
            triggerInput('btn1', btn1, io.pressButton1, io.depressButton1);
            triggerInput('btn2', btn2, io.pressButton2, io.depressButton2);

            // Special handling for Pause (trigger NMI only on initial press to avoid rapid toggling)
            if (pause && !this.gamepadState.pause) {
                this.orchestrator.triggerPauseButton();
                this.gamepadState.pause = true;
            } else if (!pause) {
                this.gamepadState.pause = false;
            }

            // Real-Time Rewind mapping handler
            if (rewind && !this.gamepadState.rewind) {
                this.orchestrator.isRewinding = true;
                this.gamepadState.rewind = true;
            } else if (!rewind && this.gamepadState.rewind) {
                this.orchestrator.isRewinding = false;
                this.gamepadState.rewind = false;
            }
        }

        // Loop execution synced to the browser's refresh rate
        requestAnimationFrame(() => this.pollGamepads());
    }

    /**
     * Maps the Mobile Gamepad touch zones to the physical Controller pins.
     */
    bindVirtualGamepadEvents() {
        const io = this.orchestrator.ioController;
        if (!io) return;

        // Helper to bind touch events to prevent code duplication (DRY)
        const mapTouchPin = (elementId, onPress, onRelease) => {
            const element = document.getElementById(elementId);
            if (!element) return;

            element.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Lock viewport scrolling
                onPress.call(io);
            });

            const releaseHandler = (e) => {
                e.preventDefault();
                onRelease.call(io);
            };

            element.addEventListener('touchend', releaseHandler);
            element.addEventListener('touchcancel', releaseHandler);
        };

        // Bind D-PAD Directions
        mapTouchPin('v-up', io.pressUp, io.depressUp);
        mapTouchPin('v-down', io.pressDown, io.depressDown);
        mapTouchPin('v-left', io.pressLeft, io.depressLeft);
        mapTouchPin('v-right', io.pressRight, io.depressRight);

        // Bind Gamepad Action Buttons
        mapTouchPin('v-btn1', io.pressButton1, io.depressButton1);
        mapTouchPin('v-btn2', io.pressButton2, io.depressButton2);

        // Bind Pause State (Simple click/touch trigger)
        const vPause = document.getElementById('v-pause');
        if (vPause) {
            vPause.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.orchestrator.togglePause();
            });
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
            // Decouple from flex layout completely to prevent shifting anomalies
            display2D.style.display = "none";
            displayGL.style.display = "block";
            
            // Re-enforce visible states
            displayGL.style.visibility = "visible";
            displayGL.style.position = "relative";
        } else {
            // Restore standard canvas layout
            display2D.style.display = "block";
            displayGL.style.display = "none";
            
            display2D.style.visibility = "visible";
            display2D.style.position = "relative";

            if (mode === 1) {
                display2D.style.imageRendering = "auto";
            } else {
                display2D.style.imageRendering = "pixelated";
            }
        }

        // Delegate the selected configuration to the Application orchestrator
        this.orchestrator.setPostProcessMode(mode);
    }

    /**
     * Reads the selected cartridge file and passes the raw binary buffer to the Orchestrator.
     * @param {FileList} files - The files selected by the user.
     */
    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        const fname = file.name.toLowerCase();

        // Validate supported extensions
        if (!fname.endsWith('.sms') && !fname.endsWith('.sg')) {
            alert("EGGStation::Error: System only supports .sms and .sg ROM files.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target.result;
            this.orchestrator.loadRom(file.name, arrayBuffer);
            this.hideUIForGameplay();
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Handles keydown events, mapping them to the DB-9 Controller pins or Emulator actions.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    handleKeyDown(e) {
        const io = this.orchestrator.ioController;
        if (!io) return;

        switch(e.key) {
            // Joypad Controls
            case "z": io.pressButton1(); break;
            case "x": io.pressButton2(); break;
            case "ArrowUp": io.pressUp(); e.preventDefault(); break;
            case "ArrowDown": io.pressDown(); e.preventDefault(); break;
            case "ArrowLeft": io.pressLeft(); e.preventDefault(); break;
            case "ArrowRight": io.pressRight(); e.preventDefault(); break;
            
            // Real-Time Gameplay Rewind (Hold key down)
            case "Backspace":
                this.orchestrator.isRewinding = true;
                e.preventDefault();
                break;

            // Emulator Control Shortcuts
            case "\\": 
                this.orchestrator.fastForward = true; 
                e.preventDefault(); 
                break;
            case "p": 
                this.orchestrator.togglePause(); 
                break;
            case "o": 
                this.orchestrator.triggerPauseButton(); 
                break;
            case "F2": 
                this.orchestrator.saveState(); 
                // Delay UI update slightly to allow IndexedDB async save to finish
                setTimeout(() => this.updateSaveStatePreview(), 100); 
                e.preventDefault(); 
                break;
            case "F3": 
                this.orchestrator.loadState(); 
                e.preventDefault(); 
                break;
        }
    }

    /**
     * Handles keyup events to release DB-9 Controller pins or stop fast-forwarding/rewinding.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    handleKeyUp(e) {
        const io = this.orchestrator.ioController;
        if (!io) return;

        switch(e.key) {
            // Joypad Controls release
            case "z": io.depressButton1(); break;
            case "x": io.depressButton2(); break;
            case "ArrowUp": io.depressUp(); break;
            case "ArrowDown": io.depressDown(); break;
            case "ArrowLeft": io.depressLeft(); break;
            case "ArrowRight": io.depressRight(); break;
            
            // Real-Time Gameplay Rewind release (Resume normal play)
            case "Backspace":
                this.orchestrator.isRewinding = false;
                break;

            // Emulator Control Shortcuts release
            case "\\": 
                this.orchestrator.fastForward = false; 
                break;
        }
    }

    /**
     * Cleans up the screen by hiding only the file loading button once gameplay starts.
     */
    hideUIForGameplay() {
        const fileSelector = document.getElementById("fileselector");
        if (fileSelector) fileSelector.classList.add("hidden");
    }

    /**
     * Adjusts the canvas framing when transitioning in or out of Fullscreen mode.
     */
    handleFullscreenChange() {
        const display2D = document.getElementById("smsdisplay");
        const displayGL = document.getElementById("webgldisplay");
        const titleDiv = document.getElementById("titleDiv");

        const targetWidth = document.fullscreenElement ? "100%" : "768px";
        const targetHeight = document.fullscreenElement ? "100vh" : "720px";

        if (titleDiv) {
            if (document.fullscreenElement) titleDiv.classList.add("hidden");
            else titleDiv.classList.remove("hidden");
        }

        if (display2D) {
            display2D.style.width = targetWidth;
            display2D.style.height = targetHeight;
        }
        if (displayGL) {
            displayGL.style.width = targetWidth;
            displayGL.style.height = targetHeight;
        }
    }

    /**
     * Retrieves the saved screenshot from standard localStorage and renders it to the tooltip thumbnail.
     * Note: Screenshot metadata remains in localStorage due to its small size and synchronous nature,
     * while heavy binary state data is moved to IndexedDB.
     */
    updateSaveStatePreview() {
        const rawImgData = localStorage.getItem('savestateScreenshot');
        if (!rawImgData) return;

        const imgDataArray = JSON.parse(rawImgData);
        if (!imgDataArray) return;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        
        const clampedArray = new Uint8ClampedArray(imgDataArray);
        const imgArray = new ImageData(clampedArray, 256, 240);
        ctx.putImageData(imgArray, 0, 0);

        const targetImage = document.getElementById("savestateImg");
        if (targetImage) {
            targetImage.src = canvas.toDataURL();
        }
    }
}