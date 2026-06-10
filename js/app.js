/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/app.js
 * 
 * Role:
 * System Bootstrapper (Composition Root). Manages the lifecycle, instantiation, 
 * and safe hot-swapping of the emulation engines.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): This file is strictly responsible 
 *    for the DOM structure initialization and dynamic hot-swaps of the active consoles.
 * 2. Open/Closed Principle (OCP): Easily extendable; new system modules can be 
 *    supported by adding their case in the factory loop without breaking previous systems.
 * 3. Liskov Substitution Principle (LSP): All orchestrator engines are treated 
 *    interchangeably. They are all expected to implement loadRom, start, stop, 
 *    saveState, and loadState.
 * 4. Dependency Inversion Principle (DIP): Depends on the high-level shared 
 *    contracts of the Orchestrator, completely decoupled from specific CPU loops.
 */

// ========================================================================
// EGGSTATION RETRO WELCOME BANNER (Author Signature)
// ========================================================================
const eggstationLogo = `
 _____ _____ _____ _____ _         _   _       
|   __|   __|   __|   __| |_ ___ _| |_|_| ___ ___ 
|   __|  |  |  |  |__   |  _| .'|_   _| | . |   | 
|_____|_____|_____|_____|_| |__,| |_| |_|___|_|_| 
`;

const bannerStyle = "color: #ff007f; font-family: monospace; font-weight: bold; text-shadow: 0 0 12px rgba(255, 0, 127, 0.8); line-height: 1.2;";
const infoHeaderStyle = "color: #e1e1e6; background: linear-gradient(90deg, #ff007f, #7f00ff); padding: 4px 10px; border-radius: 4px; font-weight: bold;";
const infoBodyStyle = "color: #a8a8b3; font-family: monospace; font-size: 0.85rem; line-height: 1.5;";

console.log(`%c${eggstationLogo}`, bannerStyle);
console.log("%c=== SYSTEM SPECIFICATIONS ===", infoHeaderStyle);
console.log(
    `%c` +
    `• Project      : EGGStation Virtual Console\n` +
    `• Target       : Multi-System Architecture (SMS, Genesis, SNES)\n` +
    `• Architecture : Decoupled Domain-Driven Design (DDD) & SOLID Standards\n` +
    `• Audio Engine : Dynamic Rate Control (DRC) & Hybrid Stereo DSP Graph\n` +
    `• Video Engine : WebGL2 CRT-Royale Shader & Adaptive Screen Pacing\n` +
    `• Author       : Enrique González Gutiérrez\n` +
    `• Workspace    : Active Development Environment (Est. 2026)`, 
    infoBodyStyle
);
console.log("%c=============================", infoHeaderStyle);

// Pointer used to identify the target game being configured during the manual local selection phase
window.pendingLibraryGame = null;

// ========================================================================
// CONSOLE HOT-SWAPPING COORDINATOR
// ========================================================================
let activeOrchestrator = null;
let activeController = null;

// Global tracking of active user audio permission
window.audioEnabledState = true;

/**
 * Toggles the visibility of the collapsible Developer diagnostics suite.
 */
function toggleDeveloperSuite() {
    const devSuite = document.getElementById('developer-suite');
    const appContainer = document.getElementById('app-container');
    if (devSuite && appContainer) {
        devSuite.classList.toggle('hidden');
        appContainer.classList.toggle('dev-mode');
        
        if (!devSuite.classList.contains('hidden') && activeController && typeof activeController.updateDebuggerUI === 'function') {
            activeController.updateDebuggerUI();
        }
    }
}

/**
 * Safely terminates the running emulator, releasing GPU/Audio resources.
 */
function teardownActiveConsole() {
    activeController = null;
    window.activeController = null; // Clean global references

    if (activeOrchestrator) {
        console.log(`[EGGStation::Swapper] Halting active orchestrator loop...`);
        
        activeOrchestrator.isRunning = false;
        if (typeof activeOrchestrator.stop === 'function') {
            activeOrchestrator.stop();
        }
        
        if (activeOrchestrator.animationFrameId) {
            cancelAnimationFrame(activeOrchestrator.animationFrameId);
            activeOrchestrator.animationFrameId = null;
        }
        
        // Close internal audio contexts universally
        const contextsToClose = [
            activeOrchestrator.audioCtx,
            activeOrchestrator.psg?.context,
            activeOrchestrator.audioProcessor?.audioCtx
        ];

        contextsToClose.forEach(ctx => {
            if (ctx && ctx.state !== 'closed') {
                ctx.close().catch(() => {});
            }
        });
    }
    
    activeOrchestrator = null;
    window.activeOrchestrator = null; // Clean global references

    // Clone DOM elements to safely purge old event listeners from previous UIControllers
    const elementsToClone = ['romLoaderBtn', 'cartridgeSelector', 'developer-suite'];
    elementsToClone.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentNode) {
            const clone = el.cloneNode(true);
            el.parentNode.replaceChild(clone, el);
        }
    });
}

/**
 * Shuts down active hardware loops and boots the selected console.
 * @param {string} consoleType - Target system identifier (e.g., "SMS", "GEN", "SNES")
 */
function bootConsole(consoleType) {
    console.log(`%c[EGGStation::Swapper] Swapping hardware to ${consoleType}...`, "color: #7f00ff; font-weight: bold;");

    teardownActiveConsole();

    // Setup canvas viewport contexts
    const videoCanvas = document.getElementById("smsdisplay");
    const videoContext = videoCanvas ? videoCanvas.getContext("2d", { willReadFrequently: true }) : null;
    
    const glCanvas = document.getElementById("webgldisplay");
    let glContext = null;
    if (glCanvas) {
        try {
            glContext = glCanvas.getContext("webgl2") || glCanvas.getContext("experimental-webgl2");
        } catch (e) {
            console.warn("[EGGStation::Canvas] WebGL2 context acquisition failed: ", e);
        }
    }

    // Clean viewport frames
    if (videoContext && videoCanvas) videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    if (glContext && glCanvas) {
        glContext.clearColor(0.0, 0.0, 0.0, 1.0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
    }

    // Reset default layout views and CRT animation states on dynamic swaps
    const crtWrapper = document.getElementById("crt-wrapper");
    if (crtWrapper) {
        crtWrapper.classList.remove("crt-power-off", "crt-warm-up");
    }

    document.getElementById("fileselector")?.classList.remove("hidden");
    const fpsSpan = document.getElementById("fpsSpan");
    if (fpsSpan) fpsSpan.textContent = "0.0 FPS";

    const updateFpsUI = (fps) => {
        if (fpsSpan) fpsSpan.textContent = `${fps} FPS`;
    };

    // Instantiate and Boot the Selected Console Engine Polymorphically (SOLID OCP)
    try {
        if (!window.ConsoleRegistry) {
            throw new Error("ConsoleRegistry is not defined. Ensure emulator cores are properly registered.");
        }
        
        // Dynamic construction via ConsoleRegistry, removing switch/case code smell
        const core = window.ConsoleRegistry.boot(consoleType, videoContext, glContext, updateFpsUI);
        activeOrchestrator = core.orchestrator;
        activeController = core.controller;
        
        // Expose active orchestrator instances on the global window scope synchronously
        window.activeOrchestrator = activeOrchestrator;
        window.activeController = activeController;
        
        // Dynamically draw the correct active system preview thumbnail on boot
        updateSaveStatePreview();
        
        console.log(`%c[EGGStation::Swapper] ${consoleType} Engine instantiated successfully via ConsoleRegistry.`, "color: #04d361; font-weight: bold;");
    } catch (err) {
        console.error(`[EGGStation::Swapper] Fatal exception during ${consoleType} engine boot:`, err);
        return;
    }

    // Synchronize UI dropdown selector selection
    const consoleSelector = document.getElementById('consoleSelector');
    if (consoleSelector && consoleSelector.value !== consoleType) {
        consoleSelector.value = consoleType;
    }

    // Auto-sync active visual and audio filter settings across hot-swaps
    const postProcessSelector = document.getElementById('postProcessSelector');
    const audioFilterSelector = document.getElementById('audioFilterSelector');
    
    const activeVideoFilter = postProcessSelector ? parseInt(postProcessSelector.value, 10) : 0;
    const activeAudioFilter = audioFilterSelector ? parseInt(audioFilterSelector.value, 10) : 0;

    if (typeof activeOrchestrator.setPostProcessMode === 'function') {
        activeOrchestrator.setPostProcessMode(activeVideoFilter);
    } else {
        activeOrchestrator.postProcessMode = activeVideoFilter;
    }

    if (typeof activeOrchestrator.setAudioFilterMode === 'function') {
        activeOrchestrator.setAudioFilterMode(activeAudioFilter);
    } else {
        activeOrchestrator.audioFilterMode = activeAudioFilter;
    }

    if (typeof activeOrchestrator.setAudioEnabled === 'function') {
        activeOrchestrator.setAudioEnabled(window.audioEnabledState);
    }

    // Trigger immediate viewport & canvas layout adjustments based on the active filter
    if (activeController) {
        if (typeof activeController.handlePostProcessChange === 'function') {
            activeController.handlePostProcessChange(activeVideoFilter);
        } else if (typeof activeController.updateVideoPipeline === 'function') {
            activeController.updateVideoPipeline(activeVideoFilter);
        }
    }
}
window.bootConsole = bootConsole; // Expose globally for decoupled presentation layers

// ========================================================================
// GLOBAL PERSISTENT SAVE/LOAD HOTKEYS & BUTTON BINDINGS
// ========================================================================
window.addEventListener('keydown', (e) => {
    if (!activeOrchestrator) return;

    // F2: Universal Save State
    if (e.key === "F2") {
        e.preventDefault();
        triggerSaveAction();
    }
    
    // F3: Universal Load State
    if (e.key === "F3") {
        e.preventDefault();
        triggerLoadAction();
    }
});

function triggerSaveAction() {
    if (activeOrchestrator && typeof activeOrchestrator.saveState === 'function') {
        activeOrchestrator.saveState().then(() => {
            updateSaveStatePreview();
        });
    }
}

function triggerLoadAction() {
    if (activeOrchestrator && typeof activeOrchestrator.loadState === 'function') {
        activeOrchestrator.loadState();
    }
}

/**
 * Universal uncoupled save state snapshot rendering service.
 */
function updateSaveStatePreview() {
    const rawImgData = localStorage.getItem('savestateScreenshot');
    if (!rawImgData) return;

    let imgDataArray;
    try {
        imgDataArray = JSON.parse(rawImgData);
    } catch (e) {
        return;
    }
    if (!imgDataArray) return;

    const canvas = document.createElement('canvas');
    const totalPixels = imgDataArray.length / 4;
    const width = totalPixels === 15360 ? 128 : (totalPixels === 76800 || totalPixels === 71680 ? 320 : 256);
    const height = totalPixels / width;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const clampedArray = new Uint8ClampedArray(imgDataArray);
    const imgArray = new ImageData(clampedArray, width, height);
    ctx.putImageData(imgArray, 0, 0);

    const targetImage = document.getElementById("savestateImg");
    if (targetImage) {
        targetImage.src = canvas.toDataURL();
    }
}

/**
 * Trigger the immersive CRT "Warm-up" (Power On) visual effect.
 */
function triggerCrtWarmUp() {
    const crtWrapper = document.getElementById("crt-wrapper");
    if (crtWrapper) {
        crtWrapper.classList.remove("crt-power-off");
        void crtWrapper.offsetWidth; 
        crtWrapper.classList.add("crt-warm-up");
    }
}
window.triggerCrtWarmUp = triggerCrtWarmUp;

// ========================================================================
// OFFLINE HIGH-SPEED CACHING ROM BOOTSTRAP PIPELINE (DIP)
// ========================================================================

/**
 * Dynamic ROM registrator. Copies any booted ROM inside the persistent
 * IndexedDB storage dynamically, allowing the Library to auto-update itself.
 * 
 * @param {string} name - The file name of the ROM.
 * @param {ArrayBuffer} buffer - The binary buffer.
 * @param {string} system - Core identifier (SMS, GEN, SNES).
 */
async function saveRomToLibrary(name, buffer, system) {
    try {
        const dbManager = new IndexedDbManager("EGGStationDB", "savestates");
        const existing = await dbManager.load("ROM_" + name);
        if (!existing) {
            console.log(`[EGGStation::Library] Auto-registering "${name}" in local database...`);
            await dbManager.save("ROM_" + name, {
                name: name,
                system: system,
                buffer: buffer
            });
        }
    } catch(err) {
        console.error("[EGGStation::Library] Auto-registration failed:", err);
    }
}

/**
 * Direct hardware injection handler to bind ROM buffers dynamically.
 */
function runRomFromBuffer(system, name, buffer) {
    // Auto-save game in library database
    saveRomToLibrary(name, buffer, system);

    bootConsole(system);
    
    if (system === "SNES") {
        const uint8 = new Uint8Array(buffer);
        activeOrchestrator.loadCartridge(uint8, false);
    } else if (system === "GEN") {
        activeOrchestrator.loadRom(name, buffer);
    } else if (system === "SMS") {
        activeOrchestrator.loadRom(name, buffer).then(() => {
            if (activeController && typeof activeController.handleShaderTuningChange === 'function') {
                activeController.handleShaderTuningChange();
            }
        });
    }

    if (typeof triggerCrtWarmUp === 'function') triggerCrtWarmUp();
    document.getElementById('fileselector')?.classList.add('hidden');
}
window.runRomFromBuffer = runRomFromBuffer; // Expose globally for decoupled presentation layers

// ========================================================================
// GLOBAL EVENT LISTENERS & MOBILE UI HANDLERS
// ========================================================================
document.addEventListener("DOMContentLoaded", () => {
    const consoleSelector = document.getElementById('consoleSelector');
    const devToggle = document.getElementById('dev-toggle-btn');
    const ejectBtn = document.getElementById('ejectBtn');
    const audioToggleSelector = document.getElementById('audioToggleSelector');
    const fileSelectorInput = document.getElementById('cartridgeSelector');
    
    const saveBtn = document.getElementById('btn-save');
    const loadBtn = document.getElementById('btn-load');

    // Home Navigation Elements
    const btnReturnHome = document.getElementById('btn-return-home');
    const mobileHomeBtn = document.getElementById('mobile-home-btn');

    if (saveBtn) saveBtn.addEventListener('click', triggerSaveAction);
    if (loadBtn) loadBtn.addEventListener('click', triggerLoadAction);

    // Initial system boot is now halted; the application remains in the System Selection Carousel on startup
    console.log(`[EGGStation::Bootstrapper] System Halted. Awaiting Carousel Selection...`);

    // ====================================================================
    // RETURN TO CAROUSEL (HOME) LOGIC
    // ====================================================================
    const returnToHome = () => {
        console.log("[EGGStation::Swapper] Exiting emulator stage. Returning to Home Dashboard...");
        
        // 1. Power off CRT Effect
        const crtWrapper = document.getElementById("crt-wrapper");
        if (crtWrapper) {
            crtWrapper.classList.remove("crt-warm-up");
            crtWrapper.classList.add("crt-power-off");
        }

        // 2. Teardown active emulation loops after power-off animation
        setTimeout(() => {
            teardownActiveConsole();
            
            // 3. Clear canvas buffer
            const videoCanvas = document.getElementById("smsdisplay");
            const videoContext = videoCanvas?.getContext("2d");
            if (videoContext) {
                videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
            }

            // 4. Close any open mobile drawers
            closeSettingsDrawer();
            closeLibraryDrawer();

            // 5. Unhide and wake up the System Selection Carousel
            if (window.SystemCarouselManager) {
                window.SystemCarouselManager.show();
            }
        }, 500);
    };

    if (btnReturnHome) btnReturnHome.addEventListener('click', returnToHome);
    if (mobileHomeBtn) mobileHomeBtn.addEventListener('click', returnToHome);

    if (consoleSelector) {
        consoleSelector.addEventListener('change', (e) => bootConsole(e.target.value));
    }

    if (audioToggleSelector) {
        window.audioEnabledState = (audioToggleSelector.value === 'enabled');
        audioToggleSelector.addEventListener('change', (e) => {
            const enabled = (e.target.value === 'enabled');
            window.audioEnabledState = enabled;
            if (activeOrchestrator && typeof activeOrchestrator.setAudioEnabled === 'function') {
                activeOrchestrator.setAudioEnabled(enabled);
            }
        });
    }

    if (devToggle) {
        devToggle.addEventListener('click', toggleDeveloperSuite);
    }

    if (ejectBtn) {
        ejectBtn.addEventListener('click', () => {
            console.log("[EGGStation::Swapper] Ejecting active cartridge...");
            
            const crtWrapper = document.getElementById("crt-wrapper");
            if (crtWrapper) {
                crtWrapper.classList.remove("crt-warm-up");
                crtWrapper.classList.add("crt-power-off"); // Collapse CRT screen
            }

            setTimeout(() => {
                if (activeOrchestrator) {
                    activeOrchestrator.isRunning = false;
                    if (typeof activeOrchestrator.stop === 'function') {
                        activeOrchestrator.stop();
                    }
                    if (activeOrchestrator.animationFrameId) {
                        cancelAnimationFrame(activeOrchestrator.animationFrameId);
                        activeOrchestrator.animationFrameId = null;
                    }
                }

                const videoCanvas = document.getElementById("smsdisplay");
                const videoContext = videoCanvas?.getContext("2d");
                if (videoContext) {
                    videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
                }

                // Unhide the manual cart insert button overlay
                document.getElementById("fileselector")?.classList.remove("hidden");
                const fpsSpan = document.getElementById("fpsSpan");
                if (fpsSpan) fpsSpan.textContent = "0.0 FPS";
                
                // UX FIX: Power the CRT TV back ON (Warm-up) to smoothly reveal the "INSERT CARTRIDGE" button!
                if (crtWrapper) {
                    crtWrapper.classList.remove("crt-power-off");
                    // Force DOM reflow to restart CSS animation smoothly
                    void crtWrapper.offsetWidth;
                    crtWrapper.classList.add("crt-warm-up"); 
                }

                if (window.innerWidth <= 900) {
                    closeSettingsDrawer();
                }
            }, 500);
        });
    }

    // Intercept manual file uploads to cache ROMs dynamically in the library
    if (fileSelectorInput) {
        fileSelectorInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                let targetSystem = "SMS";
                const name = file.name.toLowerCase();
                
                if (name.endsWith('.md') || name.endsWith('.gen') || name.endsWith('.bin') || name.endsWith('.smd')) {
                    targetSystem = "GEN";
                } else if (name.endsWith('.sfc') || name.endsWith('.smc')) {
                    targetSystem = "SNES";
                }
                
                // Unify loading and dynamic registration path
                runRomFromBuffer(targetSystem, file.name, arrayBuffer);
                renderLibrary();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // ====================================================================
    // MOBILE RESPONSIVE UI HANDLERS & JUEGOTECA ACTIONS
    // ====================================================================
    const settingsPanel = document.getElementById('settings-panel');
    const libraryPanel = document.getElementById('library-panel');
    const overlay = document.getElementById('mobile-drawer-overlay');
    
    const libraryToggleBtn = document.getElementById('library-toggle-btn');
    const mobileLibraryBtn = document.getElementById('mobile-library-btn');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const landscapeMenuBtn = document.getElementById('landscape-menu-btn');
    
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const closeLibraryBtn = document.getElementById('close-library-btn');

    const openSettingsDrawer = () => {
        closeLibraryDrawer(); 
        if (settingsPanel) {
            settingsPanel.classList.remove('drawer-closed');
            settingsPanel.classList.add('drawer-open');
        }
        if (overlay) overlay.classList.remove('hidden');
    };

    const closeSettingsDrawer = () => {
        if (settingsPanel) {
            settingsPanel.classList.remove('drawer-open');
            settingsPanel.classList.add('drawer-closed');
        }
        if (overlay && libraryPanel && libraryPanel.classList.contains('library-closed')) {
            overlay.classList.add('hidden');
        }
    };

    const openLibraryDrawer = () => {
        closeSettingsDrawer(); 
        if (libraryPanel) {
            libraryPanel.classList.remove('library-closed');
            libraryPanel.classList.add('library-open');
        }
        if (overlay) overlay.classList.remove('hidden');
        renderLibrary(); // Re-render the library dynamically every time the drawer opens
    };

    const closeLibraryDrawer = () => {
        if (libraryPanel) {
            libraryPanel.classList.remove('library-open');
            libraryPanel.classList.add('library-closed');
        }
        if (overlay && settingsPanel && settingsPanel.classList.contains('drawer-closed')) {
            overlay.classList.add('hidden');
        }
    };
    window.closeLibraryDrawer = closeLibraryDrawer; // Expose globally for decoupled presentation layers

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSettingsDrawer);
    if (landscapeMenuBtn) landscapeMenuBtn.addEventListener('click', openSettingsDrawer);
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeSettingsDrawer);
    
    if (libraryToggleBtn) libraryToggleBtn.addEventListener('click', openLibraryDrawer);
    if (mobileLibraryBtn) mobileLibraryBtn.addEventListener('click', openLibraryDrawer);
    if (closeLibraryBtn) closeLibraryBtn.addEventListener('click', closeLibraryDrawer);
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            closeSettingsDrawer();
            closeLibraryDrawer();
        });
    }

    // ====================================================================
    // RENDER JUEGOTECA (DELEGATE TO SRP LIBRARY MANAGER SINGLETON)
    // ====================================================================
    const renderLibrary = () => {
        if (window.LibraryManagerInstance) {
            window.LibraryManagerInstance.render();
        }
    };

    renderLibrary();
});