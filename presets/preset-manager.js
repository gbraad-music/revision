// PresetManager - Manages different visual preset types
// Supports: Built-in scenes, Milkdrop/butterchurn, Three.js, custom shaders

class PresetManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.presets = new Map();
        this.currentPreset = null;
        this.currentPresetId = null;

        // Preset types
        this.presetTypes = {
            BUILTIN: 'builtin',        // Original shader-based scenes
            MILKDROP: 'milkdrop',      // Milkdrop/butterchurn presets
            THREEJS: 'threejs',        // Three.js 3D scenes
            CUSTOM: 'custom'           // User-defined shaders/code
        };

        // Renderers
        this.renderers = {
            builtin: null,    // VisualRenderer (existing)
            milkdrop: null,   // Butterchurn visualizer
            threejs: null     // Three.js renderer
        };

        this.listeners = new Map();
    }

    initialize() {
        console.log('[PresetManager] Initializing...');

        // Register built-in presets (will be loaded from existing scenes)
        this.registerBuiltinPresets();

        console.log('[PresetManager] Initialized with', this.presets.size, 'presets');
    }

    registerBuiltinPresets() {
        // These will map to the existing 4 scenes
        const builtinPresets = [
            {
                id: 'builtin-tunnel',
                name: 'Tunnel Vision',
                type: this.presetTypes.BUILTIN,
                description: 'Hypnotic tunnel effect with beat sync',
                sceneIndex: 0
            },
            {
                id: 'builtin-particles',
                name: 'Particle Burst',
                type: this.presetTypes.BUILTIN,
                description: 'Explosive particle system',
                sceneIndex: 1
            },
            {
                id: 'builtin-kaleidoscope',
                name: 'Kaleidoscope',
                type: this.presetTypes.BUILTIN,
                description: 'Mirrored symmetry patterns',
                sceneIndex: 2
            },
            {
                id: 'builtin-waveform',
                name: 'Waveform',
                type: this.presetTypes.BUILTIN,
                description: 'Audio-reactive frequency bars',
                sceneIndex: 3
            }
        ];

        for (const preset of builtinPresets) {
            this.presets.set(preset.id, preset);
        }
    }

    registerMilkdropPreset(id, presetData) {
        this.presets.set(id, {
            id,
            name: presetData.name || id,
            type: this.presetTypes.MILKDROP,
            description: presetData.description || 'Milkdrop preset',
            data: presetData
        });
        console.log('[PresetManager] Registered Milkdrop preset:', id);
    }

    registerThreeJSPreset(id, sceneConfig) {
        this.presets.set(id, {
            id,
            name: sceneConfig.name || id,
            type: this.presetTypes.THREEJS,
            description: sceneConfig.description || 'Three.js scene',
            config: sceneConfig
        });
        console.log('[PresetManager] Registered Three.js preset:', id);
    }

    registerCustomPreset(id, config) {
        this.presets.set(id, {
            id,
            name: config.name || id,
            type: this.presetTypes.CUSTOM,
            description: config.description || 'Custom preset',
            config
        });
        console.log('[PresetManager] Registered custom preset:', id);
    }

    async switchPreset(presetId) {
        const preset = this.presets.get(presetId);
        if (!preset) {
            console.error('[PresetManager] Preset not found:', presetId);
            return false;
        }

        console.log('[PresetManager] Switching to:', presetId, preset.name);

        // Clean up current preset
        if (this.currentPreset && this.currentPreset.cleanup) {
            this.currentPreset.cleanup();
        }

        // Switch based on type
        let success = false;
        switch (preset.type) {
            case this.presetTypes.BUILTIN:
                success = this.activateBuiltinPreset(preset);
                break;
            case this.presetTypes.MILKDROP:
                success = await this.activateMilkdropPreset(preset);
                break;
            case this.presetTypes.THREEJS:
                success = await this.activateThreeJSPreset(preset);
                break;
            case this.presetTypes.CUSTOM:
                success = await this.activateCustomPreset(preset);
                break;
        }

        if (success) {
            this.currentPresetId = presetId;
            this.emit('preset-changed', { presetId, preset });
        }

        return success;
    }

    activateBuiltinPreset(preset) {
        // Use the existing VisualRenderer and SceneManager
        if (!this.renderers.builtin) {
            console.error('[PresetManager] Built-in renderer not available');
            return false;
        }

        // This will be hooked up to the existing SceneManager
        const sceneManager = this.renderers.builtin.sceneManager;
        if (sceneManager && preset.sceneIndex !== undefined) {
            sceneManager.switchScene(preset.sceneIndex);
            this.currentPreset = preset;
            return true;
        }

        return false;
    }

    async activateMilkdropPreset(preset) {
        // This will be implemented when butterchurn is integrated
        if (!this.renderers.milkdrop) {
            console.error('[PresetManager] Milkdrop renderer not available');
            return false;
        }

        try {
            await this.renderers.milkdrop.loadPreset(preset.data);
            this.currentPreset = preset;
            return true;
        } catch (error) {
            console.error('[PresetManager] Failed to load Milkdrop preset:', error);
            return false;
        }
    }

    async activateThreeJSPreset(preset) {
        // This will be implemented when three.js is integrated
        if (!this.renderers.threejs) {
            console.error('[PresetManager] Three.js renderer not available');
            return false;
        }

        try {
            await this.renderers.threejs.loadScene(preset.config);
            this.currentPreset = preset;
            return true;
        } catch (error) {
            console.error('[PresetManager] Failed to load Three.js preset:', error);
            return false;
        }
    }

    async activateCustomPreset(preset) {
        console.log('[PresetManager] Custom presets not yet implemented');
        return false;
    }

    setRenderer(type, renderer) {
        this.renderers[type] = renderer;
        console.log('[PresetManager] Registered renderer:', type);
    }

    getPreset(id) {
        return this.presets.get(id);
    }

    getAllPresets() {
        return Array.from(this.presets.values());
    }

    getPresetsByType(type) {
        return this.getAllPresets().filter(p => p.type === type);
    }

    getCurrentPreset() {
        return this.currentPreset;
    }

    getCurrentPresetId() {
        return this.currentPresetId;
    }

    // Event handling (for input from InputManager)
    handleBeat(data) {
        if (this.currentPreset && this.currentPreset.onBeat) {
            this.currentPreset.onBeat(data);
        }
    }

    handleNote(data) {
        if (this.currentPreset && this.currentPreset.onNote) {
            this.currentPreset.onNote(data);
        }
    }

    handleControl(data) {
        if (this.currentPreset && this.currentPreset.onControl) {
            this.currentPreset.onControl(data);
        }
    }

    handleFrequency(data) {
        if (this.currentPreset && this.currentPreset.onFrequency) {
            this.currentPreset.onFrequency(data);
        }
    }

    // Event emitter
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => callback(data));
    }
}

window.PresetManager = PresetManager;
