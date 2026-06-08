# ==========================================================================
# Project: EGGStation - Sega & SNES Multi-System Emulator
# Author: Enrique González Gutiérrez
# File: Makefile
#
# Role:
# High-performance, self-documenting build automation orchestrator. Spins up 
# transient Docker containers to compile C++ domain layers into WebAssembly.
# Supports complete SMS and Sega Genesis system emulation modules, and now 
# Super Nintendo (SNES) Cartridge/SRAM and DSP Synthesizer hardware modules.
# ==========================================================================

.DEFAULT_GOAL := help

# ==========================================================================
# 1. Global Variables & Path Configuration
# ==========================================================================
DOCKER_IMAGE    ?= emscripten/emsdk:latest
HOST_BUILD_DIR  ?= $(shell pwd)/build
HOST_SRC_DIR    ?= $(shell pwd)/src

# Common Emscripten settings for all modules:
# -O3: Maximum optimization
# -s SINGLE_FILE=1: Inlines WASM binary as Base64 to allow local file:/// execution
# -s MODULARIZE=1: Wraps the output in a Promise-based factory function
# -s ALLOW_MEMORY_GROWTH=1: Permits dynamic allocation on the WASM Heap
COMMON_EMCC_FLAGS := -O3 \
                     -s MODULARIZE=1 \
                     -s SINGLE_FILE=1 \
                     -s ALLOW_MEMORY_GROWTH=1 \
                     -I/src/src/domain \
                     --no-entry

# ==========================================================================
# 2. Hardware Component Configurations
# ==========================================================================

# --- Sega PSG Audio Engine ---
PSG_NAME  := SegaPsg
PSG_FUNC  := '["_psg_init","_psg_set_sample_rate","_psg_write_command","_psg_get_sample","_psg_update_buffer","_psg_get_buffer_pointer","_psg_get_vol","_psg_get_tone","_psg_get_wave_pos","_psg_get_chan_latch","_psg_get_what_latch","_psg_restore_state"]'
PSG_METH  := '["ccall","cwrap","HEAPF32"]'
PSG_SRC   := /src/src/domain/SegaPsg.cpp /src/src/infrastructure/SegaPsgWasmBridge.cpp

# --- Sega 315-5297 I/O Controller ---
IO_NAME   := Sega315_5297
IO_FUNC   := '["_io_init","_io_write_pin_dc","_io_write_pin_dd","_io_read_dc","_io_read_dd","_io_restore_state"]'
IO_METH  := '["ccall","cwrap"]'
IO_SRC    := /src/src/domain/Sega315_5297.cpp /src/src/infrastructure/Sega315_5297WasmBridge.cpp

# --- Sega 315-5124 VDP (Graphics) ---
VDP_NAME  := Sega315_5124
VDP_FUNC  := '["_vdp_init","_vdp_write_control","_vdp_write_data","_vdp_read_control","_vdp_read_data","_vdp_read_port","_vdp_update","_vdp_get_framebuffer_pointer","_vdp_get_vram_pointer","_vdp_get_cram_pointer","_vdp_get_registers_pointer","_vdp_get_internal_state","_vdp_set_internal_state","_malloc","_free"]'
VDP_METH  := '["ccall","cwrap","HEAPU8","HEAP32","HEAP16","HEAPU16"]'
VDP_SRC   := /src/src/domain/Sega315_5124.cpp /src/src/infrastructure/Sega315_5124WasmBridge.cpp

# --- Sega Master System Cartridge & Mapper Suite ---
CART_NAME  := SegaMasterSystemCartridge
CART_FUNC  := '["_cart_load","_cart_read","_cart_write","_cart_write_system_ram_override","_cart_get_checksum","_cart_get_size","_cart_get_sram_pointer","_cart_get_sram_state","_cart_set_sram_state","_malloc","_free"]'
CART_METH  := '["ccall","cwrap","HEAPU8"]'
CART_INC   := -I/src/src/domain/mappers
CART_SRC   := /src/src/domain/SegaMasterSystemCartridge.cpp \
              /src/src/domain/mappers/BaseMapper.cpp \
              /src/src/domain/mappers/SegaMapper.cpp \
              /src/src/domain/mappers/CodemastersMapper.cpp \
              /src/src/domain/mappers/KoreanMapper.cpp \
              /src/src/domain/mappers/SegaMasterSystemMapperFactory.cpp \
              /src/src/infrastructure/SegaMasterSystemCartridgeWasmBridge.cpp

# --- Zilog Z80 CPU Core ---
Z80_NAME  := ZilogZ80
Z80_FUNC  := '["_z80_init","_z80_select_mode","_z80_register_callbacks","_z80_execute_one","_z80_raise_interrupt","_z80_raise_nmi","_z80_get_pc","_z80_set_pc","_z80_get_sp","_z80_set_sp","_z80_get_af","_z80_set_af","_z80_get_bc","_z80_set_bc","_z80_get_de","_z80_set_de","_z80_get_hl","_z80_set_hl","_z80_get_ix","_z80_set_ix","_z80_get_iy","_z80_set_iy","_z80_get_cycles"]'
Z80_METH  := '["ccall","cwrap"]'
Z80_SRC   := /src/src/domain/cpu/z80/Z80Registers.cpp \
             /src/src/domain/cpu/z80/Z80Alu.cpp \
             /src/src/domain/cpu/z80/ZilogZ80.cpp \
             /src/src/domain/cpu/z80/GenesisZ80.cpp \
             /src/src/domain/cpu/z80/instructions/Z80DataTransfer.cpp \
             /src/src/domain/cpu/z80/instructions/Z80Arithmetic.cpp \
             /src/src/domain/cpu/z80/instructions/Z80Bitwise.cpp \
             /src/src/domain/cpu/z80/instructions/Z80ShiftRotate.cpp \
             /src/src/domain/cpu/z80/instructions/Z80ProgramFlow.cpp \
             /src/src/domain/cpu/z80/instructions/Z80BlockOps.cpp \
             /src/src/domain/cpu/z80/instructions/Z80SystemIO.cpp \
             /src/src/infrastructure/ZilogZ80WasmBridge.cpp

# --- Sega Genesis YM2612 FM Sound Engine ---
FM_NAME   := GenesisYm2612
FM_FUNC   := '["_fm_init","_fm_write_address","_fm_write_data","_fm_update","_fm_output_samples","_fm_get_buffer_pointer"]'
FM_METH   := '["ccall","cwrap","HEAP16"]'
FM_SRC    := /src/src/domain/audio/GenesisYm2612.cpp /src/src/infrastructure/GenesisYm2612WasmBridge.cpp

# --- Super Nintendo (SNES) Cartridge Hardware Module ---
SNES_CART_NAME := SnesCartridge
SNES_CART_FUNC := '["_snes_cart_load","_snes_cart_read","_snes_cart_write","_snes_cart_reset","_snes_cart_get_is_hirom","_snes_cart_get_is_pal","_snes_cart_get_sram_size","_snes_cart_get_sram_pointer","_malloc","_free"]'
SNES_CART_METH := '["ccall","cwrap","HEAPU8"]'
SNES_CART_SRC  := /src/src/domain/SnesCartridge.cpp /src/src/infrastructure/SnesCartridgeWasmBridge.cpp

# --- Super Nintendo (SNES) DSP Audio Synthesizer Module ---
SNES_DSP_NAME := SnesDsp
SNES_DSP_FUNC := '["_dsp_init","_dsp_set_apuram_ptr","_dsp_write","_dsp_read","_dsp_cycle","_dsp_get_samples_l_ptr","_dsp_get_samples_r_ptr","_dsp_get_sample_offset","_dsp_clear_sample_offset","_dsp_get_ram_ptr","_dsp_get_adsr_state_ptr","_dsp_get_gain_ptr","_dsp_get_counter_ptr","_malloc","_free"]'
SNES_DSP_METH := '["ccall","cwrap","HEAPU8","HEAPF32","HEAP16","HEAP32"]'
SNES_DSP_SRC  := /src/src/domain/SnesDsp.cpp /src/src/infrastructure/SnesDspWasmBridge.cpp

# ==========================================================================
# 3. Build Targets
# ==========================================================================

.PHONY: all clean build-wasm help check-docker

all: clean check-docker build-wasm ## Clean and rebuild all WebAssembly modules

check-docker: ## Validate that Docker is installed and running
	@echo "Checking system requirements..."
	@which docker > /dev/null 2>&1 || (echo "Error: Docker not found." && exit 1)
	@docker info > /dev/null 2>&1 || (echo "Error: Docker daemon is not running." && exit 1)
	@echo "System requirements satisfied."

build-wasm: ## Compile all C++ Domain logic to WebAssembly inside Docker
	@mkdir -p $(HOST_BUILD_DIR)

	@echo ">>> Building SegaPsg (Audio Engine)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(PSG_SRC) -o /src/build/$(PSG_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(PSG_FUNC) -s EXPORTED_RUNTIME_METHODS=$(PSG_METH) -s EXPORT_NAME='SegaPsgWasm'

	@echo ">>> Building Sega 315-5297 (I/O Controller)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(IO_SRC) -o /src/build/$(IO_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(IO_FUNC) -s EXPORTED_RUNTIME_METHODS=$(IO_METH) -s EXPORT_NAME='SegaIOWasm'

	@echo ">>> Building Sega 315-5124 (VDP Engine)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(VDP_SRC) -o /src/build/$(VDP_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(VDP_FUNC) -s EXPORTED_RUNTIME_METHODS=$(VDP_METH) -s EXPORT_NAME='SegaVdpWasm'

	@echo ">>> Building Sega Master System Cartridge/Mapper Suite..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(CART_SRC) -o /src/build/$(CART_NAME).js $(COMMON_EMCC_FLAGS) $(CART_INC) \
		-s EXPORTED_FUNCTIONS=$(CART_FUNC) -s EXPORTED_RUNTIME_METHODS=$(CART_METH) -s EXPORT_NAME='SegaCartWasm'

	@echo ">>> Building ZilogZ80 (CPU Engine)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(Z80_SRC) -o /src/build/$(Z80_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(Z80_FUNC) -s EXPORTED_RUNTIME_METHODS=$(Z80_METH) -s EXPORT_NAME='ZilogZ80Wasm'

	@echo ">>> Building GenesisYm2612 (FM Sound Engine)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(FM_SRC) -o /src/build/$(FM_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(FM_FUNC) -s EXPORTED_RUNTIME_METHODS=$(FM_METH) -s EXPORT_NAME='GenesisYm2612Wasm'

	@echo ">>> Building SnesCartridge (Super Nintendo)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(SNES_CART_SRC) -o /src/build/$(SNES_CART_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(SNES_CART_FUNC) -s EXPORTED_RUNTIME_METHODS=$(SNES_CART_METH) -s EXPORT_NAME='SnesCartWasm'

	@echo ">>> Building SnesDsp (Super Nintendo Audio Synthesizer)..."
	docker run --rm -v $(HOST_SRC_DIR):/src/src -v $(HOST_BUILD_DIR):/src/build $(DOCKER_IMAGE) \
		emcc $(SNES_DSP_SRC) -o /src/build/$(SNES_DSP_NAME).js $(COMMON_EMCC_FLAGS) \
		-s EXPORTED_FUNCTIONS=$(SNES_DSP_FUNC) -s EXPORTED_RUNTIME_METHODS=$(SNES_DSP_METH) -s EXPORT_NAME='SnesDspWasm'

	@echo "=========================================================================="
	@echo " Build Success: All WebAssembly hardware modules generated in build/"
	@echo "=========================================================================="

clean: ## Delete all generated build targets
	@echo "Cleaning up build directory..."
	rm -rf $(HOST_BUILD_DIR)

help: ## Display this help message
	@echo "=========================================================================="
	@echo " EGGStation WebAssembly Toolchain CLI"
	@echo "=========================================================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo "=========================================================================="