# EGGStation

> A highly decoupled, responsive, offline-first, and performance-optimized Multi-System Console Emulator supporting Sega Master System (SMS), Sega Genesis / Mega Drive (MD), and Super Nintendo (SNES), implemented in Vanilla ES6+ JavaScript.

![EGGStation Visualizer](img/eggstation-visualizer.png)

---

## 1. Architectural Overview

EGGStation is engineered with a strict division of concerns, separating console-specific hardware logic, core processor modeling, and presentation abstractions. Rather than adhering to the tight-coupling paradigms common in monolithic emulators, this system decouples core hardware modules using **Domain-Driven Design (DDD)** and **SOLID** principles. This modular design allows Sega and Nintendo hardware domains to execute independently inside the same application container while sharing a robust universal infrastructure.

The codebase is organized into highly decoupled architectural layers:

```text
                                  +------------------------------------+
                                  |         Presentation Layer         |
                                  | (UniversalInput / HTML5 / CSS3)    |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |          Application Layer         |
                                  |    (System-Specific Orchestrators) |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |    Universal Shared Infrastructure |
                                  | (WebGL2 CRT, IndexedDB, Web Audio) |
                                  +-----------------+------------------+
                                                    |
                                                    v
                                  +------------------------------------+
                                  |            Domain Layer            |
                                  | (Shared CPUs, System Bus, Mappers) |
                                  +------------------------------------+
```

*   **Presentation Layer (Home Dashboard v3):** Houses the boot system carousel, the responsive fullscreen modal pages (**Creator Dossier** and **Legal Disclaimer**), and mobile virtual gamepad touch bindings. It segregates UI routing from emulation loop timelines.
*   **Application Layer:** Orchestrates the system's runtime loop, clock cycles synchronization, fast-forward states, temporal physics (rewind/stepping), and routes inputs through standardized managers (`SmsOrchestrator`, `GenesisOrchestrator`, `SnesOrchestrator`).
*   **Universal Shared Infrastructure:** A centralized suite of high-performance modules (`UniversalPostProcessor`, `UniversalAudioProcessor`, `IndexedDbManager`, `LibraryManager`, `RomDecompressor`) providing GPU-accelerated rendering, audio synthesis, file indexing, and async decompression.
*   **Domain Layer:** Models the core abstract hardware behavior, registers, execution clocks, address buses, and cartridge structures. It remains entirely isolated from browser-specific environments.

---

## 2. Hardware Architecture Deep-Dives

For an in-depth, low-level explanation of each console's physical hardware, custom chips, memory mapping structures, and execution timings, refer to the dedicated hardware deep-dive manuals below:

*   [Sega Master System & Mark III Hardware Specifications (SMS.md)](./SMS.md)
*   [Sega Genesis & Mega Drive Hardware Specifications (MD.md)](./MD.md)
*   [Super Nintendo (SNES) Hardware Specifications (SNES.md)](./SNES.md)

---

## 3. Hardware Component Interactions

### Sega Master System / Sega Mark III
The Sega Master System relies on a central Zilog Z80 processor interacting with dedicated hardware chips over a shared 16-bit Address Bus and 8-bit Data Bus.

```text
graph TB
    subgraph Core System
        CPU[Shared Zilog Z80 CPU Core] <-->|Memory & Port cycles| BUS[Sega Master System Bus]
    end

    subgraph Memory Space
        BUS <-->|/MREQ: 0xC000 - 0xFFFF| WRAM[8KB System Work RAM]
        BUS <-->|/MREQ: 0x0000 - 0xBFFF| MAPPER[Active Cartridge Mapper Strategy]
        MAPPER <-->|Paged Slices| CART[Sega Master System Cartridge]
    end

    subgraph I/O Peripheral Space
        BUS <-->|/IORQ: 0x40 - 0xBF| VDP[Sega 315-5124 VDP]
        BUS --->|/IORQ: 0x40 - 0x7F| PSG[Shared Sega PSG]
        BUS <-->|/IORQ: 0xC0 - 0xFF| IO[Sega 315-5297 Controller Chip]
    end
```

### Sega Genesis / Mega Drive
The Sega Genesis coordinates execution between two distinct Central Processing Units (a primary Motorola 68000 and a secondary Zilog Z80) communicating via asynchronous bus request lines, and synchronizes synthesis commands with the Yamaha YM2612 FM and TI SN76489 PSG chips:

```text
graph TB
    subgraph Core System
        M68K[Shared Motorola 68000 CPU] <-->|Memory & I/O cycles| MBUS[Genesis Bus M68K]
    end

    subgraph Audio Subsystem
        MBUS <-->|BUSREQ / RESET / Window| ZBUS[Genesis Bus Z80]
        ZBUS <-->|Instruction cycles| Z80[Shared Zilog Z80 CPU]
        ZBUS <-->|FM Commands| YM[Yamaha YM2612 FM Synthesizer]
        MBUS <-->|PSG Commands| PSG[Shared Sega PSG]
    end

    subgraph Graphics Subsystem
        MBUS <-->|VDP Port Registers $C00000| VDP[Genesis VDP Video Core]
        VDP <-->|Render Line| VRAM[VRAM / CRAM / VSRAM]
    end
```

### Super Nintendo (SNES) / Super Famicom
The Super Nintendo relies on the 16-bit Ricoh 5A22 CPU coordinating execution alongside the Sony SPC700 sound CPU and a dual-chip custom Picture Processing Unit (PPU) over a multi-bus architecture:

```text
graph TB
    subgraph Core System
        CPU[Ricoh 5A22 65816 CPU Core] <-->|Memory & Bus cycles| BUS[Unified System Memory Bus]
    end

    subgraph Audio Subsystem
        BUS <-->|I/O Ports $2140-$2143| APU[SnesApu Orchestrator]
        APU <-->|SPC700 Instruction Cycles| SPC[SnesSpc Core]
        APU <-->|Wave Synthesis & ADSR Envelopes| DSP[SnesDsp Synthesizer]
    end

    subgraph Graphics Subsystem
        BUS <-->|VRAM Registers $2100-$213F| PPU[SnesPpu Compositor]
        PPU <-->|Render Line| VRAM[16KB VRAM / CGRAM / OAM]
    end

    subgraph Storage & Mapping
        BUS <-->|Cartridge Address space| CART[SnesCartridge Strategy]
        CART <-->|Auto-mapping| ROM[ROM Buffer]
    end
```

---

## 4. Key Processor Decoupling & Shared Infrastructure

Following the **Single Responsibility Principle (SRP)**, the emulation of all central processors has been completely decoupled and consolidated into a `shared` core library (`js/shared/`). The processors do not mutate memory directly, nor do they embed flag-setting mathematical routines inside instruction cycles.

*   **Zilog Z80 Shared CPU Core (`ZilogZ80.js`):** Coordinates 8-bit instruction fetching, registers mapping, and flag operations, remaining entirely agnostic of the memory mapper strategies. Inherited natively by both the Sega Master System and the Sega Genesis sound coprocessor.
*   **Motorola 68000 Shared CPU Core (`m68k.js`):** Models the 16/32-bit linear address pipeline of the master Genesis processor, handling 12 hardware addressing modes, interrupts masking, and exception vectors. Ready to be reused by future Neo-Geo or Arcade cores.
*   **Ricoh 5A22 65816 CPU Core (`SnesCpu.js`):** Emulates the 8/16-bit 6502-compatible CPU, completely segregating addressing modes, data transfers, and logical operations into clean prototype-extended modules for fast JIT compilation.
*   **Sony SPC700 CPU Core (`SnesSpc.js`):** Emulates the custom 8-bit sound CPU inside the Super Nintendo, managing register state boundaries and mapping execution instructions.

---

## 5. Key Design Patterns and Implementations

### Polymorphic Console Registry (`ConsoleRegistry` - OCP)
To satisfy the **Open/Closed Principle (OCP)**, the emulator bootstrapper inside `app.js` has been completely decoupled from rigid, hardcoded conditional checks (`switch/case`).
*   A self-initializing global `ConsoleRegistry` pattern allows emulator core controllers to dynamically register their factory constructors upon loading.
*   Adding a new system (such as NES or Game Boy) requires zero changes to the core application loading pipelines, making the environment infinitely extensible without core modifications.

### Decoupled Memento State Serialization (`serializeState` - SRP)
The system-specific Orchestrators have been freed of the state-mapping burdens of internal CPU, PPU, and APU registers.
*   Each hardware chip is individually responsible for capturing and restoring its own states via decoupled `.serializeState()` and `.deserializeState()` methods (following the **Memento Pattern**).
*   This encapsulates internal registers and memory structures within their respective domain entities, ensuring that modifying a chip’s internal properties will not break or require changes to the Application's orchestrator pipelines.

### Dynamic & Persistent Games Library (`LibraryManager` - SRP)
EGGStation discards rigid pre-compiled ROM lists. It implements a fully dynamic collection manager (`LibraryManager.js`) reading directly from the user's IndexedDB.
*   **Zero-friction Auto-caching:** Any ROM booted via Drag-and-Drop or the Selection Carousel is automatically cloned and registered in the database.
*   **Dynamic Vector Covers:** Renders minimal, console-themed SVG cartridges on-the-fly, generating unique titles and layout badge tags dynamically.
*   **Collection Management:** Provides persistent removal buttons (✖) to let users manage their offline collections.

### Strategy and Factory Patterns (Cartridge Auto-Mapping)
Cartridge PCBs utilized custom bank-switching mapper chips to address memory beyond standard CPU boundaries. EGGStation handles this via a dynamic **Strategy Pattern** decided by a **Factory Pattern** at startup:
*   **SMS Mappers:** Sega, Codemasters, and Korean mapper subclasses handle custom paging automatically.
*   **SnesCartridge strategy:** Auto-detects LoROM or HiROM cart mappings by scanning the title checksums and complement structures at `$7FC0` and `$FFC0` on boot.
*   **Universal RomDecompressor:** Asynchronously inspects `.zip` file streams, identifies valid console extensions, and extracts binary payloads entirely in-memory.

### CPU-GPU Hybrid Scaling & CRT-Royale Shaders
Transferring high-resolution pixel buffers from CPU memory to the GPU is a major bottleneck. EGGStation resolves this using a **Hybrid Scaling Pipeline** (`UniversalPostProcessor.js`):
*   **WebGL2 Hardware Shaders:** Renders an immersive, curvature-corrected CRT-Royale display using discrete GPU fragment shaders, including aperture grille sub-pixels, analog halation (bloom), and sine-wave scanline synthesis.
*   **Hybrid CPU Scale4X:** For older devices, the CPU executes the initial `Scale2X` algorithm (optimized using *Loop Boundary Separation*) to round vector curves at `2X`, letting the browser's CSS handle the final scale to `4X`. Reduces PCI-E bus loads by 75%.

### Proportional Dynamic Rate Control (DRC)
To solve synchronization drift caused by non-deterministic browser thread events, EGGStation implements an advanced **Closed-Loop Proportional Dynamic Rate Control (DRC)** system:
*   The `UniversalAudioProcessor` measures absolute **Clock Drift** ($e = \text{targetDrift} - \text{drift}$), tracking how many cycles the CPU is executing ahead of or behind the actual physical audio card playback.
*   A proportional feedback loop continuously throttles or accelerates the emulated clock cycles by up to **$\pm 8\%$** of native speeds, keeping the 32,768-sample audio ring buffer in equilibrium and eliminating clicks or stutters.

---

## 6. Input Mappings & Controls

EGGStation implements a highly decoupled **`UniversalInputManager`** and a **`UniversalDragDropHandler`** to provide an immersive, tactile experience out of the box:

*   **Drag-and-Drop Loader:** Drag any `.sms`, `.md`, `.sfc`, or `.zip` file directly onto the CRT TV screen to auto-boot the appropriate console in real-time.
*   **Programmatic Audio-Haptics:** Synthesizes low-latency mechanical switch click sounds via the Web Audio API on all UI interactions, and triggers 15ms micro-vibrations (`navigator.vibrate`) on mobile virtual D-Pads.

### Keyboard Layout
*   **Arrow Keys:** D-PAD Directions
*   **Key Z:** SMS Button 1 / Genesis Button A / SNES Button B
*   **Key X:** SMS Button 2 / Genesis Button B / SNES Button A
*   **Key C:** Genesis Button C / SNES Button R
*   **Key A:** Genesis Button X / SNES Button Y
*   **Key S:** Genesis Button Y / SNES Button X
*   **Key D:** Genesis Button Z / SNES Button L
*   **Shift:** SNES Select Button
*   **Enter:** Genesis Start / SNES Start Button
*   **Backspace:** Hold to activate Real-Time Rewind
*   **F2 / F3:** Save State / Load State

### Physical Gamepads Layout (Standard Mapping)
*   **D-Pad / Left Analog Stick:** D-PAD Directions
*   **Button South (A on Xbox / B on Nintendo):** Button B
*   **Button West (X on Xbox / Y on Nintendo):** Button Y
*   **Button East (B on Xbox / A on Nintendo):** Button A
*   **Button North (Y on Xbox / X on Nintendo):** Button X
*   **Left Bumper (L1):** Left Shoulder (L)
*   **Right Bumper (R1):** Right Shoulder (R)
*   **Left Trigger (L2):** Real-Time Rewind
*   **Right Trigger (R2):** Fast Forward
*   **Button Select (Back):** Select Button
*   **Button Start (Start):** Start Button

### Home Dashboard Navigation (Teclado / Gamepad)
*   **[Left / Right] Arrows / D-Pad:** Navigate horizontally between active System Console cards.
*   **[Up / Down] Arrows / D-Pad:** Switch focus vertically between the top Menu items and the central Carousel cards.
*   **[Enter / Gamepad A-Button]:** Select System / Open ROM load dialog.
*   **[SELECT / Gamepad Y-Button]:** Instantly open the **Creator Dossier** overlay page.
*   **[Escape / Gamepad B-Button]:** Close any active fullscreen overlay page and return to the Carousel.

---

## 7. Diagnostics & Developer Mode

EGGStation includes a double diagnostic suite designed for both emulator validation and homebrew development:

### Interactive Developer Diagnostics Suite (Dev Mode)
Clicking the **"DEV MODE"** button in the header expands a retro diagnostic console at the footer. The `UniversalDevSuiteManager` polymorphically polls the active engine:
*   **Debugger Core:** Allows developers to break/pause the CPU execution, step-into precisely one instruction, or bind a hexadecimal breakpoint address.
*   **Hex Registers Readout:** Automatically renders all internal CPU registers (Z80, M68K, or 5A22) in uppercase hex, updating synchronously.
*   **Disassembly Console:** Disassembles and displays active assembly instructions centered around the current Program Counter (PC).
*   **Diagnostic VRAM Viewer:** Decodes planar 4bpp pixel patterns (including complex SNES reverse-remapping) and renders the raw background tiles and sprites loaded into memory in real-time.

---

## 8. License and Authorship

*   **Project Name:** EGGStation Multi-System Emulator
*   **Author:** Enrique González Gutiérrez
*   **Technology Stack:** Vanilla JavaScript (ES6+), WebGL2, Web Audio API, IndexedDB.
*   **License:** Distributed under the terms of the MIT License. See [LICENSE](LICENSE) for details.