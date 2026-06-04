/**
 * Project: EGGStation - Super Nintendo (SNES) Emulator
 * Component: SnesDspDecoder (DSP Sample Decompression Extension)
 * 
 * ROLE:
 * Handles BRR (Bit Rate Reduction) block parsing and applies standard
 * Gaussian interpolation.
 */

{
    SnesDsp.prototype.decodeBrr = function(ch) {
        const ch19 = ch * 19;
        this.decodeBuffer[ch19] = this.decodeBuffer[ch19 + 16];
        this.decodeBuffer[ch19 + 1] = this.decodeBuffer[ch19 + 17];
        this.decodeBuffer[ch19 + 2] = this.decodeBuffer[ch19 + 18];

        if (this.prevFlags[ch] === 1 || this.prevFlags[ch] === 3) {
            let sampleAdr = (this.dirPage << 8) + (this.srcn[ch] * 4);
            let loopAdr = this.apu.ram[sampleAdr & 0xffff];
            loopAdr |= this.apu.ram[(sampleAdr + 3) & 0xffff] << 8;
            this.decodeOffset[ch] = loopAdr;
            
            if (this.prevFlags[ch] === 1) {
                this.gain[ch] = 0;
                this.adsrState[ch] = 3;
            }
            this.ram[0x7c] |= (1 << ch);
        }

        let header = this.apu.ram[this.decodeOffset[ch]++];
        this.decodeOffset[ch] &= 0xffff;
        let shift = header >> 4;
        let filter = (header & 0xc) >> 2;
        this.prevFlags[ch] = header & 0x3;
        let byte = 0;

        for (let i = 0; i < 16; i++) {
            let s = byte & 0xf;
            if ((i & 1) === 0) {
                byte = this.apu.ram[this.decodeOffset[ch]++];
                this.decodeOffset[ch] &= 0xffff;
                s = byte >> 4;
            }
            s = s > 7 ? s - 16 : s;
            if (shift <= 0xc) {
                s = (s << shift) >> 1;
            } else {
                s = s < 0 ? -2048 : 2048;
            }
            let old = this.old[ch];
            let older = this.older[ch];
            
            switch (filter) {
                case 1: {
                    s = s + old * 1 + ((-old * 1) >> 4);
                    break;
                }
                case 2: {
                    s = s + old * 2 + ((-old * 3) >> 5) - older + ((older * 1) >> 4);
                    break;
                }
                case 3: {
                    s = s + old * 2 + ((-old * 13) >> 6) - older + ((older * 3) >> 4);
                    break;
                }
            }
            s = s > 0x7fff ? 0x7fff : s;
            s = s < -0x8000 ? -0x8000 : s;
            s &= 0x7fff;
            s = s > 0x3fff ? s - 0x8000 : s;
            
            this.older[ch] = this.old[ch];
            this.old[ch] = s;
            this.decodeBuffer[ch19 + i + 3] = s;
        }
    };

    SnesDsp.prototype.interpolate = function(ch, sampleNum, offset) {
        const chOffset = ch * 19 + sampleNum;
        const news = this.decodeBuffer[chOffset + 3];
        const old = this.decodeBuffer[chOffset + 2];
        const older = this.decodeBuffer[chOffset + 1];
        const oldest = this.decodeBuffer[chOffset];
        
        let out = (SnesDsp.gaussVals[0xff - offset] * oldest) >> 10;
        out += (SnesDsp.gaussVals[0x1ff - offset] * older) >> 10;
        out += (SnesDsp.gaussVals[0x100 + offset] * old) >> 10;
        out &= 0xffff;
        out = out > 0x7fff ? out - 0x10000 : out;
        out += (SnesDsp.gaussVals[offset] * news) >> 10;
        out = out > 0x7fff ? 0x7fff : (out < -0x8000 ? -0x8000 : out);
        
        return out >> 1;
    };
}