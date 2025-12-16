// XYScope - Dedicated XY oscilloscope for oscilloscope music and Lissajous patterns
window.XYScopePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing XY Oscilloscope');

        this.waveformPoints = 2048; // More points for smoother shapes
        
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

        // Create grid
        this.createGrid();

        // Create XY waveform line - using points for smoother rendering
        const points = [];
        for (let i = 0; i < this.waveformPoints; i++) {
            points.push(new THREE.Vector3(0, 0, 0));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Use LineBasicMaterial for clean, sharp cyan lines
        const material = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Cyan neon
            transparent: true,
            opacity: 0.12, // lower cap
            blending: THREE.NormalBlending,
            depthWrite: false,
            depthTest: true
        });

        this.xyLine = new THREE.Line(geometry, material);
        this.scene.add(this.xyLine);

        // Phosphor trails
        this.trails = [];
        this.maxTrails = 4; // A few trails to build up the phosphor glow

        // CRT glow effect - cyan
        const glowLight = new THREE.PointLight(0x00ffff, 1, 50);
        glowLight.position.set(0, 0, 5);
        this.scene.add(glowLight);
        this.glowLight = glowLight;

        // Ambient lighting for frame
        this.addBasicLighting();

        this.camera.position.set(0, 0, 25);
        this.camera.lookAt(0, 0, 0);
    }

    createGrid() {
        this.gridLines = [];
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x003300,
            transparent: true,
            opacity: 0.3
        });

        // Horizontal and vertical lines
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

        const positions = this.xyLine.geometry.attributes.position;
        
        // Check if we have STEREO analysers (for true oscilloscope music)
        if (this.audioAnalyserLeft && this.audioAnalyserRight) {
            const bufferLength = this.audioAnalyserLeft.fftSize;
            const leftData = new Uint8Array(bufferLength);
            const rightData = new Uint8Array(bufferLength);
            
            this.audioAnalyserLeft.getByteTimeDomainData(leftData);
            this.audioAnalyserRight.getByteTimeDomainData(rightData);
            
            // Debug logging removed for performance
            
            // TRUE stereo XY mode:
            // X = Left channel, Y = Right channel
            // Use CONSECUTIVE samples from the MOST RECENT part of the buffer
            // This is critical for oscilloscope music timing
            const startOffset = Math.max(0, bufferLength - this.waveformPoints);
            
            for (let i = 0; i < this.waveformPoints; i++) {
                const sampleIndex = startOffset + i;
                
                if (sampleIndex < bufferLength) {
                    const x = ((leftData[sampleIndex] - 128) / 128.0) * 24; // 3x scale
                    const y = ((rightData[sampleIndex] - 128) / 128.0) * 24; // 3x scale
                    
                    positions.setXYZ(i, x, y, 0);
                } else {
                    positions.setXYZ(i, 0, 0, 0);
                }
            }
        } else if (this.audioAnalyser) {
            // CRITICAL: For oscilloscope music, we need STEREO data
            // The analyser gives us mono - we need to sample at different offsets
            // to simulate stereo L/R channels
            const bufferLength = this.audioAnalyser.fftSize;
            const timeDomainData = new Uint8Array(bufferLength);
            this.audioAnalyser.getByteTimeDomainData(timeDomainData);
            
            // Debug logging
            const now = performance.now();
            if (now - this.lastDebugLog > 2000) {
                const min = Math.min(...timeDomainData);
                const max = Math.max(...timeDomainData);
                const variance = max - min;
                console.log('[XYScope] Audio active:', variance > 1 ? 'YES' : 'NO', 
                    'Variance:', variance, 'Points:', this.waveformPoints);
                
                // Sample middle of buffer to check pattern
                const midX = timeDomainData[bufferLength / 2];
                const midY = timeDomainData[bufferLength / 2 + 1];
                console.log('[XYScope] Mid sample - X:', midX, 'Y:', midY, 'Diff:', Math.abs(midX - midY));
                this.lastDebugLog = now;
            }
            
            // For stereo oscilloscope music:
            // Interleaved samples: L, R, L, R, L, R...
            // X = L channel (even indices)
            // Y = R channel (odd indices)
            for (let i = 0; i < this.waveformPoints; i++) {
                // Map across the entire buffer
                const bufferPos = Math.floor((i / this.waveformPoints) * (bufferLength / 2)) * 2;
                
                if (bufferPos + 1 < bufferLength) {
                    // X from even samples (left channel)
                    // Y from odd samples (right channel)
                    const x = ((timeDomainData[bufferPos] - 128) / 128.0) * 24; // 3x scale
                    const y = ((timeDomainData[bufferPos + 1] - 128) / 128.0) * 24; // 3x scale
                    
                    positions.setXYZ(i, x, y, 0);
                } else {
                    positions.setXYZ(i, 0, 0, 0);
                }
            }
        } else {
            // Fallback: beautiful Lissajous patterns
            for (let i = 0; i < this.waveformPoints; i++) {
                const t = this.time;
                const phase = (i / this.waveformPoints) * Math.PI * 2;
                
                // Create classic Lissajous figure
                const x = Math.sin(3 * phase + t * 0.5) * 7;
                const y = Math.sin(4 * phase + t * 0.7) * 7;
                
                positions.setXYZ(i, x, y, 0);
            }
        }
        
        positions.needsUpdate = true;

        // Dynamic beam brightness based on last segment length
        const tip = this.waveformPoints - 1;
        const prev = Math.max(0, tip - 1);
        const px = positions.getX(prev), py = positions.getY(prev);
        const tx = positions.getX(tip), ty = positions.getY(tip);
        const segLen = Math.hypot(tx - px, ty - py);
        // Longer jump -> dimmer beam; short movement -> bright
        // Much stronger dimming on long segments
        // Aggressive dim on long segments
        // Extremely aggressive dimming: velocity-based
        const vel = segLen; // screen units per frame
        const beamFactor = Math.min(0.12, Math.max(0.01, Math.pow(1 / (1 + vel), 6)));
        this.xyLine.material.opacity = beamFactor;
        this.xyLine.material.transparent = true;
        this.xyLine.material.blending = THREE.NormalBlending;
        this.xyLine.material.depthWrite = false;
        this.xyLine.material.needsUpdate = true;

        // Create phosphor trails - fast refresh for smooth effect
        if (this.time % 0.016 < deltaTime) { // ~60fps - fast trail creation
            this.createTrail();
        }

        // Fade trails based on how FAR they traveled (line segment length)
        if (this.trails.length > 0) {
            this.trails.forEach((trail, i) => {
                const age = i / Math.max(1, this.trails.length); // 0 = oldest, 1 = newest
                
                // Calculate total path length of this trail
                const trailPos = trail.geometry.attributes.position;
                let totalLength = 0;
                
                for (let j = 1; j < this.waveformPoints; j++) {
                    const x1 = trailPos.getX(j - 1);
                    const y1 = trailPos.getY(j - 1);
                    const x2 = trailPos.getX(j);
                    const y2 = trailPos.getY(j);
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    totalLength += Math.sqrt(dx * dx + dy * dy);
                }
                
                // VERY aggressive fade for long lines - especially new ones
                // Short tight loops = visible, long fast movements = nearly invisible
                const maxLength = 30; // Even lower threshold
                const lengthRatio = totalLength / maxLength;
                const lengthFactor = Math.max(0.005, Math.pow(1 / (1 + lengthRatio), 4)); // Power of 4 for steeper decay
                const ageFactor = Math.pow(age, 2); // Much steeper age curve - only newest get bright
                
                const finalOpacity = 0.3 * ageFactor * lengthFactor;
                trail.material.opacity = finalOpacity;
                trail.material.transparent = true; // Ensure transparency is enabled
                trail.material.needsUpdate = true; // Force material update
            });
        }

        // CRT glow - constant, no beat reactivity
        this.glowLight.intensity = 1.5;
        this.screen.material.opacity = 0.3;

        // Subtle screen flicker only
        this.screen.material.opacity *= 0.98 + Math.random() * 0.02;

        // Grid brightness - constant, no audio reactivity
        this.gridLines.forEach(line => {
            line.material.opacity = 0.3;
        });
    }

    createTrail() {
        const positions = this.xyLine.geometry.attributes.position;
        const points = [];
        
        for (let i = 0; i < this.waveformPoints; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            points.push(new THREE.Vector3(x, y, z - 0.05));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Use cyan neon line - start almost invisible
        const material = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Cyan/aqua neon color
            transparent: true,
            opacity: 0.01, // Start almost invisible
            depthWrite: false // Ensure proper transparency rendering
        });
        
        const trail = new THREE.Line(geometry, material);
        trail.position.z = -0.01; // avoid z-fighting with main beam
        // Ensure proper blending for transparency
        trail.material.depthWrite = false;
        trail.material.depthTest = false;
        trail.material.transparent = true;
        this.scene.add(trail);
        
        this.trails.push(trail);
        
        // Remove old trails
        if (this.trails.length > this.maxTrails) {
            const old = this.trails.shift();
            this.scene.remove(old);
            old.geometry.dispose();
            old.material.dispose();
        }
    }

    onBeat(intensity) {
        // Don't react to beats in XY scope - causes noise/jitter
        // Oscilloscope music needs smooth, stable display
    }

    dispose() {
        // Remove main line
        this.scene.remove(this.xyLine);
        this.xyLine.geometry.dispose();
        this.xyLine.material.dispose();
        
        // CRITICAL: Remove all trails
        this.trails.forEach(trail => {
            this.scene.remove(trail);
            trail.geometry.dispose();
            trail.material.dispose();
        });
        this.trails = [];
        
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
        
        this.scene.remove(this.glowLight);
    }
};
