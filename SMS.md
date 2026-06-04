# Sega Master System & Mark III
## Technical Hardware Manual: A Beginner's Guide to 8-Bit Architecture

Welcome, developer! This manual is designed to explain the inner physical workings of the Sega Master System (SMS) and Sega Mark III hardware. If you have never worked with registers, memory buses, or CRT scanline timings before, this guide will translate complex hardware engineering into clear, digestible concepts using intuitive analogies.

---

## 1. The Orchestra Analogy (How the System Works Together)

To understand how a retro console functions, think of the Sega Master System as a live theater play:

```
+-------------------------------------------------------------------------+
|                              THE THEATER                                |
|                                                                         |
|  +--------------------+      +--------------------+      +-----------+  |
|  |   THE CONDUCTOR    |      |    THE PAINTER     |      | THE DRUM  |  |
|  |  (Zilog Z80 CPU)   |      | (Sega 315-5124 VDP)|      | (TI PSG)  |  |
|  +---------+----------+      +---------+----------+      +-----+-----+  |
|            |                           |                       |        |
|            +------------+--------------+-----------------------+        |
|                         |                                               |
|                         v                                               |
|              =======================                                    |
|               THE MEMORY HIGHWAY                                        |
|              =======================                                    |
|                         |                                               |
|            +------------+------------+                                  |
|            |                         |                                  |
|            v                         v                                  |
|  +--------------------+    +--------------------+                       |
|  |     THE SCRIPT     |    |    THE SCRATCHPAD  |                       |
|  |    (Game ROM)      |    |   (Work RAM)       |                       |
|  +--------------------+    +--------------------+                       |
+-------------------------------------------------------------------------+
```

*   **The Zilog Z80 CPU (The Conductor):** Reads the game's code, calculates physics, processes input, and tells the other chips what to do.
*   **The System Bus (The Highway):** A network of physical copper traces on the motherboard that allows the CPU to send and receive data.
*   **The VDP (The Painter):** Takes instructions from the CPU and draws the graphics on the screen, pixel by pixel, line by line.
*   **The PSG (The Drum/Synthesizer):** Generates music and sound effects on command.
*   **WRAM & ROM (The Scratchpad & The Script):** The cartridge ROM is the permanent script of the play. The 8KB System RAM is a temporary scratchpad where the CPU writes down variables (like lives, score, and player positions).

---

## 2. Chapter 1: The Zilog Z80 CPU (The Conductor)

At the heart of the Master System is the **Zilog Z80**, an 8-bit micro-processor running at **3.58 MHz** (3,579,545 clock ticks per second). 

### What does "8-bit" mean?
It means the CPU's brain processes data in chunks of 8 bits (1 byte) at a time. 
*   An 8-bit binary number can range from `00000000` (0 in decimal) to `11111111` (`255` in decimal / `$FF` in hexadecimal).
*   If the CPU wants to add two large numbers (e.g., `300 + 200`), it cannot do it in a single cycle. It has to split the calculation into smaller pieces because its registers only hold up to `255`.

### CPU Registers (The Conductor's Pockets)
The CPU contains ultra-fast internal storage slots called **registers**. Think of them as the pockets on the conductor's jacket—easily accessible, but very small.

```
       8-Bit Registers                       Special 16-Bit Registers
+----------------+----------------+       +-----------------------------------+
|  A (Accumulator|   F (Flags)    |       |       PC (Program Counter)        |
+----------------+----------------+       +-----------------------------------+
|  B (General)   |   C (General)  |       |       SP (Stack Pointer)          |
+----------------+----------------+       +-----------------------------------+
|  D (General)   |   E (General)  |       |       IX (Index Register X)       |
+----------------+----------------+       +-----------------------------------+
|  H (General)   |   L (General)  |       |       IY (Index Register Y)       |
+----------------+----------------+       +-----------------------------------+
```

1.  **A (The Accumulator):** The primary register. Almost all mathematical operations (addition, subtraction, logical shifts) must use register A as their starting point and destination.
2.  **F (The Flags Register):** Contains individual "yes/no" bits that describe the result of the last math operation:
    *   **Z (Zero Flag):** Set to `1` if the last operation resulted in exactly `0`.
    *   **C (Carry Flag):** Set to `1` if an addition exceeded `255`, or a subtraction went below `0`.
    *   **N (Negative Flag):** Set to `1` if the last result was a negative number.
3.  **B, C, D, E, H, L (General Purpose Pockets):** Used to hold temporary values.
    *   **Pairing:** The Z80 has a special trick—it can pair these 8-bit registers together to act as single 16-bit registers: **BC**, **DE**, and **HL**.
    *   **Why pair them?** Because while 8 bits can only count to 255, 16 bits can count up to **65,535** (`$FFFF`). This is crucial because memory addresses are 16 bits wide.
4.  **PC (Program Counter):** A 16-bit pointer that holds the memory address of the instruction currently being executed. Once an instruction is fetched, the PC automatically increments to point to the next instruction in line.
5.  **SP (Stack Pointer):** Points to a temporary storage area in System RAM called the **Stack**. When the CPU needs to jump away to handle a controller press (Interrupt), it "pushes" the current PC onto the stack, handles the input, and then "pops" the PC back out to resume exactly where it left off.

---

## 3. Chapter 2: The Map of the Land (Memory & Mappers)

The Z80 uses a **16-bit Address Bus**. This means the CPU can write a 16-bit number on the address lines to select a memory location. 

Because $2^{16} = 65,536$, the CPU has a physical memory limit of **64KB**. It cannot see or address a single byte beyond this boundary.

### The System Memory Map
To make use of this 64KB space, the motherboard routes different address ranges to different physical chips:

```
$0000 +-----------------------------------+
      |                                   |
      |   Slot 0: Cartridge ROM Page 0    | (Protected 1KB at boot)
      |   (Addresses $0000 - $3FFF)       |
      |                                   |
$4000 +-----------------------------------+
      |                                   |
      |   Slot 1: Cartridge ROM Page 1    |
      |   (Addresses $4000 - $7FFF)       |
      |                                   |
$8000 +-----------------------------------+
      |                                   |
      |   Slot 2: Cartridge ROM Page 2 /  | (Optionally swapped for
      |   Battery-backed Save SRAM        |  cartridge SRAM)
      |   (Addresses $8000 - $BFFF)       |
$C000 +-----------------------------------+
      |   8KB Work RAM                    | (Mirrored once at $E000)
$E000 +-----------------------------------+
      |   8KB Work RAM (Mirror)           | (Writes to $E000 write to $C000)
$FFFF +-----------------------------------+
```

### What is a Mapper? (Sega, Codemasters, Korean)
Sega Master System games are often larger than 48KB (some are 512KB or even 1MB). How does a CPU with a 64KB limit read a 512KB cartridge?

It uses **Mappers**. Think of a mapper as a book holder:
*   The Z80 can only look at 3 open pages of the book at once (called **Slots 0, 1, and 2**).
*   Each Slot is exactly **16KB** wide.
*   To read other parts of the cartridge, the Z80 writes a page number to special control registers at the end of RAM (`$FFFC - $FFFF`).
*   The physical mapper chip on the cartridge PCB instantly intercepts these writes and swaps the requested 16KB bank of ROM into the selected Slot. This process is called **paging/bank-switching**.

#### Mapper Strategies:
1.  **Sega Mapper:** The standard SEGA mapper. It protects the first 1KB of Slot 0 (`$0000 - $0400`) from being bank-swapped. Why? Because the Z80’s interrupt vector jump tables reside there. If Slot 0 were swapped completely, the CPU would crash on the next interrupt! It also maps battery-backed save RAM into Slot 2.
2.  **Codemasters Mapper:** Used in games like *Micro Machines*. Instead of writing to `$FFFC-$FFFF`, it intercepts writes directly on the ROM boundaries (`0x0000`, `0x4000`, `0x8000`). It does not protect the first 1KB of memory.
3.  **Korean Mapper:** Used in budget Korean releases. It locks Slots 0 and 1, and only allows Slot 2 to be bank-swapped by writing to address `$A000`.

---

## 4. Chapter 3: The Painter - Video Display Processor (VDP)

The **Sega 315-5124 VDP** is the graphics chip. The CPU cannot write directly to the TV screen; instead, it writes graphical data to a dedicated **16KB VRAM (Video RAM)** buffer attached directly to the VDP.

```
       Z80 CPU                                Sega VDP
+-------------------+                  +---------------------+
| Reads Code        |                  |  VRAM (16KB)        |
| Calculates states |                  |  - Tile Patterns    |
| Writes commands   | === I/O Ports => |  - Name Table (Map) | === Outputs Video => TV Screen
+-------------------+   $BE (Data)     |  - Sprite Table     |                      (PAL or NTSC)
                        $BF (Control)  |  - Palette RAM      |
                                       +---------------------+
```

The CPU communicates with the VDP over two specialized I/O ports:
*   **Port `$BE` (Data Port):** Reading/Writing here transfers graphics bytes directly into/out of VRAM, CRAM, or VSRAM.
*   **Port `$BF` (Control Port):** Writing a 16-bit word here configures the VDP's internal registers (like background scrolling, screen modes, and memory address pointers). Reading here returns the VDP status flags.

### VRAM Layout (The Painter's Studio)
Inside the 16KB of VRAM, the VDP arranges its graphics into three structures:

1.  **Tile Patterns (`$0000 - $3FFF`):** The Master System is a tile-based console. It does not understand "bitmaps." All graphics (backgrounds and sprites) must be chopped into 8x8 pixel blocks called **Tiles**. 
    *   **Planar Format (4bpp):** Each pixel in a tile can have one of 16 colors. 16 colors require 4 bits per pixel (4bpp). The VDP stores these pixels using a planar format: 4 separate bytes represent a single row of 8 pixels. Each byte contains 1 bit of the color index for those 8 pixels.
2.  **Background Name Table:** This is the map of the screen. It is a grid of 32x28 entries. Each entry is a 16-bit word describing which tile pattern to draw in that grid slot, which palette to use, and whether to flip the tile horizontally or vertically.
3.  **Sprite Attribute Table (SAT):** A list of up to 64 sprites. Each entry contains the X/Y screen coordinates, the tile index to draw, and a color palette assignment.
    *   **The Sprite Masking Bug:** If the VDP scans the SAT and encounters a sprite with an X coordinate of `248` (`0xF8`), it interprets this as an instruction to **stop drawing any subsequent sprites** on that scanline.

### Scanlines, H-Blank, and V-Blank (The CRT Ray)
To draw an image, the TV's electron gun sweeps across the screen from left to right, line by line (scanlines), from top to bottom.

```
Scanline 0   =========================> H-Blank (Electron gun returns left)
Scanline 1   =========================> H-Blank
...
Scanline 191 =========================> H-Blank
             [Active Screen Rendering Ends]
             -------------------------
             V-Blank Period            (Electron gun returns to top-left)
             - CPU receives NMI/V-Blank Interrupt
             - Safe to write to VRAM
             -------------------------
Scanline 261 =========================> Frame Ends
```

*   **Active Display:** The VDP draws 192 (or 224/240 in overscan modes) active scanlines.
*   **H-Blank (Horizontal Blanking):** The brief moment when the electron gun finishes drawing a line and sweeps back to the left side of the screen to start the next line.
*   **V-Blank (Vertical Blanking):** The period after the last scanline is drawn, when the electron gun sweeps all the way back to the top-left of the screen to start the next frame.
    *   **Why is V-Blank crucial?** During active rendering, the VDP is constantly reading VRAM. If the CPU tries to write to VRAM at the same time, it causes visual corruption (snow/glitches). Therefore, the CPU must wait for V-Blank to update game graphics. The VDP alerts the CPU that V-Blank has started by pulling the **NMI (Non-Maskable Interrupt)** line low.

---

## 5. Chapter 4: The Musician - Programmable Sound Generator (PSG)

The **Sega 315-5124 PSG** is a sound generator integrated into the system. It contains four audio channels:
*   **Three Tone Channels:** Generate square waves.
*   **One Noise Channel:** Generates white or periodic noise (static/snare drums).

```
                      PSG SQUARE WAVE SYNTHESIS
                      
   State=1 (HIGH)  +-------+       +-------+       +-------+
                   |       |       |       |       |       |
   State=0 (LOW)   |       |       |       |       |       |
                   +       +-------+       +-------+       +-------+
                   <------->
                   Count Period (tonesCountdownMaster)
```

The CPU writes sound commands to the PSG on I/O Port **`$7F`**.

### How Tones are Made
Each tone channel has a 10-bit **Frequency Register** (from 0 to 1023) and a 4-bit **Volume Register** (attenuation levels from 0 to 15, where 15 is silent).

1.  **The Countdown:** The PSG has an internal counter (`tonesCountdown`) for each channel. On every clock tick, the counter decrements.
2.  **The Wave Flip:** When the counter hits `0`, it reloads the value from the Frequency Register and toggles the output state (if it was `1` it becomes `0`, and vice versa).
3.  **Frequency Calculation:** By flipping back and forth, it creates a square wave. A smaller frequency register value means the counter hits 0 faster, resulting in a higher pitch. A larger value results in a deeper bass pitch.

### Noise Generation (Periodic vs White Noise)
The noise channel does not use a simple counter; it uses a **16-bit Linear Feedback Shift Register (LFSR)**.

1.  **Periodic Noise:** The LFSR shifts bits, creating a repetitive, hum-like digital tone (sounds like an engine or low growl).
2.  **White Noise:** The LFSR shifts bits and applies a mathematical XOR feedback loop on specific bits. This randomizes the bits, creating a random static hiss (perfect for snare drums, explosions, and wind effects).

---

## 6. Chapter 5: Controller I/O Ports (Sega 315-5297)

The Master System connects to controllers through the **Sega 315-5297 I/O chip**, mapped to Ports **`$DC`** and **`$DD`**.

```
Port $DC Read:  [ Player 2 Down ] [ Player 2 Up ] [ Player 1 Fire 2 ] [ Player 1 Fire 1 ] [ Player 1 Right ] [ Player 1 Left ] [ Player 1 Down ] [ Player 1 Up ]
Port $DD Read:  [ Link Port TR ]  [ Link Port TH ] [ Player 2 Fire 2 ] [ Player 2 Fire 1 ] [ Player 2 Right ] [ Player 2 Left ]  [ VDP V-Counter Latch ] [ Rest ]
```

### Active-Low Logic (0 is Pressed!)
The controller ports use **active-low pull-up logic**. 
*   When a button is **not pressed**, the physical line is pulled high to VCC (+5V), which the CPU reads as a binary **`1`**.
*   When a button **is pressed**, it completes the circuit to ground (0V), pulling the line low, which the CPU reads as a binary **`0`**.
*   Therefore, in emulators: `pressed === 0` and `released === 1`.

### Light Phaser (Lightgun) Handshaking
The Master System Light Phaser (lightgun) operates on a clever hardware trick:
1.  When you pull the gun's trigger, it pulls **Button 1 (Port `$DC` bit 4)** low.
2.  When the CRT TV's electron gun sweeps across the screen and passes directly in front of the lightgun's photo-receptor lens, the lens detects the sudden flash of light.
3.  The lightgun instantly pulls the **TH line (Port `$DD` bit 6)** low.
4.  The VDP detects this sudden TH transition and instantly **latches (freezes) the current horizontal and vertical coordinate counters** (`hcounter` and `vcounter`) of the TV's rendering beam.
5.  The CPU reads these latched coordinates from VDP memory to calculate exactly where on the screen you pointed and shot!

---

## 7. SMS Architecture Quick Reference

*   **Master Clock:** 10.73858 MHz (NTSC) / 10.73858 MHz (PAL)
*   **CPU Clock:** 3.58 MHz (Master Clock / 3)
*   **System RAM:** 8KB (Mapped at `$C000 - $DFFF`, mirrored at `$E000 - $FFFF`)
*   **VRAM:** 16KB (Accessed through VDP I/O Ports `$BE` and `$BF`)
*   **CRAM (Color RAM):** 32 bytes (16 colors for backgrounds, 16 colors for sprites)
*   **PSG Audio:** 3 square wave channels, 1 noise channel, 16 volume levels.
*   **Video Output Resolution:** 256x192 pixels (standard), up to 256x240 (overscan).