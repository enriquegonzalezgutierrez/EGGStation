/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesSystemDma (DMA & HDMA Controller Extension)
 * 
 * ROLE:
 * Handles high-speed direct memory transfers during V-Blank (DMA)
 * and horizontal scanline blanks (HDMA).
 */

{
    SnesSystem.prototype.handleDma = function() {
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
            this.write(
                (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
                this.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                true
            );
        } else {
            this.writeBBus(
                (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                this.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
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
    };

    SnesSystem.prototype.initHdma = function() {
        this.hdmaTimer = 18;
        for (let i = 0; i < 8; i++) {
            if (this.hdmaActive[i]) {
                this.dmaActive[i] = false;
                this.dmaOffIndex = 0;

                this.hdmaTableAdr[i] = this.dmaAadr[i];
                this.hdmaRepCount[i] = this.read(
                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                );
                this.hdmaTimer += 8;
                if (this.hdmaInd[i]) {
                    this.dmaSize[i] = this.read(
                        (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                    );
                    this.dmaSize[i] |= this.read(
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
    };

    SnesSystem.prototype.handleHdma = function() {
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
                                this.write(
                                    (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                                    this.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                                    true
                                );
                            } else {
                                this.writeBBus(
                                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                                    this.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                                );
                            }
                            this.dmaSize[i]++;
                        } else {
                            if (this.dmaFromB[i]) {
                                this.write(
                                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                                    this.readBBus((this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff),
                                    true
                                );
                            } else {
                                this.writeBBus(
                                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                                    this.read((this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true)
                                );
                            }
                            this.hdmaTableAdr[i]++;
                        }
                    }
                }
                this.hdmaRepCount[i]--;
                this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
                if ((this.hdmaRepCount[i] & 0x7f) === 0) {
                    this.hdmaRepCount[i] = this.read(
                        (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                    );
                    if (this.hdmaInd[i]) {
                        this.dmaSize[i] = this.read(
                            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
                        );
                        this.dmaSize[i] |= this.read(
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
    };
}