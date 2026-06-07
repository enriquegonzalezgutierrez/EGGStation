# ==========================================================================
# Project: EGGStation - Sega & SNES Multi-System Emulator
# Author: Enrique González Gutiérrez
# File: Makefile
#
# Role:
# High-performance, self-documenting build automation orchestrator. Spins up 
# transient Docker containers to compile C++ domain layers into WebAssembly.
# ==========================================================================

.DEFAULT_GOAL := help

# ==========================================================================
# 1. Variables & Path Configuration
# ==========================================================================
DOCKER_IMAGE    ?= emscripten/emsdk:latest
HOST_BUILD_DIR  ?= $(shell pwd)/build
HOST_SRC_DIR    ?= $(shell pwd)/src

# --- Sega PSG Audio Engine Configuration ---
OUTPUT_NAME     ?= SegaPsg
EMCC_FLAGS      ?= -O3 \
                   -s EXPORTED_FUNCTIONS='["_psg_init","_psg_set_sample_rate","_psg_write_command","_psg_get_sample","_psg_update_buffer","_psg_get_buffer_pointer","_psg_get_vol","_psg_get_tone","_psg_get_wave_pos","_psg_get_chan_latch","_psg_get_what_latch","_psg_restore_state"]' \
                   -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32"]' \
                   -s MODULARIZE=1 \
                   -s EXPORT_NAME='SegaPsgWasm' \
                   -s ALLOW_MEMORY_GROWTH=1 \
                   -s SINGLE_FILE=1 \
                   -I/src/src/domain \
                   --no-entry

# --- Sega 315-5297 I/O Controller Configuration ---
IO_OUTPUT_NAME  ?= Sega315_5297
IO_EMCC_FLAGS   ?= -O3 \
                   -s EXPORTED_FUNCTIONS='["_io_init","_io_write_pin_dc","_io_write_pin_dd","_io_read_dc","_io_read_dd","_io_restore_state"]' \
                   -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
                   -s MODULARIZE=1 \
                   -s EXPORT_NAME='SegaIOWasm' \
                   -s SINGLE_FILE=1 \
                   -I/src/src/domain \
                   --no-entry

# ==========================================================================
# 2. Phony Targets Declaration
# ==========================================================================
.PHONY: all clean build-wasm help check-docker

# ==========================================================================
# 3. Build Rules & Tasks
# ==========================================================================

help: ## Display this dynamic help message (Default Goal)
	@echo "=========================================================================="
	@echo " EGGStation WebAssembly Toolchain - Makefile CLI"
	@echo "=========================================================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo "=========================================================================="

all: clean check-docker build-wasm ## Build all WebAssembly targets from scratch

check-docker: ## Validate that Docker is installed and running on the host system
	@echo "Validating system requirements..."
	@which docker > /dev/null 2>&1 || (echo "\033[31mError: Docker is not installed on the host. Please install Docker to compile.\033[0m" && exit 1)
	@docker info > /dev/null 2>&1 || (echo "\033[31mError: Docker daemon is not running. Please start Docker service.\033[0m" && exit 1)
	@echo "Docker integration check passed."

build-wasm: ## Compile C++ Domain logic to WebAssembly using transient Docker container
	@echo "Creating output build directory..."
	mkdir -p $(HOST_BUILD_DIR)
	
	@echo "Building SegaPsg (Audio Engine)..."
	docker run --rm \
		-v $(HOST_SRC_DIR):/src/src \
		-v $(HOST_BUILD_DIR):/src/build \
		$(DOCKER_IMAGE) \
		emcc /src/src/domain/SegaPsg.cpp /src/src/infrastructure/SegaPsgWasmBridge.cpp -o /src/build/$(OUTPUT_NAME).js $(EMCC_FLAGS)
		
	@echo "Building Sega 315-5297 (I/O Controller)..."
	docker run --rm \
		-v $(HOST_SRC_DIR):/src/src \
		-v $(HOST_BUILD_DIR):/src/build \
		$(DOCKER_IMAGE) \
		emcc /src/src/domain/Sega315_5297.cpp /src/src/infrastructure/Sega315_5297WasmBridge.cpp -o /src/build/$(IO_OUTPUT_NAME).js $(IO_EMCC_FLAGS)
		
	@echo "WebAssembly compilation completed. Targets available in build/"

clean: ## Delete all generated build targets and cleanup space
	@echo "Cleaning up build directory..."
	rm -rf $(HOST_BUILD_DIR)