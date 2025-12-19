// VUMeter - Screen-filling stereo VU meter with arc needles
window.VUMetersPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing VU Meter');

        // VU meter smoothing and decay
        this.VU_SMOOTHING = 0.7;
        this.VU_DECAY_RATE = 0.95;
        this.vuLeftSmoothed = 0;
        this.vuRightSmoothed = 0;
        this.vuLeftPeak = 0;
        this.vuRightPeak = 0;

        // Screen dimensions
        this.screenWidth = 80;
        this.screenHeight = 45;

        // No background - pure black from scene background

        // Meter parameters
        this.pivotY = 0; // Center vertically
        this.arcRadius = Math.min(this.screenWidth * 0.35, this.screenHeight * 0.6);
        this.needleLength = this.arcRadius * 0.85;

        // Left meter pivot (left side of screen)
        this.leftPivotX = -this.screenWidth * 0.35;

        // Right meter pivot (right side of screen)
        this.rightPivotX = this.screenWidth * 0.35;

        // Create meter arcs and scales
        this.createMeterArcs();

        // Create needles
        this.createNeedles();

        // Add subtle lighting
        const ambient = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambient);

        this.camera.position.set(0, 0, 50);
        this.camera.lookAt(0, 0, 0);

        // Audio data buffers
        this.leftTimeData = null;
        this.rightTimeData = null;
    }

    createMeterArcs() {
        // LEFT ARC - from -90° (bottom) to +90° (top) counterclockwise
        const leftArcPoints = [];
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
            const angle = -Math.PI / 2 + (Math.PI * i / segments);
            const x = this.leftPivotX + this.arcRadius * Math.cos(angle);
            const y = this.pivotY + this.arcRadius * Math.sin(angle);
            leftArcPoints.push(new THREE.Vector3(x, y, 0));
        }
        const leftArcGeo = new THREE.BufferGeometry().setFromPoints(leftArcPoints);
        const arcMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 3 });
        this.leftArc = new THREE.Line(leftArcGeo, arcMat);
        this.scene.add(this.leftArc);

        // LEFT SCALE MARKS
        this.leftScaleMarks = [];
        for (let i = 0; i <= 10; i++) {
            const angle = -Math.PI / 2 + (Math.PI * i / 10);
            const x1 = this.leftPivotX + this.arcRadius * Math.cos(angle);
            const y1 = this.pivotY + this.arcRadius * Math.sin(angle);
            const x2 = this.leftPivotX + (this.arcRadius - 2) * Math.cos(angle);
            const y2 = this.pivotY + (this.arcRadius - 2) * Math.sin(angle);

            // Red zone for top ticks (last 20%)
            const color = i >= 8 ? 0xCF1A37 : 0x666666;
            const markMat = new THREE.LineBasicMaterial({ color: color, linewidth: 1.5 });
            const markGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x1, y1, 0),
                new THREE.Vector3(x2, y2, 0)
            ]);
            const mark = new THREE.Line(markGeo, markMat);
            this.scene.add(mark);
            this.leftScaleMarks.push(mark);
        }

        // LEFT PIVOT POINT
        const pivotGeo = new THREE.CircleGeometry(0.6, 16);
        const pivotMat = new THREE.MeshBasicMaterial({ color: 0x666666 });
        this.leftPivot = new THREE.Mesh(pivotGeo, pivotMat);
        this.leftPivot.position.set(this.leftPivotX, this.pivotY, 0.1);
        this.scene.add(this.leftPivot);

        // RIGHT ARC - from -90° (bottom) to -270° (top) clockwise
        const rightArcPoints = [];
        for (let i = 0; i <= segments; i++) {
            const angle = -Math.PI / 2 - (Math.PI * i / segments);
            const x = this.rightPivotX + this.arcRadius * Math.cos(angle);
            const y = this.pivotY + this.arcRadius * Math.sin(angle);
            rightArcPoints.push(new THREE.Vector3(x, y, 0));
        }
        const rightArcGeo = new THREE.BufferGeometry().setFromPoints(rightArcPoints);
        this.rightArc = new THREE.Line(rightArcGeo, arcMat.clone());
        this.scene.add(this.rightArc);

        // RIGHT SCALE MARKS
        this.rightScaleMarks = [];
        for (let i = 0; i <= 10; i++) {
            const angle = -Math.PI / 2 - (Math.PI * i / 10);
            const x1 = this.rightPivotX + this.arcRadius * Math.cos(angle);
            const y1 = this.pivotY + this.arcRadius * Math.sin(angle);
            const x2 = this.rightPivotX + (this.arcRadius - 2) * Math.cos(angle);
            const y2 = this.pivotY + (this.arcRadius - 2) * Math.sin(angle);

            // Red zone for top ticks (last 20%)
            const color = i >= 8 ? 0xCF1A37 : 0x666666;
            const markMat = new THREE.LineBasicMaterial({ color: color, linewidth: 1.5 });
            const markGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x1, y1, 0),
                new THREE.Vector3(x2, y2, 0)
            ]);
            const mark = new THREE.Line(markGeo, markMat);
            this.scene.add(mark);
            this.rightScaleMarks.push(mark);
        }

        // RIGHT PIVOT POINT
        this.rightPivot = new THREE.Mesh(pivotGeo.clone(), pivotMat.clone());
        this.rightPivot.position.set(this.rightPivotX, this.pivotY, 0.1);
        this.scene.add(this.rightPivot);
    }

    createNeedles() {
        // LEFT NEEDLE
        const needleMat = new THREE.LineBasicMaterial({ color: 0xCF1A37, linewidth: 2 });
        const leftNeedleGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0.2),
            new THREE.Vector3(this.needleLength, 0, 0.2)
        ]);
        this.leftNeedle = new THREE.Line(leftNeedleGeo, needleMat);
        this.leftNeedle.position.set(this.leftPivotX, this.pivotY, 0);
        this.scene.add(this.leftNeedle);

        // LEFT NEEDLE TIP
        const tipGeo = new THREE.CircleGeometry(0.3, 8);
        const tipMat = new THREE.MeshBasicMaterial({ color: 0xCF1A37 });
        this.leftNeedleTip = new THREE.Mesh(tipGeo, tipMat);
        this.leftNeedleTip.position.set(this.leftPivotX + this.needleLength, this.pivotY, 0.2);
        this.scene.add(this.leftNeedleTip);

        // RIGHT NEEDLE
        const rightNeedleGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0.2),
            new THREE.Vector3(this.needleLength, 0, 0.2)
        ]);
        this.rightNeedle = new THREE.Line(rightNeedleGeo, needleMat.clone());
        this.rightNeedle.position.set(this.rightPivotX, this.pivotY, 0);
        this.scene.add(this.rightNeedle);

        // RIGHT NEEDLE TIP
        this.rightNeedleTip = new THREE.Mesh(tipGeo.clone(), tipMat.clone());
        this.rightNeedleTip.position.set(this.rightPivotX + this.needleLength, this.pivotY, 0.2);
        this.scene.add(this.rightNeedleTip);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Get stereo peak data
        let leftPeak = 0;
        let rightPeak = 0;

        if (this.audioAnalyserLeft && this.audioAnalyserRight) {
            // Get time domain data for peak calculation
            const bufferLength = this.audioAnalyserLeft.fftSize;

            if (!this.leftTimeData || this.leftTimeData.length !== bufferLength) {
                this.leftTimeData = new Uint8Array(bufferLength);
                this.rightTimeData = new Uint8Array(bufferLength);
            }

            this.audioAnalyserLeft.getByteTimeDomainData(this.leftTimeData);
            this.audioAnalyserRight.getByteTimeDomainData(this.rightTimeData);

            // Calculate peaks (convert from 0-255 byte range to -1 to +1 float range)
            for (let i = 0; i < bufferLength; i++) {
                const leftSample = Math.abs((this.leftTimeData[i] - 128) / 128);
                const rightSample = Math.abs((this.rightTimeData[i] - 128) / 128);
                leftPeak = Math.max(leftPeak, leftSample);
                rightPeak = Math.max(rightPeak, rightSample);
            }
        } else {
            // Fallback: demo mode with sine waves
            leftPeak = Math.abs(Math.sin(this.time * 2)) * 0.8;
            rightPeak = Math.abs(Math.sin(this.time * 3 + 0.5)) * 0.7;
        }

        // Convert to dB and map to needle position
        const peakToDb = (peak) => {
            if (peak < 0.00001) return -100;
            return 20 * Math.log10(peak);
        };

        const dbToNeedle = (db) => {
            // Map -20dB to 0.0 (bottom), 0dBFS to 1.0 (top/RED)
            return Math.max(0, Math.min(1, (db + 20) / 20));
        };

        const leftDb = peakToDb(leftPeak);
        const rightDb = peakToDb(rightPeak);
        const leftNeedle = dbToNeedle(leftDb);
        const rightNeedle = dbToNeedle(rightDb);

        // Apply exponential smoothing
        this.vuLeftSmoothed = this.vuLeftSmoothed * this.VU_SMOOTHING + leftNeedle * (1 - this.VU_SMOOTHING);
        this.vuRightSmoothed = this.vuRightSmoothed * this.VU_SMOOTHING + rightNeedle * (1 - this.VU_SMOOTHING);

        // Peak hold with decay
        this.vuLeftPeak = Math.max(this.vuLeftSmoothed, this.vuLeftPeak * this.VU_DECAY_RATE);
        this.vuRightPeak = Math.max(this.vuRightSmoothed, this.vuRightPeak * this.VU_DECAY_RATE);

        // Update LEFT needle rotation
        // Rests at -90° (bottom), swings toward +90° (top)
        const leftAngle = -Math.PI / 2 + this.vuLeftPeak * Math.PI;
        this.leftNeedle.rotation.z = leftAngle;

        // Update left needle tip position
        const leftTipX = this.leftPivotX + this.needleLength * Math.cos(leftAngle);
        const leftTipY = this.pivotY + this.needleLength * Math.sin(leftAngle);
        this.leftNeedleTip.position.set(leftTipX, leftTipY, 0.2);

        // Update RIGHT needle rotation
        // Rests at -90° (bottom), swings toward -270° (top)
        const rightAngle = -Math.PI / 2 - this.vuRightPeak * Math.PI;
        this.rightNeedle.rotation.z = rightAngle;

        // Update right needle tip position
        const rightTipX = this.rightPivotX + this.needleLength * Math.cos(rightAngle);
        const rightTipY = this.pivotY + this.needleLength * Math.sin(rightAngle);
        this.rightNeedleTip.position.set(rightTipX, rightTipY, 0.2);
    }

    onBeat(intensity) {
        // Pulse needle tips on beat
        if (this.leftNeedleTip && this.leftNeedleTip.material) {
            const brightness = 0xCF1A37 + Math.floor(intensity * 0x202020);
            this.leftNeedleTip.material.color.setHex(brightness);
            this.rightNeedleTip.material.color.setHex(brightness);
        }
    }

    dispose() {
        // Clean up all objects
        if (this.leftArc) {
            this.scene.remove(this.leftArc);
            this.leftArc.geometry.dispose();
            this.leftArc.material.dispose();
        }

        if (this.rightArc) {
            this.scene.remove(this.rightArc);
            this.rightArc.geometry.dispose();
            this.rightArc.material.dispose();
        }

        this.leftScaleMarks?.forEach(mark => {
            this.scene.remove(mark);
            mark.geometry.dispose();
            mark.material.dispose();
        });

        this.rightScaleMarks?.forEach(mark => {
            this.scene.remove(mark);
            mark.geometry.dispose();
            mark.material.dispose();
        });

        if (this.leftPivot) {
            this.scene.remove(this.leftPivot);
            this.leftPivot.geometry.dispose();
            this.leftPivot.material.dispose();
        }

        if (this.rightPivot) {
            this.scene.remove(this.rightPivot);
            this.rightPivot.geometry.dispose();
            this.rightPivot.material.dispose();
        }

        if (this.leftNeedle) {
            this.scene.remove(this.leftNeedle);
            this.leftNeedle.geometry.dispose();
            this.leftNeedle.material.dispose();
        }

        if (this.leftNeedleTip) {
            this.scene.remove(this.leftNeedleTip);
            this.leftNeedleTip.geometry.dispose();
            this.leftNeedleTip.material.dispose();
        }

        if (this.rightNeedle) {
            this.scene.remove(this.rightNeedle);
            this.rightNeedle.geometry.dispose();
            this.rightNeedle.material.dispose();
        }

        if (this.rightNeedleTip) {
            this.scene.remove(this.rightNeedleTip);
            this.rightNeedleTip.geometry.dispose();
            this.rightNeedleTip.material.dispose();
        }
    }
};
