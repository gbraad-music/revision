// SpectrumScope - Frequency spectrum analyzer (new preset)
window.SpectrumScopePreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Spectrum Scope');
        this.barCount = 64;
        this.bars = [];
        const width = 64;
        const height = 36;
        this.screenWidth = width;
        this.screenHeight = height;

        const frameGeo = new THREE.BoxGeometry(width + 4, height + 4, 0.5);
        const frameMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 30 });
        this.frame = new THREE.Mesh(frameGeo, frameMat);
        this.frame.position.z = -1;
        this.scene.add(this.frame);

        const screenGeo = new THREE.PlaneGeometry(width, height);
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x001100, transparent: true, opacity: 0.3 });
        this.screen = new THREE.Mesh(screenGeo, screenMat);
        this.screen.position.z = -0.5;
        this.scene.add(this.screen);

        const gridMat = new THREE.LineBasicMaterial({ color: 0x003300, transparent: true, opacity: 0.3 });
        this.gridLines = [];
        for (let y = -height/2; y <= height/2; y += 6) {
            const pts = [new THREE.Vector3(-width/2, y, 0), new THREE.Vector3(width/2, y, 0)];
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geo, gridMat);
            this.scene.add(line);
            this.gridLines.push(line);
        }

        this.waveformPoints = 512;
        const points = [];
        for (let i = 0; i < this.waveformPoints; i++) {
            const x = -width/2 + (i / (this.waveformPoints - 1)) * width;
            points.push(new THREE.Vector3(x, -height/2, 0));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        this.spectrumLine = new THREE.Line(geometry, material);
        this.scene.add(this.spectrumLine);
        this.spectrumLine.material.depthWrite = false;
        // Phosphor trails and glow
        this.trails = [];
        this.maxTrails = 6;
        this.glowLight = new THREE.PointLight(0xffffff, 0.6, 50);
        this.glowLight.position.set(0, 0, 5);
        this.scene.add(this.glowLight);

        this.addBasicLighting();
        this.camera.position.set(0, 0, 18);
        this.camera.lookAt(0, 0, 0);
        this.freqData = null;
    }

    update(deltaTime) {
        super.update(deltaTime);
        let bufferLength = 0;
        if (this.audioAnalyser) {
            bufferLength = this.audioAnalyser.frequencyBinCount;
            if (!this.freqData || this.freqData.length !== bufferLength) {
                this.freqData = new Uint8Array(bufferLength);
            }
            this.audioAnalyser.getByteFrequencyData(this.freqData);
        } else {
            if (!this.freqData) this.freqData = new Uint8Array(1024);
            for (let i = 0; i < this.freqData.length; i++) {
                this.freqData[i] = Math.floor(128 + 127 * Math.abs(Math.sin(this.time * 2 + i * 0.05)));
            }
            bufferLength = this.freqData.length;
        }

        if (!bufferLength || bufferLength <= 0 || !this.spectrumLine || !this.spectrumLine.geometry || !this.spectrumLine.geometry.attributes.position) {
            return;
        }
        const positions = this.spectrumLine.geometry.attributes.position;
        const n = Math.min(this.waveformPoints, positions.count);
        const w = this.screenWidth || 64;
        const h = this.screenHeight || 36;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1 || 1);
            const idx = Math.min(bufferLength - 1, Math.max(0, Math.floor(Math.pow(t, 2.0) * (bufferLength - 1))));
            const v = this.freqData[idx] || 0;
            const amp = (v / 255) * (h - 2); // leave a small top margin
            const x = -w/2 + t * w;
            const y = -h/2 + amp;
            positions.setXYZ(i, x, y, 0);
        }
        positions.needsUpdate = true;

        // Create a trail snapshot (~30 FPS)
        if (this.time % 0.033 < deltaTime) {
            this.createTrail();
        }

        // Fade trail opacities (older = dimmer)
        const len = this.trails.length;
        for (let i = 0; i < len; i++) {
            const age = (i + 1) / len;
            const t = Math.max(0, 1 - age);
            this.trails[i].material.opacity = 0.12 * t;
        }

        // Simple energy-based glow
        if (this.glowLight && this.freqData) {
            const sampleBins = Math.min(64, bufferLength);
            let energy = 0;
            for (let i = 0; i < sampleBins; i++) energy += this.freqData[i];
            energy = energy / (sampleBins * 255);
            this.glowLight.intensity = 0.6 + energy * 0.8;
            if (this.screen && this.screen.material) {
                const base = 0.28 + energy * 0.15;
                this.screen.material.opacity = base * (0.98 + Math.random() * 0.04);
            }
        }
    }

    onBeat(intensity) {
        if (this.screen && this.screen.material) {
            this.screen.material.opacity = 0.3 + intensity * 0.2;
        }
    }

    createTrail() {
        if (!this.spectrumLine) return;
        const trailGeo = this.spectrumLine.geometry.clone();
        const trailMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const trail = new THREE.Line(trailGeo, trailMat);
        this.scene.add(trail);
        this.trails.unshift(trail);
        while (this.trails.length > this.maxTrails) {
            const old = this.trails.pop();
            this.scene.remove(old);
            old.geometry.dispose();
            old.material.dispose();
        }
    }

    dispose() {
        if (this.spectrumLine) {
            this.scene.remove(this.spectrumLine);
            this.spectrumLine.geometry.dispose();
            this.spectrumLine.material.dispose();
        }
        // Dispose trails
        if (this.trails) {
            this.trails.forEach(trail => {
                this.scene.remove(trail);
                trail.geometry.dispose();
                trail.material.dispose();
            });
            this.trails = [];
        }
        // Remove glow light
        if (this.glowLight) {
            this.scene.remove(this.glowLight);
            // Lights have no dispose(), GC will collect
            this.glowLight = null;
        }
        this.gridLines.forEach(line => { this.scene.remove(line); line.geometry.dispose(); line.material.dispose(); });
        this.scene.remove(this.frame); this.frame.geometry.dispose(); this.frame.material.dispose();
        this.scene.remove(this.screen); this.screen.geometry.dispose(); this.screen.material.dispose();
    }
};