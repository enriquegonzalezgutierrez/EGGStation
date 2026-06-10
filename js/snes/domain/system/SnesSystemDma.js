/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Author: Enrique González Gutiérrez
 * File: js/snes/domain/system/SnesSystemDma.js
 * 
 * Domain Layer: Super Nintendo (SNES) DMA & HDMA Controller
 * 
 * Role:
 * Emulates the SNES Direct Memory Access (DMA) and Horizontal DMA (HDMA) hardware.
 * Transfers high-speed data blocks between CPU memory (Bus A) and PPU/APU registers (Bus B) 
 * during V-Blank (DMA) and H-Blank (HDMA) intervals.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively manages DMA/HDMA channel transfers, 
 *   timings, and state arrays, removing 21 variables and 3 methods from SnesSystem.
 */

class SnesSystemDma {
    /**
     * @param {SnesSystem} snesSystem - Mapped master system coordinator context (DIP).
     */
    constructor(snesSystem) {
        this.sys = snesSystem;

        // DMA physical mapping offset patterns & configurations
        this.dmaOffs = [
            0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1,
            0, 1, 2, 3, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1
        ];
        this.dmaOffLengths = [1, 2, 2, 4, 4, 4, 2, 4];

        // --- 8-Channel DMA / HDMA Physical Registers ---
        this.dmaBadr = new Uint8Array(8);       // Bus-B Destination Address
        this.dmaAadr = new Uint16Array(8);      // Bus-A Source Address Offset
        this.dmaAadrBank = new Uint8Array(8);  // Bus-A Source Address Bank
        this.dmaSize = new Uint16Array(8);      // Transfer size / HDMA Indirect Address
        this.hdmaIndBank = new Uint8Array(8);  // HDMA Indirect Address Bank
        this.hdmaTableAdr = new Uint16Array(8); // HDMA Table Current Address
        this.hdmaRepCount = new Uint8Array(8);  // HDMA Line Repeat Counter
        this.dmaUnusedByte = new Uint8Array(8); // Unused hardware latch byte

        // Active State Counters
        this.dmaTimer = 0;
        this.hdmaTimer = 0;
        this.dmaBusy = false;
        
        this.dmaActive = [false, false, false, false, false, false, false, false];
        this.hdmaActive = [false, false, false, false, false, false, false, false];

        this.dmaMode = [0, 0, 0, 0, 0, 0, 0, 0];
        this.dmaFixed = [false, false, false, false, false, false, false, false];
        this.dmaDec = [false, false, false, false, false, false, false, false];
        this.hdmaInd = [false, false, false, false, false, false, false, false];
        this.dmaFromB = [false, false, false, false, false, false, false, false];
        this.dmaUnusedBit = [false, false, false, false, false, false, false, false];

        this.hdmaDoTransfer = [false, false, false, false, false, false, false, false];
        this.hdmaTerminated = [false, false, false, false, false, false, false, false];
        this.dmaOffIndex = 0;

        this.reset(true);
    }

    /**
     * Resets DMA channels and timers to power-on defaults.
     * @param {boolean} hard - If true, clears the channel register memory arrays.
     */
    reset(hard) {
        if (hard) {
            this.dmaBadr.fill(0);
            this.dmaAadr.fill(0);
            this.dmaAadrBank.fill(0);
            this.dmaSize.fill(0);
            this.hdmaIndBank.fill(0);
            this.hdmaTableAdr.fill(0);
            this.hdmaRepCount.fill(0);
            this.dmaUnusedByte.fill(0);
        }

        this.dmaTimer = 0;
        this.hdmaTimer = 0;
        this.dmaBusy = false;
        
        this.dmaActive.fill(false);
        this.hdmaActive.fill(false);

        this.dmaMode.fill(0);
        this.dmaFixed.fill(false);
        this.dmaDec.fill(false);
        this.hdmaInd.fill(false);
        this.dmaFromB.fill(false);
        this.dmaUnusedBit.fill(false);

        this.hdmaDoTransfer.fill(false);
        this.hdmaTerminated.fill(false);
        this.dmaOffIndex = 0;
    }

    /**
     * Executes standard DMA transfers (ROM/RAM to Bus-B) during V-Blank.
     */
    handleDma() {
        if (this.dmaTimer > 0) {
            this.dmaTimer -= 2;
            return;
        }
        
        let i;
        for (i = 0; i < 8; i++) {
            if (this.dmaActive[i]) {
                break;
            }
        }
        
        if (i === 8) {
            this.dmaBusy = false;
            this.dmaOffIndex = 0;
            return;
        }

        let tableOff = this.dmaMode[i] * 4 + this.dmaOffIndex++;
        this.dmaOffIndex &= 0x3;
        
        if (this.dmaFromB[i]) {
            this.sys.write(
                (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
                this.sys.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                true
            );
        } else {
            this.sys.writeBBus(
                (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                this.sys.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
            );
        }
        
        this.dmaTimer += 6;
        
        if (!this.dmaFixed[i]) {
            if (this.dmaDec[i]) {
                this.dmaAadr[i]--;
            } else {
                this.dmaAadr[i]++;
            }
        }
        
        this.dmaSize[i]--;
        if (this.dmaSize[i] === 0) {
            this.dmaOffIndex = 0;
            this.dmaActive[i] = false;
            this.dmaTimer += 8;
        }
    }

    /**
     * Initializes Horizontal DMA (HDMA) tables at the beginning of V-Blank (Scanline 0).
     */
    initHdma() {
        this.hdmaTimer = 18;
        
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i]) {
                this.dmaActive[i] = false;
                this.dmaOffIndex = 0;

                this.hdmaTableAdr[i] = this.dmaAadr[i];
                this.hdmaRepCount[i] = this.sys.read(
                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                );
                
                this.hdmaTimer += 8;
                
                if (this.hdmaInd[i]) {
                    this.dmaSize[i] = this.sys.read(
                        (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                    );
                    this.dmaSize[i] |= this.sys.read(
                        (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                    ) << 8;
                    this.hdmaTimer += 16;
                }
                this.hdmaDoTransfer[i] = true;
            } else {
                this.hdmaDoTransfer[i] = false;
            }
            this.hdmaTerminated[i] = false;
        }
    }

    /**
     * Executes line-by-line HDMA transfers during H-Blank intervals.
     */
    handleHdma() {
        this.hdmaTimer = 18;
        
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i] && !this.hdmaTerminated[i]) {
                this.dmaActive[i] = false;
                this.hdmaTimer += 8;
                
                if (this.hdmaDoTransfer[i]) {
                    for (let j = 0; j < this.dmaOffLengths[this.dmaMode[i]]; j++) {
                        let tableOff = this.dmaMode[i] * 4 + j;
                        this.hdmaTimer += 8;
                        
                        if (this.hdmaInd[i]) {
                            if (this.dmaFromB[i]) {
                                this.sys.write(
                                    (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                                    this.sys.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                                    true
                                );
                            } else {
                                this.sys.writeBBus(
                                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                                    this.sys.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                                );
                            }
                            this.dmaSize[i]++;
                        } else {
                            if (this.dmaFromB[i]) {
                                this.sys.write(
                                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                                    this.sys.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                                    true
                                );
                            } else {
                                this.sys.writeBBus(
                                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                                    this.sys.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true)
                                );
                            }
                            this.hdmaTableAdr[i]++;
                        }
                    }
                }
                
                this.hdmaRepCount[i]--;
                this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
                
                if ((this.hdmaRepCount[i] & 0x7f) === 0) {
                    this.hdmaRepCount[i] = this.sys.read(
                        (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                    );
                    
                    if (this.hdmaInd[i]) {
                        this.dmaSize[i] = this.sys.read(
                            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                        );
                        this.dmaSize[i] |= this.sys.read(
                            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                        ) << 8;
                        this.hdmaTimer += 16;
                    }
                    
                    if (this.hdmaRepCount[i] === 0) {
                        this.hdmaTerminated[i] = true;
                    }
                    this.hdmaDoTransfer[i] = true;
                }
            }
        }
    }
}