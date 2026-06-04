/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesApuTimer (APU Hardware Timer Model)
 * 
 * ROLE:
 * Emulates one of the three internal interval timers of the SPC700 subsystem.
 * Timers 1 and 2 tick at 8kHz, while Timer 3 ticks at 64kHz.
 * 
 * SOLID PRINCIPLES:
 * - Single Responsibility Principle (SRP): Exclusively manages the internal tick
 *   intervals, targets, and counters of a single hardware timer.
 */

{
    class SnesApuTimer {
        /**
         * @param {number} rateInterval - Standard tick division (128 for 8kHz, 16 for 64kHz).
         */
        constructor(rateInterval) {
            this.intervalLimit = rateInterval;
            this.internalCounter = rateInterval;
            
            this.enabled = false;
            this.divider = 0;
            this.target = 0;
            this.stageCounter = 0;
        }

        reset() {
            this.internalCounter = this.intervalLimit;
            this.enabled = false;
            this.divider = 0;
            this.target = 0;
            this.stageCounter = 0;
        }

        /**
         * Ticks the timer down by one SPC700 clock cycle.
         * Optimized inline performance path.
         */
        tick() {
            if (--this.internalCounter <= 0) {
                this.internalCounter = this.intervalLimit;
                if (this.enabled) {
                    this.divider = (this.divider + 1) & 0xff;
                    if (this.divider === this.target) {
                        this.divider = 0;
                        this.stageCounter = (this.stageCounter + 1) & 0xf;
                    }
                }
            }
        }

        /**
         * Reads the 4-bit interval counter value and resets it to zero.
         * @returns {number} Current counter value (0-15).
         */
        readCounter() {
            const val = this.stageCounter;
            this.stageCounter = 0;
            return val;
        }

        /**
         * Configures the active enabled state of the timer.
         * Clears dividers and counters when transitioning from an inactive state.
         * @param {boolean} value
         */
        setEnabled(value) {
            if (!this.enabled && value) {
                this.divider = 0;
                this.stageCounter = 0;
            }
            this.enabled = value;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SnesApuTimer;
    } else if (typeof window !== 'undefined') {
        window.SnesApuTimer = SnesApuTimer;
    }
}