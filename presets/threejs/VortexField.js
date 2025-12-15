// VortexField - Swirling vortex with dynamic field lines
window.VortexFieldPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Vortex Field');

        // Create multiple vortex spirals
        this.spirals = [];
        const spiralCount = 5;
        
        for (let s = 0; s < spiralCount; s++) {
            const points = [];
            const segments = 200;
            const turns = 8;
            const radius = 10 + s * 2;
            const height = 20;
            
            for (let i = 0; i < segments; i++) {
                const t = i / segments;
                const angle = t * Math.PI * 2 * turns;
                const r = radius * (1 - t * 0.7);
                const y = (t - 0.5) * height;
                
                points.push(new THREE.Vector3(
                    Math.cos(angle) * r,
                    y,
                    Math.sin(angle) * r
                ));
            }
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            this.spirals.push({
                mesh: line,
                points: points,
                offset: s * Math.PI * 0.4,
                radius: radius
            });
        }
        
        // Create energy orbs
        this.orbs = [];
        const orbCount = 15;
        
        for (let i = 0; i < orbCount; i++) {
            const geometry = new THREE.SphereGeometry(0.5, 16, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            
            const orb = new THREE.Mesh(geometry, material);
            this.scene.add(orb);
            
            this.orbs.push({
                mesh: orb,
                angle: (i / orbCount) * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                radius: 5 + Math.random() * 10,
                height: (Math.random() - 0.5) * 15
            });
        }
        
        // Add glow effect with point light
        this.lights = [];
        for (let i = 0; i < 3; i++) {
            const light = new THREE.PointLight(0x00ffff, 2, 50);
            this.scene.add(light);
            this.lights.push({
                light: light,
                offset: i * Math.PI * 0.666
            });
        }
        
        this.camera.position.set(0, 30, 30);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Update spirals
        this.spirals.forEach((spiralData, index) => {
            spiralData.mesh.rotation.y += deltaTime * (0.5 + index * 0.1) * (1 + this.frequencyData.bass);
            
            // Animate spiral vertices
            const positions = spiralData.mesh.geometry.attributes.position.array;
            for (let i = 0; i < spiralData.points.length; i++) {
                const point = spiralData.points[i];
                const wave = Math.sin(this.time * 2 + i * 0.1 + spiralData.offset) * 0.5 * this.frequencyData.mid;
                
                positions[i * 3] = point.x * (1 + wave);
                positions[i * 3 + 1] = point.y + Math.sin(this.time + i * 0.05) * this.frequencyData.high * 2;
                positions[i * 3 + 2] = point.z * (1 + wave);
            }
            spiralData.mesh.geometry.attributes.position.needsUpdate = true;
            
            // Color cycling
            const hue = (this.time * 0.1 + index * 0.15 + this.frequencyData.bass * 0.5) % 1.0;
            spiralData.mesh.material.color.setHSL(hue, 1.0, 0.5);
        });
        
        // Update orbs
        this.orbs.forEach((orbData, index) => {
            orbData.angle += deltaTime * orbData.speed * (1 + this.frequencyData.mid * 0.5);
            
            const x = Math.cos(orbData.angle) * orbData.radius;
            const z = Math.sin(orbData.angle) * orbData.radius;
            const y = orbData.height + Math.sin(this.time * 2 + index) * 3;
            
            orbData.mesh.position.set(x, y, z);
            
            // Scale pulsing
            const scale = 0.5 + Math.sin(this.time * 3 + index * 0.5) * 0.3 + this.frequencyData.high * 0.5;
            orbData.mesh.scale.setScalar(scale);
            
            // Color
            const hue = (this.time * 0.2 + index * 0.1) % 1.0;
            orbData.mesh.material.color.setHSL(hue, 1.0, 0.6);
        });
        
        // Update lights
        this.lights.forEach((lightData, index) => {
            const angle = this.time * 0.5 + lightData.offset;
            const radius = 15;
            
            lightData.light.position.set(
                Math.cos(angle) * radius,
                Math.sin(this.time * 2 + lightData.offset) * 5,
                Math.sin(angle) * radius
            );
            
            const hue = (this.time * 0.1 + lightData.offset) % 1.0;
            lightData.light.color.setHSL(hue, 1.0, 0.5);
            lightData.light.intensity = 2 + this.frequencyData.bass * 3;
        });
        
        // Camera movement
        const cameraAngle = this.time * 0.15;
        const cameraRadius = 35 + Math.sin(this.time * 0.3) * 5;
        this.camera.position.x = Math.cos(cameraAngle) * cameraRadius;
        this.camera.position.z = Math.sin(cameraAngle) * cameraRadius;
        this.camera.position.y = 30 + Math.sin(this.time * 0.2) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.orbs.forEach(orbData => {
            orbData.mesh.scale.setScalar(1 + intensity);
        });
    }

    dispose() {
        this.spirals.forEach(spiralData => {
            this.scene.remove(spiralData.mesh);
            spiralData.mesh.geometry.dispose();
            spiralData.mesh.material.dispose();
        });
        
        this.orbs.forEach(orbData => {
            this.scene.remove(orbData.mesh);
            orbData.mesh.geometry.dispose();
            orbData.mesh.material.dispose();
        });
        
        this.lights.forEach(lightData => {
            this.scene.remove(lightData.light);
        });
    }
};
