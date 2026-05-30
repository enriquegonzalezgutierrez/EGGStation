/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Application Entry Point: Composition Root
 * 
 * This file is the system Bootstrapper. It executes only once when the DOM 
 * is fully loaded. It connects the Presentation Layer (UIController) with 
 * the Application Layer (EmulatorOrchestrator), injecting the necessary 
 * dependencies (like the Canvas context and UI update callbacks).
 */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Locate the primary visualizer element (HTML5 Canvas)
    const videoCanvas = document.getElementById("smsdisplay");
    if (!videoCanvas) {
        console.error("EGGStation::Boot Error - Cannot locate #smsdisplay canvas.");
        return;
    }

    // Retrieve the 2D rendering context. We use willReadFrequently to optimize
    // for the continuous ImageData manipulation happening in the VDP layer.
    const videoContext = videoCanvas.getContext("2d", { willReadFrequently: true });

    // Define a simple callback for the Orchestrator to update the FPS counter
    // safely without coupling the Orchestrator directly to the DOM element.
    const fpsElement = document.getElementById("fpsSpan");
    const onFpsUpdate = (fps) => {
        if (fpsElement) {
            fpsElement.textContent = `${fps} FPS`;
        }
    };

    // 2. Initialize the Application Layer Orchestrator
    const orchestrator = new EmulatorOrchestrator(videoContext, onFpsUpdate);

    // 3. Initialize the Presentation Layer Controller and inject the Orchestrator
    const uiController = new UIController(orchestrator);

    // 4. Initial UI Setup: Load any existing savestate thumbnail from LocalStorage
    uiController.updateSaveStatePreview();
    
    console.log("EGGStation::Architecture Bootstrapped Successfully.");
});