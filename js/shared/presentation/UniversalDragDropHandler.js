/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/UniversalDragDropHandler.js
 * 
 * Role:
 * Presentation Layer: Universal Drag-and-Drop ROM Loader.
 * Intercepts OS file drops over the CRT screen, analyzes file metadata/zip streams, 
 * autodetects the correct target console, hot-swaps hardware, and boots the ROM.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for handling 
 *    the drag-and-drop OS event pipeline and validating/routing dropped files.
 * 2. Dependency Inversion Principle (DIP): Communicates with the emulator cores 
 *    and app bootstrapper through generic abstraction handlers, completely 
 *    decoupling the file loader from individual console architectures.
 */

class UniversalDragDropHandler {
    constructor() {
        this.crtWrapper = null;
        this.initializeListeners();
    }

    /**
     * Locates the CRT target DOM element and attaches the dragging listeners.
     */
    initializeListeners() {
        // Run snychronously on DOM load
        document.addEventListener("DOMContentLoaded", () => {
            this.crtWrapper = document.getElementById("crt-wrapper");
            if (!this.crtWrapper) return;

            // Bind events safely preserving execution contexts
            this.crtWrapper.addEventListener("dragover", (e) => this.handleDragOver(e));
            this.crtWrapper.addEventListener("dragenter", (e) => this.handleDragEnter(e));
            this.crtWrapper.addEventListener("dragleave", (e) => this.handleDragLeave(e));
            this.crtWrapper.addEventListener("drop", (e) => this.handleDrop(e));
            
            console.log("[UniversalDragDropHandler] Immersive Drag-and-Drop listener bound successfully to CRT TV Screen.");
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }

    handleDragEnter(e) {
        e.preventDefault();
        if (this.crtWrapper) {
            // Adds the beautiful glowing outline to show the TV is ready to receive
            this.crtWrapper.style.boxShadow = "0 0 30px #ff007f, 0 0 0 2px #ff007f";
            this.crtWrapper.style.transform = "scale(1.02)";
            this.crtWrapper.style.transition = "all 0.2s ease";
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.resetCrtVisuals();
    }

    resetCrtVisuals() {
        if (this.crtWrapper) {
            this.crtWrapper.style.boxShadow = "";
            this.crtWrapper.style.transform = "";
        }
    }

    /**
     * Intercepts file drop actions, parses extensions, and initiates automatic boot streams.
     */
    async handleDrop(e) {
        e.preventDefault();
        this.resetCrtVisuals();

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const filename = file.name.toLowerCase();

        console.log(`[UniversalDragDropHandler] File dropped over CRT: "${file.name}"`);

        try {
            let targetConsole = null;

            // 1. Handle compressed zip archives by scanning inside using RomDecompressor
            if (filename.endsWith('.zip')) {
                targetConsole = await this.autodetectZipConsoleType(file);
            } else {
                targetConsole = this.detectConsoleTypeByExtension(filename);
            }

            if (!targetConsole) {
                alert("EGGStation::Error: Dropped file is not a supported console ROM (.sms, .sg, .md, .bin, .sfc, .smc, .zip).");
                return;
            }

            console.log(`[UniversalDragDropHandler] Auto-detected console type: "${targetConsole}"`);

            // 2. Hot-swap the virtual hardware snychronously to the correct console
            if (window.bootConsole) {
                window.bootConsole(targetConsole);
            }

            // 3. Trigger the newly instantiated controller to execute the load snychronously
            setTimeout(() => {
                if (window.activeController && typeof window.activeController.handleFileUpload === 'function') {
                    // SMS and Genesis controllers use handleFileUpload
                    window.activeController.handleFileUpload(files);
                } else if (window.activeController && typeof window.activeController.onFileSelected === 'function') {
                    // SNES controller uses onFileSelected
                    const mockEvent = { target: { files: files } };
                    window.activeController.onFileSelected(mockEvent);
                }
            }, 100);

        } catch (error) {
            console.error("[UniversalDragDropHandler] Failed to process dropped file:", error);
            alert("Error loading dropped file: " + error.message);
        }
    }

    /**
     * Scans the extensions within a zip archive dynamically using the shared decompressor.
     * @returns {Promise<string|null>} "SMS", "GEN", "SNES" or null.
     */
    async autodetectZipConsoleType(fileBlob) {
        if (typeof zip === 'undefined') return null;

        return new Promise((resolve) => {
            zip.createReader(new zip.BlobReader(fileBlob), (reader) => {
                reader.getEntries((entries) => {
                    reader.close();
                    
                    // Scan the entry names within the ZIP to find a match
                    for (const entry of entries) {
                        const name = entry.filename.toLowerCase();
                        const detected = this.detectConsoleTypeByExtension(name);
                        if (detected) {
                            resolve(detected);
                            return;
                        }
                    }
                    resolve(null);
                });
            }, () => resolve(null));
        });
    }

    /**
     * Mapping helper to detect console target by string extensions.
     */
    detectConsoleTypeByExtension(name) {
        if (name.endsWith('.sms') || name.endsWith('.sg')) {
            return "SMS";
        }
        if (name.endsWith('.md') || name.endsWith('.gen') || name.endsWith('.bin') || name.endsWith('.smd')) {
            return "GEN";
        }
        if (name.endsWith('.sfc') || name.endsWith('.smc')) {
            return "SNES";
        }
        return null;
    }
}

// Instantiate globally as an active shared presenter service
window.UniversalDragDrop = new UniversalDragDropHandler();