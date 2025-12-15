// Plasma - Classic demoscene plasma effect in 3D
window.PlasmaPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Plasma');

        // Create shader for plasma effect
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
                vec2 p = vUv * 8.0;
                
                // Multi-layered plasma
                float plasma = 0.0;
                plasma += sin(p.x * 2.0 + time * 2.0 + bass * 3.0);
                plasma += sin(p.y * 3.0 + time * 1.5 + mid * 2.0);
                plasma += sin((p.x + p.y) * 1.5 + time * 2.5);
                plasma += cos(length(p - vec2(4.0 + sin(time), 4.0 + cos(time * 1.3))) * 3.0 + high * 4.0);
                plasma += sin(sqrt(p.x * p.x + p.y * p.y) * 2.0 - time * 3.0);
                
                plasma /= 5.0;
                
                // Convert to color
                float hue = plasma * 0.5 + 0.5 + time * 0.1;
                float saturation = 0.8 + bass * 0.2;
                float value = 0.7 + mid * 0.3;
                
                vec3 color = hsv2rgb(vec3(hue, saturation, value));
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // Create multiple plasma planes
        this.planes = [];
        const planeCount = 3;

        for (let i = 0; i < planeCount; i++) {
            const geometry = new THREE.PlaneGeometry(30, 30, 128, 128);
            const material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: {
                    time: { value: 0 },
                    bass: { value: 0 },
                    mid: { value: 0 },
                    high: { value: 0 }
                },
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            });

            const plane = new THREE.Mesh(geometry, material);
            plane.position.z = -i * 5;
            plane.rotation.x = -Math.PI / 6;
            this.scene.add(plane);
            
            this.planes.push({
                mesh: plane,
                baseZ: plane.position.z,
                phaseOffset: i * Math.PI * 0.5
            });
        }

        // Add plasma spheres
        this.spheres = [];
        const sphereCount = 5;

        for (let i = 0; i < sphereCount; i++) {
            const geometry = new THREE.SphereGeometry(2, 32, 32);
            const material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: {
                    time: { value: 0 },
                    bass: { value: 0 },
                    mid: { value: 0 },
                    high: { value: 0 }
                },
                transparent: true,
                opacity: 0.6
            });

            const sphere = new THREE.Mesh(geometry, material);
            const angle = (i / sphereCount) * Math.PI * 2;
            sphere.position.x = Math.cos(angle) * 10;
            sphere.position.y = 5;
            sphere.position.z = Math.sin(angle) * 10;
            
            this.scene.add(sphere);
            this.spheres.push({
                mesh: sphere,
                angle: angle,
                orbit: 10
            });
        }

        // Camera position
        this.camera.position.set(0, 15, 25);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Update all shader uniforms
        this.planes.forEach((planeData, index) => {
            const plane = planeData.mesh;
            plane.material.uniforms.time.value = this.time + planeData.phaseOffset;
            plane.material.uniforms.bass.value = this.frequencyData.bass;
            plane.material.uniforms.mid.value = this.frequencyData.mid;
            plane.material.uniforms.high.value = this.frequencyData.high;

            // Undulating motion
            const wave = Math.sin(this.time * 2 + index) * 2;
            plane.position.y = wave + this.frequencyData.bass * 5;
            
            // Rotate planes
            plane.rotation.z += deltaTime * (0.2 + index * 0.1);
        });

        // Orbit spheres
        this.spheres.forEach((sphereData, index) => {
            const sphere = sphereData.mesh;
            sphere.material.uniforms.time.value = this.time * 1.5;
            sphere.material.uniforms.bass.value = this.frequencyData.bass;
            sphere.material.uniforms.mid.value = this.frequencyData.mid;
            sphere.material.uniforms.high.value = this.frequencyData.high;

            // Orbital motion
            const angle = sphereData.angle + this.time * (0.5 + index * 0.1);
            const orbit = sphereData.orbit + this.frequencyData.mid * 5;
            
            sphere.position.x = Math.cos(angle) * orbit;
            sphere.position.z = Math.sin(angle) * orbit;
            sphere.position.y = 5 + Math.sin(this.time * 2 + index) * 3;

            // Scale pulsing
            const scale = 1 + this.frequencyData.bass * 0.5;
            sphere.scale.setScalar(scale);

            // Rotate spheres
            sphere.rotation.x += deltaTime * 0.5;
            sphere.rotation.y += deltaTime * 0.7;
        });

        // Camera orbit
        const cameraAngle = this.time * 0.2;
        this.camera.position.x = Math.sin(cameraAngle) * 25;
        this.camera.position.z = Math.cos(cameraAngle) * 25;
        this.camera.position.y = 15 + Math.sin(this.time * 0.3) * 5;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash effect on beat
        this.planes.forEach(planeData => {
            planeData.mesh.material.opacity = 0.7 + intensity * 0.3;
        });

        this.spheres.forEach(sphereData => {
            sphereData.mesh.scale.setScalar(1 + intensity);
        });
    }

    dispose() {
        this.planes.forEach(planeData => {
            this.scene.remove(planeData.mesh);
            planeData.mesh.geometry.dispose();
            planeData.mesh.material.dispose();
        });

        this.spheres.forEach(sphereData => {
            this.scene.remove(sphereData.mesh);
            sphereData.mesh.geometry.dispose();
            sphereData.mesh.material.dispose();
        });
    }
};
