/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/SystemCarousel.js
 * 
 * Role:
 * Presentation Layer: System Selection Carousel & Fullscreen Modals Coordinator.
 * Manages the interactive 3D console cards track, bottom menu actions, and 
 * glassmorphic overlays. Supports keyboard, mouse, and Gamepad API inputs.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for the 
 *   Home Selection Dashboard, modals toggling, and emulator core boot coordination.
 * - Dependency Inversion Principle (DIP): Polls generic inputs from the shared 
 *   UniversalInputManager instead of binding tight hardware-specific listeners.
 */

class SystemCarousel {
    constructor() {
        this.carouselEl = document.getElementById('system-carousel');
        this.appContainer = document.getElementById('app-container');
        this.cards = Array.from(document.querySelectorAll('.console-card'));
        this.romSelector = document.getElementById('carouselRomSelector');
        
        // Full-Screen Page Modals
        this.dossierModal = document.getElementById('dossier-modal');
        this.legalModal = document.getElementById('legal-modal');
        
        // UI Navigation buttons
        this.btnOpenDossier = document.getElementById('btn-open-dossier');
        this.btnCloseDossier = document.getElementById('btn-close-dossier');
        this.btnOpenLegal = document.getElementById('btn-open-legal');
        this.btnCloseLegal = document.getElementById('btn-close-legal');

        this.currentCardIdx = 1; // Default to Genesis (center)
        this.isActive = true;
        this.activeModal = null; // Track if a modal page is open ('dossier' or 'legal')
        this.inputCooldown = 0; // Debounce for gamepad/keyboard navigation

        if (this.carouselEl) {
            this.init();
        }
    }

    init() {
        this.updateFocus();
        this.bindEvents();
        this.pollInputLoop();
        console.log("[SystemCarousel] Pristine Console Home Screen Initialized.");
    }

    /**
     * Updates the active Focused class only on the selected console card.
     */
    updateFocus() {
        if (this.activeModal) return; // Freeze card animations if a modal page is open

        this.cards.forEach((card, index) => {
            if (index === this.currentCardIdx) {
                card.classList.add('focused');
            } else {
                card.classList.remove('focused');
            }
        });
    }

    /**
     * Binds mouse interactions and modal toggle actions.
     */
    bindEvents() {
        // --- 1. Console Cards Mouse Hover and Selection ---
        this.cards.forEach((card, index) => {
            card.addEventListener('mouseenter', () => {
                if (!this.isActive || this.activeModal) return;
                this.currentCardIdx = index;
                this.updateFocus();
            });

            card.addEventListener('click', () => {
                if (!this.isActive || this.activeModal) return;
                this.triggerSystemSelection(card);
            });
        });

        // --- 2. Hidden File Dialog trigger ---
        if (this.romSelector) {
            this.romSelector.addEventListener('change', (e) => this.handleRomSelection(e));
        }

        // --- 3. Dossier Page Overlay Handlers ---
        this.btnOpenDossier?.addEventListener('click', () => this.openModal('dossier'));
        this.btnCloseDossier?.addEventListener('click', () => this.closeActiveModal());

        // --- 4. Legal Page Overlay Handlers ---
        this.btnOpenLegal?.addEventListener('click', () => this.openModal('legal'));
        this.btnCloseLegal?.addEventListener('click', () => this.closeActiveModal());
    }

    /**
     * Opens a full-screen overlay page.
     * @param {string} modalType - 'dossier' or 'legal'
     */
    openModal(modalType) {
        if (!this.isActive) return;
        this.triggerClickFeedback();

        this.activeModal = modalType;
        const modal = (modalType === 'dossier') ? this.dossierModal : this.legalModal;
        
        if (modal) {
            modal.classList.remove('hidden');
            // Force redraw before adding active class to trigger CSS transition
            void modal.offsetWidth; 
            modal.classList.add('active');
        }
        this.updateFocus();
    }

    /**
     * Closes any active full-screen overlay page.
     */
    closeActiveModal() {
        if (!this.activeModal) return;
        this.triggerClickFeedback();

        const modal = (this.activeModal === 'dossier') ? this.dossierModal : this.legalModal;
        this.activeModal = null;

        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                // Hide display completely after fade transition completes
                if (!this.activeModal) modal.classList.add('hidden');
            }, 400);
        }
        this.updateFocus();
    }

    triggerClickFeedback() {
        if (window.UniversalFeedback) {
            window.UniversalFeedback.triggerClickSound();
        }
    }

    /**
     * Animates system selection card and opens the standard system File Selector.
     */
    triggerSystemSelection(card) {
        this.triggerClickFeedback();

        card.classList.add('active-press');
        setTimeout(() => card.classList.remove('active-press'), 150);

        if (this.romSelector) {
            this.romSelector.click();
        }
    }

    /**
     * Menu polling loop to handle Keyboard & Gamepad actions.
     */
    pollInputLoop() {
        if (!this.isActive) return; // Terminate menu polling if emulator is active

        if (this.inputCooldown > 0) {
            this.inputCooldown--;
        } else if (window.UniversalInput) {
            let moved = false;

            if (this.activeModal) {
                // --- A. Controls when a Modal Page is open ---
                if (window.UniversalInput.isPressed("B") || window.UniversalInput.isPressed("SELECT")) {
                    // B Button or SELECT closes active modal page
                    this.closeActiveModal();
                    this.inputCooldown = 15;
                }
            } else {
                // --- B. Controls on the Pristine Carousel homepage ---
                if (window.UniversalInput.isPressed("LEFT")) {
                    this.currentCardIdx = (this.currentCardIdx > 0) ? this.currentCardIdx - 1 : this.cards.length - 1;
                    moved = true;
                } else if (window.UniversalInput.isPressed("RIGHT")) {
                    this.currentCardIdx = (this.currentCardIdx < this.cards.length - 1) ? this.currentCardIdx + 1 : 0;
                    moved = true;
                } else if (window.UniversalInput.isPressed("A") || window.UniversalInput.isPressed("START")) {
                    // A Button or Start selects the console and boots ROM
                    this.triggerSystemSelection(this.cards[this.currentCardIdx]);
                    this.inputCooldown = 60; // Long debounce to block double trigger
                } else if (window.UniversalInput.isPressed("SELECT") || window.UniversalInput.isPressed("Y")) {
                    // SELECT or Gamepad Y-Button opens Creator Dossier instantly
                    this.openModal('dossier');
                    this.inputCooldown = 20;
                }
            }

            if (moved) {
                this.triggerClickFeedback();
                this.updateFocus();
                this.inputCooldown = 12; // Directional input debounce
            }
        }

        requestAnimationFrame(() => this.pollInputLoop());
    }

    /**
     * Coordinates the boot sequence once a file has been selected from the carousel.
     */
    handleRomSelection(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const targetSystem = this.cards[this.currentCardIdx].getAttribute('data-system');
        
        console.log(`[SystemCarousel] Dispatching target core: ${targetSystem}`);

        // 1. Hide selection menu, show Emulator view
        this.isActive = false;
        this.carouselEl.classList.remove('active');
        this.appContainer.classList.remove('hidden');

        // 2. Invoke the global hot-swapper
        if (window.bootConsole) {
            window.bootConsole(targetSystem);
        }

        // 3. Inject selected ROM directly to the active system controller
        setTimeout(() => {
            if (window.activeController) {
                if (typeof window.activeController.handleFileUpload === 'function') {
                    // SMS & Genesis
                    window.activeController.handleFileUpload(files);
                } else if (typeof window.activeController.onFileSelected === 'function') {
                    // SNES
                    window.activeController.onFileSelected({ target: { files: files } });
                }
            }
            this.romSelector.value = ''; // Clean buffer
        }, 150);
    }

    /**
     * Restores Carousel state on return-home events.
     */
    show() {
        this.isActive = true;
        this.inputCooldown = 30;
        this.currentCardIdx = 1; // Default to central console
        this.activeModal = null;

        // Hide overlay pages
        this.dossierModal.classList.add('hidden');
        this.dossierModal.classList.remove('active');
        this.legalModal.classList.add('hidden');
        this.legalModal.classList.remove('active');

        // Wake up selection screen
        this.carouselEl.classList.add('active');
        this.appContainer.classList.add('hidden');

        this.updateFocus();
        this.pollInputLoop();
    }
}

// Instantiate globally as an active shared presenter system carousel service
window.SystemCarouselManager = new SystemCarousel();