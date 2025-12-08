// Scene Manager - Manages different visual scenes
class SceneManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.currentScene = 0;
        this.scenes = [];

        this.initializeScenes();
    }

    initializeScenes() {
        // Scene 0: Tunnel Vision - Hypnotic tunnel effect
        this.scenes.push({
            name: 'Tunnel Vision',
            init: () => {
                this.renderer.setMode('tunnel');
                this.renderer.setParameter('hue', 280);
                this.renderer.setParameter('saturation', 100);
                this.renderer.setParameter('brightness', 70);
            },
            update: (beatPhase, barPhase) => {
                // Tunnel zooms on beat
                const zoom = 0.3 + beatPhase * 0.7;
                this.renderer.setParameter('zoom', zoom);
                this.renderer.setParameter('rotation', barPhase * Math.PI * 2);
                this.renderer.setParameter('intensity', 1.0);
            },
            onMIDICC: (controller, value) => {
                if (controller === 1) {
                    this.renderer.setParameter('hue', (value / 127) * 360);
                }
            },
            onMIDINote: (note, velocity) => {
                // DRAMATIC color shift based on note pitch
                const hue = (note * 3) % 360;
                this.renderer.setParameter('hue', hue);

                // Velocity controls zoom burst (low notes = bigger burst)
                const notePitch = note / 127; // 0-1
                const velocityAmount = velocity / 127; // 0-1
                const zoomBurst = 0.5 + (1.0 - notePitch) * velocityAmount * 2.0;
                this.renderer.setParameter('zoom', zoomBurst);

                // Flash intensity boost
                const intensityBurst = 2.0 + velocityAmount * 3.0;
                this.renderer.setParameter('intensity', intensityBurst);

                console.log(`[Scene] Tunnel Note: ${note}, Vel: ${velocity}, Hue: ${hue.toFixed(0)}, Zoom: ${zoomBurst.toFixed(2)}`);
            }
        });

        // Scene 1: Particle Explosion - Notes trigger particles
        this.scenes.push({
            name: 'Particle Burst',
            init: () => {
                this.renderer.setMode('particles');
                this.renderer.setParameter('hue', 180);
                this.renderer.setParameter('saturation', 90);
                this.renderer.setParameter('brightness', 60);
            },
            update: (beatPhase, barPhase) => {
                // Gravity on beat
                const gravity = 0.5 + beatPhase * 0.5;
                this.renderer.setParameter('gravity', gravity);
                this.renderer.setParameter('intensity', 0.8 + beatPhase * 0.4);
            },
            onMIDICC: (controller, value) => {
                if (controller === 1) {
                    this.renderer.setParameter('particleCount', Math.floor((value / 127) * 100));
                }
            },
            onMIDINote: (note, velocity) => {
                // Spawn particles - spawnParticles already creates multiple based on velocity
                this.renderer.spawnParticles(note, velocity);

                // Color shift based on note
                const notePitch = note / 127;
                const velocityAmount = velocity / 127;
                const hue = (note * 3) % 360;
                this.renderer.setParameter('hue', hue);

                // Intensity flash - dramatic but not crazy
                const intensityBurst = 1.5 + velocityAmount * 2.5;
                this.renderer.setParameter('intensity', intensityBurst);

                console.log(`[Scene] Particles Note: ${note}, Vel: ${velocity}, Hue: ${hue.toFixed(0)}`);
            }
        });

        // Scene 2: Kaleidoscope - Mirrored symmetry
        this.scenes.push({
            name: 'Kaleidoscope',
            init: () => {
                this.renderer.setMode('kaleidoscope');
                this.renderer.setParameter('hue', 60);
                this.renderer.setParameter('saturation', 100);
                this.renderer.setParameter('brightness', 50);
                this.renderer.setParameter('segments', 8);
            },
            update: (beatPhase, barPhase) => {
                // Rotate symmetry
                this.renderer.setParameter('rotation', barPhase * Math.PI * 4);
                // Pulse on beat
                const scale = 0.8 + beatPhase * 0.4;
                this.renderer.setParameter('zoom', scale);
                this.renderer.setParameter('intensity', 1.0);
            },
            onMIDICC: (controller, value) => {
                if (controller === 1) {
                    this.renderer.setParameter('segments', Math.floor(3 + (value / 127) * 13)); // 3-16 segments
                }
            },
            onMIDINote: (note, velocity) => {
                // DRAMATIC effects based on pitch and velocity
                const notePitch = note / 127; // 0-1
                const velocityAmount = velocity / 127; // 0-1

                // Color shift
                const hue = (note * 3) % 360;
                this.renderer.setParameter('hue', hue);

                // Higher notes = more segments, faster rotation
                const segments = Math.floor(3 + notePitch * 13); // 3-16 segments
                this.renderer.setParameter('segments', segments);

                // Velocity controls zoom and intensity
                const zoomBurst = 0.3 + velocityAmount * 1.5; // 0.3-1.8
                this.renderer.setParameter('zoom', zoomBurst);

                // MASSIVE intensity burst
                const intensityBurst = 2.5 + velocityAmount * 6.0; // 2.5-8.5
                this.renderer.setParameter('intensity', intensityBurst);

                // Rotation burst
                const rotationSpeed = velocityAmount * Math.PI * 2;
                this.renderer.setParameter('rotation', rotationSpeed);

                console.log(`[Scene] Kaleidoscope Note: ${note}, Vel: ${velocity}, Segments: ${segments}, Intensity: ${intensityBurst.toFixed(1)}`);
            }
        });

        // Scene 3: Waveform Visualizer - Audio-reactive bars
        this.scenes.push({
            name: 'Waveform',
            init: () => {
                this.renderer.setMode('waveform');
                this.renderer.setParameter('hue', 120);
                this.renderer.setParameter('saturation', 80);
                this.renderer.setParameter('brightness', 60);
            },
            update: (beatPhase, barPhase) => {
                // Beat kick
                const kick = beatPhase < 0.2 ? 1.0 - beatPhase * 5 : 0;
                this.renderer.setParameter('kick', kick);
                this.renderer.setParameter('intensity', 0.7 + kick * 0.3);
            },
            onMIDICC: (controller, value) => {
                if (controller === 1) {
                    this.renderer.setParameter('barCount', Math.floor(8 + (value / 127) * 56)); // 8-64 bars
                }
            },
            onMIDINote: (note, velocity) => {
                // DRAMATIC bar animations based on pitch and velocity
                const notePitch = note / 127; // 0-1
                const velocityAmount = velocity / 127; // 0-1

                // Set bar height for this specific note
                this.renderer.setBarHeight(note, velocity);

                // Color shift based on note
                const hue = (note * 3) % 360;
                this.renderer.setParameter('hue', hue);

                // Higher velocity = bigger kick effect
                const kickAmount = velocityAmount * 2.0;
                this.renderer.setParameter('kick', kickAmount);

                // Higher notes = higher intensity
                const intensityBurst = 1.5 + velocityAmount * 4.0 + notePitch * 2.0;
                this.renderer.setParameter('intensity', intensityBurst);

                // Zoom based on pitch (lower notes = bigger)
                const zoomEffect = 0.8 + (1.0 - notePitch) * 0.8;
                this.renderer.setParameter('zoom', zoomEffect);

                console.log(`[Scene] Waveform Note: ${note}, Vel: ${velocity}, Kick: ${kickAmount.toFixed(2)}, Intensity: ${intensityBurst.toFixed(1)}`);
            }
        });

        // Scene 4: Black Screen - Clear the view
        this.scenes.push({
            name: 'Black Screen',
            init: () => {
                this.renderer.setMode('blank');
                this.renderer.setParameter('brightness', 0);
            },
            update: (beatPhase, barPhase) => {
                // Always stay black
                this.renderer.setParameter('brightness', 0);
            },
            onMIDICC: (controller, value) => {
                // No response to MIDI CC
            },
            onMIDINote: (note, velocity) => {
                // No response to MIDI notes
            }
        });

        console.log(`[SceneManager] Initialized ${this.scenes.length} scenes`);
    }

    switchScene(sceneIndex) {
        if (sceneIndex < 0 || sceneIndex >= this.scenes.length) {
            console.warn('[SceneManager] Invalid scene index:', sceneIndex);
            return false;
        }

        this.currentScene = sceneIndex;
        const scene = this.scenes[sceneIndex];

        console.log('[SceneManager] Switching to scene:', sceneIndex, scene.name);

        // Initialize scene
        if (scene.init) {
            scene.init();
        }

        return true;
    }

    update(beatPhase, barPhase) {
        const scene = this.scenes[this.currentScene];
        if (scene && scene.update) {
            scene.update(beatPhase, barPhase);
        }
    }

    handleMIDICC(controller, value) {
        const scene = this.scenes[this.currentScene];
        if (scene && scene.onMIDICC) {
            scene.onMIDICC(controller, value);
        }
    }

    handleMIDINote(note, velocity) {
        const scene = this.scenes[this.currentScene];
        if (scene && scene.onMIDINote) {
            scene.onMIDINote(note, velocity);
        }
    }

    getCurrentSceneName() {
        return this.scenes[this.currentScene]?.name || 'Unknown';
    }

    getSceneCount() {
        return this.scenes.length;
    }
}

window.SceneManager = SceneManager;
