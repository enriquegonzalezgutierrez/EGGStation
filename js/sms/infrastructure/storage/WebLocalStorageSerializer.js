/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: WebIndexedDBSerializer (Replaces WebLocalStorageSerializer)
 * 
 * Manages standard Emulator Savestates (Save/Load) by serializing the complete,
 * microsecond-accurate operational state of the CPU, VDP, MMU, and PSG.
 * 
 * OPTIMIZED: Migrated from localStorage to IndexedDB. IndexedDB allows us to safely 
 * store heavy, raw binary arrays (Uint8Array) without JSON stringification overhead, 
 * bypassing the 5MB browser quota limits and preventing memory crashes.
 */

class WebIndexedDBSerializer {
    constructor() {
        this.dbName = "EGGStationDB";
        this.storeName = "savestates";
        this.db = null;
        
        // Initialize the database asynchronously
        this.initDB().catch(err => console.error("IndexedDB::Initialization failed", err));
    }

    /**
     * Opens the IndexedDB connection and creates the schema if it doesn't exist.
     * @returns {Promise} Resolves when the database is ready.
     */
    initDB() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    // Create an object store using the cartridge name as the unique primary key
                    db.createObjectStore(this.storeName, { keyPath: "cartName" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Serializes the active emulator configuration state to IndexedDB.
     * @param {string} cname - Unique catalog name of the active Cartridge ROM.
     * @param {ZilogZ80} cpu - The system CPU.
     * @param {Sega315_5124_Vdp} vdp - The visual co-processor VDP.
     * @param {SegaMasterSystemBus} mmu - The unified system memory bus.
     * @param {Sega315_5124_Psg} psg - The integrated sound generator PSG.
     */
    async serialize(cname, cpu, vdp, mmu, psg) {
        if (!this.db) await this.initDB();

        // Track and map dynamic page selections relative to BaseMapper romBanks slots
        const slotsIndices = [-1, -1, -1];
        for (let i = 0; i < 3; i++) {
            slotsIndices[i] = mmu.mapper.romBanks.indexOf(mmu.mapper.mapperSlots[i]);
        }

        // Construct the consolidated state payload.
        // NOTE: IndexedDB natively supports saving Uint8Array without JSON stringification.
        const statePayload = {
            cartName: cname,
            
            cpu: {
                registers: { ...cpu.registers },
                shadowRegisters: { ...cpu.shadowRegisters },
                maskableInterruptsEnabled: cpu.maskableInterruptsEnabled,
                maskableInterruptWaiting: cpu.maskableInterruptWaiting,
                interruptMode: cpu.interruptMode,
                totCycles: cpu.totCycles,
                NMIWaiting: cpu.NMIWaiting,
                m_bAfterEI: cpu.m_bAfterEI
            },

            vdp: {
                colorRam: vdp.colorRam, // Native Uint8Array
                vRam: vdp.vRam,         // Native Uint8Array
                currentScanlineIndex: vdp.currentScanlineIndex,
                lineCounter: vdp.lineCounter,
                controlWordFlag: vdp.controlWordFlag,
                controlWord: vdp.controlWord,
                dataPortReadWriteAddress: vdp.dataPortReadWriteAddress,
                dataPortWriteMode: vdp.dataPortWriteMode,
                readBufferByte: vdp.readBufferByte,
                statusFlags: vdp.statusFlags,
                nameTableBaseAddress: vdp.nameTableBaseAddress,
                spriteAttributeTableBaseAddress: vdp.spriteAttributeTableBaseAddress,
                spritePatternGeneratorBaseAddress: vdp.spritePatternGeneratorBaseAddress,
                vcounter: vdp.vcounter,
                hcounter: vdp.hcounter,
                register00: vdp.register00, register01: vdp.register01,
                register02: vdp.register02, register03: vdp.register03,
                register04: vdp.register04, register05: vdp.register05,
                register06: vdp.register06, register07: vdp.register07,
                register08: vdp.register08, register09: vdp.register09,
                register0a: vdp.register0a
            },

            mmu: {
                systemWorkRam: mmu.systemWorkRam, // Native Uint8Array
                mapperSlot2IsCartridgeRam: mmu.mapper.mapperSlot2IsCartridgeRam,
                cartridgeRam: mmu.mapper.cartridgeRam, // Native Uint8Array
                slotsIndices: slotsIndices
            },

            psg: {
                volregister: [...psg.volregister],
                toneregister: [...psg.toneregister],
                wavePos: [...psg.wavePos],
                chan2belatched: psg.chan2belatched,
                what2latch: psg.what2latch,
                latch: psg.latch,
                internalClock: psg.internalClock,
                internalClockPos: psg.internalClockPos
            }
        };

        // Write binary payload to IndexedDB
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.put(statePayload); // Inserts or overrides by keyPath

            request.onsuccess = () => {
                // UI Visualizer Screenshot (Saved synchronously to LocalStorage for instant UI access)
                const smallArray = Array.from(vdp.glbFrameBuffer);
                localStorage.setItem('savestateScreenshot', JSON.stringify(smallArray));
                localStorage.setItem('cartName', cname);
                
                console.log(`IndexedDBSerializer::State stored successfully for [${cname}]`);
                resolve();
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Reconstitutes the stored emulator state from IndexedDB.
     * @returns {Promise<number>} Resolves to 0 if successful, 1 if error.
     */
    async deserialize(cname, cpu, vdp, mmu, psg) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(cname);

            request.onsuccess = (event) => {
                const state = event.target.result;

                if (!state) {
                    console.error(`IndexedDBSerializer::No saved state found for [${cname}]`);
                    resolve(1);
                    return;
                }

                // --- Restore CPU State ---
                Object.assign(cpu.registers, state.cpu.registers);
                Object.assign(cpu.shadowRegisters, state.cpu.shadowRegisters);
                cpu.maskableInterruptsEnabled = state.cpu.maskableInterruptsEnabled;
                cpu.maskableInterruptWaiting = state.cpu.maskableInterruptWaiting;
                cpu.interruptMode = state.cpu.interruptMode;
                cpu.totCycles = state.cpu.totCycles;
                cpu.NMIWaiting = state.cpu.NMIWaiting;
                cpu.m_bAfterEI = state.cpu.m_bAfterEI;

                // --- Restore VDP State ---
                // Use .set() to copy the retrieved binary arrays into the existing memory references
                vdp.colorRam.set(state.vdp.colorRam);
                vdp.vRam.set(state.vdp.vRam);
                vdp.currentScanlineIndex = state.vdp.currentScanlineIndex;
                vdp.lineCounter = state.vdp.lineCounter;
                vdp.controlWordFlag = state.vdp.controlWordFlag;
                vdp.controlWord = state.vdp.controlWord;
                vdp.dataPortReadWriteAddress = state.vdp.dataPortReadWriteAddress;
                vdp.dataPortWriteMode = state.vdp.dataPortWriteMode;
                vdp.readBufferByte = state.vdp.readBufferByte;
                vdp.statusFlags = state.vdp.statusFlags;
                vdp.nameTableBaseAddress = state.vdp.nameTableBaseAddress;
                vdp.spriteAttributeTableBaseAddress = state.vdp.spriteAttributeTableBaseAddress;
                vdp.spritePatternGeneratorBaseAddress = state.vdp.spritePatternGeneratorBaseAddress;
                vdp.vcounter = state.vdp.vcounter;
                vdp.hcounter = state.vdp.hcounter;
                vdp.register00 = state.vdp.register00; vdp.register01 = state.vdp.register01;
                vdp.register02 = state.vdp.register02; vdp.register03 = state.vdp.register03;
                vdp.register04 = state.vdp.register04; vdp.register05 = state.vdp.register05;
                vdp.register06 = state.vdp.register06; vdp.register07 = state.vdp.register07;
                vdp.register08 = state.vdp.register08; vdp.register09 = state.vdp.register09;
                vdp.register0a = state.vdp.register0a;

                // --- Restore Memory Bus State ---
                mmu.systemWorkRam.set(state.mmu.systemWorkRam);
                mmu.mapper.cartridgeRam.set(state.mmu.cartridgeRam);
                mmu.mapper.mapperSlot2IsCartridgeRam = state.mmu.mapperSlot2IsCartridgeRam;

                // Restore dynamic banking assignments
                const slotIndices = state.mmu.slotsIndices;
                if (slotIndices[0] !== -1) mmu.mapper.mapperSlots[0] = mmu.mapper.romBanks[slotIndices[0]];
                if (slotIndices[1] !== -1) mmu.mapper.mapperSlots[1] = mmu.mapper.romBanks[slotIndices[1]];
                if (slotIndices[2] !== -1) mmu.mapper.mapperSlots[2] = mmu.mapper.romBanks[slotIndices[2]];

                // --- Restore PSG Audio State ---
                psg.volregister = state.psg.volregister;
                psg.toneregister = state.psg.toneregister;
                psg.wavePos = state.psg.wavePos;
                psg.chan2belatched = state.psg.chan2belatched;
                psg.what2latch = state.psg.what2latch;
                psg.latch = state.psg.latch;
                psg.internalClock = state.psg.internalClock;
                psg.internalClockPos = state.psg.internalClockPos;

                console.log(`IndexedDBSerializer::State reconstituted successfully for [${cname}]`);
                resolve(0);
            };

            request.onerror = (e) => {
                console.error(`IndexedDBSerializer::Error fetching state for [${cname}]`);
                reject(e.target.error);
            };
        });
    }
}