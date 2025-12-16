// Oscilloscope3D - Classic time-domain oscilloscope with phosphor trails
window.Oscilloscope3DPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Time-Domain Oscilloscope');

        this.waveformPoints = 512;
        this.waveformData = new Float32Array(this.waveformPoints);
        
        this.lastDebugLog = 0;
        
        // Create CRT screen frame
        const frameGeometry = new THREE.BoxGeometry(64, 40, 0.5);
        const frameMaterial = new THREE.MeshPhongMaterial({
            color: 0x222222,
            shininess: 30
        });
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.z = -1;
        this.scene.add(this.frame);

        // Create screen glow plane
        const screenGeometry = new THREE.PlaneGeometry(60, 36);
        const screenMaterial = new THREE.MeshBasicMaterial({
            color: 0x001100,
            transparent: true,
            opacity: 0.3
        });
        this.screen = new THREE.Mesh(screenGeometry, screenMaterial);
        this.screen.position.z = -0.5;
        this.scene.add(this.screen);

        // Create grid lines (like oscilloscope graticule)
        this.createGrid();

        // Create main waveform line (horizontal sweep)
        const points = [];
        for (let i = 0; i < this.waveformPoints; i++) {
            points.push(new THREE.Vector3(0, 0, 0));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.9
        });

        this.waveformLine = new THREE.Line(geometry, material);
        this.scene.add(this.waveformLine);

        // Create persistence/afterglow trails
        this.trails = [];
        this.maxTrails = 8; // Nice phosphor persistence effect

        // CRT glow effect
        const glowLight = new THREE.PointLight(0x00ff00, 1, 50);
        glowLight.position.set(0, 0, 5);
        this.scene.add(glowLight);
        this.glowLight = glowLight;

        // Ambient lighting for frame
        this.addBasicLighting();

        this.camera.position.set(0, 0, 18);
        this.camera.lookAt(0, 0, 0);
        
        // Log analyser status after a brief delay
        setTimeout(() => {
            if (this.audioAnalyser) {
                console.log('[Oscilloscope] ✓ Audio analyser connected - FFT Size:', this.audioAnalyser.fftSize);
                console.log('[Oscilloscope] 💡 Time-domain mode with phosphor trails');
                console.log('[Oscilloscope] 💡 Use XYScope preset for oscilloscope music shapes!');
            } else {
                console.warn('[Oscilloscope] ⚠️ Audio analyser NOT connected - using synthetic waveform');
            }
        }, 100);
    }

    createGrid() {
        this.gridLines = [];
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x003300,
            transparent: true,
            opacity: 0.3
        });

        // Horizontal lines (like voltage divisions)
        for (let y = -16; y <= 16; y += 2) {
            const points = [
                new THREE.Vector3(-14, y, 0),
                new THREE.Vector3(14, y, 0)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        // Vertical lines (like time divisions)
        for (let x = -28; x <= 28; x += 2) {
            const points = [
                new THREE.Vector3(x, -8, 0),
                new THREE.Vector3(x, 8, 0)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        // Center crosshair
        const centerMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5
        });

        const hPoints = [
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(1, 0, 0)
        ];
        const hGeo = new THREE.BufferGeometry().setFromPoints(hPoints);
        const hLine = new THREE.Line(hGeo, centerMaterial);
        this.scene.add(hLine);
        this.gridLines.push(hLine);

        const vPoints = [
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 1, 0)
        ];
        const vGeo = new THREE.BufferGeometry().setFromPoints(vPoints);
        const vLine = new THREE.Line(vGeo, centerMaterial);
        this.scene.add(vLine);
        this.gridLines.push(vLine);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Get real waveform data from audio analyser if available
        if (this.audioAnalyser) {
            const bufferLength = this.audioAnalyser.fftSize;
            const timeDomainData = new Uint8Array(bufferLength);
            this.audioAnalyser.getByteTimeDomainData(timeDomainData);
            
            // Debug logging (every 2 seconds)
            const now = performance.now();
            if (now - this.lastDebugLog > 2000) {
                const min = Math.min(...timeDomainData);
                const max = Math.max(...timeDomainData);
                const avg = timeDomainData.reduce((a, b) => a + b) / timeDomainData.length;
                const variance = max - min;
                console.log('[Oscilloscope] Audio data - Min:', min, 'Max:', max, 'Avg:', avg.toFixed(1), 
                    'Variance:', variance, 'Active:', variance > 1 ? 'YES' : 'NO');
                this.lastDebugLog = now;
            }
            
            // Resample to our waveform points
            for (let i = 0; i < this.waveformPoints; i++) {
                const ratio = i / (this.waveformPoints - 1);
                const index = Math.floor(ratio * (bufferLength - 1));
                
                // Convert from 0-255 to -1 to 1 range, then scale
                const normalized = (timeDomainData[index] - 128) / 128.0;
                this.waveformData[i] = normalized * 7;
            }
        } else {
            // Fallback: synthetic waveform
            for (let i = 0; i < this.waveformPoints; i++) {
                const t = this.time * 3;
                const phase = i / this.waveformPoints;
                
                let signal = 0;
                signal += Math.sin(phase * Math.PI * 2 * 2 + t) * this.frequencyData.bass * 6;
                signal += Math.sin(phase * Math.PI * 2 * 5 + t * 1.3) * this.frequencyData.mid * 4;
                signal += Math.sin(phase * Math.PI * 2 * 13 + t * 1.7) * this.frequencyData.high * 2;
                
                this.waveformData[i] = signal;
            }
        }

        // Update time-domain display
        this.updateNormalMode();

        // Create phosphor persistence trails
        if (this.time % 0.05 < deltaTime) {
            this.createTrail();
        }

        // Fade out trails
        this.trails.forEach((trail, i) => {
            const age = i / this.trails.length;
            trail.material.opacity = 0.4 * (1 - age);
        });

        // CRT glow pulsing
        this.glowLight.intensity = 1 + this.frequencyData.bass * 2;
        this.screen.material.opacity = 0.3 + this.frequencyData.mid * 0.3;

        // Subtle screen flicker
        this.screen.material.opacity *= 0.95 + Math.random() * 0.05;

        // Grid brightness based on audio
        this.gridLines.forEach(line => {
            line.material.opacity = 0.3 + this.frequencyData.high * 0.2;
        });
    }

    updateNormalMode() {
        const positions = this.waveformLine.geometry.attributes.position;
        const screenWidth = 56;
        const screenHeight = 32;
        
        for (let i = 0; i < this.waveformPoints; i++) {
            // Horizontal sweep (time on X axis, amplitude on Y axis)
            const x = (i / this.waveformPoints - 0.5) * screenWidth;
            const y = this.waveformData[i];
            const z = 0;
            
            positions.setXYZ(i, x, y, z);
        }
        positions.needsUpdate = true;

        // Beam intensity based on signal
        const intensity = Math.abs(this.waveformData[0]) / 10;
        this.waveformLine.material.opacity = 0.9 + intensity;
    }

    createTrail() {
        // Clone current waveform for phosphor trail effect
        const positions = this.waveformLine.geometry.attributes.position;
        const points = [];
        
        for (let i = 0; i < this.waveformPoints; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            points.push(new THREE.Vector3(x, y, z));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.4
        });
        
        const trail = new THREE.Line(geometry, material);
        trail.position.z = -0.05;
        this.scene.add(trail);
        
        this.trails.push(trail);
        
        // Remove old trails (phosphor persistence)
        if (this.trails.length > this.maxTrails) {
            const old = this.trails.shift();
            this.scene.remove(old);
            old.geometry.dispose();
            old.material.dispose();
        }
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Trigger sweep on beat
        this.waveformLine.material.opacity = 1.0;
        
        // Flash the screen
        this.screen.material.opacity = 0.6 + intensity * 0.4;
        
        // Bright glow
        this.glowLight.intensity = 2 + intensity * 3;
    }

    dispose() {
        this.scene.remove(this.waveformLine);
        this.waveformLine.geometry.dispose();
        this.waveformLine.material.dispose();
        
        this.scene.remove(this.frame);
        this.frame.geometry.dispose();
        this.frame.material.dispose();
        
        this.scene.remove(this.screen);
        this.screen.geometry.dispose();
        this.screen.material.dispose();
        
        this.gridLines.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        
        this.trails.forEach(trail => {
            this.scene.remove(trail);
            trail.geometry.dispose();
            trail.material.dispose();
        });
        
        this.scene.remove(this.glowLight);
    }
};
