// Galaxy - Spiral galaxy with audio-reactive arms
window.GalaxyPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Galaxy');

        // Create galaxy spiral arms
        this.stars = [];
        const starCount = 8000;
        const arms = 5;
        const armSpread = 0.4;

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;

            // Which spiral arm
            const armIndex = i % arms;
            const armAngle = (armIndex / arms) * Math.PI * 2;

            // Distance from center
            const distance = Math.pow(Math.random(), 0.7) * 30;
            
            // Spiral calculation
            const spinAngle = distance * 0.5;
            const angle = armAngle + spinAngle;

            // Spread within arm
            const spreadX = (Math.random() - 0.5) * armSpread * distance;
            const spreadY = (Math.random() - 0.5) * armSpread * distance * 0.3;
            const spreadZ = (Math.random() - 0.5) * armSpread * distance;

            positions[i3] = Math.cos(angle) * distance + spreadX;
            positions[i3 + 1] = spreadY;
            positions[i3 + 2] = Math.sin(angle) * distance + spreadZ;

            // Color based on distance and arm
            const hue = (armIndex / arms + distance / 60) % 1.0;
            const saturation = 0.8 + Math.random() * 0.2;
            const lightness = 0.4 + Math.random() * 0.4;
            const color = new THREE.Color().setHSL(hue, saturation, lightness);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;

            // Varied sizes
            sizes[i] = Math.random() * 0.3 + 0.1;

            this.stars.push({
                distance: distance,
                angle: angle,
                armIndex: armIndex,
                originalY: spreadY
            });
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            depthWrite: false
        });

        this.galaxy = new THREE.Points(geometry, material);
        this.scene.add(this.galaxy);

        // Central black hole
        const coreGeometry = new THREE.SphereGeometry(0.5, 32, 32);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.9
        });
        this.core = new THREE.Mesh(coreGeometry, coreMaterial);
        this.scene.add(this.core);

        // Accretion disk glow
        const glowGeometry = new THREE.RingGeometry(0.5, 3, 64);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.accretionDisk = new THREE.Mesh(glowGeometry, glowMaterial);
        this.accretionDisk.rotation.x = Math.PI / 2;
        this.scene.add(this.accretionDisk);

        // Camera position
        this.camera.position.set(0, 25, 40);
        this.camera.lookAt(0, 0, 0);

        this.galaxyRotation = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Rotate galaxy
        this.galaxyRotation += deltaTime * (0.15 + this.frequencyData.mid * 0.2);
        this.galaxy.rotation.y = this.galaxyRotation;

        // Audio-reactive star positions and colors
        const positions = this.galaxy.geometry.attributes.position.array;
        const colors = this.galaxy.geometry.attributes.color.array;
        const sizes = this.galaxy.geometry.attributes.size.array;

        for (let i = 0; i < this.stars.length; i++) {
            const i3 = i * 3;
            const star = this.stars[i];

            // Pulsing based on frequency bands
            const freqBand = star.armIndex % 3 === 0 ? this.frequencyData.bass :
                           star.armIndex % 3 === 1 ? this.frequencyData.mid :
                           this.frequencyData.high;

            // Vertical wave motion
            const wave = Math.sin(this.time * 2 + star.distance * 0.3 + star.armIndex) * 0.5;
            positions[i3 + 1] = star.originalY + wave + freqBand * 2;

            // Pulsing size
            sizes[i] = (Math.random() * 0.3 + 0.1) * (1 + freqBand * 0.5);

            // Color intensity
            const hue = (star.armIndex / 5 + star.distance / 60 + this.time * 0.1) % 1.0;
            const lightness = 0.4 + freqBand * 0.4 + this.beatIntensity * 0.3;
            const color = new THREE.Color().setHSL(hue, 0.9, lightness);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        this.galaxy.geometry.attributes.position.needsUpdate = true;
        this.galaxy.geometry.attributes.color.needsUpdate = true;
        this.galaxy.geometry.attributes.size.needsUpdate = true;

        // Pulsing core
        const coreScale = 1 + this.frequencyData.bass * 2 + this.beatIntensity;
        this.core.scale.setScalar(coreScale);

        // Accretion disk rotation and pulsing
        this.accretionDisk.rotation.z += deltaTime * 2;
        const diskScale = 1 + this.frequencyData.bass * 0.5;
        this.accretionDisk.scale.setScalar(diskScale);
        
        const diskHue = (this.time * 0.1 + this.frequencyData.bass) % 1.0;
        this.accretionDisk.material.color.setHSL(diskHue, 1.0, 0.5);
        this.accretionDisk.material.opacity = 0.3 + this.frequencyData.mid * 0.3;

        // Camera orbit
        const cameraAngle = this.time * 0.1;
        const cameraHeight = 25 + Math.sin(this.time * 0.2) * 10;
        this.camera.position.x = Math.sin(cameraAngle) * 40;
        this.camera.position.y = cameraHeight;
        this.camera.position.z = Math.cos(cameraAngle) * 40;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Explosion pulse on beat
        const positions = this.galaxy.geometry.attributes.position.array;
        
        for (let i = 0; i < this.stars.length; i++) {
            const i3 = i * 3;
            const distance = this.stars[i].distance;
            
            // Push stars outward briefly
            const explosionFactor = 1 + intensity * 0.1;
            positions[i3] *= explosionFactor;
            positions[i3 + 2] *= explosionFactor;
        }
        
        this.galaxy.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.galaxy);
        this.galaxy.geometry.dispose();
        this.galaxy.material.dispose();
        this.scene.remove(this.core);
        this.core.geometry.dispose();
        this.core.material.dispose();
        this.scene.remove(this.accretionDisk);
        this.accretionDisk.geometry.dispose();
        this.accretionDisk.material.dispose();
    }
};
