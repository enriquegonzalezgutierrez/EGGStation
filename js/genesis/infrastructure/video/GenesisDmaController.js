/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * File: js/genesis/infrastructure/video/GenesisDmaController.js
 * 
 * Infrastructure Layer: Genesis VDP DMA (Direct Memory Access) Controller
 * 
 * Role:
 * Manages physical DMA memory transfer states and operations. 
 * Handles Memory-to-VDP copy, VRAM block fill patterns, and internal VRAM copies.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Isolates DMA transaction loops, timing 
 *   cycles, and write state machines entirely from visual rendering and CPU registers.
 */

class GenesisDmaController {
    /**
     * Executes a Memory-to-VDP DMA transfer (ROM/RAM to VRAM/CRAM/VSRAM).
     * @param {GenesisVdp} vdp - The parent VDP instance.
     * @param {Function} readCallback - CPU master bus reader delegate.
     * @param {Object} readCallbackUserData - Target CPU memory context.
     * @param {Function} colorUpdatedCallback - Color conversion update delegate.
     * @param {Object} callbackUserData - UI/Engine context.
     * @param {number} targetCycle - System clock cycle timestamp.
     */
    static runMemory(vdp, readCallback, readCallbackUserData, colorUpdatedCallback, callbackUserData, targetCycle) {
        vdp.dmaRunning = true;
        const dmaCount = vdp.dmaLength === 0 ? 0x10000 : vdp.dmaLength;
        let sourceAddr = ((vdp.dmaSourceAddressHigh << 16) | vdp.dmaSourceAddressLow) << 1;
        let loopCount = dmaCount;

        do {
            const value = readCallback(readCallbackUserData, sourceAddr, targetCycle);
            vdp.writeAndIncrement(value, colorUpdatedCallback, callbackUserData);
            sourceAddr = (sourceAddr + 2) & 0xFFFFFF;
        } while (--loopCount > 0);

        vdp.dmaSourceAddressLow = (sourceAddr >> 1) & 0xFFFF;
        vdp.dmaSourceAddressHigh = (sourceAddr >> 17) & 0x7F; 
        vdp.dmaLength = 0;
        vdp.dmaRunning = false;
    }

    /**
     * Executes a hardware VRAM Block Fill DMA transfer.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     * @param {number} value - The 16-bit word data containing the fill byte.
     * @param {Function} colorUpdatedCallback - Color conversion update delegate.
     * @param {Object} callbackUserData - Engine context.
     */
    static runFill(vdp, value, colorUpdatedCallback, callbackUserData) {
        vdp.dmaRunning = true;
        let loopCount = vdp.dmaLength === 0 ? 0x10000 : vdp.dmaLength;
        const fillByte = (value >> 8) & 0xFF; // Genesis VRAM Fill always uses the high byte

        if (vdp.accessSelectedBuffer === 0) { // VRAM Fill
            do {
                vdp.writeVRAM(vdp.accessAddressRegister, fillByte);
                vdp.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (vdp.accessSelectedBuffer === 1) { // CRAM Fill
            do {
                const cramIdx = Math.floor(vdp.accessAddressRegister / 2) % 64;
                vdp.cram[cramIdx] = value;
                vdp.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        } else if (vdp.accessSelectedBuffer === 2) { // VSRAM Fill
            do {
                const vsramIdx = Math.floor(vdp.accessAddressRegister / 2) % 64;
                if (vsramIdx < 40) {
                    vdp.vsram[vsramIdx] = value;
                }
                vdp.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        vdp.dmaLength = 0;
        vdp.dmaRunning = false;
    }

    /**
     * Executes an internal VRAM-to-VRAM DMA Copy transfer.
     * @param {GenesisVdp} vdp - The parent VDP instance.
     */
    static runCopy(vdp) {
        vdp.dmaRunning = true;
        let loopCount = vdp.dmaLength === 0 ? 0x10000 : vdp.dmaLength;
        let sourceAddr = ((vdp.dmaSourceAddressHigh << 16) | vdp.dmaSourceAddressLow) & 0xFFFF;

        if (vdp.accessSelectedBuffer === 0) { // VRAM Copy
            do {
                const val = vdp.readVRAM(sourceAddr);
                vdp.writeVRAM(vdp.accessAddressRegister, val);
                
                sourceAddr = (sourceAddr + 1) & 0xFFFF;
                vdp.incrementAccessAddressRegister();
            } while (--loopCount > 0);
        }
        vdp.dmaLength = 0;
        vdp.dmaRunning = false;
    }
}