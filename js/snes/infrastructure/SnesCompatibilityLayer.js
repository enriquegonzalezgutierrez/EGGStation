/**
 * Project: EGGStation - SNES Infrastructure Layer
 * Component: SnesCompatibilityLayer
 * 
 * ROLE:
 * This class implements the Adapter pattern to provide a compatible environment
 * for the legacy SNES core. It satisfies the core's dependencies on global 
 * functions (clearArray, log, etc.) without polluting the global namespace 
 * permanently or allowing other systems to conflict with them.
 * 
 * SOLID Principles:
 * - SRP: Handles only legacy core compatibility and utility formatting.
 * - OCP: Allows the legacy core to run without modifying its internal source code.
 */

class SnesCompatibilityLayer {
    /**
     * Injects required utilities into the global scope.
     * This is necessary because the legacy core (pipu.js, cpu.js) was 
     * authored to expect these functions at the window level.
     */
    static inject() {
        if (window.SnesCompatibilityInjected) return;

        console.log("[EGGStation::SNES] Injecting Legacy Compatibility Layer...");

        window.clearArray = this.clearArray;
        window.log = this.log;
        window.getByteRep = this.getByteRep;
        window.getWordRep = this.getWordRep;
        window.getLongRep = this.getLongRep;
        
        window.SnesCompatibilityInjected = true;
    }

    /**
     * Efficiently zeros out typed arrays.
     * Required by: pipu.js, apu.js, snes.js
     * @param {TypedArray|Array} arr 
     */
    static clearArray(arr) {
        if (!arr) return;
        if (arr.fill) {
            arr.fill(0);
        } else {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = 0;
            }
        }
    }

    /**
     * Bridges internal hardware logs to the EGGStation diagnostic terminal.
     * @param {string} text 
     */
    static log(text) {
        const terminal = document.getElementById("log");
        if (terminal) {
            terminal.innerHTML += `<span class="dev-log">${text}</span>\n`;
            terminal.scrollTop = terminal.scrollHeight;
        } else {
            console.debug("[SNES Core]:", text);
        }
    }

    /**
     * Hexadecimal Formatters for Debugging and Disassembly.
     */
    static getByteRep(val) {
        return (val & 0xFF).toString(16).padStart(2, '0').toUpperCase();
    }

    static getWordRep(val) {
        return (val & 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
    }

    static getLongRep(val) {
        return (val & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
    }
}

// Immediate injection to ensure pipu.js/cpu.js constructors don't fail 
// when called by SnesOrchestrator.
SnesCompatibilityLayer.inject();