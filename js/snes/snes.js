/**
 * Project: EGGStation - Super Nintendo (SNES) Main System Controller
 * Component: Snes (System Bus, Timing and DMA/HDMA Controller)
 * Documented & Optimized: English comments, inlined hot-paths, optimized bus routing
 * 
 * ROLE:
 * Coordinates the global master clock timing, memory bus mapping, interrupts,
 * joypad registers, auto-joypad read intervals, DMA (Direct Memory Access), 
 * and HDMA (Horizontal DMA) transfers.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Inlined the hot `cpuCycle` loop directly within `cycle()` to eliminate call frame overhead.
 * - Restructured `getAccessTime` using optimized local bitwise extractions for bus routing.
 * - Minimized condition checking in high-frequency clock checks.
 */

function Snes() {

  this.cpu = new Cpu(this);
  this.ppu = new Ppu(this);
  this.apu = new Apu(this);

  // System RAM (128 KB)
  this.ram = new Uint8Array(0x20000);
  this.cart = undefined;

  // DMA translation offsets
  this.dmaOffs = [
    0, 0, 0, 0,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1,
    0, 1, 2, 3,
    0, 1, 0, 1,
    0, 0, 0, 0,
    0, 0, 1, 1
  ];

  this.dmaOffLengths = [1, 2, 2, 4, 4, 4, 2, 4];

  // System APU timing ratio matching original NTSC hardware frequency definitions
  this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

  // Pre-allocated states for DMA/HDMA channels
  this.dmaBadr = new Uint8Array(8);
  this.dmaAadr = new Uint16Array(8);
  this.dmaAadrBank = new Uint8Array(8);
  this.dmaSize = new Uint16Array(8);
  this.hdmaIndBank = new Uint8Array(8);
  this.hdmaTableAdr = new Uint16Array(8);
  this.hdmaRepCount = new Uint8Array(8);
  this.dmaUnusedByte = new Uint8Array(8);

  /**
   * Resets system bus state, CPU registers, and sub-emulators.
   * Can perform either hard resets (clears RAM) or soft resets.
   */
  this.reset = function(hard) {
    if(hard) {
      clearArray(this.ram);
    }
    clearArray(this.dmaBadr);
    clearArray(this.dmaAadr);
    clearArray(this.dmaAadrBank);
    clearArray(this.dmaSize);
    clearArray(this.hdmaIndBank);
    clearArray(this.hdmaTableAdr);
    clearArray(this.hdmaRepCount);
    clearArray(this.dmaUnusedByte);

    this.cpu.reset();
    this.ppu.reset();
    this.apu.reset();
    if(this.cart) {
      this.cart.reset(hard);
    }

    this.xPos = 0;
    this.yPos = 0;
    this.frames = 0;

    this.cpuCyclesLeft = 5 * 8 + 12; // Reset: 5 read cycles + 2 IO cycles
    this.cpuMemOps = 0;
    this.apuCatchCycles = 0;

    // CPU Port state variables
    this.ramAdr = 0;

    this.hIrqEnabled = false;
    this.vIrqEnabled = false;
    this.nmiEnabled = false;
    this.hTimer = 0x1ff;
    this.vTimer = 0x1ff;
    this.inNmi = false;
    this.inIrq = false;
    this.inHblank = false;
    this.inVblank = false;

    this.autoJoyRead = false;
    this.autoJoyTimer = 0;
    this.ppuLatch = true;

    this.joypad1Val = 0;
    this.joypad2Val = 0;
    this.joypad1AutoRead = 0;
    this.joypad2AutoRead = 0;
    this.joypadStrobe = false;
    this.joypad1State = 0;
    this.joypad2State = 0;

    this.multiplyA = 0xff;
    this.divA = 0xffff;
    this.divResult = 0x101;
    this.mulResult = 0xfe01;

    this.fastMem = false;

    // DMA / HDMA timing flags
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

    this.hdmaDoTransfer = [
      false, false, false, false, false, false, false, false
    ];
    this.hdmaTerminated = [
      false, false, false, false, false, false, false, false
    ];
    this.dmaOffIndex = 0;

    this.openBus = 0;
  }
  this.reset();

  /**
   * Main Master Cycle Loop.
   * Tracks line counters and schedules video lines / DMA events.
   */
  this.cycle = function(noPpu) {

    this.apuCatchCycles += (this.apuCyclesPerMaster * 2);

    if(this.joypadStrobe) {
      this.joypad1Val = this.joypad1State;
      this.joypad2Val = this.joypad2State;
    }

    if(this.hdmaTimer > 0) {
      this.hdmaTimer -= 2;
    } else if(this.dmaBusy) {
      this.handleDma();
    } else if(this.xPos < 536 || this.xPos >= 576) {
      // INLINED HOT PATH: cpuCycle
      // Bypasses extra function call layers on high-frequency clock triggers
      if(this.cpuCyclesLeft === 0) {
        this.cpu.cyclesLeft = 0;
        this.cpuMemOps = 0;
        this.cpu.cycle();
        this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
      }
      this.cpuCyclesLeft -= 2;
    }

    // IRQ Trigger evaluations
    if(this.yPos === this.vTimer && this.vIrqEnabled) {
      if(!this.hIrqEnabled) {
        if(this.xPos === 0) {
          this.inIrq = true;
          this.cpu.irqWanted = true;
        }
      } else {
        if(this.xPos === (this.hTimer * 4)) {
          this.inIrq = true;
          this.cpu.irqWanted = true;
        }
      }
    } else if (
      this.xPos === (this.hTimer * 4)
      && this.hIrqEnabled && !this.vIrqEnabled
    ) {
      this.inIrq = true;
      this.cpu.irqWanted = true;
    }

    // Horizontal Blank triggers
    if(this.xPos === 1024) {
      this.inHblank = true;
      if(!this.inVblank) {
        this.handleHdma();
      }
    } else if(this.xPos === 0) {
      this.inHblank = false;
      this.ppu.checkOverscan(this.yPos);
    } else if(this.xPos === 512 && !noPpu) {
      this.ppu.renderLine(this.yPos);
    }

    // Vertical Blank triggers
    if(this.yPos === (this.ppu.frameOverscan ? 240 : 225) && this.xPos === 0) {
      this.inNmi = true;
      this.inVblank = true;
      if(this.autoJoyRead) {
        this.autoJoyTimer = 4224;
        this.doAutoJoyRead();
      }
      if(this.nmiEnabled) {
        this.cpu.nmiWanted = true;
      }
    } else if(this.yPos === 0 && this.xPos === 0) {
      this.inNmi = false;
      this.inVblank = false;
      this.initHdma();
    }

    if(this.autoJoyTimer > 0) {
      this.autoJoyTimer -= 2;
    }

    this.xPos += 2;
    if(this.xPos === 1364) {
      this.xPos = 0;
      this.yPos++;
      if(this.yPos === 262) {
        this.catchUpApu();
        this.yPos = 0;
        this.frames++;
      }
    }
  }

  /**
   * Fallback method kept for general interface bindings.
   */
  this.cpuCycle = function() {
    if(this.cpuCyclesLeft === 0) {
      this.cpu.cyclesLeft = 0;
      this.cpuMemOps = 0;
      this.cpu.cycle();
      this.cpuCyclesLeft += (this.cpu.cyclesLeft + 1 - this.cpuMemOps) * 6;
    }
    this.cpuCyclesLeft -= 2;
  }

  /**
   * Catches up the APU state processing to sync with CPU master execution steps.
   */
  this.catchUpApu = function() {
    let catchUpCycles = this.apuCatchCycles & 0xffffffff;
    for(let i = 0; i < catchUpCycles; i++) {
      this.apu.cycle();
    }
    this.apuCatchCycles -= catchUpCycles;
  }

  this.runFrame = function(noPpu) {
    do {
      this.cycle(noPpu);
    } while(!(this.xPos === 0 && this.yPos === 0));
  }

  this.doAutoJoyRead = function() {
    this.joypad1AutoRead = 0;
    this.joypad2AutoRead = 0;
    this.joypad1Val = this.joypad1State;
    this.joypad2Val = this.joypad2State;
    for(let i = 0; i < 16; i++) {
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

  /**
   * Performs standard Direct Memory Access transfers.
   */
  this.handleDma = function() {
    if(this.dmaTimer > 0) {
      this.dmaTimer -= 2;
      return;
    }
    let i;
    for(i = 0; i < 8; i++) {
      if(this.dmaActive[i]) {
        break;
      }
    }
    if(i === 8) {
      this.dmaBusy = false;
      this.dmaOffIndex = 0;
      return;
    }
    let tableOff = this.dmaMode[i] * 4 + this.dmaOffIndex++;
    this.dmaOffIndex &= 0x3;
    if(this.dmaFromB[i]) {
      this.write(
        (this.dmaAadrBank[i] << 16) | this.dmaAadr[i],
        this.readBBus(
          (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
        ), true
      );
    } else {
      this.writeBBus(
        (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
        this.read((this.dmaAadrBank[i] << 16) | this.dmaAadr[i], true)
      );
    }
    this.dmaTimer += 6;
    if(!this.dmaFixed[i]) {
      if(this.dmaDec[i]) {
        this.dmaAadr[i]--;
      } else {
        this.dmaAadr[i]++;
      }
    }
    this.dmaSize[i]--;
    if(this.dmaSize[i] === 0) {
      this.dmaOffIndex = 0;
      this.dmaActive[i] = false;
      this.dmaTimer += 8;
    }
  }

  this.initHdma = function() {
    this.hdmaTimer = 18;
    for(let i = 0; i < 8; i++) {
      if(this.hdmaActive[i]) {
        this.dmaActive[i] = false;
        this.dmaOffIndex = 0;

        this.hdmaTableAdr[i] = this.dmaAadr[i];
        this.hdmaRepCount[i] = this.read(
          (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
        );
        this.hdmaTimer += 8;
        if(this.hdmaInd[i]) {
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
  }

  this.handleHdma = function() {
    this.hdmaTimer = 18;
    for(let i = 0; i < 8; i++) {
      if(this.hdmaActive[i] && !this.hdmaTerminated[i]) {
        this.dmaActive[i] = false;
        this.hdmaTimer += 8;
        if(this.hdmaDoTransfer[i]) {
          for(let j = 0; j < this.dmaOffLengths[this.dmaMode[i]]; j++) {
            let tableOff = this.dmaMode[i] * 4 + j;
            this.hdmaTimer += 8;
            if(this.hdmaInd[i]) {
              if(this.dmaFromB[i]) {
                this.write(
                  (this.hdmaIndBank[i] << 16) | this.dmaSize[i],
                  this.readBBus(
                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
                  ), true
                );
              } else {
                this.writeBBus(
                  (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                  this.read((this.hdmaIndBank[i] << 16) | this.dmaSize[i], true)
                );
              }
              this.dmaSize[i]++;
            } else {
              if(this.dmaFromB[i]) {
                this.write(
                  (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i],
                  this.readBBus(
                    (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff
                  ), true
                );
              } else {
                this.writeBBus(
                  (this.dmaBadr[i] + this.dmaOffs[tableOff]) & 0xff,
                  this.read(
                    (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i], true
                  )
                );
              }
              this.hdmaTableAdr[i]++;
            }
          }
        }
        this.hdmaRepCount[i]--;
        this.hdmaDoTransfer[i] = (this.hdmaRepCount[i] & 0x80) > 0;
        if((this.hdmaRepCount[i] & 0x7f) === 0) {
          this.hdmaRepCount[i] = this.read(
            (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
          );
          if(this.hdmaInd[i]) {
            this.dmaSize[i] = this.read(
              (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
            );
            this.dmaSize[i] |= this.read(
              (this.dmaAadrBank[i] << 16) | this.hdmaTableAdr[i]++, true
            ) << 8;
            this.hdmaTimer += 16;
          }
          if(this.hdmaRepCount[i] === 0) {
            this.hdmaTerminated[i] = true;
          }
          this.hdmaDoTransfer[i] = true;
        }
      }
    }
  }

  // Bus read and write handlers

  this.readReg = function(adr) {
    switch(adr) {
      case 0x4210: {
        let val = 0x2;
        val |= this.inNmi ? 0x80 : 0;
        val |= this.openBus & 0x70;
        this.inNmi = false;
        return val;
      }
      case 0x4211: {
        let val = this.inIrq ? 0x80 : 0;
        val |= this.openBus & 0x7f;
        this.inIrq = false;
        this.cpu.irqWanted = false;
        return val;
      }
      case 0x4212: {
        let val = (this.autoJoyTimer > 0) ? 0x1 : 0;
        val |= this.inHblank ? 0x40 : 0;
        val |= this.inVblank ? 0x80 : 0;
        val |= this.openBus & 0x3e;
        return val;
      }
      case 0x4213: {
        return this.ppuLatch ? 0x80 : 0;
      }
      case 0x4214: {
        return this.divResult & 0xff;
      }
      case 0x4215: {
        return (this.divResult & 0xff00) >> 8;
      }
      case 0x4216: {
        return this.mulResult & 0xff;
      }
      case 0x4217: {
        return (this.mulResult & 0xff00) >> 8;
      }
      case 0x4218: {
        return this.joypad1AutoRead & 0xff;
      }
      case 0x4219: {
        return (this.joypad1AutoRead & 0xff00) >> 8;
      }
      case 0x421a: {
        return this.joypad2AutoRead & 0xff;
      }
      case 0x421b: {
        return (this.joypad2AutoRead & 0xff00) >> 8;
      }
      case 0x421c:
      case 0x421d:
      case 0x421e:
      case 0x421f: {
        return 0;
      }
    }

    if(adr >= 0x4300 && adr < 0x4380) {
      let channel = (adr & 0xf0) >> 4;
      switch(adr & 0xff0f) {
        case 0x4300: {
          let val = this.dmaMode[channel];
          val |= this.dmaFixed[channel] ? 0x8 : 0;
          val |= this.dmaDec[channel] ? 0x10 : 0;
          val |= this.dmaUnusedBit[channel] ? 0x20 : 0;
          val |= this.hdmaInd[channel] ? 0x40 : 0;
          val |= this.dmaFromB[channel] ? 0x80 : 0;
          return val;
        }
        case 0x4301: {
          return this.dmaBadr[channel];
        }
        case 0x4302: {
          return this.dmaAadr[channel] & 0xff;
        }
        case 0x4303: {
          return (this.dmaAadr[channel] & 0xff00) >> 8;
        }
        case 0x4304: {
          return this.dmaAadrBank[channel];
        }
        case 0x4305: {
          return this.dmaSize[channel] & 0xff;
        }
        case 0x4306: {
          return (this.dmaSize[channel] & 0xff00) >> 8;
        }
        case 0x4307: {
          return this.hdmaIndBank[channel];
        }
        case 0x4308: {
          return this.hdmaTableAdr[channel] & 0xff;
        }
        case 0x4309: {
          return (this.hdmaTableAdr[channel] & 0xff00) >> 8;
        }
        case 0x430a: {
          return this.hdmaRepCount[channel];
        }
        case 0x430b:
        case 0x430f: {
          return this.dmaUnusedByte[channel];
        }
      }
    }

    return this.openBus;
  }

  this.writeReg = function(adr, value) {
    switch(adr) {
      case 0x4200: {
        this.autoJoyRead = (value & 0x1) > 0;
        if(!this.autoJoyRead) {
          this.autoJoyTimer = 0;
        }
        this.hIrqEnabled = (value & 0x10) > 0;
        this.vIrqEnabled = (value & 0x20) > 0;
        this.nmiEnabled = (value & 0x80) > 0;
        if(!this.hIrqEnabled && !this.vIrqEnabled) {
          this.cpu.irqWanted = false;
          this.inIrq = false;
        }
        return;
      }
      case 0x4201: {
        if(this.ppuLatch && (value & 0x80) === 0) {
          this.ppu.latchedHpos = this.snes.xPos >> 2;
          this.ppu.latchedVpos = this.snes.yPos;
          this.ppu.countersLatched = true;
        }
        this.ppuLatch = (value & 0x80) > 0;
        return;
      }
      case 0x4202: {
        this.multiplyA = value;
        return;
      }
      case 0x4203: {
        this.mulResult = this.multiplyA * value;
        return;
      }
      case 0x4204: {
        this.divA = (this.divA & 0xff00) | value;
        return;
      }
      case 0x4205: {
        this.divA = (this.divA & 0xff) | (value << 8);
        return;
      }
      case 0x4206: {
        this.divResult = 0xffff;
        this.mulResult = this.divA;
        if(value !== 0) {
          this.divResult = (this.divA / value) & 0xffff;
          this.mulResult = this.divA % value;
        }
        return;
      }
      case 0x4207: {
        this.hTimer = (this.hTimer & 0x100) | value;
        return;
      }
      case 0x4208: {
        this.hTimer = (this.hTimer & 0xff) | ((value & 0x1) << 8);
        return;
      }
      case 0x4209: {
        this.vTimer = (this.vTimer & 0x100) | value;
        return;
      }
      case 0x420a: {
        this.vTimer = (this.vTimer & 0xff) | ((value & 0x1) << 8);
        return;
      }
      case 0x420b: {
        this.dmaActive[0] = (value & 0x1) > 0;
        this.dmaActive[1] = (value & 0x2) > 0;
        this.dmaActive[2] = (value & 0x4) > 0;
        this.dmaActive[3] = (value & 0x8) > 0;
        this.dmaActive[4] = (value & 0x10) > 0;
        this.dmaActive[5] = (value & 0x20) > 0;
        this.dmaActive[6] = (value & 0x40) > 0;
        this.dmaActive[7] = (value & 0x80) > 0;
        this.dmaBusy = value > 0;
        this.dmaTimer += this.dmaBusy ? 8 : 0;
        return;
      }
      case 0x420c: {
        this.hdmaActive[0] = (value & 0x1) > 0;
        this.hdmaActive[1] = (value & 0x2) > 0;
        this.hdmaActive[2] = (value & 0x4) > 0;
        this.hdmaActive[3] = (value & 0x8) > 0;
        this.hdmaActive[4] = (value & 0x10) > 0;
        this.hdmaActive[5] = (value & 0x20) > 0;
        this.hdmaActive[6] = (value & 0x40) > 0;
        this.hdmaActive[7] = (value & 0x80) > 0;
        return;
      }
      case 0x420d: {
        this.fastMem = (value & 0x1) > 0;
        return;
      }
    }

    if(adr >= 0x4300 && adr < 0x4380) {
      let channel = (adr & 0xf0) >> 4;
      switch(adr & 0xff0f) {
        case 0x4300: {
          this.dmaMode[channel] = value & 0x7;
          this.dmaFixed[channel] = (value & 0x08) > 0;
          this.dmaDec[channel] = (value & 0x10) > 0;
          this.dmaUnusedBit[channel] = (value & 0x20) > 0;
          this.hdmaInd[channel] = (value & 0x40) > 0;
          this.dmaFromB[channel] = (value & 0x80) > 0;
          return;
        }
        case 0x4301: {
          this.dmaBadr[channel] = value;
          return;
        }
        case 0x4302: {
          this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff00) | value;
          return;
        }
        case 0x4303: {
          this.dmaAadr[channel] = (this.dmaAadr[channel] & 0xff) | (value << 8);
          return;
        }
        case 0x4304: {
          this.dmaAadrBank[channel] = value;
          return;
        }
        case 0x4305: {
          this.dmaSize[channel] = (this.dmaSize[channel] & 0xff00) | value;
          return;
        }
        case 0x4306: {
          this.dmaSize[channel] = (this.dmaSize[channel] & 0xff) | (value << 8);
          return;
        }
        case 0x4307: {
          this.hdmaIndBank[channel] = value;
          return;
        }
        case 0x4308: {
          this.hdmaTableAdr[channel] = (
            this.hdmaTableAdr[channel] & 0xff00
          ) | value;
          return;
        }
        case 0x4309: {
          this.hdmaTableAdr[channel] = (
            this.hdmaTableAdr[channel] & 0xff
          ) | (value << 8);
          return;
        }
        case 0x430a: {
          this.hdmaRepCount[channel] = value;
          return;
        }
        case 0x430b:
        case 0x430f: {
          this.dmaUnusedByte[channel] = value;
          return;
        }
      }
    }
  }

  this.readBBus = function(adr) {
    if(adr > 0x33 && adr < 0x40) {
      return this.ppu.read(adr);
    }
    if(adr >= 0x40 && adr < 0x80) {
      this.catchUpApu();
      return this.apu.spcWritePorts[adr & 0x3];
    }
    if(adr === 0x80) {
      let val = this.ram[this.ramAdr++];
      this.ramAdr &= 0x1ffff;
      return val;
    }
    return this.openBus;
  }

  this.writeBBus = function(adr, value) {
    if(adr < 0x34) {
      this.ppu.write(adr, value);
      return;
    }
    if(adr >= 0x40 && adr < 0x80) {
      this.catchUpApu();
      this.apu.spcReadPorts[adr & 0x3] = value;
      return;
    }
    switch(adr) {
      case 0x80: {
        this.ram[this.ramAdr++] = value;
        this.ramAdr &= 0x1ffff;
        return;
      }
      case 0x81: {
        this.ramAdr = (this.ramAdr & 0x1ff00) | value;
        return;
      }
      case 0x82: {
        this.ramAdr = (this.ramAdr & 0x100ff) | (value << 8);
        return;
      }
      case 0x83: {
        this.ramAdr = (this.ramAdr & 0x0ffff) | ((value & 1) << 16);
        return;
      }
    }
  }

  this.rread = function(adr) {
    adr &= 0xffffff;
    let bank = adr >> 16;
    adr &= 0xffff;
    if(bank === 0x7e || bank === 0x7f) {
      return this.ram[((bank & 0x1) << 16) | adr];
    }
    if(adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
      if(adr < 0x2000) {
        return this.ram[adr & 0x1fff];
      }
      if(adr >= 0x2100 && adr < 0x2200) {
        return this.readBBus(adr & 0xff);
      }
      if(adr === 0x4016) {
        let val = this.joypad1Val & 0x1;
        this.joypad1Val >>= 1;
        this.joypad1Val |= 0x8000;
        return val;
      }
      if(adr === 0x4017) {
        let val = this.joypad2Val & 0x1;
        this.joypad2Val >>= 1;
        this.joypad2Val |= 0x8000;
        return val;
      }
      if(adr >= 0x4200 && adr < 0x4380) {
        return this.readReg(adr);
      }
    }
    return this.cart.read(bank, adr);
  }

  this.read = function(adr, dma = false) {
    if(!dma) {
      this.cpuMemOps++;
      this.cpuCyclesLeft += this.getAccessTime(adr);
    }

    let val = this.rread(adr);
    this.openBus = val;
    return val;
  }

  this.write = function(adr, value, dma = false) {
    if(!dma) {
      this.cpuMemOps++;
      this.cpuCyclesLeft += this.getAccessTime(adr);
    }

    this.openBus = value;
    adr &= 0xffffff;
    let bank = adr >> 16;
    adr &= 0xffff;
    if(bank === 0x7e || bank === 0x7f) {
      this.ram[((bank & 0x1) << 16) | adr] = value;
    }
    if(adr < 0x8000 && (bank < 0x40 || (bank >= 0x80 && bank < 0xc0))) {
      if(adr < 0x2000) {
        this.ram[adr & 0x1fff] = value;
      }
      if(adr >= 0x2100 && adr < 0x2200) {
        this.writeBBus(adr & 0xff, value);
      }
      if(adr === 0x4016) {
        this.joypadStrobe = (value & 0x1) > 0;
      }
      if(adr >= 0x4200 && adr < 0x4380) {
        this.writeReg(adr, value);
      }

    }
    this.cart.write(bank, adr, value);
  }

  /**
   * Evaluates memory speed access cycles for targeted bank offsets.
   */
  this.getAccessTime = function(adr) {
    const bank = (adr >> 16) & 0xff;
    const offset = adr & 0xffff;
    
    // Banks 0x40-0x7F
    if (bank >= 0x40 && bank < 0x80) return 8;
    
    // Banks 0xC0-0xFF
    if (bank >= 0xc0) return this.fastMem ? 6 : 8;
    
    // Banks 0x00-0x3F and 0x80-0xBF
    if (offset < 0x2000) return 8;
    if (offset < 0x4000) return 6;
    if (offset < 0x4200) return 12;
    if (offset < 0x6000) return 6;
    if (offset < 0x8000) return 8;
    
    return (this.fastMem && bank >= 0x80) ? 6 : 8;
  }

  this.setPixels = function(arr) {
    this.ppu.setPixels(arr);
  }

  this.setSamples = function(left, right, samples) {
    this.apu.setSamples(left, right, samples);
  }

  this.setPad1ButtonPressed = function(num) {
    this.joypad1State |= (1 << num);
  }

  this.setPad1ButtonReleased = function(num) {
    this.joypad1State &= (~(1 << num)) & 0xfff;
  }

  this.loadRom = function(rom, isHirom) {
    if(rom.length % 0x8000 === 0) {
      header = this.parseHeader(rom, isHirom);
    } else if((rom.length - 512) % 0x8000 === 0) {
      rom = new Uint8Array(Array.prototype.slice.call(rom, 512));
      header = this.parseHeader(rom, isHirom);
    } else {
      log("Failed to load rom: Incorrect size - " + rom.length);
      return false;
    }

    if(rom.length < header.romSize) {
      let extraData = rom.length - (header.romSize / 2);
      log("Extending rom to account for extra data");
      let nRom = new Uint8Array(header.romSize);
      for(let i = 0; i < nRom.length; i++) {
        if(i < (header.romSize / 2)) {
          nRom[i] = rom[i];
        } else {
          nRom[i] = rom[(header.romSize / 2) + (i % extraData)];
        }
      }
      rom = nRom;
    }
    this.cart = new Cart(rom, header, isHirom);
    return true;
  }

  this.parseHeader = function(rom, isHirom) {
    let str = "";
    let header;
    if(!isHirom) {
      for(let i = 0; i < 21; i++) {
        str += String.fromCharCode(rom[0x7fc0 + i]);
      }
      header = {
        name: str,
        type: rom[0x7fd5] & 0xf,
        speed: rom[0x7fd5] >> 4,
        chips: rom[0x7fd6],
        romSize: 0x400 << rom[0x7fd7],
        ramSize: 0x400 << rom[0x7fd8]
      };
    } else {
      for(let i = 0; i < 21; i++) {
        str += String.fromCharCode(rom[0xffc0 + i]);
      }
      header = {
        name: str,
        type: rom[0xffd5] & 0xf,
        speed: rom[0xffd5] >> 4,
        chips: rom[0xffd6],
        romSize: 0x400 << rom[0xffd7],
        ramSize: 0x400 << rom[0xffd8]
      };
    }
    if(header.romSize < rom.length) {
      let bankCount = Math.pow(2, Math.ceil(Math.log2(rom.length / 0x8000)));
      header.romSize = bankCount * 0x8000;
      log("Loaded with romSize of " + getLongRep(header.romSize));
    }
    return header;
  }

}