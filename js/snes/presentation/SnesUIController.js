/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Presentation Layer: SNES UI and Input Mapping Controller
 * 
 * Maps DOM interactions (buttons, selectors), keyboard events, and physical 
 * Gamepads (USB/Bluetooth) directly onto the SnesOrchestrator interface.
 * Manages the synchronous registration of registers in the Debugger Panel 
 * and handles safe AudioContext activation during user clicks.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates presentation layers, 
 *   Hex registries UI updates, and keyboard/gamepad polling from emulator core loops.
 * - Dependency Inversion Principle (DIP): Injects the orchestrator instance via 
 *   constructor parameters to maintain loose coupling across system bounds.
 */

class SnesUIController {
    /**
     * @param {SnesOrchestrator} orchestrator - Active application-layer orchestrator.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.keysActive = {};
        this.gamepadState = {};

        this.bindEvents();
        this.swapToSnesDebugger();
        this.pollGamepads();

        // Periodically refresh the CPU registers readout when the Developer Suite is expanded
        this.debugIntervalId = setInterval(() => {
            const devPanel = document.getElementById('developer-suite');
            
            // Memory Leak Prevention: Automatically clear the interval if hot-swapped
            if (typeof activeController !== 'undefined' && activeController !== this) {
                clearInterval(this.debugIntervalId); return;
            }
            if (devPanel && !devPanel.classList.contains('hidden') && this.orchestrator.isRunning) {
                this.updateDebuggerUI();
            }
        }, 500);
    }

    /**
     * Binds user gesture events, keyboard inputs, and ROM loaders.
     */
    bindEvents() {
        const loaderBtn = document.getElementById('romLoaderBtn');
        const fileSelector = document.getElementById('cartridgeSelector');
        
        if (loaderBtn && fileSelector) {
            loaderBtn.addEventListener('click', () => {
                // Snychronously initialize and unlock the Web Audio Context
                // directly inside the click event to satisfy browser Autoplay policies.
                if (this.orchestrator) {
                    this.orchestrator.startAudio();
                    if (this.orchestrator.audioCtx && this.orchestrator.audioCtx.state === 'suspended') {
                        this.orchestrator.audioCtx.resume().catch(() => {});
                    }
                }
                fileSelector.click();
            });
        }
        if (fileSelector) {
            fileSelector.addEventListener('change', (e) => this.handleRomUpload(e.target.files));
        }

        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    /**
     * Configures the debugger registration DOM panel to display 16-bit 65816 structures.
     */
    swapToSnesDebugger() {
        const grid = document.querySelector('.registers-grid');
        if (grid) {
            grid.innerHTML = `
                <div>C/A: <span id="reg-ca">0000</span></div>
                <div>X: <span id="reg-x">0000</span></div>
                <div>Y: <span id="reg-y">0000</span></div>
                <div>SP: <span id="reg-sp">01FF</span></div>
                <div>DP: <span id="reg-dp">0000</span></div>
                <div>PB: <span id="reg-pb">00</span></div>
                <div>DB: <span id="reg-db">00</span></div>
                <div>PC: <span id="reg-pc">0000</span></div>
                <div style="grid-column: span 2;">FLAGS: <span id="reg-flags">NVMXDIZC</span></div>
            `;
        }
    }

    /**
     * Gathers current 16-bit register states and writes them as uppercase hex to the DOM.
     */
    updateDebuggerUI() {
        if (!this.orchestrator.cpu || !this.orchestrator.isRunning) return;
        const regs = this.orchestrator.cpu.registers;

        const updateHex = (id, val, padSize = 4) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val.toString(16).toUpperCase().padStart(padSize, '0');
        };

        updateHex('reg-ca', regs.c); updateHex('reg-x', regs.x); updateHex('reg-y', regs.y);
        updateHex('reg-sp', regs.sp); updateHex('reg-dp', regs.dp); updateHex('reg-pb', regs.pb, 2);
        updateHex('reg-db', regs.db, 2); updateHex('reg-pc', regs.pc);

        const flagsEl = document.getElementById('reg-flags');
        if (flagsEl) {
            flagsEl.textContent = (regs.n ? 'N' : 'n') + (regs.v ? 'V' : 'v') + (regs.m ? 'M' : 'm') + 
                (regs.xFlag ? 'X' : 'x') + (regs.d ? 'D' : 'd') + (regs.i ? 'I' : 'i') + 
                (regs.z ? 'Z' : 'z') + (regs.cFlag ? 'C' : 'c') + (regs.e ? ' [E]' : ' [N]');
        }
    }

    /**
     * Polls the browser Gamepad API, mapping physical controller axes/buttons
     * to the SNES input registers inside SnesBus.js.
     */
    pollGamepads() {
        if (typeof activeController !== 'undefined' && activeController !== this) return;

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp = null;
        for (let i = 0; i < gamepads.length; i++) { if (gamepads[i]) { gp = gamepads[i]; break; } }

        if (gp) {
            const setBtn = (bit, pressed) => {
                if (pressed) this.orchestrator.bus.joypad1State |= (1 << bit);
                else this.orchestrator.bus.joypad1State &= ~(1 << bit);
            };

            const DEADZONE = 0.5;
            const leftStickH = gp.axes[0] || 0; const leftStickV = gp.axes[1] || 0;

            // Map D-pad and left analog stick
            setBtn(4, gp.buttons[12]?.pressed || leftStickV < -DEADZONE); // D-pad Up
            setBtn(5, gp.buttons[13]?.pressed || leftStickV > DEADZONE); // D-pad Down
            setBtn(6, gp.buttons[14]?.pressed || leftStickH < -DEADZONE); // D-pad Left
            setBtn(7, gp.buttons[15]?.pressed || leftStickH > DEADZONE); // D-pad Right
            
            // Map SNES Face Buttons (Diamond Configuration)
            setBtn(0, gp.buttons[0]?.pressed); // Button B
            setBtn(8, gp.buttons[1]?.pressed); // Button A
            setBtn(1, gp.buttons[2]?.pressed); // Button Y
            setBtn(9, gp.buttons[3]?.pressed); // Button X
            
            // Map Shoulder Triggers
            setBtn(10, gp.buttons[4]?.pressed); // Shoulder L
            setBtn(11, gp.buttons[5]?.pressed); // Shoulder R
            
            // Map System Control buttons
            setBtn(2, gp.buttons[8]?.pressed); // Select button
            setBtn(3, gp.buttons[9]?.pressed); // Start button

            // Hold triggers (L2/R2) to engage real-time retro temporal rewinding
            this.orchestrator.isRewinding = gp.buttons[6]?.pressed || gp.buttons[7]?.pressed;
        }

        requestAnimationFrame(() => this.pollGamepads());
    }

    /**
     * Reads ROM cartridge files via FileReader.
     * @param {FileList} files - Selected input files list.
     */
    handleRomUpload(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            this.orchestrator.loadRom(file.name, e.target.result);
            const loaderPanel = document.getElementById("fileselector");
            if (loaderPanel) loaderPanel.classList.add("hidden");
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Processes keydown events and binds keyboard states to controller registers.
     */
    handleKeyDown(e) {
        this.keysActive[e.key] = true;
        if (!this.orchestrator.isRunning) return;

        const setBtn = (bit) => { this.orchestrator.bus.joypad1State |= (1 << bit); };

        switch (e.key) {
            case "ArrowRight": setBtn(7); e.preventDefault(); break;
            case "ArrowLeft":  setBtn(6); e.preventDefault(); break;
            case "ArrowDown":  setBtn(5); e.preventDefault(); break;
            case "ArrowUp":    setBtn(4); e.preventDefault(); break;
            case "Enter":      setBtn(3); break; // Start
            case "Shift":      setBtn(2); e.preventDefault(); break; // Select
            case "a": case "A": setBtn(1); break; // Y button
            case "z": case "Z": setBtn(0); break; // B button
            case "c": case "C": setBtn(11); break; // R trigger
            case "d": case "D": setBtn(10); break; // L trigger
            case "s": case "S": setBtn(9); break; // X button
            case "x": case "X": setBtn(8); break; // A button
            
            case "Backspace": this.orchestrator.isRewinding = true; e.preventDefault(); break;
            case "\\": this.orchestrator.fastForward = true; e.preventDefault(); break;
            case "p": case "P": this.orchestrator.togglePause(); break;
        }
    }

    /**
     * Processes keyup events to clear registered button flags.
     */
    handleKeyUp(e) {
        this.keysActive[e.key] = false;
        if (!this.orchestrator.isRunning) return;

        const clearBtn = (bit) => { this.orchestrator.bus.joypad1State &= ~(1 << bit); };

        switch (e.key) {
            case "ArrowRight": clearBtn(7); break;
            case "ArrowLeft":  clearBtn(6); break;
            case "ArrowDown":  clearBtn(5); break;
            case "ArrowUp":    clearBtn(4); break;
            case "Enter":      clearBtn(3); break; 
            case "Shift":      clearBtn(2); break; 
            case "a": case "A": clearBtn(1); break; 
            case "z": case "Z": clearBtn(0); break; 
            case "c": case "C": clearBtn(11); break; 
            case "d": case "D": clearBtn(10); break; 
            case "s": case "S": clearBtn(9); break; 
            case "x": case "X": clearBtn(8); break; 
            
            case "Backspace": this.orchestrator.isRewinding = false; break;
            case "\\": this.orchestrator.fastForward = false; break;
        }
    }
}

window.SnesUIController = SnesUIController;