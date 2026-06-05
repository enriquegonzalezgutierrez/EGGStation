/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/presentation/GenesisUIController.js
 * 
 * Role:
 * Presentation Layer: Genesis UI and Input Controller (Refactored & Decoupled).
 * Maps UI triggers (buttons, sliders, debug options) and directs emulated controller 
 * lines to the universal shared UniversalInput Manager.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for binding 
 *    Genesis UI elements and mapping emulator polling lines to UniversalInput.
 * 2. Dependency Inversion Principle (DIP): Depends on the shared service 
 *    window.UniversalInput instead of directly binding legacy gamepad polling 
 *    or raw document keyboard listeners.
 */

class GenesisUIController {
    /**
     * Initializes the UI Controller and binds all browser and keyboard events.
     * @param {GenesisOrchestrator} orchestrator - The active Genesis system adapter.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.bindEvents();

        // Swap the registers panel DOM layout to support the 16 M68K registers
        this.swapTo68kRegisters();

        // Inject the universal shared input poller into the controller manager (DIP)
        if (this.orchestrator && this.orchestrator.controllerManager) {
            this.orchestrator.controllerManager.bindInputPoller((playerId, buttonId) => {
                return this.inputRequested(playerId, buttonId);
            });
        }

        // Periodically refresh the registers, disassembly and VRAM tile viewer
        this.devIntervalId = setInterval(() => {
            const devSuite = document.getElementById('developer-suite');
            
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
     * Attaches event listeners to the DOM elements.
     */
    bindEvents() {
        // 1. ROM File Loader Button Proxy
        const loaderBtn = document.getElementById('romLoaderBtn');
        const fileSelector = document.getElementById('cartridgeSelector');
        
        if (loaderBtn && fileSelector) {
            loaderBtn.addEventListener('click', () => { 
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

        // 2. Post-Processing Visual Filters Selector
        const postProcessSelector = document.getElementById('postProcessSelector');
        if (postProcessSelector) {
            postProcessSelector.addEventListener('change', (e) => {
                const mode = parseInt(e.target.value, 10);
                this.handlePostProcessChange(mode);
            });
        }

        // 3. WebGL2 CRT Shader Tuning Sliders
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

        // 4. Developer Mode Debugger Suite Buttons & Inputs (68K CPU Stepper)
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
     * Gathers, decodes and formats all 68K CPU register values.
     */
    updateDebuggerUI() {
        if (!this.orchestrator.m68k || !this.orchestrator.isRunning) return;

        const m68k = this.orchestrator.m68k;

        // Update all 8 Data Registers
        for (let i = 0; i < 8; i++) {
            const el = document.getElementById(`reg-d${i}`);
            if (el) el.textContent = m68k.d[i].toString(16).toUpperCase().padStart(8, '0');
        }

        // Update all 8 Address Registers
        for (let i = 0; i < 8; i++) {
            const el = document.getElementById(`reg-a${i}`);
            if (el) el.textContent = m68k.a[i].toString(16).toUpperCase().padStart(8, '0');
        }

        // Update Program Counter (PC)
        const pcEl = document.getElementById('reg-pc');
        if (pcEl) pcEl.textContent = m68k.pc.toString(16).toUpperCase().padStart(8, '0');

        // Update Status Register (SR)
        const srEl = document.getElementById('reg-sr');
        if (srEl) srEl.textContent = m68k.sr.toString(16).toUpperCase().padStart(4, '0');

        // Update Disassembly Terminal readout
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

        // Rasterize active 4bpp VRAM Pattern Tiles onto the secondary canvas
        const vramCanvas = document.getElementById('vram-canvas');
        if (vramCanvas) {
            const ctx = vramCanvas.getContext('2d');
            this.orchestrator.rasterizeVramTiles(ctx);
        }
    }

    /**
     * Reads the current keyboard or gamepad states from UniversalInput.
     */
    inputRequested(playerId, buttonId) {
        if (playerId !== 0 || !window.UniversalInput) {
            return false; 
        }

        // Map Genesis registers directly to UniversalInput semantic virtual states
        switch (buttonId) {
            case GENESIS_CONTROLLER_UP:     return window.UniversalInput.isPressed("UP");
            case GENESIS_CONTROLLER_DOWN:   return window.UniversalInput.isPressed("DOWN");
            case GENESIS_CONTROLLER_LEFT:   return window.UniversalInput.isPressed("LEFT");
            case GENESIS_CONTROLLER_RIGHT:  return window.UniversalInput.isPressed("RIGHT");
            
            case GENESIS_CONTROLLER_A:      return window.UniversalInput.isPressed("B"); // Maps cross to standard Sega A
            case GENESIS_CONTROLLER_B:      return window.UniversalInput.isPressed("A"); // Maps circle to standard Sega B
            case GENESIS_CONTROLLER_C:      return window.UniversalInput.isPressed("X"); // Maps square to standard Sega C
            
            case GENESIS_CONTROLLER_X:      return window.UniversalInput.isPressed("Y"); // Maps triangle to Sega X
            case GENESIS_CONTROLLER_Y:      return window.UniversalInput.isPressed("L"); // Sega Y
            case GENESIS_CONTROLLER_Z:      return window.UniversalInput.isPressed("R"); // Sega Z
            
            case GENESIS_CONTROLLER_START:  return window.UniversalInput.isPressed("START");
            case GENESIS_CONTROLLER_MODE:   return window.UniversalInput.isPressed("SELECT");
        }

        return false;
    }

    /**
     * Reads the selected cartridge file. Supports native .md, .gen, .bin, .smd and compressed .zip
     * leveraging the universal shared RomDecompressor utility.
     */
    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        const fname = file.name.toLowerCase();

        try {
            let romData;
            let romName = file.name;

            if (fname.endsWith('.zip')) {
                // Extract the rom inside the zip using the shared RomDecompressor
                const decompressed = await RomDecompressor.decompress(file, /\.(md|gen|bin|smd)$/i);
                romData = decompressed.data.buffer; // Needs to be ArrayBuffer
                romName = decompressed.filename;
            } else if (fname.endsWith('.md') || fname.endsWith('.gen') || fname.endsWith('.bin') || fname.endsWith('.smd')) {
                const reader = new FileReader();
                romData = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsArrayBuffer(file);
                });
            } else {
                alert("EGGStation::Error: System only supports .md, .gen, .bin, .smd and compressed .zip ROM files.");
                return;
            }

            // Boot the resolved rom
            this.orchestrator.loadRom(romName, romData);
            
            // PHASE 4: Trigger the immersive CRT "Warm-up" (Power On) visual effect
            if (typeof triggerCrtWarmUp === 'function') triggerCrtWarmUp();

            this.hideUIForGameplay();
        } catch (error) {
            console.error("[GenesisUIController] File upload or decompression failed:", error);
            alert("ROM Decompression/Load error: " + error.message);
        }
    }

    /**
     * Handles changes in the post-processing filter, toggling canvas styles via inline JS.
     */
    handlePostProcessChange(mode) {
        const display2D = document.getElementById("smsdisplay");
        const displayGL = document.getElementById("webgldisplay");
        if (!display2D || !displayGL) return;

        if (mode === 6) {
            display2D.classList.add('hidden');
            displayGL.classList.remove('hidden');
            
            displayGL.style.display = "block";
            displayGL.style.visibility = "visible";
            displayGL.style.position = "relative";
            
            this.handleShaderTuningChange();
        } else {
            display2D.classList.remove('hidden');
            displayGL.classList.add('hidden');
            
            displayGL.style.display = "none";
            displayGL.style.visibility = "hidden";
            displayGL.style.position = "absolute";

            if (mode === 1) {
                display2D.style.imageRendering = "auto";
            } else {
                display2D.style.imageRendering = "pixelated";
            }
        }

        this.orchestrator.postProcessMode = mode;
    }

    /**
     * Gathers current range slider states and streams them into active GPU uniform variables.
     */
    handleShaderTuningChange() {
        const curvVal = parseInt(document.getElementById('sh-curvature')?.value || "90", 10) / 90;
        const scanVal = parseInt(document.getElementById('sh-scanlines')?.value || "38", 10) / 38;
        const phosVal = parseInt(document.getElementById('sh-phosphor')?.value || "25", 10) / 25;
        const blmVal  = parseInt(document.getElementById('sh-bloom')?.value || "15", 10) / 15;

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