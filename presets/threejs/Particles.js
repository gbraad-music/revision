// Particles - Audio-reactive particle field
window.ParticlesPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Particles');

        // Create massive particle system
        const particleCount = 10000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const originalPositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;

            // Create particles in multiple layers
            const layer = Math.floor(i / 2000);
            const radius = 10 + layer * 5;
            const theta = (i / 2000) * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            originalPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            originalPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            originalPositions[i3 + 2] = radius * Math.cos(phi);

            positions[i3] = originalPositions[i3];
            positions[i3 + 1] = originalPositions[i3 + 1];
            positions[i3 + 2] = originalPositions[i3 + 2];

            // Rainbow colors
            const hue = (i / particleCount + layer * 0.2) % 1.0;
            const color = new THREE.Color().setHSL(hue, 1.0, 0.6);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);

        this.originalPositions = originalPositions;
        this.particleCount = particleCount;
        this.explosionPhase = 0;

        // Camera position
        this.camera.position.z = 40;
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);

        const positions = this.particles.geometry.attributes.position.array;
        const colors = this.particles.geometry.attributes.color.array;

        // Explosion effect decays
        this.explosionPhase *= 0.95;

        // Create waves and audio-reactive displacement
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;

            // Get original position
            const origX = this.originalPositions[i3];
            const origY = this.originalPositions[i3 + 1];
            const origZ = this.originalPositions[i3 + 2];

            const origRadius = Math.sqrt(origX * origX + origY * origY + origZ * origZ);

            // Wave effect
            const wave1 = Math.sin(this.time * 2 + origRadius * 0.2 + i * 0.001) * 2;
            const wave2 = Math.cos(this.time * 3 - origRadius * 0.15 + i * 0.0005) * 1.5;
            const waveDisplacement = wave1 + wave2;

            // Audio-reactive displacement
            const bassDisplacement = this.frequencyData.bass * 10;
            const midDisplacement = this.frequencyData.mid * 5;

            // Explosion effect
            const explosionDisplacement = this.explosionPhase * 15;

            // Total displacement
            const totalDisplacement = 1 + (waveDisplacement + bassDisplacement + midDisplacement + explosionDisplacement) / origRadius;

            positions[i3] = origX * totalDisplacement;
            positions[i3 + 1] = origY * totalDisplacement;
            positions[i3 + 2] = origZ * totalDisplacement;

            // Rainbow color cycling with audio reactivity
            const layer = Math.floor(i / 2000);
            const hue = (this.time * 0.1 + i / this.particleCount + this.frequencyData.bass + layer * 0.2) % 1.0;
            const lightness = 0.5 + this.frequencyData.high * 0.4;
            const color = new THREE.Color().setHSL(hue, 1.0, lightness);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.geometry.attributes.color.needsUpdate = true;

        // Rotate particle field
        this.particles.rotation.y += deltaTime * (0.3 + this.frequencyData.mid);
        this.particles.rotation.x += deltaTime * this.frequencyData.bass * 0.8;

        // Audio-reactive particle size
        this.particles.material.size = 0.3 + this.frequencyData.mid * 0.5;

        // Camera orbit
        const cameraRadius = 40 + this.frequencyData.bass * 10;
        this.camera.position.x = Math.sin(this.time * 0.3) * cameraRadius * 0.5;
        this.camera.position.z = Math.cos(this.time * 0.3) * cameraRadius;
        this.camera.position.y = Math.sin(this.time * 0.2) * 15;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Explosion effect on beat!
        this.explosionPhase = intensity;

        // Pulse particle size on beat
        this.particles.material.size = 0.3 + intensity * 0.8;
    }

    dispose() {
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
};
