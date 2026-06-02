/**
 * Project: EGGStation - Super Nintendo (SNES) Presentation Layer
 * Component: SnesUIController (DOM & Canvas Toggle Version)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Handles DOM events, physical inputs, and coordinates the visibility 
 * swapping between the 2D software Canvas and the WebGL2 hardware Canvas.
 */

class SnesUIController {
    /**
     * @param {SnesOrchestrator} orchestrator 
     */
    constructor(orchestrator) {
        this.orchestrator = orchestrator;

        // SNES Port 1 Input Layout Register Mappings
        this.inputMap = {
            "z": 0, "a": 1, "shift": 2, "enter": 3,
            "arrowup": 4, "arrowdown": 5, "arrowleft": 6, "arrowright": 7,
            "x": 8, "s": 9, "d": 10, "c": 11
        };

        this.initializeUIState();
        this.bindEvents();
        console.log("[EGGStation::SNES] UI Presentation Mediator with Canvas Toggle active.");
    }

    /**
     * Aligns active UI selections on startup.
     */
    initializeUIState() {
        const snesSection = document.getElementById('snes-config-section');
        const smsSection = document.getElementById('sms-config-section');
        if (snesSection) snesSection.classList.remove('hidden');
        if (smsSection) smsSection.classList.add('hidden');

        // Capture active filter selections on startup
        const activeVideoFilter = parseInt(document.getElementById('postProcessSelector')?.value || 0);
        const activeAudioFilter = parseInt(document.getElementById('audioFilterSelector')?.value || 0);
        
        this.updateVideoPipeline(activeVideoFilter);
        this.orchestrator.setAudioFilterMode(activeAudioFilter);

        // Sync shader defaults
        const curvature = document.getElementById('sh-curvature')?.value || 90;
        const scanlines = document.getElementById('sh-scanlines')?.value || 38;
        this.orchestrator.updateShaderUniforms(curvature / 100, scanlines / 100);
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

        // Video filter selector triggers the UI Pipeline update
        videoSelector?.addEventListener('change', (e) => {
            this.updateVideoPipeline(parseInt(e.target.value));
        });

        audioSelector?.addEventListener('change', (e) => {
            this.orchestrator.setAudioFilterMode(e.target.value);
        });

        curveSlider?.addEventListener('input', () => this.syncShaders());
        scanlineSlider?.addEventListener('input', () => this.syncShaders());

        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e, true));
        window.addEventListener('keyup', (e) => this.handleKeyboardInput(e, false));

        this.mapVirtualControls();
    }

    /**
     * UNIFIED CANVAS TOGGLE (Standardized with SMS/MD UI Controllers)
     * Swaps display canvas DOM visibility based on the active render mode.
     */
    updateVideoPipeline(mode) {
        this.orchestrator.setPostProcessMode(mode);

        const videoCanvas = document.getElementById("smsdisplay");
        const glCanvas = document.getElementById("webgldisplay");

        if (!videoCanvas || !glCanvas) return;

        // Mode 6 is WebGL2, any other mode is 2D Canvas
        if (mode === 6) {
            videoCanvas.classList.add("hidden");
            glCanvas.classList.remove("hidden");
        } else {
            videoCanvas.classList.remove("hidden");
            glCanvas.classList.add("hidden");
        }
    }

    syncShaders() {
        const curvature = document.getElementById('sh-curvature')?.value || 90;
        const scanlines = document.getElementById('sh-scanlines')?.value || 38;
        this.orchestrator.updateShaderUniforms(curvature / 100, scanlines / 100);
    }

    async onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        const isHirom = document.getElementById('ishirom-toggle')?.value === "true";
        try {
            const buffer = await file.arrayBuffer();
            if (file.name.toLowerCase().endsWith('.zip')) {
                this.decompressZipArchive(buffer, isHirom);
            } else {
                this.bootRom(new Uint8Array(buffer), isHirom);
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

    handleKeyboardInput(event, isPressed) {
        const key = event.key.toLowerCase();
        if (this.inputMap[key] !== undefined) {
            event.preventDefault();
            this.orchestrator.sendInput(this.inputMap[key], isPressed);
        }
    }

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
        `;
    }

    updateSaveStatePreview() {}
}