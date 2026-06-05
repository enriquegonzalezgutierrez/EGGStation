/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/storage/RomDecompressor.js
 * 
 * Role:
 * Infrastructure Layer: Universal ROM Decompression Service.
 * Leverages external compression runtimes (zip.js) to scan compressed archives, 
 * filter valid console extensions, and decompress binary ROM payloads asynchronously.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively responsible for reading, 
 *    filtering, and extracting files from compressed streams. It is entirely 
 *    agnostic of emulator buses, canvas contexts, or UI layout states.
 * 2. Open/Closed Principle (OCP): New archive standards (such as RAR or 7z) or 
 *    new console extensions can be supported by appending reader adapter classes 
 *    without modifying the core decompression API contract.
 */

class RomDecompressor {
    /**
     * Decompresses a raw ZIP archive and retrieves the first valid ROM entry found.
     * @param {Blob} fileBlob - The compressed ZIP archive Blob object.
     * @param {RegExp} extensionsRegex - Regular expression to match valid console formats (e.g. /\.(sms|sg|md|sfc)$/i).
     * @returns {Promise<{filename: string, data: Uint8Array}>} Resolves with the filename and clean decompressed Uint8Array.
     */
    static decompress(fileBlob, extensionsRegex) {
        return new Promise((resolve, reject) => {
            if (typeof zip === 'undefined') {
                reject(new Error("Decompression engine (zip.js) is not loaded in the global context."));
                return;
            }

            // Create a zip.js reader stream over the file Blob
            zip.createReader(new zip.BlobReader(fileBlob), (reader) => {
                reader.getEntries((entries) => {
                    // Search for the first entry matching our targeted console extensions
                    const romEntry = entries.find(e => e.filename.match(extensionsRegex));
                    
                    if (romEntry) {
                        // Decompress binary data into a fast Uint8Array stream
                        romEntry.getData(new zip.Uint8ArrayWriter(), (data) => {
                            reader.close();
                            resolve({ filename: romEntry.filename, data: data });
                        });
                    } else {
                        reader.close();
                        reject(new Error("ZIP archive contains no valid ROM for the active console."));
                    }
                });
            }, (error) => {
                reject(error);
            });
        });
    }
}

// Bind globally as a shared storage utility service
window.RomDecompressor = RomDecompressor;