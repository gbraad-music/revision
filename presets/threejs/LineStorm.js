// LineStorm - Dynamic line field with intersecting beams
window.LineStormPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Line Storm');

        this.lines = [];
        this.lineCount = 80;
        
        // Create dynamic lines
        for (let i = 0; i < this.lineCount; i++) {
            const points = [];
            const segments = 50;
            
            for (let j = 0; j < segments; j++) {
                points.push(new THREE.Vector3(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40
                ));
            }
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: new THREE.Color().setHSL(Math.random(), 1.0, 0.5),
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            this.lines.push({
                mesh: line,
                points: points,
                speed: 0.5 + Math.random() * 1.5,
                phase: Math.random() * Math.PI * 2,
                axis: new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize()
            });
        }
        
        // Add focal point particles
        this.focalPoints = [];
        for (let i = 0; i < 5; i++) {
            const geometry = new THREE.SphereGeometry(1, 16, 16);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            this.scene.add(sphere);
            
            this.focalPoints.push({
                mesh: sphere,
                orbit: 15 + i * 3,
                speed: 0.3 + i * 0.1,
                height: (i - 2) * 8
            });
        }
        
        this.camera.position.set(30, 30, 30);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Update lines
        this.lines.forEach((lineData, index) => {
            const positions = lineData.mesh.geometry.attributes.position.array;
            
            for (let i = 0; i < lineData.points.length; i++) {
                const point = lineData.points[i];
                const t = this.time * lineData.speed + lineData.phase;
                
                // Wave motion
                const wave1 = Math.sin(t + i * 0.2) * 5;
                const wave2 = Math.cos(t * 1.3 + i * 0.15) * 3;
                
                // Audio influence
                const bassInfluence = this.frequencyData.bass * 10;
                const midInfluence = this.frequencyData.mid * 5;
                
                positions[i * 3] = point.x + wave1 * lineData.axis.x + bassInfluence * Math.sin(i * 0.1);
                positions[i * 3 + 1] = point.y + wave2 * lineData.axis.y + midInfluence * Math.cos(i * 0.1);
                positions[i * 3 + 2] = point.z + wave1 * lineData.axis.z;
            }
            
            lineData.mesh.geometry.attributes.position.needsUpdate = true;
            
            // Color shift
            const hue = (this.time * 0.1 + index * 0.05 + this.frequencyData.high * 0.5) % 1.0;
            lineData.mesh.material.color.setHSL(hue, 1.0, 0.5);
            
            // Opacity pulsing
            lineData.mesh.material.opacity = 0.4 + Math.sin(this.time * 2 + index * 0.3) * 0.2 + this.frequencyData.bass * 0.4;
        });
        
        // Update focal points
        this.focalPoints.forEach((pointData, index) => {
            const angle = this.time * pointData.speed;
            pointData.mesh.position.set(
                Math.cos(angle) * pointData.orbit,
                pointData.height + Math.sin(this.time * 2 + index) * 2,
                Math.sin(angle) * pointData.orbit
            );
            
            const scale = 1 + this.frequencyData.bass * 2;
            pointData.mesh.scale.setScalar(scale);
            
            const hue = (this.time * 0.15 + index * 0.2) % 1.0;
            pointData.mesh.material.color.setHSL(hue, 1.0, 0.6);
        });
        
        // Camera orbit
        const angle = this.time * 0.1;
        const radius = 35 + Math.sin(this.time * 0.3) * 10;
        this.camera.position.x = Math.cos(angle) * radius;
        this.camera.position.z = Math.sin(angle) * radius;
        this.camera.position.y = 30 + Math.sin(this.time * 0.2) * 15;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.lines.forEach(lineData => {
            lineData.mesh.material.opacity = Math.min(1.0, lineData.mesh.material.opacity + intensity * 0.5);
        });
    }

    dispose() {
        this.lines.forEach(lineData => {
            this.scene.remove(lineData.mesh);
            lineData.mesh.geometry.dispose();
            lineData.mesh.material.dispose();
        });
        
        this.focalPoints.forEach(pointData => {
            this.scene.remove(pointData.mesh);
            pointData.mesh.geometry.dispose();
            pointData.mesh.material.dispose();
        });
    }
};
