/* 
 * Project: EGGStation - Sega Master System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: Sega 315-5124 Video Display Processor
 * 
 * Emulates the visual co-processor responsible for scanline rendering, sprite 
 * collisions, scrolling registers, and frame synchronization (NTSC/PAL).
 * Derived from the TMS9918 with Master System-specific extensions (Mode 4).
 */

const vdpDataPortWriteMode = {
    toVRAM: 0,
    toCRAM: 1
};

const vdpStandard = {
    vdpNTSC: 0,
    vdpPAL: 1
};

class Sega315_5124_Vdp {
    constructor(vdpMode) {
        // 16KB of Video RAM (VRAM)
        this.vRam = new Array(0x4000).fill(0);

        // 32 Bytes of write-only Color RAM (CRAM)
        this.colorRam = new Array(0x20).fill(0);

        // Standard timing configurations
        this.vdpStd = (vdpMode === 0) ? vdpStandard.vdpNTSC : vdpStandard.vdpPAL;

        if (this.vdpStd === vdpStandard.vdpNTSC) {
            this.numberOfScanlines = 262;
            this.clockCyclesPerScanline = 228;
            console.log("VDP::NTSC Standard");
        } else {
            this.numberOfScanlines = 313;
            this.clockCyclesPerScanline = 228;
            console.log("VDP::PAL Standard");
        }

        this.currentScanlineIndex = 0;
        this.lineCounter = 0;

        this.controlWordFlag = false;
        this.controlWord = 0;
        this.dataPortReadWriteAddress = 0;
        this.dataPortWriteMode = vdpDataPortWriteMode.toVRAM;
        this.readBufferByte = 0;
        this.statusFlags = 0;

        this.nameTableBaseAddress = 0xff;
        this.spriteAttributeTableBaseAddress = 0;
        this.spritePatternGeneratorBaseAddress = 0;

        this.vcounter = 0;
        this.hcounter = 0;

        // Default power-up registers values matching real SMS VDP specs
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
        this.register0a = 0xff; // Line counter

        this.glbResolutionX = 256;
        this.glbResolutionY = 240;
        this.yScreenLines = 192;

        // Image canvas buffers
        this.glbFrameBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY * 4);
        this.priBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY);
        this.spriteBuffer = new Uint8ClampedArray(this.glbResolutionX * this.glbResolutionY);

        this.cleanSpriteBuffer();

        // Standard SG-1000 Fallback Palette
        this.sg1000palette = [
            0,0,0, 
            0,0,0, 
            33,200,66, 
            94,220,120, 
            84,85,237, 
            125,118,252, 
            212,82,77, 
            66,235,245, 
            252,85,84, 
            255,121,120, 
            212,193,84, 
            230,206,128, 
            33,176,59, 
            201,91,186, 
            204,204,204, 
            255,255,255
        ];

        this.glbImgData = undefined;
        this.glbCanvasRenderer = undefined;
    }

    cleanSpriteBuffer() {
        for (let y = 0; y < this.glbResolutionY; y++) {
            for (let x = 0; x < this.glbResolutionX; x++) {
                this.spriteBuffer[x + (y * this.glbResolutionX)] = 0;
            }
        }
    }

    writeByteToRegister(registerIndex, dataByte) {
        if (registerIndex === 0) {
            this.register00 = dataByte;
            if ((this.register00 & 0x04) === 0) {
                console.log("VDP::Warning: Directing VDP to fall back on legacy TMS9918 formats.");
            }
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

            if (this.register01 & 0x01) {
                console.log("VDP::Warning: Sprites configured for double-size rendering.");
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
        else {
            console.warn("VDP::Unrecognized configuration register write attempt at: " + registerIndex);
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
                this.dataPortWriteMode = vdpDataPortWriteMode.toVRAM;
                this.readBufferByte = this.vRam[this.dataPortReadWriteAddress & 0x3fff];
                this.dataPortReadWriteAddress++;
                this.dataPortReadWriteAddress &= 0x3fff;                
            }
            else if (controlCode === 1) {
                this.dataPortWriteMode = vdpDataPortWriteMode.toVRAM;
            }
            else if (controlCode === 2) {
                const registerIndex = (this.controlWord & 0x0f00) >> 8;
                const dataByte = this.controlWord & 0x00ff;
                this.writeByteToRegister(registerIndex, dataByte);                
            }
            else if (controlCode === 3) {
                this.dataPortWriteMode = vdpDataPortWriteMode.toCRAM;
            }
        }
    }

    writeByteToDataPort(b) {
        this.controlWordFlag = false;

        if (this.dataPortWriteMode === vdpDataPortWriteMode.toVRAM) {
            if (this.dataPortReadWriteAddress < 0x4000) {
                this.vRam[this.dataPortReadWriteAddress] = b;
            } else {
                console.error("VDP::Attempted out-of-bounds write inside VRAM address: 0x" + this.dataPortReadWriteAddress.toString(16));
            }
        }
        else if (this.dataPortWriteMode === vdpDataPortWriteMode.toCRAM) {
            const cramAddress = this.dataPortReadWriteAddress & 0x1f;
            this.colorRam[cramAddress] = b;
        }

        this.dataPortReadWriteAddress++;
        this.dataPortReadWriteAddress &= 0x3fff;
        this.readBufferByte = b;
    }

    readByteFromDataPort() {
        this.controlWordFlag = false;

        const byte = this.readBufferByte;
        this.readBufferByte = this.vRam[this.dataPortReadWriteAddress];

        this.dataPortReadWriteAddress++;
        this.dataPortReadWriteAddress &= 0x3fff;

        return byte;
    }    

    readByteFromControlPort() {
        this.controlWordFlag = false;
        const currentStatusFlags = this.statusFlags;

        // Clear status flags upon reading (retains low 5 bits)
        this.statusFlags &= 0x1f;
        return currentStatusFlags | 0x1f;
    }    

    readDataPort(p) {
        if (p === 0x7e) {
            return this.vcounter;
        } else if (p === 0x7f) {
            console.warn("VDP::CPU read request targeting horizontal counters.");
            return this.hcounter;
        }
        return 0;
    }

    drawTiledbg(ctx, addr, x, y, pal) {
        for (let yt = 0; yt < 8; yt++) {
            for (let xt = 0; xt < 8; xt++) {
                let byte0 = this.vRam[addr];
                let byte1 = this.vRam[addr + 1];
                let byte2 = this.vRam[addr + 2];
                let byte3 = this.vRam[addr + 3];

                byte0 >>= (7 - xt); byte0 &= 1;
                byte1 >>= (7 - xt); byte1 &= 1;
                byte2 >>= (7 - xt); byte2 &= 1;
                byte3 >>= (7 - xt); byte3 &= 1;

                const cramIdx = byte0 | (byte1 << 1) | (byte2 << 2) | (byte3 << 3);
                const curbyte = this.colorRam[cramIdx + (pal * 16)];

                const red = (curbyte & 0x03) * 85;
                const green = ((curbyte & 0x0c) >> 2) * 85;
                const blue = ((curbyte & 0x30) >> 4) * 85;

                ctx.fillStyle = "rgba(" + red + "," + green + "," + blue + ",1)"; 
                ctx.fillRect(x + xt, y + yt, 1, 1);
            }
            addr += 4;
        }        
    }

    drawLineTile(addr, x, y, pal, fliph, flipv, finescrolly, priFlag) {
        if (!flipv) {
            addr += ((y + finescrolly) % 8) * 4;
        } else {
            addr += (7 - ((y + finescrolly) % 8)) * 4;
        }

        for (let xt = 0; xt < 8; xt++) {
            let byte0 = this.vRam[addr];
            let byte1 = this.vRam[addr + 1];
            let byte2 = this.vRam[addr + 2];
            let byte3 = this.vRam[addr + 3];

            if (fliph) {
                byte0 >>= xt; byte0 &= 1;
                byte1 >>= xt; byte1 &= 1;
                byte2 >>= xt; byte2 &= 1;
                byte3 >>= xt; byte3 &= 1;
            } else {
                byte0 >>= (7 - xt); byte0 &= 1;
                byte1 >>= (7 - xt); byte1 &= 1;
                byte2 >>= (7 - xt); byte2 &= 1;
                byte3 >>= (7 - xt); byte3 &= 1;
            }

            const cramIdx = (byte0 | (byte1 << 1) | (byte2 << 2) | (byte3 << 3)) & 0x0f;
            const curbyte = this.colorRam[cramIdx + (pal * 16)];
            
            const red = (curbyte & 0x03) * 85;
            const green = ((curbyte & 0x0c) >> 2) * 85;
            const blue = ((curbyte & 0x30) >> 4) * 85;

            const xtile = x + xt;
            const ytile = y;

            if ((xtile >= 0) && (xtile < 256) && (ytile >= 0) && (ytile < this.yScreenLines)) {
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 0] = red;
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 1] = green;
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 2] = blue;
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 3] = 255;

                if (cramIdx !== 0) {
                    this.priBuffer[(x + xt + (y * this.glbResolutionX))] = priFlag;
                } else {
                    this.priBuffer[(x + xt + (y * this.glbResolutionX))] = 0;
                }
            }
        }
    }

    drawSpriteSlice(addr, spriteX, scanlineNum, slicey) {
        addr += this.spritePatternGeneratorBaseAddress;
        addr += 4 * slicey;

        for (let xt = 0; xt < 8; xt++) {
            let byte0 = this.vRam[addr];
            let byte1 = this.vRam[addr + 1];
            let byte2 = this.vRam[addr + 2];
            let byte3 = this.vRam[addr + 3];

            byte0 >>= (7 - xt); byte0 &= 1;
            byte1 >>= (7 - xt); byte1 &= 1;
            byte2 >>= (7 - xt); byte2 &= 1;
            byte3 >>= (7 - xt); byte3 &= 1;

            const cramIdx = (byte0 | (byte1 << 1) | (byte2 << 2) | (byte3 << 3)) & 0x0f;
            const curbyte = this.colorRam[cramIdx + 16];

            if (cramIdx !== 0) {
                const red = (curbyte & 0x03) * 85;
                const green = ((curbyte & 0x0c) >> 2) * 85;
                const blue = ((curbyte & 0x30) >> 4) * 85;
    
                const cx = spriteX + xt;
                const cy = scanlineNum;

                if ((cx >= 0) && (cx < this.glbResolutionX) && (cy >= 0) && (cy < this.yScreenLines)) {
                    if (this.spriteBuffer[(spriteX + xt + (cy * this.glbResolutionX))] === 0) {
                        this.spriteBuffer[(spriteX + xt + (cy * this.glbResolutionX))] = 1;
                    } else {
                        // Flag collision state (bit 5 of status register)
                        this.statusFlags |= 0x20;
                    }

                    if (this.priBuffer[(spriteX + xt + (cy * this.glbResolutionX))] === 0) {
                        this.glbFrameBuffer[(spriteX + xt + (cy * this.glbResolutionX)) * 4 + 0] = red;
                        this.glbFrameBuffer[(spriteX + xt + (cy * this.glbResolutionX)) * 4 + 1] = green;
                        this.glbFrameBuffer[(spriteX + xt + (cy * this.glbResolutionX)) * 4 + 2] = blue;
                        this.glbFrameBuffer[(spriteX + xt + (cy * this.glbResolutionX)) * 4 + 3] = 255;
                    }
                }
            }
        }
    }

    debugTiles(ctx, x, y) {
        let addrInMemory = 0;
        for (let ytile = 0; ytile < 24; ytile++) {
            for (let xtile = 0; xtile < 16; xtile++) {
                this.drawTiledbg(ctx, addrInMemory, x + (xtile * 8), 170 + y + (ytile * 8), 0);
                addrInMemory += 32; // Standard 32-byte layout per plane tile
            }
        }
    }

    debugPalette(ctx, x, y) {
        for (let color = 0; color < 0x20; color++) {
            const curbyte = this.colorRam[color];
            const red = (curbyte & 0x03) * 85;
            const green = ((curbyte & 0x0c) >> 2) * 85;
            const blue = ((curbyte & 0x30) >> 4) * 85;

            const quadSize = 10;
            ctx.fillStyle = "rgba(" + red + "," + green + "," + blue + ",1)"; 
            ctx.fillRect(x + (color * quadSize), y, quadSize, quadSize);
        }
    }

    hyperBlit(ctx, filtertype) {
        if (filtertype === 1) {
            for (let y = 0; y < this.glbResolutionY; y += 2) {
                let pos = (y * this.glbResolutionX) * 4;
                for (let x = 0; x < this.glbResolutionX; x++) {
                    this.glbFrameBuffer[pos + 0] = Math.floor(this.glbFrameBuffer[pos + 0] * 0.75);
                    this.glbFrameBuffer[pos + 1] = Math.floor(this.glbFrameBuffer[pos + 1] * 0.75);
                    this.glbFrameBuffer[pos + 2] = Math.floor(this.glbFrameBuffer[pos + 2] * 0.75);
                    this.glbFrameBuffer[pos + 3] = 255;
                    pos += 4;
                }
            }
        }

        if (this.glbImgData === undefined) {
            this.glbImgData = ctx.getImageData(0, 0, this.glbResolutionX, this.glbResolutionY);
        }
        this.glbImgData.data.set(this.glbFrameBuffer);
    
        if (this.glbCanvasRenderer === undefined) {
            this.glbCanvasRenderer = document.createElement('canvas');
            this.glbCanvasRenderer.width = this.glbImgData.width;
            this.glbCanvasRenderer.height = this.glbImgData.height;
        }
        this.glbCanvasRenderer.getContext('2d', { willReadFrequently: true }).putImageData(this.glbImgData, 0, 0);
        ctx.drawImage(this.glbCanvasRenderer, 0, 0, this.glbResolutionX, this.glbResolutionY);
    }

    update(theCPU, cycles) {
        this.hcounter += cycles;
        if (this.hcounter >= this.clockCyclesPerScanline) {
            let raiseInterrupt = false;
            this.hcounter %= this.clockCyclesPerScanline;

            let vCounterJumpOnScanlineIndex = 219;
            let vCounterJumpToIndex = 213;   

            if (this.vdpStd !== vdpStandard.vdpNTSC) {
                vCounterJumpOnScanlineIndex = 243;
                vCounterJumpToIndex = 186;    
            }

            let interruptAfterScanlineIndex = 192;

            if (this.yScreenLines === 224) {
                if (this.vdpStd === vdpStandard.vdpNTSC) {
                    vCounterJumpOnScanlineIndex = 235;
                    vCounterJumpToIndex = 229;   
                } else {
                    vCounterJumpOnScanlineIndex = 256;
                    vCounterJumpToIndex = 0xca + 1;   
                }
                
                interruptAfterScanlineIndex = 224; 
            }
            else if (this.yScreenLines === 240) {
                if (this.vdpStd === vdpStandard.vdpNTSC) {
                    vCounterJumpOnScanlineIndex = 256;
                    vCounterJumpToIndex = 0;    
                } else {
                    vCounterJumpOnScanlineIndex = 256;
                    vCounterJumpToIndex = 0xd2 + 1;    
                }
                
                interruptAfterScanlineIndex = 240;
            }

            // Jump vcounter
            if (this.currentScanlineIndex === vCounterJumpOnScanlineIndex) {
                this.vcounter = vCounterJumpToIndex;
            } else {
                this.vcounter++;
                this.vcounter &= 0xff;
            }

            // Line counter execution
            if (this.currentScanlineIndex <= this.yScreenLines) {
                if (this.lineCounter === 0x0) {
                    this.lineCounter = this.register0a;
    
                    if (this.register00 & 0x10) {
                        raiseInterrupt = true;
                    }
                } else {
                    this.lineCounter--;
                }
            } else {
                this.lineCounter = this.register0a;
            }            

            if (this.currentScanlineIndex === interruptAfterScanlineIndex) {
                this.statusFlags |= 0x80;
            }

            // Frame interrupt flag validation
            if (this.currentScanlineIndex === (interruptAfterScanlineIndex + 1)) {
                if ((this.register01 & 0x20) !== 0) {
                    raiseInterrupt = true;
                }
            }

            if (raiseInterrupt) {
                theCPU.raiseMaskableInterrupt();
            }

            this.currentScanlineIndex++;
            if (this.currentScanlineIndex === this.numberOfScanlines) {
                this.currentScanlineIndex = 0;
            }            

            if (this.currentScanlineIndex === 0) {
                this.cleanSpriteBuffer();
                return true;
            } else {
                this.drawScanline(this.currentScanlineIndex - 1);
            }

            return false;
        }
    }

    drawScanlineM2Tile(tilenum, x, y) {
        let tileAddr = (tilenum * 8);
        let pattern_table_addr = 0;
        const color_table_addr = (this.register03 & 0x80) << 6;

        pattern_table_addr = (this.register04 & 0x04) << 11;

        const realy = y % 8;
        tileAddr += realy;
        const curbyte = this.vRam[pattern_table_addr + tileAddr];

        const color_line = this.vRam[color_table_addr + tileAddr];
        const bg_color = color_line & 0x0F;
        const fg_color = color_line >> 4;

        for (let xt = 0; xt < 8; xt++) {
            const b = ((curbyte >> (7 - xt)) & 0x01);

            if (b !== 0) {
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 0] = this.sg1000palette[fg_color * 3];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 1] = this.sg1000palette[fg_color * 3 + 1];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 2] = this.sg1000palette[fg_color * 3 + 2];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 3] = 255;
            } else {
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 0] = this.sg1000palette[bg_color * 3];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 1] = this.sg1000palette[bg_color * 3 + 1];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 2] = this.sg1000palette[bg_color * 3 + 2];
                this.glbFrameBuffer[(x + xt + (y * this.glbResolutionX)) * 4 + 3] = 255;
            }
        }
    }    

    drawSpritesM2Scanline(scanlineNum) {
        const sprite_attribute_addr = (this.register05 & 0x7F) << 7;
        const sprite_size = ((this.register01 & 0x02) !== 0) ? 16 : 8;
        const sprite_pattern_addr = (this.register06 & 0x07) << 11;
        const sprite_zoom = false;

        let max_sprite = 31;

        for (let sprite = 0; sprite <= max_sprite; sprite++) {
            if (this.vRam[sprite_attribute_addr + (sprite << 2)] === 0xD0) {
                max_sprite = sprite - 1;
                break;
            }
        }

        for (let sprite = 0; sprite <= max_sprite; sprite++) {
            const sprite_attribute_offset = sprite_attribute_addr + (sprite << 2);
            let sprite_y = (this.vRam[sprite_attribute_offset] + 1) & 0xFF;

            if (sprite_y >= 0xE0) {
                sprite_y = -(0x100 - sprite_y);
            }

            if ((sprite_y > scanlineNum) || ((sprite_y + sprite_size) <= scanlineNum)) {
                continue;
            }

            const sprite_color = this.vRam[sprite_attribute_offset + 3] & 0x0F;

            if (sprite_color === 0) {
                continue;
            }

            const sprite_shift = (this.vRam[sprite_attribute_offset + 3] & 0x80) ? 32 : 0;
            const sprite_x = this.vRam[sprite_attribute_offset + 1] - sprite_shift;

            if (sprite_x >= this.glbResolutionX) {
                continue;
            }

            let sprite_tile = this.vRam[sprite_attribute_offset + 2];
            sprite_tile &= ((this.register01 & 0x02) !== 0) ? 0xFC : 0xFF;

            const sprite_line_addr = sprite_pattern_addr + (sprite_tile << 3) + ((scanlineNum - sprite_y) >> (sprite_zoom ? 1 : 0));

            for (let tile_x = 0; tile_x < sprite_size; tile_x++) {
                const sprite_pixel_x = sprite_x + tile_x;
                if (sprite_pixel_x >= this.glbResolutionX) {
                    break;
                }
                if (sprite_pixel_x < 0) {
                    continue;
                }

                let sprite_pixel = false;
                const tile_x_adjusted = tile_x >> (sprite_zoom ? 1 : 0);

                if (tile_x_adjusted < 8) {
                    sprite_pixel = ((this.vRam[sprite_line_addr] & (1 << (7 - tile_x_adjusted))) === 0) ? false : true;
                } else {
                    sprite_pixel = ((this.vRam[sprite_line_addr + 16] & (1 << (15 - tile_x_adjusted))) === 0) ? false : true;
                }

                if (sprite_pixel) {
                    const fbY = (scanlineNum * this.glbResolutionX * 4) + (sprite_pixel_x * 4);
                    this.glbFrameBuffer[fbY + 0] = this.sg1000palette[sprite_color * 3];
                    this.glbFrameBuffer[fbY + 1] = this.sg1000palette[sprite_color * 3 + 1];
                    this.glbFrameBuffer[fbY + 2] = this.sg1000palette[sprite_color * 3 + 2];
                    this.glbFrameBuffer[fbY + 3] = 255;
                }
            }
        }
    }

    drawScanline(scanlineNum) {
        if (scanlineNum < 0) return;
        if (scanlineNum >= this.yScreenLines) return;

        let fbY = (scanlineNum * this.glbResolutionX) * 4;

        // Check for blanked display (D6 of register 1)
        if (!(this.register01 & 0x40)) {
            for (let i = 0; i < 256; i++) {
                this.glbFrameBuffer[fbY + 0] = 0;
                this.glbFrameBuffer[fbY + 1] = 0;
                this.glbFrameBuffer[fbY + 2] = 0;
                this.glbFrameBuffer[fbY + 3] = 255;
                fbY += 4;
            }
            return;
        }

        // Mode 4 Render
        if ((this.register00 & 0x04) !== 0) {
            let nameTableBaseAddressMask = 0x0e;
            let nameTableBaseAddressOffset = 0;
            if ((this.yScreenLines === 224) || (this.yScreenLines === 240)) {
                nameTableBaseAddressMask = 0x0c;
                nameTableBaseAddressOffset = 0x700;
            }
            
            let nameTableBaseAddress = ((this.nameTableBaseAddress & nameTableBaseAddressMask) << 10) | nameTableBaseAddressOffset;

            const initialTile = 32 - (((this.register08) >> 3) & 0x1f);
            let finescrollx = this.register08 & 0x7;
            const initialRow = Math.floor((this.register09) / 8);
            let finescrolly = (this.register09 % 8);

            let smLen = 28;
            if ((this.yScreenLines === 224) || (this.yScreenLines === 240)) {
                smLen = 32;
            }

            const yScreenMap = Math.floor(scanlineNum / 8);
            let adder = 0;
            if ((finescrolly + (scanlineNum % 8)) >= 8) {
                adder = 1;
            }

            const screenMap = [];
            nameTableBaseAddress += (((yScreenMap + initialRow + adder) % smLen) * 32) * 2;
            for (let x = 0; x < 32; x++) {
                let word = this.vRam[nameTableBaseAddress];
                word |= this.vRam[nameTableBaseAddress + 1] << 8;
                screenMap.push(word);
                nameTableBaseAddress += 2;             
            }

            const screenMapNoscroll = [];
            if (this.register00 & 0x80) { // Disable vertical scrolling for columns 24-31
                let nameTableBaseAddressNoScroll = ((this.nameTableBaseAddress >> 1) & 0x07) << 11;
                nameTableBaseAddressNoScroll += (((yScreenMap) % smLen) * 32) * 2;
                for (let x = 0; x < 32; x++) {
                    let word = this.vRam[nameTableBaseAddressNoScroll];
                    word |= this.vRam[nameTableBaseAddressNoScroll + 1] << 8;
                    screenMapNoscroll.push(word);
                    nameTableBaseAddressNoScroll += 2;             
                }
            }

            for (let x = 0; x < 32; x++) {
                let word;

                if ((x >= 24) && (this.register00 & 0x80)) {
                    word = screenMapNoscroll[((x + initialTile) % 32)];
                    finescrolly = 0;
                }
                else if ((this.register00 & 0x40) && (scanlineNum < 16)) { // Disable horizontal scrolling for rows 0-1
                    word = screenMap[x];
                    finescrollx = 0;
                }
                else {
                    word = screenMap[((x + initialTile) % 32)];
                }

                const flipH = (word >> 9) & 0x01;
                const flipV = (word >> 10) & 0x01;
                const pal = (word >> 11) & 0x01;
                const priFlag = (word >> 12) & 0x01;

                this.drawLineTile((word & 0x1ff) * 32, (x * 8) + finescrollx, scanlineNum, pal, flipH, flipV, finescrolly, priFlag);   
            }
        }
        // Mode 2 Render
        else if ((this.register00 & 0x02) !== 0) {
            let nameTableBaseAddress = (this.nameTableBaseAddress & 0x0f) << 10;

            const screenMap = [];
            for (let y = 0; y < 24; y++) {
                for (let x = 0; x < 32; x++) {
                    let byte = this.vRam[nameTableBaseAddress];

                    if ((y >= 8) && (y < 16)) byte += 0x100;
                    else if (y >= 16) byte += 0x200;

                    screenMap.push(byte);
                    nameTableBaseAddress += 1;             
                }
            }

            const yScreenMap = Math.floor(scanlineNum / 8);

            for (let x = 0; x < 32; x++) {
                const char = screenMap[x + (((yScreenMap) % 24) * 32)];
                this.drawScanlineM2Tile(char, (x * 8), scanlineNum);   
            }
        }

        // Render Sprites (Mode 4)
        if ((this.register00 & 0x04) !== 0) {
            const sat = this.spriteAttributeTableBaseAddress;

            let stopDrawingSpritesWhenLine208IsFound = true;
            if ((this.yScreenLines === 224) || (this.yScreenLines === 240)) {
                stopDrawingSpritesWhenLine208IsFound = false;
            }

            let maxSprite = 64;
            for (let s = 0; s < 64; s++) {
                const spriteY = this.vRam[sat + s];
                if ((spriteY === 0xd0) && stopDrawingSpritesWhenLine208IsFound) {
                    maxSprite = s;
                    break;
                }
            }

            if (maxSprite > 0) {
                maxSprite -= 1;
            }

            let numSpritesDrawnOnThisScanline = 0;
            for (let s = maxSprite; s >= 0; s--) {
                let spriteY = this.vRam[sat + s];
                spriteY++;

                if ((spriteY > 0xd0) && stopDrawingSpritesWhenLine208IsFound) {
                    spriteY -= 0x100;
                }

                let spriteX = this.vRam[sat + (s * 2) + (0x10 * 0x8)];

                if (this.register00 & 0x08) {
                    spriteX -= 8;
                }

                let spriteIdx = this.vRam[sat + (s * 2) + (0x10 * 0x8) + 1];

                let spritesAre8x16 = false;
                if ((this.register00 & 0x04) && (this.register01 & 0x02)) {
                    spritesAre8x16 = true;
                    spriteIdx &= 0xfe;
                }

                if ((scanlineNum >= spriteY) && (scanlineNum < (spriteY + 8))) {
                    this.drawSpriteSlice(spriteIdx * 32, spriteX, scanlineNum, scanlineNum - spriteY);
                    numSpritesDrawnOnThisScanline++;
                }

                if (spritesAre8x16) {
                    spriteIdx++;
                    if ((scanlineNum >= (spriteY + 8)) && (scanlineNum < (spriteY + 16))) {
                        this.drawSpriteSlice(spriteIdx * 32, spriteX, scanlineNum, scanlineNum - spriteY - 8);
                    }
                }
            }

            if (numSpritesDrawnOnThisScanline >= 8) {
                // Set sprite overflow flag
                this.statusFlags |= 0x40;
            }
        }
        // Render Sprites (Mode 2)
        else if ((this.register00 & 0x02) !== 0) {
            this.drawSpritesM2Scanline(scanlineNum);
        }

        // Mask Column 0 with overscan backdrop color (D5 of register 0)
        if (this.register00 & 0x20) {
            const oscol = this.colorRam[(this.register07 & 0x0f) + 16];
            const red = (oscol & 0x03) * 85;
            const green = ((oscol & 0x0c) >> 2) * 85;
            const blue = ((oscol & 0x30) >> 4) * 85;

            for (let x = 0; x < 8; x++) {
                const pos = (x + (scanlineNum * this.glbResolutionX)) * 4;
                this.glbFrameBuffer[pos] = red;
                this.glbFrameBuffer[pos + 1] = green;
                this.glbFrameBuffer[pos + 2] = blue;
                this.glbFrameBuffer[pos + 3] = 255;
            }
        }
    }
}

// Global legacy alias to prevent breaking unrefactored application components
const smsVDP = Sega315_5124_Vdp;