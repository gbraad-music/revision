// Nebula - Volumetric space nebula with shader effects
window.NebulaPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Nebula');

        // Create nebula cloud with shader
        const vertexShader = `
            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec2 vUv;
            
            void main() {
                vPosition = position;
                vNormal = normal;
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float time;
            uniform float bass;
            uniform float mid;
            uniform float high;
            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec2 vUv;
            
            // Simplex noise approximation
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                
                i = mod289(i);
                vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }
            
            void main() {
                vec3 pos = vPosition * 0.1;
                
                // Multi-octave noise for nebula effect
                float n = 0.0;
                n += snoise(pos + time * 0.2) * 0.5;
                n += snoise(pos * 2.0 + time * 0.3) * 0.25;
                n += snoise(pos * 4.0 + time * 0.5) * 0.125;
                n += snoise(pos * 8.0 + time * 0.8) * 0.0625;
                
                n = n * 0.5 + 0.5;
                
                // Audio reactivity
                n += bass * 0.3;
                n += mid * 0.2 * snoise(pos * 3.0 + time);
                n += high * 0.15 * snoise(pos * 5.0 + time * 2.0);
                
                // Color based on density
                vec3 color1 = vec3(0.1, 0.0, 0.3); // Deep purple
                vec3 color2 = vec3(0.0, 0.5, 1.0); // Cyan
                vec3 color3 = vec3(1.0, 0.3, 0.5); // Pink
                vec3 color4 = vec3(1.0, 0.8, 0.0); // Gold
                
                vec3 color = mix(color1, color2, smoothstep(0.2, 0.4, n));
                color = mix(color, color3, smoothstep(0.4, 0.6, n));
                color = mix(color, color4, smoothstep(0.6, 0.8, n));
                
                float alpha = smoothstep(0.1, 0.9, n);
                
                gl_FragColor = vec4(color, alpha * 0.6);
            }
        `;

        // Create multiple nebula spheres
        this.nebulaSpheres = [];
        const sphereCount = 5;
        
        for (let i = 0; i < sphereCount; i++) {
            const geometry = new THREE.SphereGeometry(10 + i * 3, 32, 32);
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
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );
            
            this.scene.add(mesh);
            this.nebulaSpheres.push({
                mesh: mesh,
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2
                ),
                timeOffset: i * 10
            });
        }
        
        // Add stars
        this.stars = [];
        const starCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 40 + Math.random() * 40;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
            
            const brightness = 0.5 + Math.random() * 0.5;
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness;
            colors[i * 3 + 2] = brightness;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        this.starField = new THREE.Points(geometry, material);
        this.scene.add(this.starField);
        
        this.camera.position.set(30, 30, 30);
        this.camera.lookAt(0, 0, 0);
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Update nebula spheres
        this.nebulaSpheres.forEach(sphereData => {
            sphereData.mesh.material.uniforms.time.value = this.time + sphereData.timeOffset;
            sphereData.mesh.material.uniforms.bass.value = this.frequencyData.bass;
            sphereData.mesh.material.uniforms.mid.value = this.frequencyData.mid;
            sphereData.mesh.material.uniforms.high.value = this.frequencyData.high;
            
            sphereData.mesh.rotation.x += deltaTime * sphereData.rotationSpeed.x;
            sphereData.mesh.rotation.y += deltaTime * sphereData.rotationSpeed.y;
            sphereData.mesh.rotation.z += deltaTime * sphereData.rotationSpeed.z;
            
            // Slow drift
            sphereData.mesh.position.x += Math.sin(this.time * 0.1 + sphereData.timeOffset) * 0.01;
            sphereData.mesh.position.y += Math.cos(this.time * 0.15 + sphereData.timeOffset) * 0.01;
            sphereData.mesh.position.z += Math.sin(this.time * 0.12 + sphereData.timeOffset) * 0.01;
        });
        
        // Rotate star field slowly
        this.starField.rotation.y += deltaTime * 0.02;
        
        // Twinkle effect
        const colors = this.starField.geometry.attributes.color.array;
        for (let i = 0; i < colors.length / 3; i++) {
            if (Math.random() < 0.01) {
                const brightness = 0.5 + Math.random() * 0.5;
                colors[i * 3] = brightness;
                colors[i * 3 + 1] = brightness;
                colors[i * 3 + 2] = brightness;
            }
        }
        this.starField.geometry.attributes.color.needsUpdate = true;
        
        // Camera orbit
        const angle = this.time * 0.05;
        const radius = 35 + Math.sin(this.time * 0.2) * 10;
        this.camera.position.x = Math.cos(angle) * radius;
        this.camera.position.z = Math.sin(angle) * radius;
        this.camera.position.y = 30 + Math.sin(this.time * 0.1) * 10;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        this.nebulaSpheres.forEach(sphereData => {
            const scale = 1 + intensity * 0.3;
            sphereData.mesh.scale.setScalar(scale);
        });
    }

    dispose() {
        this.nebulaSpheres.forEach(sphereData => {
            this.scene.remove(sphereData.mesh);
            sphereData.mesh.geometry.dispose();
            sphereData.mesh.material.dispose();
        });
        
        this.scene.remove(this.starField);
        this.starField.geometry.dispose();
        this.starField.material.dispose();
    }
};
