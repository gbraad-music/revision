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
        this.wakeLock = new WakeLockManager();

        // Input sources
        this.midiSource = null; // MIDI input for clock/SPP/control
        this.midiSynthSource = null; // MIDI input for synth notes (can be different device or looped audio-reactive output)
        this.midiOutputSource = null; // MIDI output for audio-reactive MIDI generation
        this.audioSource = null;
        this.midiAudioSynth = null; // MIDI-to-audio synthesizer for Milkdrop
        this.oscClient = new OSCClient();

        // Renderers
        this.renderer = new VisualRenderer('builtin-canvas');
        this.sceneManager = null;
        this.threeJSRenderer = null;
        this.milkdropRenderer = null;
        this.videoRenderer = null;
        this.mediaRenderer = null;
        this.streamRenderer = null;
        this.webpageRenderer = null;

        // UI elements
        this.builtinCanvas = document.getElementById('builtin-canvas');
        this.threejsCanvas = document.getElementById('threejs-canvas');
        this.milkdropCanvas = document.getElementById('milkdrop-canvas');
        this.videoCanvas = document.getElementById('video-canvas');
        this.mediaCanvas = document.getElementById('media-canvas');
        this.streamCanvas = document.getElementById('stream-canvas');
        this.webpageContainer = document.getElementById('webpage-container');
        this.blackScreen = document.getElementById('black-screen');
        this.midiIndicator = document.getElementById('midi-indicator');
        this.audioIndicator = document.getElementById('audio-indicator');
        this.bpmDisplay = document.getElementById('bpm-display');
        this.positionDisplay = document.getElementById('position-display');
        this.modeDisplay = document.getElementById('mode-display');

        // RemoteChannel for control.html communication (WebSocket + BroadcastChannel fallback)
        this.controlChannel = new RemoteChannel('revision-control');

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
        this.currentVisualAudioSource = 'microphone'; // ACTUAL running state (not saved setting)

        // Beat interpolation
        this.lastMIDIUpdateTime = performance.now();
        this.lastMIDIPosition = 0;

        // Frequency data for EQ display
        this.lastFrequencyData = { bass: 0, mid: 0, high: 0 };

        // Resize debounce
        this.resizeTimeout = null;

        // Preset configuration
        this.presetConfig = null;
    }


    async checkAndUpdatePermissionButton() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(d => d.kind === 'videoinput' && d.label);
        const hasAudio = devices.some(d => d.kind === 'audioinput' && d.label);

        const btn = document.getElementById('permissions-btn');
        if (!btn) return;

        // Only show button if camera OR audio missing
        // MIDI is checked separately (never auto-initialized to avoid blocking prompts)
        if (hasCamera && hasAudio) {
            btn.style.display = 'none';
        } else {
            btn.classList.add('perm-denied');
            btn.textContent = 'PERMISSIONS !';
            btn.style.display = '';
        }
    }

    async requestPermissions() {
        console.log('[Revision] Requesting permissions...');
        let hasMidi = false;

        // Request camera
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoStream.getTracks().forEach(track => track.stop());
            console.log('[Revision] Camera: granted');
        } catch (error) {
            console.error('[Revision] Camera: denied -', error.message);
        }

        // Request audio
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStream.getTracks().forEach(track => track.stop());
            console.log('[Revision] Audio: granted');
        } catch (error) {
            console.error('[Revision] Audio: denied -', error.message);
        }

        // Request MIDI and initialize the MIDI source
        try {
            const enableSysEx = this.settings.get('enableSysEx') !== 'false';
            const midiSuccess = await this.midiSource.initialize(enableSysEx);
            if (midiSuccess) {
                this.inputManager.registerSource('midi', this.midiSource);
                console.log('[Revision] MIDI: granted');
                console.log('[Revision] MIDI midiAccess:', this.midiSource.midiAccess);
                hasMidi = true;

                // Auto-connect to last MIDI device
                const lastMidiId = this.settings.get('midiInputId');
                if (lastMidiId) {
                    this.midiSource.connectInput(lastMidiId);
                }
            } else {
                console.error('[Revision] MIDI: initialize returned false');
            }
        } catch (error) {
            console.error('[Revision] MIDI: denied -', error.message);
        }

        // Check and update button immediately
        await this.checkAndUpdatePermissionButton();
    }

    async initialize() {
        console.log('[Revision V2] Initializing...');

        // Check for URL parameters (e.g., ?fullscreen for OBS)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('fullscreen')) {
            document.body.classList.add('url-fullscreen');
            console.log('[Revision] URL fullscreen mode enabled (for OBS/browser sources)');
        }

        // DO NOT request permissions here - it blocks the entire UI!
        // Permissions are requested AFTER UI setup, and user can manually trigger

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

        // NEVER auto-start MIDI synth on page load (AudioContext will be suspended)
        // User must explicitly select it in control.html (which provides user gesture)
        // The saved setting is shown in control.html but ignored at startup
        console.log('[Revision] MIDI synth NOT auto-loaded - user must select it in control.html');

        // Initialize Three.js renderer (if available)
        if (typeof THREE !== 'undefined') {
            console.log('[Revision] THREE.js library detected, initializing renderer...');
            this.threeJSRenderer = new ThreeJSRenderer(this.threejsCanvas);
            const threeSuccess = await this.threeJSRenderer.initialize();

            if (threeSuccess) {
                this.presetManager.setRenderer('threejs', this.threeJSRenderer);
                console.log('[Revision] ✓ Three.js renderer initialized successfully');

                // Dynamically load Three.js presets
                await this.loadThreeJSPresets();

                console.log('[Revision] ✓ Registered Three.js presets:', this.threeJSRenderer.getAvailablePresets());
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

        // Initialize Video renderer
        this.videoRenderer = new VideoRenderer(this.videoCanvas);
        console.log('[Revision] ✓ Video renderer initialized');

        // Initialize Media renderer (for static images and video files)
        // Load saved reactive settings
        const savedAudioReactive = this.settings.get('mediaAudioReactive') === 'true';
        const savedBeatReactive = this.settings.get('mediaBeatReactive') === 'true';

        this.mediaRenderer = {
            canvas: this.mediaCanvas,
            ctx: this.mediaCanvas.getContext('2d'),
            mediaElement: null,
            mediaType: null,
            animationId: null,
            isActive: false,
            fitMode: 'cover',
            audioReactive: savedAudioReactive,
            beatReactive: savedBeatReactive,
            bassLevel: 0,
            midLevel: 0,
            highLevel: 0,
            hueShift: 0,
            saturation: 1.0,
            brightness: 1.0,
            beatZoom: 1.0,
            targetZoom: 1.0,
            lastBeatTime: 0,

            loadMedia: function(url, type, options = {}) {
                console.log('[MediaRenderer] Loading media:', type, 'URL:', url);

                // CRITICAL: Clean up old media element before creating new one
                if (this.mediaElement) {
                    console.log('[MediaRenderer] Cleaning up old media element...');
                    if (this.mediaElement.tagName === 'VIDEO') {
                        this.mediaElement.pause();
                        this.mediaElement.muted = true; // Mute before removing
                    }
                    this.mediaElement.src = '';
                    this.mediaElement.remove();
                    this.mediaElement = null;
                }

                // Stop animation loop
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }

                this.mediaType = type;
                this.isActive = true;
                this.fitMode = options.fitMode || 'cover';

                if (type === 'image') {
                    this.mediaElement = document.createElement('img');
                    this.mediaElement.onload = () => {
                        console.log('[MediaRenderer] Image loaded');
                        this.renderImage();
                    };
                    this.mediaElement.onerror = () => {
                        console.error('[MediaRenderer] Failed to load image');
                    };
                    this.mediaElement.src = url;
                } else if (type === 'video') {
                    this.mediaElement = document.createElement('video');
                    // Use passed option if available, otherwise read from localStorage
                    const audioOutputEnabled = options.audioOutput !== undefined
                        ? options.audioOutput
                        : localStorage.getItem('videoAudioOutput') === 'true';
                    this.mediaElement.muted = !audioOutputEnabled;
                    this.mediaElement.loop = options.loop !== false;
                    console.log('[MediaRenderer] Video audio output (from options):', audioOutputEnabled);
                    this.mediaElement.onloadedmetadata = () => {
                        console.log('[MediaRenderer] Video loaded, duration:', this.mediaElement.duration);
                        this.mediaElement.play().catch(err => {
                            console.warn('[MediaRenderer] Video autoplay failed:', err);
                        });
                        this.startVideoRender();
                    };
                    this.mediaElement.onerror = () => {
                        console.error('[MediaRenderer] Failed to load video');
                    };
                    this.mediaElement.src = url;
                }
            },

            calculateFitDimensions: function(mediaWidth, mediaHeight) {
                const mediaAspect = mediaWidth / mediaHeight;
                const canvasAspect = this.canvas.width / this.canvas.height;
                let drawWidth, drawHeight, drawX, drawY;

                switch (this.fitMode) {
                    case 'cover':
                        // Fill canvas, may crop
                        if (canvasAspect > mediaAspect) {
                            drawWidth = this.canvas.width;
                            drawHeight = drawWidth / mediaAspect;
                            drawX = 0;
                            drawY = (this.canvas.height - drawHeight) / 2;
                        } else {
                            drawHeight = this.canvas.height;
                            drawWidth = drawHeight * mediaAspect;
                            drawX = (this.canvas.width - drawWidth) / 2;
                            drawY = 0;
                        }
                        break;

                    case 'contain':
                        // Fit all, may letterbox
                        if (canvasAspect > mediaAspect) {
                            drawHeight = this.canvas.height;
                            drawWidth = drawHeight * mediaAspect;
                            drawX = (this.canvas.width - drawWidth) / 2;
                            drawY = 0;
                        } else {
                            drawWidth = this.canvas.width;
                            drawHeight = drawWidth / mediaAspect;
                            drawX = 0;
                            drawY = (this.canvas.height - drawHeight) / 2;
                        }
                        break;

                    case 'fill':
                        // Stretch to fill
                        drawWidth = this.canvas.width;
                        drawHeight = this.canvas.height;
                        drawX = 0;
                        drawY = 0;
                        break;

                    default:
                        // Default to cover
                        this.fitMode = 'cover';
                        return this.calculateFitDimensions(mediaWidth, mediaHeight);
                }

                return { drawWidth, drawHeight, drawX, drawY };
            },

            renderImage: function() {
                if (!this.mediaElement || !this.ctx) return;

                // Start animation loop for reactive effects
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                }

                const renderFrame = () => {
                    if (!this.isActive || !this.mediaElement) return;

                    this.ctx.fillStyle = '#000';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                    let { drawWidth, drawHeight, drawX, drawY } = this.calculateFitDimensions(
                        this.mediaElement.width,
                        this.mediaElement.height
                    );

                    // Apply beat-reactive zoom (smooth interpolation)
                    if (this.beatReactive) {
                        this.beatZoom += (this.targetZoom - this.beatZoom) * 0.15;
                        this.targetZoom += (1.0 - this.targetZoom) * 0.1;

                        if (this.beatZoom !== 1.0) {
                            const centerX = this.canvas.width / 2;
                            const centerY = this.canvas.height / 2;

                            drawWidth *= this.beatZoom;
                            drawHeight *= this.beatZoom;
                            drawX = centerX - (drawWidth / 2);
                            drawY = centerY - (drawHeight / 2);
                        }
                    }

                    // Apply audio-reactive effects
                    if (this.audioReactive) {
                        this.hueShift = this.bassLevel * 180;
                        this.saturation = 1.0 + (this.midLevel * 0.5);
                        this.brightness = 1.0 + (this.highLevel * 0.3);

                        this.ctx.filter = `
                            hue-rotate(${this.hueShift}deg)
                            saturate(${this.saturation})
                            brightness(${this.brightness})
                        `;
                    } else {
                        this.ctx.filter = 'none';
                    }

                    this.ctx.drawImage(this.mediaElement, drawX, drawY, drawWidth, drawHeight);
                    this.ctx.filter = 'none';

                    this.animationId = requestAnimationFrame(renderFrame);
                };

                renderFrame();
            },

            startVideoRender: function() {
                if (this.animationId) return;

                const renderFrame = () => {
                    if (!this.isActive) return;

                    if (this.mediaElement && this.mediaElement.readyState >= 2) {
                        this.ctx.fillStyle = '#000';
                        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                        let { drawWidth, drawHeight, drawX, drawY } = this.calculateFitDimensions(
                            this.mediaElement.videoWidth,
                            this.mediaElement.videoHeight
                        );

                        // Apply beat-reactive zoom (smooth interpolation)
                        if (this.beatReactive) {
                            this.beatZoom += (this.targetZoom - this.beatZoom) * 0.15;
                            this.targetZoom += (1.0 - this.targetZoom) * 0.1;

                            if (this.beatZoom !== 1.0) {
                                const centerX = this.canvas.width / 2;
                                const centerY = this.canvas.height / 2;

                                drawWidth *= this.beatZoom;
                                drawHeight *= this.beatZoom;
                                drawX = centerX - (drawWidth / 2);
                                drawY = centerY - (drawHeight / 2);
                            }
                        }

                        // Apply audio-reactive effects
                        if (this.audioReactive) {
                            this.hueShift = this.bassLevel * 180;
                            this.saturation = 1.0 + (this.midLevel * 0.5);
                            this.brightness = 1.0 + (this.highLevel * 0.3);

                            this.ctx.filter = `
                                hue-rotate(${this.hueShift}deg)
                                saturate(${this.saturation})
                                brightness(${this.brightness})
                            `;
                        } else {
                            this.ctx.filter = 'none';
                        }

                        this.ctx.drawImage(this.mediaElement, drawX, drawY, drawWidth, drawHeight);
                        this.ctx.filter = 'none';
                    }

                    this.animationId = requestAnimationFrame(renderFrame);
                };

                renderFrame();
            },

            stop: function() {
                console.log('[MediaRenderer] Stopping...');
                this.isActive = false;

                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }

                if (this.mediaElement) {
                    if (this.mediaElement.tagName === 'VIDEO') {
                        this.mediaElement.pause();
                        this.mediaElement.muted = true; // Mute before cleanup
                        console.log('[MediaRenderer] Video paused and muted');
                    }
                    this.mediaElement.src = '';
                    this.mediaElement.load(); // Force release
                    if (this.mediaElement.parentNode) {
                        this.mediaElement.remove();
                    }
                    this.mediaElement = null;
                }

                // Clear canvas
                if (this.ctx) {
                    this.ctx.fillStyle = '#000';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                console.log('[MediaRenderer] ✓ Stopped and cleaned up');
            },

            resize: function(width, height) {
                console.log('[MediaRenderer] Resizing canvas to:', width, 'x', height);
                this.canvas.width = width;
                this.canvas.height = height;
                // Force re-render for both images and videos
                if (this.mediaType === 'image' && this.mediaElement) {
                    this.renderImage();
                }
                // Video will automatically update in its render loop
            },

            setAudioOutput: function(enabled) {
                console.log('[MediaRenderer] Audio output:', enabled);
                if (this.mediaElement && this.mediaElement.tagName === 'VIDEO') {
                    this.mediaElement.muted = !enabled;
                    console.log('[MediaRenderer] Video element muted:', this.mediaElement.muted);
                }
            }
        };
        console.log('[Revision] ✓ Media renderer initialized - audioReactive:', savedAudioReactive, 'beatReactive:', savedBeatReactive);

        // Initialize Stream renderer (for HLS, WebRTC, etc.)
        const savedStreamAudioReactive = this.settings.get('streamAudioReactive') === 'true';
        const savedStreamBeatReactive = this.settings.get('streamBeatReactive') === 'true';
        this.streamRenderer = new StreamRenderer(this.streamCanvas);
        this.streamRenderer.setAudioReactive(savedStreamAudioReactive);
        this.streamRenderer.setBeatReactive(savedStreamBeatReactive);
        console.log('[Revision] ✓ Stream renderer initialized - audioReactive:', savedStreamAudioReactive, 'beatReactive:', savedStreamBeatReactive);

        // Initialize Webpage renderer (for displaying webpages in iframe)
        const savedWebpageAudioReactive = this.settings.get('webpageAudioReactive') === 'true';
        const savedWebpageBeatReactive = this.settings.get('webpageBeatReactive') === 'true';
        this.webpageRenderer = new WebpageRenderer(this.webpageContainer);
        this.webpageRenderer.setAudioReactive(savedWebpageAudioReactive);
        this.webpageRenderer.setBeatReactive(savedWebpageBeatReactive);
        console.log('[Revision] ✓ Webpage renderer initialized - audioReactive:', savedWebpageAudioReactive, 'beatReactive:', savedWebpageBeatReactive);

        // Initialize input sources (MIDI, connect audio if enabled)
        await this.initializeInputs();

        // MIDI synth is NEVER created at startup - user must select it in control.html
        // This avoids AudioContext suspension issues

        // Set up input event handlers
        this.setupInputHandlers();

        // Setup UI
        this.setupUI();

        // Hide control panel by default (only show if user wants it from control.html)
        const showControlPanel = this.settings.get('showControlPanel') === 'true';
        const controlPanel = document.querySelector('.control-panel');
        if (controlPanel) {
            controlPanel.style.display = showControlPanel ? '' : 'none';
        }

        // Apply status bar visibility from settings
        const showStatusBar = this.settings.get('showStatusBar') !== 'false'; // Default: true
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) {
            statusBar.style.display = showStatusBar ? '' : 'none';
        }

        console.log('[Revision] UI visibility - StatusBar:', showStatusBar, 'ControlPanel:', showControlPanel);

        // Hide button by default - will show only if needed
        const btn = document.getElementById('permissions-btn');
        if (btn) {
            btn.style.display = 'none';
        }

        // Check permissions multiple times to catch when they're granted
        // First check after 100ms
        setTimeout(async () => {
            await this.checkAndUpdatePermissionButton();
        }, 100);

        // Second check after 500ms (in case first was too early)
        setTimeout(async () => {
            await this.checkAndUpdatePermissionButton();
        }, 500);

        // Third check after 1 second (final check)
        setTimeout(async () => {
            await this.checkAndUpdatePermissionButton();
        }, 1000);

        // Check permissions when window gains focus
        window.addEventListener('focus', async () => {
            await this.checkAndUpdatePermissionButton();
        });

        // Setup BroadcastChannel for control.html
        this.setupControlChannel();

        // Setup drag-and-drop for media files on main display
        this.setupDragAndDrop();

        // Hide all canvases initially
        this.builtinCanvas.style.display = 'none';
        this.threejsCanvas.style.display = 'none';
        this.milkdropCanvas.style.display = 'none';
        this.videoCanvas.style.display = 'none';
        this.mediaCanvas.style.display = 'none';
        this.streamCanvas.style.display = 'none';
        this.webpageContainer.style.display = 'none';

        // ALWAYS start with BLACK SCREEN for instant startup
        // User switches to desired mode via control.html "GO TO PROGRAM"
        const lastScene = this.settings.get('lastScene') || 0;
        this.currentScene = lastScene;

        console.log('[Revision] Starting with black screen - ready for GO TO PROGRAM');

        // Show black-screen, keep all canvases hidden
        this.blackScreen.style.display = 'block';
        this.currentPresetType = null; // No mode active yet

        // Start beat interpolation
        this.interpolateBeat();

        // Request wake lock to prevent screen from sleeping during performance
        if (WakeLockManager.isSupported()) {
            await this.wakeLock.request();
        } else {
            console.log('[Revision] Wake Lock API not supported - screen may sleep during performance');
        }

        console.log('[Revision] Initialized - Mode:', this.currentPresetType);
    }

    async initializeInputs() {
        // Create and auto-initialize MIDI source (silently fails if permission not granted)
        this.midiSource = new MIDIInputSource();
        console.log('[Revision] MIDI source created, attempting auto-initialization...');

        try {
            const enableSysEx = this.settings.get('enableSysEx') !== 'false';
            const midiSuccess = await this.midiSource.initialize(enableSysEx);
            if (midiSuccess) {
                this.inputManager.registerSource('midi', this.midiSource);
                console.log('[Revision] ✓ MIDI auto-initialized successfully');

                // Auto-connect to last MIDI device
                const lastMidiId = this.settings.get('midiInputId');
                if (lastMidiId) {
                    this.midiSource.connectInput(lastMidiId);
                    this.midiIndicator.classList.add('connected');
                    console.log('[Revision] ✓ MIDI reconnected to last device:', lastMidiId);
                }
            }
        } catch (error) {
            console.log('[Revision] MIDI auto-init failed (user can grant permission later):', error.message);
        }

        // Initialize MIDI output (for Reactive Output)
        this.midiOutputSource = new MIDIOutputSource();
        try {
            const outputSuccess = await this.midiOutputSource.initialize();
            if (outputSuccess) {
                console.log('[Revision] ✓ MIDI output initialized');

                // Auto-connect to last output device (if one was selected)
                const lastOutputId = this.settings.get('midiOutputId');
                const outputChannel = this.settings.get('midiOutputChannel') || 'all';

                if (lastOutputId) {
                    const connected = this.midiOutputSource.connectOutput(lastOutputId);
                    if (connected) {
                        this.midiOutputSource.setChannel(outputChannel);
                        console.log('[Revision] ✓ MIDI output reconnected:', lastOutputId, 'Channel:', outputChannel);
                    }
                }
            }
        } catch (error) {
            console.log('[Revision] MIDI output init failed:', error.message);
        }

        // Initialize MIDI synth input (separate from clock/SPP input)
        // This allows using a different MIDI device for notes, or looping audio-reactive output back
        this.midiSynthSource = new MIDIInputSource();
        try {
            const enableSysEx = this.settings.get('enableSysEx') !== 'false';
            const synthMidiSuccess = await this.midiSynthSource.initialize(enableSysEx);
            if (synthMidiSuccess) {
                console.log('[Revision] ✓ MIDI synth input initialized');

                // Auto-connect to last synth MIDI device (if set)
                const lastSynthMidiId = this.settings.get('midiSynthInputId');
                if (lastSynthMidiId) {
                    this.midiSynthSource.connectInput(lastSynthMidiId);
                    console.log('[Revision] ✓ MIDI synth reconnected to:', lastSynthMidiId);
                }
            }
        } catch (error) {
            console.log('[Revision] MIDI synth input init failed:', error.message);
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
        this.controlChannel.onmessage = async (event) => {
            const { command, data } = event.data;

            console.log('[BroadcastChannel] Received command:', command, 'data:', data);

            // Flash remote indicator when receiving command from control.html
            const remoteIndicator = document.getElementById('remote-indicator');
            if (remoteIndicator) {
                remoteIndicator.style.backgroundColor = '#0066FF';
                remoteIndicator.style.boxShadow = '0 0 8px #0066FF';
                // Reset to grey after 2 seconds
                setTimeout(() => {
                    remoteIndicator.style.backgroundColor = '#444444';
                    remoteIndicator.style.boxShadow = 'none';
                }, 2000);
            }

            switch (command) {
                case 'blackScreen':
                    console.log('[BroadcastChannel] Black Screen - static black screen');
                    // Stop all renderers
                    this.renderer.stop();
                    if (this.threeJSRenderer) this.threeJSRenderer.stop();
                    if (this.milkdropRenderer) this.milkdropRenderer.stop();
                    if (this.videoRenderer) this.videoRenderer.stop();
                    if (this.mediaRenderer) this.mediaRenderer.stop();
                    if (this.streamRenderer) this.streamRenderer.stop();
                    if (this.webpageRenderer) this.webpageRenderer.stop();

                    // Hide ALL canvases including builtin (can't mix WebGL and 2D context)
                    this.builtinCanvas.style.display = 'none';
                    this.threejsCanvas.style.display = 'none';
                    this.milkdropCanvas.style.display = 'none';
                    this.videoCanvas.style.display = 'none';
                    this.mediaCanvas.style.display = 'none';
                    this.streamCanvas.style.display = 'none';
                    this.webpageContainer.style.display = 'none';

                    // Show black-screen div (z-index 2, solid black background)
                    this.blackScreen.style.display = 'block';

                    // Update mode
                    this.currentPresetType = 'black';
                    this.settings.set('presetType', 'black');
                    this.broadcastState();
                    console.log('[Revision] ✓ Black screen active (static div)');
                    break;
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
                    console.log('[BroadcastChannel] milkdropSelect - index:', data, 'currentMode:', this.currentPresetType);
                    if (this.currentPresetType === 'milkdrop') {
                        this.loadMilkdropPreset(data);
                    } else {
                        console.warn('[Control] Milkdrop preset selected but mode is:', this.currentPresetType);
                    }
                    break;
                case 'threejsSelect':
                    console.log('[BroadcastChannel] threejsSelect - preset:', data, 'currentMode:', this.currentPresetType);
                    if (this.currentPresetType === 'threejs') {
                        if (this.threeJSRenderer) {
                            // Load preset on-demand with fresh cache
                            const loaded = await this.loadThreeJSPreset(data, true);
                            if (loaded) {
                                this.threeJSRenderer.loadPreset(data);
                                console.log(`[Revision] ✓ Switched to fresh preset: ${data}`);
                            } else {
                                console.error(`[Revision] ✗ Failed to load preset: ${data}`);
                            }
                        }
                    } else {
                        console.warn('[Control] Three.js preset selected but mode is:', this.currentPresetType);
                    }
                    break;
                case 'audioDeviceSelect':
                    if (data === 'none') {
                        this.disableAudioInput();
                        this.settings.set('audioInputDeviceId', '');
                    } else {
                        this.settings.set('audioInputDeviceId', data);
                        await this.enableAudioInput(data);

                        // Selecting an audio device should update the display to show audio is active
                        // (but don't change the visualAudioSource setting - that's controlled by the dropdown)
                        this.broadcastState();
                    }
                    break;
                case 'videoDeviceSelect':
                    console.log('[BroadcastChannel] Video Device Select:', data);
                    this.settings.set('videoDeviceId', data);
                    if (this.videoRenderer && this.currentPresetType === 'video') {
                        const success = await this.videoRenderer.switchCamera(data);
                        if (success) {
                            console.log('[Video] ✓ Switched camera to:', data);
                            // Start render loop if not already running
                            this.videoRenderer.start();
                            console.log('[Video] Render loop started');
                        } else {
                            console.error('[Video] ✗ Failed to switch camera');
                        }
                    }
                    this.broadcastState();
                    break;
                case 'videoAudioReactive':
                    console.log('[BroadcastChannel] Video Audio Reactive:', data);
                    this.settings.set('videoAudioReactive', data);
                    if (this.videoRenderer) {
                        this.videoRenderer.setAudioReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'videoBeatReactive':
                    console.log('[BroadcastChannel] Video Beat Reactive:', data);
                    this.settings.set('videoBeatReactive', data);
                    if (this.videoRenderer) {
                        this.videoRenderer.setBeatReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'videoRelease':
                    console.log('[BroadcastChannel] Video Release Camera');
                    if (this.videoRenderer) {
                        this.videoRenderer.release();
                        console.log('[Video] Camera released - ready for reinitialization');
                    }
                    this.broadcastState();
                    break;
                case 'videoResolution':
                    console.log('[BroadcastChannel] Video Resolution:', data);
                    this.settings.set('videoResolution', data);
                    break;
                case 'videoFramerate':
                    console.log('[BroadcastChannel] Video Framerate:', data);
                    this.settings.set('videoFramerate', data);
                    break;
                case 'videoAudioOutput':
                    console.log('[BroadcastChannel] Video Audio Output:', data);
                    this.settings.set('videoAudioOutput', data);
                    // Apply to video camera renderer
                    if (this.videoRenderer) {
                        this.videoRenderer.setAudioOutput(data === 'true');
                    }
                    // Apply to media file renderer
                    if (this.mediaRenderer && this.mediaRenderer.setAudioOutput) {
                        this.mediaRenderer.setAudioOutput(data === 'true');
                    }
                    // Apply to stream renderer
                    if (this.streamRenderer && this.streamRenderer.setAudioOutput) {
                        this.streamRenderer.setAudioOutput(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'audioSampleRate':
                    console.log('[BroadcastChannel] Audio Sample Rate:', data);
                    this.settings.set('audioSampleRate', data);

                    // Auto-reconnect microphone with new sample rate
                    const currentDeviceId = this.settings.get('audioInputDeviceId');
                    if (currentDeviceId && this.audioSource && this.audioSource.isActive) {
                        console.log('[Revision] Sample rate changed - reconnecting microphone...');
                        await this.disableAudioInput();
                        await new Promise(resolve => setTimeout(resolve, 200)); // Wait for cleanup
                        await this.enableAudioInput(currentDeviceId);
                        console.log('[Revision] ✓ Microphone reconnected with new sample rate:', data, 'Hz');
                    } else {
                        console.warn('[Revision] Cannot reconnect - no active microphone');
                    }
                    break;
                case 'audioBeatReactive':
                    console.log('[BroadcastChannel] Audio Beat Reactive (Monitoring):', data);
                    this.settings.set('audioBeatReactive', data);
                    // Enable/disable audio monitoring (hearing the microphone)
                    if (this.audioSource && this.audioSource.setMonitoring) {
                        this.audioSource.setMonitoring(data === 'true');
                        console.log('[Revision] Audio monitoring set to:', data);
                    } else {
                        console.warn('[Revision] audioSource not available or setMonitoring not found');
                    }
                    this.broadcastState();
                    break;
                case 'midiSynthEnable':
                    console.log('[BroadcastChannel] MIDI Synth Enable:', data);
                    this.settings.set('midiSynthEnable', data);
                    if (data === 'true' && !this.midiAudioSynth) {
                        // CRITICAL: Resume AudioContext if suspended (requires user gesture)
                        if (this.audioSource.audioContext.state === 'suspended') {
                            console.log('[Revision] ⚠️ AudioContext suspended, resuming...');
                            await this.audioSource.audioContext.resume();
                            console.log('[Revision] ✓ AudioContext resumed:', this.audioSource.audioContext.state);
                        }

                        // Enable synth
                        this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
                        this.midiAudioSynth.initialize();

                        // Apply saved audible setting (MUST await to ensure AudioContext is ready)
                        const audibleSetting = this.settings.get('midiSynthAudible') === 'true';
                        await this.midiAudioSynth.setAudible(audibleSetting);

                        console.log('[Revision] ✓ MIDI audio synthesizer ENABLED - audible:', audibleSetting);

                        // If reactive input is set to MIDI, register the synth
                        if (this.currentVisualAudioSource === 'midi') {
                            console.log('[Revision] 🟢 Registering MIDI synth with InputManager (reactive input is MIDI)');
                            this.inputManager.registerSource('midi-synth', this.midiAudioSynth);

                            // Setup MIDI synth input handlers
                            if (this.midiSynthSource) {
                                this.setupMIDISynthHandlers();
                                console.log('[Revision] ✓ MIDI synth input handlers connected');
                            }

                            // Reconnect audio to renderer
                            this.reconnectAudioToRenderer();
                        }
                    } else if (data === 'false' && this.midiAudioSynth) {
                        // Disable synth
                        console.log('[Revision] Unregistering MIDI synth from InputManager');
                        this.inputManager.unregisterSource('midi-synth');

                        this.midiAudioSynth.destroy();
                        this.midiAudioSynth = null;
                        console.log('[Revision] ✓ MIDI audio synthesizer DISABLED');

                        // If reactive input was MIDI, switch back to microphone
                        if (this.currentVisualAudioSource === 'midi') {
                            console.log('[Revision] Switching reactive input back to microphone (synth disabled)');
                            this.currentVisualAudioSource = 'microphone';
                            this.settings.set('visualAudioSource', 'microphone');
                            this.reconnectAudioToRenderer();
                        }
                    }
                    this.broadcastState();
                    break;
                case 'milkdropAudioSource':
                    console.log('[BroadcastChannel] ═══════════════════════════════════════');
                    console.log('[BroadcastChannel] SWITCHING Audio Source to:', data);
                    console.log('[BroadcastChannel] Current synth state:', this.midiAudioSynth ? 'EXISTS' : 'NULL');
                    this.settings.set('visualAudioSource', data);
                    this.currentVisualAudioSource = data; // Update ACTUAL state

                    // Clear old frequency data and immediately update EQ
                    this.lastFrequencyData = { bass: 0, mid: 0, high: 0 };
                    console.log('[Revision] 🧹 Cleared old frequency data');
                    this.broadcastState(); // Immediately send zeros to EQ

                    // CRITICAL: Stop all active MIDI synth voices to prevent stuck notes
                    if (this.midiAudioSynth) {
                        this.midiAudioSynth.stopAll();
                        console.log('[Revision] 🛑 Stopped all synth voices (source switching)');
                    }

                    // CRITICAL: Clear active frequency notes from audio source to prevent stuck notes
                    if (this.audioSource && this.audioSource.activeFrequencyNotes) {
                        // Send note-off for all active audio-frequency notes
                        for (const note of this.audioSource.activeFrequencyNotes) {
                            this.inputManager.emit('note', {
                                note,
                                velocity: 0,
                                source: 'audio-frequency',
                                timestamp: performance.now()
                            });
                        }
                        this.audioSource.activeFrequencyNotes.clear();
                        console.log('[Revision] 🛑 Cleared all active audio-frequency notes');
                    }

                    // Switch reactive input source
                    if (data === 'midi') {
                        // CRITICAL: Check if MIDI synth is enabled first
                        const synthEnabled = this.settings.get('midiSynthEnable') === 'true';

                        if (!synthEnabled) {
                            // Auto-enable MIDI synth when selecting it as reactive input (temporary, not saved)
                            console.log('[Revision] 🔧 Auto-enabling MIDI synth temporarily (reactive input set to MIDI)');
                            // NOTE: Don't save midiSynthEnable here - only when user explicitly checks the box

                            // CRITICAL: Resume AudioContext if suspended (requires user gesture)
                            if (this.audioSource.audioContext.state === 'suspended') {
                                console.log('[Revision] ⚠️ AudioContext suspended, resuming...');
                                await this.audioSource.audioContext.resume();
                                console.log('[Revision] ✓ AudioContext resumed:', this.audioSource.audioContext.state);
                            }

                            // Create synth
                            this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
                            this.midiAudioSynth.initialize();

                            // Apply saved audible setting (MUST await to ensure AudioContext is ready)
                            const audibleSetting = this.settings.get('midiSynthAudible') === 'true';
                            await this.midiAudioSynth.setAudible(audibleSetting);
                            console.log('[Revision] ✓ MIDI synthesizer CREATED - audible:', audibleSetting);
                        } else {
                            console.log('[Revision] ✓ MIDI synthesizer already enabled');
                        }

                        // Hook up MIDI synth input source to feed notes to synth
                        if (this.midiSynthSource && this.midiAudioSynth) {
                            this.setupMIDISynthHandlers();
                            console.log('[Revision] ✓ MIDI synth input handlers connected');
                        }

                        // Register MIDI synth for frequency analysis
                        // NOTE: We keep audio source registered too (needed for MIDI output, beat detection)
                        // The visualAudioSource setting controls which source's FREQUENCY data is used
                        if (this.midiAudioSynth) {
                            console.log('[Revision] 🟢 Registering MIDI synth with InputManager');
                            this.inputManager.registerSource('midi-synth', this.midiAudioSynth);
                            console.log('[Revision] ✅ Active sources:', this.inputManager.getAllSources());
                        }

                        // Audio monitoring is independent of visualization source
                        // User can toggle it separately via "Audio input monitoring" checkbox
                    } else if (data === 'microphone') {
                        // Check if synth should be kept alive (only if explicitly enabled)
                        const synthEnabled = this.settings.get('midiSynthEnable') === 'true';

                        if (this.midiAudioSynth) {
                            // Always unregister from reactive input (we're switching to microphone)
                            console.log('[Revision] Unregistering MIDI synth from reactive input');
                            this.inputManager.unregisterSource('midi-synth');

                            if (synthEnabled) {
                                // Keep synth alive (explicitly enabled by user)
                                console.log('[Revision] ✓ MIDI synth kept alive (explicitly enabled)');
                            } else {
                                // Not explicitly enabled - safe to destroy
                                console.log('[Revision] Destroying MIDI synthesizer (not explicitly enabled)...');
                                this.midiAudioSynth.destroy();
                                this.midiAudioSynth = null;
                                console.log('[Revision] ✓ MIDI synthesizer DESTROYED - switching to audio input device');
                            }
                        } else {
                            console.log('[Revision] ✓ Already using audio input device');
                        }

                        // Audio source stays registered (needed for MIDI output, beat detection)
                        // No need to re-register here - just ensure it's connected
                        if (this.audioSource && !this.audioSource.isActive) {
                            console.log('[Revision] ⚠️ Audio source was disconnected, reconnecting...');
                            const audioDeviceId = this.settings.get('audioInputDeviceId');
                            await this.audioSource.connectMicrophone(audioDeviceId);
                        } else if (this.audioSource) {
                            console.log('[Revision] ✓ Audio source already active and registered');
                        }

                        // Re-apply audio monitoring setting when switching back to microphone
                        if (this.audioSource && this.audioSource.setMonitoring) {
                            const monitoringEnabled = this.settings.get('audioBeatReactive') === 'true';
                            this.audioSource.setMonitoring(monitoringEnabled);
                            console.log('[Revision] Re-applied audio monitoring:', monitoringEnabled);
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
                        await this.midiAudioSynth.setAudible(data === 'true');
                    }

                    // Update display immediately
                    this.broadcastState();
                    break;
                case 'midiSynthAutoFeed':
                    console.log('[BroadcastChannel] MIDI Synth Auto-Feed:', data);
                    this.settings.set('midiSynthAutoFeed', data);

                    // CRITICAL: When disabling auto-feed, stop ALL active voices
                    if (data === 'false' && this.midiAudioSynth) {
                        this.midiAudioSynth.stopAll();
                        console.log('[Revision] ✓ Stopped all synth voices (auto-feed disabled)');
                    }

                    // Update display immediately
                    this.broadcastState();
                    break;
                case 'midiSynthFeedInput':
                    console.log('[BroadcastChannel] MIDI Synth Feed Input:', data);
                    this.settings.set('midiSynthFeedInput', data);

                    // CRITICAL: When disabling MIDI input feed, stop ALL active voices
                    if (data === 'false' && this.midiAudioSynth) {
                        this.midiAudioSynth.stopAll();
                        console.log('[Revision] ✓ Stopped all synth voices (MIDI input feed disabled)');
                    }

                    // Update display immediately
                    this.broadcastState();
                    break;
                case 'audioNoteDuration':
                    console.log('[BroadcastChannel] Audio Note Duration:', data, 'ms');
                    this.settings.set('audioNoteDuration', data);

                    // Apply to audio source
                    if (this.audioSource && this.audioSource.setNoteDuration) {
                        this.audioSource.setNoteDuration(parseInt(data));
                        console.log('[Revision] ✓ Note duration updated:', data, 'ms');
                    }
                    break;
                case 'beatThreshold':
                    console.log('[BroadcastChannel] Beat Threshold:', data);
                    this.settings.set('beatThreshold', data);

                    // Apply to audio source
                    if (this.audioSource && this.audioSource.setBeatThreshold) {
                        this.audioSource.setBeatThreshold(parseFloat(data));
                        console.log('[Revision] ✓ Beat threshold updated:', data);
                    }
                    break;
                case 'beatMinTime':
                    console.log('[BroadcastChannel] Beat Min Time:', data, 'ms');
                    this.settings.set('beatMinTime', data);

                    // Apply to audio source
                    if (this.audioSource && this.audioSource.setBeatMinTime) {
                        this.audioSource.setBeatMinTime(parseInt(data));
                        console.log('[Revision] ✓ Beat min time updated:', data, 'ms');
                    }
                    break;
                case 'midiSynthBeatKick':
                    console.log('[BroadcastChannel] MIDI Synth Beat Kick:', data);
                    this.settings.set('midiSynthBeatKick', data);

                    if (data === 'true') {
                        // CRITICAL: Create MIDI synth if it doesn't exist
                        if (!this.midiAudioSynth) {
                            console.log('[Revision] Creating MIDI synth for beat kick...');
                            if (this.audioSource && this.audioSource.audioContext) {
                                // Resume AudioContext if suspended
                                if (this.audioSource.audioContext.state === 'suspended') {
                                    console.log('[Revision] ⚠️ AudioContext suspended, resuming...');
                                    await this.audioSource.audioContext.resume();
                                }

                                this.midiAudioSynth = new MIDIAudioSynth(this.audioSource.audioContext);
                                this.midiAudioSynth.initialize();
                                console.log('[Revision] ✓ MIDI synth created for beat kick');
                            } else {
                                console.error('[Revision] Cannot create MIDI synth - audio source not initialized');
                            }
                        } else {
                            // CRITICAL: Synth exists - ALWAYS recreate beat oscillator to ensure it works
                            // regardless of AudioContext state when it was first created
                            console.log('[Revision] MIDI synth exists - recreating beat oscillator for reliability...');

                            // Resume AudioContext if suspended
                            if (this.audioSource.audioContext.state === 'suspended') {
                                console.log('[Revision] ⚠️ AudioContext suspended, resuming...');
                                await this.audioSource.audioContext.resume();
                            }

                            // Always recreate beat synth to ensure it's in a good state
                            this.midiAudioSynth.setupBeatSynth();
                            console.log('[Revision] ✓ Beat oscillator recreated and ready');
                        }
                    }

                    // Beat kick is a persistent setting - synth stays alive when disabled
                    // Only "Enable MIDI Synthesizer" controls synth lifecycle

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
                case 'midiSynthInputSelect':
                    console.log('[BroadcastChannel] MIDI Synth Input Select:', data);
                    if (data && this.midiSynthSource) {
                        this.midiSynthSource.connectInput(data);
                        this.settings.set('midiSynthInputId', data);
                        console.log('[Revision] MIDI synth input connected to:', data);
                        // Reconnect handlers to ensure they're using the new device
                        if (this.midiAudioSynth) {
                            this.setupMIDISynthHandlers();
                        }
                        this.broadcastState();
                    }
                    break;
                case 'sysexEnable':
                    console.log('[BroadcastChannel] SysEx Enable:', data);
                    this.settings.set('enableSysEx', data);
                    console.log('[Revision] SysEx setting changed to:', data, '- Reload required');
                    this.broadcastState();
                    break;
                case 'reactiveOutputFrequency':
                    console.log('[BroadcastChannel] Reactive Output Frequency:', data);
                    this.settings.set('reactiveOutputFrequency', data);
                    this.broadcastState();
                    break;
                case 'reactiveOutputBeatKick':
                    console.log('[BroadcastChannel] Reactive Output Beat Kick:', data);
                    this.settings.set('reactiveOutputBeatKick', data);
                    this.broadcastState();
                    break;
                case 'midiOutputSelect':
                    console.log('[BroadcastChannel] MIDI Output Select:', data);
                    this.settings.set('midiOutputId', data);
                    if (this.midiOutputSource && data) {
                        // Auto-connect when a device is selected
                        this.midiOutputSource.connectOutput(data);
                        console.log('[Revision] ✓ MIDI output auto-connected to:', data);
                    } else if (this.midiOutputSource && !data) {
                        // Disconnect when "No device" is selected
                        this.midiOutputSource.disconnect();
                        console.log('[Revision] MIDI output disconnected');
                    }
                    this.broadcastState();
                    break;
                case 'midiOutputChannel':
                    console.log('[BroadcastChannel] MIDI Output Channel:', data);
                    this.settings.set('midiOutputChannel', data);
                    if (this.midiOutputSource) {
                        this.midiOutputSource.setChannel(data === 'all' ? 'all' : parseInt(data));
                    }
                    this.broadcastState();
                    break;
                case 'rendererSelect':
                    console.log('[BroadcastChannel] Renderer Select:', data);
                    this.settings.set('renderer', data);
                    // CRITICAL: Switching renderer should also switch to builtin mode
                    // Otherwise the builtin canvas stays hidden and nothing is visible
                    await this.switchPresetType('builtin');
                    // Now reinitialize the renderer with the new type
                    this.renderer.stop();
                    this.renderer.initialize(data);

                    // CRITICAL: renderer.initialize() recreates the canvas element!
                    // Update our reference to point to the NEW canvas
                    this.builtinCanvas = document.getElementById('builtin-canvas');
                    console.log('[Revision] Updated canvas reference after renderer.initialize()');

                    // DON'T call resize() - it overrides the resolution settings!
                    // Instead, re-apply the saved resolution to the new canvas
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);
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
                case 'mediaLoad':
                    console.log('[BroadcastChannel] Media Load:', data);
                    if (this.mediaRenderer && data.url && data.type) {
                        // Store pending media data - will be loaded AFTER fade completes
                        this.pendingMediaLoad = {
                            url: data.url,
                            type: data.type,
                            loop: data.loop,
                            fitMode: data.fitMode
                        };

                        // Switch to media mode (will trigger fade and load media after)
                        this.switchPresetType('media');
                    } else {
                        console.error('[Revision] ✗ Invalid media data or renderer not available');
                    }
                    break;
                case 'mediaAudioReactive':
                    console.log('[BroadcastChannel] Media Audio Reactive:', data);
                    this.settings.set('mediaAudioReactive', data);
                    if (this.mediaRenderer) {
                        this.mediaRenderer.audioReactive = data === 'true';
                    }
                    this.broadcastState();
                    break;
                case 'mediaBeatReactive':
                    console.log('[BroadcastChannel] Media Beat Reactive:', data);
                    this.settings.set('mediaBeatReactive', data);
                    if (this.mediaRenderer) {
                        this.mediaRenderer.beatReactive = data === 'true';
                    }
                    this.broadcastState();
                    break;
                case 'streamLoad':
                    console.log('[BroadcastChannel] Stream Load:', data);
                    if (this.streamRenderer && data.url) {
                        // Switch to stream mode first
                        await this.switchPresetType('stream');

                        // Get audio output setting BEFORE loading
                        const audioOutputEnabled = this.settings.get('videoAudioOutput') === 'true';

                        // Then load the stream
                        try {
                            await this.streamRenderer.loadStream(data.url, data.streamType || 'auto', {
                                fitMode: data.fitMode || 'cover',
                                audioOutput: audioOutputEnabled // Pass audio setting directly
                            });

                            console.log('[Stream] ✓ Stream loaded successfully - audioOutput:', audioOutputEnabled);
                        } catch (error) {
                            console.error('[Stream] ✗ Failed to load stream:', error);
                        }
                    } else {
                        console.error('[Revision] ✗ Invalid stream data or renderer not available');
                    }
                    break;
                case 'streamAudioReactive':
                    console.log('[BroadcastChannel] Stream Audio Reactive:', data);
                    this.settings.set('streamAudioReactive', data);
                    if (this.streamRenderer) {
                        this.streamRenderer.setAudioReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'streamBeatReactive':
                    console.log('[BroadcastChannel] Stream Beat Reactive:', data);
                    this.settings.set('streamBeatReactive', data);
                    if (this.streamRenderer) {
                        this.streamRenderer.setBeatReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'webpageLoad':
                    console.log('[BroadcastChannel] Webpage Load:', data);
                    if (this.webpageRenderer && data.url) {
                        // Switch to webpage mode first
                        await this.switchPresetType('webpage');

                        // Then load the webpage
                        this.webpageRenderer.loadWebpage(data.url);
                        console.log('[Webpage] ✓ Webpage loaded successfully');
                    } else {
                        console.error('[Revision] ✗ Invalid webpage data or renderer not available');
                    }
                    break;
                case 'webpageAudioReactive':
                    console.log('[BroadcastChannel] Webpage Audio Reactive:', data);
                    this.settings.set('webpageAudioReactive', data);
                    if (this.webpageRenderer) {
                        this.webpageRenderer.setAudioReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'webpageBeatReactive':
                    console.log('[BroadcastChannel] Webpage Beat Reactive:', data);
                    this.settings.set('webpageBeatReactive', data);
                    if (this.webpageRenderer) {
                        this.webpageRenderer.setBeatReactive(data === 'true');
                    }
                    this.broadcastState();
                    break;
                case 'programResolution':
                    console.log('[BroadcastChannel] Program Resolution:', data);
                    this.settings.set('programResolution', data.preset);
                    if (data.preset === 'custom') {
                        this.settings.set('customResolutionWidth', data.width);
                        this.settings.set('customResolutionHeight', data.height);
                    }
                    this.applyProgramResolution(data.preset, data.width, data.height);
                    this.broadcastState();
                    break;
                case 'toggleStatusBar':
                    console.log('[BroadcastChannel] Toggle Status Bar:', data);
                    this.settings.set('showStatusBar', data);
                    const statusBar = document.querySelector('.status-bar');
                    if (statusBar) {
                        statusBar.style.display = data === 'true' ? '' : 'none';
                        console.log('[Revision] Status bar:', data === 'true' ? 'SHOWN' : 'HIDDEN');
                    }
                    // No resize needed - status bar is an overlay
                    this.broadcastState();
                    break;
                case 'toggleControlPanel':
                    console.log('[BroadcastChannel] Toggle Control Panel:', data);
                    this.settings.set('showControlPanel', data);
                    const controlPanel = document.querySelector('.control-panel');
                    if (controlPanel) {
                        controlPanel.style.display = data === 'true' ? '' : 'none';
                        console.log('[Revision] Control panel:', data === 'true' ? 'SHOWN' : 'HIDDEN');
                    }
                    // No resize needed - control panel is an overlay
                    this.broadcastState();
                    break;
                // toggleFullscreen removed - fullscreen requires user gesture in main window
                // User should press F11 to enter/exit fullscreen mode
                // control.html displays read-only fullscreen status
                case 'reloadPreset':
                    console.log('[BroadcastChannel] Reload Preset:', data);
                    if (data && data.key && data.className && data.code) {
                        try {
                            // Remove old script if exists
                            const oldScript = document.querySelector(`script[data-preset="${data.key}"]`);
                            if (oldScript) {
                                oldScript.remove();
                                console.log('[Revision] Removed old script for:', data.key);
                            }

                            // Delete old class from window
                            if (window[data.className]) {
                                delete window[data.className];
                                console.log('[Revision] Deleted old class:', data.className);
                            }

                            // Create new script with code
                            const script = document.createElement('script');
                            script.setAttribute('data-preset', data.key);
                            script.textContent = data.code;
                            document.head.appendChild(script);

                            console.log('[Revision] ✓ Loaded new preset code');

                            // Re-register if Three.js renderer exists
                            if (this.threeJSRenderer && window[data.className]) {
                                this.threeJSRenderer.registerPreset(data.key, window[data.className]);
                                console.log('[Revision] ✓ Registered preset:', data.key);

                                // Reload if currently showing this preset
                                if (this.currentPresetType === 'threejs') {
                                    console.log('[Revision] Reloading current preset on main display...');
                                    this.threeJSRenderer.loadPreset(data.key);
                                }
                            }

                            console.log('[Revision] ✓ Preset reloaded without page refresh!');
                        } catch (error) {
                            console.error('[Revision] Failed to reload preset:', error);
                        }
                    }
                    break;
                case 'requestState':
                    this.broadcastState();
                    // Also send preset list if available
                    if (this.milkdropPresetKeys && this.milkdropPresetKeys.length > 0) {
                        console.log('[BroadcastChannel] Sending preset list:', this.milkdropPresetKeys.length, 'presets');
                        this.controlChannel.postMessage({
                            type: 'presetList',
                            data: this.milkdropPresetKeys
                        });
                    } else {
                        console.warn('[BroadcastChannel] No Milkdrop presets loaded yet');
                    }
                    break;
            }
        };
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('canvas-container');
        const dropOverlay = document.getElementById('fullscreen-drop-zone');

        // Prevent default drag behavior
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());

        // Show drop overlay when dragging file
        dropZone.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                dropOverlay.style.display = 'flex';
            }
        });

        dropZone.addEventListener('dragleave', (e) => {
            if (e.target === dropZone) {
                dropOverlay.style.display = 'none';
            }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Handle file drop
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropOverlay.style.display = 'none';

            const file = e.dataTransfer.files[0];
            if (!file) return;

            console.log('[Revision] File dropped:', file.name, file.type);

            // Determine media type
            let mediaType;
            if (file.type.startsWith('image/')) {
                mediaType = 'image';
            } else if (file.type.startsWith('video/')) {
                mediaType = 'video';
            } else {
                console.error('[Revision] Unsupported file type:', file.type);
                return;
            }

            // Create object URL
            const url = URL.createObjectURL(file);

            // Switch to media mode and load file
            this.switchPresetType('media');
            setTimeout(() => {
                if (this.mediaRenderer) {
                    this.mediaRenderer.loadMedia(url, mediaType, {
                        loop: true,
                        fitMode: 'cover'
                    });
                    console.log('[Revision] ✓ Media file loaded from drop:', file.name);
                }
            }, 100);
        });

        console.log('[Revision] ✓ Drag-and-drop enabled for media files');
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

    // Get the actual audio input device name
    getFormattedAudioSource() {
        const deviceId = this.settings.get('audioInputDeviceId');

        if (!deviceId || deviceId === 'none') {
            return 'None';
        }

        // Get the device name from the audio source if available
        if (this.audioSource && this.audioSource.deviceName) {
            return this.audioSource.deviceName;
        }

        // Fallback to deviceId (truncated if too long)
        return deviceId.length > 20 ? deviceId.substring(0, 20) + '...' : deviceId;
    }

    // Get what drives the visual reactivity (microphone or MIDI synth)
    getFormattedReactiveInput() {
        // Use ACTUAL running state, not saved setting
        // (MIDI synth is never auto-started, requires user gesture)
        const visualSource = this.currentVisualAudioSource || 'microphone';

        if (visualSource === 'midi') {
            return 'MIDI Synthesizer';
        } else {
            return 'Audio Input Device';
        }
    }

    // Get resolution dimensions from preset or custom
    getResolutionDimensions(preset, customWidth, customHeight) {
        const resolutions = {
            'auto': null, // Will use window size
            '100%': 'container', // Will use container size
            '1080p': { width: 1920, height: 1080 },
            '720p': { width: 1280, height: 720 },
            '4k': { width: 3840, height: 2160 },
            'square': { width: 1080, height: 1080 },
            'vertical': { width: 1080, height: 1920 },
            'custom': {
                width: parseInt(customWidth) || 1920,
                height: parseInt(customHeight) || 1080
            }
        };
        return resolutions[preset];
    }

    // Apply program resolution to all canvases
    applyProgramResolution(preset, customWidth, customHeight) {
        const dimensions = this.getResolutionDimensions(preset, customWidth, customHeight);

        if (!dimensions) {
            // Auto mode - use window dimensions
            console.log('[Revision] Program resolution set to AUTO (match window)');
            this.resizeAllCanvases(window.innerWidth, window.innerHeight);
        } else if (dimensions === 'container') {
            // 100% mode - use full window dimensions
            const w = window.innerWidth;
            const h = window.innerHeight;
            console.log(`[Revision] Program resolution set to 100% (Fill Window: ${w}x${h})`);
            this.resizeAllCanvases(w, h);
        } else {
            console.log(`[Revision] Program resolution set to ${dimensions.width}x${dimensions.height}`);
            this.resizeAllCanvases(dimensions.width, dimensions.height);
        }
    }

    // Resize all canvases to specific dimensions
    resizeAllCanvases(width, height) {
        console.log(`[Revision] Resizing all canvases to ${width}x${height} (FORCED - may exceed viewport)`);

        // FORCE canvas to exact dimensions - don't fit to viewport
        // The centering transform will handle positioning
        // max-width/max-height in index.html will scale if needed

        // Resize builtin canvas
        if (this.builtinCanvas) {
            console.log('[Revision] 🔧 Resizing builtin canvas to:', width, 'x', height);
            console.log('[Revision] 🔧 Before - canvas.width:', this.builtinCanvas.width, 'canvas.height:', this.builtinCanvas.height);
            console.log('[Revision] 🔧 Before - clientWidth:', this.builtinCanvas.clientWidth, 'clientHeight:', this.builtinCanvas.clientHeight);

            this.builtinCanvas.width = width;
            this.builtinCanvas.height = height;
            this.builtinCanvas.style.width = `${width}px`;
            this.builtinCanvas.style.height = `${height}px`;

            console.log('[Revision] 🔧 After - canvas.width:', this.builtinCanvas.width, 'canvas.height:', this.builtinCanvas.height);
            console.log('[Revision] 🔧 After - clientWidth:', this.builtinCanvas.clientWidth, 'clientHeight:', this.builtinCanvas.clientHeight);

            // Update WebGL viewport to match internal resolution
            if (this.renderer && this.renderer.gl) {
                this.renderer.gl.viewport(0, 0, width, height);
                console.log('[Revision] 🔧 WebGL viewport set to:', width, 'x', height);
            }
        }

        // Resize threejs canvas
        if (this.threejsCanvas) {
            this.threejsCanvas.width = width;
            this.threejsCanvas.height = height;
            this.threejsCanvas.style.width = `${width}px`;
            this.threejsCanvas.style.height = `${height}px`;
            // Update Three.js renderer and camera
            if (this.threeJSRenderer && this.threeJSRenderer.renderer) {
                this.threeJSRenderer.renderer.setSize(width, height, false);
                this.threeJSRenderer.camera.aspect = width / height;
                this.threeJSRenderer.camera.updateProjectionMatrix();
            }
        }

        // Resize milkdrop canvas
        if (this.milkdropCanvas) {
            this.milkdropCanvas.width = width;
            this.milkdropCanvas.height = height;
            this.milkdropCanvas.style.width = `${width}px`;
            this.milkdropCanvas.style.height = `${height}px`;
            // Update Butterchurn visualizer
            if (this.milkdropRenderer && this.milkdropRenderer.visualizer) {
                this.milkdropRenderer.visualizer.setRendererSize(width, height);
            }
        }

        // Resize video canvas
        if (this.videoCanvas) {
            this.videoCanvas.width = width;
            this.videoCanvas.height = height;
            this.videoCanvas.style.width = `${width}px`;
            this.videoCanvas.style.height = `${height}px`;
        }

        // Resize media canvas
        if (this.mediaCanvas) {
            this.mediaCanvas.width = width;
            this.mediaCanvas.height = height;
            this.mediaCanvas.style.width = `${width}px`;
            this.mediaCanvas.style.height = `${height}px`;
            // Trigger media renderer to recalculate fit and re-render
            if (this.mediaRenderer && this.mediaRenderer.resize) {
                this.mediaRenderer.resize(width, height);
            }
        }

        // Resize stream canvas
        if (this.streamCanvas) {
            this.streamCanvas.width = width;
            this.streamCanvas.height = height;
            this.streamCanvas.style.width = `${width}px`;
            this.streamCanvas.style.height = `${height}px`;
            // Trigger stream renderer to recalculate fit and re-render
            if (this.streamRenderer && this.streamRenderer.resize) {
                this.streamRenderer.resize(width, height);
            }
        }

        // Resize webpage container
        if (this.webpageContainer) {
            console.log('[Revision] 🌐 Resizing webpage container to:', width, 'x', height);
            this.webpageContainer.style.width = `${width}px`;
            this.webpageContainer.style.height = `${height}px`;
            console.log('[Revision] 🌐 Webpage container - clientWidth:', this.webpageContainer.clientWidth, 'clientHeight:', this.webpageContainer.clientHeight);
        }

        console.log('[Revision] ✓ All canvases FORCED to exact dimensions');
    }

    broadcastState() {
        const bar = Math.floor(this.currentPosition / 16);
        const beat = Math.floor((this.currentPosition % 16) / 4);
        const sixteenth = Math.floor(this.currentPosition % 4);

        // Check if SPP was received recently from MIDI source
        const now = performance.now();
        const timeSinceLastSPP = this.midiSource && this.midiSource.lastSPPTime
            ? (now - this.midiSource.lastSPPTime)
            : Infinity;

        // Flash indicator within 100ms of SPP message
        const sppActive = timeSinceLastSPP < 100;

        // Check if beat was detected recently
        const timeSinceLastBeat = this.lastBeatTime
            ? (now - this.lastBeatTime)
            : Infinity;

        // Flash beat indicator within 150ms of beat detection
        const beatActive = timeSinceLastBeat < 150;

        // Position is valid within 5 seconds of last SPP
        const positionValid = timeSinceLastSPP < 5000;

        // Get actual program dimensions
        // For 100% mode: use full window dimensions (ignore UI overlays)
        // For other modes: use canvas-container dimensions (adjusted for UI)
        const resolutionPreset = this.settings.get('programResolution') || 'auto';
        let programWidth, programHeight;

        if (resolutionPreset === '100%') {
            // 100% mode - use full window dimensions
            programWidth = window.innerWidth;
            programHeight = window.innerHeight;
        } else {
            // Other modes - use container dimensions (adjusted for status bar/control panel)
            const canvasContainer = document.getElementById('canvas-container');
            programWidth = canvasContainer ? canvasContainer.clientWidth : window.innerWidth;
            programHeight = canvasContainer ? canvasContainer.clientHeight : window.innerHeight;
        }

        const state = {
            mode: this.currentPresetType,
            scene: this.currentScene,
            bpm: this.currentBPM,
            // Only include position when SPP data is recent and valid
            position: positionValid ? `${bar}.${beat}.${sixteenth}` : undefined,
            audioDeviceId: this.settings.get('audioInputDeviceId') || 'none',
            visualAudioSource: this.currentVisualAudioSource, // ACTUAL state, not saved setting
            midiSynthEnabled: this.midiAudioSynth ? 'true' : 'false', // ACTUAL state (synth exists or not)
            midiSynthChannel: this.settings.get('midiSynthChannel') || 'all',
            midiSynthAudible: this.settings.get('midiSynthAudible') === 'true' ? 'true' : 'false',
            midiSynthAutoFeed: this.settings.get('midiSynthAutoFeed') === 'true' ? 'true' : 'false',
            midiSynthFeedInput: this.settings.get('midiSynthFeedInput') === 'true' ? 'true' : 'false',
            midiSynthBeatKick: this.settings.get('midiSynthBeatKick') === 'true' ? 'true' : 'false',
            audioNoteDuration: this.settings.get('audioNoteDuration') || '60',
            beatThreshold: this.settings.get('beatThreshold') || '1.6',
            beatMinTime: this.settings.get('beatMinTime') || '400',
            audioSourceDisplay: this.getFormattedAudioSource(),
            reactiveInputDisplay: this.getFormattedReactiveInput(),
            midiInputId: this.settings.get('midiInputId') || '',
            enableSysEx: this.settings.get('enableSysEx') || 'true',
            renderer: this.settings.get('renderer') || 'webgl',
            oscServer: this.settings.get('oscServer') || '',
            videoDeviceId: this.settings.get('videoDeviceId') || '',
            videoAudioReactive: this.settings.get('videoAudioReactive') || 'false',
            videoBeatReactive: this.settings.get('videoBeatReactive') || 'false',
            videoAudioOutput: this.settings.get('videoAudioOutput') || 'false',
            audioBeatReactive: this.settings.get('audioBeatReactive') || 'false',
            showStatusBar: this.settings.get('showStatusBar') !== 'false' ? 'true' : 'false',
            showControlPanel: this.settings.get('showControlPanel') === 'true' ? 'true' : 'false',
            isFullscreen: document.fullscreenElement ? 'true' : 'false',
            presetName: this.currentPresetType === 'milkdrop' && this.milkdropPresetKeys
                ? this.milkdropPresetKeys[this.currentMilkdropIndex || 0] || '-'
                : '-',
            frequency: this.lastFrequencyData,
            sppActive: sppActive,
            beatActive: beatActive,
            // Program canvas dimensions (for preview aspect ratio in control.html)
            programWidth: programWidth,
            programHeight: programHeight
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

        const reactiveInputDisplay = document.getElementById('reactive-input-display');
        if (reactiveInputDisplay) {
            reactiveInputDisplay.textContent = state.reactiveInputDisplay;
        }

        // Update SPP indicator (flash yellow when SPP received)
        const sppIndicator = document.getElementById('spp-indicator');
        if (sppIndicator && sppActive) {
            sppIndicator.classList.add('spp');
            setTimeout(() => {
                sppIndicator.classList.remove('spp');
            }, 300);
        }

        // DON'T send preset list on every broadcast (causes flicker)
        // It's sent once when switching to milkdrop mode and when requestState is called
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
            // Apply audio monitoring setting (must be done AFTER microphone connects)
            const monitoringEnabled = this.settings.get('audioBeatReactive') === 'true';
            if (this.audioSource.setMonitoring) {
                this.audioSource.setMonitoring(monitoringEnabled);
                console.log('[Revision] Applied audio monitoring setting:', monitoringEnabled);
            }

            // Apply note duration setting
            const noteDuration = this.settings.get('audioNoteDuration') || '60';
            if (this.audioSource.setNoteDuration) {
                this.audioSource.setNoteDuration(parseInt(noteDuration));
                console.log('[Revision] Applied note duration setting:', noteDuration, 'ms');
            }

            // Apply beat detection settings
            const beatThreshold = this.settings.get('beatThreshold') || '1.6';
            if (this.audioSource.setBeatThreshold) {
                this.audioSource.setBeatThreshold(parseFloat(beatThreshold));
                console.log('[Revision] Applied beat threshold:', beatThreshold);
            }

            const beatMinTime = this.settings.get('beatMinTime') || '400';
            if (this.audioSource.setBeatMinTime) {
                this.audioSource.setBeatMinTime(parseInt(beatMinTime));
                console.log('[Revision] Applied beat min time:', beatMinTime, 'ms');
            }

            // ALWAYS register audio source with InputManager when connected
            // Audio analysis runs regardless of visualAudioSource setting
            // (needed for MIDI output, beat detection, and other renderers)
            // The visualAudioSource setting only controls what gets routed to Milkdrop
            console.log('[Revision] 🟢 Registering audio input device with InputManager');
            this.inputManager.registerSource('audio', this.audioSource);
            console.log('[Revision] ✅ Active sources:', this.inputManager.getAllSources());
            this.audioIndicator.classList.add('connected');
            this.audioIndicator.style.backgroundColor = '#ff3333';
            this.audioIndicator.style.boxShadow = '0 0 8px #ff3333';

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

    setupMIDISynthHandlers() {
        if (!this.midiSynthSource || !this.midiAudioSynth) {
            console.warn('[Revision] Cannot setup MIDI synth handlers - source or synth not available');
            return;
        }

        // Clear any existing 'note' handlers first (avoid duplicates)
        this.midiSynthSource.removeAllListeners('note');

        // Route notes from MIDI synth input to the synth (if feed input enabled)
        this.midiSynthSource.on('note', (data) => {
            const feedInputEnabled = this.settings.get('midiSynthFeedInput') === 'true';
            if (!feedInputEnabled) return;

            const synthChannel = this.settings.get('midiSynthChannel') || 'all';
            const matchesChannel = (synthChannel === 'all') || (parseInt(synthChannel) === data.channel);

            if (matchesChannel) {
                if (data.velocity > 0) {
                    this.midiAudioSynth.handleNoteOn(data.note, data.velocity);
                } else {
                    this.midiAudioSynth.handleNoteOff(data.note);
                }
            }
        });

        console.log('[Revision] MIDI synth input handlers set up');
    }

    setupInputHandlers() {
        // Beat events
        this.inputManager.on('beat', (data) => {
            this.beatPhase = data.phase;
            this.lastBeatTime = performance.now(); // Track beat for control.html indicator

            // Feed beats to MIDI synthesizer (generates kick drum if enabled)
            const beatKickEnabled = this.settings.get('midiSynthBeatKick') === 'true';

            // CRITICAL: Trigger kick for ANY beat source (audio OR midi), not just MIDI
            if (this.midiAudioSynth && beatKickEnabled) {
                this.midiAudioSynth.handleBeat(data.intensity || 1.0);
            }

            // Send MIDI kick notes to MIDI output (if enabled in Reactive Output)
            const reactiveOutputBeatKick = this.settings.get('reactiveOutputBeatKick') === 'true';
            if (this.midiOutputSource && this.midiOutputSource.isActive && reactiveOutputBeatKick) {
                const kickNote = 36; // C1 - standard kick drum MIDI note
                const velocity = Math.floor((data.intensity || 1.0) * 127);

                // Send Note ON
                this.midiOutputSource.sendNoteOn(kickNote, velocity);

                // Auto Note OFF after 100ms (short kick)
                setTimeout(() => {
                    this.midiOutputSource.sendNoteOff(kickNote);
                }, 100);
            }

            // Update position tracking for MIDI interpolation
            if (data.source === 'midi' && this.midiSource) {
                const newPosition = this.midiSource.getSongPosition();

                this.lastMIDIUpdateTime = performance.now();
                this.lastMIDIPosition = newPosition;
                this.currentPosition = newPosition;

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
            } else if (this.currentPresetType === 'video' && this.videoRenderer) {
                this.videoRenderer.handleBeat(data);
            } else if (this.currentPresetType === 'media' && this.mediaRenderer) {
                // ALWAYS pass beat to media renderer (it decides whether to use it)
                const now = performance.now();
                if (now - this.mediaRenderer.lastBeatTime >= 100) {
                    this.mediaRenderer.lastBeatTime = now;
                    const intensity = data.intensity || 1.0;
                    this.mediaRenderer.targetZoom = 1.0 + (intensity * 0.15);
                    this.mediaRenderer.beatZoom = this.mediaRenderer.targetZoom;
                }
            } else if (this.currentPresetType === 'stream' && this.streamRenderer) {
                this.streamRenderer.handleBeat(data);
            } else if (this.currentPresetType === 'webpage' && this.webpageRenderer) {
                this.webpageRenderer.handleBeat(data);
            }
        });

        // Note events
        this.inputManager.on('note', (data) => {
            // Send audio-frequency notes to MIDI output (if enabled in Reactive Output)
            const reactiveOutputFrequency = this.settings.get('reactiveOutputFrequency') === 'true';
            if (this.midiOutputSource && this.midiOutputSource.isActive &&
                data.source === 'audio-frequency' && reactiveOutputFrequency) {
                if (data.velocity > 0) {
                    this.midiOutputSource.sendNoteOn(data.note, data.velocity);
                } else {
                    this.midiOutputSource.sendNoteOff(data.note);
                }
            }

            // Feed audio-frequency notes to MIDI synth (if auto-feed enabled)
            const autoFeedEnabled = this.settings.get('midiSynthAutoFeed') === 'true';
            if (this.midiAudioSynth && data.source === 'audio-frequency' && autoFeedEnabled) {
                if (data.velocity > 0) {
                    this.midiAudioSynth.handleNoteOn(data.note, data.velocity);
                } else {
                    this.midiAudioSynth.handleNoteOff(data.note);
                }
            }

            // Feed MIDI input notes to synthesizer (if enabled and on correct channel)
            const feedInputEnabled = this.settings.get('midiSynthFeedInput') === 'true';
            if (this.midiAudioSynth && data.source === 'midi' && feedInputEnabled) {
                const synthChannel = this.settings.get('midiSynthChannel') || 'all';
                const matchesChannel = (synthChannel === 'all') || (parseInt(synthChannel) === data.channel);

                if (matchesChannel) {
                    if (data.velocity > 0) {
                        this.midiAudioSynth.handleNoteOn(data.note, data.velocity);
                    } else {
                        this.midiAudioSynth.handleNoteOff(data.note);
                    }
                }
            }
            // else if (data.source === 'midi') {
            //     console.log(`[Revision] ⚠️ MIDI Synth NOT ACTIVE - visualAudioSource: ${this.settings.get('visualAudioSource')}`);
            // }

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
            // console.log('[Revision] Transport:', data.state, 'BPM:', data.bpm);
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

        // Frequency events (from audio OR midi-synth)
        this.inputManager.on('frequency', (data) => {
            // CRITICAL: Only accept frequency events from the ACTIVE visualAudioSource
            const activeSource = this.currentVisualAudioSource || 'microphone';

            // Map source names: 'audio' -> 'microphone', 'midi-synth' -> 'midi'
            const dataSourceMapped = data.source === 'audio' ? 'microphone' :
                                     data.source === 'midi-synth' ? 'midi' :
                                     data.source;

            if (dataSourceMapped !== activeSource) {
                // Ignore frequency events from inactive source
                return;
            }

            // Store last frequency data for EQ display in control.html
            if (data.bands) {
                this.lastFrequencyData = {
                    bass: data.bands.bass || 0,
                    mid: data.bands.mid || 0,
                    high: data.bands.high || 0
                };
            }

            // Only pass to active renderer
            if (this.currentPresetType === 'builtin') {
                this.presetManager.handleFrequency(data);
            } else if (this.currentPresetType === 'threejs' && this.threeJSRenderer) {
                this.threeJSRenderer.handleFrequency(data);
            } else if (this.currentPresetType === 'video' && this.videoRenderer) {
                this.videoRenderer.handleFrequency(data);
            } else if (this.currentPresetType === 'media' && this.mediaRenderer) {
                // ALWAYS pass frequency data to media renderer (it decides whether to use it)
                if (data.bands) {
                    this.mediaRenderer.bassLevel = data.bands.bass || 0;
                    this.mediaRenderer.midLevel = data.bands.mid || 0;
                    this.mediaRenderer.highLevel = data.bands.high || 0;
                }
            } else if (this.currentPresetType === 'stream' && this.streamRenderer) {
                this.streamRenderer.handleFrequency(data);
            } else if (this.currentPresetType === 'webpage' && this.webpageRenderer) {
                this.webpageRenderer.handleFrequency(data);
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
        // Permissions button
        const permBtn = document.getElementById('permissions-btn');
        if (permBtn) {
            const requestPerms = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.requestPermissions();
            };
            permBtn.addEventListener('click', requestPerms);
            permBtn.addEventListener('touchend', requestPerms);
        }

        // Control page
        const controlBtn = document.getElementById('control-btn');
        if (controlBtn) {
            const openControl = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open('control.html', '_blank');
            };
            controlBtn.addEventListener('click', openControl);
            controlBtn.addEventListener('touchend', openControl);
        }

        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            const toggleFullscreen = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!document.fullscreenElement) {
                    document.body.requestFullscreen().catch(err => {
                        console.error('[Revision] Fullscreen request failed:', err);
                    });
                } else {
                    document.exitFullscreen();
                }
            };
            fullscreenBtn.addEventListener('click', toggleFullscreen);
            fullscreenBtn.addEventListener('touchend', toggleFullscreen);
        }

        // Fullscreen change (triggered by F11 or fullscreen button)
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

        // CRITICAL: Clean up ALL resources on page unload/close
        window.addEventListener('beforeunload', () => {
            console.log('[Revision] Page unloading - cleaning up all resources...');

            // Stop MIDI synth (stops all oscillators and intervals)
            if (this.midiAudioSynth) {
                console.log('[Revision] Destroying MIDI synth...');
                this.midiAudioSynth.destroy();
            }

            // Stop all renderers
            if (this.renderer) this.renderer.stop();
            if (this.threeJSRenderer) this.threeJSRenderer.stop();
            if (this.milkdropRenderer) this.milkdropRenderer.stop();
            if (this.videoRenderer) {
                console.log('[Revision] Releasing camera...');
                this.videoRenderer.release();
            }
            if (this.mediaRenderer) this.mediaRenderer.stop();
            if (this.streamRenderer) this.streamRenderer.stop();
            if (this.webpageRenderer) this.webpageRenderer.stop();

            // Disconnect audio input
            if (this.audioSource) {
                console.log('[Revision] Disconnecting audio input...');
                this.audioSource.disconnect();
            }

            // Close MIDI connections
            if (this.midiSource) {
                console.log('[Revision] Closing MIDI connections...');
                // MIDI connections auto-close, but we can clear references
            }

            console.log('[Revision] ✓ Cleanup complete');
        });

        // Also release on visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.videoRenderer && this.videoRenderer.isActive) {
                console.log('[Revision] Tab hidden - releasing camera to prevent lock');
                this.videoRenderer.release();
            }
        });
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
        const previousType = this.currentPresetType;
        this.currentPresetType = type;
        this.settings.set('presetType', type);

        // If staying in same mode, check if we need to fade or not
        // Media mode: ALWAYS fade (loading new image/video)
        // Video mode: ALWAYS fade (might be switching cameras)
        // Milkdrop: NO fade (preset changes handled by loadMilkdropPreset with internal crossfade)
        // Builtin: NO fade (scene changes handled by switchScene)
        // ThreeJS: NO fade (no sub-modes)
        if (previousType === type && type !== 'media' && type !== 'video') {
            console.log('[Revision] Already in', type, 'mode - no transition needed');
            return;
        }

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
                console.error(`[Revision] Failed to load ${libraryNeeded} library`);
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

        // CRITICAL: Release camera when switching away from video mode
        if (this.videoRenderer && previousType === 'video' && type !== 'video') {
            console.log('[Revision] Switching away from video mode - releasing camera');
            this.videoRenderer.release();
        } else if (this.videoRenderer && type !== 'video') {
            this.videoRenderer.stop();
        }

        // Stop media renderer when switching away from media mode
        if (this.mediaRenderer && previousType === 'media' && type !== 'media') {
            console.log('[Revision] Switching away from media mode - stopping media');
            this.mediaRenderer.stop();
        }

        // Stop stream renderer when switching away from stream mode
        if (this.streamRenderer && previousType === 'stream' && type !== 'stream') {
            console.log('[Revision] Switching away from stream mode - stopping stream');
            this.streamRenderer.stop();
        }

        // Stop webpage renderer when switching away from webpage mode
        if (this.webpageRenderer && previousType === 'webpage' && type !== 'webpage') {
            console.log('[Revision] Switching away from webpage mode - stopping webpage');
            this.webpageRenderer.stop();
        }

        // Stop all renderers
        this.renderer.stop();
        if (this.threeJSRenderer) this.threeJSRenderer.stop();
        if (this.milkdropRenderer) this.milkdropRenderer.stop();

        // Find current visible canvas
        const canvases = [
            this.builtinCanvas,
            this.threejsCanvas,
            this.milkdropCanvas,
            this.videoCanvas,
            this.mediaCanvas
        ];

        const currentCanvas = canvases.find(canvas =>
            canvas && canvas.style.display !== 'none'
        );

        // Fade out current canvas
        if (currentCanvas) {
            currentCanvas.style.opacity = '0';
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Hide all canvases (except the one we're about to show)
        this.builtinCanvas.style.display = 'none';
        this.threejsCanvas.style.display = 'none';
        this.milkdropCanvas.style.display = 'none';
        this.videoCanvas.style.display = 'none';
        this.mediaCanvas.style.display = 'none';
        this.streamCanvas.style.display = 'none';
        this.webpageContainer.style.display = 'none';

        // Manage black-screen visibility
        // Black-screen is only used during transitions to hide builtin canvas
        // It should NOT be visible while renderers are actively running
        // We'll show it briefly during fade-out, then hide it after mode switch completes
        this.blackScreen.style.display = 'block';

        // Switch to appropriate preset
        switch (type) {
            case 'builtin':
                this.builtinCanvas.style.display = 'block';
                this.builtinCanvas.style.opacity = '0';

                // CRITICAL: Check if WebGL context is lost and reinitialize if needed
                const testContext = this.builtinCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
                                   this.builtinCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
                if (!testContext) {
                    console.warn('[Revision] WebGL context destroyed (2D context was used) - reinitializing renderer...');
                    // Destroy and recreate renderer
                    if (this.renderer) {
                        this.renderer.stop();
                    }
                    this.renderer = new VisualRenderer('builtin-canvas');
                    const renderMode = this.settings.get('renderer') || 'webgl';
                    this.renderer.initialize(renderMode);
                    this.sceneManager = new SceneManager(this.renderer);
                    this.presetManager.setRenderer('builtin', this.renderer);

                    // CRITICAL: Update reference to the new canvas element (renderer replaces it)
                    this.builtinCanvas = document.getElementById('builtin-canvas');
                    console.log('[Revision] ✓ Renderer reinitialized with fresh WebGL context and canvas replaced');

                    // Re-apply resolution to the new canvas element
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);
                }

                // Don't call resize() - dimensions already set by resizeAllCanvases()
                // Calling resize() here overrides the fixed resolution settings
                this.renderer.start();
                this.presetManager.switchPreset('builtin-tunnel');
                this.enableSceneButtons(true);
                // Fade in
                setTimeout(() => {
                    this.builtinCanvas.style.opacity = '1';
                    // Hide black-screen after fade completes
                    setTimeout(() => {
                        this.blackScreen.style.display = 'none';
                    }, 500);
                }, 50);
                console.log('[Revision] Built-in canvas visible, renderer started');
                break;
            case 'threejs':
                this.threejsCanvas.style.display = 'block';
                this.threejsCanvas.style.opacity = '0';
                if (this.threeJSRenderer) {
                    // Force reflow
                    this.threejsCanvas.offsetHeight;

                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    console.log('[ThreeJS] Applied saved resolution:', resolutionPreset);
                    this.threeJSRenderer.start();

                    // Check if audio input is enabled
                    if (!this.audioSource || !this.audioSource.isActive) {
                        console.warn('[ThreeJS] Enable Audio Input (microphone) in Settings for audio reactivity');
                    }
                } else {
                    console.error('[Revision] Three.js renderer not initialized');
                }
                // Fade in (black-screen stays visible to block WebGL)
                setTimeout(() => {
                    this.threejsCanvas.style.opacity = '1';
                }, 50);
                this.enableSceneButtons(false, 'Three.js mode - scene buttons disabled');
                break;
            case 'milkdrop':
                this.milkdropCanvas.style.display = 'block';
                // Add transition temporarily for mode switch fade only
                this.milkdropCanvas.style.transition = 'opacity 0.5s ease-in-out';
                this.milkdropCanvas.style.opacity = '0';
                if (this.milkdropRenderer && this.milkdropRenderer.isInitialized) {
                    console.log('[Milkdrop] Starting renderer...');

                    // Force reflow
                    this.milkdropCanvas.offsetHeight;

                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    console.log('[Milkdrop] Applied saved resolution:', resolutionPreset);

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

                    // Load first preset if none loaded yet
                    if (this.milkdropPresetKeys && this.milkdropPresetKeys.length > 0) {
                        this.loadMilkdropPreset(this.currentMilkdropIndex || 0);
                        console.log('[Milkdrop] Auto-loaded preset:', this.milkdropPresetKeys[this.currentMilkdropIndex || 0]);
                    }

                    console.log('[Milkdrop] Ready - use control.html to select preset');
                } else {
                    console.error('[Revision] Milkdrop renderer not initialized properly');
                    // Fallback to builtin
                    this.builtinCanvas.style.display = 'block';
                    this.milkdropCanvas.style.display = 'none';
                    this.renderer.start();
                    this.currentPresetType = 'builtin';
                }
                // Fade in (black-screen stays visible to block WebGL)
                setTimeout(() => {
                    this.milkdropCanvas.style.opacity = '1';
                    // Remove transition after fade completes to avoid interfering with Butterchurn's internal crossfade
                    setTimeout(() => {
                        this.milkdropCanvas.style.transition = '';
                    }, 500);
                }, 50);
                this.enableSceneButtons(false, 'Milkdrop - MIDI CC1 controls preset');
                break;
            case 'video':
                this.videoCanvas.style.display = 'block';
                this.videoCanvas.style.opacity = '0';
                if (this.videoRenderer) {
                    // Clear canvas to avoid showing old camera frame
                    const ctx = this.videoCanvas.getContext('2d');
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, this.videoCanvas.width, this.videoCanvas.height);

                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    // Don't auto-initialize camera - let user select from dropdown
                    // This avoids permission errors and camera conflicts
                    if (this.videoRenderer.isActive) {
                        // If already active, start rendering
                        this.videoRenderer.start();
                        console.log('[Video] Renderer started - webcam feed active');
                    } else {
                        console.log('[Video] Ready - select camera in control.html to start');
                    }
                } else {
                    console.error('[Revision] Video renderer not initialized');
                }
                // Fade in (black-screen stays visible to block WebGL)
                setTimeout(() => {
                    this.videoCanvas.style.opacity = '1';
                }, 50);
                this.enableSceneButtons(false, 'Video mode - select camera in control.html');
                break;
            case 'media':
                this.mediaCanvas.style.display = 'block';
                this.mediaCanvas.style.opacity = '0';
                if (this.mediaRenderer) {
                    // Clear canvas
                    const ctx = this.mediaCanvas.getContext('2d');
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, this.mediaCanvas.width, this.mediaCanvas.height);

                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    // Load pending media AFTER fade-out completes (if any)
                    if (this.pendingMediaLoad) {
                        console.log('[Media] Loading pending media:', this.pendingMediaLoad.url);

                        // Get audio output setting BEFORE loading
                        const audioOutputEnabled = this.settings.get('videoAudioOutput') === 'true';

                        this.mediaRenderer.loadMedia(this.pendingMediaLoad.url, this.pendingMediaLoad.type, {
                            loop: this.pendingMediaLoad.loop,
                            fitMode: this.pendingMediaLoad.fitMode,
                            audioOutput: audioOutputEnabled // Pass audio setting directly
                        });

                        // Apply saved reactive settings
                        const audioReactive = this.settings.get('mediaAudioReactive') === 'true';
                        const beatReactive = this.settings.get('mediaBeatReactive') === 'true';
                        this.mediaRenderer.audioReactive = audioReactive;
                        this.mediaRenderer.beatReactive = beatReactive;

                        console.log('[Media] ✓ Loaded - fitMode:', this.pendingMediaLoad.fitMode, 'audioOutput:', audioOutputEnabled, 'audioReactive:', audioReactive, 'beatReactive:', beatReactive);
                        this.pendingMediaLoad = null; // Clear pending
                    } else {
                        console.log('[Media] Ready - waiting for media file');
                    }
                } else {
                    console.error('[Revision] Media renderer not initialized');
                }
                // Fade in (black-screen stays visible to block WebGL)
                setTimeout(() => {
                    this.mediaCanvas.style.opacity = '1';
                }, 50);
                this.enableSceneButtons(false, 'Media mode - load media in control.html');
                break;
            case 'stream':
                this.streamCanvas.style.display = 'block';
                this.streamCanvas.style.opacity = '0';
                if (this.streamRenderer) {
                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    console.log('[Stream] Ready - waiting for stream URL');
                } else {
                    console.error('[Revision] Stream renderer not initialized');
                }
                // Fade in
                setTimeout(() => {
                    this.streamCanvas.style.opacity = '1';
                }, 50);
                this.enableSceneButtons(false, 'Stream mode - load stream in control.html');
                break;
            case 'webpage':
                this.webpageContainer.style.display = 'block';
                this.webpageContainer.style.opacity = '0';
                if (this.webpageRenderer) {
                    // Apply saved resolution setting to ensure correct dimensions
                    const resolutionPreset = this.settings.get('programResolution') || 'auto';
                    const customWidth = this.settings.get('customResolutionWidth');
                    const customHeight = this.settings.get('customResolutionHeight');
                    this.applyProgramResolution(resolutionPreset, customWidth, customHeight);

                    console.log('[Webpage] Ready - waiting for webpage URL');
                } else {
                    console.error('[Revision] Webpage renderer not initialized');
                }
                // Fade in
                setTimeout(() => {
                    this.webpageContainer.style.opacity = '1';
                }, 50);
                this.enableSceneButtons(false, 'Webpage mode - load webpage in control.html');
                break;
        }

        // Update mode display
        const modeNames = { builtin: 'Built-in', threejs: 'Three.js', milkdrop: 'Milkdrop', video: 'Video', media: 'Media', stream: 'Stream', webpage: 'Webpage' };
        if (this.modeDisplay) {
            this.modeDisplay.textContent = modeNames[type] || type;
        }

        // Broadcast state update
        this.broadcastState();

        // Explicitly send preset list when switching to milkdrop
        if (type === 'milkdrop' && this.milkdropPresetKeys) {
            this.controlChannel.postMessage({
                type: 'presetList',
                data: this.milkdropPresetKeys
            });
            console.log('[Revision] Sent preset list to control.html:', this.milkdropPresetKeys.length, 'presets');
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

    // Preset file mappings
    getThreeJSPresetInfo(presetName) {
        const presetMap = {
            'geometric': { file: 'presets/threejs/GeometricShapes.js', className: 'GeometricShapesPreset' },
            'particles': { file: 'presets/threejs/Particles.js', className: 'ParticlesPreset' },
            'tunnel': { file: 'presets/threejs/Tunnel.js', className: 'TunnelPreset' },
            'gblogo': { file: 'presets/threejs/GBLogo.js', className: 'GBLogoPreset' }
        };
        return presetMap[presetName];
    }

    async loadThreeJSPreset(presetName, cacheBust = true) {
        const presetInfo = this.getThreeJSPresetInfo(presetName);
        if (!presetInfo) {
            console.error(`[Revision] Unknown preset: ${presetName}`);
            return false;
        }

        try {
            console.log(`[Revision] Loading Three.js preset on-demand: ${presetName}${cacheBust ? ' (fresh)' : ''}`);

            // CRITICAL: ALWAYS delete old class first to prevent "already declared" errors
            // This must happen regardless of cacheBust to handle reload scenarios
            if (window[presetInfo.className]) {
                delete window[presetInfo.className];
                console.log(`[Revision] Deleted old class: ${presetInfo.className}`);
            }

            if (cacheBust) {
                // Remove ALL old script tags for this preset first
                const oldScripts = document.querySelectorAll(`script[data-preset-src="${presetInfo.file}"]`);
                console.log(`[Revision] Removing ${oldScripts.length} old script tag(s) for ${presetName}`);
                oldScripts.forEach(s => s.remove());

                // Wait a tick to ensure scripts are fully removed from DOM
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Dynamically load the script with cache busting
            await this.loadScript(presetInfo.file, cacheBust);

            // Check if the class is now available
            if (typeof window[presetInfo.className] !== 'undefined') {
                this.threeJSRenderer.registerPreset(presetName, window[presetInfo.className]);
                console.log(`[Revision] ✓ Loaded Three.js preset: ${presetName}`);
                return true;
            } else {
                console.warn(`[Revision] ✗ Preset class ${presetInfo.className} not found after loading ${presetInfo.file}`);
                return false;
            }
        } catch (error) {
            console.error(`[Revision] Failed to load preset ${presetName}:`, error);
            return false;
        }
    }

    async loadThreeJSPresets() {
        // Load all presets at startup (without cache busting)
        const presetNames = ['geometric', 'particles', 'tunnel'];

        for (const presetName of presetNames) {
            await this.loadThreeJSPreset(presetName, false);
        }

        // Load first preset as default
        const presets = this.threeJSRenderer.getAvailablePresets();
        if (presets.length > 0) {
            this.threeJSRenderer.loadPreset(presets[0]);
        }
    }

    loadScript(src, cacheBust = false) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.setAttribute('data-preset-src', src);

            // Add cache-busting timestamp to force reload
            if (cacheBust) {
                script.src = `${src}?t=${Date.now()}`;
            } else {
                script.src = src;
            }

            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
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

        // Calculate height based on visible UI elements
        let topOffset = 0;
        let bottomOffset = 0;

        if (!isFullscreen) {
            const statusBar = document.querySelector('.status-bar');
            const controlPanel = document.querySelector('.control-panel');

            if (statusBar && statusBar.style.display !== 'none') {
                topOffset = 40;
            }
            if (controlPanel && controlPanel.style.display !== 'none') {
                bottomOffset = 80;
            }
        }

        const calcHeight = window.innerHeight - topOffset - bottomOffset;

        // Update canvas container height to match calculated size
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer && isFullscreen) {
            canvasContainer.style.height = '100vh';
        } else if (canvasContainer) {
            canvasContainer.style.height = `${calcHeight}px`;
        }

        // Check if user has set a specific resolution (not auto)
        const resolutionPreset = this.settings.get('programResolution') || 'auto';

        // Only resize for responsive modes (auto and 100%)
        const isResponsive = (resolutionPreset === 'auto' || resolutionPreset === '100%');

        if (!isResponsive) {
            // Fixed resolution - don't resize, dimensions are already set
            console.log(`[Revision] Window resized - FIXED mode (${resolutionPreset}) - keeping original dimensions (no resize)`);
            return;
        }

        // Responsive mode - calculate new dimensions
        let w, h;

        if (resolutionPreset === 'auto') {
            // Auto mode - use window dimensions
            w = canvasContainer ? canvasContainer.clientWidth : window.innerWidth;
            h = canvasContainer ? canvasContainer.clientHeight : calcHeight;
            console.log('[Revision] Window resized - AUTO mode - container:', w, 'x', h, 'fullscreen:', isFullscreen);
        } else {
            // 100% mode - use container dimensions (responsive)
            w = canvasContainer ? canvasContainer.clientWidth : window.innerWidth;
            h = canvasContainer ? canvasContainer.clientHeight : calcHeight;
            console.log(`[Revision] Window resized - 100% mode - container:`, w, 'x', h, 'fullscreen:', isFullscreen);
        }

        // Resize all canvases to responsive dimensions
        this.resizeAllCanvases(w, h);
        console.log('[Revision] ✓ Resized all canvases for responsive mode');
        return; // Exit early - don't call individual renderer resize methods below

        // Resize active renderer (UNREACHABLE - kept for reference)
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
            case 'video':
                if (this.videoRenderer) {
                    this.videoRenderer.resize(w, h);
                    console.log('[Video] Resized to:', w, 'x', h);
                }
                break;
            case 'media':
                if (this.mediaRenderer) {
                    const mediaHeight = isFullscreen ? window.innerHeight : h;
                    this.mediaRenderer.resize(w, mediaHeight);
                    console.log('[Media] Resized to:', w, 'x', mediaHeight, 'fullscreen:', isFullscreen);
                }
                break;
            case 'stream':
                if (this.streamRenderer) {
                    const streamHeight = isFullscreen ? window.innerHeight : h;
                    this.streamRenderer.resize(w, streamHeight);
                    console.log('[Stream] Resized to:', w, 'x', streamHeight, 'fullscreen:', isFullscreen);
                }
                break;
            case 'webpage':
                if (this.webpageRenderer) {
                    const webpageHeight = isFullscreen ? window.innerHeight : h;
                    this.webpageRenderer.resize(w, webpageHeight);
                    console.log('[Webpage] Resized to:', w, 'x', webpageHeight, 'fullscreen:', isFullscreen);
                }
                break;
        }
    }

    handleFullscreenEnter() {
        // FORCE HIDE status bar and control panel
        const statusBar = document.querySelector('.status-bar');
        const controlPanel = document.querySelector('.control-panel');

        if (statusBar) {
            statusBar.style.display = 'none';
            console.log('[Revision] Status bar HIDDEN in fullscreen');
        }
        if (controlPanel) {
            controlPanel.style.display = 'none';
            console.log('[Revision] Control panel HIDDEN in fullscreen');
        }

        // Adjust canvas container to fill entire screen
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.top = '0';
            canvasContainer.style.bottom = '0';
            canvasContainer.style.height = '100vh';
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        this.handleResize();
    }

    handleFullscreenExit() {
        // RESTORE status bar and control panel to SAVED state (not always visible!)
        const showStatusBar = this.settings.get('showStatusBar') !== 'false';
        const showControlPanel = this.settings.get('showControlPanel') === 'true';

        const statusBar = document.querySelector('.status-bar');
        const controlPanel = document.querySelector('.control-panel');

        if (statusBar) {
            statusBar.style.display = showStatusBar ? '' : 'none';
            console.log('[Revision] Status bar', showStatusBar ? 'RESTORED' : 'KEPT HIDDEN', '- exited fullscreen');
        }
        if (controlPanel) {
            controlPanel.style.display = showControlPanel ? '' : 'none';
            console.log('[Revision] Control panel', showControlPanel ? 'RESTORED' : 'KEPT HIDDEN', '- exited fullscreen');
        }

        // No need to resize - overlays don't affect canvas size
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
