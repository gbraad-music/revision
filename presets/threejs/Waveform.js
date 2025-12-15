// Waveform - 3D audio waveform visualization
window.WaveformPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Waveform');

        this.addBasicLighting();

        // Create waveform grid
        this.waveSegments = 128;
        this.waveWidth = 64;
        this.waves = [];
        this.waveHistory = [];

        for (let i = 0; i < this.waveWidth; i++) {
            this.waveHistory[i] = new Array(this.waveSegments).fill(0);
        }

        // Create the waveform mesh
        const geometry = new THREE.PlaneGeometry(40, 20, this.waveSegments - 1, this.waveWidth - 1);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x003333,
            wireframe: true,
            side: THREE.DoubleSide,
            flatShading: true
        });

        this.waveMesh = new THREE.Mesh(geometry, material);
        this.waveMesh.rotation.x = -Math.PI / 3;
        this.scene.add(this.waveMesh);

        // Add glow particles along the wave
        const particleCount = 500;
        const particlesGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 40;
            positions[i * 3 + 1] = Math.random() * 5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

            const color = new THREE.Color().setHSL(0.5 + Math.random() * 0.2, 1.0, 0.6);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particles);

        // Camera position
        this.camera.position.set(0, 15, 25);
        this.camera.lookAt(0, 0, 0);

        this.wavePhase = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);

        this.wavePhase += deltaTime;

        // Update waveform based on audio
        const positions = this.waveMesh.geometry.attributes.position.array;
        const verticesPerRow = this.waveSegments;

        // Shift wave history forward
        for (let z = this.waveWidth - 1; z > 0; z--) {
            for (let x = 0; x < this.waveSegments; x++) {
                this.waveHistory[z][x] = this.waveHistory[z - 1][x];
            }
        }

        // New wave data from audio and sine waves
        for (let x = 0; x < this.waveSegments; x++) {
            const t = x / this.waveSegments;
            const wave1 = Math.sin(t * Math.PI * 4 + this.wavePhase * 3) * this.frequencyData.bass * 5;
            const wave2 = Math.sin(t * Math.PI * 8 + this.wavePhase * 5) * this.frequencyData.mid * 3;
            const wave3 = Math.sin(t * Math.PI * 16 + this.wavePhase * 7) * this.frequencyData.high * 2;
            this.waveHistory[0][x] = wave1 + wave2 + wave3;
        }

        // Apply wave history to mesh vertices
        for (let z = 0; z < this.waveWidth; z++) {
            for (let x = 0; x < this.waveSegments; x++) {
                const index = (z * verticesPerRow + x) * 3;
                positions[index + 1] = this.waveHistory[z][x];
            }
        }

        this.waveMesh.geometry.attributes.position.needsUpdate = true;
        this.waveMesh.geometry.computeVertexNormals();

        // Color cycling
        const hue = (this.time * 0.1 + this.frequencyData.bass * 0.5) % 1.0;
        this.waveMesh.material.color.setHSL(hue, 1.0, 0.5);
        this.waveMesh.material.emissive.setHSL(hue, 1.0, 0.2);

        // Rotate mesh gently
        this.waveMesh.rotation.z = Math.sin(this.time * 0.3) * 0.2;

        // Update particles
        const particlePositions = this.particles.geometry.attributes.position.array;
        const particleColors = this.particles.geometry.attributes.color.array;

        for (let i = 0; i < particlePositions.length / 3; i++) {
            const i3 = i * 3;
            particlePositions[i3 + 1] += deltaTime * 2;
            
            if (particlePositions[i3 + 1] > 10) {
                particlePositions[i3 + 1] = -5;
                particlePositions[i3] = (Math.random() - 0.5) * 40;
                particlePositions[i3 + 2] = (Math.random() - 0.5) * 20;
            }

            const particleHue = (hue + i * 0.01) % 1.0;
            const color = new THREE.Color().setHSL(particleHue, 1.0, 0.6);
            particleColors[i3] = color.r;
            particleColors[i3 + 1] = color.g;
            particleColors[i3 + 2] = color.b;
        }

        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.color.needsUpdate = true;

        // Camera orbit
        const cameraAngle = this.time * 0.2;
        this.camera.position.x = Math.sin(cameraAngle) * 25;
        this.camera.position.z = Math.cos(cameraAngle) * 25;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Pulse the waveform on beat
        this.waveMesh.scale.y = 1 + intensity * 0.5;
        setTimeout(() => {
            this.waveMesh.scale.y = 1;
        }, 100);
    }

    dispose() {
        this.scene.remove(this.waveMesh);
        this.waveMesh.geometry.dispose();
        this.waveMesh.material.dispose();
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
};
