/**
 * Project: EGGStation - Unified Multi-System Console Virtual Environment
 * Author: Enrique González Gutiérrez
 * File: js/shared/video/UniversalPostProcessor.js
 * 
 * Role:
 * Infrastructure Layer: Universal Video Post-Processor Service (Defensive SNES Fix).
 * Consolidates WebGL2 CRT-Royale Shader execution and CPU-based fallback scaling 
 * algorithms (Scale2X, Scale4X, Scanlines, NTSC Bleed) into a single, high-performance, 
 * polymorphic rendering engine.
 * 
 * SOLID Principles Applied:
 * 1. Single Responsibility Principle (SRP): Exclusively handles frame upscaling 
 *    and shader-based rasterization. It holds no reference to any emulator clock 
 *    or system state.
 * 2. Open/Closed Principle (OCP): New shaders or rendering filters can be added 
 *    by extending the shader template and the uniform lookup dictionary without 
 *    modifying the core WebGL texture binding logic.
 * 3. Liskov Substitution Principle (LSP): Fully interchangeable. It can be dropped 
 *    into any console core (SMS, Genesis, SNES) as it dynamically scales textures 
 *    to match any source dimensions (e.g., 256x192, 320x224, 512x448).
 * 4. Interface Segregation Principle (ISP): Exposes only two simple methods 
 *    (`blit()` and `updateShaderUniforms()`), shielding the orchestrators from 
 *    the complexities of WebGL2 vertex array bindings and buffer configurations.
 * 5. Dependency Inversion Principle (DIP): Orchestrators depend on this high-level 
 *    rendering interface rather than direct, tightly coupled low-level WebGL contexts.
 */

class UniversalPostProcessor {
    /**
     * @param {WebGL2RenderingContext} gl - WebGL2 context used for GPU shaders.
     */
    constructor(gl) {
        this.gl = gl;

        // Zero-Allocation Ring Buffers (Pre-allocated to prevent GC spikes)
        // Accommodates max system target boundaries: SNES High-Res (512x480) * 4x Scale
        this.rgbaBuffer = new Uint8ClampedArray(512 * 480 * 4);      
        this.upscaledBuffer = new Uint8ClampedArray(1024 * 960 * 4);  
        this.scale4xBuffer = new Uint8ClampedArray(2048 * 1920 * 4);  
        this.glbImgData = undefined;

        this.webglInitialized = false;
        this.glProgram = null;
        this.vao = null;
        this.positionBuffer = null;
        this.textureHandle = null;

        // Interactive Shader Uniform Variables (1.0 acts as normalized default)
        this.shCurvature = 1.0;
        this.shScanlines = 1.0;
        this.shPhosphor = 1.0;
        this.shBloom = 1.0;

        this.uniformLocs = {
            curvature: null,
            scanlines: null,
            phosphor: null,
            bloom: null
        };

        if (this.gl) {
            this.initializeWebGL();
        }
    }

    // ========================================================================
    // WEBGL2 SHADER PIPELINE INITIALIZATION
    // ========================================================================

    initializeWebGL() {
        const gl = this.gl;

        const vsSource = `#version 300 es
            in vec2 position;
            out vec2 vTexCoord;
            void main() {
                vTexCoord = position * 0.5 + 0.5;
                vTexCoord.y = 1.0 - vTexCoord.y; // Flip coordinates for WebGL coordinate space
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        const fsSource = `#version 300 es
            precision highp float;
            in vec2 vTexCoord;
            out vec4 fragColor;
            
            uniform sampler2D uTexture;
            uniform vec2 uResolution;
            uniform float u_CurvatureScale;
            uniform float u_ScanlineWeight;
            uniform float u_PhosphorTriad;
            uniform float u_BloomStrength;

            // Simulates physically curved glass of classic CRT monitors
            vec2 curve(vec2 uv) {
                uv = (uv - 0.5) * 2.0;
                uv.x *= 1.10;
                uv.x *= 1.0 + (uv.y * uv.y) * (0.09 * u_CurvatureScale);
                uv.y *= 1.0 + (uv.x * uv.x) * (0.10 * u_CurvatureScale);
                return (uv / 2.0) + 0.5;
            }

            vec3 decodeGamma(vec3 c) {
                return pow(c, vec3(2.2));
            }

            vec3 encodeGamma(vec3 c) {
                return pow(c, vec3(1.0 / 2.2));
            }

            // Simulates analog color fringing (chromatic aberration)
            vec3 textureAberration(sampler2D tex, vec2 uv) {
                float r = texture(tex, uv - vec2(0.0018, 0.0)).r;
                float g = texture(tex, uv).g;
                float b = texture(tex, uv + vec2(0.0018, 0.0)).b;
                return vec3(r, g, b);
            }

            void main() {
                vec2 uv = curve(vTexCoord);
                vec2 vignette = smoothstep(vec2(0.0), vec2(0.025), uv) * smoothstep(vec2(0.0), vec2(0.025), 1.0 - uv);
                float vignetteFactor = vignette.x * vignette.y;

                if (vignetteFactor == 0.0) {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                vec3 color = decodeGamma(textureAberration(uTexture, uv));
                
                // 1. Scanline synthesis
                float scanline = sin(uv.y * uResolution.y * 3.14159) * (0.38 * u_ScanlineWeight) + (1.0 - (0.38 * u_ScanlineWeight));
                color *= scanline;
                
                // 2. Aperture Grille sub-pixel emulation
                float phosphor = sin(uv.x * uResolution.x * 3.14159 * 2.0) * (0.25 * u_PhosphorTriad) + (1.0 - (0.25 * u_PhosphorTriad));
                color *= phosphor;

                // 3. Phosphor bloom / Analog bleed
                vec3 bloom = vec3(0.0);
                bloom += decodeGamma(texture(uTexture, uv + vec2(-0.004, 0.0)).rgb) * (0.15 * u_BloomStrength);
                bloom += decodeGamma(texture(uTexture, uv + vec2(0.004, 0.0)).rgb) * (0.15 * u_BloomStrength);
                color += bloom;

                fragColor = vec4(encodeGamma(color * vignetteFactor), 1.0);
            }
        `;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        this.glProgram = gl.createProgram();
        gl.attachShader(this.glProgram, vs);
        gl.attachShader(this.glProgram, fs);
        gl.linkProgram(this.glProgram);

        if (!gl.getProgramParameter(this.glProgram, gl.LINK_STATUS)) return;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vertices = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]);
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(this.glProgram, "position");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        this.textureHandle = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textureHandle);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

        this.uniformLocs.curvature = gl.getUniformLocation(this.glProgram, "u_CurvatureScale");
        this.uniformLocs.scanlines = gl.getUniformLocation(this.glProgram, "u_ScanlineWeight");
        this.uniformLocs.phosphor  = gl.getUniformLocation(this.glProgram, "u_PhosphorTriad");
        this.uniformLocs.bloom     = gl.getUniformLocation(this.glProgram, "u_BloomStrength");

        this.webglInitialized = true;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("UniversalPostProcessor::Shader compile failed: ", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    /**
     * Updates interactive shader variables in real-time.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        this.shCurvature = curvature;
        this.shScanlines = scanlines;
        this.shPhosphor = phosphor;
        this.shBloom = bloom;
    }

    // ========================================================================
    // CPU-BASED 2D SCALERS & HARDWARE SIMULATORS
    // ========================================================================

    /**
     * Highly optimized Scale2X CPU-side algorithm using Loop Boundary Separation 
     * to eliminate branch prediction stalls.
     */
    scale2X(src32, dst32, width, height) {
        const outWidth = width * 2;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;

        for (let y = 0; y < height; y++) {
            const prevY = y > 0 ? y - 1 : 0;
            const nextY = y < heightMinus1 ? y + 1 : heightMinus1;

            const rowP = y * width;
            const rowA = prevY * width;
            const rowD = nextY * width;

            const outY = y * 2;
            const rowOut0 = outY * outWidth;
            const rowOut1 = (outY + 1) * outWidth;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < widthMinus1 ? x + 1 : widthMinus1;

                const p = src32[rowP + x];
                const a = src32[rowA + x];
                const b = src32[rowP + nextX];
                const c = src32[rowP + prevX];
                const d = src32[rowD + x];

                let e0 = p, e1 = p, e2 = p, e3 = p;

                if (c === a && c !== d && a !== b) e0 = a;
                if (a === b && a !== c && b !== d) e1 = b;
                if (d === c && d !== b && c !== a) e2 = c;
                if (b === d && b !== a && d !== c) e3 = d;

                const outX = x * 2;
                dst32[rowOut0 + outX] = e0;
                dst32[rowOut0 + outX + 1] = e1;
                dst32[rowOut1 + outX] = e2;
                dst32[rowOut1 + outX + 1] = e3;
            }
        }
    }

    scale4X(src32, dst32, width, height) {
        const upscaled32 = new Uint32Array(this.upscaledBuffer.buffer);
        this.scale2X(src32, upscaled32, width, height); 
        this.scale2X(upscaled32, dst32, width * 2, height * 2);
    }

    applyScanlines(src32, dst32, width, height) {
        const outWidth = width * 2;

        for (let y = 0; y < height; y++) {
            const rowP = y * width;
            const outY = y * 2;
            const rowOut0 = outY * outWidth;
            const rowOut1 = (outY + 1) * outWidth;

            for (let x = 0; x < width; x++) {
                const p = src32[rowP + x];
                const r = p & 0xff;
                const g = (p >> 8) & 0xff;
                const b = (p >> 16) & 0xff;
                
                // Emulate physical CRT shadow mask by reducing odd scanline luminance by 60%
                const rScan = (r * 0.4) | 0;
                const gScan = (g * 0.4) | 0;
                const bScan = (b * 0.4) | 0;
                const pScan = rScan | (gScan << 8) | (bScan << 16) | 0xff000000;

                const outX = x * 2;
                dst32[rowOut0 + outX] = p;
                dst32[rowOut0 + outX + 1] = p;
                dst32[rowOut1 + outX] = pScan;
                dst32[rowOut1 + outX + 1] = pScan;
            }
        }
    }

    applyNtsdBleed(src32, dst32, width, height) {
        const src8 = new Uint8Array(src32.buffer, src32.byteOffset, src32.length * 4);

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width * 4;
            const dstRow = y * width;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = rowOffset + (x * 4);
                const prevIdx = rowOffset + (prevX * 4);
                const nextIdx = rowOffset + (nextX * 4);

                // Apply horizontal Gaussian filter to simulate RF coax cable luminance bleed
                const r = ((src8[prevIdx] * 0.25) + (src8[pIdx] * 0.50) + (src8[nextIdx] * 0.25)) | 0;
                const g = ((src8[prevIdx + 1] * 0.25) + (src8[pIdx + 1] * 0.50) + (src8[nextIdx + 1] * 0.25)) | 0;
                const b = ((src8[prevIdx + 2] * 0.25) + (src8[pIdx + 2] * 0.50) + (src8[nextIdx + 2] * 0.25)) | 0;

                dst32[dstRow + x] = r | (g << 8) | (b << 16) | 0xff000000;
            }
        }
    }

    // ========================================================================
    // PRIMARY BLIT DISPATCH ROUTER (Universal Entry Point)
    // ========================================================================

    /**
     * Blits the emulated system's raw backbuffer array to the output target context.
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
        let actualPrev = prevFrameBuffer;

        // SMS Polymorphic Signature Adapter: (ctx, src, yScreenLines, postProcessMode)
        // Detects if the call parameters shift due to SMS legacy dimensions mapping
        if (postProcessMode === undefined && prevFrameBuffer === undefined) {
            actualWidth = 256;                 // SMS resolution is always 256 wide
            actualHeight = Number(width);      // yScreenLines (192, 224 or 240)
            actualMode = Number(height);       // postProcessMode
            actualPrev = null;
        }

        // --- PHASE 4: DEFENSIVE RESOLUTION SCALING CORRECTION FOR SNES HIGH-RES ---
        if (actualWidth === 512) {
            actualHeight = actualHeight * 2;   // Reconstruct full 448/480 interlaced height
        }

        // --- DEFENSIVE CRASH PROTECTION LAYER (Zero / NaN / Undefined fallback) ---
        if (!actualWidth || isNaN(actualWidth) || actualWidth <= 0) {
            console.warn(`[UniversalPostProcessor] Invalid width detected: ${width}. Falling back to 256.`);
            actualWidth = 256;
        }
        if (!actualHeight || isNaN(actualHeight) || actualHeight <= 0) {
            console.warn(`[UniversalPostProcessor] Invalid height detected: ${height}. Falling back to 192.`);
            actualHeight = 192;
        }
        if (isNaN(actualMode)) {
            actualMode = 0;
        }

        // Enforce 32-bit view over input buffer
        const src32 = new Uint32Array(src.buffer, src.byteOffset, actualWidth * actualHeight);

        // GPU Mode 6: Execute WebGL2 CRT-Royale Shader
        if (actualMode === 6 && this.webglInitialized) {
            const gl = this.gl;
            if (gl.canvas.width !== actualWidth || gl.canvas.height !== actualHeight) {
                gl.canvas.width = actualWidth;
                gl.canvas.height = actualHeight;
            }

            const glbBuffer32 = new Uint32Array(this.rgbaBuffer.buffer, 0, actualWidth * actualHeight);
            glbBuffer32.set(src32);

            this.renderGL(actualWidth, actualHeight);
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

        if (actualMode === 0 || actualMode === 1) {
            dst32.set(src32); 
        } else {
            if (actualMode === 2) { 
                this.scale2X(src32, dst32, actualWidth, actualHeight);
            } else if (actualMode === 3) { 
                this.applyScanlines(src32, dst32, actualWidth, actualHeight);
            } else if (actualMode === 4) { 
                this.scale4X(src32, dst32, actualWidth, actualHeight);
            } else if (actualMode === 5) { 
                this.applyNtsdBleed(src32, dst32, actualWidth, actualHeight);
            }
        }

        ctx.putImageData(this.glbImgData, 0, 0);
    }

    renderGL(width, height) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.glProgram);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textureHandle);
        
        const activeLength = width * height * 4;
        const webglCompatibleBuffer = new Uint8Array(this.rgbaBuffer.buffer, this.rgbaBuffer.byteOffset, activeLength);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, webglCompatibleBuffer);

        gl.uniform1i(gl.getUniformLocation(this.glProgram, "uTexture"), 0);
        gl.uniform2f(gl.getUniformLocation(this.glProgram, "uResolution"), width, height);

        if (this.uniformLocs.curvature) gl.uniform1f(this.uniformLocs.curvature, this.shCurvature);
        if (this.uniformLocs.scanlines) gl.uniform1f(this.uniformLocs.scanlines, this.shScanlines);
        if (this.uniformLocs.phosphor)  gl.uniform1f(this.uniformLocs.phosphor,  this.shPhosphor);
        if (this.uniformLocs.bloom)     gl.uniform1f(this.uniformLocs.bloom,     this.shBloom);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }
}