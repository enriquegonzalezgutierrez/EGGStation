/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Entry Point: Composition Root, Welcome Banner, & Console Swapper (Debugger Purge)
 * 
 * This file serves as the system Bootstrapper. It coordinates the hot-swapping 
 * between the Sega Master System, Sega Genesis, and Super Nintendo (SNES) emulators
 * dynamically, tearing down hardware registers, cleaning event listeners, and closing 
 * active audio pipelines on-the-fly to guarantee zero leakages.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Concentrates global system swapper
 *   orchestration, DOM cleanup, and hardware Cartridge Ejection.
 */

// ========================================================================
// EGGSTATION RETRO SYNTHWAVE WELCOME BANNER (Author Signature)
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
// CONSOLE HOT-SWAPPING BOOTSTRAPPER (COMPOSITION ROOT)
// ========================================================================
let activeOrchestrator = null;
let activeController = null;

// Global state for audio enablement
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

function bootConsole(consoleType) {
    console.log(`%c[EGGStation::Swapper] Purging hardware components for swap to ${consoleType}...`, "color: #7f00ff; font-weight: bold;");

    // Nullify active controller reference first to prevent gamepad poll loops from firing
    activeController = null;

    // 1. Safe Teardown of the running console
    if (activeOrchestrator) {
        console.log(`[EGGStation::Swapper] Active orchestrator found. Cancelling animation loop ID: ${activeOrchestrator.animationFrameId}`);
        if (activeOrchestrator.animationFrameId) {
            cancelAnimationFrame(activeOrchestrator.animationFrameId);
        }
        
        // Corrected: Safe Close checks state to prevent close-after-close state exceptions
        if (activeOrchestrator.psg && activeOrchestrator.psg.context && activeOrchestrator.psg.context.state !== 'closed') {
            console.log(`[EGGStation::Audio] Closing active SMS audio context...`);
            activeOrchestrator.psg.context.close().catch(() => {});
        }
        
        if (activeOrchestrator.audioCtx && activeOrchestrator.audioCtx.state !== 'closed') {
            console.log(`[EGGStation::Audio] Closing active Genesis audio context...`);
            activeOrchestrator.audioCtx.close().catch(() => {});
        }

        if (activeOrchestrator.dsp && activeOrchestrator.dsp.context && activeOrchestrator.dsp.context.state !== 'closed') {
            console.log(`[EGGStation::Audio] Closing active SNES audio context...`);
            activeOrchestrator.dsp.context.close().catch(() => {});
        }
    }

    // 2. Clone DOM elements to safely purge old event listeners (avoids keyboard key overlaps)
    console.log(`[EGGStation::Swapper] Re-binding DOM cartridge upload slots to clear listeners...`);
    const oldLoaderBtn = document.getElementById('romLoaderBtn');
    const newLoaderBtn = oldLoaderBtn.cloneNode(true);
    oldLoaderBtn.parentNode.replaceChild(newLoaderBtn, oldLoaderBtn);

    const oldSelector = document.getElementById('cartridgeSelector');
    const newSelector = oldSelector.cloneNode(true);
    oldSelector.parentNode.replaceChild(newSelector, oldSelector);

    // Clone the Debugger control buttons container synchronously during hot-swaps
    const dbgSection = document.getElementById('developer-suite');
    if (dbgSection) {
        const newDbgSection = dbgSection.cloneNode(true);
        dbgSection.parentNode.replaceChild(newDbgSection, dbgSection);
    }

    // 3. Setup canvas viewport contexts
    const videoCanvas = document.getElementById("smsdisplay");
    const videoContext = videoCanvas.getContext("2d", { willReadFrequently: true });
    
    const glCanvas = document.getElementById("webgldisplay");
    let glContext = null;
    try {
        glContext = glCanvas.getContext("webgl2") || glCanvas.getContext("experimental-webgl2");
    } catch (e) {
        console.warn("[EGGStation::Canvas] WebGL2 context acquisition failed: ", e);
    }

    // Clean viewport frames to prevent previous console artifacts from displaying
    if (videoContext) {
        videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
    if (glContext) {
        glContext.clearColor(0.0, 0.0, 0.0, 1.0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
    }

    // Reset default layout views
    const fileSelectorEl = document.getElementById("fileselector");
    if (fileSelectorEl) fileSelectorEl.classList.remove("hidden");

    const fpsSpan = document.getElementById("fpsSpan");
    if (fpsSpan) fpsSpan.textContent = "0.0 FPS";

    // 4. Instantiate and Boot the Selected Console Engine
    if (consoleType === "SMS") {
        try {
            // Show Master System specific options
            document.getElementById('sms-config-section').classList.remove('hidden');

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
            // Hide Master System configurations
            document.getElementById('sms-config-section').classList.add('hidden');
            
            // Hide WebGL canvas inline and show standard 2D canvas
            glCanvas.style.display = "none";
            glCanvas.style.visibility = "hidden";
            glCanvas.style.position = "absolute";
            videoCanvas.classList.remove('hidden');

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
            // Hide Master System configurations
            document.getElementById('sms-config-section').classList.add('hidden');
            
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

    // Apply current global audio state to the newly booted engine
    if (activeOrchestrator && typeof activeOrchestrator.setAudioEnabled === 'function') {
        activeOrchestrator.setAudioEnabled(window.audioEnabledState);
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
                if (activeOrchestrator.dsp && activeOrchestrator.dsp.context && activeOrchestrator.dsp.context.state !== 'closed') {
                    activeOrchestrator.dsp.context.close().catch(() => {});
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