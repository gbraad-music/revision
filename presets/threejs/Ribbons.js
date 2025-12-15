// Ribbons - Flowing ribbon streams with trail effects
window.RibbonsPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Ribbons');

        this.ribbons = [];
        const ribbonCount = 12;
        
        for (let r = 0; r < ribbonCount; r++) {
            const segments = 100;
            const points = [];
            const width = 0.5 + Math.random() * 1.5;
            
            // Initialize ribbon path
            for (let i = 0; i < segments; i++) {
                const t = i / segments;
                const angle = t * Math.PI * 4 + r * Math.PI * 0.3;
                const radius = 10 + r * 2;
                
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    (t - 0.5) * 30,
                    Math.sin(angle) * radius
                ));
            }
            
            // Create tube geometry for ribbon
            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, segments, width, 8, false);
            
            const material = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                emissive: 0x003333,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                shininess: 100
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            this.scene.add(mesh);
            
            this.ribbons.push({
                mesh: mesh,
                points: points,
                curve: curve,
                width: width,
                speed: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
                ribbonIndex: r
            });
        }
        
        // Add glowing particles along ribbons
        this.ribbonParticles = [];
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.3, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            this.scene.add(sphere);
            
            const ribbonIndex = Math.floor(Math.random() * ribbonCount);
            
            this.ribbonParticles.push({
                mesh: sphere,
                ribbonIndex: ribbonIndex,
                progress: Math.random(),
                speed: 0.1 + Math.random() * 0.2
            });
        }
        
        this.addBasicLighting();
        
        this.camera.position.set(30, 20, 30);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Update ribbons
        this.ribbons.forEach((ribbonData, index) => {
            // Update path points
            for (let i = 0; i < ribbonData.points.length; i++) {
                const point = ribbonData.points[i];
                const t = i / ribbonData.points.length;
                const phase = this.time * ribbonData.speed + ribbonData.phase;
                
                // Flowing wave motion
                const wave1 = Math.sin(phase + t * Math.PI * 4) * 3;
                const wave2 = Math.cos(phase * 1.3 + t * Math.PI * 3) * 2;
                
                // Audio influence
                const bassWave = this.frequencyData.bass * Math.sin(t * Math.PI * 2) * 5;
                const midWave = this.frequencyData.mid * Math.cos(t * Math.PI * 3) * 3;
                
                const angle = t * Math.PI * 4 + ribbonData.ribbonIndex * Math.PI * 0.3 + wave1 * 0.2;
                const radius = 10 + ribbonData.ribbonIndex * 2 + wave2 + midWave;
                
                point.x = Math.cos(angle) * radius;
                point.y = (t - 0.5) * 30 + bassWave;
                point.z = Math.sin(angle) * radius;
            }
            
            // Rebuild curve and geometry
            ribbonData.curve = new THREE.CatmullRomCurve3(ribbonData.points);
            
            const newGeometry = new THREE.TubeGeometry(
                ribbonData.curve, 
                ribbonData.points.length, 
                ribbonData.width * (1 + this.frequencyData.high * 0.5), 
                8, 
                false
            );
            
            ribbonData.mesh.geometry.dispose();
            ribbonData.mesh.geometry = newGeometry;
            
            // Color cycling
            const hue = (this.time * 0.1 + ribbonData.ribbonIndex * 0.1 + this.frequencyData.bass * 0.3) % 1.0;
            ribbonData.mesh.material.color.setHSL(hue, 1.0, 0.5);
            ribbonData.mesh.material.emissive.setHSL(hue, 1.0, 0.2);
        });
        
        // Update particles
        this.ribbonParticles.forEach(particleData => {
            particleData.progress += deltaTime * particleData.speed * (1 + this.frequencyData.high * 2);
            particleData.progress %= 1.0;
            
            const ribbon = this.ribbons[particleData.ribbonIndex];
            if (ribbon && ribbon.curve) {
                const point = ribbon.curve.getPointAt(particleData.progress);
                particleData.mesh.position.copy(point);
                
                // Color
                const hue = (particleData.progress + this.time * 0.2) % 1.0;
                particleData.mesh.material.color.setHSL(hue, 1.0, 0.6);
                
                // Scale
                const scale = 0.5 + Math.sin(particleData.progress * Math.PI * 2) * 0.3 + this.frequencyData.bass * 0.5;
                particleData.mesh.scale.setScalar(scale);
            }
        });
        
        // Camera orbit
        const angle = this.time * 0.1;
        const radius = 35 + Math.sin(this.time * 0.3) * 10;
        this.camera.position.x = Math.cos(angle) * radius;
        this.camera.position.z = Math.sin(angle) * radius;
        this.camera.position.y = 20 + Math.sin(this.time * 0.2) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.ribbons.forEach(ribbonData => {
            ribbonData.mesh.material.opacity = Math.min(1.0, 0.7 + intensity * 0.3);
        });
    }

    dispose() {
        this.ribbons.forEach(ribbonData => {
            this.scene.remove(ribbonData.mesh);
            ribbonData.mesh.geometry.dispose();
            ribbonData.mesh.material.dispose();
        });
        
        this.ribbonParticles.forEach(particleData => {
            this.scene.remove(particleData.mesh);
            particleData.mesh.geometry.dispose();
            particleData.mesh.material.dispose();
        });
    }
};
