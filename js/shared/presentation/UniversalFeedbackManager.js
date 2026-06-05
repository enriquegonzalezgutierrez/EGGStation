/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/UniversalFeedbackManager.js
 * 
 * Role:
 * Presentation Layer: Universal Audio-Haptic Feedback Manager.
 * Uses the Web Audio API to mathematically synthesize low-latency mechanical 
 * key click sounds and triggers the browser's vibration API for tactile gamepads.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for synthesizing 
 *    audio-haptic feedback waves and detecting user click targets. It has no knowledge 
 *    of console ROM mappers or hardware registers.
 * 2. Open/Closed Principle (OCP): Leverages global DOM Event Delegation. New UI 
 *    buttons or components will automatically inherit satisfying feedback clicks 
 *    without modifying the feedback manager or adding click listeners in the UI cores.
 */

class UniversalFeedbackManager {
    constructor() {
        this.audioCtx = null;
        this.initializeListeners();
    }

    /**
     * Installs global event delegation on the document body to intercept clicks.
     */
    initializeListeners() {
        document.addEventListener("DOMContentLoaded", () => {
            // Decoupled global interception (Zero-coupling with system specific modules)
            const handleGesture = (e) => {
                const target = e.target;
                if (!target) return;

                // Match typical EGGStation interactive UI elements
                const isButton = target.classList.contains("btn") || 
                                 target.classList.contains("v-dir") || 
                                 target.classList.contains("v-action") || 
                                 target.classList.contains("v-system-btn") || 
                                 target.classList.contains("eject-btn-retro") ||
                                 target.tagName === "SELECT" ||
                                 target.tagName === "OPTION" ||
                                 target.closest("aside") !== null; // sidebar settings clicks

                if (isButton) {
                    // 1. Synthesize satisfying tactile click sound programmatically
                    this.triggerClickSound();

                    // 2. Trigger micro haptic vibration rumble only on mobile virtual buttons
                    const isVirtualButton = target.classList.contains("v-dir") || 
                                            target.classList.contains("v-action") || 
                                            target.classList.contains("v-system-btn");
                    if (isVirtualButton) {
                        this.triggerHapticRumble(15);
                    }
                }
            };

            // Intercept mouse clicks and touch taps synchronously
            document.body.addEventListener("mousedown", handleGesture);
            document.body.addEventListener("touchstart", handleGesture, { passive: true });
            
            console.log("[UniversalFeedbackManager] Universal Audio-Haptic presenter service fully active.");
        });
    }

    /**
     * Synthesizes a high-fidelity mechanical switch click sound programmatically 
     * using Web Audio API oscillators and noise buffers.
     */
    triggerClickSound() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            // Lazy-load AudioContext on the very first user gesture to comply with browser autoplay policies
            if (!this.audioCtx) {
                this.audioCtx = new AudioContextClass();
            }

            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const ctx = this.audioCtx;
            const now = ctx.currentTime;

            // --- WAVE 1: High Frequency Pitch Pop (Simulates mechanical leaf contact) ---
            const osc = ctx.createOscillator();
            const gainOsc = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(1400, now); // High pitch click frequency
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.015); // Quick downward slide

            gainOsc.gain.setValueAtTime(0.08, now); // Subtle comfortable volume
            gainOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.015); // Fast exponential decay

            osc.connect(gainOsc);
            gainOsc.connect(ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.02);

            // --- WAVE 2: Programmatic White Noise Snap (Simulates spring/plastic click release) ---
            const bufferSize = ctx.sampleRate * 0.01; // Tiny 10ms noise buffer
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1; // Generate raw white noise
            }

            const noiseSource = ctx.createBufferSource();
            const gainNoise = ctx.createGain();

            noiseSource.buffer = buffer;
            gainNoise.gain.setValueAtTime(0.03, now); // Suttle crackle
            gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

            noiseSource.connect(gainNoise);
            gainNoise.connect(ctx.destination);

            noiseSource.start(now);
            noiseSource.stop(now + 0.012);

        } catch (e) {
            console.warn("[UniversalFeedbackManager] Web Audio click synthesis blocked or unsupported by browser:", e);
        }
    }

    /**
     * Triggers a satisfying haptic vibration rumble on compatible mobile devices.
     * @param {number} duration - Vibration length in milliseconds.
     */
    triggerHapticRumble(duration = 15) {
        if (navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }
}

// Instantiate globally as an active shared presenter feedback service
window.UniversalFeedback = new UniversalFeedbackManager();