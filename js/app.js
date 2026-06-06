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

// ========================================================================
// GAMES LIBRARY (GAMES CATALOG) CONFIGURATION
// ========================================================================
// Covers designed using pure inline SVG vector blocks to prevent CORS breaks offline
const ROM_CATALOG = [
    {
        id: "alex_kidd",
        title: "Alex Kidd in Miracle World",
        system: "SMS",
        filename: "Alex Kidd in Miracle World (USA, Europe) (Rev 1).sms",
        year: "1986",
        developer: "Sega",
        genre: "Platform",
        theme: "#04d361",
        svgCover: `<svg viewBox="0 0 60 80" width="100%" height="100%"><rect width="60" height="80" fill="#0d1117"/><rect x="5" y="5" width="50" height="40" fill="#04d361" rx="3"/><text x="30" y="25" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">ALEX KIDD</text><text x="30" y="32" fill="#fff" font-family="monospace" font-size="3" text-anchor="middle">Miracle World</text><rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/><text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="3" text-anchor="middle">SEGA SYSTEM</text></svg>`
    },
    {
        id: "castle_illusion",
        title: "Castle of Illusion",
        system: "GEN",
        filename: "Castle of Illusion Starring Mickey Mouse (USA, Europe).md",
        year: "1990",
        developer: "Sega",
        genre: "Platform",
        theme: "#ff007f",
        svgCover: `<svg viewBox="0 0 60 80" width="100%" height="100%"><rect width="60" height="80" fill="#0d1117"/><rect x="5" y="5" width="50" height="40" fill="#ff007f" rx="3"/><text x="30" y="23" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">CASTLE OF</text><text x="30" y="30" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">ILLUSION</text><rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/><text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="3.5" text-anchor="middle">MEGA DRIVE</text></svg>`
    },
    {
        id: "ghostbusters",
        title: "Ghostbusters",
        system: "GEN",
        filename: "Ghostbusters (USA, Europe) (En,Ja) (Beta).md",
        year: "1990",
        developer: "Sega",
        genre: "Action",
        theme: "#7f00ff",
        svgCover: `<svg viewBox="0 0 60 80" width="100%" height="100%"><rect width="60" height="80" fill="#0d1117"/><rect x="5" y="5" width="50" height="40" fill="#7f00ff" rx="3"/><text x="30" y="26" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">GHOST</text><text x="30" y="33" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">BUSTERS</text><rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/><text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="3.5" text-anchor="middle">MEGA DRIVE</text></svg>`
    },
    {
        id: "final_fight",
        title: "Final Fight",
        system: "SNES",
        filename: "Final Fight (Europe).sfc",
        year: "1990",
        developer: "Capcom",
        genre: "Beat 'em up",
        theme: "#b3a6db",
        svgCover: `<svg viewBox="0 0 60 80" width="100%" height="100%"><rect width="60" height="80" fill="#0d1117"/><rect x="5" y="5" width="50" height="40" fill="#5e5189" rx="3"/><text x="30" y="23" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">FINAL</text><text x="30" y="30" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">FIGHT</text><rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/><text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="4" text-anchor="middle">SUPER Nintendo</text></svg>`
    },
    {
        id: "super_gn_ghosts",
        title: "Super Ghouls 'N Ghosts",
        system: "SNES",
        filename: "Super Ghouls 'N Ghosts (Europe).sfc",
        year: "1991",
        developer: "Capcom",
        genre: "Action",
        theme: "#3c3c4e",
        svgCover: `<svg viewBox="0 0 60 80" width="100%" height="100%"><rect width="60" height="80" fill="#0d1117"/><rect x="5" y="5" width="50" height="40" fill="#3c3c4e" rx="3"/><text x="30" y="21" fill="#fff" font-family="monospace" font-size="4.5" font-weight="bold" text-anchor="middle">SUPER</text><text x="30" y="27" fill="#fff" font-family="monospace" font-size="4.5" font-weight="bold" text-anchor="middle">GHOULS 'N</text><text x="30" y="33" fill="#fff" font-family="monospace" font-size="4.5" font-weight="bold" text-anchor="middle">GHOSTS</text><rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/><text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="4" text-anchor="middle">SUPER Nintendo</text></svg>`
    }
];

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

    // Instantiate and Boot the Selected Console Engine
    try {
        switch (consoleType) {
            case "SMS":
                activeOrchestrator = new SmsOrchestrator(videoContext, glContext, updateFpsUI);
                activeController = new SmsUIController(activeOrchestrator);
                break;
                
            case "GEN":
                activeOrchestrator = new GenesisOrchestrator(videoContext, glContext, updateFpsUI);
                activeController = new GenesisUIController(activeOrchestrator);
                break;
                
            case "SNES":
                activeOrchestrator = new SnesOrchestrator(videoContext, glContext, updateFpsUI);
                activeController = new SnesUIController(activeOrchestrator);
                break;
                
            default:
                throw new Error(`Unknown console type: ${consoleType}`);
        }
        
        // Expose active orchestrator instances on the global window scope synchronously
        window.activeOrchestrator = activeOrchestrator;
        window.activeController = activeController;
        
        // Dynamically draw the correct active system preview thumbnail on boot
        updateSaveStatePreview();
        
        console.log(`%c[EGGStation::Swapper] ${consoleType} Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
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
 * Direct hardware injection handler to bind ROM buffers dynamically.
 */
function runRomFromBuffer(system, name, buffer) {
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

    if (saveBtn) saveBtn.addEventListener('click', triggerSaveAction);
    if (loadBtn) loadBtn.addEventListener('click', triggerLoadAction);

    // Initial system boot
    console.log(`[EGGStation::Bootstrapper] Initializing default system configuration...`);
    bootConsole("SMS");

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
                crtWrapper.classList.add("crt-power-off");
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

                document.getElementById("fileselector")?.classList.remove("hidden");
                const fpsSpan = document.getElementById("fpsSpan");
                if (fpsSpan) fpsSpan.textContent = "0.0 FPS";
                
                if (window.innerWidth <= 900) {
                    closeSettingsDrawer();
                }
            }, 500);
        });
    }

    // Intercept manual file uploads to cache ROMs if they belong to library selections
    if (fileSelectorInput) {
        fileSelectorInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || !window.pendingLibraryGame) return;

            const targetGame = window.pendingLibraryGame;
            window.pendingLibraryGame = null; // Clean up immediately

            const reader = new FileReader();
            reader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                try {
                    // FIXED: Reusing "savestates" store to avoid IndexedDB schema upgrades
                    console.log(`[EGGStation::Vault] Archiving "${file.name}" to IndexedDB ROM storage...`);
                    const dbManager = new IndexedDbManager("EGGStationDB", "savestates");
                    await dbManager.save("ROM_" + targetGame.id, { 
                        name: file.name, 
                        buffer: arrayBuffer 
                    });
                    
                    // Boot ROM directly from memory and update UI state
                    runRomFromBuffer(targetGame.system, file.name, arrayBuffer);
                    
                    // Re-render library list to reflect the cached status immediately
                    renderLibrary();
                } catch (err) {
                    console.error("[EGGStation::Vault] Write transaction failed: ", err);
                    runRomFromBuffer(targetGame.system, file.name, arrayBuffer); // Run without caching
                }
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
    // RENDER JUEGOTECA (FIXED: Direct Synchronous click dispatch)
    // ====================================================================
    const renderLibrary = async () => {
        const grid = document.getElementById('library-grid');
        if (!grid) return;

        grid.innerHTML = ""; 

        // Instantiating DB client on pre-approved "savestates" store synchronously
        const dbManager = new IndexedDbManager("EGGStationDB", "savestates");

        // Loop and build cards
        for (const game of ROM_CATALOG) {
            const card = document.createElement('div');
            card.className = "game-card";
            
            // Check in background if this ROM is already cached synchronously
            let isCached = false;
            let cachedRomName = "";
            try {
                const cachedRom = await dbManager.load("ROM_" + game.id);
                if (cachedRom) {
                    isCached = true;
                    cachedRomName = cachedRom.name;
                }
            } catch(e) {
                // If IDB fails, default to uncached gracefully
                isCached = false;
            }

            // Set badge text based on cached status
            const badgeText = isCached ? "PLAY" : "GET";
            const badgeClass = isCached ? "badge-sms" : `badge-${game.system.toLowerCase()}`;

            card.innerHTML = `
                <div class="game-cover">${game.svgCover}</div>
                <div class="game-details">
                    <span class="game-title">${game.title}</span>
                    <span class="game-meta">${game.developer} (${game.year})</span>
                    <span id="badge-${game.id}" class="game-badge ${badgeClass}">${badgeText}</span>
                </div>
            `;

            if (isCached) {
                card.classList.add('is-cached');
            }

            // FIXED: Synchronous click dispatch bypassing browser popup blocks
            card.addEventListener('click', async () => {
                const badgeElement = document.getElementById(`badge-${game.id}`);
                
                if (card.classList.contains('is-cached')) {
                    // Game is cached locally: load asynchronously from IndexedDB.
                    // Since it does not require opening file selectors, the browser allows this async flow.
                    try {
                        if (badgeElement) badgeElement.textContent = "BOOTING...";
                        const cachedData = await dbManager.load("ROM_" + game.id);
                        if (cachedData) {
                            runRomFromBuffer(game.system, cachedData.name, cachedData.buffer);
                            closeLibraryDrawer();
                        }
                    } catch(err) {
                        console.error("[EGGStation::Vault] Memory load crash: ", err);
                    } finally {
                        if (badgeElement) badgeElement.textContent = "PLAY";
                    }
                } else {
                    // Game is not cached: open file selector synchronously.
                    // Since it is directly inside the user's click stack, the browser allows file selector popups.
                    window.pendingLibraryGame = game;
                    
                    alert(`Offline Setup Required:\n\nLocate and select the ROM on your disk.\n\nFile expected: "${game.filename}"\n\n(EGGStation will copy it locally so you never have to locate it again!)`);
                    
                    if (fileSelectorInput) {
                        fileSelectorInput.click(); // Spawns file selector instantly
                    }
                }
            });

            grid.appendChild(card);
        }
    };

    renderLibrary();
});