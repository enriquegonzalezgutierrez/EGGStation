/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/presentation/UniversalFeedbackManager.js
 * 
 * Presentation Layer: Universal Audio-Haptic & Visual Feedback Manager.
 * Uses the Web Audio API to mathematically synthesize low-latency mechanical 
 * key click sounds, triggers the browser's vibration API for haptic gamepads, 
 * and renders reactive neon toast notifications.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for synthesizing 
 *    audio-haptic feedback waves and drawing UI toast notifications.
 * - Open/Closed Principle (OCP): Subscribes to generic system events (Observer Pattern) 
 *    to render visual notifications without modifying core hardware pollers.
 */

class UniversalFeedbackManager {
    constructor() {
        this.audioCtx = null;
        this.initializeListeners();
    }

    /**
     * Installs global event delegation on the document body to intercept clicks,
     * and subscribes to hardware event lines (Observer Pattern).
     */
    initializeListeners() {
        document.addEventListener("DOMContentLoaded", () => {
            // Intercept mouse clicks and touch taps synchronously to synthesize switch clicks
            const handleGesture = (e) => {
                const target = e.target;
                if (!target) return;

                const isButton = target.classList.contains("btn") || 
                                 target.classList.contains("v-dir") || 
                                 target.classList.contains("v-action") || 
                                 target.classList.contains("v-system-btn") || 
                                 target.classList.contains("eject-btn-retro") ||
                                 target.tagName === "SELECT" ||
                                 target.tagName === "OPTION" ||
                                 target.closest("aside") !== null;

                if (isButton) {
                    this.triggerClickSound();

                    const isVirtualButton = target.classList.contains("v-dir") || 
                                            target.classList.contains("v-action") || 
                                            target.classList.contains("v-system-btn");
                    if (isVirtualButton) {
                        this.triggerHapticRumble(15);
                    }
                }
            };

            document.body.addEventListener("mousedown", handleGesture);
            document.body.addEventListener("touchstart", handleGesture, { passive: true });
            
            // SOLID Fix: Subscribe to the decoupled Gamepad Event (Observer Pattern / DIP)
            window.addEventListener("eggstation-gamepad-event", (e) => {
                const eventData = e.detail;
                const message = eventData.connected 
                    ? `Controller detected: ${eventData.id.substring(0, 24)}...`
                    : `Controller disconnected: ${eventData.id.substring(0, 24)}...`;
                
                this.showNotification(message);
            });

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
            osc.frequency.setValueAtTime(1400, now); 
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.015); 

            gainOsc.gain.setValueAtTime(0.08, now); 
            gainOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.015); 

            osc.connect(gainOsc);
            gainOsc.connect(ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.02);

            // --- WAVE 2: Programmatic White Noise Snap ---
            const bufferSize = ctx.sampleRate * 0.01; 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1; 
            }

            const noiseSource = ctx.createBufferSource();
            const gainNoise = ctx.createGain();

            noiseSource.buffer = buffer;
            gainNoise.gain.setValueAtTime(0.03, now); 
            gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

            noiseSource.connect(gainNoise);
            gainNoise.connect(ctx.destination);

            noiseSource.start(now);
            noiseSource.stop(now + 0.012);

        } catch (e) {
            console.warn("[UniversalFeedbackManager] Web Audio click synthesis blocked or unsupported:", e);
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

    /**
     * Renders a responsive, retro-neon styled toast notification on the DOM.
     * Moved from InputManager to preserve encapsulation boundaries (SOLID SRP).
     * @param {string} message - Notification text.
     */
    showNotification(message) {
        let toast = document.getElementById('eggstation-gamepad-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'eggstation-gamepad-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.right = '24px';
            toast.style.backgroundColor = 'rgba(20, 10, 35, 0.95)';
            toast.style.border = '2px solid #ff007f';
            toast.style.color = '#fff';
            toast.style.padding = '14px 24px';
            toast.style.borderRadius = '8px';
            toast.style.fontFamily = 'monospace';
            toast.style.fontSize = '0.9rem';
            toast.style.fontWeight = 'bold';
            toast.style.boxShadow = '0 0 20px rgba(255, 0, 127, 0.6)';
            toast.style.zIndex = '99999';
            toast.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span style="color: #ff007f;">[EGGStation]</span> ${message}`;
        
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        if (toast.timeoutId) {
            clearTimeout(toast.timeoutId);
        }
        toast.timeoutId = setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
        }, 4000);
    }
}

// Instantiate globally as an active shared presenter feedback service
window.UniversalFeedback = new UniversalFeedbackManager();