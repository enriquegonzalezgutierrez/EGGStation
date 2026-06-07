# ==========================================================================
# Project: EGGStation - Sega & SNES Multi-System Emulator
# Author: Enrique González Gutiérrez
# File: Makefile
#
# Role:
# High-performance, self-documenting build automation orchestrator. Spins up 
# transient Docker containers to compile C++ domain layers into WebAssembly.
# Fully scalable to support additional systems (Genesis, SNES) in later phases.
#
# Optimization Note:
# Uses '-s SINGLE_FILE=1' to inline the compiled .wasm binary into the generated 
# .js glue layer as a Base64 string. This allows playing locally (via file:///)
# without triggering browser CORS blocks.
# ==========================================================================

# Modern GNU Make directive to enforce 'help' as the default goal when running raw 'make'
.DEFAULT_GOAL := help

# ==========================================================================
# 1. Variables & Path Configuration
# ==========================================================================
DOCKER_IMAGE    ?= emscripten/emsdk:latest
HOST_BUILD_DIR  ?= $(shell pwd)/build
HOST_SRC_DIR    ?= $(shell pwd)/src

# Compilation Output Target Names
OUTPUT_NAME     ?= SegaPsg
WASM_OUT_JS     ?= $(HOST_BUILD_DIR)/$(OUTPUT_NAME).js

# Emscripten Compilation Flags
# -O3: Maximum production optimization
# -s ALLOW_MEMORY_GROWTH=1: Secure dynamic resizing of WebAssembly heap memory
# -s SINGLE_FILE=1: Inlines WASM binary as Base64 to bypass local file:/// CORS restrictions
# -s EXPORTED_FUNCTIONS: Exposes internal C bindings (Getters and state restorers for rewind support)
EMCC_FLAGS      ?= -O3 \
                   -s EXPORTED_FUNCTIONS='["_psg_init","_psg_set_sample_rate","_psg_write_command","_psg_get_sample","_psg_update_buffer","_psg_get_buffer_pointer","_psg_get_vol","_psg_get_tone","_psg_get_wave_pos","_psg_get_chan_latch","_psg_get_what_latch","_psg_restore_state"]' \
                   -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32"]' \
                   -s MODULARIZE=1 \
                   -s EXPORT_NAME='SegaPsgWasm' \
                   -s ALLOW_MEMORY_GROWTH=1 \
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
	@echo "Running Emscripten compiler inside Docker container..."
	docker run --rm \
		-v $(HOST_SRC_DIR):/src/src \
		-v $(HOST_BUILD_DIR):/src/build \
		$(DOCKER_IMAGE) \
		emcc /src/src/domain/SegaPsg.cpp /src/src/infrastructure/SegaPsgWasmBridge.cpp -o /src/build/$(OUTPUT_NAME).js $(EMCC_FLAGS)
	@echo "WebAssembly compilation completed. Targets available in build/"

clean: ## Delete all generated build targets and cleanup space
	@echo "Cleaning up build directory..."
	rm -rf $(HOST_BUILD_DIR)