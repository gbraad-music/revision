// MilkdropStyle - Classic Milkdrop/Winamp visualization style
window.MilkdropStylePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Milkdrop Style');

        // Create flowing waveform shader
        const vertexShader = `
            uniform float time;
            uniform float bass;
            uniform float mid;
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vec3 pos = position;
                
                // Wavy displacement
                float wave = sin(pos.x * 2.0 + time * 2.0) * 0.5;
                wave += cos(pos.y * 3.0 + time * 1.5) * 0.3;
                pos.z += wave * (1.0 + bass * 2.0);
                
                vPosition = pos;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float time;
            uniform float bass;
            uniform float mid;
            uniform float high;
            varying vec2 vUv;
            varying vec3 vPosition;
            
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            
            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                
                // Radial waves
                float dist = length(uv);
                float angle = atan(uv.y, uv.x);
                
                float pattern = 0.0;
                pattern += sin(dist * 8.0 - time * 3.0 + bass * 5.0);
                pattern += sin(angle * 12.0 + time * 2.0);
                pattern += cos(dist * 4.0 + angle * 6.0 - time * 4.0);
                pattern += sin(uv.x * 10.0 + uv.y * 10.0 + time * 2.5 + mid * 3.0);
                
                pattern /= 4.0;
                
                // Psychedelic color mapping
                float hue = pattern * 0.3 + time * 0.1 + dist * 0.2;
                float sat = 0.8 + high * 0.2;
                float val = 0.6 + abs(pattern) * 0.4 + bass * 0.3;
                
                vec3 color = hsv2rgb(vec3(hue, sat, val));
                
                // Add some glow
                float glow = 1.0 - dist * 0.5;
                color *= glow;
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // Main display plane
        const planeGeometry = new THREE.PlaneGeometry(40, 30, 128, 96);
        this.planeMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                time: { value: 0 },
                bass: { value: 0 },
                mid: { value: 0 },
                high: { value: 0 }
            },
            side: THREE.DoubleSide
        });

        this.plane = new THREE.Mesh(planeGeometry, this.planeMaterial);
        this.plane.rotation.x = -Math.PI / 3;
        this.scene.add(this.plane);

        // Create particle swarm
        this.particles = [];
        const particleCount = 500;
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(Math.random(), 1.0, 0.6),
                transparent: true,
                opacity: 0.7
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Random position in a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 10 + Math.random() * 20;
            
            particle.position.x = radius * Math.sin(phi) * Math.cos(theta);
            particle.position.y = radius * Math.sin(phi) * Math.sin(theta);
            particle.position.z = radius * Math.cos(phi) - 20;
            
            this.scene.add(particle);
            
            this.particles.push({
                mesh: particle,
                theta: theta,
                phi: phi,
                radius: radius,
                speed: 0.5 + Math.random() * 1.5,
                offset: i
            });
        }

        // Spiral objects
        this.spirals = [];
        const spiralCount = 30;
        
        for (let i = 0; i < spiralCount; i++) {
            const torusGeometry = new THREE.TorusGeometry(0.5, 0.2, 16, 32);
            const torusMaterial = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(i / spiralCount, 1.0, 0.5),
                emissive: new THREE.Color().setHSL(i / spiralCount, 1.0, 0.3),
                wireframe: true,
                transparent: true,
                opacity: 0.6
            });
            
            const torus = new THREE.Mesh(torusGeometry, torusMaterial);
            const angle = (i / spiralCount) * Math.PI * 4;
            const height = i * 1.5 - 20;
            
            torus.position.x = Math.cos(angle) * 10;
            torus.position.y = height;
            torus.position.z = Math.sin(angle) * 10 - 20;
            
            this.scene.add(torus);
            this.spirals.push({
                mesh: torus,
                angle: angle,
                height: height,
                index: i
            });
        }

        // Add basic lighting
        this.addBasicLighting();
        
        const pointLight = new THREE.PointLight(0xffffff, 2, 100);
        pointLight.position.set(0, 10, 10);
        this.scene.add(pointLight);
        this.pointLight = pointLight;

        this.camera.position.set(0, 15, 30);
        this.camera.lookAt(0, 0, -10);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Update plane shader
        this.planeMaterial.uniforms.time.value = this.time;
        this.planeMaterial.uniforms.bass.value = this.frequencyData.bass;
        this.planeMaterial.uniforms.mid.value = this.frequencyData.mid;
        this.planeMaterial.uniforms.high.value = this.frequencyData.high;

        // Undulate the plane
        this.plane.position.y = Math.sin(this.time * 1.5) * 2 + this.frequencyData.bass * 5;
        this.plane.rotation.z = Math.sin(this.time * 0.5) * 0.2;

        // Swirl particles
        this.particles.forEach((pData, i) => {
            const particle = pData.mesh;
            
            // Orbital motion
            pData.theta += deltaTime * pData.speed * 0.5;
            pData.phi += deltaTime * pData.speed * 0.3;
            
            const r = pData.radius + Math.sin(this.time * 2 + pData.offset * 0.1) * 3 + this.frequencyData.mid * 5;
            
            particle.position.x = r * Math.sin(pData.phi) * Math.cos(pData.theta);
            particle.position.y = r * Math.sin(pData.phi) * Math.sin(pData.theta);
            particle.position.z = r * Math.cos(pData.phi) - 20;
            
            // Color shift
            const hue = (pData.offset / this.particles.length + this.time * 0.15) % 1.0;
            particle.material.color.setHSL(hue, 1.0, 0.6 + this.frequencyData.high * 0.3);
            
            // Scale pulse
            const scale = 1 + Math.sin(this.time * 3 + pData.offset * 0.5) * 0.3 + this.frequencyData.bass * 0.5;
            particle.scale.setScalar(scale);
        });

        // Animate spiral
        this.spirals.forEach((sData, i) => {
            const spiral = sData.mesh;
            
            // Rise and rotate
            sData.height += deltaTime * 5;
            if (sData.height > 20) {
                sData.height = -20;
            }
            
            const angle = sData.angle + this.time;
            spiral.position.x = Math.cos(angle) * (10 + this.frequencyData.mid * 5);
            spiral.position.y = sData.height;
            spiral.position.z = Math.sin(angle) * (10 + this.frequencyData.mid * 5) - 20;
            
            spiral.rotation.x += deltaTime * 2;
            spiral.rotation.y += deltaTime * 1.5;
            
            // Color pulse
            const hue = (sData.index / this.spirals.length + this.time * 0.2) % 1.0;
            spiral.material.color.setHSL(hue, 1.0, 0.5);
            spiral.material.emissive.setHSL(hue, 1.0, 0.3 + this.frequencyData.bass * 0.4);
        });

        // Pulsing light
        this.pointLight.intensity = 2 + this.frequencyData.bass * 4;
        const lightHue = (this.time * 0.1) % 1.0;
        this.pointLight.color.setHSL(lightHue, 1.0, 0.6);

        // Camera sway
        this.camera.position.x = Math.sin(this.time * 0.5) * 10;
        this.camera.position.y = 15 + Math.cos(this.time * 0.7) * 5;
        this.camera.lookAt(0, 0, -10);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Particle burst
        this.particles.forEach(pData => {
            pData.radius += intensity * 3;
            setTimeout(() => {
                pData.radius -= intensity * 3;
            }, 100);
        });

        // Plane pulse
        this.plane.scale.setScalar(1 + intensity * 0.2);
        setTimeout(() => {
            this.plane.scale.setScalar(1);
        }, 100);
    }

    dispose() {
        this.scene.remove(this.plane);
        this.plane.geometry.dispose();
        this.plane.material.dispose();
        
        this.particles.forEach(pData => {
            this.scene.remove(pData.mesh);
            pData.mesh.geometry.dispose();
            pData.mesh.material.dispose();
        });
        
        this.spirals.forEach(sData => {
            this.scene.remove(sData.mesh);
            sData.mesh.geometry.dispose();
            sData.mesh.material.dispose();
        });
        
        this.scene.remove(this.pointLight);
    }
};
