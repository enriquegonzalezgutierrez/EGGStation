/**
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/sms/presentation/SmsUIController.js
 * 
 * Role:
 * Presentation Layer: Sega Master System (SMS) UI & Input Controller.
 * Handles DOM UI interactions, file loading processes, WebGL2 shader tuners, 
 * and maps mobile virtual gamepad actions directly to the UniversalInput Manager.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for bridging 
 *    DOM elements and updating the global UniversalInput buffer. It contains no 
 *    emulation cycles or low-level keyboard/gamepad polling code.
 * 2. Dependency Inversion Principle (DIP): Instead of hardcoding keyboard events 
 *    and gamepad indices directly inside the SMS core, it relies on the high-level 
 *    abstraction window.UniversalInput, decoupling it completely from physical hardware.
 */

class SmsUIController {
    /**
     * @param {SmsOrchestrator} orchestrator - The active SMS system adapter.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.bindEvents();
        this.bindVirtualGamepadEvents();

        // Restore the registers panel DOM layout to the original Z80 structure
        this.restoreZ80Registers();

        // Periodically refresh SMS registers, disassembly and VRAM tile viewer
        this.devIntervalId = setInterval(() => {
            const devSuite = document.getElementById('developer-suite');
            
            if (typeof activeController !== 'undefined' && activeController !== null && activeController !== this) {
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

        // 6. Light Phaser Mouse & Touch Event Listeners
        const crtWrapper = document.getElementById('crt-wrapper');
        if (crtWrapper) {
            crtWrapper.addEventListener('mousedown', (e) => this.handlePhaserClick(e));
            crtWrapper.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) {
                    this.handlePhaserClick(e.touches[0]);
                }
            });
        }

        // 7. WebGL2 CRT Shader Tuning Sliders
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

        // 8. Developer Mode Debugger Suite Buttons & Inputs (Z80 CPU Stepper)
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
                    console.log(`SmsUIController::Breakpoint bound to address: 0x${this.orchestrator.breakpointAddress.toString(16).toUpperCase().padStart(4, '0')}`);
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
     * Swaps the registers panel DOM layout back to the original Z80 structure.
     */
    restoreZ80Registers() {
        const grid = document.querySelector('.registers-grid');
        if (grid) {
            grid.innerHTML = `
                <div>AF: <span id="reg-af">0040</span></div>
                <div>BC: <span id="reg-bc">0000</span></div>
                <div>DE: <span id="reg-de">0000</span></div>
                <div>HL: <span id="reg-hl">0000</span></div>
                <div>IX: <span id="reg-ix">FFFF</span></div>
                <div>IY: <span id="reg-iy">FFFF</span></div>
                <div>SP: <span id="reg-sp">DFF0</span></div>
                <div>PC: <span id="reg-pc">0000</span></div>
            `;
        }
    }

    /**
     * Gathers, decodes and formats all Z80 CPU register values.
     */
    updateDebuggerUI() {
        if (!this.orchestrator.cpu || !this.orchestrator.isRunning) return;

        const cpu = this.orchestrator.cpu;
        const reg = cpu.registers;

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

        const disasmBox = document.getElementById('disasm-output');
        if (disasmBox) {
            disasmBox.innerHTML = ''; 

            const instructions = Z80Disassembler.disassembleBlock(cpu, 5);
            instructions.forEach((instr, idx) => {
                const line = document.createElement('div');
                line.className = 'disasm-line' + (idx === 0 ? ' active' : '');
                
                const hexAddr = instr.address.toString(16).toUpperCase().padStart(4, '0');
                line.textContent = `${hexAddr}: ${instr.decodedString}`;
                disasmBox.appendChild(line);
            });
        }

        const vramCanvas = document.getElementById('vram-canvas');
        if (vramCanvas) {
            const ctx = vramCanvas.getContext('2d');
            this.orchestrator.rasterizeVramTiles(ctx);
        }
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
     * Intercepts pointer coordinates over the CRT wrapper and translates them into 
     * 256x240 pixel space, triggering the physical light phaser registers.
     */
    handlePhaserClick(e) {
        const display2D = document.getElementById("smsdisplay");
        if (!display2D || !this.orchestrator.isRunning) return;

        const rect = display2D.getBoundingClientRect();
        
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * 256);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * 240);

        if (x >= 0 && x < 256 && y >= 0 && y < 240) {
            const vdp = this.orchestrator.vdp;
            const io = this.orchestrator.ioController;

            if (vdp && io) {
                vdp.phaserClicked = true;
                vdp.phaserX = x;
                vdp.phaserY = y;

                // Pull trigger on UniversalInput directly
                window.UniversalInput.virtualButtons["B"] = true;
                io.writePinStateDD('PORT_A_TR', true);

                setTimeout(() => {
                    vdp.phaserClicked = false;
                    window.UniversalInput.virtualButtons["B"] = false;
                    io.writePinStateDD('PORT_A_TR', false);
                }, 80);
            }
        }
    }

    /**
     * Maps the Mobile Gamepad touch zones to update UniversalInput central buffer states.
     */
    bindVirtualGamepadEvents() {
        const mapTouchPin = (elementId, semanticButton) => {
            const element = document.getElementById(elementId);
            if (!element) return;

            element.addEventListener('touchstart', (e) => {
                e.preventDefault(); 
                window.UniversalInput.virtualButtons[semanticButton] = true;
            });

            const releaseHandler = (e) => {
                e.preventDefault();
                window.UniversalInput.virtualButtons[semanticButton] = false;
            };

            element.addEventListener('touchend', releaseHandler);
            element.addEventListener('touchcancel', releaseHandler);
        };

        mapTouchPin('v-up', 'UP');
        mapTouchPin('v-down', 'DOWN');
        mapTouchPin('v-left', 'LEFT');
        mapTouchPin('v-right', 'RIGHT');
        mapTouchPin('v-btn1', 'B');
        mapTouchPin('v-btn2', 'A');

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

        this.orchestrator.setPostProcessMode(mode);
    }

    /**
     * Reads the selected cartridge file and passes the raw binary buffer to the Orchestrator.
     */
    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        const fname = file.name.toLowerCase();

        if (!fname.endsWith('.sms') && !fname.endsWith('.sg')) {
            alert("EGGStation::Error: System only supports .sms and .sg ROM files.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target.result;
            
            this.orchestrator.loadRom(file.name, arrayBuffer).then(() => {
                this.handleShaderTuningChange();
            });
            
            this.hideUIForGameplay();
        };
        reader.readAsArrayBuffer(file);
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