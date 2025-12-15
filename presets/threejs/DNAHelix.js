// DNAHelix - Double helix structure with flowing energy
window.DNAHelixPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing DNA Helix');

        this.addBasicLighting();
        
        // Create double helix
        this.helixStrands = [];
        this.basePairs = [];
        const segments = 100;
        const height = 40;
        const radius = 5;
        const turns = 3;
        
        // Create two strands using lines with neon glow
        for (let strand = 0; strand < 2; strand++) {
            const points = [];
            const offset = strand * Math.PI;
            
            for (let i = 0; i < segments; i++) {
                const t = i / segments;
                const angle = t * Math.PI * 2 * turns + offset;
                const y = (t - 0.5) * height;
                
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    y,
                    Math.sin(angle) * radius
                ));
            }
            
            // Create thin coil-like tube for the strand
            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(
                curve,
                segments,
                0.15,  // Much thinner
                8,
                false
            );
            
            const tubeMaterial = new THREE.MeshBasicMaterial({
                color: strand === 0 ? 0x00ffff : 0xff00ff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            this.scene.add(tube);
            
            // Add glow layer (slightly larger, more transparent)
            const glowGeometry = new THREE.TubeGeometry(
                curve,
                segments,
                0.4,  // Wider for glow
                8,
                false
            );
            
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: strand === 0 ? 0x00ffff : 0xff00ff,
                transparent: true,
                opacity: 0.2,
                blending: THREE.AdditiveBlending
            });
            
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            this.scene.add(glow);
            
            this.helixStrands.push({
                tube: tube,
                glow: glow,
                points: points,
                strand: strand,
                curve: curve
            });
        }
        
        // Create base pairs connecting the strands
        for (let i = 0; i < segments; i += 3) {
            const t = i / segments;
            const angle1 = t * Math.PI * 2 * turns;
            const angle2 = angle1 + Math.PI;
            const y = (t - 0.5) * height;
            
            const point1 = new THREE.Vector3(
                Math.cos(angle1) * radius,
                y,
                Math.sin(angle1) * radius
            );
            
            const point2 = new THREE.Vector3(
                Math.cos(angle2) * radius,
                y,
                Math.sin(angle2) * radius
            );
            
            // Create line for base pair with glow
            const points = [point1, point2];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            // Main thin line
            const material = new THREE.LineBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.9,
                linewidth: 2,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            // Glow sphere at center
            const centerPoint = new THREE.Vector3().lerpVectors(point1, point2, 0.5);
            const glowSphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 8, 8),
                new THREE.MeshBasicMaterial({
                    color: 0xffff00,
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending
                })
            );
            glowSphere.position.copy(centerPoint);
            this.scene.add(glowSphere);
            
            this.basePairs.push({
                line: line,
                glow: glowSphere,
                point1: point1,
                point2: point2,
                centerPoint: centerPoint,
                y: y,
                phase: i * 0.1
            });
        }
        
        // Add flowing particles
        this.flowParticles = [];
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.3, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            
            const particle = new THREE.Mesh(geometry, material);
            this.scene.add(particle);
            
            this.flowParticles.push({
                mesh: particle,
                progress: Math.random(),
                speed: 0.1 + Math.random() * 0.1,
                strand: Math.floor(Math.random() * 2)
            });
        }
        
        // Add central glow
        const glowGeometry = new THREE.CylinderGeometry(1, 1, height, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending
        });
        
        this.centralGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(this.centralGlow);
        
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Rotate entire helix
        const rotationSpeed = 0.3 * (1 + this.frequencyData.bass * 0.5);
        this.helixStrands.forEach(strandData => {
            strandData.tube.rotation.y += deltaTime * rotationSpeed;
            strandData.glow.rotation.y += deltaTime * rotationSpeed;
            
            // Color pulsing
            const hue = (this.time * 0.1 + strandData.strand * 0.5) % 1.0;
            strandData.tube.material.color.setHSL(hue, 1.0, 0.6);
            strandData.glow.material.color.setHSL(hue, 1.0, 0.5);
            
            // Pulse glow opacity
            const glowPulse = 0.2 + Math.sin(this.time * 3 + strandData.strand * Math.PI) * 0.1;
            strandData.glow.material.opacity = glowPulse + this.frequencyData.bass * 0.3;
        });
        
        // Animate base pairs
        this.basePairs.forEach(pairData => {
            pairData.line.rotation.y += deltaTime * rotationSpeed;
            pairData.glow.rotation.y += deltaTime * rotationSpeed;
            
            // Update glow position
            pairData.glow.position.copy(pairData.centerPoint);
            pairData.glow.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), pairData.line.rotation.y);
            
            // Color
            const hue = (this.time * 0.15 + pairData.phase * 0.1) % 1.0;
            pairData.line.material.color.setHSL(hue, 1.0, 0.6);
            pairData.glow.material.color.setHSL(hue, 1.0, 0.5);
            
            // Pulse glow
            const scale = 1 + Math.sin(this.time * 4 + pairData.phase) * 0.3 + this.frequencyData.mid * 0.5;
            pairData.glow.scale.setScalar(scale);
        });
        
        // Update flow particles
        this.flowParticles.forEach(particleData => {
            particleData.progress += deltaTime * particleData.speed * (1 + this.frequencyData.high * 2);
            particleData.progress %= 1.0;
            
            const t = particleData.progress;
            const turns = 3;
            const height = 40;
            const radius = 5;
            const angle = t * Math.PI * 2 * turns + (particleData.strand * Math.PI);
            const y = (t - 0.5) * height;
            
            particleData.mesh.position.set(
                Math.cos(angle) * radius,
                y,
                Math.sin(angle) * radius
            );
            
            // Color based on position
            const hue = (t + this.time * 0.1) % 1.0;
            particleData.mesh.material.color.setHSL(hue, 1.0, 0.6);
            
            // Scale
            const scale = 0.5 + Math.sin(t * Math.PI * 2) * 0.3;
            particleData.mesh.scale.setScalar(scale);
        });
        
        // Pulse central glow
        const glowOpacity = 0.1 + this.frequencyData.bass * 0.2;
        this.centralGlow.material.opacity = glowOpacity;
        this.centralGlow.rotation.y += deltaTime * 0.2;
        
        const glowHue = (this.time * 0.1) % 1.0;
        this.centralGlow.material.color.setHSL(glowHue, 1.0, 0.5);
        
        // Camera orbit
        const cameraAngle = this.time * 0.1;
        const cameraRadius = 20 + Math.sin(this.time * 0.3) * 5;
        this.camera.position.x = Math.cos(cameraAngle) * cameraRadius;
        this.camera.position.z = Math.sin(cameraAngle) * cameraRadius;
        this.camera.position.y = 15 + Math.sin(this.time * 0.2) * 5;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash the helix and glow on beat
        this.helixStrands.forEach(strandData => {
            strandData.tube.material.opacity = Math.min(1.0, 0.9 + intensity * 0.1);
            strandData.glow.material.opacity = Math.min(1.0, 0.2 + intensity * 0.5);
        });
        
        this.basePairs.forEach(pairData => {
            pairData.glow.scale.setScalar(1 + intensity);
        });
    }

    dispose() {
        this.helixStrands.forEach(strandData => {
            this.scene.remove(strandData.tube);
            this.scene.remove(strandData.glow);
            strandData.tube.geometry.dispose();
            strandData.tube.material.dispose();
            strandData.glow.geometry.dispose();
            strandData.glow.material.dispose();
        });
        
        this.basePairs.forEach(pairData => {
            this.scene.remove(pairData.line);
            this.scene.remove(pairData.glow);
            pairData.line.geometry.dispose();
            pairData.line.material.dispose();
            pairData.glow.geometry.dispose();
            pairData.glow.material.dispose();
        });
        
        this.flowParticles.forEach(particleData => {
            this.scene.remove(particleData.mesh);
            particleData.mesh.geometry.dispose();
            particleData.mesh.material.dispose();
        });
        
        this.scene.remove(this.centralGlow);
        this.centralGlow.geometry.dispose();
        this.centralGlow.material.dispose();
    }
};
