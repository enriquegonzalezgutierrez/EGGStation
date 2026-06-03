/**
 * Project: EGGStation - Super Nintendo (SNES) Domain Layer
 * Component: SnesSystemBus (Motherboard Bus Aggregate Root - JIT Optimized)
 * Author: Enrique González Gutiérrez
 * 
 * ROLE:
 * Represents the main motherboard of the Super Nintendo. It acts as the central 
 * System Bus, routing memory accesses, managing DMA/HDMA channels, latching 
 * controller inputs, and synchronizing execution timings between CPU, PPU, and APU.
 * OPTIMIZED: Inlines access timing calculations inside read/write methods to
 * completely eliminate redundant function context calls and bit-shifting math.
 * 
 * SOLID Principles:
 * - SRP: Exclusively orchestrates component communication, memory maps, and DMA.
 * - DIP: Integrates modular SnesCpu, SnesPpu, SnesApu, and SnesCartridge instances.
 */

// Module-scoped Constants (Zero allocation, high performance lookups)

class SnesMotherboard {
    constructor() {
        // Instantiate decoupled subsystem entities
        this.mem = new SnesMemoryRouter(this);
        this.cpu = new SnesCpu(this);
        this.ppu = new SnesPpu(this);
        this.apu = new SnesApu(this);
        this.math = new SnesMathUnit();
        this.joypad = new SnesJoypad();

        // Standard 128KB Work RAM (WRAM)
        this.ram = new Uint8Array(0x20000);
        this.cart = undefined;

        // Calculate APU cycle ratio relative to Master Clock
        this.apuCyclesPerMaster = (32040 * 32) / (1364 * 262 * 60);

        this.dma = new SnesDma(this);
        this.clock = new SnesClock(this);

        this.reset();
    }

    /**
     * Complete motherboard and peripherals reset.
     */
    reset(hard = false) {
        if (hard) {
            this.ram.fill(0);
        }



        // Reset peripherals
        this.cpu.reset();
        this.ppu.reset();
        this.apu.reset();

        if (this.cart) {
            this.cart.reset(hard);
        }

        this.clock.reset();

        // Hardware CPU I/O Ports
        this.ramAdr = 0;

        // Joypad / Controllers auto-reading state
        this.joypad.reset();
        this.ppuLatch = true;

        // Arithmetic Registers
        this.math.reset();

        this.fastMem = false;

        // DMA & HDMA Controller
        this.dma.reset();

        this.openBus = 0;
        this.cpuMemOps = 0;
        this.cpuCyclesLeft = 0;
    }

    // ========================================================================
    // SYSTEM CYCLE SYNCHRONIZATION
    // ========================================================================

    /**
     * Steps the system clock for one master cycle.
     */
    cycle(noPpu) {
        this.clock.cycle(noPpu);
    }

    cpuCycle() {
        this.clock.cpuCycle();
    }

    catchUpApu() {
        this.clock.catchUpApu();
    }

    runFrame(noPpu) {
        this.clock.runFrame(noPpu);
    }

    // ========================================================================
    // HARDWARE I/O READ/WRITE BUS INTERFACES
    // ========================================================================





    readReg(adr) { return this.mem.readReg(adr); }
    writeReg(adr, value) { this.mem.writeReg(adr, value); }
    readBBus(adr) { return this.mem.readBBus(adr); }
    writeBBus(adr, value) { this.mem.writeBBus(adr, value); }
    rread(adr) { return this.mem.rread(adr); }
    read(adr, dma = false) { return this.mem.read(adr, dma); }
    write(adr, value, dma = false) { this.mem.write(adr, value, dma); }
    getAccessTime(adr) { return this.mem.getAccessTime(adr); }
}
window.SnesMotherboard = SnesMotherboard;
window.Snes = SnesMotherboard; // Backward Compatibility Alias