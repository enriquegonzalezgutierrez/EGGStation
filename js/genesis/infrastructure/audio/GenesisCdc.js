/* 
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Mega CD LC8951 CD Data Controller (CDC)
 * 
 * Emulates the central CD Data Controller chip found on the Sega CD / Mega CD 
 * expansion board. Manages up to 5 buffered sectors, host data routing to Sub-CPU, 
 * PCM RAM, PRG RAM or Word RAM, and DMA address tracking.
 * 
 * SOLID: Adheres to Single Responsibility (SRP) by isolating the CD-sector 
 * buffers and DMA transfer state machines completely from other bus and video layers.
 */

const GENESIS_CDC_DESTINATION_MAIN_CPU_READ = 2;
const GENESIS_CDC_DESTINATION_SUB_CPU_READ  = 3;
const GENESIS_CDC_DESTINATION_PCM_RAM       = 4;
const GENESIS_CDC_DESTINATION_PRG_RAM       = 5;
const GENESIS_CDC_DESTINATION_WORD_RAM      = 7;

class GenesisCdc {
    constructor() {
        // --- 1. Contiguous Sectors Memory Buffer (5 Sectors * 1026 Words each) ---
        // Each sector footprint: 2 words header + 1024 words (2048 bytes) sector data
        this.bufferedSectors = new Uint16Array(5 * 1026);

        // --- 2. Sector Tracking Registers ---
        this.currentSector = 0;
        this.sectorsRemaining = 0;

        this.hostDataWordIndex = 1026; // Default pointing to end-of-sector (exhausted)
        this.dmaAddress = 0;

        this.hostDataBufferedSectorIndex = 0;
        this.bufferedSectorsReadIndex = 0;
        this.bufferedSectorsWriteIndex = 0;
        this.bufferedSectorsTotal = 0;

        this.deviceDestination = GENESIS_CDC_DESTINATION_SUB_CPU_READ;
        this.hackCounter = 0; // Standard 2/6 frames interrupt timing delay hack
        this.hostDataTargetSubCpu = false;
        this.cdcReading = false;
        this.hostDataBound = false;

        this.initialise();
    }

    initialise() {
        this.bufferedSectors.fill(0);

        this.currentSector = 0;
        this.sectorsRemaining = 0;

        this.hostDataWordIndex = 1026;
        this.dmaAddress = 0;

        this.hostDataBufferedSectorIndex = 0;
        this.bufferedSectorsReadIndex = 0;
        this.bufferedSectorsWriteIndex = 0;
        this.bufferedSectorsTotal = 0;

        this.deviceDestination = GENESIS_CDC_DESTINATION_SUB_CPU_READ;
        this.hackCounter = 0;
        this.hostDataTargetSubCpu = false;
        this.cdcReading = false;
        this.hostDataBound = false;
    }

    /**
     * Converts a standard 8-bit integer into its 2-digit Binary Coded Decimal (BCD) equivalent.
     */
    to2DigitBCD(value) {
        const lowerDigit = value % 10;
        const upperDigit = Math.floor(value / 10) % 10;
        return (upperDigit << 4) | (lowerDigit << 0);
    }

    /**
     * Synthesizes 4-byte sector header metadata in absolute MSF BCD format.
     */
    getCDSectorHeaderBytes(bufferOut) {
        bufferOut[0] = this.to2DigitBCD(Math.floor(this.currentSector / (75 * 60)));
        bufferOut[1] = this.to2DigitBCD(Math.floor(this.currentSector / 75) % 60);
        bufferOut[2] = this.to2DigitBCD(this.currentSector % 75);
        bufferOut[3] = 0x01; // Data Mode 1
    }

    /**
     * Refills the in-memory sector buffers snychronously by calling the CDD reader callback.
     * @param {Function} cdSectorRead - Frontend sector reader callback.
     * @param {Object} userData - User context pointer.
     */
    refillSectorBuffer(cdSectorRead, userData) {
        if (!this.cdcReading) {
            return;
        }

        const headerBytes = new Uint8Array(4);

        while (this.bufferedSectorsTotal !== 5) {
            const sectorOffset = this.bufferedSectorsWriteIndex * 1026;

            // Generate BCD header bytes
            this.getCDSectorHeaderBytes(headerBytes);

            // Write 32-bit header (split into two 16-bit words) into the start of the sector buffer
            this.bufferedSectors[sectorOffset + 0] = (headerBytes[0] << 8) | headerBytes[1];
            this.bufferedSectors[sectorOffset + 1] = (headerBytes[2] << 8) | headerBytes[3];

            // Read 2048 bytes of sector data starting at offset + 2 words
            const subBuffer = this.bufferedSectors.subarray(sectorOffset + 2, sectorOffset + 1026);
            cdSectorRead(userData, subBuffer);

            this.currentSector++;
            this.bufferedSectorsTotal++;
            this.bufferedSectorsWriteIndex = (this.bufferedSectorsWriteIndex + 1) % 5;

            if (this.sectorsRemaining !== 0 && --this.sectorsRemaining === 0) {
                this.cdcReading = false;
                break;
            }
        }
    }

    /**
     * Starts continuous data transfer streams.
     */
    start(callback, userData) {
        this.cdcReading = true;
        this.refillSectorBuffer(callback, userData);
    }

    /**
     * Suspends continuous data transfer streams.
     */
    stop() {
        this.cdcReading = false;
    }

    /**
     * Updates the CDC status and returns true if a sector is ready for host reading.
     */
    stat(callback, userData) {
        // Sonic CD dynamic playback timing synchronization hack
        this.hackCounter = (this.hackCounter + 1) % 6;
        if (this.hackCounter < 2) {
            return false;
        }

        this.refillSectorBuffer(callback, userData);
        return this.bufferedSectorsTotal !== 0;
    }

    /**
     * Prepares the host data pointer for subsequent reads and returns the sector header.
     * @param {Function} callback - Frontend sector reader callback.
     * @param {Object} userData - User context pointer.
     * @param {Uint32Array} headerOut - Outputs the 32-bit sector header.
     * @returns {boolean} True if data transfer successfully bound.
     */
    read(callback, userData, headerOut) {
        this.refillSectorBuffer(callback, userData);

        if (this.bufferedSectorsTotal === 0 || this.hostDataBound) {
            return false;
        }

        switch (this.deviceDestination) {
            case GENESIS_CDC_DESTINATION_MAIN_CPU_READ:
                this.hostDataTargetSubCpu = false;
                break;

            case GENESIS_CDC_DESTINATION_SUB_CPU_READ:
            case GENESIS_CDC_DESTINATION_PCM_RAM:
            case GENESIS_CDC_DESTINATION_PRG_RAM:
            case GENESIS_CDC_DESTINATION_WORD_RAM:
                this.hostDataTargetSubCpu = true;
                break;

            default:
                console.warn(`CDC::Read called with invalid device destination (0x${this.deviceDestination.toString(16)})`);
                return false;
        }

        this.hostDataBufferedSectorIndex = this.bufferedSectorsReadIndex;
        this.hostDataWordIndex = 0;
        this.hostDataBound = true;

        // Extract 32-bit header (split across words 0 & 1)
        const sectorOffset = this.hostDataBufferedSectorIndex * 1026;
        headerOut[0] = ((this.bufferedSectors[sectorOffset] << 16) | this.bufferedSectors[sectorOffset + 1]) >>> 0;

        return true;
    }

    /**
     * Reads the next 16-bit word from the active buffered sector.
     * @param {boolean} isSubCpu - True if requested by the Sub-68K.
     * @returns {number} 16-bit data word.
     */
    hostData(isSubCpu) {
        if (isSubCpu !== this.hostDataTargetSubCpu || !this.hostDataBound) {
            return 0; // Blocked or unbound transfer
        }

        const sectorOffset = this.hostDataBufferedSectorIndex * 1026;

        if (this.hostDataWordIndex >= 1026) {
            // Sector exhausted: repeat last read value as standard fallback
            return this.bufferedSectors[sectorOffset + 1025];
        }

        const value = this.bufferedSectors[sectorOffset + this.hostDataWordIndex];
        this.hostDataWordIndex++;
        return value;
    }

    /**
     * Acknowledges data transfer completion, advancing buffer read pointers.
     */
    ack() {
        if (!this.hostDataBound) {
            return;
        }

        this.hostDataBound = false;
        this.bufferedSectorsTotal--;
        this.bufferedSectorsReadIndex = (this.bufferedSectorsReadIndex + 1) % 5;
    }

    /**
     * Positions the CD-ROM laser head snychronously.
     */
    seek(callback, userData, sector, totalSectors) {
        this.currentSector = sector;
        this.sectorsRemaining = totalSectors;
        this.refillSectorBuffer(callback, userData);
    }

    /**
     * Returns the host transfer mode bits (MSB sets EOF, bit 14 sets Data Ready).
     */
    mode(isSubCpu) {
        if (isSubCpu !== this.hostDataTargetSubCpu) {
            return 0x8000;
        }

        const endOfTransfer = this.hostDataWordIndex >= 1025 ? 1 : 0;
        const dataReady = this.hostDataWordIndex !== 1026 ? 1 : 0;

        return (endOfTransfer << 15) | (dataReady << 14);
    }

    setDeviceDestination(deviceDestination) {
        this.deviceDestination = deviceDestination & 7;
        this.dmaAddress = 0;
    }

    setDMAAddress(dmaAddress) {
        this.dmaAddress = dmaAddress & 0xFFFF;
    }
}