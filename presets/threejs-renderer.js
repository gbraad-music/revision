// ThreeJSRenderer - Three.js integration for 3D visualizations
// Requires three.js: https://threejs.org/

class ThreeJSRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.isInitialized = false;
        this.isAnimating = false;

        // Scene objects
        this.objects = [];
        this.lights = [];

        // Beat reactivity
        this.beatIntensity = 0;
        this.beatPhase = 0;
        this.frequencyBands = {};

        // Animation time
        this.clock = null;
    }

    async initialize() {
        try {
            // Check if Three.js is loaded
            if (typeof THREE === 'undefined') {
                console.error('[ThreeJS] Three.js library not loaded');
                console.info('[ThreeJS] Include: <script src="https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js"></script>');
                return false;
            }

            // Create renderer
            const width = this.canvas.clientWidth || window.innerWidth;
            const height = this.canvas.clientHeight || (window.innerHeight - 120);

            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: false
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio || 1);

            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x000000);
            this.scene.fog = new THREE.Fog(0x000000, 10, 100);

            // Create camera
            this.camera = new THREE.PerspectiveCamera(
                75,
                width / height,
                0.1,
                1000
            );
            this.camera.position.z = 5;

            // Create clock
            this.clock = new THREE.Clock();

            this.isInitialized = true;
            console.log('[ThreeJS] Initialized successfully');

            // Load default scene
            this.loadDefaultScene();

            return true;
        } catch (error) {
            console.error('[ThreeJS] Failed to initialize:', error);
            return false;
        }
    }

    loadDefaultScene() {
        // Create a simple beat-reactive scene with geometric shapes

        // Clear existing objects
        this.clearScene();

        // Ambient light (not beat reactive)
        const ambientLight = new THREE.AmbientLight(0x202020, 0.3);
        ambientLight.userData.beatReactive = false;
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        // Point light (beat reactive)
        const pointLight = new THREE.PointLight(0xffffff, 2, 50);
        pointLight.position.set(5, 5, 5);
        pointLight.userData.beatReactive = true;
        this.scene.add(pointLight);
        this.lights.push(pointLight);

        // Directional light for better shading
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(-5, 10, 5);
        dirLight.userData.beatReactive = false;
        this.scene.add(dirLight);
        this.lights.push(dirLight);

        // Create spinning cube
        const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
        const cubeMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            emissiveIntensity: 0.2,
            shininess: 30,
            specular: 0x333333,
            wireframe: false
        });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.userData = { type: 'beatReactive', baseScale: 1 };
        this.scene.add(cube);
        this.objects.push(cube);

        // Create particles
        const particlesGeometry = new THREE.BufferGeometry();
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 50;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

            colors[i * 3] = Math.random();
            colors[i * 3 + 1] = Math.random();
            colors[i * 3 + 2] = Math.random();
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });

        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        particles.userData = { type: 'particles' };
        this.scene.add(particles);
        this.objects.push(particles);

        console.log('[ThreeJS] Default scene loaded');
    }

    async loadScene(config) {
        if (!this.isInitialized) {
            console.error('[ThreeJS] Not initialized');
            return false;
        }

        try {
            this.clearScene();

            // Execute scene setup function if provided
            if (config.setup && typeof config.setup === 'function') {
                config.setup(this.scene, this.camera, this);
            }

            console.log('[ThreeJS] Scene loaded:', config.name || 'Custom');
            return true;
        } catch (error) {
            console.error('[ThreeJS] Failed to load scene:', error);
            return false;
        }
    }

    clearScene() {
        // Remove all objects
        for (const obj of this.objects) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => mat.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
        this.objects = [];

        // Remove all lights
        for (const light of this.lights) {
            this.scene.remove(light);
        }
        this.lights = [];
    }

    // Handle input events
    handleBeat(data) {
        this.beatIntensity = data.intensity;
        this.beatPhase = data.phase;

        console.log('[ThreeJS] Beat received - intensity:', data.intensity, 'phase:', data.phase);

        // React to beat: pulse objects
        for (const obj of this.objects) {
            if (obj.userData.type === 'beatReactive') {
                const baseScale = obj.userData.baseScale || 1;
                const scale = baseScale + data.intensity * 1.5; // Increased scaling
                obj.scale.setScalar(scale);
                console.log('[ThreeJS] Cube scaled to:', scale);
            }
        }

        // Pulse lights
        for (const light of this.lights) {
            if (light.userData.beatReactive !== false) {
                const intensity = 1 + data.intensity * 5; // Increased intensity
                light.intensity = intensity;
                console.log('[ThreeJS] Light intensity:', intensity);
            }
        }
    }

    handleNote(data) {
        // Create a flash or spawn object based on note
        const hue = (data.note / 127) * 360;
        const color = new THREE.Color(`hsl(${hue}, 100%, 50%)`);

        // Change main object color
        for (const obj of this.objects) {
            if (obj.material && obj.userData.type === 'beatReactive') {
                obj.material.color = color;
                obj.material.emissive = color;
            }
        }
    }

    handleControl(data) {
        // Map CC to camera or object properties
        // Example: CC1 = camera rotation
        if (data.id === 1) {
            this.camera.rotation.y = data.value * Math.PI * 2;
        }
    }

    handleFrequency(data) {
        this.frequencyBands = data.bands;

        // React to frequency bands - STRONG audio reactivity
        if (!data.bands) return;

        const bass = data.bands.bass || 0;
        const mid = data.bands.mid || 0;
        const high = data.bands.high || 0;

        // Debug: Log once per second
        if (!this.lastFreqDebugTime || performance.now() - this.lastFreqDebugTime > 1000) {
            if (bass > 0 || mid > 0 || high > 0) {
                console.log('[ThreeJS] Frequency - Bass:', bass.toFixed(2), 'Mid:', mid.toFixed(2), 'High:', high.toFixed(2));
            }
            this.lastFreqDebugTime = performance.now();
        }

        // Bass affects scale
        for (const obj of this.objects) {
            if (obj.userData.type === 'beatReactive') {
                const baseScale = obj.userData.baseScale || 1;
                const scale = baseScale + bass * 3.0; // Strong bass reaction
                obj.scale.setScalar(scale);
            }

            // Mid affects rotation
            if (obj.userData.type === 'particles') {
                obj.rotation.y += mid * 0.3;
                obj.rotation.x += high * 0.2;
            }
        }

        // Lights react to audio
        for (const light of this.lights) {
            if (light.userData.beatReactive) {
                // Bass affects intensity
                light.intensity = 1 + bass * 8;

                // Mid affects color
                if (light instanceof THREE.PointLight) {
                    const hue = mid * 360;
                    light.color.setHSL(hue / 360, 1.0, 0.5);
                }
            }
        }
    }

    render() {
        if (!this.isInitialized) {
            console.warn('[ThreeJS] render() called but not initialized!');
            return;
        }

        const delta = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();

        // Update scene
        this.updateScene(delta, elapsed);

        // Render
        try {
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('[ThreeJS] Render error:', error);
            this.stop();
        }
    }

    getDebugInfo() {
        return {
            initialized: this.isInitialized,
            animating: this.isAnimating,
            objects: this.objects.length,
            lights: this.lights.length,
            cameraPosition: this.camera ? this.camera.position : null,
            canvasSize: this.canvas ? { w: this.canvas.width, h: this.canvas.height } : null
        };
    }

    updateScene(delta, elapsed) {
        // Animate objects
        for (const obj of this.objects) {
            if (obj.userData.type === 'beatReactive') {
                // Rotate
                obj.rotation.x += delta * 0.5;
                obj.rotation.y += delta * 0.3;

                // Decay beat scale
                const currentScale = obj.scale.x;
                const baseScale = obj.userData.baseScale || 1;
                obj.scale.setScalar(THREE.MathUtils.lerp(currentScale, baseScale, delta * 5));
            }

            if (obj.userData.type === 'particles') {
                obj.rotation.y += delta * 0.2;
            }
        }

        // Decay light intensity
        for (const light of this.lights) {
            if (light.intensity > 1) {
                light.intensity = THREE.MathUtils.lerp(light.intensity, 1, delta * 5);
            }
        }
    }

    start() {
        if (this.isAnimating) {
            console.log('[ThreeJS] Already animating');
            return;
        }
        this.isAnimating = true;
        console.log('[ThreeJS] Animation started');
        this.animate();
    }

    stop() {
        console.log('[ThreeJS] Animation stopped');
        this.isAnimating = false;
    }

    animate() {
        if (!this.isAnimating) {
            console.log('[ThreeJS] Animation loop exited');
            return;
        }

        this.render();
        requestAnimationFrame(() => this.animate());
    }

    resize(width, height) {
        if (!this.isInitialized) return;

        // Set canvas size explicitly
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        // Update Three.js renderer
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        console.log('[ThreeJS] Resized canvas to:', width, 'x', height);
        console.log('[ThreeJS] Canvas actual size:', this.canvas.width, 'x', this.canvas.height);
    }

    destroy() {
        if (this.renderer) {
            this.stop();
            this.clearScene();
            this.renderer.dispose();
            this.renderer = null;
        }

        this.scene = null;
        this.camera = null;
        this.isInitialized = false;

        console.log('[ThreeJS] Destroyed');
    }

    // Helper: Add object to scene
    addObject(object) {
        this.scene.add(object);
        this.objects.push(object);
    }

    // Helper: Add light to scene
    addLight(light) {
        this.scene.add(light);
        this.lights.push(light);
    }
}

window.ThreeJSRenderer = ThreeJSRenderer;
