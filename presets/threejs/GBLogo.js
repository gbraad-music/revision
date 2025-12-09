// GBLogo - Gerard Braad logo using pre-clipped SVG layers
class GBLogoPreset extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing GB Logo');

        this.addBasicLighting();

        this.logoGroup = new THREE.Group();
        this.scene.add(this.logoGroup);

        // Create 3D ring geometry with actual hole (not SVG)
        // Scaled up: inner 13, outer 16
        const ringGeometry = new THREE.RingGeometry(18, 21, 64);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xb3b3b3,
            side: THREE.DoubleSide
        });
        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.ringMesh.position.z = -2.0;
        this.logoGroup.add(this.ringMesh);

        // Letters layer (full G + B with proper interlocking) - from gb-logo-letters.svg
        const lettersSVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="37"
   height="37"
   id="svg2"
   version="1.1"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg">
  <path
     id="path10"
     style="font-style:normal;font-weight:bold;font-size:27.2616px;line-height:125%;font-family:'Tw Cen MT';letter-spacing:0px;word-spacing:0px;fill:#0f93f9;fill-opacity:1;stroke:none;stroke-width:1px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1;font-variant:normal;font-stretch:normal;-inkscape-font-specification:'Tw Cen MT Bold'"
     d="m 18.638585,1025.1912 h 5.098234 q 3.194716,0 4.366112,1.3311 1.171395,1.3312 1.171395,3.1149 0,1.1314 -0.425962,1.9168 -0.425962,0.7721 -1.371065,1.5707 1.810339,0.6257 2.555772,1.8503 0.758745,1.2113 0.758745,2.5957 0,2.4094 -1.650603,3.7538 -1.650603,1.3444 -4.645649,1.3444 h -5.856979 z m 3.767102,2.9418 v 3.8203 h 0.865236 q 0.958414,0 1.610669,-0.599 0.652254,-0.6123 0.652254,-1.5042 0,-0.7188 -0.638943,-1.2113 -0.638943,-0.5058 -1.597358,-0.5058 z m 0,6.7888 v 4.8053 h 1.357754 q 3.114848,0 3.114848,-2.2629 0,-1.2246 -0.758745,-1.8769 -0.758745,-0.6655 -2.169744,-0.6655 z"
     transform="translate(0,-1015.3622)" />
  <path
     id="path4177"
     style="font-style:normal;font-variant:normal;font-weight:bold;font-stretch:normal;font-size:27.2616px;line-height:125%;font-family:'Tw Cen MT';-inkscape-font-specification:'Tw Cen MT Bold';letter-spacing:0px;word-spacing:0px;fill:#ff8c00;fill-opacity:1;stroke:none;stroke-width:1px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
     d="M 14.238281 1025.0341 C 11.83337 1025.0341 9.7732695 1025.8993 8.0605469 1027.6298 C 6.3566984 1029.3602 5.5058594 1031.4452 5.5058594 1033.8856 C 5.5058594 1036.4591 6.3346632 1038.6198 7.9941406 1040.3681 C 9.6536182 1042.1163 11.68973 1042.9911 14.103516 1042.9911 C 15.434647 1042.9911 16.754084 1042.6855 18.058594 1042.0731 C 19.363102 1041.4519 20.414211 1040.4746 21.212891 1039.1435 C 22.011569 1037.8035 22.410156 1036.5521 22.410156 1035.3895 L 22.410156 1033.1278 L 14.34375 1033.1278 L 14.34375 1036.536 L 18.484375 1036.536 C 18.049538 1037.6098 17.472717 1038.3409 16.753906 1038.7313 C 16.043969 1039.1218 15.301353 1039.3173 14.529297 1039.3173 C 13.109423 1039.3173 11.894472 1038.799 10.882812 1037.7606 C 9.8800268 1036.7135 9.3789062 1035.4401 9.3789062 1033.9403 C 9.3789062 1032.5293 9.8800268 1031.3048 10.882812 1030.2665 C 11.894472 1029.2282 13.084543 1028.7079 14.451172 1028.7079 C 15.294222 1028.7079 16.10099 1028.935 16.873047 1029.3876 C 17.559906 1029.7824 18.148477 1030.3601 18.638672 1031.12 L 18.638672 1026.2411 C 17.383998 1025.4366 15.917756 1025.0341 14.238281 1025.0341 z "
     transform="translate(0,-1015.3622)" />
</svg>`;

        this.loadLayer(lettersSVG, 2.0, (plane) => {
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

            const geometry = new THREE.PlaneGeometry(40, 40);
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
        if (this.ringMesh) {
            const ringAmount = 0.4 + Math.sin(this.wobblePhase * 0.3) * 0.3;
            this.ringMesh.rotation.x = Math.sin(this.wobblePhase * 0.8) * ringAmount;
            this.ringMesh.rotation.y = Math.cos(this.wobblePhase) * ringAmount;
            this.ringMesh.rotation.z += deltaTime * 0.2;
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
        if (this.lettersPlane) this.lettersPlane.position.z = 2.0 + pushZ;

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
        this.ringMesh = null;
        this.lettersPlane = null;
    }
}

window.GBLogoPreset = GBLogoPreset;
