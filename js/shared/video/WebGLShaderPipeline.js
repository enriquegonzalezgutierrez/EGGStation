/**
 * Project: EGGStation - Sega & SNES Multi-System Emulator
 * Author: Enrique González Gutiérrez
 * File: js/shared/video/WebGLShaderPipeline.js
 * 
 * Infrastructure Layer: WebGL2 CRT Shader Pipeline
 * 
 * Role:
 * Manages the GPU-accelerated video rendering pipeline. Handles WebGL2 context 
 * initialization, vertex/fragment shaders compilation, VAO/VBO creation, 
 * dynamic texture bindings, and shader uniform updates.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility Principle (SRP): Exclusively responsible for WebGL GPU 
 *   compilation and hardware-accelerated CRT-Royale rendering, completely 
 *   isolated from CPU-bound upscaling algorithms.
 */

class WebGLShaderPipeline {
    /**
     * @param {WebGL2RenderingContext} gl - WebGL2 context used for GPU shaders.
     */
    constructor(gl) {
        this.gl = gl;

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

    /**
     * Initializes vertex and fragment shaders and binds geometry buffers to GPU memory.
     */
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
            console.error("WebGLShaderPipeline::Shader compile failed: ", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    /**
     * Updates shader parameters.
     */
    updateShaderUniforms(curvature, scanlines, phosphor, bloom) {
        this.shCurvature = curvature;
        this.shScanlines = scanlines;
        this.shPhosphor = phosphor;
        this.shBloom = bloom;
    }

    /**
     * Draws the current frame buffer texture to the canvas using WebGL.
     * @param {Uint8Array} rawRgbaBuffer - Cleaned 8-bit RGBA pixel source array.
     * @param {number} width - Game screen resolution width.
     * @param {number} height - Game screen resolution height.
     */
    renderGL(rawRgbaBuffer, width, height) {
        const gl = this.gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.glProgram);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textureHandle);
        
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rawRgbaBuffer);

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