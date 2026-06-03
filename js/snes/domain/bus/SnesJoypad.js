/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesJoypad
 * 
 * ROLE:
 * Handles the hardware Joypad and Auto-read registers
 */

class SnesJoypad {
    constructor() {
        this.reset();
    }

    reset() {
        this.autoJoyRead = false;
        this.autoJoyTimer = 0;

        this.joypad1Val = 0;
        this.joypad2Val = 0;
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypadStrobe = false;
        this.joypad1State = 0;
        this.joypad2State = 0;
    }

    setPad1ButtonPressed(num) {
        this.joypad1State |= (1 << num);
    }

    setPad1ButtonReleased(num) {
        this.joypad1State &= (~(1 << num)) & 0xfff;
    }

    strobe() {
        if (this.joypadStrobe) {
            this.joypad1Val = this.joypad1State;
            this.joypad2Val = this.joypad2State;
        }
    }

    cycle() {
        if (this.autoJoyTimer > 0) {
            this.autoJoyTimer -= 2;
        }
    }

    doAutoJoyRead() {
        this.joypad1AutoRead = 0;
        this.joypad2AutoRead = 0;
        this.joypad1Val = this.joypad1State;
        this.joypad2Val = this.joypad2State;
        
        for (let i = 0; i < 16; i++) {
            let bit = this.joypad1Val & 0x1;
            this.joypad1Val >>= 1;
            this.joypad1Val |= 0x8000;
            this.joypad1AutoRead |= (bit << (15 - i));
            
            bit = this.joypad2Val & 0x1;
            this.joypad2Val >>= 1;
            this.joypad2Val |= 0x8000;
            this.joypad2AutoRead |= (bit << (15 - i));
        }
    }
    
    startAutoRead() {
        if (this.autoJoyRead) {
            this.autoJoyTimer = 4224;
            this.doAutoJoyRead();
        }
    }

    read4016() {
        const val = this.joypad1Val & 0x1;
        this.joypad1Val = (this.joypad1Val >> 1) | 0x8000;
        return val;
    }

    read4017() {
        const val = this.joypad2Val & 0x1;
        this.joypad2Val = (this.joypad2Val >> 1) | 0x8000;
        return val;
    }
}
window.SnesJoypad = SnesJoypad;
