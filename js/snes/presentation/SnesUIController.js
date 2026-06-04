/**
 * Project: EGGStation - Super Nintendo (SNES) Presentation Layer
 * Component: SnesUIController (Legacy Core Adapter Version)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles DOM events, physical keyboard inputs, mobile virtual gamepads, 
 * and coordinates the display swapping between the standard 2D Canvas 
 * and the WebGL2 advanced CRT shader canvas.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Exclusively maps user actions to 
 *   emulator hardware inputs and manages viewport visibility states.
 */

class SnesUIController {
    /**
     * @param {SnesOrchestrator} orchestrator - The active SNES system adapter.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        // SNES Controller Port 1 Register Input Mappings
        // Matches the standard Ricoh 5A22 controller read register mapping index
        this.inputMap = {
            "z": 0,          // B button
            "a": 1,          // Y button
            "shift": 2,      // Select button
            "enter": 3,      // Start button
            "arrowup": 4,    // D-Pad Up
            "arrowdown": 5,  // D-Pad Down
            "arrowleft": 6,  // D-Pad Left
            "arrowright": 7, // D-Pad Right
            "x": 8,          // A button
            "s": 9,          // X button
            "d": 10,         // L shoulder trigger
            "c": 11          // R shoulder trigger
        };

        // State tracker for physical gamepads to process edge-detection (press/release only)
        this.gamepadState = {
            b: false,      y: false,      select: false, start: false,
            up: false,     down: false,   left: false,   right: false,
            a: false,      x: false,      l: false,      r: false
        };

        this.initializeUIState();
        this.bindEvents();

        // Initiate the hardware gamepad polling loop
        this.pollGamepads();

        console.log("[EGGStation::SNES] UI Presentation Mediator with Canvas Toggle and Gamepad support initialized.");
    }

    /**
     * Aligns active UI selections on startup.
     */
    initializeUIState() {
        // Safe check to hide SMS elements when SNES boots
        const snesSection = document.getElementById('snes-config-section');
        const smsSection = document.getElementById('sms-config-section');
        if (snesSection) snesSection.classList.remove('hidden');
        if (smsSection) smsSection.classList.add('hidden');

        // Capture active filter selections on startup from EGGStation control panel
        const postSelector = document.getElementById('postProcessSelector');
        const audioSelector = document.getElementById('audioFilterSelector');
        
        const activeVideoFilter = postSelector ? parseInt(postSelector.value, 10) : 0;
        const activeAudioFilter = audioSelector ? parseInt(audioSelector.value, 10) : 0;
        
        // Force the video pipeline to align visibility states instantly at boot
        this.updateVideoPipeline(activeVideoFilter);
        this.orchestrator.setAudioFilterMode(activeAudioFilter);

        // Sync CRT shader defaults
        this.syncShaders();
    }

    /**
     * Hooks event listeners to DOM selectors.
     */
    bindEvents() {
        const loaderBtn = document.getElementById('romLoaderBtn');
        const fileInput = document.getElementById('cartridgeSelector');
        const videoSelector = document.getElementById('postProcessSelector');
        const audioSelector = document.getElementById('audioFilterSelector');
        const curveSlider = document.getElementById('sh-curvature');
        const scanlineSlider = document.getElementById('sh-scanlines');
        const phosphorSlider = document.getElementById('sh-phosphor');
        const bloomSlider = document.getElementById('sh-bloom');

        loaderBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.onFileSelected(e));

        // Video filter selector triggers the UI Canvas visibility toggle
        videoSelector?.addEventListener('change', (e) => {
            this.updateVideoPipeline(parseInt(e.target.value, 10));
        });

        audioSelector?.addEventListener('change', (e) => {
            this.orchestrator.setAudioFilterMode(parseInt(e.target.value, 10));
        });

        // WebGL2 tuning slider event hooks
        curveSlider?.addEventListener('input', () => this.syncShaders());
        scanlineSlider?.addEventListener('input', () => this.syncShaders());
        phosphorSlider?.addEventListener('input', () => this.syncShaders());
        bloomSlider?.addEventListener('input', () => this.syncShaders());

        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e, true));
        window.addEventListener('keyup', (e) => this.handleKeyboardInput(e, false));

        this.mapVirtualControls();
    }

    /**
     * Continuous polling loop for the HTML5 Gamepad API.
     * Scans and maps the first active gamepad.
     */
    pollGamepads() {
        // Safe check: Stop loop if the active controller changes
        if (typeof activeController !== 'undefined' && activeController !== null && activeController !== this) {
            return;
        }

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp = null;

        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                gp = gamepads[i];
                break;
            }
        }

        if (gp) {
            const DEADZONE = 0.5;

            const leftStickH = gp.axes[0] || 0;
            const leftStickV = gp.axes[1] || 0;
            const dpadAxisH  = gp.axes[4] || gp.axes[6] || gp.axes[2] || 0;
            const dpadAxisV  = gp.axes[5] || gp.axes[7] || gp.axes[3] || 0;

            // 1. Map D-pad / sticks movement
            const up    = gp.buttons[12]?.pressed || leftStickV < -DEADZONE || dpadAxisV < -DEADZONE;
            const down  = gp.buttons[13]?.pressed || leftStickV > DEADZONE  || dpadAxisV > DEADZONE;
            const left  = gp.buttons[14]?.pressed || leftStickH < -DEADZONE || dpadAxisH < -DEADZONE;
            const right = gp.buttons[15]?.pressed || leftStickH > DEADZONE  || dpadAxisH > DEADZONE;

            // 2. Map standard SNES button layout
            const b      = gp.buttons[0]?.pressed; // Button South (A Nintendo / B Xbox)
            const a      = gp.buttons[1]?.pressed; // Button East  (B Nintendo / A Xbox)
            const y      = gp.buttons[2]?.pressed; // Button West  (Y Nintendo / X Xbox)
            const x      = gp.buttons[3]?.pressed; // Button North (X Nintendo / Y Xbox)
            const l      = gp.buttons[4]?.pressed; // Left Bumper
            const r      = gp.buttons[5]?.pressed; // Right Bumper
            const select = gp.buttons[8]?.pressed; // Select / Back button
            const start  = gp.buttons[9]?.pressed; // Start button

            // Helper to dispatch inputs with edge-detection
            const triggerInput = (key, isPressed, idx) => {
                if (isPressed && !this.gamepadState[key]) {
                    this.orchestrator.sendInput(idx, true);
                    this.gamepadState[key] = true;
                } else if (!isPressed && this.gamepadState[key]) {
                    this.orchestrator.sendInput(idx, false);
                    this.gamepadState[key] = false;
                }
            };

            // Process inputs through standard orchestrator mapping indexes
            triggerInput('b', b, 0);
            triggerInput('y', y, 1);
            triggerInput('select', select, 2);
            triggerInput('start', start, 3);
            triggerInput('up', up, 4);
            triggerInput('down', down, 5);
            triggerInput('left', left, 6);
            triggerInput('right', right, 7);
            triggerInput('a', a, 8);
            triggerInput('x', x, 9);
            triggerInput('l', l, 10);
            triggerInput('r', r, 11);
        }

        requestAnimationFrame(() => this.pollGamepads());
    }

    /**
     * UNIFIED CANVAS TOGGLE (CRITICAL FIX)
     * Swaps display canvas DOM visibility and overrides inline styles to prevent WebGL blackouts.
     */
    updateVideoPipeline(mode) {
        this.orchestrator.setPostProcessMode(mode);

        const videoCanvas = document.getElementById("smsdisplay");
        const glCanvas = document.getElementById("webgldisplay");

        if (!videoCanvas || !glCanvas) return;

        // Mode 6 is WebGL2 CRT Shader, any other mode is mapped to the 2D Canvas
        if (mode === 6) {
            videoCanvas.classList.add("hidden");
            glCanvas.classList.remove("hidden");
            
            // Explicitly override inline styles to guarantee visibility of the GPU surface
            glCanvas.style.display = "block";
            glCanvas.style.visibility = "visible";
            glCanvas.style.position = "relative";
            
            this.syncShaders();
        } else {
            videoCanvas.classList.remove("hidden");
            glCanvas.classList.add("hidden");
            
            // Re-hide WebGL canvas inline to prevent it from overlaying the 2D view
            glCanvas.style.display = "none";
            glCanvas.style.visibility = "hidden";
            glCanvas.style.position = "absolute";

            // Maintain pixelated vs smooth rendering for 2D passes
            if (mode === 1) {
                videoCanvas.style.imageRendering = "auto";
            } else {
                videoCanvas.style.imageRendering = "pixelated";
            }
        }
    }

    /**
     * Pushes real-time shader adjustments to the GPU memory space.
     */
    syncShaders() {
        const curvature = document.getElementById('sh-curvature')?.value || 90;
        const scanlines = document.getElementById('sh-scanlines')?.value || 38;
        const phosphor  = document.getElementById('sh-phosphor')?.value || 25;
        const bloom     = document.getElementById('sh-bloom')?.value || 15;

        // Normalize sliders (0-100/200) to standard 1.0 shader coefficients
        this.orchestrator.updateShaderUniforms(
            curvature / 90, 
            scanlines / 38, 
            phosphor / 25, 
            bloom / 15
        );
    }

    /**
     * Handles file input uploads. Supports SNES (.sfc, .smc) and standard compressed .zip.
     */
    async onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            if (file.name.toLowerCase().endsWith('.zip')) {
                // Pass false as fallback mapper, the core will auto-detect HiROM/LoROM mathematically
                this.decompressZipArchive(buffer, false);
            } else {
                this.bootRom(new Uint8Array(buffer), false);
            }
        } catch (error) {
            console.error("[EGGStation::SNES] File IO Exception:", error);
        }
    }

    bootRom(romData, isHirom) {
        try {
            this.orchestrator.loadCartridge(romData, isHirom);
            document.getElementById('fileselector')?.classList.add('hidden');
        } catch (error) {
            alert("Hardware initialization exception: " + error.message);
        }
    }

    /**
     * Uses inflate.js/deflate.js external tools to decompress ROMs.
     */
    decompressZipArchive(buffer, isHirom) {
        const blob = new Blob([buffer]);
        zip.createReader(new zip.BlobReader(blob), (reader) => {
            reader.getEntries((entries) => {
                const romEntry = entries.find(e => e.filename.match(/\.(sfc|smc)$/i));
                if (romEntry) {
                    romEntry.getData(new zip.Uint8ArrayWriter(), (data) => {
                        this.bootRom(data, isHirom);
                        reader.close();
                    });
                } else {
                    alert("ZIP archive contains no valid SNES ROM (.sfc or .smc).");
                    reader.close();
                }
            });
        }, (err) => console.error("[EGGStation::ZIP] decompression failed:", err));
    }

    /**
     * Direct hardware mapping for keyboard events.
     */
    handleKeyboardInput(event, isPressed) {
        const key = event.key.toLowerCase();
        if (this.inputMap[key] !== undefined) {
            event.preventDefault();
            this.orchestrator.sendInput(this.inputMap[key], isPressed);
        }
    }

    /**
     * Mobile screen virtual gamepad configuration mapping.
     */
    mapVirtualControls() {
        const buttons = [
            { id: 'v-up', idx: 4 }, { id: 'v-down', idx: 5 }, { id: 'v-left', idx: 6 }, { id: 'v-right', idx: 7 },
            { id: 'v-btn1', idx: 8 }, { id: 'v-btn2', idx: 0 }, { id: 'v-btnX', idx: 9 }, { id: 'v-btnY', idx: 1 },
            { id: 'v-select', idx: 2 }, { id: 'v-pause', idx: 3 }
        ];

        buttons.forEach(btn => {
            const domElement = document.getElementById(btn.id);
            if (!domElement) return;
            const action = (pressed) => this.orchestrator.sendInput(btn.idx, pressed);
            
            domElement.addEventListener('mousedown', () => action(true));
            domElement.addEventListener('mouseup', () => action(false));
            domElement.addEventListener('touchstart', (e) => { e.preventDefault(); action(true); });
            domElement.addEventListener('touchend', (e) => { e.preventDefault(); action(false); });
        });
    }

    /**
     * Diagnostic developer tab: Updates CPU registers directly on the DOM grid.
     */
    updateDebuggerUI() {
        const grid = document.getElementById('reg-grid');
        if (!grid || !this.orchestrator.isRunning) return;

        const cpu = this.orchestrator.hardware.cpu;
        
        // Formats absolute 24-bit Program Counter (Bank K + PC) and standard 16-bit registers
        grid.innerHTML = `
            <div class="reg-item"><span>PC:</span> $${getLongRep((cpu.r[1] << 16) | cpu.br[4])}</div>
            <div class="reg-item"><span>A:</span> $${getWordRep(cpu.br[0])}</div>
            <div class="reg-item"><span>X:</span> $${getWordRep(cpu.br[1])}</div>
            <div class="reg-item"><span>Y:</span> $${getWordRep(cpu.br[2])}</div>
            <div class="reg-item"><span>SP:</span> $${getWordRep(cpu.br[3])}</div>
            <div class="reg-item"><span>DPR:</span> $${getWordRep(cpu.br[5])}</div>
        `;
    }

    updateSaveStatePreview() {
        // Pending: SnesOrchestrator IndexedDB Save-State capture pipeline 
    }
}