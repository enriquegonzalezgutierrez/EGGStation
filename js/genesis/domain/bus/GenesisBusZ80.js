/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Genesis Secondary Z80 CPU Memory Bus
 * 
 * Emulates the memory address bus and port control logic of the secondary 
 * Zilog Z80 processor. Handles local 8KB RAM, FM YM2612 register bindings, 
 * VDP port mappings, and the 68K memory window banking register.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the secondary Z80 
 * memory cycles completely from the primary Motorola 68000 physical bus.
 */

class GenesisBusZ80 {
    /**
     * @param {GenesisControllerManager} controllerManager - The inputs manager.
     * @param {GenesisYm2612} fm - Main FM Synthesizer.
     * @param {GenesisVdp} vdp - Visual VDP Co-processor.
     */
    constructor(controllerManager, fm, vdp) {
        this.controllerManager = controllerManager;
        this.fm = fm;
        this.vdp = vdp;

        // Dedicated Z80 local 8KB RAM buffer
        this.ram = new Uint8Array(0x2000);

        // 9-bit shifting banking register used to map into 68K memory space (initialized to 0)
        this.bankRegister = 0; 
    }

    initialise() {
        this.ram.fill(0);
        this.bankRegister = 0;
    }

    /**
     * Checks if the Z80 is currently frozen by active DMA bus locks.
     * @param {Object} state - Global state context.
     * @returns {boolean} True if Z80 cannot run.
     */
    isZ80Frozen(state) {
        return state.z80.bus_requested || state.z80.reset_held || state.z80.frozen_by_dma_transfer;
    }

    /**
     * Synchronizes and reads an 8-bit byte from the Z80 memory bus.
     * @param {Object} state - Global state context.
     * @param {number} address - 16-bit address offset.
     * @param {Function} m68kReadCallback - Parent 68K memory reader function.
     * @param {Object} callbackUserData - User context pointer.
     * @param {number} targetCycle - Sync target clock cycle.
     * @returns {number} 8-bit data readout.
     */
    read(state, address, m68kReadCallback, callbackUserData, targetCycle) {
        address = address & 0xFFFF;
        const chunk = Math.floor(address / 0x2000) | 0;

        switch (chunk) {
            case 0: // 0x0000 - 0x1FFF
            case 1: // 0x2000 - 0x3FFF
                // Access local 8KB RAM
                return this.ram[address % 0x2000];

            case 2: // 0x4000 - 0x5FFF
                // Access YM2612 FM synthesis registers snychronously
                if (this.fm) {
                    return this.fm.update(targetCycle) & 0xFF;
                }
                break;

            case 3: // 0x6000 - 0x7FFF
                if (address < 0x7F00) {
                    return 0xFF; // Unmapped high-Z bus default
                } else {
                    // Access VDP ports through the 68K's bus
                    const vdpAddr = 0xC00000 + (address & 0x1F);
                    return this.readFromM68kBus(state, vdpAddr, m68kReadCallback, callbackUserData, targetCycle);
                }

            case 4: // 0x8000 - 0x9FFF
            case 5: // 0xA000 - 0xBFFF
            case 6: // 0xC000 - 0xDFFF
            case 7: // 0xE000 - 0xFFFF
                // Access the 68K memory window using the shifting bank register
                const windowAddr = ((this.bankRegister * 0x8000) | (address % 0x8000)) >>> 0;
                return this.readFromM68kBus(state, windowAddr, m68kReadCallback, callbackUserData, targetCycle);
        }

        return 0;
    }

    /**
     * Synchronizes and writes an 8-bit byte to the Z80 memory bus.
     * @param {Object} state - Global state context.
     * @param {number} address - 16-bit address offset.
     * @param {number} value - 8-bit data.
     * @param {Function} m68kWriteCallback - Parent 68K memory writer function.
     * @param {Object} callbackUserData - User context pointer.
     * @param {number} targetCycle - Sync target clock cycle.
     */
    write(state, address, value, m68kWriteCallback, callbackUserData, targetCycle) {
        address = address & 0xFFFF;
        value = value & 0xFF;
        const chunk = Math.floor(address / 0x2000) | 0;

        switch (chunk) {
            case 0: // 0x0000 - 0x1FFF
            case 1: // 0x2000 - 0x3FFF
                // Access local 8KB RAM
                this.ram[address % 0x2000] = value;
                break;

            case 2: // 0x4000 - 0x5FFF
                // Access YM2612 FM synthesis registers snychronously
                if (this.fm) {
                    this.fm.update(targetCycle);
                    if ((address & 1) === 0) {
                        this.fm.writeAddress((address & 2) !== 0 ? 1 : 0, value);
                    } else {
                        this.fm.writeData(value);
                    }
                }
                break;

            case 3: // 0x6000 - 0x7FFF
                if (address < 0x6100) {
                    // Update 9-bit shifting banking register (writes LSB, shifts other bits)
                    this.bankRegister = (this.bankRegister >> 1) & 0xFF;
                    this.bankRegister |= (value & 1) !== 0 ? 0x100 : 0;
                } else if (address >= 0x7F00) {
                    // Access VDP ports through the 68K's bus
                    const vdpAddr = 0xC00000 + (address & 0x1F);
                    this.writeToM68kBus(state, vdpAddr, value, m68kWriteCallback, callbackUserData, targetCycle);
                }
                break;

            case 4: // 0x8000 - 0x9FFF
            case 5: // 0xA000 - 0xBFFF
            case 6: // 0xC000 - 0xDFFF
            case 7: // 0xE000 - 0xFFFF
                // Access the 68K memory window using the shifting bank register
                const windowAddr = ((this.bankRegister * 0x8000) | (address % 0x8000)) >>> 0;
                this.writeToM68kBus(state, windowAddr, value, m68kWriteCallback, callbackUserData, targetCycle);
                break;
        }
    }

    // ========================================================================
    // HELPER BUS HANDLERS (68K ACCESS ARBITRATION)
    // ========================================================================

    m68kBusAccessCommon(state, callbackUserData) {
        // If the primary 68K bus is currently locked by a DMA transfer, freeze the Z80
        if (state.m68k.frozen_by_dma_transfer) {
            state.z80.frozen_by_dma_transfer = true;
            callbackUserData.sync.z80.terminate_early = true;
        }
    }

    readFromM68kBus(state, address, m68kReadCallback, callbackUserData, targetCycle) {
        this.m68kBusAccessCommon(state, callbackUserData);
        const isOdd = (address & 1) !== 0;

        // Perform snychronous byte read from 68K bus
        const wordAddress = Math.floor(address / 2) | 0;
        const word = m68kReadCallback(callbackUserData, wordAddress, !isOdd, isOdd, null, targetCycle) | 0;
        return (word >> (isOdd ? 0 : 8)) & 0xFF;
    }

    writeToM68kBus(state, address, value, m68kWriteCallback, callbackUserData, targetCycle) {
        this.m68kBusAccessCommon(state, callbackUserData);
        const isOdd = (address & 1) !== 0;

        // Perform snychronous byte write to 68K bus
        const wordAddress = Math.floor(address / 2) | 0;
        const shiftedVal = (value << (isOdd ? 0 : 8)) & 0xFFFF;
        m68kWriteCallback(callbackUserData, wordAddress, !isOdd, isOdd, null, shiftedVal, targetCycle);
    }
}