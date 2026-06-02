/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Domain Layer: Ricoh 5A22 / W65C816S CPU Instructions Aggregator
 * 
 * Coordinates the modular instruction subsystems. Combines the independent registers,
 * arithmetic, logical, shift, data transfer, and program flow modules on startup.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on aggregating
 *   modular sub-registers tables, satisfying clean architecture boundaries.
 */

class CpuInstructions {
    /**
     * Registers all 256 standard and 3 interrupt vectors of the 65816 CPU.
     * @param {Cpu} cpu - Main CPU orchestrator.
     * @param {Array<Function>} table - Opcode dispatch table.
     */
    static register(cpu, table) {
        // Hydrate the dispatch table with the modular instruction registries
        SnesCpuSystem.register(cpu, table);
        SnesCpuDataTransfer.register(cpu, table);
        SnesCpuArithmetic.register(cpu, table);
        SnesCpuLogical.register(cpu, table);
        SnesCpuShiftRotate.register(cpu, table);
        SnesCpuProgramFlow.register(cpu, table);
    }
}

// Safely publish class to the window namespace
window.CpuInstructions = CpuInstructions;