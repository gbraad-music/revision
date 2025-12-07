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
        this.midiAudioSynth = null; // MIDI-to-audio synthesizer for Milkdrop
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
        this.modeDisplay = document.getElementById('mode-display');

        // BroadcastChannel for control.html communication
        this.controlChannel = new BroadcastChannel('revision-control');

        // Broadcast state periodically
        this.lastBroadcastTime = 0;
        this.lastSPPWarningTime = 0;

        // State
        this.currentBPM = 120;
        this.currentPosition = 0;
        this.beatPhase = 0;
        this.barPhase = 0;
        this.currentPresetType = 'builtin';
        this.currentScene = 0;

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

        // Initialize MIDI-to-audio synthesizer (only if explicitly selected)
        // Default: use regular audio input (microphone)
        const visualAudioSource = this.settings.get('visualAudioSource') || 'microphone'; // Default microphone
        if (visualAudioSource === 'midi') {
            this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
            this.midiAudioSynth.initialize();
            console.log('[Revision] MIDI audio synthesizer initialized');
        } else {
            console.log('[Revision] Using audio input (microphone) for visualsAudio synth disabled');
        }

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

        // Setup BroadcastChannel for control.html
        this.setupControlChannel();

        // Hide all canvases initially
        this.builtinCanvas.style.display = 'none';
        this.threejsCanvas.style.display = 'none';
        this.milkdropCanvas.style.display = 'none';

        // Load last preset type and scene
        const lastPresetType = this.settings.get('presetType') || 'builtin';
        const lastScene = this.settings.get('lastScene') || 0;
        this.currentScene = lastScene;

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

        console.log('[Revision V2] ═══════════════════════════════════════════════════════');
        console.log('[Revision V2] ✓ Initialized successfully');
        console.log('[Revision V2] Available presets:', this.presetManager.getAllPresets().length);
        console.log('[Revision V2] ═══════════════════════════════════════════════════════');
        console.log('[Revision V2] CURRENT CONFIGURATION:');
        console.log('[Revision V2]   Visual Mode:', this.currentPresetType);
        console.log('[Revision V2]   Audio Source Setting:', this.settings.get('visualAudioSource') || 'microphone');
        console.log('[Revision V2]   MIDI Synth Active:', !!this.midiAudioSynth);
        console.log('[Revision V2]   MIDI Device Selected:', this.settings.get('midiInputId') || 'NONE');
        console.log('[Revision V2]   MIDI Channel Filter:', this.settings.get('midiSynthChannel') || 'all');
        console.log('[Revision V2]   Audio Input Active:', this.audioSource?.isActive || false);
        console.log('[Revision V2] ═══════════════════════════════════════════════════════');
        console.log('[Revision V2] 📝 To use MIDI Synth:');
        console.log('[Revision V2]   1. Open control.html');
        console.log('[Revision V2]   2. Select a MIDI device in "MIDI Device"');
        console.log('[Revision V2]   3. Switch to MILKDROP mode (Preset Mode)');
        console.log('[Revision V2]   4. Load a Milkdrop preset (Next/Prev buttons)');
        console.log('[Revision V2]   5. Select "MIDI Synthesizer" in "MIDI Input"');
        console.log('[Revision V2]   6. Play notes on the selected MIDI channel');
        console.log('[Revision V2] ═══════════════════════════════════════════════════════');

        if (this.currentPresetType !== 'milkdrop') {
            console.warn('[Revision V2] ⚠️⚠️⚠️ YOU ARE NOT IN MILKDROP MODE! ⚠️⚠️⚠️');
            console.warn('[Revision V2] Current mode:', this.currentPresetType);
            console.warn('[Revision V2] Switch to Milkdrop in control.html to see MIDI visuals!');
        }
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
                console.log('[Revision] 🔌 Auto-connecting to saved MIDI device:', lastMidiId);
                this.midiSource.connectInput(lastMidiId);
            } else {
                console.warn('[Revision] ⚠️ NO MIDI DEVICE SELECTED! Go to control.html -> MIDI Device to select one');
            }
        } else {
            console.error('[Revision] ❌ MIDI initialization FAILED - no MIDI support');
        }

        // Initialize Audio input (if enabled)
        const audioDeviceId = this.settings.get('audioInputDeviceId');
        if (audioDeviceId) {
            await this.enableAudioInput(audioDeviceId);
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

    setupControlChannel() {
        // Listen for commands from control.html
        this.controlChannel.onmessage = (event) => {
            const { command, data } = event.data;

            console.log('[BroadcastChannel] Received command:', command, 'data:', data);

            switch (command) {
                case 'switchMode':
                    this.switchPresetType(data);
                    break;
                case 'switchScene':
                    this.switchScene(data);
                    break;
                case 'milkdropNext':
                    console.log('[BroadcastChannel] milkdropNext - currentPresetType:', this.currentPresetType);
                    if (this.currentPresetType === 'milkdrop') {
                        console.log('[Control] Milkdrop Next pressed - currentIndex:', this.currentMilkdropIndex);
                        // loadMilkdropPreset handles initialization
                        const currentIndex = this.currentMilkdropIndex || 0;
                        this.loadMilkdropPreset(currentIndex + 1);
                    } else {
                        console.warn('[Control] Milkdrop Next pressed but mode is:', this.currentPresetType);
                    }
                    break;
                case 'milkdropPrev':
                    if (this.currentPresetType === 'milkdrop') {
                        console.log('[Control] Milkdrop Prev pressed');
                        const currentIndex = this.currentMilkdropIndex || 0;
                        this.loadMilkdropPreset(currentIndex - 1);
                    }
                    break;
                case 'milkdropSelect':
                    if (this.currentPresetType === 'milkdrop') {
                        this.loadMilkdropPreset(data);
                    }
                    break;
                case 'audioDeviceSelect':
                    if (data === 'none') {
                        this.disableAudioInput();
                        this.settings.set('audioInputDeviceId', '');
                    } else {
                        this.settings.set('audioInputDeviceId', data);
                        this.enableAudioInput(data);
                    }
                    break;
                case 'midiSynthEnable':
                    console.log('[BroadcastChannel] MIDI Synth Enable:', data);
                    this.settings.set('midiSynthEnable', data);
                    if (data === 'true' && !this.midiAudioSynth) {
                        // Enable synth
                        this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
                        this.midiAudioSynth.initialize();
                        console.log('[Revision] MIDI audio synthesizer ENABLED');
                    } else if (data === 'false' && this.midiAudioSynth) {
                        // Disable synth
                        this.midiAudioSynth.destroy();
                        this.midiAudioSynth = null;
                        console.log('[Revision] MIDI audio synthesizer DISABLED');
                    }
                    break;
                case 'milkdropAudioSource':
                    console.log('[BroadcastChannel] ═══════════════════════════════════════');
                    console.log('[BroadcastChannel] SWITCHING Audio Source to:', data);
                    console.log('[BroadcastChannel] Current synth state:', this.midiAudioSynth ? 'EXISTS' : 'NULL');
                    this.settings.set('visualAudioSource', data);

                    // Enable/disable MIDI synth based on source
                    if (data === 'midi') {
                        if (!this.midiAudioSynth) {
                            console.log('[Revision] Creating new MIDI synthesizer...');
                            this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
                            this.midiAudioSynth.initialize();
                            console.log('[Revision] ✓ MIDI synthesizer CREATED');
                        } else {
                            console.log('[Revision] ✓ MIDI synthesizer already exists, keeping it');
                        }

                        // CRITICAL: Unregister audio source, register MIDI synth
                        console.log('[Revision] Unregistering audio source from InputManager');
                        this.inputManager.unregisterSource('audio');
                        console.log('[Revision] Registering MIDI synth with InputManager');
                        this.inputManager.registerSource('midi-synth', this.midiAudioSynth);
                    } else if (data === 'microphone') {
                        if (this.midiAudioSynth) {
                            console.log('[Revision] Destroying MIDI synthesizer...');
                            console.log('[Revision] Unregistering MIDI synth from InputManager');
                            this.inputManager.unregisterSource('midi-synth');
                            this.midiAudioSynth.destroy();
                            this.midiAudioSynth = null;
                            console.log('[Revision] ✓ MIDI synthesizer DESTROYED - using microphone');
                        } else {
                            console.log('[Revision] ✓ Already using microphone');
                        }

                        // Re-register audio source
                        if (this.audioSource && this.audioSource.isActive) {
                            console.log('[Revision] Re-registering audio source with InputManager');
                            this.inputManager.registerSource('audio', this.audioSource);
                        }
                    }

                    console.log('[BroadcastChannel] Reconnecting audio to renderer...');
                    // Reconnect audio to active renderer immediately
                    this.reconnectAudioToRenderer();

                    console.log('[BroadcastChannel] Broadcasting state update...');
                    // Update display immediately
                    this.broadcastState();
                    console.log('[BroadcastChannel] ═══════════════════════════════════════');
                    break;
                case 'midiSynthChannel':
                    console.log('[BroadcastChannel] MIDI Synth Channel:', data);
                    this.settings.set('midiSynthChannel', data);
                    console.log('[Revision] MIDI synth now listening to:', data === 'all' ? 'All Channels' : `Channel ${parseInt(data) + 1}`);

                    // Update display immediately
                    this.broadcastState();
                    break;
                case 'midiSynthAudible':
                    console.log('[BroadcastChannel] MIDI Synth Audible:', data);
                    this.settings.set('midiSynthAudible', data);
                    if (this.midiAudioSynth) {
                        this.midiAudioSynth.setAudible(data === 'true');
                    }

                    // Update display immediately
                    this.broadcastState();
                    break;
                case 'midiInputSelect':
                    console.log('[BroadcastChannel] MIDI Input Select:', data);
                    if (data && this.midiSource) {
                        this.midiSource.connectInput(data);
                        this.settings.set('midiInputId', data);
                        this.midiIndicator.classList.add('connected');
                        this.broadcastState();
                    }
                    break;
                case 'sysexEnable':
                    console.log('[BroadcastChannel] SysEx Enable:', data);
                    this.settings.set('enableSysEx', data);
                    console.log('[Revision] SysEx setting changed to:', data, '- Reload required');
                    this.broadcastState();
                    break;
                case 'rendererSelect':
                    console.log('[BroadcastChannel] Renderer Select:', data);
                    this.settings.set('renderer', data);
                    this.renderer.stop();
                    this.renderer.initialize(data);
                    this.renderer.resize();
                    this.renderer.start();
                    console.log('[Revision] Renderer switched to:', data);
                    this.broadcastState();
                    break;
                case 'oscServer':
                    console.log('[BroadcastChannel] OSC Server:', data);
                    this.settings.set('oscServer', data);
                    if (data) {
                        this.oscClient.disconnect();
                        this.oscClient.connect(data);
                        console.log('[Revision] OSC connected to:', data);
                    } else {
                        this.oscClient.disconnect();
                        console.log('[Revision] OSC disconnected');
                    }
                    this.broadcastState();
                    break;
                case 'requestState':
                    this.broadcastState();
                    break;
            }
        };
    }

    reconnectAudioToRenderer() {
        console.log('[Revision] ═══ RECONNECT AUDIO ═══');
        console.log('[Revision] Current mode:', this.currentPresetType);
        console.log('[Revision] MIDI Synth exists:', !!this.midiAudioSynth);
        console.log('[Revision] Audio source active:', this.audioSource?.isActive);
        console.log('[Revision] Settings visualAudioSource:', this.settings.get('visualAudioSource'));

        // Only reconnect for Milkdrop (others use frequency events)
        if (this.currentPresetType === 'milkdrop' && this.milkdropRenderer && this.milkdropRenderer.isInitialized) {
            console.log('[Revision] Milkdrop is active - reconnecting...');
            let audioConnected = false;

            // Try MIDI synth first
            if (this.midiAudioSynth && this.midiAudioSynth.getAnalyser()) {
                try {
                    console.log('[Revision] Attempting to connect MIDI synth to Milkdrop...');
                    this.milkdropRenderer.connectAudioSource(this.midiAudioSynth.getAnalyser());
                    console.log('[Milkdrop] ✓ Switched to MIDI synthesizer');
                    audioConnected = true;
                } catch (error) {
                    console.error('[Milkdrop] Failed to connect MIDI synth:', error.message);
                }
            }

            // Fallback to microphone
            if (!audioConnected && this.audioSource && this.audioSource.analyser && this.audioSource.isActive) {
                try {
                    console.log('[Revision] Attempting to connect microphone to Milkdrop...');
                    this.milkdropRenderer.connectAudioSource(this.audioSource.analyser);
                    console.log('[Milkdrop] ✓ Switched to microphone');
                    audioConnected = true;
                } catch (error) {
                    console.error('[Milkdrop] Failed to connect microphone:', error.message);
                }
            }

            if (!audioConnected) {
                console.warn('[Milkdrop] ⚠️ No audio source connected!');
            }
        } else {
            console.log('[Revision] Not in Milkdrop mode - audio routing handled via frequency events');
        }
        console.log('[Revision] ═══ END RECONNECT ═══');
    }

    getFormattedAudioSource() {
        const visualSource = this.settings.get('visualAudioSource') || 'microphone';

        if (visualSource === 'midi') {
            const channel = this.settings.get('midiSynthChannel') || 'all';
            if (channel === 'all') {
                return 'MIDI All';
            } else {
                const channelNum = parseInt(channel) + 1;
                return `MIDI Ch.${channelNum}`;
            }
        } else {
            return 'Audio Input';
        }
    }

    broadcastState() {
        const bar = Math.floor(this.currentPosition / 16);
        const beat = Math.floor((this.currentPosition % 16) / 4);
        const sixteenth = Math.floor(this.currentPosition % 4);

        const state = {
            mode: this.currentPresetType,
            scene: this.currentScene,
            bpm: this.currentBPM,
            position: `${bar}.${beat}.${sixteenth}`,
            audioDeviceId: this.settings.get('audioInputDeviceId') || 'none',
            visualAudioSource: this.settings.get('visualAudioSource') || 'microphone',
            midiSynthChannel: this.settings.get('midiSynthChannel') || 'all',
            midiSynthAudible: this.settings.get('midiSynthAudible') === 'true' ? 'true' : 'false',
            audioSourceDisplay: this.getFormattedAudioSource(),
            midiInputId: this.settings.get('midiInputId') || '',
            enableSysEx: this.settings.get('enableSysEx') || 'true',
            renderer: this.settings.get('renderer') || 'webgl',
            oscServer: this.settings.get('oscServer') || '',
            presetName: this.currentPresetType === 'milkdrop' && this.milkdropPresetKeys
                ? this.milkdropPresetKeys[this.currentMilkdropIndex]
                : '-'
        };

        this.controlChannel.postMessage({
            type: 'stateUpdate',
            data: state
        });

        // Update local display
        const audioSourceDisplay = document.getElementById('audio-source-display');
        if (audioSourceDisplay) {
            audioSourceDisplay.textContent = state.audioSourceDisplay;
        }

        // Send preset list if in milkdrop mode
        if (this.milkdropPresetKeys) {
            this.controlChannel.postMessage({
                type: 'presetList',
                data: this.milkdropPresetKeys
            });
        }
    }

    async enableAudioInput(deviceId = null) {
        if (!this.audioSource) {
            this.audioSource = new AudioInputSource();
            await this.audioSource.initialize(
                this.mobileCompat.getOptimalSettings()
            );
        }

        const success = await this.audioSource.connectMicrophone(deviceId);
        if (success) {
            this.inputManager.registerSource('audio', this.audioSource);
            this.audioIndicator.classList.add('connected');
            this.audioIndicator.style.backgroundColor = '#0066FF';
            this.audioIndicator.style.boxShadow = '0 0 8px #0066FF';

            // Connect to Milkdrop ONLY if Milkdrop is the active mode
            if (this.currentPresetType === 'milkdrop' &&
                this.milkdropRenderer &&
                this.milkdropRenderer.isInitialized &&
                this.audioSource.analyser) {
                this.milkdropRenderer.connectAudioSource(this.audioSource.analyser);
                console.log('[Revision] Audio connected to Milkdrop renderer');
            }

            const deviceInfo = deviceId ? `device: ${deviceId.substring(0, 8)}...` : 'default device';
            console.log('[Revision] Audio input enabled:', deviceInfo);
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

            // Feed beats to MIDI synthesizer (generates kick drum)
            if (this.midiAudioSynth && data.source === 'midi') {
                this.midiAudioSynth.handleBeat(data.intensity || 1.0);
            }

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
            // Feed MIDI notes to synthesizer (if enabled and on correct channel)
            if (this.midiAudioSynth && data.source === 'midi') {
                const synthChannel = this.settings.get('midiSynthChannel') || 'all';
                const matchesChannel = (synthChannel === 'all') || (parseInt(synthChannel) === data.channel);

                console.log(`[Revision] 🎵 MIDI Note - Ch.${data.channel + 1} Note:${data.note} Vel:${data.velocity} | Synth filter: ${synthChannel === 'all' ? 'All' : 'Ch.' + (parseInt(synthChannel) + 1)} | Match: ${matchesChannel}`);

                if (matchesChannel) {
                    if (data.velocity > 0) {
                        console.log(`[Revision] ✓ Sending to synth - Note ON`);
                        this.midiAudioSynth.handleNoteOn(data.note, data.velocity);
                    } else {
                        console.log(`[Revision] ✓ Sending to synth - Note OFF`);
                        this.midiAudioSynth.handleNoteOff(data.note);
                    }
                } else {
                    console.log(`[Revision] ✗ FILTERED OUT - Channel mismatch`);
                }
            } else if (data.source === 'midi') {
                console.log(`[Revision] ⚠️ MIDI Synth NOT ACTIVE - visualAudioSource: ${this.settings.get('visualAudioSource')}`);
            }

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
                this.currentPosition = this.lastMIDIPosition;

                // Update position display immediately
                if (this.positionDisplay) {
                    const bar = Math.floor(this.currentPosition / 16);
                    const beat = Math.floor((this.currentPosition % 16) / 4);
                    const sixteenth = this.currentPosition % 4;
                    this.positionDisplay.textContent = `${bar}.${beat}.${sixteenth}`;
                }

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
        this.currentPosition = interpolatedPosition;

        const sixteenthsPerBeat = 4;
        const beatsPerBar = 4;

        const beatPosition = (interpolatedPosition / sixteenthsPerBeat) % 1;
        const barPosition = (interpolatedPosition / (sixteenthsPerBeat * beatsPerBar)) % 1;

        this.beatPhase = beatPosition;
        this.barPhase = barPosition;

        // Update position display continuously
        if (this.positionDisplay) {
            const timeSinceLastSPP = this.midiSource ? (now - (this.midiSource.lastSPPTime || 0)) : Infinity;

            // Only update position if SPP has been received recently (within 5 seconds)
            if (timeSinceLastSPP < 5000) {
                const bar = Math.floor(this.currentPosition / 16);
                const beat = Math.floor((this.currentPosition % 16) / 4);
                const sixteenth = Math.floor(this.currentPosition % 4);
                this.positionDisplay.textContent = `${bar}.${beat}.${sixteenth}`;
            } else {
                // No SPP - show warning
                this.positionDisplay.textContent = '-.-.-- (NO SPP!)';
            }

            // Warn in console if no SPP for 10 seconds
            if (!this.lastSPPWarningTime || now - this.lastSPPWarningTime > 10000) {
                if (timeSinceLastSPP > 10000 && timeSinceLastSPP < Infinity) {
                    console.warn('[Revision] ⚠️ No SPP received for', Math.floor(timeSinceLastSPP / 1000), 'seconds - position frozen!');
                    this.lastSPPWarningTime = now;
                }
            }
        }

        // Broadcast state to control.html every 100ms
        if (now - this.lastBroadcastTime > 100) {
            this.broadcastState();
            this.lastBroadcastTime = now;
        }

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

        // Mobile touch events
        if (this.mobileCompat.isMobile) {
            this.builtinCanvas.addEventListener('mobiletouch', (e) => {
                const { type, data } = e.detail;
                console.log('[Revision] Mobile touch:', type, data);
            });
        }

    }

    loadMilkdropPreset(index) {
        if (!this.milkdropRenderer) {
            console.warn('[Milkdrop] Renderer not available');
            return;
        }

        // Initialize preset keys if not already done
        if (!this.milkdropPresetKeys || this.milkdropPresetKeys.length === 0) {
            const allPresets = butterchurnPresets.getPresets();
            const allPresetKeys = Object.keys(allPresets);

            // Use playlist from config if available
            if (this.presetConfig && this.presetConfig.milkdrop && this.presetConfig.milkdrop.playlist) {
                const playlist = this.presetConfig.milkdrop.playlist;
                this.milkdropPresetKeys = playlist.filter(name => allPresetKeys.includes(name));

                // If playlist is empty or filtered out everything, use all presets
                if (this.milkdropPresetKeys.length === 0) {
                    console.warn('[Milkdrop] Playlist empty or invalid, using all presets');
                    this.milkdropPresetKeys = allPresetKeys;
                }
            } else {
                this.milkdropPresetKeys = allPresetKeys;
            }

            console.log('[Milkdrop] Initialized with', this.milkdropPresetKeys.length, 'presets');
            this.currentMilkdropIndex = 0;
        }

        // Wrap index (support both positive and negative wrapping)
        const totalPresets = this.milkdropPresetKeys.length;
        index = ((index % totalPresets) + totalPresets) % totalPresets;
        this.currentMilkdropIndex = index;

        const key = this.milkdropPresetKeys[this.currentMilkdropIndex];
        const presets = butterchurnPresets.getPresets();
        const preset = presets[key];

        if (!preset) {
            console.error('[Milkdrop] Preset not found for key:', key);
            console.error('[Milkdrop] Index:', index, 'Keys length:', this.milkdropPresetKeys.length);
            console.error('[Milkdrop] First 10 available keys:', Object.keys(presets).slice(0, 10));
            return;
        }

        const success = this.milkdropRenderer.loadPreset(preset);
        if (success) {
            console.log('[Milkdrop] Loaded preset', this.currentMilkdropIndex + 1, '/', this.milkdropPresetKeys.length, ':', key);
            // Broadcast state update
            this.broadcastState();
        }
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
                    // Force reflow
                    this.threejsCanvas.offsetHeight;

                    // Use actual window dimensions
                    const isFullscreen = !!document.fullscreenElement;
                    const w = window.innerWidth;
                    const h = isFullscreen ? window.innerHeight : (window.innerHeight - 120);

                    this.threeJSRenderer.resize(w, h);
                    this.threeJSRenderer.start();

                    // Check if audio input is enabled
                    if (!this.audioSource || !this.audioSource.isActive) {
                        console.warn('[ThreeJS] Enable Audio Input (microphone) in Settings for audio reactivity');
                    }
                } else {
                    console.error('[Revision] Three.js renderer not initialized');
                }
                this.enableSceneButtons(false, 'Three.js mode - scene buttons disabled');
                break;
            case 'milkdrop':
                this.milkdropCanvas.style.display = 'block';
                if (this.milkdropRenderer && this.milkdropRenderer.isInitialized) {
                    console.log('[Milkdrop] Starting renderer...');

                    // Force reflow
                    this.milkdropCanvas.offsetHeight;
                    const w = this.milkdropCanvas.clientWidth || window.innerWidth;
                    const h = this.milkdropCanvas.clientHeight || window.innerHeight - 120;

                    this.milkdropRenderer.resize(w, h);

                    // Connect audio source to Milkdrop
                    // Priority: MIDI synth (if enabled) > Microphone (if enabled)
                    let audioConnected = false;

                    if (this.midiAudioSynth && this.midiAudioSynth.getAnalyser()) {
                        try {
                            const analyser = this.midiAudioSynth.getAnalyser();
                            console.log('[Milkdrop] Attempting to connect MIDI synth analyser:', analyser);
                            this.milkdropRenderer.connectAudioSource(analyser);
                            console.log('[Milkdrop] ✓ MIDI synthesizer connected - Milkdrop will visualize MIDI!');
                            audioConnected = true;
                        } catch (error) {
                            console.error('[Milkdrop] Failed to connect MIDI synth:', error.message);
                        }
                    }

                    // Fallback to microphone if MIDI synth not available
                    if (!audioConnected && this.audioSource && this.audioSource.analyser && this.audioSource.isActive) {
                        try {
                            this.milkdropRenderer.connectAudioSource(this.audioSource.analyser);
                            console.log('[Milkdrop] ✓ Microphone connected - Milkdrop will visualize audio input');
                            audioConnected = true;
                        } catch (error) {
                            console.error('[Milkdrop] Failed to connect microphone:', error.message);
                        }
                    }

                    if (!audioConnected) {
                        console.warn('[Milkdrop] ⚠️ No audio source connected! Enable MIDI synth or microphone for visualization');
                    }

                    // Start rendering IMMEDIATELY
                    this.milkdropRenderer.start();
                    console.log('[Milkdrop] Renderer started');
                    console.log('[Milkdrop] Ready - use control.html to select preset');
                } else {
                    console.error('[Revision] Milkdrop renderer not initialized properly');
                    // Fallback to builtin
                    this.builtinCanvas.style.display = 'block';
                    this.milkdropCanvas.style.display = 'none';
                    this.renderer.start();
                    this.currentPresetType = 'builtin';
                }
                this.enableSceneButtons(false, 'Milkdrop - MIDI CC1 controls preset');
                break;
        }

        // Update mode display
        const modeNames = { builtin: 'Built-in', threejs: 'Three.js', milkdrop: 'Milkdrop' };
        if (this.modeDisplay) {
            this.modeDisplay.textContent = modeNames[type] || type;
        }

        // Broadcast state update
        this.broadcastState();

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
            this.currentScene = sceneIndex;
            this.updateSceneButtons(sceneIndex);
            this.settings.set('lastScene', sceneIndex);

            // Broadcast state update
            this.broadcastState();
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
