// StarField - Flying through space with nebula clouds
window.StarFieldPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Star Field');

        // Create star particles
        this.stars = [];
        const starCount = 1000;
        
        for (let i = 0; i < starCount; i++) {
            const size = Math.random() * 0.15 + 0.05;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const brightness = 0.5 + Math.random() * 0.5;
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(Math.random() * 0.2 + 0.5, 0.3, brightness),
                transparent: true,
                opacity: brightness
            });
            
            const star = new THREE.Mesh(geometry, material);
            
            // Random position in 3D space
            star.position.x = (Math.random() - 0.5) * 200;
            star.position.y = (Math.random() - 0.5) * 200;
            star.position.z = (Math.random() - 0.5) * 200 - 100;
            
            this.scene.add(star);
            this.stars.push({
                mesh: star,
                speed: 5 + Math.random() * 15,
                brightness: brightness,
                twinklePhase: Math.random() * Math.PI * 2
            });
        }

        // Create nebula clouds using shader
        this.nebulaClouds = [];
        const cloudCount = 8;
        
        const vertexShader = `
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        const fragmentShader = `
            uniform float time;
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float opacity;
            varying vec2 vUv;
            
            // Noise function
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            float smoothNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                
                float a = noise(i);
                float b = noise(i + vec2(1.0, 0.0));
                float c = noise(i + vec2(0.0, 1.0));
                float d = noise(i + vec2(1.0, 1.0));
                
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            float fbm(vec2 p) {
                float value = 0.0;
                float amplitude = 0.5;
                
                for (int i = 0; i < 5; i++) {
                    value += amplitude * smoothNoise(p);
                    p *= 2.0;
                    amplitude *= 0.5;
                }
                
                return value;
            }
            
            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                
                float cloud = fbm(vUv * 3.0 + time * 0.1);
                cloud = pow(cloud, 2.0);
                
                vec3 color = mix(color1, color2, cloud);
                float alpha = cloud * opacity;
                
                // Radial falloff
                float dist = length(uv);
                alpha *= 1.0 - smoothstep(0.5, 1.0, dist);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
        
        for (let i = 0; i < cloudCount; i++) {
            const geometry = new THREE.PlaneGeometry(30, 30, 1, 1);
            const material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: {
                    time: { value: 0 },
                    color1: { value: new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.8, 0.3) },
                    color2: { value: new THREE.Color().setHSL(0.8 + Math.random() * 0.2, 0.6, 0.5) },
                    opacity: { value: 0.4 }
                },
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            
            const cloud = new THREE.Mesh(geometry, material);
            cloud.position.x = (Math.random() - 0.5) * 100;
            cloud.position.y = (Math.random() - 0.5) * 100;
            cloud.position.z = -50 - Math.random() * 100;
            cloud.rotation.z = Math.random() * Math.PI * 2;
            
            this.scene.add(cloud);
            this.nebulaClouds.push({
                mesh: cloud,
                speed: 2 + Math.random() * 3,
                rotSpeed: (Math.random() - 0.5) * 0.2
            });
        }

        // Add some large planets/spheres
        this.planets = [];
        const planetCount = 5;
        
        for (let i = 0; i < planetCount; i++) {
            const radius = 3 + Math.random() * 5;
            const geometry = new THREE.SphereGeometry(radius, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
                emissive: new THREE.Color().setHSL(Math.random(), 0.8, 0.2),
                shininess: 30
            });
            
            const planet = new THREE.Mesh(geometry, material);
            planet.position.x = (Math.random() - 0.5) * 80;
            planet.position.y = (Math.random() - 0.5) * 80;
            planet.position.z = -80 - Math.random() * 100;
            
            this.scene.add(planet);
            this.planets.push({
                mesh: planet,
                speed: 1 + Math.random() * 2,
                rotSpeed: (Math.random() - 0.5) * 0.5
            });
        }

        this.addBasicLighting();

        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, -100);

        this.speed = 10;
    }

    update(deltaTime) {
        super.update(deltaTime);

        const speed = this.speed + this.frequencyData.bass * 20;

        // Move stars toward camera
        this.stars.forEach((starData, i) => {
            const star = starData.mesh;
            
            star.position.z += deltaTime * starData.speed * (1 + this.frequencyData.mid * 2);
            
            // Respawn star when it passes camera
            if (star.position.z > 10) {
                star.position.x = (Math.random() - 0.5) * 200;
                star.position.y = (Math.random() - 0.5) * 200;
                star.position.z = -200;
            }
            
            // Twinkle
            starData.twinklePhase += deltaTime * 2;
            const twinkle = 0.7 + Math.sin(starData.twinklePhase) * 0.3;
            star.material.opacity = starData.brightness * twinkle * (1 + this.frequencyData.high * 0.5);
        });

        // Animate nebula clouds
        this.nebulaClouds.forEach((cloudData, i) => {
            const cloud = cloudData.mesh;
            
            cloud.position.z += deltaTime * cloudData.speed * (1 + this.frequencyData.bass * 0.5);
            
            if (cloud.position.z > 20) {
                cloud.position.x = (Math.random() - 0.5) * 100;
                cloud.position.y = (Math.random() - 0.5) * 100;
                cloud.position.z = -150;
            }
            
            cloud.rotation.z += deltaTime * cloudData.rotSpeed;
            cloud.material.uniforms.time.value = this.time + i * 2;
            cloud.material.uniforms.opacity.value = 0.4 + this.frequencyData.mid * 0.3;
        });

        // Move and rotate planets
        this.planets.forEach((planetData, i) => {
            const planet = planetData.mesh;
            
            planet.position.z += deltaTime * planetData.speed * (1 + this.frequencyData.bass * 0.5);
            
            if (planet.position.z > 20) {
                planet.position.x = (Math.random() - 0.5) * 80;
                planet.position.y = (Math.random() - 0.5) * 80;
                planet.position.z = -180;
            }
            
            planet.rotation.x += deltaTime * planetData.rotSpeed;
            planet.rotation.y += deltaTime * planetData.rotSpeed * 0.7;
            
            // Pulse emissive on beat
            const emissiveBrightness = 0.2 + this.frequencyData.bass * 0.5;
            const hue = (this.time * 0.1 + i * 0.2) % 1.0;
            planet.material.emissive.setHSL(hue, 0.8, emissiveBrightness);
        });

        // Camera shake on heavy bass
        if (this.frequencyData.bass > 0.7) {
            this.camera.position.x = (Math.random() - 0.5) * this.frequencyData.bass * 2;
            this.camera.position.y = (Math.random() - 0.5) * this.frequencyData.bass * 2;
        } else {
            this.camera.position.x *= 0.9;
            this.camera.position.y *= 0.9;
        }
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Speed burst
        this.speed = 10 + intensity * 30;
        setTimeout(() => { this.speed = 10; }, 300);

        // Flash brightest stars
        this.stars.slice(0, 100).forEach(starData => {
            starData.mesh.material.opacity = 1;
        });
    }

    dispose() {
        this.stars.forEach(starData => {
            this.scene.remove(starData.mesh);
            starData.mesh.geometry.dispose();
            starData.mesh.material.dispose();
        });
        
        this.nebulaClouds.forEach(cloudData => {
            this.scene.remove(cloudData.mesh);
            cloudData.mesh.geometry.dispose();
            cloudData.mesh.material.dispose();
        });
        
        this.planets.forEach(planetData => {
            this.scene.remove(planetData.mesh);
            planetData.mesh.geometry.dispose();
            planetData.mesh.material.dispose();
        });
    }
};
