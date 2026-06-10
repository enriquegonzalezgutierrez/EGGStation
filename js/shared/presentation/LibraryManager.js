/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/LibraryManager.js
 * 
 * Role:
 * Presentation Layer: Dynamic & Persistent Games Library Drawer Manager.
 * Queries the IndexedDB database to dynamically aggregate and render the user's 
 * actual local offline ROM collection. Handles real-time deletions (✖) 
 * and generates high-fidelity retro vector SVG covers on-the-fly.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for rendering, 
 *   drawing, and maintaining the Library panel drawers, removing this UI rendering 
 *   overhead completely from the core app.js bootstrapper (Composition Root).
 * - Dependency Inversion Principle (DIP): Relies on the abstract IndexedDbManager 
 *   persistence client to query and delete stored records.
 */

class LibraryManager {
    constructor() {
        this.gridEl = document.getElementById('library-grid');
        this.dbManager = new IndexedDbManager("EGGStationDB", "savestates");
    }

    /**
     * Generates a minimal, console-themed retro vector SVG cover in real-time
     * based on the target console system and the game's file name.
     * 
     * @param {string} system - Core identifier (SMS, GEN, SNES).
     * @param {string} title - Raw file name of the ROM.
     * @returns {string} Fully rendered inline SVG block.
     */
    generateDynamicSvgCover(system, title) {
        let themeColor = "#7f00ff"; // Default purple
        let consoleLabel = "CONSOLE";
        
        if (system === "SMS") { 
            themeColor = "#04d361"; 
            consoleLabel = "SEGA SYSTEM"; 
        } else if (system === "GEN") { 
            themeColor = "#ff007f"; 
            consoleLabel = "MEGA DRIVE"; 
        } else if (system === "SNES") { 
            themeColor = "#5e5189"; 
            consoleLabel = "SUPER Nintendo"; 
        }

        // Clean file extension and truncate to prevent SVG text overflows
        let displayTitle = title.replace(/\.[^/.]+$/, "");
        if (displayTitle.length > 25) {
            displayTitle = displayTitle.substring(0, 22) + "...";
        }

        return `
            <svg viewBox="0 0 60 80" width="100%" height="100%">
                <rect width="60" height="80" fill="#0d1117"/>
                <rect x="5" y="5" width="50" height="40" fill="${themeColor}" rx="3"/>
                <text x="30" y="22" fill="#fff" font-family="monospace" font-size="5" font-weight="bold" text-anchor="middle">${system}</text>
                <text x="30" y="32" fill="#fff" font-family="sans-serif" font-size="2.5" text-anchor="middle">${displayTitle}</text>
                <rect x="5" y="55" width="50" height="20" fill="#1f2937" rx="2"/>
                <text x="30" y="67" fill="#8e8e9f" font-family="sans-serif" font-size="3" text-anchor="middle">${consoleLabel}</text>
            </svg>
        `;
    }

    /**
     * Scans IndexedDB and builds the dynamic library cards grid on-the-fly.
     */
    async render() {
        if (!this.gridEl) return;

        this.gridEl.innerHTML = ""; // Clear existing grid cards

        try {
            // Retrieve all stored items from IndexedDB
            const allItems = await this.dbManager.getAll();
            
            // Filter keys starting with "ROM_" (indicating dynamically imported games)
            const romItems = allItems.filter(item => item.key && item.key.indexOf("ROM_") === 0);

            if (romItems.length === 0) {
                this.renderEmptyState();
                return;
            }

            // Loop and build cards dynamically
            for (const item of romItems) {
                const romData = item.payload; // contains { name, system, buffer }
                const cleanKey = item.key;
                
                const card = document.createElement('div');
                card.className = "game-card";
                card.style.position = "relative";

                const svgCover = this.generateDynamicSvgCover(romData.system, romData.name);

                card.innerHTML = `
                    <div class="game-cover">${svgCover}</div>
                    <div class="game-details">
                        <span class="game-title" style="word-break: break-all; padding-right: 15px;">${romData.name}</span>
                        <span class="game-badge badge-${romData.system.toLowerCase()}">${romData.system}</span>
                    </div>
                    <!-- Close button to remove from Library -->
                    <button class="delete-rom-btn" aria-label="Delete ROM" style="
                        position: absolute;
                        top: 8px; right: 8px;
                        background: none; border: none;
                        color: var(--text-muted); cursor: pointer;
                        font-size: 0.8rem; padding: 4px;
                        transition: color 0.2s ease;
                    ">✖</button>
                `;

                // Handle Delete ROM from collection
                const deleteBtn = card.querySelector('.delete-rom-btn');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Avoid triggering card boot click
                    if (confirm(`Are you sure you want to remove "${romData.name}" from your dynamic Library?`)) {
                        await this.dbManager.delete(cleanKey);
                        this.render(); // Re-render instantly
                    }
                });

                // Hover style for the delete button
                deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.color = "var(--neon-pink)");
                deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.color = "var(--text-muted)");

                // Click to boot game from database (Lightning fast & fully offline!)
                card.addEventListener('click', () => {
                    console.log(`[LibraryManager] Launching "${romData.name}" from IndexedDB...`);
                    
                    if (window.runRomFromBuffer) {
                        window.runRomFromBuffer(romData.system, romData.name, romData.buffer);
                    }
                    
                    if (window.closeLibraryDrawer) {
                        window.closeLibraryDrawer();
                    }
                });

                this.gridEl.appendChild(card);
            }
        } catch (err) {
            console.error("[LibraryManager] Failed to query dynamic library:", err);
        }
    }

    /**
     * Renders a beautifully stylized empty-state warning inside the library panel.
     */
    renderEmptyState() {
        this.gridEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 10px; font-size: 0.85rem; line-height: 1.6;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; color: var(--neon-pink); opacity: 0.6;">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
                <p>Your library is empty.</p>
                <p style="font-size: 0.75rem; margin-top: 8px;">Drag & Drop ROMs or select them via the Carousel to build your offline collection.</p>
            </div>
        `;
    }
}

// Instantiate globally as an active shared presenter library manager service
window.LibraryManagerInstance = new LibraryManager();