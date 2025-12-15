// Oscilloscope3D - Classic oscilloscope visualization
window.Oscilloscope3DPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing 3D Oscilloscope');

        this.waveformPoints = 512;
        this.waveformData = new Float32Array(this.waveformPoints);
        
        // Create CRT screen frame
        const frameGeometry = new THREE.BoxGeometry(32, 20, 0.5);
        const frameMaterial = new THREE.MeshPhongMaterial({
            color: 0x222222,
            shininess: 30
        });
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.z = -1;
        this.scene.add(this.frame);

        // Create screen glow plane
        const screenGeometry = new THREE.PlaneGeometry(30, 18);
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
            linewidth: 2,
            transparent: true,
            opacity: 0.9
        });

        this.waveformLine = new THREE.Line(geometry, material);
        this.scene.add(this.waveformLine);

        // Create XY mode waveform (Lissajous patterns)
        const xyPoints = [];
        for (let i = 0; i < this.waveformPoints; i++) {
            xyPoints.push(new THREE.Vector3(0, 0, 0));
        }

        const xyGeometry = new THREE.BufferGeometry().setFromPoints(xyPoints);
        const xyMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        this.xyLine = new THREE.Line(xyGeometry, xyMaterial);
        this.xyLine.position.z = 0.1;
        this.scene.add(this.xyLine);

        // Create persistence/afterglow trails
        this.trails = [];
        this.maxTrails = 8;

        // CRT glow effect
        const glowLight = new THREE.PointLight(0x00ff00, 1, 50);
        glowLight.position.set(0, 0, 5);
        this.scene.add(glowLight);
        this.glowLight = glowLight;

        // Ambient lighting for frame
        this.addBasicLighting();

        this.camera.position.set(0, 0, 25);
        this.camera.lookAt(0, 0, 0);

        this.mode = 'normal'; // 'normal' or 'xy'
        this.modeTimer = 0;
        this.modeSwitchInterval = 8; // Switch modes every 8 seconds
    }

    createGrid() {
        this.gridLines = [];
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x003300,
            transparent: true,
            opacity: 0.3
        });

        // Horizontal lines (like voltage divisions)
        for (let y = -8; y <= 8; y += 2) {
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
        for (let x = -14; x <= 14; x += 2) {
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

        // Mode switching
        this.modeTimer += deltaTime;
        if (this.modeTimer > this.modeSwitchInterval) {
            this.mode = this.mode === 'normal' ? 'xy' : 'normal';
            this.modeTimer = 0;
        }

        // Get real waveform data from audio analyser if available
        if (this.audioAnalyser) {
            // Get time domain data (actual waveform)
            const timeDomainData = new Uint8Array(this.audioAnalyser.fftSize);
            this.audioAnalyser.getByteTimeDomainData(timeDomainData);
            
            // Resample to our waveform points
            const step = Math.floor(timeDomainData.length / this.waveformPoints);
            for (let i = 0; i < this.waveformPoints; i++) {
                const index = i * step;
                // Convert from 0-255 to -1 to 1 range, then scale for display
                const normalized = (timeDomainData[index] - 128) / 128.0;
                this.waveformData[i] = normalized * 8; // Scale for visibility
            }
        } else {
            // Fallback: Generate synthetic waveform from audio frequencies
            for (let i = 0; i < this.waveformPoints; i++) {
                const t = this.time * 3;
                const phase = i / this.waveformPoints;
                
                // Combine multiple frequencies for complex waveform
                let signal = 0;
                signal += Math.sin(phase * Math.PI * 2 * 2 + t) * this.frequencyData.bass * 6;
                signal += Math.sin(phase * Math.PI * 2 * 5 + t * 1.3) * this.frequencyData.mid * 4;
                signal += Math.sin(phase * Math.PI * 2 * 13 + t * 1.7) * this.frequencyData.high * 2;
                
                this.waveformData[i] = signal;
            }
        }

        if (this.mode === 'normal') {
            // Normal oscilloscope mode - horizontal time sweep
            this.updateNormalMode();
            this.waveformLine.visible = true;
            this.xyLine.visible = false;
        } else {
            // XY mode - Lissajous figures
            this.updateXYMode();
            this.waveformLine.visible = false;
            this.xyLine.visible = true;
        }

        // Create persistence/afterglow effect
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
        const screenWidth = 28;
        const screenHeight = 16;
        
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

    updateXYMode() {
        const positions = this.xyLine.geometry.attributes.position;
        const screenWidth = 16;
        const screenHeight = 16;
        
        if (this.audioAnalyser) {
            // Use real waveform data for true Lissajous patterns
            const timeDomainData = new Uint8Array(this.audioAnalyser.fftSize);
            this.audioAnalyser.getByteTimeDomainData(timeDomainData);
            
            // For XY mode, we need two channels
            // Channel 1 (X): Use first half of waveform
            // Channel 2 (Y): Use second half with phase shift
            const halfSize = Math.floor(timeDomainData.length / 2);
            const step = Math.floor(halfSize / this.waveformPoints);
            
            for (let i = 0; i < this.waveformPoints; i++) {
                const index1 = i * step;
                const index2 = i * step + halfSize; // Phase shifted
                
                // Convert from 0-255 to -1 to 1, then scale
                const x = ((timeDomainData[index1] - 128) / 128.0) * 8;
                const y = ((timeDomainData[index2 % timeDomainData.length] - 128) / 128.0) * 8;
                const z = 0.1;
                
                positions.setXYZ(i, x, y, z);
            }
        } else {
            // Fallback: synthetic Lissajous patterns
            for (let i = 0; i < this.waveformPoints; i++) {
                const phase = i / this.waveformPoints;
                const t = this.time * 2;
                
                // Channel 1 (X)
                let x = Math.sin(phase * Math.PI * 2 * 3 + t) * this.frequencyData.bass * 6;
                x += Math.sin(phase * Math.PI * 2 * 7 + t * 1.2) * this.frequencyData.mid * 3;
                
                // Channel 2 (Y) - phase shifted
                let y = Math.sin(phase * Math.PI * 2 * 4 + t * 0.7) * this.frequencyData.mid * 6;
                y += Math.sin(phase * Math.PI * 2 * 9 + t * 1.5) * this.frequencyData.high * 3;
                
                const z = 0.1;
                
                positions.setXYZ(i, x, y, z);
            }
        }
        positions.needsUpdate = true;

        // Beam intensity
        this.xyLine.material.opacity = 0.8 + this.frequencyData.bass * 0.2;
    }

    createTrail() {
        // Clone current visible waveform
        const activeLine = this.mode === 'normal' ? this.waveformLine : this.xyLine;
        if (!activeLine.visible) return;

        const positions = activeLine.geometry.attributes.position;
        const points = [];
        
        for (let i = 0; i < this.waveformPoints; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            points.push(new THREE.Vector3(x, y, z));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: this.mode === 'normal' ? 0x00ff00 : 0x00ffff,
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
        const activeLine = this.mode === 'normal' ? this.waveformLine : this.xyLine;
        activeLine.material.opacity = 1.0;
        
        // Flash the screen
        this.screen.material.opacity = 0.6 + intensity * 0.4;
        
        // Bright glow
        this.glowLight.intensity = 2 + intensity * 3;
    }

    dispose() {
        this.scene.remove(this.waveformLine);
        this.waveformLine.geometry.dispose();
        this.waveformLine.material.dispose();
        
        this.scene.remove(this.xyLine);
        this.xyLine.geometry.dispose();
        this.xyLine.material.dispose();
        
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
