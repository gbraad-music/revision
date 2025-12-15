// FractalCube - Recursive cube subdivision with audio reactivity
window.FractalCubePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Fractal Cube');

        this.addBasicLighting();
        
        this.cubes = [];
        this.maxDepth = 3;
        this.rotationSpeed = 0.5;
        
        // Create fractal cube structure
        this.createFractalCube(new THREE.Vector3(0, 0, 0), 10, 0);
        
        // Add particle field
        const particleCount = 1000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 20 + Math.random() * 20;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
            
            const color = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
        
        this.camera.position.set(25, 25, 25);
        this.camera.lookAt(0, 0, 0);
    }
    
    createFractalCube(position, size, depth) {
        if (depth >= this.maxDepth) return;
        
        const geometry = new THREE.BoxGeometry(size, size, size);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ffff,
            transparent: true,
            opacity: 1.0 - (depth * 0.25)
        });
        
        const cube = new THREE.LineSegments(edges, material);
        cube.position.copy(position);
        this.scene.add(cube);
        
        this.cubes.push({
            mesh: cube,
            depth: depth,
            baseSize: size,
            rotationAxis: new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize()
        });
        
        // Recursively create smaller cubes
        const offset = size * 0.6;
        const newSize = size * 0.4;
        
        if (depth < this.maxDepth - 1) {
            const positions = [
                new THREE.Vector3(offset, offset, offset),
                new THREE.Vector3(-offset, offset, offset),
                new THREE.Vector3(offset, -offset, offset),
                new THREE.Vector3(-offset, -offset, offset),
                new THREE.Vector3(offset, offset, -offset),
                new THREE.Vector3(-offset, offset, -offset),
                new THREE.Vector3(offset, -offset, -offset),
                new THREE.Vector3(-offset, -offset, -offset)
            ];
            
            positions.forEach(pos => {
                this.createFractalCube(position.clone().add(pos), newSize, depth + 1);
            });
        }
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Rotate cubes with audio reactivity
        this.cubes.forEach((cubeData, index) => {
            const cube = cubeData.mesh;
            const speed = this.rotationSpeed * (1 + cubeData.depth * 0.5);
            const audioFactor = 1 + this.frequencyData.mid * 2;
            
            cube.rotation.x += deltaTime * speed * audioFactor;
            cube.rotation.y += deltaTime * speed * 1.3 * audioFactor;
            cube.rotation.z += deltaTime * speed * 0.7;
            
            // Pulsate based on audio
            const scale = 1 + Math.sin(this.time * 2 + index * 0.5) * 0.1 * this.frequencyData.bass;
            cube.scale.setScalar(scale);
            
            // Color shift
            const hue = (this.time * 0.1 + cubeData.depth * 0.2 + this.frequencyData.high * 0.3) % 1.0;
            cube.material.color.setHSL(hue, 1.0, 0.5);
        });
        
        // Rotate particles
        this.particles.rotation.y += deltaTime * 0.2;
        this.particles.rotation.x = Math.sin(this.time * 0.3) * 0.3;
        
        // Update particle colors
        const colors = this.particles.geometry.attributes.color.array;
        for (let i = 0; i < colors.length / 3; i++) {
            const hue = (this.time * 0.1 + i * 0.001) % 1.0;
            const color = new THREE.Color().setHSL(hue, 1.0, 0.5 + this.frequencyData.bass * 0.3);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        this.particles.geometry.attributes.color.needsUpdate = true;
        
        // Camera orbit
        const radius = 30 + Math.sin(this.time * 0.5) * 5;
        this.camera.position.x = Math.cos(this.time * 0.2) * radius;
        this.camera.position.z = Math.sin(this.time * 0.2) * radius;
        this.camera.position.y = 25 + Math.sin(this.time * 0.3) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.cubes.forEach(cubeData => {
            const targetScale = 1 + intensity * 0.5;
            cubeData.mesh.scale.setScalar(targetScale);
        });
    }

    dispose() {
        this.cubes.forEach(cubeData => {
            this.scene.remove(cubeData.mesh);
            cubeData.mesh.geometry.dispose();
            cubeData.mesh.material.dispose();
        });
        this.scene.remove(this.particles);
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
};
