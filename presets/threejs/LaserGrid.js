// LaserGrid - Geometric laser grid with scanning beams
window.LaserGridPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Laser Grid');

        // Create grid lines
        this.gridLines = [];
        const gridSize = 30;
        const lineCount = 20;
        const spacing = (gridSize * 2) / lineCount;
        
        // Horizontal lines
        for (let i = 0; i < lineCount; i++) {
            const y = -gridSize + i * spacing;
            const points = [
                new THREE.Vector3(-gridSize, y, 0),
                new THREE.Vector3(gridSize, y, 0)
            ];
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            this.gridLines.push({
                mesh: line,
                direction: 'horizontal',
                index: i,
                points: points
            });
        }
        
        // Vertical lines
        for (let i = 0; i < lineCount; i++) {
            const x = -gridSize + i * spacing;
            const points = [
                new THREE.Vector3(x, -gridSize, 0),
                new THREE.Vector3(x, gridSize, 0)
            ];
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            this.gridLines.push({
                mesh: line,
                direction: 'vertical',
                index: i,
                points: points
            });
        }
        
        // Create scanning laser beams
        this.laserBeams = [];
        const beamCount = 8;
        
        for (let i = 0; i < beamCount; i++) {
            const points = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ];
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.8,
                linewidth: 3,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            this.scene.add(line);
            
            this.laserBeams.push({
                mesh: line,
                angle: (i / beamCount) * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                length: 15 + Math.random() * 15,
                offset: Math.random() * Math.PI * 2
            });
        }
        
        // Create intersection points
        this.intersectionPoints = [];
        for (let i = 0; i < 20; i++) {
            const geometry = new THREE.SphereGeometry(0.3, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending
            });
            
            const sphere = new THREE.Mesh(geometry, material);
            this.scene.add(sphere);
            
            this.intersectionPoints.push({
                mesh: sphere,
                active: false,
                lifetime: 0
            });
        }
        
        this.camera.position.set(0, 0, 50);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Animate grid lines
        this.gridLines.forEach((lineData, index) => {
            // Wave effect
            const wave = Math.sin(this.time * 2 + index * 0.2) * 0.3;
            const positions = lineData.mesh.geometry.attributes.position.array;
            
            if (lineData.direction === 'horizontal') {
                positions[2] = wave + this.frequencyData.bass * 5;
                positions[5] = wave + this.frequencyData.bass * 5;
            } else {
                positions[2] = wave + this.frequencyData.mid * 3;
                positions[5] = wave + this.frequencyData.mid * 3;
            }
            
            lineData.mesh.geometry.attributes.position.needsUpdate = true;
            
            // Pulsing opacity
            const pulse = Math.sin(this.time * 3 + index * 0.5) * 0.2 + 0.5;
            lineData.mesh.material.opacity = pulse + this.frequencyData.high * 0.3;
            
            // Color based on frequency
            const hue = lineData.direction === 'horizontal' ? 
                       (0.5 + this.frequencyData.bass * 0.3) % 1.0 : 
                       (0.6 + this.frequencyData.mid * 0.3) % 1.0;
            lineData.mesh.material.color.setHSL(hue, 1.0, 0.5);
        });
        
        // Update laser beams
        this.laserBeams.forEach((beamData, index) => {
            beamData.angle += deltaTime * beamData.speed * (1 + this.frequencyData.mid);
            
            const baseAngle = beamData.angle + beamData.offset;
            const radius = beamData.length;
            
            const startX = Math.cos(baseAngle) * 5;
            const startY = Math.sin(baseAngle) * 5;
            const endX = Math.cos(baseAngle) * radius;
            const endY = Math.sin(baseAngle) * radius;
            
            const positions = beamData.mesh.geometry.attributes.position.array;
            positions[0] = startX;
            positions[1] = startY;
            positions[2] = 0;
            positions[3] = endX;
            positions[4] = endY;
            positions[5] = Math.sin(this.time * 2 + index) * 2;
            
            beamData.mesh.geometry.attributes.position.needsUpdate = true;
            
            // Color cycling
            const hue = (this.time * 0.2 + index * 0.1) % 1.0;
            beamData.mesh.material.color.setHSL(hue, 1.0, 0.5);
            
            // Opacity
            beamData.mesh.material.opacity = 0.6 + Math.sin(this.time * 4 + index) * 0.2 + this.frequencyData.high * 0.3;
        });
        
        // Update intersection points
        this.intersectionPoints.forEach(pointData => {
            if (pointData.active) {
                pointData.lifetime -= deltaTime;
                
                if (pointData.lifetime <= 0) {
                    pointData.active = false;
                    pointData.mesh.material.opacity = 0;
                } else {
                    pointData.mesh.material.opacity = pointData.lifetime;
                    const scale = 1 + (1 - pointData.lifetime) * 2;
                    pointData.mesh.scale.setScalar(scale);
                }
            }
        });
        
        // Create new intersection points randomly
        if (Math.random() < 0.1 * (1 + this.frequencyData.bass)) {
            const inactive = this.intersectionPoints.find(p => !p.active);
            if (inactive) {
                inactive.active = true;
                inactive.lifetime = 1.0;
                inactive.mesh.position.set(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 5
                );
                
                const hue = Math.random();
                inactive.mesh.material.color.setHSL(hue, 1.0, 0.6);
            }
        }
        
        // Camera movement
        this.camera.position.x = Math.sin(this.time * 0.1) * 10;
        this.camera.position.y = Math.cos(this.time * 0.15) * 10;
        this.camera.position.z = 50 + Math.sin(this.time * 0.2) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Pulse all beams
        this.laserBeams.forEach(beamData => {
            beamData.mesh.material.opacity = Math.min(1.0, beamData.mesh.material.opacity + intensity * 0.5);
        });
        
        // Create multiple intersection points
        for (let i = 0; i < 3; i++) {
            const inactive = this.intersectionPoints.find(p => !p.active);
            if (inactive) {
                inactive.active = true;
                inactive.lifetime = 1.0 + intensity;
                inactive.mesh.position.set(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 5
                );
            }
        }
    }

    dispose() {
        this.gridLines.forEach(lineData => {
            this.scene.remove(lineData.mesh);
            lineData.mesh.geometry.dispose();
            lineData.mesh.material.dispose();
        });
        
        this.laserBeams.forEach(beamData => {
            this.scene.remove(beamData.mesh);
            beamData.mesh.geometry.dispose();
            beamData.mesh.material.dispose();
        });
        
        this.intersectionPoints.forEach(pointData => {
            this.scene.remove(pointData.mesh);
            pointData.mesh.geometry.dispose();
            pointData.mesh.material.dispose();
        });
    }
};
