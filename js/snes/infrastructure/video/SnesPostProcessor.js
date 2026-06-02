/**
 * Project: EGGStation - Super Nintendo Entertainment System Emulator
 * Author: Enrique González Gutiérrez
 * 
 * Infrastructure Layer: SNES VDP Post-Processor Service
 * 
 * Implements high-performance video upscaling filters and compiles the WebGL2 CRT-Royale Shader.
 * Automatically adapts and wraps viewport coordinates dynamically based on active 
 * vertical heights (224 or 240 scanlines) to eliminate black borders.
 * 
 * SOLID Principles:
 * - Single Responsibility Principle (SRP): Focuses exclusively on post-processing filters,
 *   upscaling, and shader coordinate compilations, keeping it decoupled from game loops.
 */

class SnesPostProcessor {
    /**
     * @param {SnesPpu} ppu - Reference to the core SNES PPU.
     * @param {WebGL2RenderingContext} gl - WebGL2 context used for GPU shaders.
     */
    constructor(ppu, gl) {
        this.ppu = ppu;
        this.gl = gl;

        // Pre-allocated buffers to prevent GC collection thrashing (supports max 1024x960 layout)
        this.upscaledBuffer = new Uint8ClampedArray(512 * 480 * 4);
        this.scale4xBuffer = new Uint8ClampedArray(1024 * 960 * 4);
        this.glbImgData = undefined;

        this.webglInitialized = false;
        this.glProgram = null;
        this.vao = null;
        this.positionBuffer = null;
        this.textureHandle = null;

        // Interactive Shader Multipliers
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
                vTexCoord.y = 1.0 - vTexCoord.y; // Flip Y for WebGL canvas layout
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
                
                float scanline = sin(uv.y * uResolution.y * 3.14159) * (0.38 * u_ScanlineWeight) + (1.0 - (0.38 * u_ScanlineWeight));
                color *= scanline;
                
                float phosphor = sin(uv.x * uResolution.x * 3.14159 * 2.0) * (0.25 * u_PhosphorTriad) + (1.0 - (0.25 * u_PhosphorTriad));
                color *= phosphor;

                vec3 bloom = vec3(0.0);
                bloom += decodeGamma(texture(uTexture, uv + vec2(-0.004, 0.0)).rgb) * (0.15 * u_BloomStrength);
                bloom += decodeGamma(texture(uTexture, uv + vec2(0.004, 0.0)).rgb) * (0.15 * u_BloomStrength);
                color += bloom;

                color *= vignetteFactor;
                fragColor = vec4(encodeGamma(color), 1.0);
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

        const vertices = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
             1.0,  1.0,
        ]);

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
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        this.shCurvature = curvature;
        this.shScanlines = scanlines;
        this.shPhosphor = phosphor;
        this.shBloom = bloom;
    }

    renderGL(src, width, height) {
        const gl = this.gl;
        if (!this.webglInitialized) return;

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
        const webglCompatibleBuffer = new Uint8Array(src.buffer, src.byteOffset, activeLength);
        
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

    // ========================================================================
    // STANDARD 2D CPU SCALERS
    // ========================================================================

    scale2X(src, dst, width, height) {
        const outWidth = width * 2;
        const same = (offsetA, offsetB) => {
            return src[offsetA] === src[offsetB] && 
                   src[offsetA + 1] === src[offsetB + 1] && 
                   src[offsetA + 2] === src[offsetB + 2];
        };

        for (let y = 0; y < height; y++) {
            const prevY = y > 0 ? y - 1 : 0;
            const nextY = y < height - 1 ? y + 1 : height - 1;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = (x + y * width) * 4;
                const aIdx = (x + prevY * width) * 4;
                const cIdx = (prevX + y * width) * 4;
                const bIdx = (nextX + y * width) * 4;
                const dIdx = (x + nextY * width) * 4;

                const pr = src[pIdx], pg = src[pIdx+1], pb = src[pIdx+2];

                let e0r = pr, e0g = pg, e0b = pb;
                let e1r = pr, e1g = pg, e1b = pb;
                let e2r = pr, e2g = pg, e2b = pb;
                let e3r = pr, e3g = pg, e3b = pb;

                if (same(cIdx, aIdx) && !same(cIdx, dIdx) && !same(aIdx, bIdx)) {
                    e0r = src[aIdx]; e0g = src[aIdx+1]; e0b = src[aIdx+2];
                }
                if (same(aIdx, bIdx) && !same(aIdx, cIdx) && !same(bIdx, dIdx)) {
                    e1r = src[bIdx]; e1g = src[bIdx+1]; e1b = src[bIdx+2];
                }
                if (same(dIdx, cIdx) && !same(dIdx, bIdx) && !same(cIdx, aIdx)) {
                    e2r = src[cIdx]; e2g = src[cIdx+1]; e2b = src[cIdx+2];
                }
                if (same(bIdx, dIdx) && !same(bIdx, aIdx) && !same(dIdx, cIdx)) {
                    e3r = src[dIdx]; e3g = src[dIdx+1]; e3b = src[dIdx+2];
                }

                const outY = y * 2;
                const outX = x * 2;
                const row0 = (outX + outY * outWidth) * 4;
                const row1 = (outX + (outY + 1) * outWidth) * 4;

                dst[row0] = e0r; dst[row0+1] = e0g; dst[row0+2] = e0b; dst[row0+3] = 255;
                dst[row0+4] = e1r; dst[row0+5] = e1g; dst[row0+6] = e1b; dst[row0+7] = 255;
                dst[row1] = e2r; dst[row1+1] = e2g; dst[row1+2] = e2b; dst[row1+3] = 255;
                dst[row1+4] = e3r; dst[row1+5] = e3g; dst[row1+6] = e3b; dst[row1+7] = 255;
            }
        }
    }

    scale4X(src, yScreenLines) {
        this.scale2X(src, this.upscaledBuffer, 256, yScreenLines); 
        this.scale2X(this.upscaledBuffer, this.scale4xBuffer, 512, yScreenLines * 2);
    }

    applyScanlines(src, yScreenLines) {
        const dst = this.upscaledBuffer;
        const width = 256;
        const height = yScreenLines; 
        const outWidth = 512;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pIdx = (x + y * width) * 4;
                const r = src[pIdx];
                const g = src[pIdx + 1];
                const b = src[pIdx + 2];

                const outY = y * 2;
                const outX = x * 2;
                const row0 = (outX + outY * outWidth) * 4;
                const row1 = (outX + (outY + 1) * outWidth) * 4;

                dst[row0] = r; dst[row0+1] = g; dst[row0+2] = b; dst[row0+3] = 255;
                dst[row0+4] = r; dst[row0+5] = g; dst[row0+6] = b; dst[row0+7] = 255;

                dst[row1] = Math.floor(r * 0.4); 
                dst[row1+1] = Math.floor(g * 0.4); 
                dst[row1+2] = Math.floor(b * 0.4); 
                dst[row1+3] = 255;
                
                dst[row1+4] = Math.floor(r * 0.4); 
                dst[row1+5] = Math.floor(g * 0.4); 
                dst[row1+6] = Math.floor(b * 0.4); 
                dst[row1+7] = 255;
            }
        }
    }

    applyNtsdBleed(src, yScreenLines) {
        const dst = this.upscaledBuffer;
        const width = 256;
        const height = yScreenLines; 

        for (let y = 0; y < height; y++) {
            const rowOffset = y * width * 4;

            for (let x = 0; x < width; x++) {
                const prevX = x > 0 ? x - 1 : 0;
                const nextX = x < width - 1 ? x + 1 : width - 1;

                const pIdx = rowOffset + (x * 4);
                const prevIdx = rowOffset + (prevX * 4);
                const nextIdx = rowOffset + (nextX * 4);

                dst[pIdx] = Math.floor((src[prevIdx] * 0.25) + (src[pIdx] * 0.50) + (src[nextIdx] * 0.25));
                dst[pIdx + 1] = Math.floor((src[prevIdx + 1] * 0.25) + (src[pIdx + 1] * 0.50) + (src[nextIdx + 1] * 0.25));
                dst[pIdx + 2] = Math.floor((src[prevIdx + 2] * 0.25) + (src[pIdx + 2] * 0.50) + (src[nextIdx + 2] * 0.25));
                dst[pIdx + 3] = 255;
            }
        }
    }

    /**
     * Blits the frame buffer to the target canvas.
     * @param {CanvasRenderingContext2D} ctx - Target 2D Canvas context.
     * @param {Uint8ClampedArray} src - Core frame buffer.
     * @param {number} yScreenLines - Active screen lines (224 or 240).
     * @param {number} postProcessMode - Selected filter index.
     */
    blit(ctx, src, yScreenLines, postProcessMode) {
        if (postProcessMode === 6 && this.webglInitialized) {
            const targetGLWidth = 512; 
            const targetGLHeight = yScreenLines * 2; 

            if (this.gl.canvas.width !== targetGLWidth || this.gl.canvas.height !== targetGLHeight) {
                this.gl.canvas.width = targetGLWidth;
                this.gl.canvas.height = targetGLHeight;
            }

            this.renderGL(src, 256, yScreenLines); 
            return;
        }
        
        if (postProcessMode === 6) {
            postProcessMode = 1; 
        }

        let scaleFactor = 1;
        if (postProcessMode === 2 || postProcessMode === 3) scaleFactor = 2; 
        if (postProcessMode === 4) scaleFactor = 4; 

        const targetWidth = 256 * scaleFactor;
        const targetHeight = yScreenLines * scaleFactor; 

        if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
            ctx.canvas.width = targetWidth;
            ctx.canvas.height = targetHeight;
            this.glbImgData = undefined;
        }

        if (this.glbImgData === undefined) {
            this.glbImgData = ctx.createImageData(targetWidth, targetHeight);
        }

        const activeLength = targetWidth * targetHeight * 4;

        if (postProcessMode === 2) {
            this.scale2X(src, this.upscaledBuffer, 256, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 3) {
            this.applyScanlines(src, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 4) {
            this.scale4X(src, yScreenLines);
            this.glbImgData.data.set(this.scale4xBuffer.subarray(0, activeLength));
        } else if (postProcessMode === 5) {
            this.applyNtsdBleed(src, yScreenLines);
            this.glbImgData.data.set(this.upscaledBuffer.subarray(0, activeLength));
        } else {
            this.glbImgData.data.set(src.subarray(0, activeLength));
        }

        ctx.putImageData(this.glbImgData, 0, 0);
    }
}