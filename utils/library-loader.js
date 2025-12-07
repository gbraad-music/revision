// LibraryLoader - Dynamic script loading for optional features
// Loads libraries on-demand to improve initial page load performance

class LibraryLoader {
    constructor() {
        this.loadedLibraries = new Set();
        this.loadingPromises = new Map();

        // Library definitions
        this.libraries = {
            'butterchurn': {
                name: 'Butterchurn',
                scripts: [
                    'https://unpkg.com/butterchurn@latest/lib/butterchurn.min.js',
                    'https://unpkg.com/butterchurn-presets@latest/lib/butterchurnPresets.min.js'
                ],
                check: () => typeof butterchurn !== 'undefined' && typeof butterchurnPresets !== 'undefined'
            },
            'threejs': {
                name: 'Three.js',
                scripts: [
                    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'
                ],
                check: () => typeof THREE !== 'undefined'
            }
        };
    }

    /**
     * Check if a library is already loaded
     */
    isLoaded(libraryId) {
        const lib = this.libraries[libraryId];
        if (!lib) {
            console.error('[LibraryLoader] Unknown library:', libraryId);
            return false;
        }

        return lib.check();
    }

    /**
     * Load a library dynamically
     * @param {string} libraryId - ID of the library to load
     * @returns {Promise<boolean>} - Resolves to true if successful
     */
    async load(libraryId) {
        // Check if already loaded
        if (this.isLoaded(libraryId)) {
            console.log('[LibraryLoader]', this.libraries[libraryId].name, 'already loaded');
            return true;
        }

        // Check if already loading
        if (this.loadingPromises.has(libraryId)) {
            console.log('[LibraryLoader]', this.libraries[libraryId].name, 'already loading...');
            return this.loadingPromises.get(libraryId);
        }

        const lib = this.libraries[libraryId];
        if (!lib) {
            console.error('[LibraryLoader] Unknown library:', libraryId);
            return false;
        }

        console.log('[LibraryLoader] Loading', lib.name, '...');

        // Create loading promise
        const loadingPromise = this.loadScripts(lib.scripts, lib.name);
        this.loadingPromises.set(libraryId, loadingPromise);

        try {
            await loadingPromise;

            // Verify it loaded correctly
            if (lib.check()) {
                console.log('[LibraryLoader] ✓', lib.name, 'loaded successfully');
                this.loadedLibraries.add(libraryId);
                this.loadingPromises.delete(libraryId);
                return true;
            } else {
                console.error('[LibraryLoader] ✗', lib.name, 'failed verification');
                this.loadingPromises.delete(libraryId);
                return false;
            }
        } catch (error) {
            console.error('[LibraryLoader] Error loading', lib.name, ':', error);
            this.loadingPromises.delete(libraryId);
            return false;
        }
    }

    /**
     * Load multiple scripts in sequence
     */
    async loadScripts(urls, libraryName) {
        for (const url of urls) {
            await this.loadScript(url, libraryName);
        }
    }

    /**
     * Load a single script
     */
    loadScript(url, libraryName) {
        return new Promise((resolve, reject) => {
            // Check if script already exists
            const existing = document.querySelector(`script[src="${url}"]`);
            if (existing) {
                console.log('[LibraryLoader] Script already in DOM:', url);
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.async = true;

            script.onload = () => {
                console.log('[LibraryLoader] Script loaded:', url);
                resolve();
            };

            script.onerror = (error) => {
                console.error('[LibraryLoader] Failed to load script:', url, error);
                reject(new Error(`Failed to load ${libraryName} from ${url}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Get loading status for all libraries
     */
    getStatus() {
        const status = {};
        for (const [id, lib] of Object.entries(this.libraries)) {
            status[id] = {
                name: lib.name,
                loaded: this.isLoaded(id),
                loading: this.loadingPromises.has(id)
            };
        }
        return status;
    }

    /**
     * Preload libraries in the background
     */
    async preloadAll() {
        console.log('[LibraryLoader] Preloading all libraries...');
        const promises = Object.keys(this.libraries).map(id => this.load(id));
        await Promise.all(promises);
        console.log('[LibraryLoader] All libraries preloaded');
    }
}

window.LibraryLoader = LibraryLoader;
