/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 VDP (Sequential Pointer Optimized)
 * 
 * Emulates the central control bus, ports, registers, and timing synchronizations.
 * Optimized with linear pointer increments to remove expensive coordinate index multiplications
 * from the high-frequency pixel rendering hot paths.
 */

class Sega315_5124_Vdp {
    static get DataPortWriteMode() {
        return { toVRAM: 0, toCRAM: 1 };
    }

    static get Standard() {
        return { vdpNTSC: 0, vdpPAL: 1 };
    }

    /**
     * @param {number} vdpMode - 0: NTSC, 1: PAL
     * @param {WebGL2RenderingContext} glContext
     */
    constructor(vdpMode, glContext) {
        this.vRam = new Uint8Array(0x4000);
        this.colorRam = new Uint8Array(0x20);

        this.vdpStd = (vdpMode === 0) ? Sega315_5124_Vdp.Standard.vdpNTSC : Sega315_5124_Vdp.Standard.vdpPAL;

        if (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) {
            this.numberOfScanlines = 262;
            this.clockCyclesPerScanline = 228;
        } else {
            this.numberOfScanlines = 313;
            this.clockCyclesPerScanline = 228;
        }

        this.currentScanlineIndex = 0;
        this.lineCounter = 0;

        this.controlWordFlag = false;
        this.controlWord = 0;
        this.dataPortReadWriteAddress = 0;
        this.dataPortWriteMode = Sega315_5124_Vdp.DataPortWriteMode.toVRAM;
        this.readBufferByte = 0;
        this.statusFlags = 0;

        this.nameTableBaseAddress = 0xff;
        this.spriteAttributeTableBaseAddress = 0;
        this.spritePatternGeneratorBaseAddress = 0;

        this.vcounter = 0;
        this.hcounter = 0;

        this.phaserClicked = false;
        this.phaserX = 0;
        this.phaserY = 0;

        // Default register values
        this.register00 = 0x36;
        this.register01 = 0x80;
        this.register02 = 0xff;
        this.writeByteToRegister(2, 0xff);
        this.register03 = 0xff;
        this.register04 = 0xff;
        this.register05 = 0xff;
        this.writeByteToRegister(5, 0xff);
        this.register06 = 0xfb;
        this.writeByteToRegister(6, 0xfb);
        this.register08 = 0x00;
        this.register09 = 0x00;
        this.register07 = 0x00;
        this.register0a = 0xff;

        this.glbResolutionX = 256;
        this.glbResolutionY = 240;
        this.yScreenLines = 192;

        this.analogColorScale = new Uint8Array([0, 80, 175, 255]);

        this.glbFrameBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY * 4);
        this.prevFrameBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY * 4);
        this.priBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY);
        this.spriteBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY);

        this.sg1000palette = new Uint8Array([
            0,0,0, 0,0,0, 33,200,66, 94,220,120, 84,85,237, 125,118,252, 
            212,82,77, 66,235,245, 252,85,84, 255,121,120, 212,193,84, 
            230,206,128, 33,176,59, 201,91,186, 204,204,204, 255,255,255
        ]);

        this.postProcessor = new VdpPostProcessor(this, glContext);
    }

    cleanSpriteBuffer() {
        this.spriteBuffer.fill(0);
    }

    writeByteToRegister(registerIndex, dataByte) {
        if (registerIndex === 0) {
            this.register00 = dataByte;
        }
        else if (registerIndex === 1) {
            this.register01 = dataByte;
            if (this.register00 & 0x02) {
                if (this.register01 & 0x08) {
                    this.yScreenLines = 240;
                } else if (this.register01 & 0x10) {
                    this.yScreenLines = 224;
                }
            }
        }
        else if (registerIndex === 2) {
            this.nameTableBaseAddress = dataByte;
            this.register02 = dataByte;
        }
        else if (registerIndex === 3) {
            this.register03 = dataByte;
        }
        else if (registerIndex === 4) {
            this.register04 = dataByte;
        }
        else if (registerIndex === 5) {
            this.spriteAttributeTableBaseAddress = (dataByte & 0x7e) << 7;
            this.register05 = dataByte;
        }
        else if (registerIndex === 6) {
            this.spritePatternGeneratorBaseAddress = (dataByte & 0x04) << 11;
            this.register06 = dataByte;
        }
        else if (registerIndex === 7) {
            this.register07 = dataByte;
        }
        else if (registerIndex === 8) {
            this.register08 = dataByte;
        }
        else if (registerIndex === 9) {
            this.register09 = dataByte;
        }
        else if (registerIndex === 0x0a) {
            this.register0a = dataByte;
        }
    }

    writeByteToControlPort(b) {
        if (!this.controlWordFlag) {
            this.controlWord = b;
            this.controlWordFlag = true;
            this.dataPortReadWriteAddress = (this.dataPortReadWriteAddress & 0x3f00) | b;
        } else {
            this.controlWord |= (b << 8);
            this.controlWordFlag = false;

            const controlCode = (this.controlWord & 0xc000) >> 14;
            this.dataPortReadWriteAddress = (this.controlWord & 0x3fff);        

            if (controlCode === 0) {
                this.dataPortWriteMode = Sega315_5124_Vdp.DataPortWriteMode.toVRAM;
                this.readBufferByte = this.vRam[this.dataPortReadWriteAddress & 0x3fff];
                this.dataPortReadWriteAddress = (this.dataPortReadWriteAddress + 1) & 0x3fff;                
            }
            else if (controlCode === 1) {
                this.dataPortWriteMode = Sega315_5124_Vdp.DataPortWriteMode.toVRAM;
            }
            else if (controlCode === 2) {
                const registerIndex = (this.controlWord & 0x0f00) >> 8;
                const dataByte = this.controlWord & 0x00ff;
                this.writeByteToRegister(registerIndex, dataByte);                
            }
            else if (controlCode === 3) {
                this.dataPortWriteMode = Sega315_5124_Vdp.DataPortWriteMode.toCRAM;
            }
        }
    }

    writeByteToDataPort(b) {
        this.controlWordFlag = false;

        if (this.dataPortWriteMode === Sega315_5124_Vdp.DataPortWriteMode.toVRAM) {
            this.vRam[this.dataPortReadWriteAddress] = b;
        }
        else if (this.dataPortWriteMode === Sega315_5124_Vdp.DataPortWriteMode.toCRAM) {
            this.colorRam[this.dataPortReadWriteAddress & 0x1f] = b;
        }

        this.dataPortReadWriteAddress = (this.dataPortReadWriteAddress + 1) & 0x3fff;
        this.readBufferByte = b;
    }

    readByteFromDataPort() {
        this.controlWordFlag = false;
        const byte = this.readBufferByte;
        this.readBufferByte = this.vRam[this.dataPortReadWriteAddress];
        this.dataPortReadWriteAddress = (this.dataPortReadWriteAddress + 1) & 0x3fff;
        return byte;
    }    

    readByteFromControlPort() {
        this.controlWordFlag = false;
        const currentStatusFlags = this.statusFlags;
        this.statusFlags &= 0x1f;
        return currentStatusFlags | 0x1f;
    }    

    readDataPort(p) {
        if (p === 0x7e) return this.phaserClicked ? this.phaserY : this.vcounter;
        if (p === 0x7f) return this.phaserClicked ? this.phaserX : this.hcounter;
        return 0;
    }

    /**
     * Renders a single pixel-row of a background tile on the screen.
     * Optimized with sequential pointer addition to eliminate coordinate multiplication.
     */
    drawLineTile(addr, x, y, pal, fliph, flipv, finescrolly, priFlag) {
        const offset = flipv ? (7 - ((y + finescrolly) % 8)) : ((y + finescrolly) % 8);
        const tileRowAddr = addr + (offset * 4);

        const byte0 = this.vRam[tileRowAddr];
        const byte1 = this.vRam[tileRowAddr + 1];
        const byte2 = this.vRam[tileRowAddr + 2];
        const byte3 = this.vRam[tileRowAddr + 3];

        const palOffset = pal * 16;
        let bufferIndex = (x + (y * this.glbResolutionX)) * 4;

        for (let xt = 0; xt < 8; xt++) {
            const shift = fliph ? xt : (7 - xt);
            const cramIdx = (((byte0 >> shift) & 1) | 
                             (((byte1 >> shift) & 1) << 1) | 
                             (((byte2 >> shift) & 1) << 2) | 
                             (((byte3 >> shift) & 1) << 3)) & 0x0f;

            const colorValue = this.colorRam[cramIdx + palOffset];
            const xtile = x + xt;

            if (xtile >= 0 && xtile < 256 && y >= 0 && y < this.yScreenLines) {
                this.glbFrameBuffer[bufferIndex]     = this.analogColorScale[colorValue & 0x03];
                this.glbFrameBuffer[bufferIndex + 1] = this.analogColorScale[(colorValue & 0x0c) >> 2];
                this.glbFrameBuffer[bufferIndex + 2] = this.analogColorScale[(colorValue & 0x30) >> 4];
                this.glbFrameBuffer[bufferIndex + 3] = 255;

                this.priBuffer[x + xt + (y * this.glbResolutionX)] = (cramIdx !== 0) ? priFlag : 0;
            }
            
            bufferIndex += 4; // Fast sequential index pointer increment
        }
    }

    /**
     * Renders a single horizontal slice of an active Sprite.
     * Optimized with sequential pointer addition.
     */
    drawSpriteSlice(addr, spriteX, scanlineNum, slicey) {
        const tileRowAddr = this.spritePatternGeneratorBaseAddress + addr + (slicey * 4);

        const byte0 = this.vRam[tileRowAddr];
        const byte1 = this.vRam[tileRowAddr + 1];
        const byte2 = this.vRam[tileRowAddr + 2];
        const byte3 = this.vRam[tileRowAddr + 3];

        for (let xt = 0; xt < 8; xt++) {
            const shift = 7 - xt;
            const cramIdx = (((byte0 >> shift) & 1) | 
                             (((byte1 >> shift) & 1) << 1) | 
                             (((byte2 >> shift) & 1) << 2) | 
                             (((byte3 >> shift) & 1) << 3)) & 0x0f;

            if (cramIdx !== 0) {
                const colorValue = this.colorRam[cramIdx + 16];
                const cx = spriteX + xt;

                if (cx >= 0 && cx < this.glbResolutionX && scanlineNum >= 0 && scanlineNum < this.yScreenLines) {
                    const linearIndex = cx + (scanlineNum * this.glbResolutionX);
                    
                    if (this.spriteBuffer[linearIndex] === 0) {
                        this.spriteBuffer[linearIndex] = 1;
                    } else {
                        this.statusFlags |= 0x20; // Trigger hardware collision flag
                    }

                    if (this.priBuffer[linearIndex] === 0) {
                        const bufferIndex = linearIndex * 4;
                        this.glbFrameBuffer[bufferIndex]     = this.analogColorScale[colorValue & 0x03];
                        this.glbFrameBuffer[bufferIndex + 1] = this.analogColorScale[(colorValue & 0x0c) >> 2];
                        this.glbFrameBuffer[bufferIndex + 2] = this.analogColorScale[(colorValue & 0x30) >> 4];
                        this.glbFrameBuffer[bufferIndex + 3] = 255;
                    }
                }
            }
        }
    }

    /**
     * Renders a single horizontal scanline row.
     * @param {number} scanlineNum
     */
    drawScanline(scanlineNum) {
        if (scanlineNum < 0 || scanlineNum >= this.yScreenLines) return;

        let fbY = (scanlineNum * this.glbResolutionX) * 4;

        if (!(this.register01 & 0x40)) { // Screen blanked (Register 1, Bit 6)
            this.glbFrameBuffer.fill(0, fbY, fbY + 1024);
            return;
        }

        // 1. Draw Background Layer
        if ((this.register00 & 0x04) !== 0) {
            VdpMode4Renderer.renderScanline(this, scanlineNum);
        } else if ((this.register00 & 0x02) !== 0) {
            VdpMode2Renderer.renderScanline(this, scanlineNum);
        }

        // 2. Draw Sprite Layer
        if ((this.register00 & 0x04) !== 0) {
            VdpSpriteManager.drawMode4(this, scanlineNum);
        } else if ((this.register00 & 0x02) !== 0) {
            VdpSpriteManager.drawMode2(this, scanlineNum);
        }

        // 3. Overscan Border Masking (Register 0, Bit 5)
        if (this.register00 & 0x20) {
            const oscol = this.colorRam[(this.register07 & 0x0f) + 16];
            const r = this.analogColorScale[oscol & 0x03];
            const g = this.analogColorScale[(oscol & 0x0c) >> 2];
            const b = this.analogColorScale[(oscol & 0x30) >> 4];

            let borderOffset = (scanlineNum * this.glbResolutionX) * 4;
            for (let x = 0; x < 8; x++) {
                this.glbFrameBuffer[borderOffset]     = r;
                this.glbFrameBuffer[borderOffset + 1] = g;
                this.glbFrameBuffer[borderOffset + 2] = b;
                this.glbFrameBuffer[borderOffset + 3] = 255;
                borderOffset += 4;
            }
        }
    }

    /**
     * Delegates upscaling to the post-processing filter pipeline.
     */
    hyperBlit(ctx, postProcessMode) {
        this.postProcessor.blit(ctx, this.glbFrameBuffer, this.yScreenLines, postProcessMode);
    }

    /**
     * Steps V-Sync and coordinate sync timers.
     */
    update(theCPU, cycles) {
        this.hcounter += cycles;
        if (this.hcounter >= this.clockCyclesPerScanline) {
            let raiseInterrupt = false;
            this.hcounter %= this.clockCyclesPerScanline;

            let vCounterJumpOnScanlineIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 219 : 243;
            let vCounterJumpToIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 213 : 186;   

            let interruptAfterScanlineIndex = 192;

            if (this.yScreenLines === 224) {
                vCounterJumpOnScanlineIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 235 : 256;
                vCounterJumpToIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 229 : 0xca + 1;   
                interruptAfterScanlineIndex = 224; 
            }
            else if (this.yScreenLines === 240) {
                vCounterJumpOnScanlineIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 256 : 256;
                vCounterJumpToIndex = (this.vdpStd === Sega315_5124_Vdp.Standard.vdpNTSC) ? 0 : 0xd2 + 1;    
                interruptAfterScanlineIndex = 240;
            }

            if (this.currentScanlineIndex === vCounterJumpOnScanlineIndex) {
                this.vcounter = vCounterJumpToIndex;
            } else {
                this.vcounter = (this.vcounter + 1) & 0xff;
            }

            if (this.currentScanlineIndex <= this.yScreenLines) {
                if (this.lineCounter === 0x0) {
                    this.lineCounter = this.register0a;
                    if (this.register00 & 0x10) raiseInterrupt = true;
                } else {
                    this.lineCounter--;
                }
            } else {
                this.lineCounter = this.register0a;
            }            

            if (this.currentScanlineIndex === interruptAfterScanlineIndex) {
                this.statusFlags |= 0x80;
            }

            if (this.currentScanlineIndex === (interruptAfterScanlineIndex + 1)) {
                if ((this.register01 & 0x20) !== 0) raiseInterrupt = true;
            }

            if (raiseInterrupt) {
                theCPU.raiseMaskableInterrupt();
            }

            this.currentScanlineIndex++;
            if (this.currentScanlineIndex === this.numberOfScanlines) {
                this.currentScanlineIndex = 0;
            }            

            if (this.currentScanlineIndex === 0) {
                this.prevFrameBuffer.set(this.glbFrameBuffer);
                this.cleanSpriteBuffer();
                return true;
            } else {
                this.drawScanline(this.currentScanlineIndex - 1);
            }

            return false;
        }
    }
}