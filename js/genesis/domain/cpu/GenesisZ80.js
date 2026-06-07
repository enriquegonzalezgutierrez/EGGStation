/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/domain/cpu/GenesisZ80.js
 * 
 * Domain Layer: Sega Genesis Custom Z80 Sound Processor Core (WASM Bridge)
 * 
 * Role:
 * Bridges the Sega Genesis sound processor execution to the compiled C++ 
 * GenesisZ80 specialized subclass.
 * 
 * SOLID Principles Applied:
 * 1. Liskov Substitution Principle (LSP): Extends the WASM-backed Z80 base 
 *    class and swaps the target C++ active core to Genesis mode.
 */

class GenesisZ80 extends ZilogZ80 {
    /**
     * @param {Object} mmu - The abstract Z80 sound bus interface.
     */
    constructor(mmu) {
        // Passes true as the second argument to trigger the WASM select_mode(1) (Genesis Mode) snychronously
        super(mmu, true);
    }
}