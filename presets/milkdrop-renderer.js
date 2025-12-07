// MilkdropRenderer - Butterchurn integration wrapper
// Requires butterchurn library: https://github.com/jberg/butterchurn

class MilkdropRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.visualizer = null;
        this.audioContext = null;
        this.isInitialized = false;
        this.currentPreset = null;
        this.isAnimating = false;

        // Audio data for visualization
        this.audioBuffer = null;
        this.sampleRate = 44100;
    }

    async initialize(audioContext = null) {
        try {
            // Check if butterchurn is loaded
            if (typeof butterchurn === 'undefined') {
                console.error('[Milkdrop] Butterchurn library not loaded');
                console.info('[Milkdrop] Include: <script src="https://unpkg.com/butterchurn@latest/lib/butterchurn.min.js"></script>');
                return false;
            }

            if (typeof butterchurnPresets === 'undefined') {
                console.error('[Milkdrop] Butterchurn presets not loaded');
                console.info('[Milkdrop] Include: <script src="https://unpkg.com/butterchurn-presets@latest/lib/butterchurnPresets.min.js"></script>');
                return false;
            }

            console.log('[Milkdrop] Butterchurn object:', butterchurn);
            console.log('[Milkdrop] Butterchurn.createVisualizer:', typeof butterchurn.createVisualizer);
            console.log('[Milkdrop] Canvas element:', this.canvas);
            console.log('[Milkdrop] Canvas size:', this.canvas.clientWidth, 'x', this.canvas.clientHeight);

            // Use provided audio context or create a new one
            if (audioContext) {
                this.audioContext = audioContext;
            } else {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
            }

            console.log('[Milkdrop] Audio context created:', this.audioContext);

            // Get canvas dimensions
            const width = this.canvas.clientWidth || 800;
            const height = this.canvas.clientHeight || 600;

            console.log('[Milkdrop] Attempting to create visualizer with size:', width, 'x', height);

            // Create butterchurn visualizer
            // Try default export first (most common in UMD bundles)
            if (butterchurn.default && typeof butterchurn.default.createVisualizer === 'function') {
                console.log('[Milkdrop] Using butterchurn.default.createVisualizer');
                this.visualizer = butterchurn.default.createVisualizer(
                    this.audioContext,
                    this.canvas,
                    { width, height, pixelRatio: window.devicePixelRatio || 1 }
                );
            } else if (typeof butterchurn.createVisualizer === 'function') {
                console.log('[Milkdrop] Using butterchurn.createVisualizer');
                this.visualizer = butterchurn.createVisualizer(
                    this.audioContext,
                    this.canvas,
                    { width, height, pixelRatio: window.devicePixelRatio || 1 }
                );
            } else if (typeof butterchurn.default === 'function') {
                console.log('[Milkdrop] Using butterchurn.default as constructor');
                this.visualizer = new butterchurn.default(
                    this.audioContext,
                    this.canvas,
                    { width, height, pixelRatio: window.devicePixelRatio || 1 }
                );
            } else {
                throw new Error('Butterchurn API not recognized - check butterchurn object structure');
            }

            console.log('[Milkdrop] Visualizer created:', !!this.visualizer);

            this.isInitialized = true;
            console.log('[Milkdrop] Initialized successfully - no preset loaded yet');

            return true;
        } catch (error) {
            console.error('[Milkdrop] Failed to initialize:', error);
            console.error('[Milkdrop] Error stack:', error.stack);
            this.isInitialized = false;
            return false;
        }
    }

    loadDefaultPreset() {
        try {
            // Get presets from butterchurnPresets
            const presets = butterchurnPresets.getPresets();
            const presetKeys = Object.keys(presets);

            if (presetKeys.length === 0) {
                console.warn('[Milkdrop] No presets available');
                return false;
            }

            // Load first preset as default
            const firstPresetKey = presetKeys[0];
            this.loadPreset(presets[firstPresetKey]);

            console.log('[Milkdrop] Loaded default preset:', firstPresetKey);
            return true;
        } catch (error) {
            console.error('[Milkdrop] Failed to load default preset:', error);
            return false;
        }
    }

    async loadPreset(presetData) {
        if (!this.isInitialized) {
            console.error('[Milkdrop] Not initialized');
            return false;
        }

        if (!this.visualizer) {
            console.error('[Milkdrop] Visualizer not available');
            return false;
        }

        try {
            console.log('[Milkdrop] Loading preset...');
            this.visualizer.loadPreset(presetData, 0); // 0 = immediate transition
            this.currentPreset = presetData;
            console.log('[Milkdrop] Preset loaded successfully');
            return true;
        } catch (error) {
            console.error('[Milkdrop] Failed to load preset:', error);
            return false;
        }
    }

    loadPresetByName(presetName) {
        try {
            const presets = butterchurnPresets.getPresets();
            const preset = presets[presetName];

            if (!preset) {
                console.error('[Milkdrop] Preset not found:', presetName);
                return false;
            }

            return this.loadPreset(preset);
        } catch (error) {
            console.error('[Milkdrop] Failed to load preset by name:', error);
            return false;
        }
    }

    getAvailablePresets() {
        try {
            const presets = butterchurnPresets.getPresets();
            return Object.keys(presets);
        } catch (error) {
            console.error('[Milkdrop] Failed to get presets:', error);
            return [];
        }
    }

    // Feed audio data to visualizer
    connectAudioSource(audioNode) {
        if (!this.isInitialized) {
            console.error('[Milkdrop] Not initialized');
            return false;
        }

        try {
            console.log('[Milkdrop] Connecting audio node:', audioNode);
            console.log('[Milkdrop] Audio node type:', audioNode.constructor.name);
            console.log('[Milkdrop] Audio context:', audioNode.context);
            console.log('[Milkdrop] Audio context state:', audioNode.context.state);

            this.visualizer.connectAudio(audioNode);
            console.log('[Milkdrop] ✓ Audio source connected successfully');

            // Test: Create a test tone to verify audio path works
            if (audioNode.context.state === 'suspended') {
                console.warn('[Milkdrop] AudioContext is SUSPENDED - user interaction may be needed');
            }

            return true;
        } catch (error) {
            console.error('[Milkdrop] Failed to connect audio:', error);
            return false;
        }
    }

    // Update with frequency data from InputManager
    updateFrequencyData(frequencyData, timeDomainData) {
        // Butterchurn uses its own audio analysis, but we can
        // potentially inject data if needed for non-audio sources (MIDI)
        // This is more complex and may require custom integration
    }

    render() {
        if (!this.isInitialized || !this.visualizer) {
            this.isAnimating = false;
            return;
        }

        try {
            this.visualizer.render();
        } catch (error) {
            console.error('[Milkdrop] Render error:', error);
            this.isAnimating = false;
        }
    }

    start() {
        if (!this.isInitialized) {
            console.error('[Milkdrop] Cannot start - not initialized');
            return;
        }

        if (this.isAnimating) {
            console.log('[Milkdrop] Already animating');
            return;
        }

        this.isAnimating = true;
        console.log('[Milkdrop] Animation started');
        this.animate();
    }

    stop() {
        console.log('[Milkdrop] Animation stopped');
        this.isAnimating = false;
    }

    animate() {
        if (!this.isAnimating || !this.isInitialized) {
            this.isAnimating = false;
            return;
        }

        this.render();
        requestAnimationFrame(() => this.animate());
    }

    resize(width, height) {
        if (!this.isInitialized) return;

        try {
            this.canvas.width = width;
            this.canvas.height = height;
            this.visualizer.setRendererSize(width, height);
            console.log('[Milkdrop] Resized to:', width, 'x', height);
        } catch (error) {
            console.error('[Milkdrop] Resize error:', error);
        }
    }

    destroy() {
        if (this.visualizer) {
            this.stop();
            // Butterchurn cleanup if available
            if (this.visualizer.destroy) {
                this.visualizer.destroy();
            }
            this.visualizer = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        this.isInitialized = false;
        console.log('[Milkdrop] Destroyed');
    }
}

window.MilkdropRenderer = MilkdropRenderer;
