// Revision - Main Application
class RevisionApp {
    constructor() {
        // Core components
        this.settings = new SettingsManager();
        this.midi = new MIDIManager();
        this.osc = new OSCClient();
        this.renderer = new VisualRenderer('main-canvas');
        this.sceneManager = null;

        // UI elements
        this.midiIndicator = document.getElementById('midi-indicator');
        this.bpmDisplay = document.getElementById('bpm-display');
        this.positionDisplay = document.getElementById('position-display');
        this.settingsModal = document.getElementById('settings-modal');

        // State
        this.currentBPM = 120;
        this.currentPosition = 0;
        this.beatPhase = 0;
        this.barPhase = 0;
    }

    async initialize() {
        console.log('[Revision] Initializing...');

        // Initialize renderer
        const rendererMode = this.settings.get('renderer') || 'webgl';
        this.renderer.initialize(rendererMode);
        this.renderer.start();

        // Initialize scene manager
        this.sceneManager = new SceneManager(this.renderer);

        // Load last scene
        const lastScene = this.settings.get('lastScene') || 0;
        this.sceneManager.switchScene(lastScene);
        this.updateSceneButtons(lastScene);

        // Initialize MIDI
        const midiSuccess = await this.midi.initialize();
        if (midiSuccess) {
            this.setupMIDI();
            this.populateMIDIDevices();

            // Auto-connect to last MIDI device
            const lastMidiId = this.settings.get('midiInputId');
            if (lastMidiId) {
                this.midi.connectInput(lastMidiId);
            }
        }

        // Initialize OSC (optional)
        const oscServer = this.settings.get('oscServer');
        if (oscServer) {
            this.osc.connect(oscServer);
        }

        // Setup UI event listeners
        this.setupUI();

        console.log('[Revision] Initialized successfully');
    }

    setupMIDI() {
        // MIDI Clock
        this.midi.on('clock', (data) => {
            this.updateBeatTracking();
        });

        // Transport control
        this.midi.onBPMChange = (bpm) => {
            this.currentBPM = bpm;
            this.bpmDisplay.textContent = bpm;
            this.renderer.setBPM(bpm);
        };

        this.midi.onSongPositionChange = (position) => {
            this.currentPosition = position;
            this.positionDisplay.textContent = this.midi.getSongPositionFormatted();
        };

        this.midi.onConnectionChange = (connected, deviceName) => {
            if (connected) {
                this.midiIndicator.classList.add('connected');
                console.log('[Revision] MIDI connected:', deviceName);
            } else {
                this.midiIndicator.classList.remove('connected');
            }
        };

        // MIDI CC for scene control
        this.midi.on('cc', (data) => {
            this.sceneManager.handleMIDICC(data.controller, data.value);
        });

        // MIDI Notes for scene switching AND visual interaction
        this.midi.on('noteon', (data) => {
            // Notes 60-63 switch scenes 0-3
            if (data.note >= 60 && data.note <= 63) {
                const sceneIndex = data.note - 60;
                this.switchScene(sceneIndex);
            }

            // Pass note to scene for visual interaction
            this.sceneManager.handleMIDINote(data.note, data.velocity);
        });
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            document.documentElement.requestFullscreen().then(() => {
                // Hide UI bars
                document.querySelector('.status-bar').style.display = 'none';
                document.querySelector('.control-panel').style.display = 'none';

                // Expand canvas
                const canvas = document.getElementById('main-canvas');
                canvas.style.top = '0';
                canvas.style.bottom = '0';
                canvas.style.height = '100vh';

                this.renderer.resize();
                console.log('[Revision] Entered fullscreen');
            }).catch(err => {
                console.error('[Revision] Fullscreen failed:', err);
            });
        } else {
            this.exitFullscreen();
        }
    }

    handleFullscreenExit() {
        // Show UI bars
        document.querySelector('.status-bar').style.display = 'flex';
        document.querySelector('.control-panel').style.display = 'flex';

        // Reset canvas
        const canvas = document.getElementById('main-canvas');
        canvas.style.top = '40px';
        canvas.style.bottom = '80px';
        canvas.style.height = 'calc(100vh - 120px)';

        this.renderer.resize();
        console.log('[Revision] Exited fullscreen');
    }

    exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            // handleFullscreenExit will be called automatically via event listener
        }
    }

    updateBeatTracking() {
        // Calculate beat and bar phase
        const sixteenthsPerBeat = 4;
        const beatsPerBar = 4;

        const beatPosition = (this.currentPosition / sixteenthsPerBeat) % 1;
        const barPosition = (this.currentPosition / (sixteenthsPerBeat * beatsPerBar)) % 1;

        this.beatPhase = beatPosition;
        this.barPhase = barPosition;

        // Update renderer and scene
        this.renderer.updateBeat(this.beatPhase, this.barPhase);
        this.sceneManager.update(this.beatPhase, this.barPhase);
    }

    setupUI() {
        // Fullscreen button
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Settings button
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.openSettings();
        });

        // Scene buttons
        document.querySelectorAll('.scene-button').forEach((button, index) => {
            button.addEventListener('click', () => {
                this.switchScene(index);
            });
        });

        // Listen for fullscreen change events (ESC is handled automatically by browser)
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                // Exited fullscreen (via ESC or other means)
                this.handleFullscreenExit();
            }
        });

        // Settings modal inputs
        document.getElementById('midi-input-select').addEventListener('change', (e) => {
            const inputId = e.target.value;
            if (inputId) {
                this.midi.connectInput(inputId);
                this.settings.set('midiInputId', inputId);
            }
        });

        document.getElementById('renderer-select').addEventListener('change', (e) => {
            const mode = e.target.value;
            this.settings.set('renderer', mode);

            // Stop current animation
            this.renderer.stop();

            // Reinitialize renderer
            this.renderer.initialize(mode);
            this.renderer.resize();

            // Restart animation with new renderer
            this.renderer.start();

            console.log('[Revision] Renderer switched to:', mode);
        });

        document.getElementById('osc-server').addEventListener('change', (e) => {
            const server = e.target.value;
            this.settings.set('oscServer', server);
            if (server) {
                this.osc.disconnect();
                this.osc.connect(server);
            }
        });
    }

    populateMIDIDevices() {
        const select = document.getElementById('midi-input-select');
        const inputs = this.midi.getInputs();

        select.innerHTML = '';

        if (inputs.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No MIDI devices found';
            select.appendChild(option);
            return;
        }

        inputs.forEach(input => {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name;
            select.appendChild(option);
        });

        // Select current device
        const currentId = this.settings.get('midiInputId');
        if (currentId) {
            select.value = currentId;
        }
    }

    openSettings() {
        this.settingsModal.classList.add('active');
        this.populateMIDIDevices();

        // Load current settings
        document.getElementById('renderer-select').value = this.settings.get('renderer') || 'webgl';
        document.getElementById('osc-server').value = this.settings.get('oscServer') || '';
    }

    switchScene(sceneIndex) {
        if (this.sceneManager.switchScene(sceneIndex)) {
            this.updateSceneButtons(sceneIndex);
            this.settings.set('lastScene', sceneIndex);
        }
    }

    updateSceneButtons(activeIndex) {
        document.querySelectorAll('.scene-button').forEach((button, index) => {
            if (index === activeIndex) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }
}

// Global functions for UI
function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    const app = new RevisionApp();
    app.initialize();

    // Make app globally accessible for debugging
    window.app = app;
});
