/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: UI Controller (Unified Version with Disassembler Typo Fixed)
 * 
 * Maps DOM interactions (buttons, file inputs, selects), keyboard/touch events, 
 * and Physical USB/Bluetooth Gamepads to the Emulator Orchestrator. 
 * Swaps viewports via clean display rules to prevent flexbox offset anomalies (SRP).
 * 
 * OPTIMIZED: Adjusted slider scale divisions to represent 1:1 multipliers (1.0 = standard),
 * eliminating double-multiplication bugs. Synchronized settings state post asynchronous ROM loads.
 * 
 * BUGFIX: Fixed ReferenceError on Z80Disassembler class call during step-debugging.
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

        // Synchronize initial slider states with GPU memory uniforms
        this.handleShaderTuningChange();

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

        // 10. WebGL2 CRT Shader Tuning Sliders
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

        // 11. Developer Mode Debugger Suite Buttons & Inputs
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
                    console.log(`UIController::Breakpoint bound to address: 0x${this.orchestrator.breakpointAddress.toString(16).toUpperCase().padStart(4, '0')}`);
                } else {
                    this.orchestrator.breakpointAddress = null;
                }
            });
        }

        // Listen for breakpoint break events dispatched from Orchestrator
        window.addEventListener('debugger-break', () => {
            this.updateDebuggerUI();
        });

        // Populate initial debugger state values immediately when Dev Mode panel is opened
        const devToggle = document.getElementById('dev-toggle-btn');
        if (devToggle) {
            devToggle.addEventListener('click', () => {
                if (!document.getElementById('developer-suite').classList.contains('hidden')) {
                    this.updateDebuggerUI();
                }
            });
        }
    }

    /**
     * Gathers, decodes and formats all CPU register values, active program disassembly instructions,
     * and maps active VDP memory patterns onto the secondary diagnostic canvas.
     */
    updateDebuggerUI() {
        if (!this.orchestrator.cpu || !this.orchestrator.isRunning) return;

        const cpu = this.orchestrator.cpu;
        const reg = cpu.registers;

        // 1. Update CPU Registers Hex text readouts (Padded to 4 uppercase hex characters)
        const updateReg = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val.toString(16).toUpperCase().padStart(4, '0');
        };

        updateReg('reg-af', reg.af);
        updateReg('reg-bc', reg.bc);
        updateReg('reg-de', reg.de);
        updateReg('reg-hl', reg.hl);
        updateReg('reg-ix', reg.ix);
        updateReg('reg-iy', reg.iy);
        updateReg('reg-sp', reg.sp);
        updateReg('reg-pc', reg.pc);

        // 2. Render Real-time Disassembly Output centered around the active Program Counter
        const disasmBox = document.getElementById('disasm-output');
        if (disasmBox) {
            disasmBox.innerHTML = ''; // Clear previous disassembly text rows

            // Disassemble 5 consecutive instructions starting from current Program Counter
            const instructions = Z80Disassembler.disassembleBlock(cpu, 5);
            instructions.forEach((instr, idx) => {
                const line = document.createElement('div');
                line.className = 'disasm-line' + (idx === 0 ? ' active' : '');
                
                const hexAddr = instr.address.toString(16).toUpperCase().padStart(4, '0');
                line.textContent = `${hexAddr}: ${instr.decodedString}`;
                disasmBox.appendChild(line);
            });
        }

        // 3. Rasterize active VRAM Pattern Tiles onto the secondary canvas
        const vramCanvas = document.getElementById('vram-canvas');
        if (vramCanvas) {
            const ctx = vramCanvas.getContext('2d');
            this.orchestrator.rasterizeVramTiles(ctx);
        }
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
            // Hide 2D Canvas completely
            display2D.classList.add('hidden');
            displayGL.classList.remove('hidden');
            
            // Explicitly override the snychronous bootstrap inline styles injected by app.js
            displayGL.style.display = "block";
            displayGL.style.visibility = "visible";
            displayGL.style.position = "relative";
            
            // Re-apply slider multiples onto the GPU program
            this.handleShaderTuningChange();
        } else {
            // Restore standard canvas layout
            display2D.classList.remove('hidden');
            displayGL.classList.add('hidden');
            
            // Re-hide the WebGL canvas inline, aligning back to app.js's native state
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
            
            // Await async ROM loads, then synchronize the UI slider states to the newly created VDP
            this.orchestrator.loadRom(file.name, arrayBuffer).then(() => {
                this.handleShaderTuningChange();
            });
            
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