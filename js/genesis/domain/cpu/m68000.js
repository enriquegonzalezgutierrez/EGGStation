/**
 * Project: EGGStation - Sega Genesis / Mega Drive Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Motorola 68000 CPU Orchestrator (With High-Fidelity Diagnostics)
 * 
 * Manages CPU register states, exception handling, interrupt masks, 
 * and delegates instruction execution to decoupled specialized modules.
 * Fully aligned with MDTracer reference standards to ensure 100% address 
 * resolution accuracy across all 12 native hardware addressing modes.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates register state preservation 
 *   and instruction dispatching from individual instruction implementations.
 * - Open/Closed Principle (OCP): New instruction groups can be added by registering 
 *   them into the dispatch table without changing the CPU core file.
 */

class M68000 {
    /**
     * @param {GenesisBusM68k} bus - The primary M68K memory bus.
     */
    constructor(bus) {
        this.bus = bus;

        // --- 1. 16/32-bit Internal CPU Registers ---
        this.d = new Int32Array(8);   // Data registers (D0 - D7)
        this.a = new Int32Array(8);   // Address registers (A0 - A7)
        
        this.pc = 0;                  // Program Counter (24-bit active address)
        this.sr = 0x2700;             // Status Register (System byte & CCR byte)
        
        // Stack Pointers (A7 is mapped to either USP or SSP depending on SR supervisor bit)
        this.usp = 0;                 // User Stack Pointer
        this.ssp = 0xdff0;            // Supervisor Stack Pointer (Default RAM limits)

        // Internals for pipeline execution
        this.cyclesRemaining = 0;
        this.irqPending = 0;          // Latched IRQ interrupt level (0 to 7)

        // Condition Code Register (CCR) status flags unpacked for high-speed bit math
        this.fN = 0; // Negative
        this.fZ = 1; // Zero
        this.fV = 0; // Overflow
        this.fC = 0; // Carry
        this.fX = 0; // Extend

        // Unified 16-bit sparse instruction dispatch table (65,536 execution slots)
        this.opcodeTable = new Array(65536).fill(null);

        this.instructionTelemetryCount = 0;
        this.isHalted = false; // CPU Halt state
    }

    /**
     * Public registration interface allowing external modules to map their instructions
     * onto the dispatch table, avoiding load-order issues during browser script initialization.
     * @param {Function} registrationCallback - M68k class registration function.
     */
    registerModule(registrationCallback) {
        if (typeof registrationCallback === 'function') {
            registrationCallback(this, this.opcodeTable);
        }
    }

    /**
     * Cold-boots the processor, latching starting PC and SSP values from ROM.
     */
    reset() {
        this.d.fill(0);
        this.a.fill(0);
        
        this.sr = 0x2700; // Supervisor mode active, interrupts masked up to level 7
        this.usp = 0;
        this.ssp = 0xdff0;
        this.cyclesRemaining = 0;
        this.irqPending = 0;
        this.instructionTelemetryCount = 0;
        this.isHalted = false;

        this.fN = 0;
        this.fZ = 1;
        this.fV = 0;
        this.fC = 0;
        this.fX = 0;

        if (this.bus) {
            const sspHigh = this.bus.readWord(0x000000, 0) & 0xFFFF;
            const sspLow = this.bus.readWord(0x000002, 0) & 0xFFFF;
            this.ssp = ((sspHigh << 16) | sspLow) >>> 0;

            const pcHigh = this.bus.readWord(0x000004, 0) & 0xFFFF;
            const pcLow = this.bus.readWord(0x000006, 0) & 0xFFFF;
            this.pc = ((pcHigh << 16) | pcLow) & 0xFFFFFF;
            
            this.a[7] = this.ssp; // Map A7 to SSP on boot

            console.log(`%c[M68000::Reset] Bootstrap Vectors Loaded.`, "color: #ff007f; font-weight: bold;");
            console.log(`[M68000::Reset] SSP (Stack Pointer): 0x${this.ssp.toString(16).toUpperCase().padStart(8, '0')}`);
            console.log(`[M68000::Reset] PC (Program Counter): 0x${this.pc.toString(16).toUpperCase().padStart(8, '0')}`);
        }
    }

    /**
     * Packs the internal unpacked flag states back into the CCR Status Register byte.
     * @returns {number} CCR status bits
     */
    getCCR() {
        return (this.fX << 4) | (this.fN << 3) | (this.fZ << 2) | (this.fV << 1) | this.fC;
    }

    /**
     * Unpacks the CCR Status Register byte into high-speed internal properties.
     * @param {number} ccr - CCR status bits
     */
    setCCR(ccr) {
        this.fX = (ccr >> 4) & 1;
        this.fN = (ccr >> 3) & 1;
        this.fZ = (ccr >> 2) & 1;
        this.fV = (ccr >> 1) & 1;
        this.fC = ccr & 1;
    }

    /**
     * Toggles Active Stack Pointer depending on the Status Register's Supervisor Bit (bit 13).
     * @param {number} newSr - New packed Status Register value
     */
    syncStackPointers(newSr) {
        const oldSupervisor = (this.sr & 0x2000) !== 0;
        const newSupervisor = (newSr & 0x2000) !== 0;

        if (oldSupervisor !== newSupervisor) {
            if (oldSupervisor) {
                this.ssp = this.a[7];
                this.a[7] = this.usp;
            } else {
                this.usp = this.a[7];
                this.a[7] = this.ssp;
            }
        }
        this.sr = newSr & 0xFFFF;
        this.setCCR(this.sr & 0xFF);
    }

    /**
     * Pushes a 32-bit longword onto the active system stack.
     * @param {number} value - 32-bit data longword
     */
    pushLong(value) {
        this.a[7] = (this.a[7] - 4) & 0xFFFFFF;
        this.bus.writeWord(this.a[7], (value >> 16) & 0xFFFF, 0xFFFF, this.pc);
        this.bus.writeWord(this.a[7] + 2, value & 0xFFFF, 0xFFFF, this.pc);
    }

    /**
     * Pops a 32-bit longword from the active system stack.
     * @returns {number} 32-bit popped data longword
     */
    popLong() {
        const high = this.bus.readWord(this.a[7], this.pc) & 0xFFFF;
        const low = this.bus.readWord(this.a[7] + 2, this.pc) & 0xFFFF;
        this.a[7] = (this.a[7] + 4) & 0xFFFFFF;
        return ((high << 16) | low) >>> 0;
    }

    /**
     * Triggers a synchronous hardware exception (e.g. traps, interrupts, resets).
     * @param {number} vector - Target vector index from CPU vector table
     */
    triggerException(vector) {
        const prevSr = (this.sr & 0xFF00) | this.getCCR();
        
        // Force Supervisor Mode (bit 13) and clear trace bits (bits 14-15)
        let newSr = (this.sr | 0x2000) & ~0xC000;

        // Autovectored interrupts (levels 1-7, mapped to vectors 25-31)
        // Correctly set the interrupt mask inside SR to block same or lower priority IRQs
        if (vector >= 25 && vector <= 31) {
            const irqLevel = vector - 24;
            newSr = (newSr & ~0x0700) | (irqLevel << 8);
        }

        this.syncStackPointers(newSr);

        // Push program status on Stack
        this.pushLong(this.pc);
        this.a[7] = (this.a[7] - 2) & 0xFFFFFF;
        this.bus.writeWord(this.a[7], prevSr, 0xFFFF, this.pc);

        // Fetch target vector address from vector table mapping
        const vectorAddr = vector * 4;
        const high = this.bus.readWord(vectorAddr, 0) & 0xFFFF;
        const low = this.bus.readWord(vectorAddr + 2, 0) & 0xFFFF;
        this.pc = ((high << 16) | low) & 0xFFFFFF;
        
        this.cyclesRemaining -= 34; // standard exception penalty cycles
    }

    // ========================================================================
    // HIGH-PERFORMANCE EFFECTIVE ADDRESS (EA) RESOLVER (100% ISA COMPLETE)
    // ========================================================================

    resolveEA(mode, reg, size) {
        switch (mode) {
            case 0: return -1 - reg; // Data Register Direct
            case 1: return -9 - reg; // Address Register Direct
            case 2: return this.a[reg] & 0xFFFFFF; // Address Register Indirect
            case 3: { // Address Register Indirect with Post-increment
                const addr = this.a[reg] & 0xFFFFFF;
                const step = size === 1 ? (reg === 7 ? 2 : 1) : (size === 2 ? 2 : 4);
                this.a[reg] = (this.a[reg] + step) & 0xFFFFFF;
                return addr;
            }
            case 4: { // Address Register Indirect with Pre-decrement
                const step = size === 1 ? (reg === 7 ? 2 : 1) : (size === 2 ? 2 : 4);
                this.a[reg] = (this.a[reg] - step) & 0xFFFFFF;
                return this.a[reg];
            }
            case 5: { // Address Register Indirect with 16-bit Displacement
                const d16 = (this.bus.readWord(this.pc, this.pc) << 16) >> 16; // Sign-extended
                this.pc = (this.pc + 2) & 0xFFFFFF;
                return (this.a[reg] + d16) & 0xFFFFFF;
            }
            case 6: { // Address Register Indirect with Index 8-bit Displacement (Brief Extension)
                const extension = this.bus.readWord(this.pc, this.pc) & 0xFFFF;
                this.pc = (this.pc + 2) & 0xFFFFFF;
                const d8 = (extension << 24) >> 24; // Sign-extended 8-bit displacement
                const indexRegVal = (extension & 0x8000) ? this.a[(extension >> 12) & 7] : this.d[(extension >> 12) & 7];
                const indexVal = (extension & 0x0800) ? indexRegVal : ((indexRegVal << 16) >> 16); // Long vs Word index size
                return (this.a[reg] + indexVal + d8) & 0xFFFFFF;
            }
            case 7: { // Absolute / Immediate / PC-Relative Modes
                switch (reg) {
                    case 0: { // Absolute Short (16-bit)
                        const addr = (this.bus.readWord(this.pc, this.pc) << 16) >> 16;
                        this.pc = (this.pc + 2) & 0xFFFFFF;
                        return addr & 0xFFFFFF;
                    }
                    case 1: { // Absolute Long (32-bit)
                        const high = this.bus.readWord(this.pc, this.pc);
                        const low = this.bus.readWord(this.pc + 2, this.pc);
                        this.pc = (this.pc + 4) & 0xFFFFFF;
                        return ((high << 16) | low) & 0xFFFFFF;
                    }
                    case 2: { // Program Counter Indirect with 16-bit Displacement
                        const d16 = (this.bus.readWord(this.pc, this.pc) << 16) >> 16;
                        const pcBase = this.pc;
                        this.pc = (this.pc + 2) & 0xFFFFFF;
                        return (pcBase + d16) & 0xFFFFFF;
                    }
                    case 3: { // Program Counter Indirect with Index (Aligned with MDTracer Case 10)
                        const extension = this.bus.readWord(this.pc, this.pc) & 0xFFFF;
                        const pcBase = this.pc;
                        this.pc = (this.pc + 2) & 0xFFFFFF;

                        const d8 = (extension << 24) >> 24; // Sign-extended 8-bit displacement
                        const indexRegVal = (extension & 0x8000) ? this.a[(extension >> 12) & 7] : this.d[(extension >> 12) & 7];
                        const indexVal = (extension & 0x0800) ? indexRegVal : ((indexRegVal << 16) >> 16);

                        return (pcBase + indexVal + d8) & 0xFFFFFF;
                    }
                    case 4: { // Immediate Mode
                        const immOffset = this.pc;
                        const step = size === 3 ? 4 : 2;
                        this.pc = (this.pc + step) & 0xFFFFFF;
                        return size === 1 ? immOffset + 1 : immOffset;
                    }
                }
                break;
            }
        }
        return 0;
    }

    readEA(ea, size) {
        if (ea < 0) {
            const regIdx = -ea - 1;
            if (regIdx < 8) return this.d[regIdx]; 
            return this.a[regIdx - 8];            
        }

        if (size === 1) return this.bus.readByte(ea, this.pc);
        if (size === 2) return this.bus.readWord(ea, this.pc);
        
        const high = this.bus.readWord(ea, this.pc);
        const low = this.bus.readWord(ea + 2, this.pc);
        return ((high << 16) | low) >>> 0;
    }

    writeEA(ea, value, size) {
        if (ea < 0) {
            const regIdx = -ea - 1;
            if (regIdx < 8) {
                if (size === 1) this.d[regIdx] = (this.d[regIdx] & 0xFFFFFF00) | (value & 0xFF);
                else if (size === 2) this.d[regIdx] = (this.d[regIdx] & 0xFFFF0000) | (value & 0xFFFF);
                else this.d[regIdx] = value;
            } else {
                const aIdx = regIdx - 8;
                if (size === 2) this.a[aIdx] = (value << 16) >> 16; // Sign-extended
                else this.a[aIdx] = value;
            }
            return;
        }

        if (size === 1) return this.bus.writeByte(ea, value & 0xFF, this.pc);
        else if (size === 2) return this.bus.writeWord(ea, value & 0xFFFF, 0xFFFF, this.pc);
        else {
            this.bus.writeWord(ea, (value >> 16) & 0xFFFF, 0xFFFF, this.pc);
            this.bus.writeWord(ea + 2, value & 0xFFFF, 0xFFFF, this.pc);
        }
    }

    // ========================================================================
    // HIGH-PERFORMANCE INSTRUCTION EXECUTION UNIT (WITH SMART TELEMETRY)
    // ========================================================================

    execute(cycles) {
        if (this.isHalted) {
            // If the CPU is waiting on a STOP instruction, just consume cycles
            this.cyclesRemaining = Math.max(0, this.cyclesRemaining - cycles);
            return;
        }

        this.cyclesRemaining += cycles;

        while (this.cyclesRemaining > 0) {
            // Process pending interrupts
            if (this.irqPending > 0) {
                const mask = (this.sr >> 8) & 7;
                if (this.irqPending > mask) {
                    this.triggerException(24 + this.irqPending);
                    this.irqPending = 0;
                    this.isHalted = false; // Interrupts wake up the CPU from STOP
                    continue;
                }
            }

            // Fetch the 16-bit instruction opcode synchronously
            const opcode = this.bus.readWord(this.pc, this.pc) & 0xFFFF;
            const currentInstructionAddress = this.pc;

            this.pc = (this.pc + 2) & 0xFFFFFF;

            // Look up operation inside the unified modular dispatch table
            const executor = this.opcodeTable[opcode];
            let cost = 4; // Fallback cycles

            if (executor !== null && executor !== undefined) {
                cost = executor() | 0;
            } else {
                // If it is completely unhandled by registration AND the fallback, CRASH immediately with full info!
                const legacyCost = this.decodeAndExecuteLegacyFallback(opcode);
                if (legacyCost === null || legacyCost === undefined || legacyCost === 4) {
                    console.error(`%c[M68000 FATAL] Unimplemented Opcode: 0x${opcode.toString(16).toUpperCase().padStart(4, '0')} at PC: 0x${currentInstructionAddress.toString(16).toUpperCase().padStart(6, '0')}`, "color: red; font-weight: bold; font-size: 1.2rem;");
                    console.log(`[M68000 Dump] Registers State:`);
                    console.log(`D0-D3: ${this.d[0].toString(16)} | ${this.d[1].toString(16)} | ${this.d[2].toString(16)} | ${this.d[3].toString(16)}`);
                    console.log(`A0-A3: ${this.a[0].toString(16)} | ${this.a[1].toString(16)} | ${this.a[2].toString(16)} | ${this.a[3].toString(16)}`);
                    console.log(`A6: 0x${this.a[6].toString(16)} | USP: 0x${this.usp.toString(16)} | SSP: 0x${this.ssp.toString(16)}`);
                    console.log(`SR: 0x${this.sr.toString(16)} (Z:${this.fZ} N:${this.fN} C:${this.fC} V:${this.fV} X:${this.fX})`);
                    
                    this.cyclesRemaining = 0; // Terminate execution immediately
                    throw new Error(`Unhandled Motorola 68000 instruction exception.`);
                }
                cost = legacyCost | 0;
            }

            // Skip logging the redundant RAM clearing loop iterations (0x0276-0x0278) for clean logs
            // if (currentInstructionAddress < 0x000276 || currentInstructionAddress > 0x000278) {
            //     if (this.instructionTelemetryCount < 20000) {
            //         console.log(`[M68000 Trace #${this.instructionTelemetryCount}] PC: 0x${currentInstructionAddress.toString(16).toUpperCase().padStart(6, '0')} | Opcode: 0x${opcode.toString(16).toUpperCase().padStart(4, '0')} | D1: 0x${this.d[1].toString(16).toUpperCase()} | A6: 0x${this.a[6].toString(16).toUpperCase()}`);
            //         this.instructionTelemetryCount++;
            //     }
            // }

            this.cyclesRemaining -= cost;
        }
    }

    /**
     * Evaluates status conditional test parameters (Bcc / DBcc / Scc).
     * @param {number} cond - 4-bit conditional code
     * @returns {boolean} True if condition is met
     */
    resolveCondition(cond) {
        switch (cond) {
            case 0: return true;                                              // BRA (Always True)
            case 1: return false;                                             // False
            case 2: return this.fC === 0 && this.fZ === 0;                    // BHI (High)
            case 3: return this.fC !== 0 || this.fZ !== 0;                    // BLS (Lower or Same)
            case 4: return this.fC === 0;                                     // BCC (Carry Clear)
            case 5: return this.fC !== 0;                                     // BCS (Carry Set)
            case 6: return this.fZ === 0;                                     // BNE (Not Equal)
            case 7: return this.fZ !== 0;                                     // BEQ (Equal)
            case 8: return this.fV === 0;                                     // BVC (Overflow Clear)
            case 9: return this.fV !== 0;                                     // BVS (Overflow Set)
            case 10: return this.fN === 0;                                    // BPL (Plus / Positive)
            case 11: return this.fN !== 0;                                    // BMI (Minus / Negative)
            case 12: return this.fN === this.fV;                              // BGE (Greater or Equal)
            case 13: return this.fN !== this.fV;                              // BLT (Less Than)
            case 14: return this.fZ === 0 && this.fN === this.fV;             // BGT (Greater Than)
            case 15: return this.fZ !== 0 || this.fN !== this.fV;             // BLE (Less or Equal)
        }
        return false;
    }

    /**
     * Decodes and executes fallback operations. Returning null flags an unrecognized opcode.
     */
    decodeAndExecuteLegacyFallback(opcode) {
        return null;
    }
}