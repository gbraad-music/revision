// Settings Manager - Persistent settings using localStorage
class SettingsManager {
    constructor() {
        this.settings = {
            midiInputId: null,
            renderer: 'webgl',
            oscServer: '',
            lastScene: 0
        };

        this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem('revision-settings');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.settings = { ...this.settings, ...parsed };
                console.log('[Settings] Loaded from localStorage');
            }
        } catch (error) {
            console.error('[Settings] Failed to load:', error);
        }
    }

    save() {
        try {
            localStorage.setItem('revision-settings', JSON.stringify(this.settings));
            console.log('[Settings] Saved to localStorage');
        } catch (error) {
            console.error('[Settings] Failed to save:', error);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    getAll() {
        return { ...this.settings };
    }

    reset() {
        this.settings = {
            midiInputId: null,
            renderer: 'webgl',
            oscServer: '',
            lastScene: 0
        };
        this.save();
    }
}

window.SettingsManager = SettingsManager;
