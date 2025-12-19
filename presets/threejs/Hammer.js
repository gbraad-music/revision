// Hammer - Beat-reactive hammer that zooms on TRIM peaks
window.HammerPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Hammer');

        // Create hammer
        this.createHammer();

        // Add lighting for hammer visibility
        const ambient = new THREE.AmbientLight(0x404040, 0.8);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.6);
        directional.position.set(5, 10, 10);
        this.scene.add(directional);

        this.camera.position.set(0, 0, 50);
        this.camera.lookAt(0, 0, 0);

        // Hammer animation state
        this.hammerRotation = 0;
        this.hammerZoom = 0;
        this.baseScale = 2; // Base size multiplier
    }

    createHammer() {
        // Hammer group - pivot point is where the hand grips (lower part of handle)
        this.hammer = new THREE.Group();

        // Hammer handle (vertical cylinder, 20 units tall)
        // Pivot at y=0, which is about 1/4 up from the bottom (where hand grips)
        const handleGeo = new THREE.CylinderGeometry(0.8, 1.0, 20, 16);
        const handleMat = new THREE.MeshPhongMaterial({
            color: 0x8B4513,
            shininess: 10,
            specular: 0x442211
        });
        this.hammerHandle = new THREE.Mesh(handleGeo, handleMat);
        this.hammerHandle.position.y = 5; // Center at 5, so bottom at -5, top at 15
        this.hammer.add(this.hammerHandle);

        // Hammer head (box) - width 8 for side profile, depth 5, height 5
        // Position at top of handle
        const headGeo = new THREE.BoxGeometry(8, 5, 5);
        const headMat = new THREE.MeshPhongMaterial({
            color: 0x666666,
            shininess: 30,
            specular: 0x888888
        });
        this.hammerHead = new THREE.Mesh(headGeo, headMat);
        this.hammerHead.position.y = 17.5; // Top of handle (15) + half head height (2.5)
        this.hammer.add(this.hammerHead);

        // Hammer metal band (ring around head) - rotated to fit horizontal head
        const bandGeo = new THREE.TorusGeometry(3.2, 0.3, 12, 24);
        const bandMat = new THREE.MeshPhongMaterial({
            color: 0x333333,
            shininess: 50,
            specular: 0x555555
        });
        this.hammerBand = new THREE.Mesh(bandGeo, bandMat);
        this.hammerBand.position.y = 17.5;
        this.hammerBand.rotation.z = Math.PI / 2;
        this.hammer.add(this.hammerBand);

        // Position hammer group - pivot point (y=0 in group) is the grip point
        this.hammer.position.set(0, -15, 0);
        this.scene.add(this.hammer);

        // Add point light to hammer for dramatic effect
        this.hammerLight = new THREE.PointLight(0xCF1A37, 0, 20);
        this.hammer.add(this.hammerLight);
        this.hammerLight.position.set(0, 2.5, 3);

        // Add spot light from hammer for extra drama
        this.hammerSpot = new THREE.SpotLight(0xCF1A37, 0, 50, Math.PI / 4, 0.5);
        this.hammerSpot.position.set(0, 2.5, 5);
        this.hammerSpot.target.position.set(0, -20, 0);
        this.hammer.add(this.hammerSpot);
        this.hammer.add(this.hammerSpot.target);
    }

    update(deltaTime) {
        super.update(deltaTime);

        if (!this.hammer) return;

        // Get TRIM peak level (0-1 range, > 0.5 means clipping)
        const trimPeak = this.trimPeakLevel || 0;

        // Hammer rotation decay (springs back to vertical)
        this.hammerRotation *= 0.85;

        // Hammer zoom animation based on TRIM peak
        if (trimPeak > 0.5) {
            // Strong TRIM peak - zoom hammer (make it bigger)
            const zoomAmount = (trimPeak - 0.5) * 2; // 0-1 range
            this.hammerZoom = Math.max(this.hammerZoom, zoomAmount * 50);

            // Light up the hammer
            if (this.hammerLight) {
                this.hammerLight.intensity = zoomAmount * 5;
            }
            if (this.hammerSpot) {
                this.hammerSpot.intensity = zoomAmount * 3;
            }
        }

        // Zoom decay with bounce-back spring
        this.hammerZoom *= 0.88;

        // Light intensity decay
        if (this.hammerLight) {
            this.hammerLight.intensity *= 0.92;
        }
        if (this.hammerSpot) {
            this.hammerSpot.intensity *= 0.92;
        }

        // Apply rotation around Z axis (swings in XY plane - side view)
        this.hammer.rotation.z = this.hammerRotation;

        // Apply zoom (scale up on TRIM peak) - multiply base scale by zoom factor
        const scale = this.baseScale * (1 + this.hammerZoom * 0.02);
        this.hammer.scale.set(scale, scale, scale);
    }

    onBeat(intensity) {
        // Hammer swings down on beat
        if (this.hammer) {
            // Rotate downward (positive X rotation)
            this.hammerRotation = Math.PI / 5 * intensity; // Max 36° swing
        }
    }

    dispose() {
        // Clean up hammer
        if (this.hammer) {
            if (this.hammerHandle) {
                this.hammerHandle.geometry.dispose();
                this.hammerHandle.material.dispose();
            }
            if (this.hammerHead) {
                this.hammerHead.geometry.dispose();
                this.hammerHead.material.dispose();
            }
            if (this.hammerBand) {
                this.hammerBand.geometry.dispose();
                this.hammerBand.material.dispose();
            }
            this.scene.remove(this.hammer);
            this.hammer = null;
        }
    }
};
