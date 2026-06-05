/**
 * Project: EGGStation - Super Nintendo (SNES) Presentation Layer
 * Author: Enrique González Gutiérrez
 * File: js/snes/presentation/SnesUIController.js
 * 
 * Role:
 * Presentation Layer: SnesUIController (Refactored & Decoupled).
 * Handles DOM UI interactions, file loading processes, WebGL2 shader tuners, 
 * and maps mobile virtual gamepad actions directly to the UniversalInput Manager.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for binding 
 *    SNES UI elements and mapping mobile virtual buttons to UniversalInput.
 * 2. Dependency Inversion Principle (DIP): Instead of hardcoding key listeners 
 *    directly inside the SNES core, it relies on the high-level shared service 
 *    window.UniversalInput, decoupling it completely from physical hardware.
 */

class SnesUIController {
    /**
     * @param {SnesOrchestrator} orchestrator - The active SNES system adapter.
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.initializeUIState();
        this.bindEvents();
        this.mapVirtualControls();

        console.log("[SnesUIController] UI Presentation Mediator Initialized.");
    }

    /**
     * Aligns active UI selections on startup.
     */
    initializeUIState() {
        const snesSection = document.getElementById('snes-config-section');
        const smsSection = document.getElementById('sms-config-section');
        if (snesSection) snesSection.classList.remove('hidden');
        if (smsSection) smsSection.classList.add('hidden');

        const postSelector = document.getElementById('postProcessSelector');
        const audioSelector = document.getElementById('audioFilterSelector');
        
        const activeVideoFilter = postSelector ? parseInt(postSelector.value, 10) : 0;
        const activeAudioFilter = audioSelector ? parseInt(audioSelector.value, 10) : 0;
        
        this.updateVideoPipeline(activeVideoFilter);
        this.orchestrator.setAudioFilterMode(activeAudioFilter);

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

        loaderBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.onFileSelected(e));

        videoSelector?.addEventListener('change', (e) => {
            this.updateVideoPipeline(parseInt(e.target.value, 10));
        });

        audioSelector?.addEventListener('change', (e) => {
            this.orchestrator.setAudioFilterMode(parseInt(e.target.value, 10));
        });

        curveSlider?.addEventListener('input', () => this.syncShaders());
        scanlineSlider?.addEventListener('input', () => this.syncShaders());
    }

    /**
     * Swaps display canvas DOM visibility and overrides inline styles.
     */
    updateVideoPipeline(mode) {
        this.orchestrator.setPostProcessMode(mode);

        const videoCanvas = document.getElementById("smsdisplay");
        const glCanvas = document.getElementById("webgldisplay");

        if (!videoCanvas || !glCanvas) return;

        if (mode === 6) {
            videoCanvas.classList.add("hidden");
            glCanvas.classList.remove("hidden");
            
            glCanvas.style.display = "block";
            glCanvas.style.visibility = "visible";
            glCanvas.style.position = "relative";
            
            this.syncShaders();
        } else {
            videoCanvas.classList.remove("hidden");
            glCanvas.classList.add("hidden");
            
            glCanvas.style.display = "none";
            glCanvas.style.visibility = "hidden";
            glCanvas.style.position = "absolute";

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

        this.orchestrator.updateShaderUniforms(
            curvature / 90, 
            scanlines / 38, 
            1.0, 
            1.0
        );
    }

    /**
     * Handles file input uploads. Supports SNES (.sfc, .smc) and standard compressed .zip
     * leveraging the universal shared RomDecompressor utility.
     */
    async onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fname = file.name.toLowerCase();

        try {
            let romData;
            let romName = file.name;

            if (fname.endsWith('.zip')) {
                // Extract the rom inside the zip using the shared RomDecompressor
                const decompressed = await RomDecompressor.decompress(file, /\.(sfc|smc)$/i);
                romData = decompressed.data; // RomDecompressor returns Uint8Array
                romName = decompressed.filename;
            } else if (fname.endsWith('.sfc') || fname.endsWith('.smc')) {
                const reader = new FileReader();
                const arrayBuffer = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (err) => reject(err);
                    reader.readAsArrayBuffer(file);
                });
                romData = new Uint8Array(arrayBuffer);
            } else {
                alert("EGGStation::Error: System only supports .sfc, .smc and compressed .zip ROM files.");
                return;
            }

            // Boot the resolved rom
            this.bootRom(romData, false);
        } catch (error) {
            console.error("[SnesUIController] File upload or decompression failed:", error);
            alert("ROM Decompression/Load error: " + error.message);
        }
    }

    bootRom(romData, isHirom) {
        try {
            this.orchestrator.loadCartridge(romData, isHirom);
            
            // PHASE 4: Trigger the immersive CRT "Warm-up" (Power On) visual effect
            if (typeof triggerCrtWarmUp === 'function') triggerCrtWarmUp();

            document.getElementById('fileselector')?.classList.add('hidden');
        } catch (error) {
            alert("Hardware initialization exception: " + error.message);
        }
    }

    /**
     * Mobile screen virtual gamepad configuration mapping.
     */
    mapVirtualControls() {
        const buttons = [
            { id: 'v-up', btn: 'UP' }, { id: 'v-down', btn: 'DOWN' }, { id: 'v-left', btn: 'LEFT' }, { id: 'v-right', btn: 'RIGHT' },
            { id: 'v-btn1', btn: 'A' }, { id: 'v-btn2', btn: 'B' }, { id: 'v-btnX', btn: 'X' }, { id: 'v-btnY', btn: 'Y' },
            { id: 'v-select', btn: 'SELECT' }
        ];

        buttons.forEach(item => {
            const el = document.getElementById(item.id);
            if (!el) return;
            
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                window.UniversalInput.virtualButtons[item.btn] = true;
            });
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                window.UniversalInput.virtualButtons[item.btn] = false;
            });
            el.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                window.UniversalInput.virtualButtons[item.btn] = false;
            });
        });
    }

    /**
     * Diagnostic developer tab: Updates CPU registers directly on the DOM grid.
     */
    updateDebuggerUI() {
        const grid = document.getElementById('reg-grid');
        if (!grid || !this.orchestrator.isRunning) return;

        const cpu = this.orchestrator.hardware.cpu;
        
        grid.innerHTML = `
            <div class="reg-item"><span>PC:</span> $${getLongRep((cpu.r[1] << 16) | cpu.br[4])}</div>
            <div class="reg-item"><span>A:</span> $${getWordRep(cpu.br[0])}</div>
            <div class="reg-item"><span>X:</span> $${getWordRep(cpu.br[1])}</div>
            <div class="reg-item"><span>Y:</span> $${getWordRep(cpu.br[2])}</div>
            <div class="reg-item"><span>SP:</span> $${getWordRep(cpu.br[3])}</div>
            <div class="reg-item"><span>DPR:</span> $${getWordRep(cpu.br[5])}</div>
        `;
    }
}