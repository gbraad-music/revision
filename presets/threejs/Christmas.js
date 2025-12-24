// ChristmasScene - Festive Christmas scene with snow and Santa
window.ChristmasPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Christmas Scene');

        // Set up camera
        this.camera.position.set(0, 5, 25);
        this.camera.lookAt(0, 5, 0);

        // Add Christmas lighting
        this.addChristmasLighting();

        // Create Santa Claus
        this.createSanta();

        // Create Christmas tree
        this.createChristmasTree();

        // Create snow particles with patterns
        this.createSnow();

        // Create ground with snow
        this.createGround();

        // Create walking dancing presents
        this.createPresents();

        // Animation state
        this.santaDirection = 1;
        this.santaBounce = 0;
        this.snowSwirl = 0;
        this.ornamentCycleTime = 0;
    }

    addChristmasLighting() {
        // Moonlight (cool blue ambient)
        const ambientLight = new THREE.AmbientLight(0x6688bb, 0.3);
        this.scene.add(ambientLight);

        // Warm directional light from above
        const moonLight = new THREE.DirectionalLight(0xaaccff, 0.5);
        moonLight.position.set(5, 10, 5);
        this.scene.add(moonLight);

        // Christmas lights - MORE and they move!
        this.christmasLights = [];
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0xff8800, 0x00ffff, 0xff0088];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const light = new THREE.PointLight(colors[i % colors.length], 2, 15);
            light.position.set(Math.cos(angle) * 8, 5, Math.sin(angle) * 8);
            this.scene.add(light);
            this.christmasLights.push({
                light: light,
                angle: angle,
                radius: 8,
                baseHeight: 5,
                speed: 0.3 + Math.random() * 0.4,
                offset: i * 0.5
            });
        }
    }

    createSanta() {
        this.santa = new THREE.Group();

        // Santa's body (red coat)
        const bodyGeometry = new THREE.CylinderGeometry(0.8, 1.2, 2, 8);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1;
        this.santa.add(body);

        // Santa's head
        const headGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.5;
        this.santa.add(head);

        // Santa's hat
        const hatConeGeometry = new THREE.ConeGeometry(0.7, 1.2, 8);
        const hatMaterial = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
        const hatCone = new THREE.Mesh(hatConeGeometry, hatMaterial);
        hatCone.position.y = 3.5;
        this.santa.add(hatCone);

        // Hat pom-pom
        const pomGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const pomMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const pom = new THREE.Mesh(pomGeometry, pomMaterial);
        pom.position.y = 4.1;
        this.santa.add(pom);

        // Belt
        const beltGeometry = new THREE.CylinderGeometry(0.82, 0.98, 0.3, 8);
        const beltMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const belt = new THREE.Mesh(beltGeometry, beltMaterial);
        belt.position.y = 1;
        this.santa.add(belt);

        // Belt buckle
        const buckleGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.1);
        const buckleMaterial = new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0x886600 });
        const buckle = new THREE.Mesh(buckleGeometry, buckleMaterial);
        buckle.position.set(0, 1, 0.9);
        this.santa.add(buckle);

        // Arms
        const armGeometry = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8);
        const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
        leftArm.position.set(-1, 1.5, 0);
        leftArm.rotation.z = Math.PI / 6;
        this.santa.add(leftArm);

        const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
        rightArm.position.set(1, 1.5, 0);
        rightArm.rotation.z = -Math.PI / 6;
        this.santa.add(rightArm);

        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.25, 0.25, 1, 8);
        const legMaterial = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.4, 0, 0);
        this.santa.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.4, 0, 0);
        this.santa.add(rightLeg);

        // Position Santa
        this.santa.position.set(-8, 0.5, 0);
        this.scene.add(this.santa);
    }

    createChristmasTree() {
        this.trees = [];
        this.allOrnaments = [];
        this.treeStars = [];

        // Create multiple trees in the scene
        const treePositions = [
            { x: 0, z: 0, scale: 1.2 },      // Center main tree
            { x: -12, z: -8, scale: 0.8 },   // Left back
            { x: 12, z: -10, scale: 0.9 },   // Right back
            { x: -15, z: 5, scale: 0.7 },    // Left front
            { x: 15, z: 3, scale: 0.75 }     // Right front
        ];

        treePositions.forEach((pos, treeIndex) => {
            const tree = new THREE.Group();
            const scale = pos.scale;

            // Tree trunk
            const trunkGeometry = new THREE.CylinderGeometry(0.4 * scale, 0.5 * scale, 2 * scale, 8);
            const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x4d2600 });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = 1 * scale;
            tree.add(trunk);

            // Tree layers (pine tree shape)
            const greenMaterial = new THREE.MeshPhongMaterial({ color: 0x0d5c0d });
            const layers = [
                { radius: 3, height: 3, y: 3 },
                { radius: 2.3, height: 2.5, y: 5 },
                { radius: 1.6, height: 2, y: 6.5 },
                { radius: 1, height: 1.5, y: 7.8 }
            ];

            layers.forEach(layer => {
                const geometry = new THREE.ConeGeometry(layer.radius * scale, layer.height * scale, 8);
                const mesh = new THREE.Mesh(geometry, greenMaterial);
                mesh.position.y = layer.y * scale;
                tree.add(mesh);
            });

            // Star on top
            const starGeometry = new THREE.SphereGeometry(0.3 * scale, 8, 8);
            const starMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xffff00, 
                emissive: 0xffaa00,
                emissiveIntensity: 1
            });
            const treeStar = new THREE.Mesh(starGeometry, starMaterial);
            treeStar.position.y = 9.5 * scale;
            tree.add(treeStar);
            this.treeStars.push(treeStar);

            // Ornaments - more on main tree, fewer on smaller trees - COLOR CYCLING!
            const ornamentCount = treeIndex === 0 ? 30 : 15;
            for (let i = 0; i < ornamentCount; i++) {
                const ornamentGeometry = new THREE.SphereGeometry(0.2 * scale, 8, 8);
                const ornamentMaterial = new THREE.MeshPhongMaterial({ 
                    color: 0xffffff,
                    emissive: 0xffffff,
                    emissiveIntensity: 0.5,
                    shininess: 100
                });
                const ornament = new THREE.Mesh(ornamentGeometry, ornamentMaterial);
                
                const layer = Math.floor(i / 5);
                const angle = (i % 5) * (Math.PI * 2 / 5) + layer * 0.5;
                const radius = (3 - layer * 0.8) * 0.8 * scale;
                const height = (3 + layer * 1.8) * scale;
                
                ornament.position.set(
                    Math.cos(angle) * radius,
                    height,
                    Math.sin(angle) * radius
                );
                ornament.userData.hueOffset = i * 0.1;
                ornament.userData.pulseOffset = i * 0.5;
                tree.add(ornament);
                this.allOrnaments.push(ornament);
            }

            tree.position.set(pos.x, 0, pos.z);
            this.scene.add(tree);
            this.trees.push(tree);
        });
    }

    createSnow() {
        const snowCount = 5000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(snowCount * 3);
        const velocities = new Float32Array(snowCount);
        const colors = new Float32Array(snowCount * 3);
        const sizes = new Float32Array(snowCount);

        for (let i = 0; i < snowCount; i++) {
            const i3 = i * 3;
            
            // Create swirling snow patterns
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 40;
            positions[i3] = Math.cos(angle) * radius;
            positions[i3 + 1] = Math.random() * 40;
            positions[i3 + 2] = Math.sin(angle) * radius;
            
            velocities[i] = 0.5 + Math.random() * 1.5;
            sizes[i] = 0.1 + Math.random() * 0.3;
            
            // Slight blue tint to some snowflakes
            const tint = 0.9 + Math.random() * 0.1;
            colors[i3] = tint;
            colors[i3 + 1] = tint;
            colors[i3 + 2] = 1.0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        this.snow = new THREE.Points(geometry, material);
        this.snowVelocities = velocities;
        this.snowAngles = new Float32Array(snowCount);
        this.snowRadii = new Float32Array(snowCount);
        
        for (let i = 0; i < snowCount; i++) {
            this.snowAngles[i] = Math.random() * Math.PI * 2;
            this.snowRadii[i] = Math.random() * 40;
        }
        
        this.scene.add(this.snow);
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(100, 100, 100, 100);
        const groundMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xffffff,
            shininess: 60,
            wireframe: false
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = 0;
        this.scene.add(this.ground);
    }

    createPresents() {
        this.presents = [];
        
        // WALKING, DANCING PRESENTS like the cubes!
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
        const ribbonColors = [0xffd700, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff];
        
        // Central tree walking presents
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const radius = 3 + Math.random() * 2;
            const size = 0.5 + Math.random() * 0.5;
            this.createPresent(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius,
                size,
                colors[i % colors.length],
                ribbonColors[i % ribbonColors.length],
                true // walking
            );
        }

        // Scattered walking presents
        for (let i = 0; i < 15; i++) {
            const size = 0.4 + Math.random() * 0.6;
            this.createPresent(
                (Math.random() - 0.5) * 35,
                0,
                (Math.random() - 0.5) * 35,
                size,
                colors[Math.floor(Math.random() * colors.length)],
                ribbonColors[Math.floor(Math.random() * ribbonColors.length)],
                true // walking
            );
        }
        
        // Static presents under trees
        this.trees.forEach((tree, treeIdx) => {
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                const radius = 1.5 + Math.random() * 0.5;
                const size = 0.3 + Math.random() * 0.3;
                const treePos = tree.position;
                this.createPresent(
                    treePos.x + Math.cos(angle) * radius,
                    0,
                    treePos.z + Math.sin(angle) * radius,
                    size,
                    colors[(i + treeIdx * 2) % colors.length],
                    ribbonColors[(i + treeIdx) % ribbonColors.length],
                    false // static
                );
            }
        });
    }

    createPresent(x, y, z, size, color, ribbonColor, walking) {
        const group = new THREE.Group();
        
        // Box with metallic sheen
        const boxGeometry = new THREE.BoxGeometry(size, size, size);
        const boxMaterial = new THREE.MeshPhongMaterial({ 
            color: color,
            shininess: 80,
            specular: 0x444444
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        group.add(box);

        // Ribbon horizontal
        const ribbonH = new THREE.Mesh(
            new THREE.BoxGeometry(size * 1.05, size * 0.12, size * 0.12),
            new THREE.MeshPhongMaterial({ 
                color: ribbonColor,
                emissive: ribbonColor,
                emissiveIntensity: 0.2
            })
        );
        group.add(ribbonH);

        // Ribbon vertical
        const ribbonV = new THREE.Mesh(
            new THREE.BoxGeometry(size * 0.12, size * 0.12, size * 1.05),
            new THREE.MeshPhongMaterial({ 
                color: ribbonColor,
                emissive: ribbonColor,
                emissiveIntensity: 0.2
            })
        );
        group.add(ribbonV);

        // Bow on top with glow
        const bow = new THREE.Mesh(
            new THREE.SphereGeometry(size * 0.18, 8, 8),
            new THREE.MeshPhongMaterial({ 
                color: ribbonColor,
                emissive: ribbonColor,
                emissiveIntensity: 0.3
            })
        );
        bow.position.y = size * 0.5;
        group.add(bow);

        group.position.set(x, size * 0.5, z);
        
        this.scene.add(group);
        
        const presentData = {
            mesh: group,
            box: box,
            ribbonH: ribbonH,
            ribbonV: ribbonV,
            bow: bow,
            size: size,
            x: x,
            z: z,
            targetX: x,
            targetZ: z,
            rotation: 0,
            targetRotation: 0,
            axis: 'x',
            walking: walking,
            walkProgress: 0,
            speed: 0.4 + Math.random() * 0.6,
            restTime: Math.random() * 2,
            restDuration: 1 + Math.random() * 2,
            spinSpeed: (Math.random() - 0.5) * 2,
            bouncePhase: Math.random() * Math.PI * 2
        };
        
        this.presents.push(presentData);
    }

    update(deltaTime) {
        super.update(deltaTime);

        this.ornamentCycleTime += deltaTime;

        // Update snow - SWIRLING VORTEX pattern with audio reactivity
        const positions = this.snow.geometry.attributes.position.array;
        const windEffect = this.frequencyData.mid * 3;
        const bassEffect = this.frequencyData.bass * 2;
        
        this.snowSwirl += deltaTime * (0.5 + this.frequencyData.high);
        
        for (let i = 0; i < positions.length / 3; i++) {
            const i3 = i * 3;
            
            // Swirling vortex motion
            this.snowAngles[i] += deltaTime * (0.5 + windEffect * 0.1);
            const swirlRadius = this.snowRadii[i] + Math.sin(this.snowSwirl + i * 0.01) * 5 * bassEffect;
            
            positions[i3] = Math.cos(this.snowAngles[i]) * swirlRadius;
            positions[i3 + 2] = Math.sin(this.snowAngles[i]) * swirlRadius;
            
            // Snowflakes fall down, faster with bass
            const fallSpeed = this.snowVelocities[i] * (1 + bassEffect * 0.5);
            positions[i3 + 1] -= fallSpeed * deltaTime;
            
            // Vertical wave motion
            positions[i3 + 1] += Math.sin(this.time * 2 + i * 0.02) * windEffect * deltaTime;
            
            // Reset to top when reaching ground
            if (positions[i3 + 1] < 0) {
                positions[i3 + 1] = 40;
                this.snowAngles[i] = Math.random() * Math.PI * 2;
                this.snowRadii[i] = Math.random() * 40;
            }
        }
        this.snow.geometry.attributes.position.needsUpdate = true;
        
        // Snow particle size reacts to high frequencies
        const sizes = this.snow.geometry.attributes.size.array;
        for (let i = 0; i < sizes.length; i++) {
            sizes[i] = (0.1 + (i % 100) / 300) * (1 + this.frequencyData.high * 2);
        }
        this.snow.geometry.attributes.size.needsUpdate = true;

        // Animate Santa - walking back and forth, speed affected by audio
        const santaSpeed = 2 + this.frequencyData.mid * 3;
        this.santa.position.x += this.santaDirection * deltaTime * santaSpeed;
        if (this.santa.position.x > 12) this.santaDirection = -1;
        if (this.santa.position.x < -12) this.santaDirection = 1;
        
        // Santa faces direction of movement
        this.santa.rotation.y = this.santaDirection > 0 ? -Math.PI / 2 : Math.PI / 2;
        
        // Santa bobbing while walking, more energetic with audio
        this.santaBounce += deltaTime * (5 + this.frequencyData.high * 8);
        this.santa.position.y = 0.5 + Math.abs(Math.sin(this.santaBounce)) * (0.3 + this.frequencyData.mid * 0.5);
        
        // Santa body bounces and squashes to bass
        this.santa.scale.y = 1 + this.frequencyData.bass * 0.4;
        this.santa.scale.x = 1 - this.frequencyData.bass * 0.2;
        this.santa.scale.z = 1 - this.frequencyData.bass * 0.2;
        
        // Santa dances - rotates arms/body with music
        this.santa.rotation.z = Math.sin(this.time * 4) * 0.1 * this.frequencyData.mid;

        // Rotate trees at different speeds, affected by audio
        this.trees.forEach((tree, i) => {
            const treeSpeed = (0.3 + this.frequencyData.mid * 0.5) * (i % 2 === 0 ? 1 : -1);
            tree.rotation.y += deltaTime * treeSpeed;
            
            // Trees sway with music
            tree.rotation.z = Math.sin(this.time * 2 + i) * 0.05 * this.frequencyData.bass;
        });

        // Pulse and COLOR CYCLE stars on trees with audio
        this.treeStars.forEach((star, i) => {
            const pulse = Math.sin(this.time * 4 + i) * 0.3;
            star.scale.setScalar(1 + pulse + this.frequencyData.high * 0.8);
            
            // Star color cycling
            const hue = (this.time * 0.2 + i * 0.2) % 1.0;
            star.material.color.setHSL(hue, 1.0, 0.5);
            star.material.emissive.setHSL(hue, 1.0, 0.5);
        });

        // Christmas lights ORBIT and pulse
        this.christmasLights.forEach((lightData, i) => {
            lightData.angle += deltaTime * lightData.speed * (1 + this.frequencyData.mid);
            const radius = lightData.radius + Math.sin(this.time * 2 + lightData.offset) * 3;
            const height = lightData.baseHeight + Math.sin(this.time * 3 + lightData.offset) * 4;
            
            lightData.light.position.set(
                Math.cos(lightData.angle) * radius,
                height + this.frequencyData.bass * 5,
                Math.sin(lightData.angle) * radius
            );
            
            lightData.light.intensity = 1 + Math.sin(this.time * 3 + i) * 0.5 + this.frequencyData.bass * 4;
            
            // Color cycle
            const hue = (this.time * 0.15 + i * 0.125) % 1.0;
            lightData.light.color.setHSL(hue, 1.0, 0.5);
        });

        // Audio-reactive ornaments with COLOR CYCLING
        this.allOrnaments.forEach((ornament, i) => {
            const scale = 1 + this.frequencyData.mid * 0.6 + Math.sin(this.time * 3 + ornament.userData.pulseOffset) * 0.15;
            ornament.scale.setScalar(scale);
            
            // Rainbow color cycling through ornaments
            const hue = (this.ornamentCycleTime * 0.3 + ornament.userData.hueOffset + this.frequencyData.high * 0.2) % 1.0;
            ornament.material.color.setHSL(hue, 0.9, 0.6);
            ornament.material.emissive.setHSL(hue, 1.0, 0.4 + this.frequencyData.bass * 0.3);
        });

        // WALKING DANCING PRESENTS - like the cubes!
        this.presents.forEach((presentData, index) => {
            if (!presentData.walking) {
                // Static presents just bounce
                presentData.bouncePhase += deltaTime * 2;
                const bounce = Math.sin(presentData.bouncePhase) * 0.1 + this.frequencyData.bass * 0.5;
                presentData.mesh.position.y = presentData.size * 0.5 + bounce;
                presentData.mesh.rotation.y += deltaTime * presentData.spinSpeed * (1 + this.frequencyData.mid);
                
            } else {
                // Walking presents!
                if (presentData.walkProgress === 0 && !presentData.isWalking) {
                    // Resting - decide when to walk next
                    presentData.restTime += deltaTime;
                    
                    if (presentData.restTime >= presentData.restDuration) {
                        // Start walking
                        presentData.isWalking = true;
                        presentData.restTime = 0;
                        presentData.restDuration = 1 + Math.random() * 2;
                        
                        // Pick random direction
                        const directions = [
                            { x: 1, z: 0, axis: 'z' },
                            { x: -1, z: 0, axis: 'z' },
                            { x: 0, z: 1, axis: 'x' },
                            { x: 0, z: -1, axis: 'x' }
                        ];
                        
                        const dir = directions[Math.floor(Math.random() * directions.length)];
                        const distance = presentData.size * 2;
                        
                        presentData.targetX = presentData.x + dir.x * distance;
                        presentData.targetZ = presentData.z + dir.z * distance;
                        presentData.axis = dir.axis;
                        presentData.targetRotation = presentData.rotation + Math.PI / 2;
                        
                        // Keep within bounds
                        presentData.targetX = Math.max(-30, Math.min(30, presentData.targetX));
                        presentData.targetZ = Math.max(-30, Math.min(30, presentData.targetZ));
                    }
                    
                    // Idle floating and spinning
                    presentData.bouncePhase += deltaTime * 2;
                    presentData.mesh.position.y = presentData.size * 0.5 + Math.sin(presentData.bouncePhase) * 0.2;
                    presentData.mesh.rotation.y += deltaTime * presentData.spinSpeed;
                    
                } else if (presentData.isWalking) {
                    // Walking - tumbling motion like the cubes!
                    const speedMult = 1 + this.frequencyData.mid * 2;
                    presentData.walkProgress += deltaTime * presentData.speed * speedMult;
                    
                    if (presentData.walkProgress >= 1) {
                        // Finished walking
                        presentData.isWalking = false;
                        presentData.x = presentData.targetX;
                        presentData.z = presentData.targetZ;
                        presentData.rotation = presentData.targetRotation;
                        presentData.walkProgress = 0;
                    } else {
                        // Interpolate position with easing
                        const t = presentData.walkProgress;
                        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                        
                        const currentX = presentData.x + (presentData.targetX - presentData.x) * eased;
                        const currentZ = presentData.z + (presentData.targetZ - presentData.z) * eased;
                        const currentRotation = presentData.rotation + (presentData.targetRotation - presentData.rotation) * eased;
                        
                        // Arc motion - present lifts as it tumbles
                        const arc = Math.sin(t * Math.PI) * presentData.size * 1.5;
                        
                        presentData.mesh.position.x = currentX;
                        presentData.mesh.position.z = currentZ;
                        presentData.mesh.position.y = presentData.size * 0.5 + arc;
                        
                        // Apply tumbling rotation
                        if (presentData.axis === 'x') {
                            presentData.mesh.rotation.x = currentRotation;
                            presentData.mesh.rotation.z = 0;
                        } else {
                            presentData.mesh.rotation.z = currentRotation;
                            presentData.mesh.rotation.x = 0;
                        }
                    }
                }
            }
            
            // Color cycling on presents
            const hue = (this.time * 0.2 + index * 0.08 + presentData.walkProgress * 0.3) % 1.0;
            presentData.box.material.emissive.setHSL(hue, 0.5, 0.1 + this.frequencyData.bass * 0.2);
            
            // Bow glows with audio
            presentData.bow.material.emissiveIntensity = 0.3 + this.frequencyData.high * 0.5;
            
            // Scale pulse with bass
            const scale = 1 + this.frequencyData.bass * 0.2;
            presentData.box.scale.setScalar(scale);
        });

        // Ground waves with audio
        const groundPositions = this.ground.geometry.attributes.position.array;
        for (let i = 0; i < groundPositions.length / 3; i++) {
            const x = i % 101;
            const z = Math.floor(i / 101);
            const wave = Math.sin(this.time + x * 0.2) * Math.cos(this.time + z * 0.2) * this.frequencyData.bass * 0.5;
            groundPositions[i * 3 + 2] = wave;
        }
        this.ground.geometry.attributes.position.needsUpdate = true;

        // Camera dynamic orbit with audio
        const cameraAngle = this.time * 0.15;
        const cameraRadius = 30 + Math.sin(this.time * 0.3) * 5 + this.frequencyData.bass * 5;
        this.camera.position.x = Math.sin(cameraAngle) * cameraRadius;
        this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
        this.camera.position.y = 8 + Math.sin(this.time * 0.2) * 4 + this.frequencyData.mid * 3;
        this.camera.lookAt(0, 4, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Santa JUMPS HIGH on beat!
        if (intensity > 0.4) {
            this.santa.position.y = 0.5 + intensity * 4;
            // Spinning jump!
            this.santa.rotation.y += intensity * Math.PI;
        }

        // All stars EXPLODE on beat
        this.treeStars.forEach(star => {
            star.scale.setScalar(1 + intensity * 2);
        });

        // Presents JUMP on beat
        this.presents.forEach(presentData => {
            if (!presentData.isWalking) {
                presentData.mesh.position.y += intensity * 2;
            }
        });

        // Christmas lights BLAST brighter on beat
        this.christmasLights.forEach(lightData => {
            lightData.light.intensity = 3 + intensity * 8;
        });
        
        // Snow BURSTS on beat
        const positions = this.snow.geometry.attributes.position.array;
        for (let i = 0; i < Math.min(100, positions.length / 3); i++) {
            const i3 = i * 3;
            const burst = (Math.random() - 0.5) * intensity * 10;
            positions[i3] += burst;
            positions[i3 + 2] += burst;
        }
        this.snow.geometry.attributes.position.needsUpdate = true;
        
        // Random presents start dancing on strong beats
        if (intensity > 0.7) {
            this.presents.forEach(presentData => {
                if (Math.random() < 0.3 && !presentData.isWalking && presentData.walking) {
                    presentData.restTime = presentData.restDuration;
                }
            });
        }
    }

    dispose() {
        // Clean up all objects
        this.scene.remove(this.santa);
        this.trees.forEach(tree => this.scene.remove(tree));
        this.scene.remove(this.snow);
        this.scene.remove(this.ground);
        this.presents.forEach(presentData => this.scene.remove(presentData.mesh));
        this.christmasLights.forEach(lightData => this.scene.remove(lightData.light));

        // Dispose geometries and materials
        this.snow.geometry.dispose();
        this.snow.material.dispose();
        this.ground.geometry.dispose();
        this.ground.material.dispose();
    }
};
