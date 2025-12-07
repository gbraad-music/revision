// Revision V2 - Modernized application with unified input architecture
// Supports: MIDI (with SysEx), Audio input, multiple renderers, mobile compatibility

class RevisionAppV2 {
    constructor() {
        // Core managers
        this.settings = new SettingsManager();
        this.inputManager = new InputManager();
        this.presetManager = null;
        this.mobileCompat = null;
        this.libraryLoader = new LibraryLoader();

        // Input sources
        this.midiSource = null;
        this.audioSource = null;
        this.oscClient = new OSCClient();

        // Renderers
        this.renderer = new VisualRenderer('builtin-canvas');
        this.sceneManager = null;
        this.threeJSRenderer = null;
        this.milkdropRenderer = null;

        // UI elements
        this.builtinCanvas = document.getElementById('builtin-canvas');
        this.threejsCanvas = document.getElementById('threejs-canvas');
        this.milkdropCanvas = document.getElementById('milkdrop-canvas');
        this.midiIndicator = document.getElementById('midi-indicator');
        this.audioIndicator = document.getElementById('audio-indicator');
        this.bpmDisplay = document.getElementById('bpm-display');
        this.positionDisplay = document.getElementById('position-display');
        this.settingsModal = document.getElementById('settings-modal');

        // State
        this.currentBPM = 120;
        this.currentPosition = 0;
        this.beatPhase = 0;
        this.barPhase = 0;
        this.currentPresetType = 'builtin';

        // Beat interpolation
        this.lastMIDIUpdateTime = performance.now();
        this.lastMIDIPosition = 0;

        // Resize debounce
        this.resizeTimeout = null;

        // Preset configuration
        this.presetConfig = null;
    }

    async initialize() {
        console.log('[Revision V2] Initializing...');

        // Load preset configuration
        await this.loadPresetConfig();

        // Initialize mobile compatibility first
        this.mobileCompat = new MobileCompatibility(this.builtinCanvas);
        this.mobileCompat.initialize();

        // Set up WebGL context recovery
        this.mobileCompat.onContextLost(() => {
            console.log('[Revision] Handling context loss...');
            this.renderer.stop();
        });

        this.mobileCompat.onContextRestored(() => {
            console.log('[Revision] Handling context restoration...');
            const rendererMode = this.settings.get('renderer') || 'webgl';
            this.renderer.initialize(rendererMode);
            this.renderer.start();
        });

        // Initialize renderer (don't start it yet - will start after loading preset type)
        const rendererMode = this.settings.get('renderer') || 'webgl';
        const optimalSettings = this.mobileCompat.getOptimalSettings();

        console.log('[Revision] Using settings:', optimalSettings);

        this.renderer.initialize(rendererMode);

        // Initialize scene manager
        this.sceneManager = new SceneManager(this.renderer);

        // Initialize preset manager
        this.presetManager = new PresetManager(this.builtinCanvas);
        this.presetManager.setRenderer('builtin', {
            sceneManager: this.sceneManager
        });
        this.presetManager.initialize();

        // Pre-initialize audio source to get shared AudioContext
        this.audioSource = new AudioInputSource();
        await this.audioSource.initialize(this.mobileCompat.getOptimalSettings());
        console.log('[Revision] Audio source created, AudioContext ready');

        // Initialize Three.js renderer (if available)
        if (typeof THREE !== 'undefined') {
            console.log('[Revision] THREE.js library detected, initializing renderer...');
            this.threeJSRenderer = new ThreeJSRenderer(this.threejsCanvas);
            const threeSuccess = await this.threeJSRenderer.initialize();

            if (threeSuccess) {
                this.presetManager.setRenderer('threejs', this.threeJSRenderer);
                console.log('[Revision] ✓ Three.js renderer initialized successfully');

                // Register Three.js presets
                this.presetManager.registerThreeJSPreset('threejs-default', {
                    name: 'Three.js Default',
                    description: 'Beat-reactive 3D scene with geometric shapes'
                });
            } else {
                console.error('[Revision] ✗ Three.js renderer failed to initialize');
            }
        } else {
            console.warn('[Revision] THREE.js library not loaded - Three.js mode unavailable');
        }

        // Initialize Milkdrop renderer with shared AudioContext
        if (typeof butterchurn !== 'undefined' && typeof butterchurnPresets !== 'undefined') {
            this.milkdropRenderer = new MilkdropRenderer(this.milkdropCanvas);
            const milkdropSuccess = await this.milkdropRenderer.initialize(this.audioSource.audioContext);

            if (milkdropSuccess) {
                this.presetManager.setRenderer('milkdrop', this.milkdropRenderer);
                console.log('[Revision] ✓ Milkdrop renderer initialized with shared AudioContext');

                // Load preset keys
                const allPresets = butterchurnPresets.getPresets();
                const allPresetKeys = Object.keys(allPresets);

                // Use playlist from config if available
                if (this.presetConfig && this.presetConfig.milkdrop && this.presetConfig.milkdrop.playlist) {
                    const playlist = this.presetConfig.milkdrop.playlist;
                    this.milkdropPresetKeys = playlist.filter(name => allPresetKeys.includes(name));
                    console.log('[Revision] Milkdrop playlist:', this.milkdropPresetKeys.length, 'presets');
                } else {
                    this.milkdropPresetKeys = allPresetKeys;
                    console.log('[Revision] Milkdrop all presets:', this.milkdropPresetKeys.length);
                }

                this.currentMilkdropIndex = 0;
            } else {
                console.error('[Revision] ✗ Milkdrop renderer failed to initialize');
            }
        } else {
            console.warn('[Revision] ✗ Butterchurn library not loaded - Milkdrop mode unavailable');
            console.warn('[Revision] Make sure butterchurn scripts are included in index.html');
        }

        // Initialize input sources (MIDI, connect audio if enabled)
        await this.initializeInputs();

        // Set up input event handlers
        this.setupInputHandlers();

        // Setup UI
        this.setupUI();

        // Hide all canvases initially
        this.builtinCanvas.style.display = 'none';
        this.threejsCanvas.style.display = 'none';
        this.milkdropCanvas.style.display = 'none';

        // Load last preset type and scene
        const lastPresetType = this.settings.get('presetType') || 'builtin';
        const lastScene = this.settings.get('lastScene') || 0;

        console.log('[Revision] Loading last preset type:', lastPresetType);

        if (lastPresetType !== 'builtin') {
            await this.switchPresetType(lastPresetType);
        } else {
            this.builtinCanvas.style.display = 'block';
            this.renderer.start();
            this.presetManager.switchPreset(`builtin-${['tunnel', 'particles', 'kaleidoscope', 'waveform'][lastScene]}`);
            this.updateSceneButtons(lastScene);
        }

        // Start beat interpolation
        this.interpolateBeat();

        // Show mobile info if on mobile
        if (this.mobileCompat.isMobile) {
            this.showMobileInfo();
        }

        console.log('[Revision V2] Initialized successfully');
        console.log('[Revision V2] Available presets:', this.presetManager.getAllPresets().length);
    }

    async initializeInputs() {
        // Initialize MIDI input
        const enableSysEx = this.settings.get('enableSysEx') !== 'false'; // Default true
        this.midiSource = new MIDIInputSource();
        const midiSuccess = await this.midiSource.initialize(enableSysEx);

        if (midiSuccess) {
            this.inputManager.registerSource('midi', this.midiSource);
            console.log('[Revision] MIDI input registered (SysEx:', enableSysEx, ')');

            // Auto-connect to last MIDI device
            const lastMidiId = this.settings.get('midiInputId');
            if (lastMidiId) {
                this.midiSource.connectInput(lastMidiId);
            }
        }

        // Initialize Audio input (if enabled)
        const audioEnabled = this.settings.get('audioInput');
        if (audioEnabled === 'microphone') {
            await this.enableAudioInput();
        }

        // Initialize OSC (optional)
        const oscServer = this.settings.get('oscServer');
        if (oscServer) {
            this.oscClient.connect(oscServer);
        }

        // Setup OSC handlers
        this.setupOSCHandlers();
    }

    setupOSCHandlers() {
        // /preset/milkdrop/select <index>
        this.oscClient.on('/preset/milkdrop/select', (args) => {
            if (this.currentPresetType === 'milkdrop' && args[0] !== undefined) {
                const index = parseInt(args[0]);
                this.loadMilkdropPreset(index);
            }
        });

        // /preset/milkdrop/next
        this.oscClient.on('/preset/milkdrop/next', () => {
            if (this.currentPresetType === 'milkdrop') {
                const nextIndex = (this.currentMilkdropIndex + 1) % this.milkdropPresetKeys.length;
                this.loadMilkdropPreset(nextIndex);
            }
        });

        // /preset/milkdrop/prev
        this.oscClient.on('/preset/milkdrop/prev', () => {
            if (this.currentPresetType === 'milkdrop') {
                let prevIndex = this.currentMilkdropIndex - 1;
                if (prevIndex < 0) prevIndex = this.milkdropPresetKeys.length - 1;
                this.loadMilkdropPreset(prevIndex);
            }
        });

        // /preset/mode <builtin|threejs|milkdrop>
        this.oscClient.on('/preset/mode', (args) => {
            if (args[0]) {
                this.switchPresetType(args[0]);
            }
        });
    }

    async enableAudioInput() {
        if (!this.audioSource) {
            this.audioSource = new AudioInputSource();
            await this.audioSource.initialize(
                this.mobileCompat.getOptimalSettings()
            );
        }

        const success = await this.audioSource.connectMicrophone();
        if (success) {
            this.inputManager.registerSource('audio', this.audioSource);
            this.audioIndicator.classList.add('connected');
            this.audioIndicator.style.backgroundColor = '#0066FF';
            this.audioIndicator.style.boxShadow = '0 0 8px #0066FF';

            // Connect to Milkdrop if active
            if (this.milkdropRenderer && this.milkdropRenderer.isInitialized && this.audioSource.analyser) {
                this.milkdropRenderer.connectAudioSource(this.audioSource.analyser);
                console.log('[Revision] Audio connected to Milkdrop');
            }

            console.log('[Revision] Audio input enabled');
        }

        return success;
    }

    disableAudioInput() {
        if (this.audioSource) {
            this.audioSource.disconnect();
            this.inputManager.unregisterSource('audio');
            this.audioIndicator.classList.remove('connected');
            this.audioIndicator.style.backgroundColor = '#444444';
            this.audioIndicator.style.boxShadow = 'none';
            console.log('[Revision] Audio input disabled');
        }
    }

    setupInputHandlers() {
        // Beat events
        this.inputManager.on('beat', (data) => {
            this.beatPhase = data.phase;

            // Update position tracking for MIDI interpolation
            if (data.source === 'midi' && this.midiSource) {
                this.lastMIDIUpdateTime = performance.now();
                this.lastMIDIPosition = this.midiSource.getSongPosition();
                this.currentPosition = this.lastMIDIPosition;

                // Update position display
                if (this.positionDisplay) {
                    const bar = Math.floor(this.currentPosition / 16);
                    const beat = Math.floor((this.currentPosition % 16) / 4);
                    const sixteenth = this.currentPosition % 4;
                    this.positionDisplay.textContent = `${bar}.${beat}.${sixteenth}`;
                }
            }

            // Only update active renderer
            if (this.currentPresetType === 'builtin') {
                this.renderer.updateBeat(data.phase, this.barPhase);
                this.presetManager.handleBeat(data);
            } else if (this.currentPresetType === 'threejs' && this.threeJSRenderer) {
                this.threeJSRenderer.handleBeat(data);
            }
        });

        // Note events
        this.inputManager.on('note', (data) => {
            // Handle scene switching (notes 60-63 = scenes 0-3)
            if (data.note >= 60 && data.note <= 63 && data.source === 'midi' && this.currentPresetType === 'builtin') {
                const sceneIndex = data.note - 60;
                this.switchScene(sceneIndex);
            }

            // Only pass to active renderer
            if (this.currentPresetType === 'builtin') {
                this.sceneManager.handleMIDINote(data.note, data.velocity);
                this.presetManager.handleNote(data);
            } else if (this.currentPresetType === 'threejs' && this.threeJSRenderer) {
                this.threeJSRenderer.handleNote(data);
            }
        });

        // Control events
        this.inputManager.on('control', (data) => {
            // CC 1 = Milkdrop preset selection (0-127 maps to all presets)
            if (data.id === 1 && this.currentPresetType === 'milkdrop' && this.milkdropPresetKeys) {
                const index = Math.floor(data.value * this.milkdropPresetKeys.length);
                this.loadMilkdropPreset(index);
            }

            // Only pass to active renderer
            if (this.currentPresetType === 'builtin') {
                this.sceneManager.handleMIDICC(data.id, Math.round(data.value * 127));
                this.presetManager.handleControl(data);
            } else if (this.currentPresetType === 'threejs' && this.threeJSRenderer) {
                this.threeJSRenderer.handleControl(data);
            }
        });

        // Transport events
        this.inputManager.on('transport', (data) => {
            console.log('[Revision] Transport:', data.state, 'BPM:', data.bpm);
            if (data.bpm) {
                this.currentBPM = data.bpm;
                this.bpmDisplay.textContent = data.bpm;
                this.renderer.setBPM(data.bpm);
            }

            // Update position tracking on transport state changes
            if (data.source === 'midi' && this.midiSource) {
                this.lastMIDIUpdateTime = performance.now();
                this.lastMIDIPosition = this.midiSource.getSongPosition();

                if (data.state === 'play') {
                    console.log('[Revision] MIDI Start - Position reset to 0');
                }
            }
        });

        // Frequency events (from audio)
        this.inputManager.on('frequency', (data) => {
            // Only pass to active renderer
            if (this.currentPresetType === 'builtin') {
                this.presetManager.handleFrequency(data);
            } else if (this.currentPresetType === 'threejs' && this.threeJSRenderer) {
                this.threeJSRenderer.handleFrequency(data);
            }
            // Milkdrop gets audio directly via connectAudioSource
        });

        // SysEx events
        this.inputManager.on('sysex', (data) => {
            this.handleSysEx(data);
        });
    }

    handleSysEx(data) {
        // Revision SysEx format: F0 7D <command> [args...] F7
        // Manufacturer ID: 0x7D (Educational/Development use)

        if (data.manufacturerId !== 0x7D) return;

        const payload = data.payload;
        if (payload.length === 0) return;

        const command = payload[0];

        switch (command) {
            case 0x01: // Select preset mode
                // 0x01 <mode>: 0=builtin, 1=threejs, 2=milkdrop
                if (payload.length > 1) {
                    const modes = ['builtin', 'threejs', 'milkdrop'];
                    const mode = modes[payload[1]];
                    if (mode) {
                        this.switchPresetType(mode);
                        console.log('[SysEx] Mode:', mode);
                    }
                }
                break;

            case 0x02: // Select Milkdrop preset
                // 0x02 <index_msb> <index_lsb>
                if (payload.length > 2 && this.currentPresetType === 'milkdrop') {
                    const index = (payload[1] << 7) | payload[2];
                    this.loadMilkdropPreset(index);
                    console.log('[SysEx] Milkdrop preset:', index);
                }
                break;

            case 0x03: // Select built-in scene
                // 0x03 <scene>: 0-3
                if (payload.length > 1 && this.currentPresetType === 'builtin') {
                    const scene = payload[1];
                    if (scene < 4) {
                        this.switchScene(scene);
                        console.log('[SysEx] Scene:', scene);
                    }
                }
                break;

            case 0x10: // Next preset
                if (this.currentPresetType === 'milkdrop') {
                    const nextIndex = (this.currentMilkdropIndex + 1) % this.milkdropPresetKeys.length;
                    this.loadMilkdropPreset(nextIndex);
                    console.log('[SysEx] Next preset');
                }
                break;

            case 0x11: // Previous preset
                if (this.currentPresetType === 'milkdrop') {
                    let prevIndex = this.currentMilkdropIndex - 1;
                    if (prevIndex < 0) prevIndex = this.milkdropPresetKeys.length - 1;
                    this.loadMilkdropPreset(prevIndex);
                    console.log('[SysEx] Previous preset');
                }
                break;

            default:
                console.log('[SysEx] Unknown command:', command.toString(16));
        }
    }

    interpolateBeat() {
        if (this.lastMIDIUpdateTime === 0 || this.currentBPM === 0) {
            requestAnimationFrame(() => this.interpolateBeat());
            return;
        }

        const now = performance.now();
        const timeSinceUpdate = now - this.lastMIDIUpdateTime;

        const sixteenthsPerMinute = this.currentBPM * 4;
        const sixteenthsPerMs = sixteenthsPerMinute / 60000;
        const estimatedSixteenths = timeSinceUpdate * sixteenthsPerMs;

        const interpolatedPosition = this.lastMIDIPosition + estimatedSixteenths;

        const sixteenthsPerBeat = 4;
        const beatsPerBar = 4;

        const beatPosition = (interpolatedPosition / sixteenthsPerBeat) % 1;
        const barPosition = (interpolatedPosition / (sixteenthsPerBeat * beatsPerBar)) % 1;

        this.beatPhase = beatPosition;
        this.barPhase = barPosition;

        // Only update built-in renderer if in builtin mode
        if (this.currentPresetType === 'builtin') {
            this.renderer.updateBeat(this.beatPhase, this.barPhase);
            this.sceneManager.update(this.beatPhase, this.barPhase);
        }
        // Three.js and Milkdrop have their own animation loops
        // They're already running via start() method

        requestAnimationFrame(() => this.interpolateBeat());
    }

    setupUI() {
        // Control page
        document.getElementById('control-btn').addEventListener('click', () => {
            window.open('control.html', '_blank');
        });

        // Fullscreen
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.openSettings();
        });

        // Scene buttons
        document.querySelectorAll('.scene-button').forEach((button, index) => {
            button.addEventListener('click', () => {
                this.switchScene(index);
            });
        });

        // Fullscreen change
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                this.handleFullscreenEnter();
            } else {
                this.handleFullscreenExit();
            }
        });

        // Window resize (debounced)
        window.addEventListener('resize', () => {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 100);
        });

        // Settings - MIDI input
        document.getElementById('midi-input-select').addEventListener('change', (e) => {
            const inputId = e.target.value;
            if (inputId && this.midiSource) {
                this.midiSource.connectInput(inputId);
                this.settings.set('midiInputId', inputId);
                this.midiIndicator.classList.add('connected');
            }
        });

        // Settings - Audio input
        document.getElementById('audio-input-select').addEventListener('change', async (e) => {
            const audioInput = e.target.value;
            this.settings.set('audioInput', audioInput);

            if (audioInput === 'microphone') {
                await this.enableAudioInput();
            } else {
                this.disableAudioInput();
            }
        });

        // Settings - Preset type
        document.getElementById('preset-type-select').addEventListener('change', (e) => {
            this.switchPresetType(e.target.value);
        });

        // Settings - SysEx
        document.getElementById('sysex-enable').addEventListener('change', (e) => {
            this.settings.set('enableSysEx', e.target.value);
            console.log('[Revision] SysEx setting changed. Restart required.');
        });

        // Settings - Renderer
        document.getElementById('renderer-select').addEventListener('change', (e) => {
            const mode = e.target.value;
            this.settings.set('renderer', mode);
            this.renderer.stop();
            this.renderer.initialize(mode);
            this.renderer.resize();
            this.renderer.start();
        });

        // Settings - OSC
        document.getElementById('osc-server').addEventListener('change', (e) => {
            const server = e.target.value;
            this.settings.set('oscServer', server);
            if (server) {
                this.oscClient.disconnect();
                this.oscClient.connect(server);
            }
        });

        // Mobile touch events
        if (this.mobileCompat.isMobile) {
            this.builtinCanvas.addEventListener('mobiletouch', (e) => {
                const { type, data } = e.detail;
                console.log('[Revision] Mobile touch:', type, data);
            });
        }

    }

    loadMilkdropPreset(index) {
        if (!this.milkdropPresetKeys || !this.milkdropRenderer) return;

        // Clamp index
        index = Math.max(0, Math.min(index, this.milkdropPresetKeys.length - 1));
        this.currentMilkdropIndex = index;

        const key = this.milkdropPresetKeys[this.currentMilkdropIndex];
        const presets = butterchurnPresets.getPresets();
        this.milkdropRenderer.loadPreset(presets[key]);
        console.log('[Milkdrop] Loaded preset', this.currentMilkdropIndex + 1, '/', this.milkdropPresetKeys.length, ':', key);
    }

    async loadPresetConfig() {
        try {
            const response = await fetch('config/presets.json');
            if (response.ok) {
                this.presetConfig = await response.json();
                console.log('[Revision] Loaded preset config:', this.presetConfig);
            } else {
                console.warn('[Revision] No preset config found - using all presets');
            }
        } catch (error) {
            console.warn('[Revision] Failed to load preset config:', error.message);
        }
    }

    async switchPresetType(type) {
        this.currentPresetType = type;
        this.settings.set('presetType', type);

        // Check if libraries need to be loaded
        let libraryNeeded = null;
        if (type === 'threejs' && !this.libraryLoader.isLoaded('threejs')) {
            libraryNeeded = 'threejs';
        } else if (type === 'milkdrop' && !this.libraryLoader.isLoaded('butterchurn')) {
            libraryNeeded = 'butterchurn';
        }

        // Load library if needed
        if (libraryNeeded) {
            this.showLoadingMessage(`Loading ${libraryNeeded === 'butterchurn' ? 'Milkdrop' : 'Three.js'}...`);
            const success = await this.libraryLoader.load(libraryNeeded);
            this.hideLoadingMessage();

            if (!success) {
                alert(`Failed to load ${libraryNeeded}. Check your internet connection.`);
                return;
            }

            // Re-initialize renderer after library loads
            if (type === 'threejs' && !this.threeJSRenderer) {
                this.threeJSRenderer = new ThreeJSRenderer(this.threejsCanvas);
                await this.threeJSRenderer.initialize();
                this.presetManager.setRenderer('threejs', this.threeJSRenderer);
                this.presetManager.registerThreeJSPreset('threejs-default', {
                    name: 'Three.js Default',
                    description: 'Beat-reactive 3D scene with geometric shapes'
                });
            } else if (type === 'milkdrop' && !this.milkdropRenderer) {
                this.milkdropRenderer = new MilkdropRenderer(this.milkdropCanvas);
                await this.milkdropRenderer.initialize();
                this.presetManager.setRenderer('milkdrop', this.milkdropRenderer);
            }
        }

        // Stop all renderers
        this.renderer.stop();
        if (this.threeJSRenderer) this.threeJSRenderer.stop();
        if (this.milkdropRenderer) this.milkdropRenderer.stop();

        // Hide all canvases
        this.builtinCanvas.style.display = 'none';
        this.threejsCanvas.style.display = 'none';
        this.milkdropCanvas.style.display = 'none';

        // Switch to appropriate preset
        switch (type) {
            case 'builtin':
                this.builtinCanvas.style.display = 'block';
                this.renderer.start();
                this.presetManager.switchPreset('builtin-tunnel');
                this.enableSceneButtons(true);
                console.log('[Revision] Built-in canvas visible, renderer started');
                break;
            case 'threejs':
                this.threejsCanvas.style.display = 'block';
                if (this.threeJSRenderer) {
                    // Force reflow to get proper dimensions
                    this.threejsCanvas.offsetHeight;
                    const w = this.threejsCanvas.clientWidth || window.innerWidth;
                    const h = this.threejsCanvas.clientHeight || (window.innerHeight - 120);
                    console.log('[ThreeJS] Canvas size:', w, 'x', h);
                    console.log('[ThreeJS] Canvas visible:', this.threejsCanvas.style.display);
                    console.log('[ThreeJS] Renderer exists:', !!this.threeJSRenderer.renderer);
                    console.log('[ThreeJS] Scene objects:', this.threeJSRenderer.objects.length);
                    console.log('[ThreeJS] Camera position:', this.threeJSRenderer.camera.position);
                    console.log('[ThreeJS] Debug info:', this.threeJSRenderer.getDebugInfo());
                    this.threeJSRenderer.resize(w, h);
                    this.threeJSRenderer.start();
                    console.log('[ThreeJS] Started, isAnimating:', this.threeJSRenderer.isAnimating);
                } else {
                    console.error('[Revision] Three.js renderer not initialized');
                }
                this.enableSceneButtons(false, 'Three.js mode - scene buttons disabled');
                break;
            case 'milkdrop':
                this.milkdropCanvas.style.display = 'block';
                if (this.milkdropRenderer && this.milkdropRenderer.isInitialized) {
                    // Force reflow
                    this.milkdropCanvas.offsetHeight;
                    const w = this.milkdropCanvas.clientWidth || window.innerWidth;
                    const h = this.milkdropCanvas.clientHeight || window.innerHeight - 120;
                    console.log('[Milkdrop] Canvas size:', w, 'x', h);
                    console.log('[Milkdrop] Canvas visible:', this.milkdropCanvas.style.display);
                    console.log('[Milkdrop] Visualizer exists:', !!this.milkdropRenderer.visualizer);
                    console.log('[Milkdrop] Is initialized:', this.milkdropRenderer.isInitialized);

                    this.milkdropRenderer.resize(w, h);

                    // Connect audio source if already enabled
                    if (this.audioSource && this.audioSource.analyser) {
                        try {
                            this.milkdropRenderer.connectAudioSource(this.audioSource.analyser);
                            console.log('[Milkdrop] Audio connected');
                        } catch (error) {
                            console.warn('[Milkdrop] Audio connection failed:', error.message);
                        }
                    }

                    this.milkdropRenderer.start();

                    // Load first preset
                    if (this.milkdropPresetKeys && this.milkdropPresetKeys.length > 0) {
                        this.loadMilkdropPreset(0);
                        console.log('[Milkdrop]', this.milkdropPresetKeys.length, 'presets - use MIDI CC1 (mod wheel) to browse');
                    }
                    console.log('[Milkdrop] Started');
                } else {
                    console.error('[Revision] Milkdrop renderer not initialized properly');
                    console.error('[Revision] Renderer exists:', !!this.milkdropRenderer);
                    console.error('[Revision] Is initialized:', this.milkdropRenderer ? this.milkdropRenderer.isInitialized : 'N/A');
                    // Fallback to builtin
                    this.builtinCanvas.style.display = 'block';
                    this.milkdropCanvas.style.display = 'none';
                    this.renderer.start();
                    this.currentPresetType = 'builtin';
                }
                this.enableSceneButtons(false, 'Milkdrop - MIDI CC1 controls preset');
                break;
        }

        console.log('[Revision] Switched to preset type:', type);
    }


    enableSceneButtons(enabled, message = null) {
        const buttons = document.querySelectorAll('.scene-button');
        buttons.forEach(button => {
            button.disabled = !enabled;
            button.style.opacity = enabled ? '1' : '0.3';
            button.style.cursor = enabled ? 'pointer' : 'not-allowed';
            if (message && !enabled) {
                button.title = message;
            } else {
                button.title = '';
            }
        });

        console.log('[Revision] Scene buttons', enabled ? 'enabled' : 'disabled');
    }

    showLoadingMessage(message) {
        let loader = document.getElementById('library-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'library-loader';
            loader.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 102, 255, 0.95);
                color: white;
                padding: 30px 50px;
                border-radius: 10px;
                z-index: 10000;
                font-family: sans-serif;
                font-size: 18px;
                text-align: center;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `;
            document.body.appendChild(loader);
        }
        loader.innerHTML = `<div>${message}</div><div style="font-size: 12px; margin-top: 10px; opacity: 0.8;">Please wait...</div>`;
    }

    hideLoadingMessage() {
        const loader = document.getElementById('library-loader');
        if (loader) {
            loader.remove();
        }
    }

    switchScene(sceneIndex) {
        // Only allow scene switching in builtin mode
        if (this.currentPresetType !== 'builtin') {
            console.log('[Revision] Scene switching only available in Built-in mode');
            return;
        }

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

    openSettings() {
        this.settingsModal.classList.add('active');
        this.populateMIDIDevices();

        // Load current settings
        document.getElementById('renderer-select').value = this.settings.get('renderer') || 'webgl';
        document.getElementById('osc-server').value = this.settings.get('oscServer') || '';
        document.getElementById('audio-input-select').value = this.settings.get('audioInput') || 'none';
        document.getElementById('preset-type-select').value = this.settings.get('presetType') || 'builtin';
        document.getElementById('sysex-enable').value = this.settings.get('enableSysEx') || 'true';

        // Update mobile info
        if (this.mobileCompat.isMobile) {
            this.updateMobileInfo();
        }
    }

    populateMIDIDevices() {
        if (!this.midiSource) return;

        const select = document.getElementById('midi-input-select');
        const inputs = this.midiSource.getInputs();

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

        const currentId = this.settings.get('midiInputId');
        if (currentId) {
            select.value = currentId;
        }
    }

    showMobileInfo() {
        const mobileInfo = document.getElementById('mobile-info');
        if (mobileInfo) {
            mobileInfo.style.display = 'block';
        }
    }

    updateMobileInfo() {
        const info = this.mobileCompat.getInfo();
        const platformDiv = document.getElementById('mobile-platform');
        const fpsDiv = document.getElementById('mobile-fps');

        if (platformDiv) {
            platformDiv.textContent = `Platform: ${info.isAndroid ? 'Android' : info.isMobile ? 'Mobile' : 'Desktop'} | Quality: ${info.optimalSettings.quality}`;
        }

        if (fpsDiv) {
            const fps = this.mobileCompat.measureFPS();
            fpsDiv.textContent = `FPS: ${fps} | Pixel Ratio: ${info.maxPixelRatio}`;
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.body.requestFullscreen().catch(err => {
                console.error('[Revision] Fullscreen failed:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }

    handleResize() {
        const isFullscreen = !!document.fullscreenElement;
        const w = window.innerWidth;
        const h = isFullscreen ? window.innerHeight : (window.innerHeight - 120);

        console.log('[Revision] Window resized:', w, 'x', h, 'fullscreen:', isFullscreen);

        // Resize active renderer
        switch (this.currentPresetType) {
            case 'builtin':
                this.renderer.resize();
                break;
            case 'threejs':
                if (this.threeJSRenderer) {
                    this.threeJSRenderer.resize(w, h);
                    console.log('[ThreeJS] Resized to:', w, 'x', h);
                }
                break;
            case 'milkdrop':
                if (this.milkdropRenderer) {
                    this.milkdropRenderer.resize(w, h);
                    console.log('[Milkdrop] Resized to:', w, 'x', h);
                }
                break;
        }
    }

    handleFullscreenEnter() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.handleResize();
    }

    handleFullscreenExit() {
        this.handleResize();
    }
}

// Global function for UI
function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
    const app = new RevisionAppV2();
    app.initialize();
    window.app = app;
});
