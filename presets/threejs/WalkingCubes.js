// WalkingCubes - Cubes that tumble and walk across a surface
window.WalkingCubesPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Walking Cubes');

        this.addBasicLighting();
        
        // Create ground plane
        const groundGeometry = new THREE.PlaneGeometry(60, 60, 20, 20);
        const groundMaterial = new THREE.MeshPhongMaterial({
            color: 0x111111,
            emissive: 0x001133,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -5;
        this.scene.add(this.ground);
        
        // Create walking cubes
        this.cubes = [];
        const cubeCount = 12;
        
        for (let i = 0; i < cubeCount; i++) {
            const size = 2 + Math.random() * 2;
            const geometry = new THREE.BoxGeometry(size, size, size);
            const edges = new THREE.EdgesGeometry(geometry);
            const material = new THREE.LineBasicMaterial({ 
                color: 0x00ffff,
                linewidth: 2
            });
            
            const wireframe = new THREE.LineSegments(edges, material);
            
            // Also add a semi-transparent filled cube
            const fillMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.2,
                emissive: 0x003333
            });
            const fillCube = new THREE.Mesh(geometry, fillMaterial);
            
            const group = new THREE.Group();
            group.add(wireframe);
            group.add(fillCube);
            
            this.scene.add(group);
            
            const startX = (Math.random() - 0.5) * 40;
            const startZ = (Math.random() - 0.5) * 40;
            
            this.cubes.push({
                mesh: group,
                wireframe: wireframe,
                fillCube: fillCube,
                size: size,
                x: startX,
                z: startZ,
                targetX: startX,
                targetZ: startZ,
                rotation: 0,
                targetRotation: 0,
                axis: 'x', // axis to tumble on: 'x' or 'z'
                walking: false,
                walkProgress: 0,
                speed: 0.3 + Math.random() * 0.4,
                restTime: 0,
                restDuration: 1 + Math.random() * 2
            });
        }
        
        this.camera.position.set(30, 25, 30);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Animate ground
        const groundPositions = this.ground.geometry.attributes.position.array;
        for (let i = 0; i < groundPositions.length / 3; i++) {
            const x = groundPositions[i * 3];
            const z = groundPositions[i * 3 + 1];
            groundPositions[i * 3 + 2] = Math.sin(this.time + x * 0.1) * 0.5 + 
                                          Math.cos(this.time + z * 0.1) * 0.5 +
                                          this.frequencyData.bass * 2;
        }
        this.ground.geometry.attributes.position.needsUpdate = true;
        
        const groundHue = (this.time * 0.05) % 1.0;
        this.ground.material.emissive.setHSL(groundHue, 1.0, 0.1);
        
        // Update cubes
        this.cubes.forEach((cubeData, index) => {
            if (!cubeData.walking) {
                // Resting - decide when to walk next
                cubeData.restTime += deltaTime;
                
                if (cubeData.restTime >= cubeData.restDuration) {
                    // Start walking
                    cubeData.walking = true;
                    cubeData.walkProgress = 0;
                    cubeData.restTime = 0;
                    cubeData.restDuration = 1 + Math.random() * 2;
                    
                    // Pick random direction
                    const directions = [
                        { x: 1, z: 0, axis: 'z' },
                        { x: -1, z: 0, axis: 'z' },
                        { x: 0, z: 1, axis: 'x' },
                        { x: 0, z: -1, axis: 'x' }
                    ];
                    
                    const dir = directions[Math.floor(Math.random() * directions.length)];
                    const distance = cubeData.size;
                    
                    cubeData.targetX = cubeData.x + dir.x * distance;
                    cubeData.targetZ = cubeData.z + dir.z * distance;
                    cubeData.axis = dir.axis;
                    cubeData.targetRotation = cubeData.rotation + Math.PI / 2;
                    
                    // Keep within bounds
                    cubeData.targetX = Math.max(-25, Math.min(25, cubeData.targetX));
                    cubeData.targetZ = Math.max(-25, Math.min(25, cubeData.targetZ));
                }
                
                // Idle floating
                cubeData.mesh.position.y = -5 + cubeData.size / 2 + Math.sin(this.time * 2 + index) * 0.3;
                cubeData.mesh.rotation.y += deltaTime * 0.5;
                
            } else {
                // Walking - tumbling motion
                const speedMult = 1 + this.frequencyData.mid * 2;
                cubeData.walkProgress += deltaTime * cubeData.speed * speedMult;
                
                if (cubeData.walkProgress >= 1) {
                    // Finished walking
                    cubeData.walking = false;
                    cubeData.x = cubeData.targetX;
                    cubeData.z = cubeData.targetZ;
                    cubeData.rotation = cubeData.targetRotation;
                    cubeData.walkProgress = 0;
                } else {
                    // Interpolate position
                    const t = cubeData.walkProgress;
                    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out
                    
                    const currentX = cubeData.x + (cubeData.targetX - cubeData.x) * eased;
                    const currentZ = cubeData.z + (cubeData.targetZ - cubeData.z) * eased;
                    const currentRotation = cubeData.rotation + (cubeData.targetRotation - cubeData.rotation) * eased;
                    
                    // Arc motion (cube lifts as it tumbles)
                    const arc = Math.sin(t * Math.PI) * cubeData.size;
                    
                    cubeData.mesh.position.x = currentX;
                    cubeData.mesh.position.z = currentZ;
                    cubeData.mesh.position.y = -5 + cubeData.size / 2 + arc;
                    
                    // Apply tumbling rotation
                    if (cubeData.axis === 'x') {
                        cubeData.mesh.rotation.x = currentRotation;
                    } else {
                        cubeData.mesh.rotation.z = currentRotation;
                    }
                }
            }
            
            // Color based on movement
            const hue = (this.time * 0.1 + index * 0.1 + cubeData.walkProgress * 0.3) % 1.0;
            cubeData.wireframe.material.color.setHSL(hue, 1.0, 0.5);
            cubeData.fillCube.material.color.setHSL(hue, 1.0, 0.5);
            cubeData.fillCube.material.emissive.setHSL(hue, 1.0, 0.2);
            
            // Scale pulse on beat
            const scale = 1 + this.frequencyData.bass * 0.3;
            cubeData.fillCube.scale.setScalar(scale);
        });
        
        // Camera orbit
        const angle = this.time * 0.1;
        const radius = 35;
        this.camera.position.x = Math.cos(angle) * radius;
        this.camera.position.z = Math.sin(angle) * radius;
        this.camera.position.y = 25 + Math.sin(this.time * 0.3) * 5;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Random cube jumps on beat
        this.cubes.forEach(cubeData => {
            if (!cubeData.walking && Math.random() < 0.3) {
                cubeData.mesh.position.y += intensity * 2;
            }
        });
    }

    dispose() {
        this.cubes.forEach(cubeData => {
            this.scene.remove(cubeData.mesh);
            cubeData.wireframe.geometry.dispose();
            cubeData.wireframe.material.dispose();
            cubeData.fillCube.geometry.dispose();
            cubeData.fillCube.material.dispose();
        });
        
        this.scene.remove(this.ground);
        this.ground.geometry.dispose();
        this.ground.material.dispose();
    }
};
