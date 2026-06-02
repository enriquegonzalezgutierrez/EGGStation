/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Registers Entity
 * 
 * Encapsulates the complete architectural register state of the 16-bit 65816 CPU.
 * Manages the Accumulator, Index Registers (X, Y), Stack Pointer (S), Direct Page (D),
 * Program Counter (PC), Program Bank (PB), Data Bank (DB), and Status Register (P).
 *
 * Handles native 16-bit configurations vs emulation-mode constraints (8-bit stack limits,
 * forced register flags, and registers resizing) cleanly in accordance with hardware specifications.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Isolates register storage, bitwise packing/unpacking,
 *   and size-transition masking from instruction execution and bus operations.
 */

class CpuRegisters {
    constructor() {
        // --- Core 16-bit Registers ---
        this._c = 0;   // 16-bit Accumulator (C). Holds both A (low byte) and B (high byte).
        this._x = 0;   // 16-bit/8-bit Index Register X
        this._y = 0;   // 16-bit/8-bit Index Register Y
        this._sp = 0;  // 16-bit Stack Pointer (S). Default 0 (maps to 0x0100 in emulation mode)
        this._dp = 0;  // 16-bit Direct Page Register (D)
        this._pc = 0;  // 16-bit Program Counter (PC)

        // --- Bank Registers ---
        this.pb = 0;   // 8-bit Program Bank Register (K)
        this.db = 0;   // 8-bit Data Bank Register (B)

        // --- Processor Status Flags (P Register) ---
        this.n = false; // Negative Flag (Sign)
        this.v = false; // Overflow Flag
        this.m = true;  // Memory/Accumulator Mode (true = 8-bit, false = 16-bit)
        this.xFlag = true; // Index Register Mode (true = 8-bit, false = 16-bit)
        this.d = false; // Decimal Mode
        this.i = true;  // Interrupt Disable
        this.z = false; // Zero Flag
        this.cFlag = false; // Carry Flag

        this._e = true; // 1-bit Emulation Mode Flag (true = Emulation, false = Native)
    }

    /**
     * Resets registers to cold-boot defaults.
     * Starts in Emulation mode with interrupts disabled and decimal mode cleared.
     */
    reset() {
        this._c = 0;
        this._x = 0;
        this._y = 0;
        this._sp = 0; // CORRECTED: Standard SnesJs boot state to prevent stack corruption
        this._dp = 0;
        this._pc = 0;
        this.pb = 0;
        this.db = 0;

        this.n = false;
        this.v = false;
        this.m = true;
        this.xFlag = true;
        this.d = false;
        this.i = true;
        this.z = false;
        this.cFlag = false;
        this._e = true;
    }

    // ========================================================================
    // EMULATION MODE (E) ACCESSORS
    // ========================================================================

    get e() {
        return this._e;
    }

    /**
     * Toggles the Emulation Mode. Updates status registers to match hardware behaviors.
     * @param {boolean} value
     */
    set e(value) {
        const prevE = this._e;
        this._e = !!value;

        if (this._e) {
            // Transitioning to Emulation Mode forces 8-bit registers and locks high-byte of Stack
            this.m = true;
            this.xFlag = true;
            this._sp = 0x0100 | (this._sp & 0xFF);
            this.truncateIndexRegisters();
        } else if (prevE && !this._e) {
            // Transitioning from Emulation to Native Mode defaults flags
            // High byte of stack is unlocked, but stays as is until mutated
        }
    }

    // ========================================================================
    // ACCUMULATOR (A, B, C) ACCESSORS
    // ========================================================================

    /**
     * Returns the full 16-bit Accumulator C.
     * @returns {number} 16-bit word
     */
    get c() {
        return this._c & 0xFFFF;
    }

    /**
     * Sets the full 16-bit Accumulator C.
     * @param {number} value 16-bit word
     */
    set c(value) {
        this._c = value & 0xFFFF;
    }

    /**
     * Returns the active Accumulator (A).
     * Automatically adjusts mask based on the M status flag (8-bit or 16-bit).
     * @returns {number} 8-bit or 16-bit value
     */
    get a() {
        if (this.m) {
            return this._c & 0x00FF;
        }
        return this._c;
    }

    /**
     * Sets the active Accumulator (A).
     * Automatically masks or preserves the upper byte based on the M status flag.
     * @param {number} value
     */
    set a(value) {
        if (this.m) {
            this._c = (this._c & 0xFF00) | (value & 0x00FF);
        } else {
            this._c = value & 0xFFFF;
        }
    }

    /**
     * Returns the hidden high-byte of the Accumulator (B).
     * Only relevant in 8-bit mode.
     * @returns {number} 8-bit byte
     */
    get b() {
        return (this._c >> 8) & 0xFF;
    }

    /**
     * Sets the hidden high-byte of the Accumulator (B).
     * @param {number} value
     */
    set b(value) {
        this._c = ((value & 0xFF) << 8) | (this._c & 0x00FF);
    }

    // ========================================================================
    // INDEX REGISTERS (X, Y) ACCESSORS
    // ========================================================================

    get x() {
        if (this.xFlag) {
            return this._x & 0x00FF;
        }
        return this._x;
    }

    set x(value) {
        if (this.xFlag) {
            this._x = value & 0x00FF;
        } else {
            this._x = value & 0xFFFF;
        }
    }

    get y() {
        if (this.xFlag) {
            return this._y & 0x00FF;
        }
        return this._y;
    }

    set y(value) {
        if (this.xFlag) {
            this._y = value & 0x00FF;
        } else {
            this._y = value & 0xFFFF;
        }
    }

    /**
     * Utility helper to truncate X and Y register structures when switching
     * the processor's X status flag from 16-bit to 8-bit mode.
     */
    truncateIndexRegisters() {
        this._x &= 0x00FF;
        this._y &= 0x00FF;
    }

    // ========================================================================
    // STACK (S), DIRECT PAGE (D), & PROGRAM COUNTER (PC) ACCESSORS
    // ========================================================================

    get sp() {
        if (this._e) {
            return 0x0100 | (this._sp & 0x00FF);
        }
        return this._sp;
    }

    set sp(value) {
        if (this._e) {
            this._sp = 0x0100 | (value & 0x00FF);
        } else {
            this._sp = value & 0xFFFF;
        }
    }

    get dp() {
        return this._dp & 0xFFFF;
    }

    set dp(value) {
        this._dp = value & 0xFFFF;
    }

    get pc() {
        return this._pc & 0xFFFF;
    }

    set pc(value) {
        this._pc = value & 0xFFFF;
    }

    // ========================================================================
    // STATUS REGISTER (P) PACKING & UNPACKING
    // ========================================================================

    /**
     * Packs individual status flags into an 8-bit status byte representation.
     * Maps flags to native 65816 status bits.
     * @returns {number} 8-bit status byte
     */
    get p() {
        let val = 0;
        val |= this.n ? 0x80 : 0;
        val |= this.v ? 0x40 : 0;
        val |= this.m ? 0x20 : 0; // Native: M flag. Emulation: B flag (break)
        val |= this.xFlag ? 0x10 : 0; // Native: X flag. Emulation: Reserved (always 1)
        val |= this.d ? 0x08 : 0;
        val |= this.i ? 0x04 : 0;
        val |= this.z ? 0x02 : 0;
        val |= this.cFlag ? 0x01 : 0;
        return val;
    }

    /**
     * Unpacks an 8-bit status byte into individual status flags.
     * Automatically scales register properties if M or X flags transition.
     * @param {number} value 8-bit status byte
     */
    set p(value) {
        this.n = (value & 0x80) > 0;
        this.v = (value & 0x40) > 0;
        
        // Emulation Mode forces M and X flags to remain true
        if (this._e) {
            this.m = true;
            this.xFlag = true;
        } else {
            const prevX = this.xFlag;
            this.m = (value & 0x20) > 0;
            this.xFlag = (value & 0x10) > 0;

            // Invalidate upper bytes of index registers if switching to 8-bit mode
            if (this.xFlag && !prevX) {
                this.truncateIndexRegisters();
            }
        }
        
        this.d = (value & 0x08) > 0;
        this.i = (value & 0x04) > 0;
        this.z = (value & 0x02) > 0;
        this.cFlag = (value & 0x01) > 0;
    }

    // ========================================================================
    // SERIALIZATION (STATE SNAPSHOTS)
    // ========================================================================

    /**
     * Packages current register states into a lightweight structured object.
     * Used by the real-time rewind buffer and savestate managers.
     * @returns {Object} Deep-copied state snapshot
     */
    exportState() {
        return {
            c: this._c,
            x: this._x,
            y: this._y,
            sp: this._sp,
            dp: this._dp,
            pc: this._pc,
            pb: this.pb,
            db: this.db,
            n: this.n,
            v: this.v,
            m: this.m,
            xFlag: this.xFlag,
            d: this.d,
            i: this.i,
            z: this.z,
            cFlag: this.cFlag,
            e: this._e
        };
    }

    /**
     * Restores the internal state from a previously exported snapshot.
     * @param {Object} state
     */
    importState(state) {
        this._c = state.c & 0xFFFF;
        this._x = state.x;
        this._y = state.y;
        this._sp = state.sp & 0xFFFF;
        this._dp = state.dp & 0xFFFF;
        this._pc = state.pc & 0xFFFF;
        this.pb = state.pb & 0xFF;
        this.db = state.db & 0xFF;

        this.n = !!state.n;
        this.v = !!state.v;
        this.m = !!state.m;
        this.xFlag = !!state.xFlag;
        this.d = !!state.d;
        this.i = !!state.i;
        this.z = !!state.z;
        this.cFlag = !!state.cFlag;
        this._e = !!state.e;
        
        if (this._e) {
            this._sp = 0x0100 | (this._sp & 0xFF);
            this.truncateIndexRegisters();
        }
    }
}

window.CpuRegisters = CpuRegisters;