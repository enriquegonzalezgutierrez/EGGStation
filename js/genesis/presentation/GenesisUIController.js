/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: Genesis UI and Input Controller
 * 
 * Maps DOM interactions (buttons, file inputs, selects), keyboard/touch events, 
 * and physical input registers directly to the Sega Genesis Orchestrator.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the primary 68K/Z80 
 * input polling callbacks completely from system bus memory spaces.
 */

// Mapped button ID constants matching clownmdemu.h
const GENESIS_BUTTON_UP     = 0;
const GENESIS_BUTTON_DOWN   = 1;
const GENESIS_BUTTON_LEFT   = 2;
const GENESIS_BUTTON_RIGHT  = 3;
const GENESIS_BUTTON_A      = 4;
const GENESIS_BUTTON_B      = 5;
const GENESIS_BUTTON_C      = 6;
const GENESIS_BUTTON_X      = 7;
const GENESIS_BUTTON_Y      = 8;
const GENESIS_BUTTON_Z      = 9;
const GENESIS_BUTTON_START  = 10;
const GENESIS_BUTTON_MODE   = 11;

class GenesisUIController {
    /**
     * Initializes the UI Controller and binds all browser and keyboard events.
     * @param {GenesisOrchestrator} orchestrator - The application layer service managing the emulator.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        
        // Dynamic key states dictionary (stores snychronous active states: true/false)
        this.keysActive = {};

        this.bindEvents();
    }

    /**
     * Attaches event listeners to the DOM elements and the window object.
     */
    bindEvents() {
        // 1. ROM File Loader Button Proxy (Genesis-specific slot)
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
                this.orchestrator.setTvStandard(e.target.value);
            });
        }

        // 3. Keyboard Mappings for Controller and Emulator functions
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    /**
     * Reads the current keyboard states and returns true if pressed.
     * Invoked automatically as a callback by the active Controller Manager.
     * @param {number} playerId - Player index (0 = P1, 1 = P2).
     * @param {number} buttonId - Mapped button ID constant.
     * @returns {boolean} True if pressed.
     */
    inputRequested(playerId, buttonId) {
        if (playerId !== 0) {
            return false; // Port 1 only mapped for keyboard input
        }

        switch (buttonId) {
            case GENESIS_BUTTON_UP:     return this.keysActive['ArrowUp'] === true;
            case GENESIS_BUTTON_DOWN:   return this.keysActive['ArrowDown'] === true;
            case GENESIS_BUTTON_LEFT:   return this.keysActive['ArrowLeft'] === true;
            case GENESIS_BUTTON_RIGHT:  return this.keysActive['ArrowRight'] === true;
            
            case GENESIS_BUTTON_A:      return this.keysActive['z'] === true; // Key Z
            case GENESIS_BUTTON_B:      return this.keysActive['x'] === true; // Key X
            case GENESIS_BUTTON_C:      return this.keysActive['c'] === true; // Key C
            
            case GENESIS_BUTTON_X:      return this.keysActive['a'] === true; // Key A
            case GENESIS_BUTTON_Y:      return this.keysActive['s'] === true; // Key S
            case GENESIS_BUTTON_Z:      return this.keysActive['d'] === true; // Key D
            
            case GENESIS_BUTTON_START:  return this.keysActive['Enter'] === true;
            case GENESIS_BUTTON_MODE:   return this.keysActive['Space'] === true;
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

        // Validate supported extensions (.md, .gen, .bin)
        if (!fname.endsWith('.sms') && !fname.endsWith('.sg') && !fname.endsWith('.md') && !fname.endsWith('.gen') && !fname.endsWith('.bin')) {
            alert("EGGStation::Error: Unsupported ROM file format.");
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
            // Prevent browser scroll on arrow keys
            case "ArrowUp":
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight":
            case "Space":
                e.preventDefault();
                break;

            // Emulator control shortcuts
            case "p": 
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
     * Cleans up the screen by hiding only the file loading button once gameplay starts.
     */
    hideUIForGameplay() {
        const fileSelector = document.getElementById("fileselector");
        if (fileSelector) fileSelector.classList.add("hidden");
    }
}