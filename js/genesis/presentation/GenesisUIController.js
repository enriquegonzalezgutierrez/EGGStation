/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: Genesis UI and Input Controller
 * 
 * Maps DOM interactions (buttons, file inputs, selects), keyboard/touch events, 
 * and physical input registers directly to the Sega Genesis Orchestrator.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates UI event bindings and keyboard 
 *   layouts from the core execution clocks and system memory buses.
 * - Dependency Inversion Principle (DIP): Injects the frontend input poller 
 *   directly into the core's input manager, keeping the domain agnostic of the DOM.
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

        // 4. Inject the keyboard poller into the hardware Controller Manager (DIP)
        // This guarantees the hardware domain never queries the DOM directly.
        if (this.orchestrator && this.orchestrator.controllerManager) {
            this.orchestrator.controllerManager.bindInputPoller((playerId, buttonId) => {
                return this.inputRequested(playerId, buttonId);
            });
        }
    }

    /**
     * Reads the current keyboard states and returns true if pressed.
     * Invoked automatically as a callback by the active Controller Manager.
     * Note: Uses GENESIS_CONTROLLER_* constants defined in GenesisControllerManager.js
     * 
     * @param {number} playerId - Player index (0 = P1, 1 = P2).
     * @param {number} buttonId - Mapped button ID constant.
     * @returns {boolean} True if pressed.
     */
    inputRequested(playerId, buttonId) {
        if (playerId !== 0) {
            return false; // Port 1 only mapped for standard keyboard input
        }

        switch (buttonId) {
            case GENESIS_CONTROLLER_UP:     return this.keysActive['ArrowUp'] === true;
            case GENESIS_CONTROLLER_DOWN:   return this.keysActive['ArrowDown'] === true;
            case GENESIS_CONTROLLER_LEFT:   return this.keysActive['ArrowLeft'] === true;
            case GENESIS_CONTROLLER_RIGHT:  return this.keysActive['ArrowRight'] === true;
            
            case GENESIS_CONTROLLER_A:      return this.keysActive['z'] === true || this.keysActive['Z'] === true; 
            case GENESIS_CONTROLLER_B:      return this.keysActive['x'] === true || this.keysActive['X'] === true; 
            case GENESIS_CONTROLLER_C:      return this.keysActive['c'] === true || this.keysActive['C'] === true; 
            
            case GENESIS_CONTROLLER_X:      return this.keysActive['a'] === true || this.keysActive['A'] === true; 
            case GENESIS_CONTROLLER_Y:      return this.keysActive['s'] === true || this.keysActive['S'] === true; 
            case GENESIS_CONTROLLER_Z:      return this.keysActive['d'] === true || this.keysActive['D'] === true; 
            
            case GENESIS_CONTROLLER_START:  return this.keysActive['Enter'] === true;
            case GENESIS_CONTROLLER_MODE:   return this.keysActive[' '] === true; // Spacebar
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
            case " ":
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
     * Cleans up the screen by hiding the file loading button once gameplay starts.
     */
    hideUIForGameplay() {
        const fileSelector = document.getElementById("fileselector");
        if (fileSelector) fileSelector.classList.add("hidden");
    }
}