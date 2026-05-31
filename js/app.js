/* 
 * Project: EGGStation - Sega Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Entry Point: Composition Root, Welcome Banner, & Console Swapper
 * 
 * This file serves as the system Bootstrapper. It coordinates the hot-swapping 
 * between the Sega Master System and Sega Genesis emulators dynamically, 
 * tearing down hardware registers and audio pipelines on-the-fly.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates platform-wide bootstrap 
 *   mechanics, diagnostic logs, and console swappers from internal hardware loops.
 * - Open/Closed Principle (OCP): Designed with modular console loader segments 
 *   that allow new console cores to be integrated without modifying old engines.
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
    `• Target       : Sega Master System, SG-1000 & Sega Genesis\n` +
    `• Architecture : Decoupled Domain-Driven Design (DDD) & SOLID Standards\n` +
    `• Audio Engine : Dynamic Rate Control (DRC) & Hybrid Stereo DSP Graph\n` +
    `• Video Engine : WebGL2 CRT-Royale Shader & Adaptive Screen Pacing\n` +
    `• Author       : Enrique González Gutiérrez\n` +
    `• Workspace    : Active Development Environment (Est. 2026)`, 
    infoBodyStyle
);
console.log("%c=============================", infoHeaderStyle);

// ========================================================================
// WEBGL2 HARDWARE DIAGNOSTIC SUITE
// ========================================================================
console.log("%c\n=== EGGStation WebGL2 Hardware Diagnostic ===", "color: #ff007f; font-weight: bold; font-size: 0.95rem;");
try {
    const testCanvas = document.createElement("canvas");
    const testGL = testCanvas.getContext("webgl2");
    if (testGL) {
        const debugInfo = testGL.getExtension('WEBGL_debug_renderer_info');
        const gpuVendor = debugInfo ? testGL.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : testGL.getParameter(testGL.VENDOR);
        const gpuRenderer = debugInfo ? testGL.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : testGL.getParameter(testGL.RENDERER);
        console.log("%cDiagnostic::SUCCESS - WebGL2 is fully operational!", "color: #04d361; font-weight: bold;");
        console.log(`Diagnostic::GPU Vendor   : ${gpuVendor}`);
        console.log(`Diagnostic::GPU Renderer : ${gpuRenderer}`);
    } else {
        console.warn("Diagnostic::FAILED - glCanvas.getContext('webgl2') returned NULL.");
    }
} catch (err) {
    console.error("Diagnostic::EXCEPTION - WebGL2 initialization crashed:", err);
}
console.log("%c=============================================\n", "color: #ff007f; font-weight: bold;");

// ========================================================================
// CONSOLE HOT-SWAPPING BOOTSTRAPPER (COMPOSITION ROOT)
// ========================================================================
let activeOrchestrator = null;
let activeController = null;

function bootConsole(consoleType) {
    console.log(`%c[EGGStation::Swapper] Purging hardware components for swap to ${consoleType}...`, "color: #7f00ff; font-weight: bold;");

    // 1. Safe Teardown of the running console
    if (activeOrchestrator) {
        console.log(`[EGGStation::Swapper] Active orchestrator found. Cancelling animation loop ID: ${activeOrchestrator.animationFrameId}`);
        if (activeOrchestrator.animationFrameId) {
            cancelAnimationFrame(activeOrchestrator.animationFrameId);
        }
        
        // Close audio context of Master System if active
        if (activeOrchestrator.psg && activeOrchestrator.psg.context) {
            console.log(`[EGGStation::Audio] Closing active SMS audio context...`);
            activeOrchestrator.psg.context.close().then(() => {
                console.log(`[EGGStation::Audio] SMS Audio context closed safely.`);
            }).catch((err) => {
                console.error(`[EGGStation::Audio] Error closing SMS Audio context:`, err);
            });
        }
        
        // Close audio context of Sega Genesis if active
        if (activeOrchestrator.audioCtx) {
            console.log(`[EGGStation::Audio] Closing active Genesis audio context...`);
            activeOrchestrator.audioCtx.close().then(() => {
                console.log(`[EGGStation::Audio] Genesis Audio context closed safely.`);
            }).catch((err) => {
                console.error(`[EGGStation::Audio] Error closing Genesis Audio context:`, err);
            });
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

    // 3. Setup canvas viewport contexts
    const videoCanvas = document.getElementById("smsdisplay");
    const videoContext = videoCanvas.getContext("2d", { willReadFrequently: true });
    
    const glCanvas = document.getElementById("webgldisplay");
    let glContext = null;
    try {
        glContext = glCanvas.getContext("webgl2") || glCanvas.getContext("experimental-webgl2");
        if (glContext) {
            console.log(`[EGGStation::Canvas] WebGL2 graphics context acquired successfully.`);
        } else {
            console.warn(`[EGGStation::Canvas] WebGL2 context acquisition failed. Falling back to 2D.`);
        }
    } catch (e) {
        console.warn("[EGGStation::Canvas] WebGL2 Context exception: ", e);
    }

    // Clean viewport frames to prevent previous console artifacts from displaying
    if (videoContext) {
        videoContext.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
        console.log(`[EGGStation::Canvas] 2D frame buffer canvas cleared.`);
    }
    if (glContext) {
        glContext.clearColor(0.0, 0.0, 0.0, 1.0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
        console.log(`[EGGStation::Canvas] WebGL shader frame buffer canvas cleared.`);
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
            document.getElementById('dev-toggle-btn').classList.remove('hidden');

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
            // Hide Master System configurations (not used in Genesis standard mode)
            document.getElementById('sms-config-section').classList.add('hidden');
            document.getElementById('dev-toggle-btn').classList.add('hidden'); // Dev mode is for SMS
            
            // Collapse developer diagnostics suite to preserve mobile/desktop grid spaces
            const devSuite = document.getElementById('developer-suite');
            if (devSuite) devSuite.classList.add('hidden');

            const appContainer = document.getElementById('app-container');
            if (appContainer) appContainer.classList.remove('dev-mode');
            
            // Hide WebGL canvas inline and show standard 2D canvas
            glCanvas.style.display = "none";
            glCanvas.style.visibility = "hidden";
            glCanvas.style.position = "absolute";
            videoCanvas.classList.remove('hidden');

            activeOrchestrator = new GenesisOrchestrator(videoContext, (fps) => {
                const fpsElement = document.getElementById("fpsSpan");
                if (fpsElement) fpsElement.textContent = `${fps} FPS`;
            });
            activeController = new GenesisUIController(activeOrchestrator);
            
            console.log(`%c[EGGStation::Swapper] Sega Genesis / Mega Drive Engine instantiated successfully.`, "color: #04d361; font-weight: bold;");
        } catch (err) {
            console.error(`[EGGStation::Swapper] Fatal exception during Genesis engine boot:`, err);
        }
    }
}

// Global DOM Loaded initialization
document.addEventListener("DOMContentLoaded", () => {
    const consoleSelector = document.getElementById('consoleSelector');
    
    // Boot the default console (Sega Master System)
    console.log(`[EGGStation::Bootstrapper] Initializing default system configuration...`);
    bootConsole("SMS");

    // Listen to console selection changes to trigger hot-swapping
    if (consoleSelector) {
        consoleSelector.addEventListener('change', (e) => {
            bootConsole(e.target.value);
        });
    }
});