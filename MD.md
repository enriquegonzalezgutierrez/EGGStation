# Sega Genesis / Mega Drive
## Technical Hardware Manual: A Beginner's Guide to 16/32-Bit Dual-CPU Architecture

Welcome, developer! This manual is designed to explain the inner physical workings of the Sega Genesis and Mega Drive hardware. If you are transitioning from standard 8-bit systems (like the NES or Sega Master System), this guide will translate complex dual-CPU bus handshakes, FM operator algorithms, VDP sprite masking, and 68K addressing registers into clear, digestible concepts.

---

## 1. The Multi-Engine Sports Car Analogy (How the System Works)

To understand how the Sega Genesis functions, think of it as a **dual-engine sports car**:

```
+-------------------------------------------------------------------------+
|                               THE CAR                                   |
|                                                                         |
|  +--------------------+      +--------------------+                     |
|  |   PRIMARY ENGINE   |      |  AUXILIARY ENGINE  |                     |
|  |  (Motorola 68000)  |      |   (Zilog Z80)      |                     |
|  +---------+----------+      +---------+----------+                     |
|            |                           |                                |
|            | <==== BUSREQ / RESET =====+                                |
|            |                                                            |
|            v                                                            |
|  =================================================                      |
|              THE PRIMARY SYSTEM BUS (A-BUS)                             |
|  =================================================                      |
|         |                     |                      |                  |
|         v                     v                      v                  |
|  +--------------+      +--------------+       +--------------+          |
|  |  THE PAINTER |      |  THE SYNTH   |       |   SCRATCHPAD |          |
|  | (Genesis VDP)|      |  (YM2612 FM) |       |  (64KB WRAM) |          |
|  +--------------+      +--------------+       +--------------+          |
+-------------------------------------------------------------------------+
```

*   **The Motorola 68000 CPU (The V12 Main Engine):** A powerful 16/32-bit processor that runs the main game code, coordinates physics, scrolls screen planes, and acts as the master conductor.
*   **The Zilog Z80 CPU (The 4-Cylinder Co-Processor):** An 8-bit CPU included for two purposes: backward compatibility with Sega Master System games, and acting as a dedicated sound driver/co-processor to feed music to the YM2612 and PSG chips.
*   **The M68K System Bus (The A-Bus):** The primary 24-bit highway connecting the 68K CPU to RAM, ROM, the VDP, and I/O registers.
*   **The Z80 System Bus (The Z-Bus):** A secondary 16-bit address bus. The Z80 can read its own local 8KB RAM, talk to the YM2612 FM synthesizer, and read from 68K space using a special 32KB panning window (Bank Register).

---

## 2. Chapter 1: The Motorola 68000 CPU (The Master)

The main CPU of the Genesis is the **Motorola 68000**, running at **7.67 MHz** (NTSC) or **7.61 MHz** (PAL). It is often called a "16/32-bit" processor.

### What does "16/32-bit" mean? (The 16-Lane Bridge)
*   **Internally**, the 68000 is a **32-bit** machine. Its registers (pockets) are 32 bits wide, meaning they can hold and calculate numbers up to `4,294,967,295` in a single cycle.
*   **Externally**, the 68000 connects to a **16-bit Data Bus**.
*   **The Analogy:** Think of the CPU as a warehouse that holds large 32-bit boxes. But the exit bridge (the external data bus) only has 16 lanes. To send a 32-bit box over the bridge, the CPU has to split it into two 16-bit packages, sending them one after the other in consecutive cycles.

### CPU Registers (D0-D7 and A0-A7)
The 68000 contains 16 main 32-bit registers:

```
        Data Registers (D0 - D7)              Address Registers (A0 - A7)
+-----------------------------------+     +-----------------------------------+
|  D0 (Data / Math)                 |     |  A0 (Pointer / Offset)            |
+-----------------------------------+     +-----------------------------------+
|  D1 (Data / Math)                 |     |  A1 (Pointer / Offset)            |
+-----------------------------------+     +-----------------------------------+
|  D2 (Data / Math)                 |     |  A2 (Pointer / Offset)            |
+-----------------------------------+     +-----------------------------------+
|  ...                              |     |  ...                              |
+-----------------------------------+     +-----------------------------------+
|  D7 (Data / Math)                 |     |  A7 (System Stack Pointer)        |
+-----------------------------------+     +-----------------------------------+
```

1.  **D0 - D7 (Data Registers):** Used for mathematical operations, comparisons, and logical shifts. They can operate on 8-bit (Byte), 16-bit (Word), or 32-bit (Long) sizes.
2.  **A0 - A7 (Address Registers):** Used exclusively as memory pointers (holding address locations). They do not support 8-bit sizes.
    *   **A7 (The Stack Pointer):** Points to the system stack area in Work RAM.
3.  **SR (Status Register):** A 16-bit register. The upper byte (System Byte) controls supervisor privileges and interrupt masks. The lower byte (CCR - Condition Code Register) contains arithmetic flags:
    *   **X (Extend):** Used for multi-precision addition/subtraction.
    *   **N (Negative), Z (Zero), V (Overflow), C (Carry).**

---

## 3. Chapter 2: The Secondary Z80 CPU & Bus Handshake

To prevent the primary 68000 CPU from wasting cycles processing music, Sega included a secondary **Zilog Z80 CPU** running at **3.58 MHz**.

### The BUSREQ and RESET Handshake (Sharing the Road)
Because both CPUs are connected to the motherboard, they cannot read and write to the same memory spaces at the same time without colliding. To prevent this, they communicate using hardware handshakes:

```
        68000 CPU                                 Z80 CPU
+------------------------+                +---------------------+
| Needs to load music    | === BUSREQ ==> | Suspends execution  |
| waits for !BUSACK=0    | <== !BUSACK ===| Releases the Bus    |
| Writes music to Z80 RAM|                | (Frees up local RAM)|
| Releases BUSREQ        |                |                     |
| Asserts RESET line     | === RESET ===> | Resets registers    |
| Releases RESET line    | === RESET ===> | Starts playing music|
+------------------------+                +---------------------+
```

1.  **BUSREQ (Bus Request):** The 68000 writes a `1` to register `0xA11100` to request control of the Z80 bus. The Z80 suspends execution, releases its address lines, and asserts **!BUSACK (Bus Acknowledge)** by pulling it low. The 68000 can now safely write music data directly into the Z80's local 8KB RAM (`0xA00000 - 0xA01FFF`).
2.  **RESET:** The 68000 writes a `0` to register `0xA11200` to hold the Z80 in a hardware reset state. When it releases the reset line (writes `1`), the Z80 boots cleanly from address `0x0000` to execute the loaded sound driver.

---

## 4. Chapter 3: The Painter - Video Display Processor (VDP)

The **Genesis VDP** is a custom graphics processor. It is connected to **64KB of VRAM** (for tiles), **128 bytes of CRAM** (for colors), and **80 words of VSRAM** (for vertical scroll offsets).

### H32 and H40 Resolution Modes
Unlike older consoles, the Genesis can dynamically change its horizontal screen resolution:
*   **H32 Mode (256x224):** Draws 32 tiles per scanline. It is slower and matches the Master System's resolution.
*   **H40 Mode (320x224):** Draws 40 tiles per scanline. It expands the active screen width to 320 horizontal pixels. It is the signature "widescreen" look of the Genesis.

### The Display Planes Stacking
The VDP renders the screen by stacking four independent graphical planes:

```
       [ TOP LAYER ]   Sprite / OBJ  (Supports 4 priorities)
             ^
             |         Window Plane  (Overrides Plane A within boundaries)
             |         Plane A (Foreground / Name Table)
             |         Plane B (Background / Name Table)
       [ BACKDROP  ]   Base Backdrop Color (Palette index 0)
```

1.  **Plane B (Background):** The lowest background plane, typically used for distant landscapes.
2.  **Plane A (Foreground):** The primary background plane, typically used for foreground platforms and obstacles.
3.  **Window Plane:** Overrides Plane A within configured horizontal or vertical boundaries. It cannot be scrolled and is typically used for stable HUD overlays and text boxes.
4.  **Sprite Plane:** Up to 80 (H40) or 64 (H32) independent actors drawn on top.
    *   **The Sprite Masking (X=128):** If a sprite has an internal X coordinate of `128` (which represents screen coordinate `0` after subtracting the standard 128px border-offset), the VDP activates its **masking state machine** and drops any subsequent sprites on that scanline.

### Shadow / Highlight Priority Mode
To create realistic lighting and transparency without CPU math overhead, the VDP supports **Shadow/Highlight Mode**:
*   The VDP designates the colors 15 and 16 of Palette Line 4 (`0x3E` and `0x3F`) as **transparency markers** with special lighting properties.
*   If a sprite with priority `0` is drawn over a background pixel, the VDP **shadows** that pixel by dividing its RGB values by 2 (darker).
*   If a sprite containing color `15` is drawn over a background pixel, the VDP **highlights** that pixel by shifting its RGB values up (brighter).

---

## 5. Chapter 4: The Sound System (YM2612 & PSG)

The Sega Genesis soundstage is famous for its raw, metallic, and gritty 90s stereo output, synthesized using two separate custom chips.

### The Yamaha YM2612 (FM Synthesizer)
The **YM2612** is a 6-channel Frequency Modulation (FM) synthesizer:
*   **FM Operator Synthesis:** Instead of just adding square waves together, FM synthesis uses **Operators**. An operator consists of an oscillator (generating a sine wave) and an envelope generator (shaping the volume).
*   **Algorithms:** The YM2612 groups 4 operators per channel into 8 different routing layouts called **Algorithms**:

```
            ALGORITHM 0 (Serial Modulation)
            
   [ Operator 1 ] (Modulates frequency of Op 2)
         |
         v
   [ Operator 2 ] (Modulates frequency of Op 3)
         |
         v
   [ Operator 3 ] (Modulates frequency of Op 4)
         |
         v
   [ Operator 4 ] === OUTPUTS AUDIO => Speaker
```

By modulating (shaking) the frequency of one operator with the output of another at extremely high speeds, the YM2612 creates complex, metallic harmonic overtones (electric guitars, slappy basses, and synths).
*   **DAC Channel:** Channel 6 can be converted into a raw **8-bit DAC** (Digital-to-Analog Converter) channel. The CPU can stream raw PCM bytes (like drums or digitized voice clips: *"SE-GA!"*) straight to register `$2A` to play digitized sound.

### The TI SN76489 PSG (Compatibility Soundstage)
To complement the FM synthesizer and preserve Sega Master System audio compatibility, the Genesis includes a standard **PSG** chip:
*   Generates 3 independent square-wave tone channels.
*   Generates 1 noise channel (Periodic hums or White noise statics).

---

## 6. Chapter 5: On-Board Controller Ports (Sega 315-5309)

The Sega Genesis connects to controllers through the **Sega 315-5309 I/O controller chip**, mapped to registers `$A10000 - `$A1001F`.

### The TH-Pin Multiplexing (How 12 Buttons fit in 6 Wires)
A standard SNES controller plug has 12 separate wires for its buttons. But a Sega controller port only has **9 physical pins** (of which only 6 are data lines). How do we read a 3-button or 6-button controller over only 6 data lines?

It uses **Multiplexing** controlled by the **TH Pin** (Pin 7):

```
       TH PIN STATE                             DATA READOUT
       
   TH = 1 (HIGH)   ===> Read:  [ Start ] [ A ] [ 0 ] [ 0 ] [ Down ] [ Up ]
   
   TH = 0 (LOW)    ===> Read:  [   C   ] [ B ] [ Right ] [ Left ] [ Down ] [ Up ]
```

1.  **3-Button Multiplexing:** The CPU writes to the port's Data register to toggle the TH pin:
    *   **TH = 1 (HIGH):** The controller sends the states of directions (Up, Down, Left, Right) and buttons **B** and **C**.
    *   **TH = 0 (LOW):** The controller sends the states of directions (Up, Down) and buttons **A** and **Start**.
    *   By toggling TH back and forth, the CPU reads all buttons in two quick steps.
2.  **6-Button Multiplexing (Strobe Pulses):** To read a 6-button controller (adding buttons X, Y, Z, and Mode), the CPU toggles the TH pin rapidly multiple times (strobes) within a short window. On the third falling edge of the TH pin, the controller pulls down the lower data lines to `0x00` (hardware handshake) and sends the states of **X, Y, Z, and Mode**.
    *   **The 1.5ms Watchdog:** If the CPU takes too long between toggles (more than 1.5 milliseconds), an internal timer in the controller times out and resets the strobe phase back to `0`.

---

## 7. Sega Genesis Architecture Quick Reference

*   **Master Clock:** 53.693175 MHz (NTSC) / 53.203424 MHz (PAL)
*   **Primary CPU Clock (M68K):** 7.67 MHz (Master Clock / 7)
*   **Secondary CPU Clock (Z80):** 3.58 MHz (Master Clock / 15)
*   **Work RAM (WRAM):** 64KB (Mapped at `$E00000 - $FFFFFF`)
*   **VRAM:** 64KB (Accessed through VDP Port `$C00000` and `$C00004`)
*   **CRAM (Color RAM):** 128 bytes (64 colors of 9-bit RGB format, 4 lines of 16 colors)
*   **YM2612 FM Audio:** 6 stereo channels, 4 operators per voice, 8 algorithms, 8-bit DAC.
*   **PSG Audio:** 3 square wave channels, 1 noise channel, 16 volume levels.
*   **Widescreen Resolution:** 320x224 pixels (H40) or 256x224 pixels (H32).