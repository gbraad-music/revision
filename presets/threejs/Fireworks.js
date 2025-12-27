// Fireworks - Festive fireworks display with audio-reactive explosions
window.FireworksPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Fireworks');

        // Set up camera
        this.camera.position.set(0, 15, 50);
        this.camera.lookAt(0, 20, 0);

        // Add night sky lighting
        this.addNightLighting();

        // Fireworks state
        this.fireworks = [];
        this.particles = [];
        this.rockets = [];
        
        // Launch timing
        this.timeSinceLastLaunch = 0;
        this.launchInterval = 1.5; // Launch every 1.5 seconds
        
        // Peak tracking for large fireworks
        this.peakCooldown = 0;
        this.peakThreshold = 0.7;
        
        // Beat tracking
        this.lastBeatTime = 0;
    }

    addNightLighting() {
        // Dark ambient for night sky
        const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.2);
        this.scene.add(ambientLight);

        // Moonlight
        const moonLight = new THREE.DirectionalLight(0x8899bb, 0.3);
        moonLight.position.set(10, 20, 10);
        this.scene.add(moonLight);

        // Ground plane to simulate horizon
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0a0a15,
            side: THREE.DoubleSide
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -5;
        this.scene.add(this.ground);

        // Add stars in background
        this.createStarField();
    }

    createStarField() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 500;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = Math.random() * 50 + 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            transparent: true,
            opacity: 0.8
        });
        
        this.stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(this.stars);
    }

    launchRocket(x, targetY, isLarge = false, explodeOnBeat = false) {
        const rocket = {
            position: new THREE.Vector3(x, -5, Math.random() * 10 - 5),
            velocity: new THREE.Vector3(0, 25, 0),
            targetY: targetY,
            color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
            isLarge: isLarge,
            trail: [],
            trailMeshes: [],
            age: 0,
            explodeOnBeat: explodeOnBeat,
            readyToExplode: false
        };

        // Create rocket visual with emissive glow
        const geometry = new THREE.SphereGeometry(isLarge ? 0.5 : 0.3, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: rocket.color,
            transparent: true,
            opacity: 1
        });
        rocket.mesh = new THREE.Mesh(geometry, material);
        rocket.mesh.position.copy(rocket.position);
        this.scene.add(rocket.mesh);

        // Add bright point light that follows rocket
        rocket.light = new THREE.PointLight(rocket.color, isLarge ? 3 : 2, 15);
        rocket.light.position.copy(rocket.position);
        this.scene.add(rocket.light);
        
        // Create streak trail geometry
        const streakGeometry = new THREE.BufferGeometry();
        const streakPositions = new Float32Array(60); // 20 points * 3 coords
        streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
        
        const streakMaterial = new THREE.LineBasicMaterial({
            color: rocket.color,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });
        
        rocket.streak = new THREE.Line(streakGeometry, streakMaterial);
        this.scene.add(rocket.streak);

        this.rockets.push(rocket);
    }

    explodeFirework(position, color, isLarge = false) {
        const particleCount = isLarge ? 80 : 40;
        const spreadSpeed = isLarge ? 20 : 12;
        
        // Create explosion flash light
        const flashLight = new THREE.PointLight(color, isLarge ? 10 : 5, isLarge ? 50 : 30);
        flashLight.position.copy(position);
        this.scene.add(flashLight);

        // Fade out the flash
        setTimeout(() => {
            const fadeInterval = setInterval(() => {
                flashLight.intensity *= 0.9;
                if (flashLight.intensity < 0.1) {
                    this.scene.remove(flashLight);
                    clearInterval(fadeInterval);
                }
            }, 16);
        }, 50);

        // Create particles
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            
            const particle = {
                position: position.clone(),
                velocity: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta) * spreadSpeed,
                    Math.sin(phi) * Math.sin(theta) * spreadSpeed,
                    Math.cos(phi) * spreadSpeed * 0.3
                ),
                color: color.clone(),
                life: 1.0,
                size: isLarge ? 0.4 : 0.2,
                gravity: -9.8,
                drag: 0.98
            };

            // Create particle visual with glow
            const geometry = new THREE.SphereGeometry(particle.size, 4, 4);
            const material = new THREE.MeshBasicMaterial({ 
                color: particle.color,
                transparent: true,
                opacity: 1
            });
            particle.mesh = new THREE.Mesh(geometry, material);
            particle.mesh.position.copy(particle.position);
            this.scene.add(particle.mesh);
            
            // Add small glow light to each particle
            particle.light = new THREE.PointLight(particle.color, 0.3, 5);
            particle.light.position.copy(particle.position);
            this.scene.add(particle.light);

            this.particles.push(particle);

            // Removed sparkles to improve performance
        }

        // Create ring shockwave effect for large fireworks
        if (isLarge) {
            const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({ 
                color: color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.copy(position);
            ring.lookAt(this.camera.position);
            this.scene.add(ring);

            const expandRing = () => {
                ring.scale.x += 0.5;
                ring.scale.y += 0.5;
                ringMaterial.opacity *= 0.95;
                
                if (ringMaterial.opacity > 0.01) {
                    requestAnimationFrame(expandRing);
                } else {
                    this.scene.remove(ring);
                    ringGeometry.dispose();
                    ringMaterial.dispose();
                }
            };
            expandRing();
        }
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Update peak cooldown
        if (this.peakCooldown > 0) {
            this.peakCooldown -= deltaTime;
        }

        // Regular launches based on timing - these explode on beats
        this.timeSinceLastLaunch += deltaTime;
        if (this.timeSinceLastLaunch >= this.launchInterval) {
            this.timeSinceLastLaunch = 0;
            const x = (Math.random() - 0.5) * 40;
            const targetY = 20 + Math.random() * 15;
            this.launchRocket(x, targetY, false, true); // Wait for beat to explode
        }

        // Removed automatic bass-triggered launches to reduce load

        // Update rockets
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            
            // Update age
            rocket.age += deltaTime;
            
            // Apply gravity to rocket
            rocket.velocity.y -= 5 * deltaTime;
            
            // Update position
            rocket.position.add(rocket.velocity.clone().multiplyScalar(deltaTime));
            
            rocket.mesh.position.copy(rocket.position);
            rocket.light.position.copy(rocket.position);
            
            // Update trail history
            rocket.trail.push(rocket.position.clone());
            if (rocket.trail.length > 20) {
                rocket.trail.shift();
            }
            
            // Update streak (only show when going up)
            if (rocket.velocity.y > 0 && rocket.streak) {
                const streakPositions = rocket.streak.geometry.attributes.position.array;
                for (let j = 0; j < rocket.trail.length; j++) {
                    const pos = rocket.trail[j];
                    streakPositions[j * 3] = pos.x;
                    streakPositions[j * 3 + 1] = pos.y;
                    streakPositions[j * 3 + 2] = pos.z;
                }
                rocket.streak.geometry.attributes.position.needsUpdate = true;
                rocket.streak.geometry.setDrawRange(0, rocket.trail.length);
                rocket.streak.material.opacity = 0.8;
            } else if (rocket.streak) {
                // Hide streak when falling or hovering
                rocket.streak.material.opacity = 0;
            }
            
            // Check if rocket reached target height
            const reachedTarget = rocket.position.y >= rocket.targetY;
            
            if (reachedTarget && !rocket.readyToExplode) {
                rocket.readyToExplode = true;
                // Stop vertical motion and hover
                rocket.velocity.y = 0;
            }
            
            // If rocket is waiting for beat, keep it hovering with glow
            if (rocket.readyToExplode && rocket.explodeOnBeat) {
                // Apply slight hover wobble
                rocket.position.y += Math.sin(this.time * 10 + i) * 0.1;
                rocket.mesh.position.copy(rocket.position);
                rocket.light.position.copy(rocket.position);
                // Pulsing glow while waiting
                rocket.light.intensity = 2 + Math.sin(this.time * 5) * 0.5;
                continue;
            }
            
            // If rocket reached target and NOT waiting for beat, explode immediately
            if (rocket.readyToExplode && !rocket.explodeOnBeat) {
                this.explodeFirework(rocket.position, rocket.color, rocket.isLarge);
                
                // Clean up rocket
                this.scene.remove(rocket.mesh);
                this.scene.remove(rocket.light);
                this.scene.remove(rocket.streak);
                rocket.mesh.geometry.dispose();
                rocket.mesh.material.dispose();
                rocket.streak.geometry.dispose();
                rocket.streak.material.dispose();
                
                this.rockets.splice(i, 1);
                continue;
            }
            
            // Safety: explode if too old (prevents rockets stuck forever)
            if (rocket.age > 5) {
                this.explodeFirework(rocket.position, rocket.color, rocket.isLarge);
                
                // Clean up rocket
                this.scene.remove(rocket.mesh);
                this.scene.remove(rocket.light);
                this.scene.remove(rocket.streak);
                rocket.mesh.geometry.dispose();
                rocket.mesh.material.dispose();
                rocket.streak.geometry.dispose();
                rocket.streak.material.dispose();
                
                this.rockets.splice(i, 1);
                continue;
            }

            // Removed trails to improve performance
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            
            // Apply gravity
            particle.velocity.y += particle.gravity * deltaTime;
            
            // Apply drag
            particle.velocity.multiplyScalar(particle.drag);
            
            // Update position
            particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            particle.mesh.position.copy(particle.position);
            
            // Update particle light position and fade
            if (particle.light) {
                particle.light.position.copy(particle.position);
                particle.light.intensity = 0.3 * Math.max(0, particle.life);
            }
            
            // Update life
            particle.life -= deltaTime * 0.8;
            
            // Fade out
            particle.mesh.material.opacity = Math.max(0, particle.life);
            
            // Remove dead particles
            if (particle.life <= 0 || particle.position.y < -5) {
                this.scene.remove(particle.mesh);
                if (particle.light) {
                    this.scene.remove(particle.light);
                }
                particle.mesh.geometry.dispose();
                particle.mesh.material.dispose();
                this.particles.splice(i, 1);
            }
        }

        // Smooth camera rotation around the scene
        const cameraAngle = this.time * 0.1;
        const cameraRadius = 50;
        this.camera.position.x = Math.sin(cameraAngle) * cameraRadius;
        this.camera.position.y = 15 + Math.sin(this.time * 0.15) * 3;
        this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
        this.camera.lookAt(0, 20, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.lastBeatTime = this.time;

        // EXPLODE all rockets that are ready and waiting for beat!
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            
            if (rocket.readyToExplode && rocket.explodeOnBeat) {
                // BOOM! Explode on this beat!
                this.explodeFirework(rocket.position, rocket.color, rocket.isLarge);
                
                // Clean up rocket
                this.scene.remove(rocket.mesh);
                this.scene.remove(rocket.light);
                this.scene.remove(rocket.streak);
                rocket.mesh.geometry.dispose();
                rocket.mesh.material.dispose();
                rocket.streak.geometry.dispose();
                rocket.streak.material.dispose();
                
                this.rockets.splice(i, 1);
            }
        }

        // Launch NEW firework on strong beats (these explode immediately, not on next beat)
        if (intensity > 0.5) {
            const isLarge = intensity > this.peakThreshold && this.peakCooldown <= 0;
            
            if (isLarge) {
                // Launch SEVERAL fireworks on peak for a burst effect!
                this.peakCooldown = 1.0;
                for (let i = 0; i < 3; i++) {
                    const x = (Math.random() - 0.5) * 50;
                    const targetY = 25 + Math.random() * 10;
                    this.launchRocket(x, targetY, true, false);
                }
            } else if (intensity > 0.6) {
                // Medium beats get 1 firework
                const x = (Math.random() - 0.5) * 40;
                const targetY = 20 + intensity * 15;
                this.launchRocket(x, targetY, false, false);
            }
        }
    }

    dispose() {
        // Clean up rockets
        this.rockets.forEach(rocket => {
            if (rocket.mesh) {
                this.scene.remove(rocket.mesh);
                rocket.mesh.geometry.dispose();
                rocket.mesh.material.dispose();
            }
            if (rocket.light) {
                this.scene.remove(rocket.light);
            }
            if (rocket.streak) {
                this.scene.remove(rocket.streak);
                rocket.streak.geometry.dispose();
                rocket.streak.material.dispose();
            }
        });

        // Clean up particles
        this.particles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
                particle.mesh.geometry.dispose();
                particle.mesh.material.dispose();
            }
            if (particle.light) {
                this.scene.remove(particle.light);
            }
        });

        // Clean up ground and stars
        if (this.ground) {
            this.scene.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
        }

        if (this.stars) {
            this.scene.remove(this.stars);
            this.stars.geometry.dispose();
            this.stars.material.dispose();
        }

        this.rockets = [];
        this.particles = [];
    }
};
