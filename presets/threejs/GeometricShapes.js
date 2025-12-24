// GeometricShapes - Beat-reactive geometric shapes (ORIGINAL)
window.GeometricShapesPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Geometric Shapes');

        this.addBasicLighting();

        // Create spinning cube (ORIGINAL RED CUBE)
        const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
        const cubeMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x330000,
            emissiveIntensity: 0.2,
            shininess: 30,
            specular: 0x333333,
            wireframe: false
        });
        this.cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        this.scene.add(this.cube);

        // Create starfield particles
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

        this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particles);

        // Camera position
        this.camera.position.z = 5;
        this.camera.lookAt(0, 0, 0);

        this.beatScale = 1.0;
        this.targetBeatScale = 1.0;
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Rotate the cube
        this.cube.rotation.x += deltaTime * 0.5;
        this.cube.rotation.y += deltaTime * 0.3;

        // Beat reactive scale
        this.beatScale += (this.targetBeatScale - this.beatScale) * 0.1;
        this.targetBeatScale += (1.0 - this.targetBeatScale) * 0.05;
        this.cube.scale.setScalar(this.beatScale);

        // Color changes with frequency
        const hue = this.frequencyData.bass * 0.5;

        const color = new THREE.Color().setHSL(hue, 1.0, 0.5);
        this.cube.material.color.copy(color);
        this.cube.material.emissive.copy(color.clone().multiplyScalar(0.2));

        // Rotate particles
        this.particles.rotation.y += deltaTime * 0.1;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        this.targetBeatScale = 1.0 + intensity * 0.5;
    }

    dispose() {
        this.scene.remove(this.cube);
        this.cube.geometry.dispose();
        this.cube.material.dispose();
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
};
