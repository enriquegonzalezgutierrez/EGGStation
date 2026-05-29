/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: WebLocalStorageSerializer
 * 
 * Manages standard Emulator Savestates (Save/Load) by serializing the complete,
 * microsecond-accurate operational state of the CPU, VDP, MMU, and PSG 
 * directly into the browser's localStorage.
 */

class WebLocalStorageSerializer {
    constructor() {}

    /**
     * Serializes the active emulator configuration state to localStorage.
     * @param {string} cname - Unique catalog name of the active Cartridge ROM.
     * @param {ZilogZ80} cpu - The system CPU.
     * @param {Sega315_5124_Vdp} vdp - The visual co-processor VDP.
     * @param {SegaMasterSystemBus} mmu - The unified system memory bus.
     * @param {Sega315_5124_Psg} psg - The integrated sound generator PSG.
     */
    serialize(cname, cpu, vdp, mmu, psg) {
        // Save matching Cartridge identifier
        localStorage.setItem('cartName', cname);

        // --- CPU Registers and State Flags ---
        localStorage.setItem('cpuRegisters', JSON.stringify(cpu.registers));
        localStorage.setItem('cpuShadowRegisters', JSON.stringify(cpu.shadowRegisters));
        localStorage.setItem('cpuMaskableIntEnabled', JSON.stringify(cpu.maskableInterruptsEnabled));
        localStorage.setItem('cpuMaskableIntWaiting', JSON.stringify(cpu.maskableInterruptWaiting));
        localStorage.setItem('cpuinterruptMode', JSON.stringify(cpu.interruptMode));
        localStorage.setItem('cputotCycles', JSON.stringify(cpu.totCycles));
        localStorage.setItem('cpuNMIWaiting', JSON.stringify(cpu.NMIWaiting));
        localStorage.setItem('cpum_bAfterEI', JSON.stringify(cpu.m_bAfterEI));

        // --- VDP State Parameters ---
        localStorage.setItem('vdpColorRAM', JSON.stringify(vdp.colorRam));
        localStorage.setItem('vdpvRam', JSON.stringify(vdp.vRam));
        localStorage.setItem('vdpcurrentScanlineIndex', JSON.stringify(vdp.currentScanlineIndex));
        localStorage.setItem('vdplineCounter', JSON.stringify(vdp.lineCounter));
        localStorage.setItem('vdpcontrolWordFlag', JSON.stringify(vdp.controlWordFlag));
        localStorage.setItem('vdpcontrolWord', JSON.stringify(vdp.controlWord));
        localStorage.setItem('vdpdataPortReadWriteAddress', JSON.stringify(vdp.dataPortReadWriteAddress));
        localStorage.setItem('vdpdataPortWriteMode', JSON.stringify(vdp.dataPortWriteMode));
        localStorage.setItem('vdpreadBufferByte', JSON.stringify(vdp.readBufferByte));
        localStorage.setItem('vdpstatusFlags', JSON.stringify(vdp.statusFlags));
        localStorage.setItem('vdpnameTableBaseAddress', JSON.stringify(vdp.nameTableBaseAddress));
        localStorage.setItem('vdpspriteAttributeTableBaseAddress', JSON.stringify(vdp.spriteAttributeTableBaseAddress));
        localStorage.setItem('vdpspritePatternGeneratorBaseAddress', JSON.stringify(vdp.spritePatternGeneratorBaseAddress));
        localStorage.setItem('vdpvcounter', JSON.stringify(vdp.vcounter));
        localStorage.setItem('vdphcounter', JSON.stringify(vdp.hcounter));
        localStorage.setItem('vdpRegister00', JSON.stringify(vdp.register00));
        localStorage.setItem('vdpRegister01', JSON.stringify(vdp.register01));
        localStorage.setItem('vdpRegister02', JSON.stringify(vdp.register02));
        localStorage.setItem('vdpRegister03', JSON.stringify(vdp.register03));
        localStorage.setItem('vdpRegister04', JSON.stringify(vdp.register04));
        localStorage.setItem('vdpRegister05', JSON.stringify(vdp.register05));
        localStorage.setItem('vdpRegister06', JSON.stringify(vdp.register06));
        localStorage.setItem('vdpRegister07', JSON.stringify(vdp.register07));
        localStorage.setItem('vdpRegister08', JSON.stringify(vdp.register08));
        localStorage.setItem('vdpRegister09', JSON.stringify(vdp.register09));
        localStorage.setItem('vdpRegister0a', JSON.stringify(vdp.register0a));

        // --- System Memory Bus and Cartridge SRAM Mapping States ---
        localStorage.setItem('mmuram8k', JSON.stringify(mmu.systemWorkRam));
        localStorage.setItem('mmumapperSlot2IsCartridgeRam', JSON.stringify(mmu.mapper.mapperSlot2IsCartridgeRam));
        localStorage.setItem('mmucartridgeRam', JSON.stringify(mmu.mapper.cartridgeRam));

        // Track and map dynamic page selections relative to BaseMapper romBanks slots
        const slotsIndices = [-1, -1, -1];
        for (let i = 0; i < 3; i++) {
            slotsIndices[i] = mmu.mapper.romBanks.indexOf(mmu.mapper.mapperSlots[i]);
        }
        localStorage.setItem('mmumapperSlotsIdx', JSON.stringify(slotsIndices));

        // --- PSG Sound State Parameters ---
        localStorage.setItem('psgvolregister', JSON.stringify(psg.volregister));
        localStorage.setItem('psgtoneregister', JSON.stringify(psg.toneregister));
        localStorage.setItem('psgwavePos', JSON.stringify(psg.wavePos));
        localStorage.setItem('psgchan2belatched', JSON.stringify(psg.chan2belatched));
        localStorage.setItem('psgwhat2latch', JSON.stringify(psg.what2latch));
        localStorage.setItem('psglatch', JSON.stringify(psg.latch));
        localStorage.setItem('psginternalClock', JSON.stringify(psg.internalClock));
        localStorage.setItem('psginternalClockPos', JSON.stringify(psg.internalClockPos));

        // Active frame screenshot payload
        localStorage.setItem('savestateScreenshot', JSON.stringify(vdp.glbFrameBuffer));

        console.log("LocalStorageSerializer::State stored for [" + cname + "]");
    }

    /**
     * Reconstitutes the stored emulator state from localStorage.
     * @returns {number} 0 if successful, 1 if mismatch error.
     */
    deserialize(cname, cpu, vdp, mmu, psg) {
        // Validate active ROM alignment matching state footprint
        const storedCartName = localStorage.getItem('cartName');
        if (cname !== storedCartName) {
            console.error("LocalStorageSerializer::Failed to load state. Mismatch between ROM database names.");
            return 1;
        }

        // --- Restore CPU State ---
        cpu.registers = Object.assign(cpu.registers, JSON.parse(localStorage.getItem('cpuRegisters')));
        cpu.shadowRegisters = Object.assign(cpu.shadowRegisters, JSON.parse(localStorage.getItem('cpuShadowRegisters')));
        cpu.maskableInterruptsEnabled = JSON.parse(localStorage.getItem('cpuMaskableIntEnabled'));
        cpu.maskableInterruptWaiting = JSON.parse(localStorage.getItem('cpuMaskableIntWaiting'));
        cpu.interruptMode = JSON.parse(localStorage.getItem('cpuinterruptMode'));
        cpu.totCycles = JSON.parse(localStorage.getItem('cputotCycles'));
        cpu.NMIWaiting = JSON.parse(localStorage.getItem('cpuNMIWaiting'));
        cpu.m_bAfterEI = JSON.parse(localStorage.getItem('cpum_bAfterEI'));

        // --- Restore VDP State ---
        vdp.colorRam = JSON.parse(localStorage.getItem('vdpColorRAM'));
        vdp.vRam = JSON.parse(localStorage.getItem('vdpvRam'));
        vdp.currentScanlineIndex = JSON.parse(localStorage.getItem('vdpcurrentScanlineIndex'));
        vdp.lineCounter = JSON.parse(localStorage.getItem('vdplineCounter'));
        vdp.controlWordFlag = JSON.parse(localStorage.getItem('vdpcontrolWordFlag'));
        vdp.controlWord = JSON.parse(localStorage.getItem('vdpcontrolWord'));
        vdp.dataPortReadWriteAddress = JSON.parse(localStorage.getItem('vdpdataPortReadWriteAddress'));
        vdp.dataPortWriteMode = JSON.parse(localStorage.getItem('vdpdataPortWriteMode'));
        vdp.readBufferByte = JSON.parse(localStorage.getItem('vdpreadBufferByte'));
        vdp.statusFlags = JSON.parse(localStorage.getItem('vdpstatusFlags'));
        vdp.nameTableBaseAddress = JSON.parse(localStorage.getItem('vdpnameTableBaseAddress'));
        vdp.spriteAttributeTableBaseAddress = JSON.parse(localStorage.getItem('vdpspriteAttributeTableBaseAddress'));
        vdp.spritePatternGeneratorBaseAddress = JSON.parse(localStorage.getItem('vdpspritePatternGeneratorBaseAddress'));
        vdp.vcounter = JSON.parse(localStorage.getItem('vdpvcounter'));
        vdp.hcounter = JSON.parse(localStorage.getItem('vdphcounter'));
        vdp.register00 = JSON.parse(localStorage.getItem('vdpRegister00'));
        vdp.register01 = JSON.parse(localStorage.getItem('vdpRegister01'));
        vdp.register02 = JSON.parse(localStorage.getItem('vdpRegister02'));
        vdp.register03 = JSON.parse(localStorage.getItem('vdpRegister03'));
        vdp.register04 = JSON.parse(localStorage.getItem('vdpRegister04'));
        vdp.register05 = JSON.parse(localStorage.getItem('vdpRegister05'));
        vdp.register06 = JSON.parse(localStorage.getItem('vdpRegister06'));
        vdp.register07 = JSON.parse(localStorage.getItem('vdpRegister07'));
        vdp.register08 = JSON.parse(localStorage.getItem('vdpRegister08'));
        vdp.register09 = JSON.parse(localStorage.getItem('vdpRegister09'));
        vdp.register0a = JSON.parse(localStorage.getItem('vdpRegister0a'));

        // --- Restore Memory Bus State ---
        mmu.systemWorkRam.set(JSON.parse(localStorage.getItem('mmuram8k')));
        mmu.mapper.mapperSlot2IsCartridgeRam = JSON.parse(localStorage.getItem('mmumapperSlot2IsCartridgeRam'));
        
        const loadedSram = JSON.parse(localStorage.getItem('mmucartridgeRam'));
        for (let i = 0; i < loadedSram.length; i++) {
            mmu.mapper.cartridgeRam[i] = loadedSram[i];
        }

        // Restore dynamic banking assignments
        const slotIndices = JSON.parse(localStorage.getItem('mmumapperSlotsIdx'));
        if (slotIndices[0] !== -1) mmu.mapper.mapperSlots[0] = mmu.mapper.romBanks[slotIndices[0]];
        if (slotIndices[1] !== -1) mmu.mapper.mapperSlots[1] = mmu.mapper.romBanks[slotIndices[1]];
        if (slotIndices[2] !== -1) mmu.mapper.mapperSlots[2] = mmu.mapper.romBanks[slotIndices[2]];

        // --- Restore PSG Audio State ---
        psg.volregister = JSON.parse(localStorage.getItem('psgvolregister'));
        psg.toneregister = JSON.parse(localStorage.getItem('psgtoneregister'));
        psg.wavePos = JSON.parse(localStorage.getItem('psgwavePos'));
        psg.chan2belatched = JSON.parse(localStorage.getItem('psgchan2belatched'));
        psg.what2latch = JSON.parse(localStorage.getItem('psgwhat2latch'));
        psg.latch = JSON.parse(localStorage.getItem('psglatch'));
        psg.internalClock = JSON.parse(localStorage.getItem('psginternalClock'));
        psg.internalClockPos = JSON.parse(localStorage.getItem('psginternalClockPos'));

        console.log("LocalStorageSerializer::State reconstituted for [" + cname + "]");
        return 0;
    }
}

// Global legacy alias to prevent breaking unrefactored application components
const serializer = WebLocalStorageSerializer;