/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/UniversalDevSuiteManager.js
 * 
 * Role:
 * Presentation Layer: Universal Developer Suite & Diagnostics Manager.
 * Unifies execution control buttons (Play/Pause) globally, and runs a central 
 * 500ms refresh loop to update registers, disassembly logs, and VRAM diagnostics 
 * dynamically based on the active console engine.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for managing 
 *    the developer suite DOM components, execution controls, and periodic polling 
 *    refresh loops.
 * 2. Open/Closed Principle (OCP): Dynamically renders registers and VRAM tables 
 *    by iterating over polymorphic object dictionaries, allowing new console 
 *    Architectures to be added in the future with zero modifications to the DOM.
 * 3. Dependency Inversion Principle (DIP): Communicates with the emulator cores 
 *    through generic abstraction hooks (getRegisters, drawVramDiagnostics), 
 *    decoupling it completely from specific CPU loop contexts.
 */

class UniversalDevSuiteManager {
    constructor() {
        this.vramCanvas = null;
        this.vramCtx = null;
        this.devIntervalId = null;

        this.initializeListeners();
        this.startRefreshLoop();
    }

    /**
     * Attaches global, persistent click listeners to the Dev Mode buttons once.
     */
    initializeListeners() {
        document.addEventListener("DOMContentLoaded", () => {
            const dbgPlay = document.getElementById('dbg-play');
            const dbgPause = document.getElementById('dbg-pause');
            this.vramCanvas = document.getElementById('vram-canvas');
            
            if (this.vramCanvas) {
                this.vramCtx = this.vramCanvas.getContext('2d');
            }

            // Universal play binding
            dbgPlay?.addEventListener('click', () => {
                if (window.activeOrchestrator) {
                    window.activeOrchestrator.isDebugging = false;
                    window.activeOrchestrator.isPaused = false;
                }
            });

            // Universal pause binding
            dbgPause?.addEventListener('click', () => {
                if (window.activeOrchestrator) {
                    window.activeOrchestrator.isDebugging = true;
                    this.refreshDiagnostics(); // Immediate force update on pause
                }
            });

            console.log("[UniversalDevSuiteManager] Universal Dev Mode Play/Pause listeners registered.");
        });
    }

    /**
     * Runs a single, consolidated 500ms timer to refresh visible debug details.
     */
    startRefreshLoop() {
        this.devIntervalId = setInterval(() => {
            const devSuite = document.getElementById('developer-suite');
            
            // Only update when the Dev Mode panel is actively expanded on screen
            if (devSuite && !devSuite.classList.contains('hidden') && window.activeOrchestrator && window.activeOrchestrator.isRunning) {
                this.refreshDiagnostics();
            }
        }, 500);
    }

    /**
     * Polls the active orchestrator polimorphically and updates the DOM grid.
     */
    refreshDiagnostics() {
        const orchestrator = window.activeOrchestrator;
        if (!orchestrator) return;

        // 1. Render CPU Registers (Dynamic Grid Layout)
        if (typeof orchestrator.getRegisters === 'function') {
            const registers = orchestrator.getRegisters();
            this.updateRegistersGrid(registers);
        }

        // 2. Render Real-time Disassembly instructions
        if (typeof orchestrator.getDisassembly === 'function') {
            const disassemblyLines = orchestrator.getDisassembly();
            this.updateDisassemblyTerminal(disassemblyLines);
        }

        // 3. Render raw VRAM tile patterns onto the diagnostic canvas
        if (this.vramCtx && typeof orchestrator.drawVramDiagnostics === 'function') {
            orchestrator.drawVramDiagnostics(this.vramCtx);
        }
    }

    /**
     * Completely uncoupled registers grid drawer.
     * Iterates over arbitrary dictionaries snychronously to generate UI nodes.
     * @param {Object} registers - Key-Value map of register values (e.g. { AF: "0040", BC: "1234" })
     */
    updateRegistersGrid(registers) {
        const grid = document.getElementById("reg-grid");
        if (!grid || !registers) return;

        grid.innerHTML = ""; // Clear old registers snychronously

        for (const [name, value] of Object.entries(registers)) {
            const item = document.createElement("div");
            item.className = "reg-item";
            item.innerHTML = `${name}: <span>${value}</span>`;
            grid.appendChild(item);
        }
    }

    /**
     * Populates the system logs terminal with disassembled program code.
     * @param {string[]} lines - Program disassembly array.
     */
    updateDisassemblyTerminal(lines) {
        const disasmBox = document.getElementById('log');
        if (!disasmBox || !lines) return;

        disasmBox.innerHTML = ''; // Clear previous logs

        lines.forEach((text, idx) => {
            const line = document.createElement('div');
            line.className = 'disasm-line' + (idx === 0 ? ' active' : '');
            line.textContent = text;
            disasmBox.appendChild(line);
        });
    }
}

// Instantiate globally as an active shared presenter debugger service
window.UniversalDevSuite = new UniversalDevSuiteManager();