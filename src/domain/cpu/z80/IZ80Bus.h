/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: src/domain/cpu/z80/IZ80Bus.h
 * 
 * Domain Layer: Z80 Memory & I/O Bus Interface
 * 
 * Role:
 * Abstract contract defining how the Z80 CPU interacts with the outside world.
 * 
 * SOLID Principles Applied:
 * 1. Dependency Inversion Principle (DIP): The Z80 CPU depends on this abstraction 
 *    rather than concrete implementations (like SegaMasterSystemBus).
 * 2. Interface Segregation Principle (ISP): Exposes strictly the necessary read/write 
 *    operations required by a microprocessor, keeping the API lean.
 */

#ifndef I_Z80_BUS_H
#define I_Z80_BUS_H

#include <stdint.h>

class IZ80Bus {
public:
    virtual ~IZ80Bus() = default;

    // --- Memory Access ---
    virtual uint8_t readAddr(uint16_t address) = 0;
    virtual void writeAddr(uint16_t address, uint8_t value) = 0;
    
    virtual uint16_t readAddr16bit(uint16_t address) = 0;
    virtual void writeAddr16bit(uint16_t address, uint16_t word) = 0;

    // --- Hardware I/O Ports Access ---
    virtual uint8_t readPort(uint16_t port) = 0;
    virtual void writePort(uint16_t port, uint8_t value) = 0;
};

#endif // I_Z80_BUS_H