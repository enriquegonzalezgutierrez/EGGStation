# Super Nintendo Entertainment System (SNES)
## Technical Hardware Manual: A Beginner's Guide to 16-Bit Architecture

Welcome, developer! This manual is designed to explain the inner physical workings of the Super Nintendo (SNES) and Super Famicom hardware. If you are transitioning from 8-bit architectures (like the Sega Master System or NES), this guide will translate complex 16-bit co-processing, DMA channels, audio DSP synthesis, and Mode 7 affine matrices into clear, digestible concepts.

---

## 1. The Film Studio Analogy (How the 16-Bit System Works)

If an 8-bit console is like a theater play, the 16-bit Super Nintendo is like a full **film studio**:

```
+-------------------------------------------------------------------------+
|                            THE FILM STUDIO                              |
|                                                                         |
|  +--------------------+      +--------------------+      +-----------+  |
|  |    THE PRODUCER    |      |    ART DIRECTOR    |      |SOUND SUPRV|  |
|  | (Ricoh 5A22 CPU)   |      |  (Dual-Chip PPU)   |      | (Sony APU)|  |
|  +---------+----------+      +---------+----------+      +-----+-----+  |
|            |                           |                       |        |
|            +------------+--------------+-----------------------+        |
|                         |                                               |
|                         v                                               |
|              =======================                                    |
|               THE SYSTEM ADDRESS BUS                                    |
|              =======================                                    |
|                         |                                               |
|            +------------+------------+                                  |
|            |                         |                                  |
|            v                         v                                  |
|  +--------------------+    +--------------------+                       |
|  |     THE SCRIPT     |    |    THE RECORD BOOK |                       |
|  |    (Game ROM)      |    |   (128KB WRAM)     |                       |
|  +--------------------+    +--------------------+                       |
+-------------------------------------------------------------------------+
```

*   **The Ricoh 5A22 CPU (The Producer):** Coordinates everything, manages overall logic, and handles the "budget" (system clocks and interrupts). It doesn't draw or make music directly; it hires specialists.
*   **The Dual-Chip PPU (The Art Director):** A specialized dual-processor graphics unit (PPU1 and PPU2) dedicated exclusively to drawing background layers, sprites, transparencies, and scaling matrices.
*   **The Sony APU (The Sound Supervisor):** A completely independent computer subsystem (CPU + DSP + RAM) dedicated entirely to musical composition and wave synthesis.
*   **WRAM, VRAM, and ROM:** The cartridge ROM is the script. The system has 128KB of main Work RAM (scratchpad), 64KB of VRAM (graphics RAM), 512 bytes of CGRAM (palettes), and 512 bytes of OAM (sprite attributes).

---

## 2. Chapter 1: The Ricoh 5A22 CPU (The Producer)

The main CPU of the SNES is the **Ricoh 5A22**, a custom processor based on the 16-bit **WDC 65C816** core. It runs at variable clock speeds up to **3.58 MHz** (typically dropping to 2.68 MHz or 1.79 MHz depending on which memory areas it is reading).

### Dynamic 8-bit / 16-bit Switching (The Sliding Door)
Unlike static CPUs, the Ricoh 5A22 is a **hybrid processor**. It can change its internal registers between 8-bit and 16-bit modes dynamically on-the-fly:
*   The CPU contains a Status Register (`SR`) with two special flags:
    *   **M Flag (Memory Select):** If set to `1`, the Accumulator register (`A`) acts as an **8-bit** register. If cleared to `0`, it instantly expands to a **16-bit** register.
    *   **X Flag (Index Select):** If set to `1`, the Index registers (`X` and `Y`) act as **8-bit** registers. If cleared to `0`, they expand to **16-bit** registers.
*   **Why do this?** Running in 8-bit mode is faster and consumes fewer cycles when dealing with small numbers. Switching to 16-bit mode allows the CPU to process large coordinates and math in a single cycle.

### ROM Speeds: SlowROM vs FastROM
The SNES address bus can run at different cycle speeds:
*   **SlowROM:** Older or cheaper cartridges can only respond to reads at **2.68 MHz**. The CPU must waste clock cycles waiting for the cartridge to return data (causing wait-states).
*   **FastROM:** Enhanced cartridges can respond at **3.58 MHz**. Writing a `1` to the system control register `$420D` enables FastROM speed cycles, speeding up execution for banks `$80` and above.

### DMA and HDMA (The Conveyor Belts)
Instead of forcing the CPU to copy large amounts of data manually, the Ricoh 5A22 contains 8 hardware **DMA (Direct Memory Access)** channels:

```
               TRADITIONAL CPU COPY
+----------+       +--------------+       +----------+
| Read WRAM| ====> | CPU Registry | ====> |Write VRAM|  (Slow: 16 cycles per byte)
+----------+       +--------------+       +----------+

               DIRECT MEMORY ACCESS (DMA)
+----------+     ====================     +----------+
| Read WRAM| ===  HIGH SPEED BYPASS  ===> |Write VRAM|  (Fast: 8 cycles per byte,
+----------+     ====================     +----------+   bypasses CPU)
```

1.  **Standard DMA (Block Copy):** Used during V-Blank. The CPU freezes, and a dedicated high-speed conveyor belt copies data (like graphics and sprites) directly from WRAM to VRAM at a rate of 1 byte per 8 master clock cycles, bypassing the CPU entirely.
2.  **HDMA (Horizontal DMA):** Used during H-Blank. It automatically copies small amounts of data (such as scrolling offsets or color palettes) to specific hardware registers **on every single scanline**. This allows for impressive visual effects like curved water lines, perspective backgrounds, and parallax scrolling with zero CPU overhead.

---

## 3. Chapter 2: The 24-Bit Addressing Map

The SNES uses a **24-bit Address Bus**, meaning the CPU can address up to $2^{24} = 16,777,216$ bytes (**16 Megabytes**) of memory space, divided into 256 banks of 64KB each.

```
Address: [ Bank: 8 bits ] [ Offset: 16 bits ] (e.g. $7E:0000)
```

The system memory is mapped across these banks using standard hardware rules:

```
Bank $00-$3F | Bank $80-$BF (Low Banks)   Bank $7E-$7F (Work RAM Banks)
+-----------------------------------+     +-----------------------------------+
| $0000 - $1FFF: 8KB WRAM Mirror    |     |                                   |
+-----------------------------------+     |                                   |
| $2100 - $21FF: PPU I/O Registers  |     |                                   |
+-----------------------------------+     |   128KB System Work RAM           |
| $4200 - $43FF: CPU/DMA Registers  |     |   (Linear access to WRAM)         |
+-----------------------------------+     |                                   |
| $8000 - $FFFF: LoROM Cartridge    |     |                                   |
|                ROM segment        |     |                                   |
+-----------------------------------+     +-----------------------------------+
```

*   **WRAM Mirror (`$0000 - $1FFF`):** The first 8KB of main Work RAM is mirrored at the bottom of the low banks for high-speed direct-page access.
*   **PPU I/O Registers (`$2100 - $21FF`):** Memory-mapped ports used to control screen modes, layers, palettes, and sprite attributes.
*   **CPU/DMA Registers (`$4200 - $43FF`):** Memory-mapped ports used to control interrupts, multiplication/division hardware registers, and configure the 8 DMA channels.

---

## 4. Chapter 3: The Painter - Dual-Chip VDP/PPU

The SNES graphics system is composed of two separate custom chips: **PPU1** (handles tile rendering, scrolling, and matrix calculations) and **PPU2** (handles palette RAM, sprite priority sorting, windows clipping, and final color blending).

The system has **64KB of VRAM** dedicated exclusively to holding tile patterns, background maps, and sprite patterns.

### PPU Registers & Memory Spaces
The PPU organizes graphics into three separate internal memories:
*   **VRAM (64KB):** Holds tile patterns and background layout grids (Name Tables).
*   **CGRAM (512 bytes):** Holds 256 color palette entries (15-bit RGB colors).
*   **OAM (Object Attribute Memory - 544 bytes):** Holds attributes for up to 128 sprites (X, Y, tile index, palette index, priority, and size).

### Screen Modes (Mode 0 to Mode 7)
The SNES can configure its background layers into 8 distinct modes:
*   **Mode 1:** The most common mode (used in *Super Mario World*). It provides 3 background planes: two 16-color planes (4bpp) and one 4-color plane (2bpp), plus sprites.
*   **Mode 3:** Used for detailed backgrounds (like *Metroid*). It provides one 256-color plane (8bpp) and one 16-color plane (4bpp).
*   **Mode 7 (The Affine Matrix Mode):** The SNES's signature mode. It provides a single 256-color background plane that can be rotated, scaled, stretched, skewed, and projected in real-time.

```
                        MODE 7 AFFINE MATRIX MATH
                        
    [ x' ]   [ A   B ]   [ x - x0 ]   [ x0 ]
    [    ] = [       ] * [        ] + [    ]
    [ y' ]   [ C   D ]   [ y - y0 ]   [ y0 ]
    
    * A, B, C, D: Transformation matrix coefficients (Scale, Rotation, Skew)
    * x0, y0: Origin point coordinates (Anchor pivot)
    * x', y': Output target VRAM coordinates to render
```

By calculating this matrix equation for every pixel on the scanline, the PPU can map a flat 2D texture (up to 1024x1024 pixels) to look like a 3D floor plane.

---

## 5. Chapter 4: The Layer Compositor & Color Math

Once the PPU has rendered the backgrounds (BGs) and sprites (OBJ), it must stack them onto the screen.

```
       [ TOP LAYER ]   Sprite / OBJ  (Highest priority)
             ^
             |         Background 1  (High priority)
             |         Background 2  (Medium priority)
             |         Background 3  (Low priority)
       [ BACKDROP  ]   Base Backdrop Color (Palette index 0)
```

The VDP determines which pixel is visible at any screen coordinate by scanning down this stack of layers from top to bottom, checking for priority flags and transparency (Color 0).

### Color Math Blending (Transparencies)
The SNES can blend the pixels of different layers together in real-time to create water, fog, glass, and shadow effects:
*   **Main Screen:** The primary canvas showing the background layers and sprites.
*   **Sub Screen:** An alternate, hidden canvas.
*   **Math Equations:** If color math is enabled, the PPU takes the RGB values of the pixel on the Main Screen ($C_{\text{main}}$) and the pixel on the Sub Screen ($C_{\text{sub}}$) and blends them:
    *   **Addition:** $C_{\text{final}} = C_{\text{main}} + C_{\text{sub}}$ (Creates glow, fire, or glass effects).
    *   **Subtraction:** $C_{\text{final}} = C_{\text{main}} - C_{\text{sub}}$ (Creates shadows, night, or underwater effects).
    *   **Halving:** The result can be halved ($C_{\text{final}} / 2$) to create true alpha-transparency.

### Window Clipping (The Mask Masks)
The SNES has two hardware **Windows** that can mask or clip specific regions of the screen. Think of a window as a cookie cutter:
*   It defines a horizontal range (`window1Left` to `window1Right`).
*   Any graphic inside (or outside) this range can be clipped (hidden) or selected for color math.
*   This is used to create spotlight transitions, text boxes, circular wipes, and custom-shaped shadows.

---

## 6. Chapter 5: The Sound Supervisor - Sony APU

The SNES audio subsystem (APU) is a completely self-contained computer. It operates independently of the main CPU, having its own dedicated CPU, DSP, and RAM.

```
   Ricoh 5A22 CPU                            Sony APU
+-------------------+   I/O Ports $2140      +-------------------+
| Runs Game Code    | =====================> | SPC700 CPU        | === Wave Data ===> SnesDsp Synthesizer === Audio Out
| Writes Sound data |   $2143 (Handshake)    | 64KB Audio RAM    |
+-------------------+                        +-------------------+
```

The main CPU writes music files and sound driver code to the APU through four communication ports: **`$2140 - $2143`**.

### The Sony SPC700 CPU (The Sound Conductor)
The APU contains the **Sony SPC700**, an 8-bit CPU running at **1.024 MHz**. 
*   It reads its own 64KB RAM space containing the sound driver (like Capcom’s driver or Nintendo's Kankichi driver) and instrument wave data.
*   It executes instructions to sequence tracks, update instrument pitches, and trigger channels on the DSP.

### The Sound DSP & BRR Decompression
The **Sound DSP** is a dedicated 8-channel synthesizer:
*   **8 ADPCM Channels:** The DSP can play up to 8 independent voices simultaneously.
*   **BRR (Bit Rate Reduction) Decompression:** To save space on cartridges, SNES audio samples are compressed using BRR. The DSP reads these compressed blocks and decompresses them on-the-fly into 16-bit PCM waveforms.
*   **Gaussian Interpolation:** Since sampled instruments are played at different pitches (which requires stretching or shrinking the wave), the DSP applies a **Gaussian interpolation filter** (using a static curve table) to smooth out the steps of the wave, preventing digital aliasing and producing the SNES's signature warm, organic sound.
*   **ADSR & GAIN Envelopes:** Each channel has dedicated registers to shape the volume envelope of the instrument (Attack, Decay, Sustain, Release) or modulate it using a custom GAIN factor.

---

## 7. SNES Architecture Quick Reference

*   **Master Clock:** 21.47727 MHz (NTSC) / 21.28137 MHz (PAL)
*   **CPU Clock:** Variable (3.58 MHz / 2.68 MHz / 1.79 MHz)
*   **Work RAM (WRAM):** 128KB (Mapped at `$7E:0000 - $7F:FFFF`)
*   **VRAM:** 64KB (Accessed through PPU registers `$2115 - $2119`)
*   **CGRAM (Palette RAM):** 512 bytes (256 colors of 15-bit BGR format)
*   **OAM (Sprite Attributes):** 544 bytes (Supports up to 128 sprites of mixed sizes)
*   **APU CPU (SPC700):** 8-bit, 1.024 MHz with 64KB of dedicated Audio RAM.
*   **Audio Output:** 8-channel stereo ADPCM, 16-bit resolution, 32kHz sampling rate.