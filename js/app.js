/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Entry Point: Composition Root, Welcome Banner, & GPU Diagnostics
 * 
 * This file is the system Bootstrapper. It prints a highly stylized retro 
 * welcome banner to the developer console, runs hardware diagnostics, and 
 * wires all architectural layers together (Composition Root Pattern).
 */

// ========================================================================
// EGGSTATION RETRO SYNTHWAVE WELCOME BANNER (Firma de Autor)
// ========================================================================
const eggstationLogo = `
 _____ _____ _____ _____ _         _   _       
|   __|   __|   __|   __| |_ ___ _| |_|_| ___ ___ 
|   __|  |  |  |  |__   |  _| .'|_   _| | . |   | 
|_____|_____|_____|_____|_| |__,| |_| |_|___|_|_| 
`;

// Neon style styling
const bannerStyle = `
    color: #ff007f; 
    font-family: monospace; 
    font-weight: bold; 
    text-shadow: 0 0 12px rgba(255, 0, 127, 0.8), 0 0 24px rgba(127, 0, 255, 0.8);
    line-height: 1.2;
`;

const infoHeaderStyle = `
    color: #e1e1e6;
    background: linear-gradient(90deg, #ff007f, #7f00ff);
    padding: 4px 10px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.9rem;
`;

const infoBodyStyle = `
    color: #a8a8b3;
    font-family: monospace;
    font-size: 0.85rem;
    line-height: 1.5;
`;

console.log(`%c${eggstationLogo}`, bannerStyle);
console.log("%c=== SYSTEM SPECIFICATIONS ===", infoHeaderStyle);
console.log(
    `%c` +
    `• Project      : EGGStation Virtual Console\n` +
    `• Target       : Sega Master System & SG-1000 Hardware Emulation\n` +
    `• Architecture : Decoupled Domain-Driven Design (DDD) & SOLID Standards\n` +
    `• Audio Engine : Strategy B (Zero-Allocation) with 3D Haas Spatial Delay\n` +
    `• Video Engine : Multi-Viewport 2D Canvas & WebGL2 GPU Shader Pipeline\n` +
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
        // Query GPU driver details directly from the host hardware
        const debugInfo = testGL.getExtension('WEBGL_debug_renderer_info');
        const gpuVendor = debugInfo ? testGL.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : testGL.getParameter(testGL.VENDOR);
        const gpuRenderer = debugInfo ? testGL.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : testGL.getParameter(testGL.RENDERER);

        console.log("%cDiagnostic::SUCCESS - WebGL2 is fully operational in this context!", "color: #04d361; font-weight: bold;");
        console.log(`Diagnostic::GPU Vendor   : ${gpuVendor}`);
        console.log(`Diagnostic::GPU Renderer : ${gpuRenderer}`);
    } else {
        console.warn("Diagnostic::FAILED - glCanvas.getContext('webgl2') returned NULL.");
        console.warn("Reason: Browser has blacklisted WebGL2 for local origins or hardware acceleration is blocked.");
    }
} catch (err) {
    console.error("Diagnostic::EXCEPTION - WebGL2 initialization crashed with error:", err);
}
console.log("%c=============================================\n", "color: #ff007f; font-weight: bold;");

// ========================================================================
// STANDARD BOOTSTRAPPER LOADING (COMPOSITION ROOT)
// ========================================================================
document.addEventListener("DOMContentLoaded", () => {
    const videoCanvas = document.getElementById("smsdisplay");
    const glCanvas = document.getElementById("webgldisplay");
    
    if (!videoCanvas || !glCanvas) {
        console.error("EGGStation::Boot Error - Cannot locate Canvas viewports.");
        return;
    }

    // Retrieve standard 2D context
    const videoContext = videoCanvas.getContext("2d", { willReadFrequently: true });
    
    // WebGL2 Context: Requested while the canvas is fully visible and unstyled 
    // to bypass strict browser background GPU sandboxing.
    let glContext = null;
    try {
        glContext = glCanvas.getContext("webgl2") || glCanvas.getContext("experimental-webgl2");
    } catch (e) {
        console.warn("EGGStation::WebGL2 Context retrieval threw an exception: ", e);
    }

    // Now that the WebGL2 context is safely created, we hide the WebGL2 canvas 
    // programmatically before the emulator loop starts.
    if (glContext) {
        glCanvas.style.visibility = "hidden";
        glCanvas.style.position = "absolute";
        glCanvas.style.display = "none"; // Hide securely
    } else {
        console.warn("EGGStation::Warning - WebGL2 is not supported on this host. Falling back to CPU renderers.");
    }

    // Define a simple callback for the Orchestrator to update the FPS counter
    const fpsElement = document.getElementById("fpsSpan");
    const onFpsUpdate = (fps) => {
        if (fpsElement) {
            fpsElement.textContent = `${fps} FPS`;
        }
    };

    // 2. Initialize the Application Layer Orchestrator (Injected with both contexts)
    const orchestrator = new EmulatorOrchestrator(videoContext, glContext, onFpsUpdate);

    // 3. Initialize the Presentation Layer Controller and inject the Orchestrator
    const uiController = new UIController(orchestrator);

    // 4. Initial UI Setup: Load any existing savestate thumbnail from LocalStorage
    uiController.updateSaveStatePreview();
    
    console.log("EGGStation::Architecture Bootstrapped Successfully.");
});