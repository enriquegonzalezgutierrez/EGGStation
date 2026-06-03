/**
 * Project: EGGStation - Super Nintendo (SNES) Infrastructure Layer
 * Component: SnesCompatibilityLayer (Shim/Adapter for Legacy Core)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * This class implements the Adapter pattern to satisfy the legacy SNES core's 
 * dependencies on global functions (clearArray, log, hex formatters, etc.).
 * It injects them safely into the global window namespace prior to loading 
 * the legacy cpu.js/pipu.js files, ensuring smooth, error-free execution.
 * 
 * SOLID Principles:
 * - SRP: Handles exclusively global namespace shim injection and utility logging.
 * - OCP: Allows the legacy core to run without modifying its internal legacy source code.
 */

class SnesCompatibilityLayer {
    /**
     * Injects required utilities into the global window scope.
     * This is necessary because the unrefactored legacy core (pipu.js, cpu.js, snes.js) 
     * was authored to expect these functions at the window level.
     */
    static inject() {
        if (window.SnesCompatibilityInjected) return;

        console.log("[EGGStation::SNES] Injecting Legacy Compatibility Layer...");

        // Inject core expected helpers into global scope
        window.clearArray = this.clearArray;
        window.log = this.log;
        window.getByteRep = this.getByteRep;
        window.getWordRep = this.getWordRep;
        window.getLongRep = this.getLongRep;
        
        window.SnesCompatibilityInjected = true;
    }

    /**
     * Efficiently zeros out typed arrays or standard arrays.
     * Required by: pipu.js, apu.js, snes.js, spc.js, dsp.js
     * @param {TypedArray|Array} arr - The array target to clear.
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
     * Bridges internal hardware logs from the legacy core to the EGGStation diagnostic terminal.
     * @param {string} text - Log text string.
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
     * Required by: trace.js and internal disassembler traces.
     */
    static getByteRep(val) {
        return ("0" + val.toString(16)).slice(-2).toUpperCase();
    }

    static getWordRep(val) {
        return ("000" + val.toString(16)).slice(-4).toUpperCase();
    }

    static getLongRep(val) {
        return ("00000" + val.toString(16)).slice(-6).toUpperCase();
    }
}

// Immediate injection to ensure pipu.js/cpu.js/snes.js constructors don't fail 
// when loaded by index.html and accessed by SnesOrchestrator.
SnesCompatibilityLayer.inject();