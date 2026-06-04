/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Component: System Bootstrapper and Console Swapper
 * Language: Vanilla ES6+ JavaScript
 * 
 * ROLE:
 * This file serves as the system Bootstrapper (Composition Root). It manages the 
 * lifecycle of the active emulation engines, coordinates clean hot-swapping between 
 * Sega Master System, Sega Genesis, and SNES, and prevents memory leaks or audio pipeline 
 * clashes by tearing down active web audio nodes and frame request loops cleanly.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Concentrates system swapper states, 
 *   canvas context creation, and background audio suspension.
 * - Open/Closed Principle (OCP): New systems can be registered in the boot 
 *   mapping without modifying existing swapper routines.
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
    `• Target       : Sega SMS, Genesis, & Super Nintendo (SNES)\n` +
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
        
        // Push initial registers layout to debugger if expanded
        if (!devSuite.classList.contains('hidden') && activeController) {
            activeController.updateDebuggerUI();
        }
    }
}

/**
 * Shuts down active hardware loops, clears DOM event listeners, and boots the selected console.
 * @param {string} consoleType - "SMS", "GEN", or "SNES"
 */
function bootConsole(consoleType) {
    console.log(`%c[EGGStation::Swapper] Purging hardware components for swap to ${consoleType}...`, "color: #7f00ff; font-weight: bold;");

    // Nullify active controller reference first to prevent gamepad poll loops from firing
    activeController = null;

    // 1. Safe Teardown of the active console
    if (activeOrchestrator) {
        console.log(`[EGGStation::Swapper] Active orchestrator found. Stopping loop...`);
        
        activeOrchestrator.isRunning = false;
        if (typeof activeOrchestrator.stop === 'function') {
            activeOrchestrator.stop();
        }
        
        if (activeOrchestrator.animationFrameId) {
            cancelAnimationFrame(activeOrchestrator.animationFrameId);
            activeOrchestrator.animationFrameId = null;
        }
        
        // Close audio contexts safely
        if (activeOrchestrator.psg && activeOrchestrator.psg.context && activeOrchestrator.psg.context.state !== 'closed') {
            activeOrchestrator.psg.context.close().catch(() => {});
        }
        
        if (activeOrchestrator.audioCtx && activeOrchestrator.audioCtx.state !== 'closed') {
            activeOrchestrator.audioCtx.close().catch(() => {});
        }

        if (activeOrchestrator.audioProcessor && activeOrchestrator.audioProcessor.audioCtx && activeOrchestrator.audioProcessor.audioCtx.state !== 'closed') {
            activeOrchestrator.audioProcessor.audioCtx.close().catch(() => {});
        }
    }

    // 2. Clone DOM elements to safely purge old event listeners
    const oldLoaderBtn = document.getElementById('romLoaderBtn');
    if (oldLoaderBtn && oldLoaderBtn.parentNode) {
        const newLoaderBtn = oldLoaderBtn.cloneNode(true);
        oldLoaderBtn.parentNode.replaceChild(newLoaderBtn, oldLoaderBtn);
    }

    const oldSelector = document.getElementById('cartridgeSelector');
    if (oldSelector && oldSelector.parentNode) {
        const newSelector = oldSelector.cloneNode(true);
        oldSelector.parentNode.replaceChild(newSelector, oldSelector);
    }

    const dbgSection = document.getElementById('developer-suite');
    if (dbgSection && dbgSection.parentNode) {
        const newDbgSection = dbgSection.cloneNode(true);
        dbgSection.parentNode.replaceChild(newDbgSection, dbgSection);
    }

    // 3. Setup canvas viewport contexts
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
    if (videoContext && videoCanvas) {
        videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
    if (glContext && glCanvas) {
        glContext.clearColor(0.0, 0.0, 0.0, 1.0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
    }

    // Reset default layout views
    document.getElementById("fileselector")?.classList.remove("hidden");

    const fpsSpan = document.getElementById("fpsSpan");
    if (fpsSpan) fpsSpan.textContent = "0.0 FPS";

    // 4. Instantiate and Boot the Selected Console Engine
    if (consoleType === "SMS") {
        try {
            activeOrchestrator = new EmulatorOrchestrator(videoContext, glContext, (fps) => {
                const fpsElement = document.getElementById("fpsSpan");
                if (fpsElement) fpsElement.textContent = `${fps} FPS`;
            });
            activeController = new UIController(activeOrchestrator);
            activeController.updateSaveStatePreview();
            
            console.log(`%c[EGGStation::Swapper] Sega Master System / SG-1000 Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
        } catch (err) {
            console.error(`[EGGStation::Swapper] Fatal exception during SMS engine boot:`, err);
        }
    } 
    else if (consoleType === "GEN") {
        try {
            activeOrchestrator = new GenesisOrchestrator(videoContext, glContext, (fps) => {
                const fpsElement = document.getElementById("fpsSpan");
                if (fpsElement) fpsElement.textContent = `${fps} FPS`;
            });
            activeController = new GenesisUIController(activeOrchestrator);
            
            console.log(`%c[EGGStation::Swapper] Sega Genesis / Mega Drive Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
        } catch (err) {
            console.error(`[EGGStation::Swapper] Fatal exception during Genesis engine boot:`, err);
        }
    }
    else if (consoleType === "SNES") {
        try {
            activeOrchestrator = new SnesOrchestrator(videoContext, glContext, (fps) => {
                const fpsElement = document.getElementById("fpsSpan");
                if (fpsElement) fpsElement.textContent = `${fps} FPS`;
            });
            activeController = new SnesUIController(activeOrchestrator);
            
            console.log(`%c[EGGStation::Swapper] Super Nintendo (SNES) Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
        } catch (err) {
            console.error(`[EGGStation::Swapper] Fatal exception during SNES engine boot:`, err);
        }
    }

    // 5. Auto-sync active visual and audio filter settings across hot-swaps
    const postProcessSelector = document.getElementById('postProcessSelector');
    const audioFilterSelector = document.getElementById('audioFilterSelector');
    
    const activeVideoFilter = postProcessSelector ? parseInt(postProcessSelector.value, 10) : 0;
    const activeAudioFilter = audioFilterSelector ? parseInt(audioFilterSelector.value, 10) : 0;

    if (activeOrchestrator) {
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

// Global DOM Loaded initialization
document.addEventListener("DOMContentLoaded", () => {
    const consoleSelector = document.getElementById('consoleSelector');
    const devToggle = document.getElementById('dev-toggle-btn');
    const ejectBtn = document.getElementById('ejectBtn');
    const audioToggleSelector = document.getElementById('audioToggleSelector');
    
    // Boot the default console (Sega Master System)
    console.log(`[EGGStation::Bootstrapper] Initializing default system configuration...`);
    bootConsole("SMS");

    // Listen to console selection changes to trigger hot-swapping
    if (consoleSelector) {
        consoleSelector.addEventListener('change', (e) => {
            bootConsole(e.target.value);
        });
    }

    // Listen to audio output toggle changes
    if (audioToggleSelector) {
        // Synchronize initial UI selection with global state
        window.audioEnabledState = (audioToggleSelector.value === 'enabled');
        audioToggleSelector.addEventListener('change', (e) => {
            const enabled = (e.target.value === 'enabled');
            window.audioEnabledState = enabled;
            if (activeOrchestrator && typeof activeOrchestrator.setAudioEnabled === 'function') {
                activeOrchestrator.setAudioEnabled(enabled);
            }
        });
    }

    // Listen to developer panel toggles
    if (devToggle) {
        devToggle.addEventListener('click', toggleDeveloperSuite);
    }

    // Global Eject Cartridge listener implementation
    if (ejectBtn) {
        ejectBtn.addEventListener('click', () => {
            console.log("[EGGStation::Swapper] Ejecting active cartridge...");
            
            if (activeOrchestrator) {
                activeOrchestrator.isRunning = false;
                if (activeOrchestrator.animationFrameId) {
                    cancelAnimationFrame(activeOrchestrator.animationFrameId);
                }
                
                // Close operational audio contexts only if they aren't already closed
                if (activeOrchestrator.psg && activeOrchestrator.psg.context && activeOrchestrator.psg.context.state !== 'closed') {
                    activeOrchestrator.psg.context.close().catch(() => {});
                }
                if (activeOrchestrator.audioCtx && activeOrchestrator.audioCtx.state !== 'closed') {
                    activeOrchestrator.audioCtx.close().catch(() => {});
                }
                if (activeOrchestrator.audioProcessor && activeOrchestrator.audioProcessor.audioCtx && activeOrchestrator.audioProcessor.audioCtx.state !== 'closed') {
                    activeOrchestrator.audioProcessor.audioCtx.close().catch(() => {});
                }
            }

            // Clean active viewports
            const videoCanvas = document.getElementById("smsdisplay");
            const videoContext = videoCanvas.getContext("2d");
            if (videoContext) {
                videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
            }

            // Expose the ROM loader overlay
            const fileSelectorEl = document.getElementById("fileselector");
            if (fileSelectorEl) {
                fileSelectorEl.classList.remove("hidden");
            }

            const fpsSpan = document.getElementById("fpsSpan");
            if (fpsSpan) {
                fpsSpan.textContent = "0.0 FPS";
            }
        });
    }
});