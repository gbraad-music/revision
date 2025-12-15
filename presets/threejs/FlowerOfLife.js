// FlowerOfLife - Sacred geometry meets audio reactivity
window.FlowerOfLifePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Flower of Life');

        // Create rings for flower of life pattern
        this.rings = [];
        const ringRadius = 3;
        
        // Center circle
        this.createRing(0, 0, 0, ringRadius, 0);
        
        // Six circles around center (first layer)
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * ringRadius;
            const y = Math.sin(angle) * ringRadius;
            this.createRing(x, y, 0, ringRadius, i + 1);
        }
        
        // Twelve circles in second layer
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x = Math.cos(angle) * ringRadius * 2;
            const y = Math.sin(angle) * ringRadius * 2;
            this.createRing(x, y, -5, ringRadius, i + 7);
        }
        
        // Create 3D depth layers
        for (let layer = 1; layer <= 5; layer++) {
            const z = -layer * 8;
            const scale = 1 + layer * 0.2;
            
            this.createRing(0, 0, z, ringRadius * scale, 19 + layer * 7);
            
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + layer * 0.3;
                const x = Math.cos(angle) * ringRadius * scale;
                const y = Math.sin(angle) * ringRadius * scale;
                this.createRing(x, y, z, ringRadius * scale, 19 + layer * 7 + i + 1);
            }
        }

        // Add connecting lines for sacred geometry
        this.createSacredLines();

        // Particle field
        this.particles = [];
        const particleCount = 300;
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        
        for (let i = 0; i < particleCount; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
                transparent: true,
                opacity: 0.6
            });
            
            const particle = new THREE.Mesh(particleGeometry, material);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 15 + Math.random() * 25;
            
            particle.position.x = r * Math.sin(phi) * Math.cos(theta);
            particle.position.y = r * Math.sin(phi) * Math.sin(theta);
            particle.position.z = r * Math.cos(phi) - 20;
            
            this.scene.add(particle);
            this.particles.push({
                mesh: particle,
                theta: theta,
                phi: phi,
                radius: r,
                speed: 0.3 + Math.random() * 0.7
            });
        }

        // Lighting
        this.addBasicLighting();
        
        const centerLight = new THREE.PointLight(0xffffff, 3, 100);
        centerLight.position.set(0, 0, 0);
        this.scene.add(centerLight);
        this.centerLight = centerLight;

        this.camera.position.set(0, 0, 40);
        this.camera.lookAt(0, 0, 0);
    }

    createRing(x, y, z, radius, index) {
        const geometry = new THREE.TorusGeometry(radius, 0.15, 16, 64);
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color().setHSL((index * 0.05) % 1.0, 1.0, 0.5),
            emissive: new THREE.Color().setHSL((index * 0.05) % 1.0, 1.0, 0.3),
            transparent: true,
            opacity: 0.7,
            wireframe: false
        });
        
        const ring = new THREE.Mesh(geometry, material);
        ring.position.set(x, y, z);
        this.scene.add(ring);
        
        this.rings.push({
            mesh: ring,
            baseX: x,
            baseY: y,
            baseZ: z,
            index: index,
            rotSpeed: 0.2 + (index % 5) * 0.1
        });
    }

    createSacredLines() {
        this.lines = [];
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3
        });

        // Connect center to first layer
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const points = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(Math.cos(angle) * 3, Math.sin(angle) * 3, 0)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.scene.add(line);
            this.lines.push(line);
        }
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Rotate and pulse rings
        this.rings.forEach((ringData, i) => {
            const ring = ringData.mesh;
            
            // Rotation
            ring.rotation.x += deltaTime * ringData.rotSpeed;
            ring.rotation.y += deltaTime * ringData.rotSpeed * 0.7;
            ring.rotation.z += deltaTime * ringData.rotSpeed * 0.5;
            
            // Pulsing based on audio
            const pulse = 1 + Math.sin(this.time * 2 + ringData.index * 0.3) * 0.15 + this.frequencyData.bass * 0.4;
            ring.scale.setScalar(pulse);
            
            // Breathing movement
            const breathe = Math.sin(this.time * 1.5 + ringData.index * 0.2) * 0.3;
            ring.position.x = ringData.baseX + breathe * Math.cos(ringData.index);
            ring.position.y = ringData.baseY + breathe * Math.sin(ringData.index);
            ring.position.z = ringData.baseZ + Math.sin(this.time + ringData.index * 0.1) * 2;
            
            // Color shift
            const hue = (ringData.index * 0.05 + this.time * 0.1 + this.frequencyData.mid * 0.3) % 1.0;
            ring.material.color.setHSL(hue, 1.0, 0.5 + this.frequencyData.high * 0.3);
            ring.material.emissive.setHSL(hue, 1.0, 0.3 + this.frequencyData.bass * 0.4);
            
            // Opacity pulsing
            ring.material.opacity = 0.7 + Math.sin(this.time * 3 + ringData.index * 0.5) * 0.2;
        });

        // Animate particles
        this.particles.forEach((pData, i) => {
            const particle = pData.mesh;
            
            // Spiral orbit
            pData.theta += deltaTime * pData.speed;
            pData.phi += deltaTime * pData.speed * 0.5;
            
            const r = pData.radius + Math.sin(this.time * 2 + i * 0.1) * 2;
            
            particle.position.x = r * Math.sin(pData.phi) * Math.cos(pData.theta);
            particle.position.y = r * Math.sin(pData.phi) * Math.sin(pData.theta);
            particle.position.z = r * Math.cos(pData.phi) - 20;
            
            // Color sync with rings
            const hue = (this.time * 0.1 + i / this.particles.length) % 1.0;
            particle.material.color.setHSL(hue, 0.8, 0.6);
        });

        // Pulsing center light
        this.centerLight.intensity = 3 + this.frequencyData.bass * 5;
        const lightHue = (this.time * 0.15) % 1.0;
        this.centerLight.color.setHSL(lightHue, 1.0, 0.7);

        // Camera orbit
        const cameraAngle = this.time * 0.15;
        const cameraRadius = 40 + Math.sin(this.time * 0.5) * 5;
        this.camera.position.x = Math.sin(cameraAngle) * cameraRadius;
        this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
        this.camera.position.y = Math.sin(this.time * 0.3) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash all rings
        this.rings.forEach(ringData => {
            ringData.mesh.scale.setScalar(1 + intensity * 0.5);
        });

        // Particle burst
        this.particles.forEach(pData => {
            const burst = intensity * 2;
            pData.mesh.position.multiplyScalar(1 + burst * 0.1);
        });

        // Light flash
        this.centerLight.intensity = 5 + intensity * 8;
    }

    dispose() {
        this.rings.forEach(ringData => {
            this.scene.remove(ringData.mesh);
            ringData.mesh.geometry.dispose();
            ringData.mesh.material.dispose();
        });
        
        this.lines.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        
        this.particles.forEach(pData => {
            this.scene.remove(pData.mesh);
            pData.mesh.geometry.dispose();
            pData.mesh.material.dispose();
        });
        
        this.scene.remove(this.centerLight);
    }
};
