# EGGStation: Unified Multi-System UI & Save-State Roadmap

This document outlines the strategic engineering phases required to unify the User Interface (UI), **Developer Diagnostics Suite (Dev Mode)**, and **IndexedDB-backed Savestates** across all three emulated consoles: Sega Master System (SMS), Sega Genesis / Mega Drive (MD), and Super Nintendo (SNES).

---

## 1. Architectural Vision & Goals

The objective is to eliminate peripheral gaps between systems, bringing the advanced diagnostics and temporal controls of the Sega Mark III and Genesis to the Super Nintendo domain.

*   **Responsive UI Alignment:** Maintain a liquid, viewport-locked glassmorphic interface that adapts smoothly to mobile, tablet, and 4K desktop screens without flexbox or grid overlapping issues.
*   **Unified State Persistence:** Expand the asynchronous IndexedDB serialization engine (`WebIndexedDBSerializer`) to capture, restore, and generate thumbnail preview screenshots for all three console platforms.
*   **Monomorphic Dev Mode Diagnostics:** Extend register grids, program disassemblers, and VRAM tile rasterizers so that developers can debug Z80, M68K, and 65816/SPC700 assembly instructions in real-time.

```
       UNIFIED PERSISTENCE & DIAGNOSTICS ARCHITECTURE

  [ Snes / Genesis / SMS Orchestrators ]  ===> [ Snes / Genesis / SMS UI Controllers ]
                   |                                            |
                   | (Capture/Restore State)                    | (Update UI Registers/Disasm)
                   v                                            v
     [ WebIndexedDBSerializer ]                   [ Diagnostic Dev Mode Grid ]
                   |                                            |
                   v (Async Save/Load)                          v (Canvas Rasterizer)
       [ Browser IndexedDB ]                        [ VRAM Pattern Viewer ]
```

---

## 2. Hito 1: Unified Responsive UI & Sidebar Refactoring

Currently, the sidebar holds placeholders for some console configurations. We will re-engineer the presentation layer to standardise control groups.

### Objectives:
*   **Clean DOM Structure:** Restructure `#settings-panel` in `index.html` into generic, reusable flex blocks.
*   **Responsive Viewport Bounds:** Guarantee that `#smsdisplay` and `#webgldisplay` scale smoothly, locking their aspect ratios via CSS (`aspect-ratio: 4/3`) to prevent layout shifting when swapping active console viewports.
*   **Unified Sidebar Panels:**
    *   **Control Panel:** Consolidated system selectors, TV standard switches, and audio DSP options.
    *   **Save State Panel:** A unified canvas thumbnail preview (`#savestateImg`) and triggers (Save/Load) mapped for the active orchestrator.

---

## 3. Hito 2: Universal Savestates & Previews (IndexedDB)

While SMS and MD have state serialization, SNES requires a dedicated state-molding schema to serialize its multi-bus, dual-CPU, and DSP registers.

### Objectives:
*   **SNES State Serialization Schema:** Extend `WebIndexedDBSerializer` to capture and restore the complete internal state of the SNES:
    *   **Ricoh 5A22 CPU:** PC, SR, registers (A, X, Y, DP, SP, DB, PB), and interrupt lines.
    *   **Sony SPC700 APU:** PC, registers, internal APU RAM (64KB), and timer dividers.
    *   **SnesDsp Synthesizer:** Internal registers, volume registers, and channel envelopes.
    *   **SnesPpu Video Core:** VRAM (64KB), CGRAM, OAM, scroll registers, and window masks.
*   **Pre-Allocated Thumbnail Previews:**
    *   Implement an automated `captureScreenshot()` method inside `SnesOrchestrator.js` that copies the active VDP/PPU frame buffer onto a hidden $256 \times 240$ canvas.
    *   Store the canvas string data securely inside IndexedDB as a compressed binary attachment alongside the state registers.
    *   Update the sidebar's `#savestateImg` thumbnail automatically upon saving or loading states.

---

## 4. Hito 3: Universal Dev Mode & CPU Register Grids

Currently, only the Z80 (SMS) and M68K (MD) have fully structured debugger grids. We will standardise the developer suite to dynamically format itself based on the active console.

### Objectives:
*   **Dynamic DOM Register Grid:** When hot-swapping consoles, the presenter will clear the `#reg-grid` and inject the corresponding processor registers:
    *   **SMS Mode:** Renders Z80 registers (AF, BC, DE, HL, IX, IY, SP, PC).
    *   **Genesis Mode:** Renders M68K registers (D0-D7, A0-A7, PC, SR).
    *   **SNES Mode:** Renders Ricoh 65816 registers (A, X, Y, DP, SP, DB, PB, PC, Flags) and secondary Sony SPC700 registers (A, X, Y, SP, PC, Flags).
*   **Unified Disassembly Console:**
    *   Create a lightweight 65816 assembly instruction decoder.
    *   Display 5 lines of disassembly centered around the active Program Counter (PC) in real-time when the developer panel is expanded.

---

## 5. Hito 4: Universal VRAM Pattern Tile Visualizer

We will expand the diagnostic `#vram-canvas` to decode and render the raw graphics memory of all three systems.

### Objectives:
*   **Universal Tile Rasterizer:**
    *   **Sega SMS (Hito Complete):** Decodes 4bpp planar tiles (`$0000 - $3FFF`) using the active CRAM background palette.
    *   **Sega Genesis (Hito Complete):** Decodes 4bpp Genesis tiles using the active VDP CRAM registers.
    *   **Super Nintendo (Pending):** Implement a dynamic VRAM tile scanner. Since SNES supports multiple tile formats (2bpp, 4bpp, 8bpp depending on active screen mode), the rasterizer will detect the current PPU mode and render tiles onto the diagnostic canvas in real-time.

---

## 6. Hito 5: Unified Input Gamepads & Shortcuts

We will unify controller configurations and keyboard hotkeys across all systems.

### Objectives:
*   **Standardized Keyboard Shortcuts:**
    *   `F2` / `F3`: Save and Load state across all three systems.
    *   `Backspace` (Hold): Universal real-time gameplay rewind.
    *   `\`: Universal fast-forward toggle.
*   **Universal Gamepad Poller:** Map generic USB/Bluetooth controllers to standard SNES layouts (`SnesUIController.js`), falling back cleanly to standard layouts for SMS/Mark III and Sega Genesis.