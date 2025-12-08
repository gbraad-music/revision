// Tunnel - Audio-reactive tunnel visualization (CLASSIC AMIGA STYLE)
class TunnelPreset extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Tunnel');

        // Create tunnel rings
        this.rings = [];
        const ringCount = 60;
        const tunnelLength = 100;

        for (let i = 0; i < ringCount; i++) {
            const geometry = new THREE.TorusGeometry(2, 0.15, 16, 32);
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(i / ringCount, 1.0, 0.5),
                emissive: new THREE.Color().setHSL(i / ringCount, 1.0, 0.4),
                shininess: 100,
                wireframe: false
            });

            const ring = new THREE.Mesh(geometry, material);
            // Start rings far away in the distance
            ring.position.z = -(i * (tunnelLength / ringCount));
            this.scene.add(ring);
            this.rings.push({
                mesh: ring,
                baseScale: 1.0,
                offset: i,
                initialZ: ring.position.z
            });
        }

        // Add lighting
        this.addBasicLighting();

        // Add point light at the end of tunnel
        this.pointLight = new THREE.PointLight(0xffffff, 3, 150);
        this.pointLight.position.set(0, 0, -50);
        this.scene.add(this.pointLight);

        // Camera position - looking straight down the tunnel
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, -100);

        this.baseSpeed = 5;
        this.tunnelSpeed = 5;
        this.tunnelLength = tunnelLength;
        this.sway = { x: 0, y: 0 };
        this.targetSway = { x: 0, y: 0 };
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Speed decays back to base speed (safety for epilepsy)
        this.tunnelSpeed += (this.baseSpeed - this.tunnelSpeed) * 0.05;

        // Speed based on audio - smooth cruising
        const speed = this.tunnelSpeed + this.frequencyData.bass * 3;

        // Smooth sway decay
        this.sway.x += (this.targetSway.x - this.sway.x) * 0.1;
        this.sway.y += (this.targetSway.y - this.sway.y) * 0.1;
        this.targetSway.x *= 0.95;
        this.targetSway.y *= 0.95;

        // Subtle automatic sway
        const autoSwayX = Math.sin(this.time * 0.5) * 0.3;
        const autoSwayY = Math.cos(this.time * 0.7) * 0.2;

        // Update rings - classic tunnel effect with sway
        this.rings.forEach((ringData, i) => {
            const ring = ringData.mesh;

            // Move ring toward camera (rushing forward through tunnel)
            ring.position.z += deltaTime * speed;

            // Respawn ring at far end when it passes camera
            if (ring.position.z > 5) {
                ring.position.z -= this.tunnelLength;
            }

            // Sway the tunnel rings based on audio and beat
            const depth = Math.abs(ring.position.z) / this.tunnelLength;
            ring.position.x = (this.sway.x + autoSwayX) * depth * 3;
            ring.position.y = (this.sway.y + autoSwayY) * depth * 3;

            // Audio-reactive pulsing
            const pulse = 1.0 + this.frequencyData.mid * 0.4 + Math.sin(this.time * 3 + ringData.offset * 0.3) * 0.1;
            ring.scale.setScalar(pulse);

            // Rainbow color shift down the tunnel
            const hue = (ringData.offset / this.rings.length + this.time * 0.15 + this.frequencyData.high * 0.3) % 1.0;
            const saturation = 1.0;
            const lightness = 0.5 + this.frequencyData.bass * 0.3;
            ring.material.color.setHSL(hue, saturation, lightness);
            ring.material.emissive.setHSL(hue, saturation, lightness * 0.6);

            // Rotate rings for classic spiral effect
            ring.rotation.z += deltaTime * (1.0 + this.frequencyData.mid * 2);
        });

        // Pulsing light at the end of tunnel
        this.pointLight.position.x = Math.sin(this.time * 1.5) * 5;
        this.pointLight.position.y = Math.cos(this.time * 1.5) * 5;
        this.pointLight.intensity = 3 + this.frequencyData.bass * 5;

        // Change light color with music
        const lightHue = (this.time * 0.1 + this.frequencyData.bass) % 1.0;
        this.pointLight.color.setHSL(lightHue, 1.0, 0.7);
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Speed boost on beat (decays back to base in update)
        this.tunnelSpeed = this.baseSpeed + intensity * 6;

        // SWAY the tunnel on beat!
        this.targetSway.x = (Math.random() - 0.5) * intensity * 2;
        this.targetSway.y = (Math.random() - 0.5) * intensity * 2;

        // Flash the tunnel light
        this.pointLight.color.setHSL(Math.random(), 1.0, 0.8);
        this.pointLight.intensity = 5 + intensity * 8;
    }

    dispose() {
        this.rings.forEach(ringData => {
            this.scene.remove(ringData.mesh);
            ringData.mesh.geometry.dispose();
            ringData.mesh.material.dispose();
        });
        this.scene.remove(this.pointLight);
    }
}

window.TunnelPreset = TunnelPreset;
