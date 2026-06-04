/**
 * Project: EGGStation - Super Nintendo (SNES) Post-Processor
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES VDP Post-Processor Service (Stable 60 FPS Version)
 * 
 * ROLE:
 * Standardizes the SNES video rendering pipeline. 
 * Processes 32-bit RGBA packed arrays through zero-allocation CPU scalers 
 * (Scale2X, Scale4X, NTSC Bleed) or WebGL2 CRT-Royale Shader.
 * 
 * SOLID Principles:
 * - Liskov Substitution Principle (LSP): Fully compatible with the EGGStation 
 *   universal blit interface.
 */

class SnesPostProcessor {
    /**
     * @param {WebGL2RenderingContext} gl - WebGL2 context used for GPU Shaders.
     */
    constructor(gl) {
        this.gl = gl;

        // Pre-allocated buffers to prevent Garbage Collection thrashing
        // 512 x 480 (Max SNES width * Doubled Height) = 983,040 bytes
        this.rgbaBuffer = new Uint8ClampedArray(512 * 480 * 4);      
        this.upscaledBuffer = new Uint8ClampedArray(1024 * 960 * 4);  
        this.scale4xBuffer = new Uint8ClampedArray(2048 * 1920 * 4);  
        this.glbImgData = undefined;

        // WebGL state properties
        this.webglInitialized = false;
        this.glProgram = null;
        this.vao = null;
        this.positionBuffer = null;
        this.textureHandle = null;

        // Real-time Shader Adjustments
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
    // NATIVE WEBGL2 SHADER PIPELINE INITIALIZATION
    // ========================================================================

    initializeWebGL() {
        const gl = this.gl;

        const vsSource = `#version 300 es
            in vec2 position;
            out vec2 vTexCoord;
            void main() {
                vTexCoord = position * 0.5 + 0.5;
                vTexCoord.y = 1.0 - vTexCoord.y; // Flip coordinates for WebGL standard
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
                
                // 1. CRT Scanlines
                float scanline = sin(uv.y * uResolution.y * 3.14159) * (0.38 * u_ScanlineWeight) + (1.0 - (0.38 * u_ScanlineWeight));
                color *= scanline;
                
                // 2. Aperture Grille Simulation
                float phosphor = sin(uv.x * uResolution.x * 3.14159 * 2.0) * (0.25 * u_PhosphorTriad) + (1.0 - (0.25 * u_PhosphorTriad));
                color *= phosphor;

                // 3. Bloom / Bleed Halation
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

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
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
            console.error("SNES Shader compilation failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    /**
     * Updates CRT parameters in real-time.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        this.shCurvature = curvature;
        this.shScanlines = scanlines;
        this.shPhosphor = phosphor;
        this.shBloom = bloom;
    }

    // ========================================================================
    // STANDARD 2D CPU SCALERS & FORMATTERS (Native 32-bit packed RGBA)
    // ========================================================================

    convertRGBToRGBA(src32, dst32, width, height) {
        for (let y = 0; y < height; y++) {
            const srcRow = y * width;
            const dstRow1 = y * 2 * width;
            const dstRow2 = (y * 2 + 1) * width;
            
            for (let x = 0; x < width; x++) {
                const pixel = src32[srcRow + x];
                dst32[dstRow1 + x] = pixel;
                dst32[dstRow2 + x] = pixel;
            }
        }
    }

    scale2X(src32, dst32, width, height) {
        const outWidth = width * 2;

        for (let y = 0; y < height; y++) {
            const prevY = y > 0 ? y - 1 : 0;
            const nextY = y < height - 1 ? y + 1 : height - 1;

            const rowP = y * width;
            const rowA = prevY * width;
            const rowD = nextY * width;

            const outY = y * 2;
            const rowOut0 = outY * outWidth;
            const rowOut1 = (outY + 1) * outWidth;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const p = src32[rowP + x];
                let e0 = p, e1 = p, e2 = p, e3 = p;

                const a = src32[rowA + x];
                const b = src32[rowP + nextX];
                const c = src32[rowP + prevX];
                const d = src32[rowD + x];

                if (c === a && c !== d && a !== b) {
                    e0 = a;
                }
                if (a === b && a !== c && b !== d) {
                    e1 = b;
                }
                if (d === c && d !== b && c !== a) {
                    e2 = c;
                }
                if (b === d && b !== a && d !== c) {
                    e3 = d;
                }

                const outX = x * 2;
                dst32[rowOut0 + outX] = e0;
                dst32[rowOut0 + outX + 1] = e1;
                dst32[rowOut1 + outX] = e2;
                dst32[rowOut1 + outX + 1] = e3;
            }
        }
    }

    scale4X(src32, dst32, width, height) {
        if (!this.upscaledBuffer32) {
            this.upscaledBuffer32 = new Uint32Array(this.upscaledBuffer.buffer);
        }
        this.scale2X(src32, this.upscaledBuffer32, width, height); 
        this.scale2X(this.upscaledBuffer32, dst32, width * 2, height * 2);
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

                const r = ((src8[prevIdx] * 0.25) + (src8[pIdx] * 0.50) + (src8[nextIdx] * 0.25)) | 0;
                const g = ((src8[prevIdx + 1] * 0.25) + (src8[pIdx + 1] * 0.50) + (src8[nextIdx + 1] * 0.25)) | 0;
                const b = ((src8[prevIdx + 2] * 0.25) + (src8[pIdx + 2] * 0.50) + (src8[nextIdx + 2] * 0.25)) | 0;

                dst32[dstRow + x] = r | (g << 8) | (b << 16) | 0xff000000;
            }
        }
    }

    // ========================================================================
    // MAIN BLIT ROUTER
    // ========================================================================

    blit(ctx, src, width, height, postProcessMode, prevFrameBuffer) {
        const stretchedHeight = height * 2; 

        // 1. GPU Mode 6: WebGL CRT-Royale Shader
        if (postProcessMode === 6 && this.webglInitialized) {
            const gl = this.gl;
            if (gl.canvas.width !== width || gl.canvas.height !== stretchedHeight) {
                gl.canvas.width = width;
                gl.canvas.height = stretchedHeight;
            }
            
            // Fast direct 32-bit transfer using fast subarray of full stretched height
            const targetLength = width * stretchedHeight;
            const glbBuffer32 = new Uint32Array(this.rgbaBuffer.buffer, 0, targetLength);
            glbBuffer32.set(src.subarray(0, targetLength));

            this.renderGL(width, stretchedHeight);
            return;
        }

        // WebGL fallback
        if (postProcessMode === 6) {
            postProcessMode = 1; 
        }

        let scaleFactor = 1;
        if (postProcessMode === 2 || postProcessMode === 3) scaleFactor = 2; 
        if (postProcessMode === 4) scaleFactor = 4; 

        const targetWidth = width * scaleFactor;
        const targetHeight = stretchedHeight * scaleFactor;

        // Resize Canvas if dimensions changed
        if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
            ctx.canvas.width = targetWidth;
            ctx.canvas.height = targetHeight;
            ctx.imageSmoothingEnabled = (postProcessMode === 1); 
            this.glbImgData = undefined;
        }

        if (this.glbImgData === undefined || this.glbImgData.width !== targetWidth || this.glbImgData.height !== targetHeight) {
            this.glbImgData = ctx.createImageData(targetWidth, targetHeight);
        }

        // Create a 32-bit view of target canvas image data buffer
        const dst32 = new Uint32Array(this.glbImgData.data.buffer);

        if (postProcessMode === 0 || postProcessMode === 1) {
            dst32.set(src.subarray(0, width * stretchedHeight)); // Copies full 100% stretched lines
        } else {
            // Write first to internal temporary rgbaBuffer view of full stretched dimensions
            const targetLength = width * stretchedHeight;
            const rgba32 = new Uint32Array(this.rgbaBuffer.buffer, 0, targetLength);
            rgba32.set(src.subarray(0, targetLength)); 

            if (postProcessMode === 2) { 
                this.scale2X(rgba32, dst32, width, stretchedHeight);
            } else if (postProcessMode === 3) { 
                this.applyScanlines(rgba32, dst32, width, stretchedHeight);
            } else if (postProcessMode === 4) { 
                this.scale4X(rgba32, dst32, width, stretchedHeight);
            } else if (postProcessMode === 5) { 
                this.applyNtsdBleed(rgba32, dst32, width, stretchedHeight);
            }
        }

        ctx.putImageData(this.glbImgData, 0, 0);
    }

    renderGL(width, height) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

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