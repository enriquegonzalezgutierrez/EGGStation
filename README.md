# EGGStation

> A highly decoupled, offline-first, performance-optimized Sega Master System (SMS) & SG-1000 console emulator implemented in Vanilla ES6+ JavaScript.

EGGStation is engineered with a strict separation of concerns, isolating hardware-specific logic, processor modeling, and representation. Designed to run completely local (`file://` protocol) without the need for a web server, it showcases how advanced emulator architecture, WebGL2 shaders, and Web Audio DSP pipelines can be implemented with zero external dependencies.

---

## 1. Architectural Architecture & SOLID Principles

EGGStation rejects monolithic tightly-coupled structures. Instead, it partitions the hardware ecosystem into distinct layers according to **Domain-Driven Design (DDD)** and **SOLID** principles:

```
                                  +------------------------------------+
                                  |         Presentation Layer         |
                                  |    (UIController / HTML5 / CSS3)   |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |          Application Layer         |
                                  |      (EmulatorOrchestrator.js)     |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |         Infrastructure Layer       |
                                  |      (VDP, PSG, State Serializer)  |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |            Domain Layer            |
                                  |   (CPU, ALU, System Bus, Cartridge)|
                                  +------------------------------------+
```

*   **Domain Layer:** Encapsulates the core physical behavior of the console hardware (Z80 execution, registers, physical memory mapping, DB-9 pinout emulation). It is entirely decoupled from the browser runtime.
*   **Infrastructure Layer:** Implements standard visual engines (VDP renderers), audio engines (PSG), and state serializers utilizing browser APIs (Canvas, Web Audio, IndexedDB).
*   **Application Layer:** Orchestrates the runtime loop, clock cycles synchronization, frame pacing, and manages the execution flow between Domain and Infrastructure.
*   **Presentation Layer:** Handles CSS responsivity, mobile touch gamepad HUD layout, settings drawer, and WebGL context display bounds.

---

## 2. Core Engineering Highlights

### Contiguous Typed Array Memory Allocation
To ensure temporal locality and maximize execution speeds inside the browser's engine (such as V8), EGGStation bypasses standard JavaScript arrays for performance-critical regions.
*   The **8KB System Work RAM**, the **16KB VRAM**, and the **32-byte CRAM** are allocated as contiguous byte-buffers using `Uint8Array`.
*   This approach prevents dynamic array resizing and memory fragmentation, lowering garbage collection overhead during hot-path render loops.

### Decoupled Zilog Z80 Processor
The Z80 CPU implementation separates execution control, state representation, and mathematical computations:
*   **Z80Registers (`Z80Registers.js`):** Encapsulates primary, alternate (shadow), index, and special registers. Handles 16-bit virtual packing/unpacking natively.
*   **Z80ALU (`Z80Alu.js`):** Contains pure, deterministic mathematical functions (ADC, SBC, shifts, rotations) and maintains pre-computed parity lookup tables.
*   **Opcodes Division:** Opcodes are divided into distinct functional registries (`Z80Arithmetic`, `Z80Bitwise`, `Z80DataTransfer`, etc.), mapped dynamically to prevent large nested switch/case statements.

### Zero-Allocation Hot Path & Hardware-Accelerated Audio
The custom SN76489-compatible audio generator (`Sega315_5124_Psg.js`) has been optimized to play cleanly offline under local contexts:
*   **Offline-Safe Audio Synthesizer:** Implemented via standard `ScriptProcessorNode` to guarantee full functionality under `file://` protocols, avoiding CORS restrictions associated with external worker files.
*   **Web Audio DSP Graph:** Offloads heavy mathematical post-processing to the browser's native C++ backend:
    *   **Arcade Warmth:** Hardware-accelerated Biquad Filter (Low-pass) cutting off frequencies above 3.5kHz.
    *   **Haas Stereo:** Native `DelayNode` routing delayed audio (20-25ms) to a dedicated `StereoPannerNode` to generate a spacious stereophonic soundstage.
    *   **Acoustic Atmos:** Synthesizes an impulse response (IR) modeling an analog wood arcade cabinet on the fly, feeding it into a native `ConvolverNode` for real-time room reflections.

### GPU Shaders & Advanced Video Rendering
Visual processing is split between CPU upscalers and GPU hardware acceleration:
*   **CPU Scalers:** Custom zero-allocation software upscalers (`Scale2X`, `Scale4X`, `NTSC Bleed`, and half-toning scanlines) are processed cleanly into visual frames.
*   **WebGL2 Shader Pipeline:** Compiles a native vertex/fragment shader layout mimicking a high-contrast CRT-Royale monitor:
    *   Analog sub-pixel emulation (aperture grille phosphor triads).
    *   CRT curvature barrel distortion.
    *   Organic vignette edge clipping.
    *   Horizontal color bleeding.

### IndexedDB Binary State Serializer
Standard emulators stringify memory states into JSON to save them inside `localStorage`, which crashes under the 5MB browser quota limit.
*   EGGStation uses **IndexedDB** (`WebIndexedDBSerializer.js`) to handle state storage.
*   By leveraging the native **Structured Clone Algorithm**, binary typed arrays (`vRam`, `colorRam`, `systemWorkRam`, and `cartridgeRam`) are saved as contiguous byte blobs directly, ensuring fast and robust state saving with practically unlimited capacity.

---

## 3. Responsive UX Architecture

The presentation layer (`css/main.css`) implements a responsive layout optimized for varied screen form factors and input types:

| Layout State | Trigger Conditions | Video Presentation | Input Mapping | Menu Accessibility |
| :--- | :--- | :--- | :--- | :--- |
| **Desktop** | Viewport width > 900px | Centered CRT Canvas with glowing border | Keyboard / Physical USB Gamepad | Floating Glassmorphism settings panel |
| **Mobile Portrait** | Width <= 900px, Portrait | Top-aligned pixel-scaled Canvas | Virtual on-screen D-Pad and Action Buttons (designed for thumbs) | Collapsible Settings Drawer via overlay button |
| **Mobile Landscape** | Max height <= 500px, Landscape | Immersive 100% full-screen Canvas | Translucent overlaid D-Pad and Buttons in corners | Auto-hidden settings panel for distraction-free play |

---

## 4. Hardware Component Communication

The system mirrors the physical Sega Master System bus layout, orchestrating read/write signals (/MREQ and /IORQ) between subsystems:

```mermaid
graph TB
    subgraph Core System
        CPU[Zilog Z80 CPU Core] <-->|Memory & Port cycles| BUS[Sega Master System Bus]
    end

    subgraph Memory Space
        BUS <-->|/MREQ: 0xC000 - 0xFFFF| WRAM[8KB System Work RAM]
        BUS <-->|/MREQ: 0x0000 - 0xBFFF| MAPPER[Active Cartridge Mapper Strategy]
        MAPPER <-->|Paged Slices| CART[Sega Master System Cartridge]
    end

    subgraph I/O Peripheral Space
        BUS <-->|/IORQ: 0x40 - 0xBF| VDP[Sega 315-5124 VDP]
        BUS --->|/IORQ: 0x40 - 0x7F| PSG[Sega 315-5124 PSG]
        BUS <-->|/IORQ: 0xC0 - 0xFF| IO[Sega 315-5297 Controller Chip]
    end

    style CPU fill:#2d2d30,stroke:#3e3e42,stroke-width:2px,color:#fff
    style BUS fill:#7f00ff,stroke:#5a00b3,stroke-width:2px,color:#fff
    style VDP fill:#1f1f23,stroke:#2d2d30,stroke-width:2px,color:#fff
    style PSG fill:#1f1f23,stroke:#2d2d30,stroke-width:2px,color:#fff
    style IO fill:#1f1f23,stroke:#2d2d30,stroke-width:2px,color:#fff
    style MAPPER fill:#1f1f23,stroke:#2d2d30,stroke-width:2px,color:#fff
```

---

## 5. Input Configuration & Controls

EGGStation supports three simultaneous input methods. Keyboard mappings and standard physical USB controllers map directly onto Player 1.

### Primary Input Mappings
*   **Arrow Keys** / **D-Pad / Left Analog Stick:** D-PAD Directions
*   **Key Z** / **Controller Button 0 (A/Cross):** Gamepad Button 1 (TL Line)
*   **Key X** / **Controller Button 1 (B/Circle):** Gamepad Button 2 (TR Line)
*   **Key P:** Pause Emulator Loop (Toggle)
*   **Key O** / **Controller Button 9 (Start):** Physical Console Pause Button (NMI)
*   **Key `\` (Hold):** Fast-Forward Mode
*   **F2:** Save State (IndexedDB)
*   **F3:** Load State (IndexedDB)

---

## 6. Directory Structure

```
EGGStation/
├── index.html                       # Entry-point file (Open directly in browser)
├── css/
│   └── main.css                     # Responsive Layout & Presentation CSS
├── js/
│   ├── app.js                       # Composition Root (Bootstrap)
│   ├── application/
│   │   └── EmulatorOrchestrator.js  # Main Execution & Sync Loop
│   ├── domain/
│   │   ├── bus/
│   │   │   └── SegaMasterSystemBus.js
│   │   ├── cartridge/
│   │   │   ├── SegaMasterSystemCartridge.js
│   │   │   └── mappers/             # Sega, Codemasters, Korean Strategies
│   │   ├── controller/
│   │   │   └── Sega315_5297.js
│   │   └── cpu/
│   │       ├── Z80Registers.js
│   │       ├── Z80Alu.js
│   │       ├── ZilogZ80.js          # Core CPU Orchestration
│   │       ├── Z80Disassembler.js
│   │       └── instructions/        # Decoupled Z80 instruction files
│   └── infrastructure/
│       ├── audio/
│       │   └── Sega315_5124_Psg.js  # Web Audio Engine & DSP Graph
│       ├── video/
│       │   ├── Sega315_5124_Vdp.js  # Main VDP Engine
│       │   ├── VdpPostProcessor.js  # CPU Scalers & WebGL2 CRT Shader
│       │   ├── VdpMode2Renderer.js
│       │   ├── VdpMode4Renderer.js
│       │   └── VdpSpriteManager.js
│       └── storage/
│           └── WebLocalStorageSerializer.js # IndexedDB States Serializer
```

---

## 7. License and Authorship

*   **Project Name:** EGGStation SMS Emulator
*   **Author:** Enrique González Gutiérrez
*   **Technology Stack:** Vanilla JavaScript (ES6+), WebGL2, Web Audio API, IndexedDB.
*   **License:** Distributed under the terms of the MIT License. See [LICENSE](LICENSE) for details.