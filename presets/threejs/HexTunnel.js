// HexTunnel - Hexagonal tunnel with neon wireframe aesthetics
window.HexTunnelPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Hex Tunnel');

        this.hexagons = [];
        const hexCount = 80;
        const tunnelLength = 120;
        
        // Create hexagonal rings
        for (let i = 0; i < hexCount; i++) {
            const geometry = new THREE.CylinderGeometry(3, 3, 0.3, 6, 1, true);
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(i / hexCount, 1.0, 0.5),
                wireframe: true,
                transparent: true,
                opacity: 0.8
            });

            const hex = new THREE.Mesh(geometry, material);
            hex.rotation.x = Math.PI / 2;
            hex.position.z = -(i * (tunnelLength / hexCount));
            this.scene.add(hex);
            
            this.hexagons.push({
                mesh: hex,
                offset: i,
                initialZ: hex.position.z,
                rotSpeed: 0.3 + (i % 3) * 0.2
            });
        }

        // Add particle stars
        this.stars = [];
        const starCount = 200;
        const starGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        
        for (let i = 0; i < starCount; i++) {
            const starMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(Math.random(), 1.0, 0.7),
                transparent: true,
                opacity: 0.8
            });
            
            const star = new THREE.Mesh(starGeometry, starMaterial);
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * 2;
            
            star.position.x = Math.cos(angle) * radius;
            star.position.y = Math.sin(angle) * radius;
            star.position.z = -Math.random() * tunnelLength;
            
            this.scene.add(star);
            this.stars.push({
                mesh: star,
                angle: angle,
                radius: radius,
                speed: 0.5 + Math.random() * 1.5
            });
        }

        // Neon grid lines
        this.gridLines = [];
        const lineCount = 12;
        
        for (let i = 0; i < lineCount; i++) {
            const points = [];
            const angle = (i / lineCount) * Math.PI * 2;
            
            for (let z = 0; z > -tunnelLength; z -= 2) {
                const x = Math.cos(angle) * 3;
                const y = Math.sin(angle) * 3;
                points.push(new THREE.Vector3(x, y, z));
            }
            
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.4
            });
            
            const line = new THREE.Line(lineGeometry, lineMaterial);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        // Add fog for depth
        this.scene.fog = new THREE.FogExp2(0x000000, 0.015);

        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, -100);

        this.speed = 15;
        this.tunnelLength = tunnelLength;
        this.wobble = { x: 0, y: 0 };
    }

    update(deltaTime) {
        super.update(deltaTime);

        const speed = this.speed + this.frequencyData.bass * 10;

        // Hexagon movement and rotation
        this.hexagons.forEach((hexData, i) => {
            const hex = hexData.mesh;
            
            // Move toward camera
            hex.position.z += deltaTime * speed;
            
            if (hex.position.z > 10) {
                hex.position.z -= this.tunnelLength;
            }

            // Rotate each hexagon
            hex.rotation.z += deltaTime * hexData.rotSpeed * (1 + this.frequencyData.mid);

            // Color cycling
            const hue = (hexData.offset / this.hexagons.length + this.time * 0.2) % 1.0;
            hex.material.color.setHSL(hue, 1.0, 0.5 + this.frequencyData.high * 0.3);
            
            // Scale pulsing
            const scale = 1.0 + Math.sin(this.time * 2 + hexData.offset * 0.2) * 0.1 + this.frequencyData.bass * 0.3;
            hex.scale.set(scale, scale, 1);
        });

        // Animate stars
        this.stars.forEach(starData => {
            const star = starData.mesh;
            
            star.position.z += deltaTime * speed * starData.speed;
            
            if (star.position.z > 10) {
                star.position.z -= this.tunnelLength;
            }

            // Twinkle
            const twinkle = 0.5 + Math.sin(this.time * 5 + starData.angle * 10) * 0.3 + this.frequencyData.high * 0.5;
            star.material.opacity = twinkle;
            
            // Rotate around tunnel
            const spinAngle = starData.angle + this.time * 0.5;
            star.position.x = Math.cos(spinAngle) * starData.radius;
            star.position.y = Math.sin(spinAngle) * starData.radius;
        });

        // Camera wobble
        this.wobble.x = Math.sin(this.time * 1.2) * 0.5 + this.frequencyData.bass * 0.5;
        this.wobble.y = Math.cos(this.time * 0.9) * 0.3 + this.frequencyData.mid * 0.5;
        
        this.camera.position.x = this.wobble.x;
        this.camera.position.y = this.wobble.y;
        this.camera.rotation.z = Math.sin(this.time * 0.5) * 0.05;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash hexagons
        this.hexagons.forEach(hexData => {
            hexData.mesh.material.opacity = 0.8 + intensity * 0.2;
        });

        // Boost speed temporarily
        this.speed = 15 + intensity * 20;
        setTimeout(() => { this.speed = 15; }, 200);
    }

    dispose() {
        this.hexagons.forEach(hexData => {
            this.scene.remove(hexData.mesh);
            hexData.mesh.geometry.dispose();
            hexData.mesh.material.dispose();
        });
        
        this.stars.forEach(starData => {
            this.scene.remove(starData.mesh);
            starData.mesh.geometry.dispose();
            starData.mesh.material.dispose();
        });
        
        this.gridLines.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        
        this.scene.fog = null;
    }
};
