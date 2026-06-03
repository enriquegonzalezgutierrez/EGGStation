/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesMathUnit
 * 
 * ROLE:
 * Handles the hardware multiplication and division registers
 * mapped at 0x4202 - 0x4206 and 0x4214 - 0x4217.
 */

class SnesMathUnit {
    constructor() {
        this.multiplyA = 0xff;
        this.divA = 0xffff;
        this.divResult = 0x101;
        this.mulResult = 0xfe01;
    }

    reset() {
        this.multiplyA = 0xff;
        this.divA = 0xffff;
        this.divResult = 0x101;
        this.mulResult = 0xfe01;
    }

    readReg(adr) {
        switch (adr) {
            case 0x4214:
                return this.divResult & 0xff;
            case 0x4215:
                return (this.divResult & 0xff00) >> 8;
            case 0x4216:
                return this.mulResult & 0xff;
            case 0x4217:
                return (this.mulResult & 0xff00) >> 8;
        }
        return 0; // Return 0 if address is not mapped here
    }

    writeReg(adr, value) {
        switch (adr) {
            case 0x4202:
                this.multiplyA = value;
                return true;
            case 0x4203:
                this.mulResult = this.multiplyA * value;
                return true;
            case 0x4204:
                this.divA = (this.divA & 0xff00) | value;
                return true;
            case 0x4205:
                this.divA = (this.divA & 0xff) | (value << 8);
                return true;
            case 0x4206:
                this.divResult = 0xffff;
                this.mulResult = this.divA;
                if (value !== 0) {
                    this.divResult = Math.floor(this.divA / value) & 0xffff;
                    this.mulResult = this.divA % value;
                }
                return true;
        }
        return false;
    }
}
window.SnesMathUnit = SnesMathUnit;
