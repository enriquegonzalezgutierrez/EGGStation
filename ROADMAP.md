# EGGStation Development Roadmap

This document outlines the strategic engineering milestones planned to push EGGStation to the absolute limits of web-based hardware emulation. These phases focus on microsecond-accurate synchronization, temporal physics, advanced visual shaders, and hardware accessory emulation.

---

## Phase 1: Microsecond Synchronization & Dynamic Rate Control (DRC)
**Target Layer:** `Infrastructure Layer (Audio)` & `Application Layer (Orchestrator)`

To prevent audio crackling and micro-stutters during execution jitter or minor browser thread delays, EGGStation will transition from fixed frame-rate slicing to a closed-loop **Dynamic Rate Control (DRC)** paradigm.

### Technical Implementation:
- Monitor the exact sample queue backlog inside the `ScriptProcessorNode` / Web Audio destination buffer.
- Implement an Exponential Moving Average (EMA) to calculate the mean buffer fill level.
- If the buffer drifts below the safe threshold, decrease the emulated CPU clock target by up to `0.5%` continuously. If the buffer is approaching capacity, accelerate the cycle target by `0.5%`.
- **Target File modifications:** `Sega315_5124_Psg.js` (buffer queue queries) and `EmulatorOrchestrator.js` (dynamic calculation of `targetCycles`).

---

## Phase 2: Temporal Rewinding (Real-Time Time Travel)
**Target Layer:** `Application Layer` & `Infrastructure Layer (Storage)`

Implement real-time delta-compressed frame rewinding, allowing users to reverse gameplay smoothly by holding an assigned controller button.

### Technical Implementation:
- Implement a circular **Ring Buffer State Cache** inside the `EmulatorOrchestrator`.
- Every `6 frames` (100ms), capture a lightweight delta-state (saving only differences in Work RAM, VRAM, registers, and mapper status since the previous keyframe to minimize memory footprints).
- Bind an input (e.g., `Backspace` or Left Trigger on physical gamepads) to suspend the emulator's forward execution loop.
- When active, traverse the state cache backward, loading the reconstructed binary structures sequentially at `60Hz` (mirroring backward gameplay).

---

## Phase 3: Hardware Peripheral Emulation (3D Glasses & Light Phaser)
**Target Layer:** `Domain Layer (MMU/Cartridge)` & `Infrastructure Layer (VDP/Post-Processor)`

Emulate classic Sega Master System hardware expansion peripherals on modern display standards.

### Technical Implementation:
- **Sega 3D Glasses (Active Shutter):** Detect CRAM/VRAM write sequences targeting frame-alternate stereoscopic buffers. Modify `VdpPostProcessor.js` to process both frames concurrently and render them on the GPU as a high-fidelity **Anaglyph (Red/Cyan) Stereoscopic** composite.
- **Light Phaser (Lightgun):** Capture mouse coordinates or screen-touch coordinates over the viewport. Map coordinate matrices directly onto the VDP's horizontal/vertical electron beam synchronization registers (`hcounter` and `vcounter`) when a fire trigger event is registered.

---

## Phase 4: Runtime Uniform Customization (Interactive Shader GUI)
**Target Layer:** `Presentation Layer (CSS/UI)` & `Infrastructure Layer (WebGL2 Post-Processor)`

Turn static post-processing pipelines into dynamic, user-adjustable variables by connecting HTML control sliders directly to WebGL2 shader uniforms.

### Technical Implementation:
- Expose uniform floats in the CRT-Royale fragment shader within `VdpPostProcessor.js`:
  - `u_CurveRadius` (Barrel screen distortion)
  - `u_ScanlineOpacity` (Scanline blending strength)
  - `u_PhosphorTriad` (Aperture grille pixel structure density)
  - `u_BloomIntensity` (High-contrast halation)
- Modify `UIController.js` to bind range sliders from the hardware settings panel, dynamically calling `gl.uniform1f` inside the WebGL render pass without compiling or linking the shader program again.

---

## Phase 5: Developer Diagnostics & Debugger Suite
**Target Layer:** `Presentation Layer` & `Domain Layer (Z80 / Disassembler)`

Provide homebrew developers and ROM-hackers with an integrated suite of diagnostics and step-by-step CPU execution analysis.

### Technical Implementation:
- **CPU Step Debugger:** Add a "Developer Panel" that uses `Z80Disassembler.js` to show the assembly instructions ahead of and behind the current PC. Add execution controls: `Play`, `Pause`, `Step-Into` (executes precisely one CPU instruction), and `Breakpoints`.
- **Memory Map Viewer:** Render the active 16KB cartridge banks and 8KB Work RAM as interactive hexadecimal tables.
- **VRAM Pattern Inspector:** Draw active tiles loaded inside VRAM onto a secondary HTML Canvas, showing background matrices and active sprite patterns in real-time.