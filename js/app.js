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
 * Only called during dynamic hot-swaps to clear listeners and prevent leaks.
 */
function teardownActiveConsole() {
    activeController = null;

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

    // Reset default layout views
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
        
        // PHASE 4: Dynamically draw the correct active system preview thumbnail on boot
        updateSaveStatePreview();
        
        console.log(`%c[EGGStation::Swapper] ${consoleType} Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
    } catch (err) {
        console.error(`[EGGStation::Swapper] Fatal exception during ${consoleType} engine boot:`, err);
        return;
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
    // Diagnostic input log
    console.log("[EGGStation::Input] Key pressed: ", e.key);

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
            // PHASE 4: Call the global uncoupled preview updater
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
 * PHASE 4: Universal uncoupled save state snapshot rendering service.
 * Automatically resolves and scales any emulated system thumbnail dynamically.
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
    
    // Dynamically calculate dimensions to support downsampled snapshots of any console
    const totalPixels = imgDataArray.length / 4;
    
    // Detects the dynamic width: 128 (SNES), 320 (Old Gen) or 256 (SMS / Standard Gen)
    const width = totalPixels === 15360 ? 128 : (totalPixels === 76800 || totalPixels === 71680 ? 320 : 256);
    
    // Auto-calculates the exact height proportionally to prevent any ImageData IndexSizeError crash!
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

// ========================================================================
// GLOBAL EVENT LISTENERS
// ========================================================================
document.addEventListener("DOMContentLoaded", () => {
    const consoleSelector = document.getElementById('consoleSelector');
    const devToggle = document.getElementById('dev-toggle-btn');
    const ejectBtn = document.getElementById('ejectBtn');
    const audioToggleSelector = document.getElementById('audioToggleSelector');
    
    // Bind DOM Save/Load Buttons globally as a secure fallback
    const saveBtn = document.getElementById('btn-save');
    const loadBtn = document.getElementById('btn-load');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            console.log("[EGGStation::UI] Save State Button Clicked.");
            triggerSaveAction();
        });
    }

    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            console.log("[EGGStation::UI] Load State Button Clicked.");
            triggerLoadAction();
        });
    }

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
            
            // PHASE 4 FIX: Safe teardown of orchestrator loop only (no DOM cloning to preserve active UI bindings!)
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
        });
    }
});