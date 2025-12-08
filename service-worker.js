const CACHE_NAME = 'revision-v6';
const ASSETS = [
    './',
    './index.html',
    './control.html',
    './app.js',
    './manifest.json',
    // External libraries (local files)
    './external/butterchurn.min.js',
    './external/butterchurnPresets.min.js',
    './external/three.module.js',
    // Input sources
    './inputs/audio-input-source.js',
    './inputs/input-manager.js',
    './inputs/midi-audio-synth.js',
    './inputs/midi-input-source.js',
    // Presets and renderers
    './presets/milkdrop-renderer.js',
    './presets/preset-manager.js',
    './presets/threejs-renderer.js',
    './renderers/video-renderer.js',
    // Scenes
    './scenes/scene-manager.js',
    // Visuals
    './visuals/renderer.js',
    // Utils
    './utils/library-loader.js',
    './utils/midi-manager.js',
    './utils/mobile-compat.js',
    './utils/osc-client.js',
    './utils/settings-manager.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching app assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip caching external resources (CDN files)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached version or fetch from network
            return response || fetch(event.request).then((fetchResponse) => {
                // Cache new resources
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            });
        }).catch(() => {
            // Fallback for offline
            if (event.request.destination === 'document') {
                return caches.match('./index.html');
            }
            // Return a proper Response for non-document requests when offline
            return new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                    'Content-Type': 'text/plain'
                })
            });
        })
    );
});
