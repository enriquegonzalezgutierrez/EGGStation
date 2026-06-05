/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/storage/IndexedDbManager.js
 * 
 * Role:
 * Infrastructure Layer: Universal IndexedDB Persistence Client (Retrocompatible Edition).
 * Manages low-level database transactions, store initialization, and 
 * high-performance read/write cycles of raw binary state buffers.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for IndexedDB 
 *    connections, transactions, and raw binary reads/writes. It contains no knowledge 
 *    of CPU registers or game configurations.
 * 2. Open/Closed Principle (OCP): New databases or target stores can be opened 
 *    without modifying the transaction handling methods.
 * 3. Liskov Substitution Principle (LSP): Offers a uniform storage contract 
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
     * Supports both "key" and "cartName" schemas snychronously for backward compatibility.
     * 
     * @param {string} key - Unique key identifier (e.g., Cartridge Name).
     * @param {Object} data - State payload to serialize.
     * @returns {Promise<void>}
     */
    async save(key, data) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            
            // PHASE 4: Hybrid Record supports both old {keyPath: "cartName"} and new {keyPath: "key"} schemas
            const record = { 
                key: key, 
                cartName: key, // Legacy schema fallback
                payload: data, 
                timestamp: Date.now() 
            };
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