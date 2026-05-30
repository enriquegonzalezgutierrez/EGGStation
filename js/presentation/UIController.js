/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: UI Controller (With Cache-Proof Layout Controls)
 * 
 * Maps DOM interactions (buttons, file inputs, selects) and keyboard/touch events 
 * to the Emulator Orchestrator. Swaps viewports via clean display rules to prevent
 * flexbox offset anomalies during active play (SRP).
 */

class UIController {
    /**
     * Initializes the UI Controller and binds all browser and touch events.
     * @param {EmulatorOrchestrator} orchestrator - The application layer service managing the emulator.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.bindEvents();
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
                this.updateSaveStatePreview(); 
                e.preventDefault(); 
                break;
            case "F3": 
                this.orchestrator.loadState(); 
                e.preventDefault(); 
                break;
        }
    }

    /**
     * Handles keyup events to release DB-9 Controller pins or stop fast-forwarding.
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
     * Reconstitutes the saved screenshot from LocalStorage and renders it to the tooltip thumbnail.
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