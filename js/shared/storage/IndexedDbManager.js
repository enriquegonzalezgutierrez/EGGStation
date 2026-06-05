/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/storage/IndexedDbManager.js
 * 
 * Role:
 * Infrastructure Layer: Universal IndexedDB Persistence Client.
 * Manages low-level database transactions, store initialization, and 
 * high-performance read/write cycles of raw binary state buffers.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for IndexedDB 
 *    connections, transactions, and raw binary reads/writes. It contains no knowledge 
 *    of CPU registers or game configurations.
 * 2. Open/Closed Principle (OCP): New databases or target stores can be opened 
 *    without modifying the transaction handling methods.
 * 3. Liskov Substitution Principle (LSP): Implements a uniform storage contract 
 *    that can be substituted or mocked easily for unit testing.
 * 4. Interface Segregation Principle (ISP): Exposes only high-level actions (`save()`, 
 *    `load()`, `delete()`), shielding client emulators from low-level transaction events.
 * 5. Dependency Inversion Principle (DIP): Client emulators rely on this generic database 
 *    contract, decoupling them from direct browser-specific API implementations.
 */

class IndexedDbManager {
    /**
     * @param {string} dbName - Database identifier.
     * @param {string} storeName - Target object store identifier.
     */
    constructor(dbName = "EGGStationDB", storeName = "savestates") {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    /**
     * Connects to IndexedDB and initializes schema if necessary.
     * @returns {Promise<IDBDatabase>} Resolves when connection is ready.
     */
    init() {
        if (this.db) return Promise.resolve(this.db);

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "key" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Saves a serialized payload to the database.
     * @param {string} key - Unique key identifier (e.g., Cartridge Name).
     * @param {Object} data - State payload to serialize.
     * @returns {Promise<void>}
     */
    async save(key, data) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            
            // Map key directly into the item payload
            const record = { key, payload: data, timestamp: Date.now() };
            const request = store.put(record);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Loads a state payload from the database.
     * @param {string} key - Unique key identifier.
     * @returns {Promise<Object|null>} Mapped state payload, or null if not found.
     */
    async load(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = (event) => {
                const record = event.target.result;
                resolve(record ? record.payload : null);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Deletes a state payload from the database.
     * @param {string} key - Unique key identifier.
     * @returns {Promise<void>}
     */
    async delete(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }
}

// ========================================================================
// COMPATIBILITY ADAPTER LAYER (Bridges existing SMS/Genesis engines)
// ========================================================================
class WebIndexedDBSerializer {
    constructor() {
        this.db = new IndexedDbManager();
    }

    /**
     * Universal serialize wrapper.
     */
    async serialize(cname, cpu, vdp, mmu, psg) {
        // Collect current page indices from MMU BaseMapper
        const slotsIndices = [-1, -1, -1];
        if (mmu.mapper && mmu.mapper.mapperSlots) {
            for (let i = 0; i < 3; i++) {
                slotsIndices[i] = mmu.mapper.romBanks.indexOf(mmu.mapper.mapperSlots[i]);
            }
        }

        const statePayload = {
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
                colorRam: new Uint8Array(vdp.colorRam), // Clone safely
                vRam: new Uint8Array(vdp.vRam),
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
                systemWorkRam: new Uint8Array(mmu.systemWorkRam),
                mapperSlot2IsCartridgeRam: mmu.mapper?.mapperSlot2IsCartridgeRam || false,
                cartridgeRam: mmu.mapper?.cartridgeRam ? new Uint8Array(mmu.mapper.cartridgeRam) : null,
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

        await this.db.save(cname, statePayload);

        // Save UI snapshot thumbnail to localStorage
        if (vdp.glbFrameBuffer) {
            const smallArray = Array.from(vdp.glbFrameBuffer);
            localStorage.setItem('savestateScreenshot', JSON.stringify(smallArray));
            localStorage.setItem('cartName', cname);
        }
    }

    /**
     * Universal deserialize wrapper.
     */
    async deserialize(cname, cpu, vdp, mmu, psg) {
        const state = await this.db.load(cname);
        if (!state) {
            console.error(`WebIndexedDBSerializer::No saved state found for [${cname}]`);
            return 1;
        }

        // 1. Restore CPU State
        Object.assign(cpu.registers, state.cpu.registers);
        Object.assign(cpu.shadowRegisters, state.cpu.shadowRegisters);
        cpu.maskableInterruptsEnabled = state.cpu.maskableInterruptsEnabled;
        cpu.maskableInterruptWaiting = state.cpu.maskableInterruptWaiting;
        cpu.interruptMode = state.cpu.interruptMode;
        cpu.totCycles = state.cpu.totCycles;
        cpu.NMIWaiting = state.cpu.NMIWaiting;
        cpu.m_bAfterEI = state.cpu.m_bAfterEI;

        // 2. Restore VDP State
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

        // 3. Restore Memory Bus State
        mmu.systemWorkRam.set(state.mmu.systemWorkRam);
        if (state.mmu.cartridgeRam && mmu.mapper?.cartridgeRam) {
            mmu.mapper.cartridgeRam.set(state.mmu.cartridgeRam);
        }
        if (mmu.mapper) {
            mmu.mapper.mapperSlot2IsCartridgeRam = state.mmu.mapperSlot2IsCartridgeRam;
            const slotIndices = state.mmu.slotsIndices;
            if (slotIndices[0] !== -1) mmu.mapper.mapperSlots[0] = mmu.mapper.romBanks[slotIndices[0]];
            if (slotIndices[1] !== -1) mmu.mapper.mapperSlots[1] = mmu.mapper.romBanks[slotIndices[1]];
            if (slotIndices[2] !== -1) mmu.mapper.mapperSlots[2] = mmu.mapper.romBanks[slotIndices[2]];
        }

        // 4. Restore PSG State
        psg.volregister = state.psg.volregister;
        psg.toneregister = state.psg.toneregister;
        psg.wavePos = state.psg.wavePos;
        psg.chan2belatched = state.psg.chan2belatched;
        psg.what2latch = state.psg.what2latch;
        psg.latch = state.psg.latch;
        psg.internalClock = state.psg.internalClock;
        psg.internalClockPos = state.psg.internalClockPos;

        return 0;
    }
}