// Kaleidoscope - Symmetrical audio-reactive patterns
window.KaleidoscopePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Kaleidoscope');

        this.addBasicLighting();

        // Create mirrored geometric patterns
        this.segments = 8;
        this.layers = 5;
        this.shapes = [];

        for (let layer = 0; layer < this.layers; layer++) {
            const radius = 5 + layer * 3;
            const shapeSize = 1.5 - layer * 0.2;

            for (let i = 0; i < this.segments; i++) {
                const angle = (i / this.segments) * Math.PI * 2;
                
                // Alternate between different shapes
                let geometry;
                const shapeType = (layer + i) % 4;
                
                switch(shapeType) {
                    case 0:
                        geometry = new THREE.OctahedronGeometry(shapeSize);
                        break;
                    case 1:
                        geometry = new THREE.TetrahedronGeometry(shapeSize);
                        break;
                    case 2:
                        geometry = new THREE.IcosahedronGeometry(shapeSize);
                        break;
                    case 3:
                        geometry = new THREE.DodecahedronGeometry(shapeSize);
                        break;
                }

                const material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color().setHSL(i / this.segments, 1.0, 0.5),
                    emissive: new THREE.Color().setHSL(i / this.segments, 1.0, 0.3),
                    shininess: 100,
                    transparent: true,
                    opacity: 0.8,
                    wireframe: false
                });

                const shape = new THREE.Mesh(geometry, material);
                shape.position.x = Math.cos(angle) * radius;
                shape.position.y = Math.sin(angle) * radius;
                shape.position.z = layer * 2 - this.layers;

                this.scene.add(shape);
                this.shapes.push({
                    mesh: shape,
                    layer: layer,
                    segment: i,
                    angle: angle,
                    radius: radius,
                    baseScale: 1.0
                });
            }
        }

        // Add central core
        const coreGeometry = new THREE.SphereGeometry(2, 32, 32);
        const coreMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0x666666,
            shininess: 200,
            transparent: true,
            opacity: 0.6
        });
        this.core = new THREE.Mesh(coreGeometry, coreMaterial);
        this.scene.add(this.core);

        // Camera position
        this.camera.position.z = 30;
        this.camera.lookAt(0, 0, 0);

        this.rotationSpeed = 1.0;
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Rotate entire kaleidoscope
        const rotationAngle = this.time * this.rotationSpeed;

        this.shapes.forEach((shapeData, index) => {
            const shape = shapeData.mesh;
            
            // Orbital rotation
            const angle = shapeData.angle + rotationAngle;
            const radiusModulation = 1 + Math.sin(this.time * 2 + shapeData.layer) * 0.2;
            const radius = shapeData.radius * radiusModulation;
            
            shape.position.x = Math.cos(angle) * radius;
            shape.position.y = Math.sin(angle) * radius;
            shape.position.z = shapeData.layer * 2 - this.layers + Math.sin(this.time * 3 + shapeData.segment) * 2;

            // Individual rotation
            shape.rotation.x += deltaTime * (1 + shapeData.layer * 0.5);
            shape.rotation.y += deltaTime * (1.5 - shapeData.layer * 0.3);

            // Audio-reactive scaling
            const freqBand = shapeData.segment % 3 === 0 ? this.frequencyData.bass :
                           shapeData.segment % 3 === 1 ? this.frequencyData.mid :
                           this.frequencyData.high;
            const scale = 1.0 + freqBand * 0.5 + this.beatIntensity * 0.3;
            shape.scale.setScalar(scale);

            // Color cycling
            const hue = (shapeData.segment / this.segments + this.time * 0.1 + shapeData.layer * 0.1) % 1.0;
            const lightness = 0.5 + freqBand * 0.3;
            shape.material.color.setHSL(hue, 1.0, lightness);
            shape.material.emissive.setHSL(hue, 1.0, lightness * 0.5);
            
            // Opacity pulsing
            shape.material.opacity = 0.7 + Math.sin(this.time * 4 + index) * 0.2 + freqBand * 0.2;
        });

        // Pulsing core
        const coreScale = 1 + this.frequencyData.bass * 0.8 + this.beatIntensity * 0.5;
        this.core.scale.setScalar(coreScale);
        
        const coreHue = (this.time * 0.2) % 1.0;
        this.core.material.color.setHSL(coreHue, 1.0, 0.7);
        this.core.material.emissive.setHSL(coreHue, 1.0, 0.4);
        
        this.core.rotation.x += deltaTime * 0.5;
        this.core.rotation.y += deltaTime * 0.7;

        // Camera orbit
        const cameraAngle = this.time * 0.3;
        this.camera.position.x = Math.sin(cameraAngle) * 30;
        this.camera.position.y = Math.cos(cameraAngle * 0.7) * 15;
        this.camera.position.z = Math.cos(cameraAngle) * 30;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Speed up rotation on beat
        this.rotationSpeed = 1.0 + intensity * 2;
        
        // Gradually decay back to normal
        setTimeout(() => {
            this.rotationSpeed = 1.0;
        }, 500);
    }

    dispose() {
        this.shapes.forEach(shapeData => {
            this.scene.remove(shapeData.mesh);
            shapeData.mesh.geometry.dispose();
            shapeData.mesh.material.dispose();
        });
        this.scene.remove(this.core);
        this.core.geometry.dispose();
        this.core.material.dispose();
    }
};
