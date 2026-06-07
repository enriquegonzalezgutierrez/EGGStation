/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/cpu/z80/ZilogZ80.js
 * 
 * Infrastructure Layer: WASM Z80 CPU Adapter (Adapter Pattern with EM_JS mapping)
 * 
 * Role:
 * Bridges the legacy JavaScript orchestrators and debugger panels to the 
 * compiled C++ WebAssembly CPU binary. Delegates execution and register 
 * mapping transparently to prevent breaking existing codebases.
 */

class ZilogZ80 {
    /**
     * @param {Object} mmu - The abstract JavaScript system memory bus.
     */
    constructor(mmu) {
        this.mmu = mmu;
        this.theMMU = mmu; // Alias for legacy Z80Disassembler.js support

        this.clockRate = 3579545; // 3.58 MHz
        this.totCycles = 0;
        this.wasmInstance = null;
        this.isReady = false;

        // FIXED: Initializing empty legacy instruction tables to prevent 
        // the on-demand JS Disassembler (Z80Disassembler.js) from throwing 
        // "Uncaught TypeError: Cannot read properties of undefined" on UI refresh.
        this.unprefixedOpcodes = new Array(256);
        this.prefixcbOpcodes = new Array(256);
        this.prefixedOpcodes = new Array(256);
        this.prefixddOpcodes = new Array(256);
        this.prefixfdOpcodes = new Array(256);
        this.prefixddcbOpcodes = new Array(256);
        this.prefixfdcbOpcodes = new Array(256);

        // --- Registers Proxy Map (SOLID LSP alignment) ---
        // Dynamically queries the WASM linear memory so that the existing 
        // Debugger and Dev Mode panels can read/write registers without modification.
        this.registers = {
            get pc() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_pc() : 0; },
            set pc(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_pc(v); },
            get sp() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_sp() : 0; },
            set sp(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_sp(v); },
            get af() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_af() : 0; },
            set af(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_af(v); },
            get bc() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_bc() : 0; },
            set bc(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_bc(v); },
            get de() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_de() : 0; },
            set de(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_de(v); },
            get hl() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_hl() : 0; },
            set hl(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_hl(v); },
            get ix() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_ix() : 0; },
            set ix(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_ix(v); },
            get iy() { return window.activeCpuWasm ? window.activeCpuWasm._z80_get_iy() : 0; },
            set iy(v) { if (window.activeCpuWasm) window.activeCpuWasm._z80_set_iy(v); }
        };

        this.initializeWasm();
    }

    /**
     * Instantiates the compiled WebAssembly CPU binary and registers 
     * JIT-optimized direct memory access callbacks.
     */
    initializeWasm() {
        if (typeof ZilogZ80Wasm !== 'undefined') {
            
            // Register high-speed global callbacks directly onto the window object
            // to satisfy the EM_JS imports inside the WASM binary.
            window.activeCpuWasmBusRead = (addr) => this.mmu.readAddr(addr);
            window.activeCpuWasmBusWrite = (addr, val) => this.mmu.writeAddr(addr, val);
            window.activeCpuWasmPortRead = (port) => this.mmu.readPort(port);
            window.activeCpuWasmPortWrite = (port, val) => this.mmu.writePort(port, val);

            ZilogZ80Wasm().then(instance => {
                this.wasmInstance = instance;
                window.activeCpuWasm = instance;

                instance._z80_init();
                this.isReady = true;
                
                console.log("[ZilogZ80::JSAdapter] Native WASM CPU Core loaded and bound to System Bus.");
            });
        } else {
            console.error("[ZilogZ80::JSAdapter] Fatal: ZilogZ80Wasm binary factory is not loaded.");
        }
    }

    /**
     * Executes a single atomic fetch-decode-execute instruction step.
     */
    executeOne() {
        if (!this.isReady) {
            return 4; // Temporary fallback cycles while WASM modules are warming up
        }
        const cycles = this.wasmInstance._z80_execute_one();
        this.totCycles = this.wasmInstance._z80_get_cycles();
        return cycles;
    }

    raiseMaskableInterrupt() {
        if (this.isReady) {
            this.wasmInstance._z80_raise_interrupt();
        }
    }

    raiseNMI() {
        if (this.isReady) {
            this.wasmInstance._z80_raise_nmi();
        }
    }
}