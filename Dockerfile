# ==========================================================================
# Project: EGGStation - Sega & SNES Multi-System Emulator
# Author: Enrique González Gutiérrez
# File: Dockerfile
#
# Role:
# Containerized build environment for the WebAssembly toolchain using Emscripten.
# Ensures deterministic builds and avoids host system pollution on Ubuntu 
# development workstations.
# ==========================================================================

# Use the official Emscripten SDK image containing emcc compiler and node runtimes
FROM emscripten/emsdk:latest

# Define the working directory inside the container mapping the src folder
WORKDIR /src

# Emscripten image comes ready with emcc, make, and python
CMD ["/bin/bash"]