const CACHE_NAME = 'revision-v116';
const ASSETS = [
    './',
    './index.html',
    './control.html',
    './midi-bridge.html',
    './app.js',
    './control.js',
    './manifest.json',
    // External libraries (local files)
    './external/butterchurn.min.js',
    './external/butterchurnPresets.min.js',
    './external/three.min.js',
    './external/three.module.js',
    './external/hls.min.js',
    // Input sources
    './inputs/audio-input-source.js',
    './inputs/input-manager.js',
    './inputs/midi-audio-synth.js',
    './inputs/midi-input-source.js',
    './inputs/midi-output-source.js',
    './inputs/webrtc-midi-source.js',
    // Presets and renderers
    './presets/preset-manager.js',
    // Three.js Presets
    './presets/threejs/BasePreset.js',
    './presets/threejs/GeometricShapes.js',
    './presets/threejs/Particles.js',
    './presets/threejs/Tunnel.js',
    // Renderers
    './renderers/milkdrop-renderer.js',
    './renderers/threejs-renderer.js',
    './renderers/video-renderer.js',
    './renderers/stream-renderer.js',
    './renderers/webpage-renderer.js',
    // Scenes
    './scenes/scene-manager.js',
    // Visuals
    './visuals/renderer.js',
    // Utils
    './utils/library-loader.js',
    './utils/midi-manager.js',
    './utils/mobile-compat.js',
    './utils/osc-client.js',
    './utils/settings-manager.js',
    './utils/wake-lock.js',
    './utils/remote-channel.js',
    // MIDI-RTC (MIDI only)
    './utils/midi-rtc-bridge.js',
    './utils/midi-rtc/connection.js',
    './utils/midi-rtc/protocol.js',
    './utils/midi-rtc/midi-codec.js',
    './utils/midi-rtc/midi-utils.js',
    // MeisterRTC (MIDI + Audio + Video)
    './utils/meister-rtc-bridge.js',
    './utils/meister-rtc/connection.js',
    './utils/meister-rtc/protocol.js',
    './utils/meister-rtc/control-channel.js',
    // UI Components
    './utils/pad-knob.js',
    './utils/svg-slider.js',
    './utils/fader-components.js'
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
