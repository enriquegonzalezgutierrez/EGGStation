/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/video/UniversalPostProcessor.js
 * 
 * Infrastructure Layer: Universal Video Post-Processor Service (Facade Pattern)
 * 
 * Role:
 * Acts as a unified video rendering facade. Coordinates WebGL2 dynamic shaders 
 * and CPU scaling algorithms through polymorphic delegation, maintaining 
 * full backward-compatibility with all emulator cores.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Acts strictly as an orchestrator/facade 
 *   between the CPU scalers (CpuScalingFilters) and GPU pipelines (WebGLShaderPipeline).
 * - Open/Closed Principle (OCP): New scaling algorithms and custom shaders can be 
 *   added with zero changes to this class or the emulator orchestrators.
 */

class UniversalPostProcessor {
    /**
     * @param {WebGL2RenderingContext} gl - WebGL2 context used for GPU shaders.
     */
    constructor(gl) {
        this.gl = gl;

        // Delegates WebGL compilation to the specialized Shader Pipeline module (DIP / Strategy)
        this.shaderPipeline = new WebGLShaderPipeline(this.gl);

        // Pre-allocated Ring Buffers to prevent Garbage Collection spikes
        this.rgbaBuffer = new Uint8ClampedArray(512 * 480 * 4);      
        this.upscaledBuffer = new Uint8ClampedArray(1024 * 960 * 4);  
        this.scale4xBuffer = new Uint8ClampedArray(2048 * 1920 * 4);  
        this.glbImgData = undefined;
    }

    /**
     * Delegates shader parameters update to the shader pipeline.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        if (this.shaderPipeline) {
            this.shaderPipeline.updateShaderUniforms(curvature, scanlines, phosphor, bloom);
        }
    }

    /**
     * Blits the emulated system's raw backbuffer array to the output target context.
     * Delegates drawing tasks polymorphically to CPU or GPU subclasses based on filter mode.
     * 
     * @param {CanvasRenderingContext2D} ctx - Target 2D Canvas Context.
     * @param {ArrayBufferView} src - Flat 32-bit packed or 8-bit array frame backbuffer.
     * @param {number} width - Emulated screen width.
     * @param {number} height - Emulated screen height.
     * @param {number} postProcessMode - Selected filter index (0-6).
     * @param {ArrayBufferView} [prevFrameBuffer] - Historical frame buffer for anaglyph 3D composting.
     */
    blit(ctx, src, width, height, postProcessMode, prevFrameBuffer) {
        let actualWidth = Number(width);
        let actualHeight = Number(height);
        let actualMode = Number(postProcessMode);

        // Polymorphic Signature Adapter: (ctx, src, yScreenLines, postProcessMode)
        // Detects if the call parameters shift due to Sega SMS legacy dimensions mapping
        if (postProcessMode === undefined && prevFrameBuffer === undefined) {
            actualWidth = 256;                 
            actualHeight = Number(width);      
            actualMode = Number(height);       
        }

        // Defensive SNES high-res scaling correction
        if (actualWidth === 512) {
            actualHeight = actualHeight * 2;   
        }

        // Defensive Fallback Layer
        if (!actualWidth || isNaN(actualWidth) || actualWidth <= 0) actualWidth = 256;
        if (!actualHeight || isNaN(actualHeight) || actualHeight <= 0) actualHeight = 192;
        if (isNaN(actualMode)) actualMode = 0;

        const src32 = new Uint32Array(src.buffer, src.byteOffset, actualWidth * actualHeight);

        // --- GPU Mode 6: WebGL CRT-Royale Shader Pipeline ---
        if (actualMode === 6 && this.shaderPipeline.webglInitialized) {
            const gl = this.gl;
            if (gl.canvas.width !== actualWidth || gl.canvas.height !== actualHeight) {
                gl.canvas.width = actualWidth;
                gl.canvas.height = actualHeight;
            }

            const glbBuffer32 = new Uint32Array(this.rgbaBuffer.buffer, 0, actualWidth * actualHeight);
            glbBuffer32.set(src32);

            const activeLength = actualWidth * actualHeight * 4;
            const webglCompatibleBuffer = new Uint8Array(this.rgbaBuffer.buffer, this.rgbaBuffer.byteOffset, activeLength);

            // Delegate drawing directly to GPU WebGL subsystem
            this.shaderPipeline.renderGL(webglCompatibleBuffer, actualWidth, actualHeight);
            return;
        }

        // Safe fallback in case WebGL initialization is unavailable
        if (actualMode === 6) {
            actualMode = 1; 
        }

        let scaleFactor = 1;
        if (actualMode === 2 || actualMode === 3) scaleFactor = 2; 
        if (actualMode === 4) scaleFactor = 4; 

        const targetWidth = actualWidth * scaleFactor;
        const targetHeight = actualHeight * scaleFactor;

        // Dynamic resize checking
        if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
            ctx.canvas.width = targetWidth;
            ctx.canvas.height = targetHeight;
            ctx.imageSmoothingEnabled = (actualMode === 1); 
            this.glbImgData = undefined;
        }

        if (this.glbImgData === undefined || this.glbImgData.width !== targetWidth || this.glbImgData.height !== targetHeight) {
            this.glbImgData = ctx.createImageData(targetWidth, targetHeight);
        }

        const dst32 = new Uint32Array(this.glbImgData.data.buffer);

        // --- CPU-bound Scaling Filters (Delegated to CpuScalingFilters) ---
        if (actualMode === 0 || actualMode === 1) {
            dst32.set(src32); 
        } else {
            if (actualMode === 2) { 
                CpuScalingFilters.scale2X(src32, dst32, actualWidth, actualHeight);
            } else if (actualMode === 3) { 
                CpuScalingFilters.applyScanlines(src32, dst32, actualWidth, actualHeight);
            } else if (actualMode === 4) { 
                const upscaledTemp32 = new Uint32Array(this.upscaledBuffer.buffer);
                CpuScalingFilters.scale4X(src32, dst32, actualWidth, actualHeight, upscaledTemp32);
            } else if (actualMode === 5) { 
                CpuScalingFilters.applyNtsdBleed(src32, dst32, actualWidth, actualHeight);
            }
        }

        ctx.putImageData(this.glbImgData, 0, 0);
    }
}