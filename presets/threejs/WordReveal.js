// WordReveal - Animated text that reveals words with intersecting crossword style
window.WordRevealPreset = class extends ThreeJSBasePreset {
    initialize() {
        console.log('[ThreeJS Preset] Initializing Word Reveal');

        this.addBasicLighting();
        
        // Word pairs that intersect (with correct positions)
        this.wordPairs = [
            { h: 'LOVE', v: 'VIBE', char: 'V' },      // V at pos 2 in LOVE, pos 0 in VIBE
            { h: 'GROOVE', v: 'ENERGY', char: 'E' },  // E at pos 5 in GROOVE, pos 0 in ENERGY
            { h: 'DANCE', v: 'ENERGY', char: 'N' },   // N at pos 2 in DANCE, pos 1 in ENERGY
            { h: 'RHYTHM', v: 'BEAT', char: 'T' }     // T at pos 3 in RHYTHM, pos 3 in BEAT
        ];
        
        this.currentPairIndex = 0;
        this.revealProgress = 0;
        this.holdTime = 0;
        this.holdDuration = 4;
        
        this.letters = [];
        
        // Start with first word pair
        this.createWordPair(this.wordPairs[this.currentPairIndex]);
        
        this.camera.position.set(0, 0, 50);
        this.camera.lookAt(0, 0, 0);
    }
    
    createLetter(char, x, y, isActive = false) {
        // Create 3D letter using lines to draw the glyph
        const group = new THREE.Group();
        const scale = 2;
        
        // Define letter shapes as line segments
        const glyphs = {
            'A': [[-0.5,0,0.5,1], [0.5,1,0.5,0], [-0.3,0.4,0.3,0.4]],
            'B': [[-0.5,0,-0.5,1], [-0.5,1,0.3,1], [0.3,1,0.4,0.8], [0.4,0.8,-0.5,0.5], [-0.5,0.5,0.3,0.5], [0.3,0.5,0.4,0.3], [0.4,0.3,-0.5,0]],
            'C': [[0.5,1,0,1], [0,1,-0.3,0.7], [-0.3,0.7,-0.3,0.3], [-0.3,0.3,0,0], [0,0,0.5,0]],
            'D': [[-0.5,0,-0.5,1], [-0.5,1,0.2,1], [0.2,1,0.5,0.7], [0.5,0.7,0.5,0.3], [0.5,0.3,0.2,0], [0.2,0,-0.5,0]],
            'E': [[-0.5,0,-0.5,1], [-0.5,1,0.5,1], [-0.5,0.5,0.3,0.5], [-0.5,0,0.5,0]],
            'F': [[-0.5,0,-0.5,1], [-0.5,1,0.5,1], [-0.5,0.5,0.3,0.5]],
            'G': [[0.5,1,0,1], [0,1,-0.3,0.7], [-0.3,0.7,-0.3,0.3], [-0.3,0.3,0,0], [0,0,0.5,0], [0.5,0,0.5,0.5], [0.5,0.5,0.1,0.5]],
            'H': [[-0.5,0,-0.5,1], [0.5,0,0.5,1], [-0.5,0.5,0.5,0.5]],
            'I': [[-0.3,1,0.3,1], [0,1,0,0], [-0.3,0,0.3,0]],
            'L': [[-0.5,0,-0.5,1], [-0.5,0,0.5,0]],
            'M': [[-0.5,0,-0.5,1], [-0.5,1,0,0.5], [0,0.5,0.5,1], [0.5,1,0.5,0]],
            'N': [[-0.5,0,-0.5,1], [-0.5,1,0.5,0], [0.5,0,0.5,1]],
            'O': [[0,1,0.5,0.7], [0.5,0.7,0.5,0.3], [0.5,0.3,0,0], [0,0,-0.5,0.3], [-0.5,0.3,-0.5,0.7], [-0.5,0.7,0,1]],
            'R': [[-0.5,0,-0.5,1], [-0.5,1,0.3,1], [0.3,1,0.5,0.8], [0.5,0.8,0.5,0.6], [0.5,0.6,-0.5,0.5], [-0.5,0.5,0.5,0]],
            'T': [[-0.5,1,0.5,1], [0,1,0,0]],
            'V': [[-0.5,1,0,0], [0,0,0.5,1]],
            'W': [[-0.5,1,-0.3,0], [-0.3,0,0,0.5], [0,0.5,0.3,0], [0.3,0,0.5,1]],
            'Y': [[-0.5,1,0,0.5], [0.5,1,0,0.5], [0,0.5,0,0]]
        };
        
        const segments = glyphs[char] || [[-0.3,0,0.3,0], [0.3,0,0.3,1], [0.3,1,-0.3,1], [-0.3,1,-0.3,0]]; // Default box
        
        segments.forEach(seg => {
            const points = [
                new THREE.Vector3(seg[0] * scale, seg[1] * scale, 0),
                new THREE.Vector3(seg[2] * scale, seg[3] * scale, 0)
            ];
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: isActive ? 0.9 : 0.3,
                linewidth: 2,
                blending: THREE.AdditiveBlending
            });
            
            const line = new THREE.Line(geometry, material);
            group.add(line);
        });
        
        group.position.set(x, y, 0);
        this.scene.add(group);
        
        return {
            mesh: group,
            char: char,
            x: x,
            y: y,
            isActive: isActive,
            targetOpacity: isActive ? 0.9 : 0.3,
            phase: Math.random() * Math.PI * 2
        };
    }
    
    createWordPair(pair) {
        // Clear existing letters
        this.letters.forEach(letterData => {
            this.scene.remove(letterData.mesh);
            letterData.mesh.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
        });
        this.letters = [];
        
        const spacing = 3;
        
        // Find intersection point
        const hWord = pair.h;
        const vWord = pair.v;
        const intersectChar = pair.char;
        
        const hIndex = hWord.indexOf(intersectChar);
        const vIndex = vWord.indexOf(intersectChar);
        
        // Place horizontal word
        const hStartX = -hWord.length * spacing / 2;
        for (let i = 0; i < hWord.length; i++) {
            const letterData = this.createLetter(
                hWord[i],
                hStartX + i * spacing,
                0,
                false
            );
            letterData.wordType = 'horizontal';
            letterData.letterIndex = i;
            this.letters.push(letterData);
        }
        
        // Place vertical word (intersecting at the common letter)
        const intersectX = hStartX + hIndex * spacing;
        const intersectY = 0; // Horizontal word is at y=0
        
        // Calculate vertical word start Y so that the intersection letter aligns
        const vStartY = intersectY + vIndex * spacing;
        
        for (let i = 0; i < vWord.length; i++) {
            const yPos = vStartY - i * spacing;
            
            if (i === vIndex) {
                // This is the intersection point - mark existing letter from horizontal word
                const intersectLetter = this.letters.find(l => 
                    Math.abs(l.x - intersectX) < 0.1 && Math.abs(l.y - intersectY) < 0.1
                );
                if (intersectLetter) {
                    intersectLetter.isIntersection = true;
                }
                continue;
            }
            
            const letterData = this.createLetter(
                vWord[i],
                intersectX,
                yPos,
                false
            );
            letterData.wordType = 'vertical';
            letterData.letterIndex = i;
            this.letters.push(letterData);
        }
        
        this.revealProgress = 0;
        this.holdTime = 0;
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Update reveal progress
        if (this.revealProgress < 1) {
            this.revealProgress += deltaTime * 0.3 * (1 + this.frequencyData.mid * 0.5);
        } else {
            this.holdTime += deltaTime;
            
            // Switch to next word pair
            if (this.holdTime >= this.holdDuration) {
                this.currentPairIndex = (this.currentPairIndex + 1) % this.wordPairs.length;
                this.createWordPair(this.wordPairs[this.currentPairIndex]);
            }
        }
        
        // Update all letters
        this.letters.forEach((letterData, index) => {
            // Reveal animation
            const targetOpacity = this.revealProgress > 0.5 ? 0.9 : 0.3;
            
            letterData.mesh.children.forEach(line => {
                const currentOpacity = line.material.opacity;
                line.material.opacity += (targetOpacity - currentOpacity) * deltaTime * 3;
                
                // Color based on word type and progress
                const hue = letterData.wordType === 'horizontal' ? 
                           (0.5 + this.revealProgress * 0.3 + this.frequencyData.bass * 0.2) % 1.0 : 
                           (0.15 + this.revealProgress * 0.3 + this.frequencyData.mid * 0.2) % 1.0;
                
                line.material.color.setHSL(hue, 1.0, 0.5 + this.revealProgress * 0.3);
                
                // Intersection letters glow more
                if (letterData.isIntersection) {
                    line.material.color.setHSL((this.time * 0.3) % 1.0, 1.0, 0.7);
                    line.material.opacity = 1.0;
                }
            });
            
            // Scale animation during reveal
            if (this.revealProgress < 1) {
                const delay = letterData.letterIndex * 0.05;
                const localProgress = Math.max(0, Math.min(1, (this.revealProgress - delay) * 2));
                const scale = 0.5 + localProgress * 0.5 + Math.sin(localProgress * Math.PI) * 0.3;
                letterData.mesh.scale.setScalar(scale);
            } else {
                // Idle pulsing
                const pulse = 1 + Math.sin(this.time * 2 + letterData.phase) * 0.1;
                letterData.mesh.scale.setScalar(pulse);
            }
            
            // Audio reactivity
            const bassScale = 1 + this.frequencyData.bass * 0.2;
            letterData.mesh.scale.x *= bassScale;
            letterData.mesh.scale.y *= bassScale;
            
            // Slight rotation on vertical words
            if (letterData.wordType === 'vertical') {
                letterData.mesh.rotation.z = Math.sin(this.time * 0.5 + letterData.phase) * 0.05;
            }
        });
        
        // Camera gentle movement
        this.camera.position.z = 50 + Math.sin(this.time * 0.3) * 5;
        this.camera.position.x = Math.sin(this.time * 0.1) * 2;
        this.camera.position.y = Math.cos(this.time * 0.15) * 2;
        this.camera.lookAt(0, 0, 0);
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        
        // Flash all letters on beat
        this.letters.forEach(letterData => {
            const scale = 1 + intensity * 0.5;
            letterData.mesh.scale.setScalar(scale);
            
            letterData.mesh.children.forEach(line => {
                line.material.opacity = Math.min(1.0, line.material.opacity + intensity * 0.3);
            });
        });
        
        // Chance to reveal next word early on strong beat
        if (intensity > 0.8 && this.holdTime > 2) {
            this.currentPairIndex = (this.currentPairIndex + 1) % this.wordPairs.length;
            this.createWordPair(this.wordPairs[this.currentPairIndex]);
        }
    }

    dispose() {
        this.letters.forEach(letterData => {
            this.scene.remove(letterData.mesh);
            letterData.mesh.children.forEach(line => {
                line.geometry.dispose();
                line.material.dispose();
            });
        });
    }
};
