// Visual Renderer - WebGL/Canvas 2D with beat-matching
class VisualRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderMode = 'webgl'; // 'webgl' or 'canvas2d'
        this.visualMode = 'tunnel'; // 'tunnel', 'particles', 'kaleidoscope', 'waveform'
        this.gl = null;
        this.ctx = null;

        // Beat tracking
        this.beatPhase = 0; // 0-1 within current beat
        this.barPhase = 0;  // 0-1 within current bar
        this.bpm = 120;
        this.lastBeatPhase = 0; // For beat trigger detection
        this.beatFlash = 0; // 1.0 on beat, decays to 0
        this.barFlash = 0;  // 1.0 on bar, decays to 0

        // Visual parameters (controlled via MIDI/OSC)
        this.hue = 0;
        this.saturation = 100;
        this.brightness = 50;
        this.zoom = 1.0;
        this.rotation = 0;
        this.intensity = 1.0;
        this.segments = 8;
        this.gravity = 0.5;
        this.kick = 0;

        // MIDI note interaction
        this.noteFlashes = []; // {note, velocity, time, duration}
        this.particles = []; // {x, y, vx, vy, hue, life}
        this.barHeights = new Array(128).fill(0); // MIDI note 0-127

        // Animation
        this.lastFrameTime = performance.now();
        this.isAnimating = false;

        // Don't auto-resize - app.js handles resolution management
        // Initial size is set by app.js resizeAllCanvases()
    }

    initialize(mode = 'webgl') {
        this.renderMode = mode;

        // Clear existing contexts
        this.gl = null;
        this.ctx = null;

        // Recreate canvas to clear context
        const parent = this.canvas.parentElement;
        const oldCanvas = this.canvas;
        const newCanvas = document.createElement('canvas');
        newCanvas.id = oldCanvas.id;
        newCanvas.style.cssText = oldCanvas.style.cssText;

        // CRITICAL: Copy canvas dimensions (width/height attributes AND CSS)
        newCanvas.width = oldCanvas.width;
        newCanvas.height = oldCanvas.height;
        newCanvas.style.width = oldCanvas.style.width;
        newCanvas.style.height = oldCanvas.style.height;

        parent.replaceChild(newCanvas, oldCanvas);
        this.canvas = newCanvas;

        console.log('[Renderer] Canvas recreated for mode:', mode, 'dimensions:', newCanvas.width, 'x', newCanvas.height);

        if (mode === 'webgl') {
            return this.initializeWebGL();
        } else {
            return this.initializeCanvas2D();
        }
    }

    initializeWebGL() {
        try {
            this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');

            if (!this.gl) {
                console.error('[Renderer] WebGL not supported, falling back to Canvas 2D');
                return this.initializeCanvas2D();
            }

            console.log('[Renderer] WebGL initialized');

            // Set up WebGL
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);

            // CRITICAL: Set viewport to match canvas dimensions
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            console.log('[Renderer] WebGL viewport set to:', this.canvas.width, 'x', this.canvas.height);

            // Create shaders
            this.createShaders();

            return true;
        } catch (error) {
            console.error('[Renderer] WebGL initialization failed:', error);
            return this.initializeCanvas2D();
        }
    }

    initializeCanvas2D() {
        this.renderMode = 'canvas2d';
        this.ctx = this.canvas.getContext('2d');
        console.log('[Renderer] Canvas 2D initialized');
        return true;
    }

    createShaders() {
        const gl = this.gl;

        // Vertex shader
        const vertexShaderSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        // Fragment shader with beat-reactive visuals
        const fragmentShaderSource = `
            precision mediump float;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_beatPhase;
            uniform float u_barPhase;
            uniform float u_beatFlash;  // 1.0 on beat, decays to 0
            uniform float u_barFlash;   // 1.5 on bar, decays to 0
            uniform vec3 u_color;
            uniform float u_intensity;
            uniform float u_zoom;
            uniform float u_rotation;
            uniform int u_mode; // 0=tunnel, 1=particles, 2=kaleidoscope, 3=waveform

            // Hash function for pseudo-random
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            // Tunnel mode
            vec3 renderTunnel(vec2 uv) {
                float angle = atan(uv.y, uv.x);
                float radius = length(uv);

                // Spiral tunnel - speed up on beat
                float timeSpeed = u_time * (0.3 + u_beatFlash * 0.5);
                float spiral = angle / 6.28318 + radius * 3.0 - timeSpeed + u_rotation;
                float depth = fract(spiral);

                // Pulsing rings - expand on beat
                float beatZoom = u_zoom * (1.0 + u_beatFlash * 0.5);
                float rings = sin(radius * 20.0 / beatZoom - u_time * 2.0 + depth * 6.28318) * 0.5 + 0.5;
                rings *= exp(-radius * 2.0);

                // Color by depth - shift on bar
                float hue = depth + u_time * 0.1 + u_barFlash * 0.2;
                vec3 color = vec3(
                    sin(hue * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.33) * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.67) * 6.28318) * 0.5 + 0.5
                );

                // Dramatic beat flash (1.0 to 3.0 on beat)
                float beatIntensity = u_intensity * (1.0 + u_beatFlash * 2.0 + u_barFlash * 1.5);
                return color * rings * beatIntensity;
            }

            // Particle mode
            vec3 renderParticles(vec2 uv) {
                vec3 color = vec3(0.0);

                // Flowing particles - pulse size on beat
                float particleSize = 8.0 + u_beatFlash * 4.0;

                for(int i = 0; i < 8; i++) {
                    float fi = float(i);
                    vec2 particlePos = vec2(
                        sin(u_time * 0.5 + fi) * 0.5,
                        cos(u_time * 0.3 + fi * 0.7) * 0.5
                    );

                    float dist = length(uv - particlePos * u_zoom);
                    float glow = exp(-dist * particleSize) * (0.3 + u_beatFlash * 0.5);

                    float hue = fi * 0.125 + u_time * 0.1;
                    vec3 particleColor = vec3(
                        sin(hue * 6.28318) * 0.5 + 0.5,
                        sin((hue + 0.33) * 6.28318) * 0.5 + 0.5,
                        sin((hue + 0.67) * 6.28318) * 0.5 + 0.5
                    );

                    color += particleColor * glow;
                }

                // Dramatic beat pulse background
                float pulse = exp(-length(uv) * 2.0) * u_beatFlash * 1.5;
                color += u_color * pulse;

                // Bar explosion flash
                color += vec3(1.0) * u_barFlash * 0.3 * exp(-length(uv) * 3.0);

                return color * u_intensity * (1.0 + u_beatFlash * 0.5);
            }

            // Kaleidoscope mode
            vec3 renderKaleidoscope(vec2 uv) {
                float angle = atan(uv.y, uv.x);
                float radius = length(uv);

                // Mirror segments - rotate on beat
                float segments = 8.0;
                float beatRotation = u_rotation + u_beatFlash * 0.3;
                float segmentAngle = mod(angle, 6.28318 / segments);
                segmentAngle = abs(segmentAngle - 3.14159 / segments);

                // Rotate with beat jitter
                vec2 kaleidoUV = vec2(cos(segmentAngle + beatRotation), sin(segmentAngle + beatRotation)) * radius;

                // Morphing pattern - speed up on beat
                float timeSpeed = u_time * (1.0 + u_beatFlash * 0.5);
                float beatZoom = u_zoom * (1.0 + u_beatFlash * 0.3);
                float pattern = 0.0;
                pattern += sin(kaleidoUV.x * 10.0 * beatZoom + timeSpeed);
                pattern += cos(kaleidoUV.y * 10.0 * beatZoom - timeSpeed * 0.7);
                pattern += sin(length(kaleidoUV) * 15.0 - timeSpeed * 2.0);
                pattern = pattern * 0.5 + 0.5;

                // Color shift - jump on bar
                float hue = pattern + u_barFlash * 0.5 + radius * 0.5;
                vec3 color = vec3(
                    sin(hue * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.33) * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.67) * 6.28318) * 0.5 + 0.5
                );

                // Dramatic beat pulse (shrink radius effect)
                float pulseRadius = radius / (1.0 + u_beatFlash * 0.5);
                color *= exp(-pulseRadius * 1.5);

                // Brightness boost on beat
                return color * u_intensity * (1.5 + u_beatFlash * 2.0 + u_barFlash);
            }

            // Waveform mode
            vec3 renderWaveform(vec2 uv) {
                vec3 color = vec3(0.0);

                // Frequency bars - remap UV from (-1,1) to (0,1) first
                float uvX = (uv.x + 1.0) * 0.5; // 0 to 1
                float barX = uvX * 16.0; // 0 to 16
                float barIndex = floor(barX); // 0-15
                float barPos = fract(barX);

                // Animated bar height - restore good baseline, ADD beat pulses
                float freq = hash(vec2(barIndex + 0.123, 7.456)); // Offset for better hash distribution
                float baseHeight = freq * 0.5 + 0.3; // Good baseline (0.3-0.8)
                float wave = sin(u_time * 2.0 + barIndex * 0.5) * 0.2; // Flowing animation

                // DRAMATIC beat pulse - ADDITIONAL boost on top of baseline
                float beatPulse = u_beatFlash * (0.4 + freq * 0.3); // Varies per bar
                float barPulse = u_barFlash * 0.4; // Extra boost on bar

                float height = baseHeight + wave + beatPulse + barPulse;

                // Mirror effect
                float yDist = abs(uv.y) - height * u_zoom;
                float bar = smoothstep(0.02, 0.0, yDist);

                // Color by frequency - shift on beat
                float hue = freq + u_time * 0.05 + u_beatFlash * 0.3;
                vec3 barColor = vec3(
                    sin(hue * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.33) * 6.28318) * 0.5 + 0.5,
                    sin((hue + 0.67) * 6.28318) * 0.5 + 0.5
                );

                // Glow - brighten on beat
                float glowStrength = 5.0 + u_beatFlash * 3.0;
                float glow = exp(-abs(yDist) * glowStrength) * (0.5 + u_beatFlash * 0.5);

                // Dramatic intensity boost on beat
                float beatIntensity = u_intensity * (1.0 + u_beatFlash * 1.5 + u_barFlash);
                color = (barColor * bar + barColor * glow) * beatIntensity;

                return color;
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

                vec3 color = vec3(0.0);

                // Render based on mode
                if (u_mode == 0) {
                    color = renderTunnel(uv);
                } else if (u_mode == 1) {
                    color = renderParticles(uv);
                } else if (u_mode == 2) {
                    color = renderKaleidoscope(uv);
                } else if (u_mode == 3) {
                    color = renderWaveform(uv);
                }

                // Apply base color tint
                color *= u_color;

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // Compile shaders
        const vertexShader = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('[Renderer] Program link failed:', gl.getProgramInfoLog(this.program));
            return;
        }

        gl.useProgram(this.program);

        // Set up geometry (fullscreen quad)
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Get uniform locations
        this.uniforms = {
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            beatPhase: gl.getUniformLocation(this.program, 'u_beatPhase'),
            barPhase: gl.getUniformLocation(this.program, 'u_barPhase'),
            beatFlash: gl.getUniformLocation(this.program, 'u_beatFlash'),
            barFlash: gl.getUniformLocation(this.program, 'u_barFlash'),
            color: gl.getUniformLocation(this.program, 'u_color'),
            intensity: gl.getUniformLocation(this.program, 'u_intensity'),
            zoom: gl.getUniformLocation(this.program, 'u_zoom'),
            rotation: gl.getUniformLocation(this.program, 'u_rotation'),
            mode: gl.getUniformLocation(this.program, 'u_mode'),
        };
    }

    compileShader(source, type) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[Renderer] Shader compile failed:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    render(time) {
        const deltaTime = time - this.lastFrameTime;
        this.lastFrameTime = time;

        // Decay flash effects
        if (this.beatFlash > 0) {
            this.beatFlash -= deltaTime * 0.005;
            if (this.beatFlash < 0) this.beatFlash = 0;
        }
        if (this.barFlash > 0) {
            this.barFlash -= deltaTime * 0.004;
            if (this.barFlash < 0) this.barFlash = 0;
        }

        if (this.renderMode === 'webgl' && this.gl) {
            this.renderWebGL(time / 1000);
        } else if (this.ctx) {
            this.renderCanvas2D(time / 1000);
        }
    }

    renderWebGL(time) {
        const gl = this.gl;
        if (!gl || !this.program) return;

        // Handle blank/black screen mode - just clear to black
        if (this.visualMode === 'blank') {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return;
        }

        gl.useProgram(this.program);

        // Map visualMode to integer for shader
        const modeMap = { 'tunnel': 0, 'particles': 1, 'kaleidoscope': 2, 'waveform': 3 };
        const modeInt = modeMap[this.visualMode] || 0;

        // Update uniforms
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.time, time);
        gl.uniform1f(this.uniforms.beatPhase, this.beatPhase);
        gl.uniform1f(this.uniforms.barPhase, this.barPhase);
        gl.uniform1f(this.uniforms.beatFlash, this.beatFlash);
        gl.uniform1f(this.uniforms.barFlash, this.barFlash);
        gl.uniform1i(this.uniforms.mode, modeInt);

        // Convert HSL to RGB
        const rgb = this.hslToRgb(this.hue / 360, this.saturation / 100, this.brightness / 100);
        gl.uniform3f(this.uniforms.color, rgb[0], rgb[1], rgb[2]);

        gl.uniform1f(this.uniforms.intensity, this.intensity);
        gl.uniform1f(this.uniforms.zoom, this.zoom);
        gl.uniform1f(this.uniforms.rotation, this.rotation);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    renderCanvas2D(time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        const centerX = w / 2;
        const centerY = h / 2;

        // Render different modes
        switch (this.visualMode) {
            case 'tunnel':
                this.renderTunnel(ctx, w, h, centerX, centerY, time);
                break;
            case 'particles':
                this.renderParticles(ctx, w, h, time);
                break;
            case 'kaleidoscope':
                this.renderKaleidoscope(ctx, w, h, centerX, centerY, time);
                break;
            case 'waveform':
                this.renderWaveform(ctx, w, h, time);
                break;
            case 'blank':
                // Black screen - do nothing (already cleared to black)
                break;
            default:
                this.renderTunnel(ctx, w, h, centerX, centerY, time);
        }
    }

    renderTunnel(ctx, w, h, centerX, centerY, time) {
        // Feedback/trail effect (Milkdrop style)
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;

        // Spiral tunnel with warping
        const spirals = 8;
        const layers = 30;

        for (let layer = 0; layer < layers; layer++) {
            const depth = layer / layers;
            const radius = (Math.min(w, h) * 0.4) * (1 - depth) * this.zoom;
            const wobble = Math.sin(time * 0.5 + depth * Math.PI * 2) * 20;

            for (let spiral = 0; spiral < spirals; spiral++) {
                const angle = (spiral / spirals) * Math.PI * 2 +
                             this.rotation +
                             time * 0.3 +
                             depth * Math.PI * 4;

                const x = centerX + Math.cos(angle) * (radius + wobble);
                const y = centerY + Math.sin(angle) * (radius + wobble);

                // DRAMATIC beat flash - size pulses 1x to 3x
                const beatSize = 1.0 + this.beatFlash * 2.0 + this.barFlash * 1.5;
                const size = 15 * (1 - depth) * beatSize;

                // Color shifts through spectrum - jump on bar
                const hue = (this.hue + depth * 180 + time * 20 + this.barFlash * 60) % 360;

                // Intensity boost on beat
                const beatIntensity = this.intensity * (1.0 + this.beatFlash * 2.0);
                const alpha = (1 - depth) * beatIntensity;

                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);

                // Brightness boost on beat
                const beatBrightness = this.brightness + this.beatFlash * 30 + this.barFlash * 20;
                ctx.fillStyle = `hsla(${hue}, ${this.saturation}%, ${beatBrightness}%, ${alpha})`;
                ctx.fill();

                // DRAMATIC glow effect - bigger on beat
                const glowSize = size * (2 + this.beatFlash * 2.0);
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
                const glowBrightness = 70 + this.beatFlash * 30;
                gradient.addColorStop(0, `hsla(${hue}, 100%, ${glowBrightness}%, ${alpha * 0.5})`);
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fillRect(x - glowSize, y - glowSize, glowSize * 2, glowSize * 2);
            }
        }

        // Note flashes
        this.renderNoteFlashes(ctx, centerX, centerY, time);
    }

    renderParticles(ctx, w, h, time) {
        // Feedback trail (longer trails)
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;

        // Update and render particles with trails
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Store old position for trail
            const oldX = p.x * w;
            const oldY = p.y * h;

            // Update position
            p.x += p.vx;
            p.y += p.vy;

            // Gravity and drag
            p.vy += this.gravity * 0.0008;
            p.vx *= 0.99;
            p.vy *= 0.99;

            // Wrap around edges
            if (p.x < 0) p.x = 1;
            if (p.x > 1) p.x = 0;
            if (p.y < 0) p.y = 1;
            if (p.y > 1) p.y = 0;

            p.life -= 0.008;

            // Remove dead particles
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Render particle with trail
            const px = p.x * w;
            const py = p.y * h;
            const size = p.life * 12;

            // Draw trail line
            ctx.beginPath();
            ctx.moveTo(oldX, oldY);
            ctx.lineTo(px, py);
            ctx.strokeStyle = `hsla(${p.hue}, 100%, 60%, ${p.life * this.intensity * 0.3})`;
            ctx.lineWidth = size * 0.5;
            ctx.stroke();

            // Draw particle glow
            const gradient = ctx.createRadialGradient(px, py, 0, px, py, size * 2);
            gradient.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${p.life * this.intensity})`);
            gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 60%, ${p.life * this.intensity * 0.5})`);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(px, py, size * 2, 0, Math.PI * 2);
            ctx.fill();

            // Core particle
            ctx.beginPath();
            ctx.arc(px, py, size * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${this.intensity})`;
            ctx.fill();
        }

        // Dynamic background energy field
        const centerX = w / 2;
        const centerY = h / 2;
        const pulseSize = 150 + this.beatPhase * 100;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseSize);
        gradient.addColorStop(0, `hsla(${this.hue}, ${this.saturation}%, ${this.brightness + 10}%, ${0.2 * this.intensity})`);
        gradient.addColorStop(0.5, `hsla(${(this.hue + 60) % 360}, ${this.saturation}%, ${this.brightness}%, ${0.1 * this.intensity})`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    }

    renderKaleidoscope(ctx, w, h, centerX, centerY, time) {
        // Feedback trail
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;

        ctx.save();
        ctx.translate(centerX, centerY);

        const maxDist = Math.min(w, h) * 0.45;

        // Draw mirrored segments with complex patterns
        for (let seg = 0; seg < this.segments; seg++) {
            ctx.save();
            ctx.rotate((seg / this.segments) * Math.PI * 2 + this.rotation);

            // Multiple layers of shapes
            const shapes = 15;
            for (let i = 0; i < shapes; i++) {
                const progress = i / shapes;
                const dist = progress * maxDist * this.zoom;

                // Morphing shape size based on beat and position
                const baseSize = 10 + progress * 30;
                const pulse = Math.sin(time * 2 + i * 0.5) * 5;
                const size = baseSize + pulse + this.beatPhase * 15;

                // Wavy offset
                const offset = Math.sin(time + i * 0.3) * 30;

                // Color cycling
                const hue = (this.hue + progress * 240 + time * 30) % 360;
                const saturation = this.saturation * (0.7 + Math.sin(time * 0.5 + i) * 0.3);
                const brightness = this.brightness * (0.8 + progress * 0.4);

                // Draw shape with rotation
                ctx.save();
                ctx.translate(dist, offset);
                ctx.rotate(time * 0.5 + i * 0.2);

                // Star/flower pattern
                ctx.beginPath();
                const points = 5;
                for (let p = 0; p < points; p++) {
                    const angle = (p / points) * Math.PI * 2;
                    const r = size * (p % 2 === 0 ? 1 : 0.5);
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;
                    if (p === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();

                // Gradient fill
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
                gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${brightness + 20}%, ${this.intensity})`);
                gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${brightness}%, ${this.intensity * 0.3})`);
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.restore();
            }

            ctx.restore();
        }

        ctx.restore();
    }

    renderWaveform(ctx, w, h, time) {
        // Feedback trail
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1.0;

        const barCount = 64;
        const barWidth = w / barCount;
        const centerY = h / 2;

        for (let i = 0; i < barCount; i++) {
            // Get bar height from MIDI notes (cycling through 128 notes)
            const noteIndex = Math.floor((i / barCount) * 128);
            let barHeight = this.barHeights[noteIndex] || 0;

            // Add beat kick
            barHeight += this.kick * 0.3;

            // Add flowing baseline variation
            const wave1 = Math.sin(i * 0.3 + time * 2) * 0.15;
            const wave2 = Math.cos(i * 0.5 - time * 1.5) * 0.1;
            barHeight = Math.max(barHeight, 0.2 + wave1 + wave2 + this.barPhase * 0.1);

            const height = barHeight * h * 0.45;

            // Position with wavy offset
            const xOffset = Math.sin(i * 0.2 + time) * 10;
            const x = i * barWidth + xOffset;

            // Mirror effect - top and bottom
            const y1 = centerY - height;
            const y2 = centerY;

            // Dynamic color based on position and height
            const hue = (this.hue + i * 3 + time * 20 + (barHeight * 120)) % 360;
            const sat = this.saturation * (0.8 + barHeight * 0.4);

            // Gradient fill
            const gradient = ctx.createLinearGradient(x, y1, x, centerY + height);
            gradient.addColorStop(0, `hsla(${hue}, ${sat}%, ${this.brightness + 20}%, ${this.intensity})`);
            gradient.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${this.brightness}%, ${this.intensity * 0.8})`);
            gradient.addColorStop(1, `hsla(${hue}, ${sat}%, ${this.brightness - 10}%, ${this.intensity * 0.5})`);

            // Top bar (inverted)
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y1, barWidth - 2, height);

            // Bottom bar (mirrored)
            ctx.fillRect(x, y2, barWidth - 2, height);

            // Glow effect on peaks
            if (barHeight > 0.5) {
                ctx.beginPath();
                ctx.arc(x + barWidth / 2, y1, barWidth * 0.7, 0, Math.PI * 2);
                const glowGradient = ctx.createRadialGradient(
                    x + barWidth / 2, y1, 0,
                    x + barWidth / 2, y1, barWidth * 2
                );
                glowGradient.addColorStop(0, `hsla(${hue}, 100%, 70%, ${barHeight * 0.5})`);
                glowGradient.addColorStop(1, 'transparent');
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }

    renderNoteFlashes(ctx, centerX, centerY, time) {
        // Render and cleanup note flashes
        for (let i = this.noteFlashes.length - 1; i >= 0; i--) {
            const flash = this.noteFlashes[i];
            const age = time - flash.time;

            if (age > flash.duration) {
                this.noteFlashes.splice(i, 1);
                continue;
            }

            const progress = age / flash.duration;
            const radius = 50 + progress * 100;
            const alpha = (1 - progress) * (flash.velocity / 127);

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${(flash.note * 3) % 360}, 100%, 70%, ${alpha})`;
            ctx.lineWidth = 5;
            ctx.stroke();
        }
    }

    updateBeat(beatPhase, barPhase) {
        // Detect beat trigger (phase crossed 0)
        if (beatPhase < this.lastBeatPhase) {
            this.beatFlash = 1.0;

            // Detect bar (every 4 beats)
            if (barPhase < 0.25 && barPhase >= 0) {
                this.barFlash = 1.5;
            }
        }

        this.lastBeatPhase = beatPhase;
        this.beatPhase = beatPhase;
        this.barPhase = barPhase;
    }

    setBPM(bpm) {
        this.bpm = bpm;
    }

    setParameter(param, value) {
        switch (param) {
            case 'hue':
                this.hue = value;
                break;
            case 'saturation':
                this.saturation = value;
                break;
            case 'brightness':
                this.brightness = value;
                break;
            case 'zoom':
                this.zoom = value;
                break;
            case 'rotation':
                this.rotation = value;
                break;
            case 'intensity':
                this.intensity = value;
                break;
            case 'segments':
                this.segments = value;
                break;
            case 'gravity':
                this.gravity = value;
                break;
            case 'kick':
                this.kick = value;
                break;
        }
    }

    setMode(mode) {
        this.visualMode = mode;
        console.log('[Renderer] Visual mode:', mode);
    }

    // MIDI Note Interactions
    flashNote(note, velocity) {
        this.noteFlashes.push({
            note,
            velocity,
            time: performance.now(),
            duration: 200 // ms
        });
    }

    spawnParticles(note, velocity) {
        // Particle limit to prevent performance issues
        const MAX_PARTICLES = 500;
        if (this.particles.length > MAX_PARTICLES) {
            console.warn('[Renderer] Max particles reached, skipping spawn');
            return;
        }

        const count = Math.floor((velocity / 127) * 20) + 5;
        const hue = (note * 3) % 360;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (velocity / 127) * 5 + 2;

            this.particles.push({
                x: 0.5, // Center
                y: 0.5,
                vx: Math.cos(angle) * speed * 0.01,
                vy: Math.sin(angle) * speed * 0.01,
                hue: hue,
                life: 1.0
            });
        }
    }

    setBarHeight(note, velocity) {
        this.barHeights[note] = velocity / 127;

        // Decay over time
        setTimeout(() => {
            this.barHeights[note] *= 0.8;
        }, 100);
    }

    hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [r, g, b];
    }

    start() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        console.log('[Renderer] 🚀 Starting - canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
        console.log('[Renderer] 🚀 Starting - client dimensions:', this.canvas.clientWidth, 'x', this.canvas.clientHeight);
        if (this.gl) {
            const viewport = this.gl.getParameter(this.gl.VIEWPORT);
            console.log('[Renderer] 🚀 Starting - WebGL viewport:', viewport);
        }
        this.animate();
    }

    stop() {
        this.isAnimating = false;
    }

    animate() {
        if (!this.isAnimating) return;

        const time = performance.now();
        this.render(time);

        requestAnimationFrame(() => this.animate());
    }
}

window.VisualRenderer = VisualRenderer;
