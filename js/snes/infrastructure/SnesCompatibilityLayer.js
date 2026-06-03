/**
 * Project: EGGStation - Super Nintendo (SNES) Infrastructure Layer
 * Component: SnesCompatibilityLayer (Shim/Adapter for Legacy Core)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * This class implements the Adapter pattern to satisfy the legacy SNES core's 
 * dependencies on global functions (clearArray, log, hex formatters, etc.).
 * It injects them safely into the global window namespace prior to loading 
 * the legacy files, ensuring smooth, error-free execution.
 * 
 * SOLID Principles:
 * - SRP: Handles exclusively global namespace shim injection and utility logging.
 * - OCP: Allows the legacy core to run without modifying its internal legacy source code.
 */

class SnesCompatibilityLayer {
    /**
     * Injects required utilities and CPU constants into the global window scope.
     * This is necessary because the legacy core was authored to expect these 
     * functions and constants at the global level.
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

        // CORRECTED: RICOH 5A22 CPU HARDWARE ADDRESSING MODES CONSTANTS
        window.IMP = 0;   // Implied / Accumulator
        window.IMM = 1;   // Immediate (8-bit)
        window.IMMm = 2;  // Immediate (Size depends on M flag)
        window.IMMx = 3;  // Immediate (Size depends on X flag)
        window.IMMl = 4;  // Immediate (Always 16-bit)
        window.DP = 5;    // Direct Page
        window.DPX = 6;   // Direct Page Indexed on X
        window.DPY = 7;   // Direct Page Indexed on Y
        window.IDP = 8;   // Direct Indirect
        window.IDX = 9;   // Direct Indirect Indexed (X)
        window.IDY = 10;  // Indirect Direct Indexed (Y), for RMW and writes
        window.IDYr = 11; // Indirect Direct Indexed (Y) for reads (possible extra cycle)
        window.IDL = 12;  // Indirect Direct Long
        window.ILY = 13;  // Indirect Direct Long Indexed (Y)
        window.SR = 14;   // Stack Relative
        window.ISY = 15;  // Stack Relative Indexed
        window.ABS = 16;  // Absolute
        window.ABX = 17;  // Absolute Indexed on X for RMW and writes
        window.ABXr = 18; // Absolute Indexed on X for reads (possible extra cycle)
        window.ABY = 19;  // Absolute Indexed on Y for RMW and writes
        window.ABYr = 20; // Absolute Indexed on Y for reads (possible extra cycle)
        window.ABL = 21;  // Absolute Long
        window.ALX = 22;  // Absolute Long Indexed (X)
        window.IND = 23;  // Indirect (JMP only)
        window.IAX = 24;  // Indirect Indexed (X) (JSR only)
        window.IAL = 25;  // Indirect Long (JML only)
        window.REL = 26;  // Relative (8-bit signed branch offset)
        window.RLL = 27;  // Relative Long (16-bit signed branch offset)
        window.BM = 28;   // Block Move (MVP / MVN)
        
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