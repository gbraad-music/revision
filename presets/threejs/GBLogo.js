// GBLogo - Gerard Braad logo using pre-clipped SVG layers
class GBLogoPreset extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing GB Logo');

        this.addBasicLighting();

        this.logoGroup = new THREE.Group();
        this.scene.add(this.logoGroup);

        // Face layer (ring + G shadow that goes behind B) - from gb-logo-face.svg
        const faceSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 37 37">
  <defs>
    <linearGradient id="grad1" x1="272.15491" y1="714.11768" x2="208.30101" y2="700.55328" gradientTransform="matrix(0.07269753,0,0,0.07269753,-0.11056861,975.96863)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#000000;stop-opacity:1"/>
      <stop offset="1" style="stop-color:#000000;stop-opacity:0"/>
    </linearGradient>
  </defs>
  <g transform="translate(0,-1015.3622)">
    <circle r="18.282497" cy="1033.8622" cx="18.5" style="fill:#b3b3b3;fill-opacity:1;stroke:#000000;stroke-width:0.36348766"/>
    <circle transform="matrix(0.24232511,0,0,0.24232511,-4.6830709,826.69554)" r="59.621181" cy="854.91205" cx="95.669289" style="fill:#000000;fill-opacity:1;stroke:#000000;stroke-width:1.40049756"/>
    <path style="fill:url(#grad1);fill-opacity:1" d="m 21.277705,1029.0572 -2.502527,2.3428 c -0.523578,-0.9052 -1.171396,-1.5796 -1.943452,-2.0233 -0.772057,-0.4526 -1.57961,-0.6789 -2.42266,-0.6789 -0.212981,-3.6739 0,0 -0.212981,-3.6739 3.070477,0 5.431017,1.3444 7.08162,4.0333 z"/>
  </g>
</svg>`;

        // Letters layer (full G + B with proper interlocking) - from gb-logo-letters.svg
        const lettersSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 37 37">
  <defs>
    <linearGradient id="grad2" x1="272.15491" y1="714.11768" x2="208.30101" y2="700.55328" gradientTransform="matrix(0.07269753,0,0,0.07269753,-0.14581019,-39.50225)" gradientUnits="userSpaceOnUse">
      <stop offset="0" style="stop-color:#aa4444;stop-opacity:1"/>
      <stop offset="1" style="stop-color:#000000;stop-opacity:0"/>
    </linearGradient>
  </defs>
  <path style="fill:#0f93f9;fill-opacity:1" d="m 18.638585,1025.1912 h 5.098234 q 3.194716,0 4.366112,1.3311 1.171395,1.3312 1.171395,3.1149 0,1.1314 -0.425962,1.9168 -0.425962,0.7721 -1.371065,1.5707 1.810339,0.6257 2.555772,1.8503 0.758745,1.2113 0.758745,2.5957 0,2.4094 -1.650603,3.7538 -1.650603,1.3444 -4.645649,1.3444 h -5.856979 z m 3.767102,2.9418 v 3.8203 h 0.865236 q 0.958414,0 1.610669,-0.599 0.652254,-0.6123 0.652254,-1.5042 0,-0.7188 -0.638943,-1.2113 -0.638943,-0.5058 -1.597358,-0.5058 z m 0,6.7888 v 4.8053 h 1.357754 q 3.114848,0 3.114848,-2.2629 0,-1.2246 -0.758745,-1.8769 -0.758745,-0.6655 -2.169744,-0.6655 z" transform="translate(0,-1015.3622)"/>
  <path style="fill:#ff8c00;fill-opacity:1" d="m 14.238281,9.6719 c -2.404911,0 -4.465012,0.8652 -6.177734,2.5957 -1.703849,1.7304 -2.554688,3.8154 -2.554688,6.2558 0,2.5735 0.828804,4.7342 2.488282,6.4825 1.659477,1.7482 3.695589,2.623 6.109375,2.623 1.331131,0 2.650568,-0.3056 3.955078,-0.918 0.199542,-0.095 0.392371,-0.1989 0.580078,-0.3105 V 17.7656 H 14.34375 v 3.4082 h 4.140625 c -0.434837,1.0738 -1.011658,1.8049 -1.730469,2.1953 -0.709937,0.3905 -1.452553,0.586 -2.224609,0.586 -1.419874,0 -2.634825,-0.5183 -3.646485,-1.5567 -1.002785,-1.0471 -1.503906,-2.3205 -1.503906,-3.8203 0,-1.411 0.501121,-2.6355 1.503906,-3.6738 1.01166,-1.0383 2.201731,-1.5586 3.56836,-1.5586 0.84305,0 1.649818,0.2271 2.421875,0.6797 0.686859,0.3948 1.27543,0.9725 1.765625,1.7324 v -4.8789 c -1.254674,-0.8045 -2.720916,-1.207 -4.400391,-1.207 z m 8.167969,9.8886 V 20.25 c 0.0032,-0.0745 0.0039,-0.1489 0.0039,-0.2227 v -0.4668 z"/>
  <path style="fill:url(#grad2)" d="M 258.3923 787.64798 L 258.3923 906.39771 C 272.66556 897.8965 284.45467 885.91334 293.74856 870.42353 C 304.45051 852.46803 309.94068 835.6609 310.2177 820.02206 C 310.22506 819.60649 310.2177 819.20013 310.2177 818.7862 L 310.2177 812.44572 L 310.2177 787.64798 L 258.3923 787.64798 z" transform="matrix(0.07269753,0,0,0.07269753,-0.14581019,-39.50225)"/>
  <path style="fill:url(#grad2)" d="M 14.195312 1025.0243 L 14.408203 1028.6981 C 15.251253 1028.6981 16.059974 1028.9233 16.832031 1029.3759 C 17.538219 1029.7817 18.140386 1030.3808 18.638672 1031.1727 L 18.638672 1026.2587 C 17.374683 1025.4362 15.893516 1025.0243 14.195312 1025.0243 z" transform="translate(0,-1015.3622)"/>
</svg>`;

        this.loadLayer(faceSVG, -0.5, (plane) => {
            this.facePlane = plane;
        });

        this.loadLayer(lettersSVG, 0.1, (plane) => {
            this.lettersPlane = plane;
        });

        this.camera.position.z = 50;
        this.camera.lookAt(0, 0, 0);

        this.wobblePhase = 0;
        this.beatPush = 0;
        this.targetBeatPush = 0;
    }

    loadLayer(svgText, zPos, callback) {
        const canvas = document.createElement('canvas');
        const size = 2048;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size);

            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const geometry = new THREE.PlaneGeometry(15, 15);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
            });

            const plane = new THREE.Mesh(geometry, material);
            plane.position.z = zPos;
            this.logoGroup.add(plane);

            callback(plane);
            URL.revokeObjectURL(url);
        };

        img.src = url;
    }

    update(deltaTime) {
        super.update(deltaTime);

        if (!this.logoGroup) return;

        this.wobblePhase += deltaTime * 1.5;

        // Ring wobbles independently
        if (this.facePlane) {
            const ringAmount = 0.4 + Math.sin(this.wobblePhase * 0.3) * 0.3;
            this.facePlane.rotation.x = Math.sin(this.wobblePhase * 0.8) * ringAmount;
            this.facePlane.rotation.y = Math.cos(this.wobblePhase) * ringAmount;
            this.facePlane.rotation.z += deltaTime * 0.2;
        }

        // Letters wobble together
        if (this.lettersPlane) {
            const letterAmount = 0.6 + Math.sin(this.wobblePhase * 0.5) * 0.4;
            this.lettersPlane.rotation.x = Math.sin(this.wobblePhase) * letterAmount;
            this.lettersPlane.rotation.y = Math.cos(this.wobblePhase * 1.2) * letterAmount;
            this.lettersPlane.rotation.z = this.wobblePhase * 0.3;
        }

        // Beat push
        this.beatPush += (this.targetBeatPush - this.beatPush) * 0.15;
        this.targetBeatPush *= 0.92;

        const pushZ = this.beatPush * 5;
        if (this.lettersPlane) this.lettersPlane.position.z = 0.1 + pushZ;

        // Scale
        const scale = 1.0 + this.frequencyData.bass * 0.3 + this.beatPush * 0.2;
        if (this.lettersPlane) this.lettersPlane.scale.setScalar(scale);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        this.targetBeatPush = intensity * 1.5;
    }

    dispose() {
        if (this.logoGroup) {
            this.logoGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.scene.remove(this.logoGroup);
        }
        this.facePlane = null;
        this.lettersPlane = null;
    }
}

window.GBLogoPreset = GBLogoPreset;
