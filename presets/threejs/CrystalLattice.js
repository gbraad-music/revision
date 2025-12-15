// CrystalLattice - Interconnected crystal structure with shader effects
window.CrystalLatticePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Crystal Lattice');

        this.addBasicLighting();
        
        // Create lattice nodes
        this.nodes = [];
        this.connections = [];
        const gridSize = 5;
        const spacing = 6;
        
        // Create grid of nodes
        for (let x = -gridSize; x <= gridSize; x++) {
            for (let y = -gridSize; y <= gridSize; y++) {
                for (let z = -gridSize; z <= gridSize; z++) {
                    if (Math.abs(x) + Math.abs(y) + Math.abs(z) <= gridSize) {
                        const geometry = new THREE.OctahedronGeometry(0.5);
                        const material = new THREE.MeshPhongMaterial({
                            color: 0x00ffff,
                            emissive: 0x003333,
                            transparent: true,
                            opacity: 0.8,
                            shininess: 100
                        });
                        
                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.position.set(x * spacing, y * spacing, z * spacing);
                        this.scene.add(mesh);
                        
                        this.nodes.push({
                            mesh: mesh,
                            basePos: new THREE.Vector3(x * spacing, y * spacing, z * spacing),
                            phase: Math.random() * Math.PI * 2,
                            gridPos: { x, y, z }
                        });
                    }
                }
            }
        }
        
        // Create connections between nearby nodes
        const connectionMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        
        this.nodes.forEach((node1, i) => {
            this.nodes.slice(i + 1).forEach(node2 => {
                const dist = node1.basePos.distanceTo(node2.basePos);
                if (dist < spacing * 1.5) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        node1.basePos.clone(),
                        node2.basePos.clone()
                    ]);
                    
                    const line = new THREE.Line(geometry, connectionMaterial.clone());
                    this.scene.add(line);
                    
                    this.connections.push({
                        mesh: line,
                        node1: node1,
                        node2: node2
                    });
                }
            });
        });
        
        // Add energy particles flowing through lattice
        this.particles = [];
        const particleCount = 100;
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.2, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            });
            
            const particle = new THREE.Mesh(geometry, material);
            this.scene.add(particle);
            
            const startNode = this.nodes[Math.floor(Math.random() * this.nodes.length)];
            
            this.particles.push({
                mesh: particle,
                currentNode: startNode,
                targetNode: null,
                progress: 0,
                speed: 0.5 + Math.random() * 0.5
            });
        }
        
        this.camera.position.set(40, 40, 40);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Animate nodes
        this.nodes.forEach((nodeData, index) => {
            const pulse = Math.sin(this.time * 2 + nodeData.phase) * 0.5 + 0.5;
            const audioPulse = this.frequencyData.bass * 3;
            
            // Oscillate position
            const offset = new THREE.Vector3(
                Math.sin(this.time + nodeData.phase),
                Math.cos(this.time * 1.3 + nodeData.phase),
                Math.sin(this.time * 0.7 + nodeData.phase)
            ).multiplyScalar(0.5 + audioPulse);
            
            nodeData.mesh.position.copy(nodeData.basePos).add(offset);
            
            // Rotate
            nodeData.mesh.rotation.x += deltaTime * (1 + pulse);
            nodeData.mesh.rotation.y += deltaTime * (1.3 + this.frequencyData.mid);
            
            // Scale
            const scale = 1 + pulse * 0.3 + this.frequencyData.high * 0.5;
            nodeData.mesh.scale.setScalar(scale);
            
            // Color
            const hue = (this.time * 0.1 + pulse * 0.2 + this.frequencyData.mid * 0.3) % 1.0;
            nodeData.mesh.material.color.setHSL(hue, 1.0, 0.5);
            nodeData.mesh.material.emissive.setHSL(hue, 1.0, 0.2);
        });
        
        // Update connections
        this.connections.forEach(connData => {
            const positions = connData.mesh.geometry.attributes.position.array;
            positions[0] = connData.node1.mesh.position.x;
            positions[1] = connData.node1.mesh.position.y;
            positions[2] = connData.node1.mesh.position.z;
            positions[3] = connData.node2.mesh.position.x;
            positions[4] = connData.node2.mesh.position.y;
            positions[5] = connData.node2.mesh.position.z;
            connData.mesh.geometry.attributes.position.needsUpdate = true;
            
            // Pulsing opacity
            const dist = connData.node1.mesh.position.distanceTo(connData.node2.mesh.position);
            const opacity = 0.2 + Math.sin(this.time * 2 - dist * 0.5) * 0.2 + this.frequencyData.bass * 0.3;
            connData.mesh.material.opacity = Math.max(0.1, Math.min(0.6, opacity));
        });
        
        // Animate particles
        this.particles.forEach(particleData => {
            if (!particleData.targetNode) {
                // Pick a random connected node
                const nearby = this.nodes.filter(node => 
                    node.basePos.distanceTo(particleData.currentNode.basePos) < 10
                );
                particleData.targetNode = nearby[Math.floor(Math.random() * nearby.length)] || particleData.currentNode;
                particleData.progress = 0;
            }
            
            particleData.progress += deltaTime * particleData.speed * (1 + this.frequencyData.high * 2);
            
            if (particleData.progress >= 1) {
                particleData.currentNode = particleData.targetNode;
                particleData.targetNode = null;
            } else {
                // Interpolate position
                particleData.mesh.position.lerpVectors(
                    particleData.currentNode.mesh.position,
                    particleData.targetNode.mesh.position,
                    particleData.progress
                );
            }
            
            // Color trail
            const hue = (this.time * 0.3 + particleData.progress) % 1.0;
            particleData.mesh.material.color.setHSL(hue, 1.0, 0.6);
        });
        
        // Camera orbit
        const angle = this.time * 0.15;
        const radius = 45 + Math.sin(this.time * 0.3) * 10;
        this.camera.position.x = Math.cos(angle) * radius;
        this.camera.position.z = Math.sin(angle) * radius;
        this.camera.position.y = 40 + Math.sin(this.time * 0.2) * 15;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.nodes.forEach(nodeData => {
            nodeData.mesh.scale.setScalar(1.5 + intensity * 0.5);
        });
    }

    dispose() {
        this.nodes.forEach(nodeData => {
            this.scene.remove(nodeData.mesh);
            nodeData.mesh.geometry.dispose();
            nodeData.mesh.material.dispose();
        });
        
        this.connections.forEach(connData => {
            this.scene.remove(connData.mesh);
            connData.mesh.geometry.dispose();
            connData.mesh.material.dispose();
        });
        
        this.particles.forEach(particleData => {
            this.scene.remove(particleData.mesh);
            particleData.mesh.geometry.dispose();
            particleData.mesh.material.dispose();
        });
    }
};
