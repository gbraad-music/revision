// MatrixRain - Inspired by The Matrix digital rain effect in 3D
window.MatrixRainPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Matrix Rain');

        this.columns = 40;
        this.rows = 30;
        this.rainDrops = [];
        
        // Create rain drop columns
        for (let col = 0; col < this.columns; col++) {
            for (let row = 0; row < this.rows; row++) {
                const geometry = new THREE.PlaneGeometry(0.8, 1);
                const material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(0, 1, 0),
                    transparent: true,
                    opacity: 0,
                    side: THREE.DoubleSide
                });
                
                const drop = new THREE.Mesh(geometry, material);
                drop.position.x = (col - this.columns / 2) * 1;
                drop.position.y = (row - this.rows / 2) * 1.2;
                drop.position.z = -10 - Math.random() * 20;
                
                this.scene.add(drop);
                
                this.rainDrops.push({
                    mesh: drop,
                    column: col,
                    row: row,
                    speed: 5 + Math.random() * 10,
                    phase: Math.random() * 100
                });
            }
        }

        // Column states for cascading effect
        this.columnStates = [];
        for (let i = 0; i < this.columns; i++) {
            this.columnStates.push({
                active: Math.random() > 0.5,
                position: Math.random() * this.rows,
                speed: 5 + Math.random() * 10,
                length: 5 + Math.random() * 15,
                nextReset: Math.random() * 3
            });
        }

        // Create 3D grid structure
        this.gridLines = [];
        const gridSize = 50;
        const gridStep = 2;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x003300,
            transparent: true,
            opacity: 0.3
        });

        // Horizontal lines
        for (let i = -gridSize / 2; i <= gridSize / 2; i += gridStep) {
            const points = [
                new THREE.Vector3(-gridSize / 2, i, -30),
                new THREE.Vector3(gridSize / 2, i, -30)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        // Vertical lines
        for (let i = -gridSize / 2; i <= gridSize / 2; i += gridStep) {
            const points = [
                new THREE.Vector3(i, -gridSize / 2, -30),
                new THREE.Vector3(i, gridSize / 2, -30)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        // Create glowing code symbols
        this.codeSymbols = [];
        const symbolCount = 50;
        
        for (let i = 0; i < symbolCount; i++) {
            const geometry = new THREE.SphereGeometry(0.2, 16, 16);
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0, 1, 0),
                transparent: true,
                opacity: 0.8
            });
            
            const symbol = new THREE.Mesh(geometry, material);
            symbol.position.x = (Math.random() - 0.5) * 40;
            symbol.position.y = (Math.random() - 0.5) * 30;
            symbol.position.z = -10 - Math.random() * 30;
            
            this.scene.add(symbol);
            this.codeSymbols.push({
                mesh: symbol,
                speed: 2 + Math.random() * 5,
                pulse: Math.random() * Math.PI * 2
            });
        }

        // Ambient green glow
        const ambientLight = new THREE.AmbientLight(0x003300);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0x00ff00, 2, 100);
        pointLight.position.set(0, 0, 10);
        this.scene.add(pointLight);
        this.pointLight = pointLight;

        // Fog for depth
        this.scene.fog = new THREE.FogExp2(0x000000, 0.02);

        this.camera.position.set(0, 0, 20);
        this.camera.lookAt(0, 0, -20);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Update column states
        this.columnStates.forEach((colState, col) => {
            colState.position += deltaTime * colState.speed * (1 + this.frequencyData.bass);
            
            if (colState.position > this.rows) {
                colState.position = 0;
                colState.length = 5 + Math.random() * 15;
                colState.speed = 5 + Math.random() * 10;
            }
        });

        // Update rain drops based on column states
        this.rainDrops.forEach((dropData, i) => {
            const colState = this.columnStates[dropData.column];
            const drop = dropData.mesh;
            
            // Check if drop is in the active range of its column
            const distanceFromHead = colState.position - dropData.row;
            const isInRain = distanceFromHead > 0 && distanceFromHead < colState.length;
            
            if (isInRain) {
                // Bright at the head, fading toward the tail
                const brightness = 1.0 - (distanceFromHead / colState.length);
                drop.material.opacity = brightness * (0.5 + this.frequencyData.mid * 0.5);
                
                // Brighter green at head
                const greenValue = brightness * (0.7 + this.frequencyData.high * 0.3);
                drop.material.color.setRGB(0, greenValue, 0);
                
                // Scale effect
                const scale = 1 + brightness * 0.5;
                drop.scale.set(scale, scale, scale);
            } else {
                drop.material.opacity *= 0.95;
            }
            
            // Slight wave motion
            drop.position.x = (dropData.column - this.columns / 2) * 1 + 
                            Math.sin(this.time * 2 + dropData.phase) * 0.3;
        });

        // Pulse code symbols
        this.codeSymbols.forEach((symbolData, i) => {
            const symbol = symbolData.mesh;
            
            // Move downward
            symbol.position.y -= deltaTime * symbolData.speed;
            
            if (symbol.position.y < -20) {
                symbol.position.y = 20;
                symbol.position.x = (Math.random() - 0.5) * 40;
            }
            
            // Pulse
            symbolData.pulse += deltaTime * 3;
            const pulseBrightness = 0.5 + Math.sin(symbolData.pulse) * 0.3 + this.frequencyData.bass * 0.5;
            symbol.material.opacity = pulseBrightness;
            
            const scale = 1 + Math.sin(symbolData.pulse) * 0.3;
            symbol.scale.setScalar(scale);
            
            // Color variation
            const greenShade = 0.7 + Math.sin(symbolData.pulse) * 0.3;
            symbol.material.color.setRGB(0, greenShade, 0);
        });

        // Pulsing light
        this.pointLight.intensity = 2 + this.frequencyData.bass * 3;

        // Camera subtle movement
        this.camera.position.x = Math.sin(this.time * 0.3) * 2;
        this.camera.position.y = Math.cos(this.time * 0.5) * 2;
        this.camera.rotation.z = Math.sin(this.time * 0.2) * 0.02;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash effect
        this.rainDrops.forEach(dropData => {
            if (dropData.mesh.material.opacity > 0.2) {
                dropData.mesh.material.opacity = 1.0;
                dropData.mesh.material.color.setRGB(0, 1, 0);
            }
        });

        // Speed boost
        this.columnStates.forEach(colState => {
            colState.speed += intensity * 10;
            setTimeout(() => {
                colState.speed = 5 + Math.random() * 10;
            }, 200);
        });

        // Light flash
        this.pointLight.intensity = 5 + intensity * 8;
    }

    dispose() {
        this.rainDrops.forEach(dropData => {
            this.scene.remove(dropData.mesh);
            dropData.mesh.geometry.dispose();
            dropData.mesh.material.dispose();
        });
        
        this.gridLines.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        
        this.codeSymbols.forEach(symbolData => {
            this.scene.remove(symbolData.mesh);
            symbolData.mesh.geometry.dispose();
            symbolData.mesh.material.dispose();
        });
        
        this.scene.remove(this.pointLight);
        this.scene.fog = null;
    }
};
