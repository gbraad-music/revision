const CACHE_NAME = 'revision-v223';
const ASSETS = [
    // Root files
    './',
    './index.html',
    './control.html',
    './manifest.json',
    './favicon.svg',
    './favicon.ico',
    './favicon-96x96.png',
    './apple-touch-icon.png',
    './icon-192x192.png',
    './app.js',
    './main.js',
    './control.js',

    // External libraries
    './external/three.min.js',
    './external/butterchurn.min.js',
    './external/butterchurnPresets.min.js',
    './external/hls.min.js',

    // Utils
    './utils/library-loader.js',
    './utils/mobile-compat.js',
    './utils/settings-manager.js',
    './utils/wake-lock.js',
    './utils/osc-client.js',
    './utils/midi-manager.js',
    './utils/remote-channel.js',
    './utils/midi-rtc-bridge.js',
    './utils/pad-knob.js',
    './utils/svg-slider.js',
    './utils/fader-components.js',

    // Inputs
    './inputs/input-manager.js',
    './inputs/midi-input-source.js',
    './inputs/midi-output-source.js',
    './inputs/webrtc-midi-source.js',
    './inputs/audio-input-source.js',
    './inputs/frequency-analyzer.js',
    './inputs/midi-audio-synth.js',
    './inputs/rgresonate1-synth.js',
    './inputs/rg909-drum.js',

    // Effects
    './effects/effects-processor.js',
    './effects/audio-worklet-processor.js',
    './effects/regroove_effects.js',
    './effects/regroove-effects.wasm',
    './effects/effect-eq.js',
    './effects/effect-m1trim.js',

    // Synths (WASM binaries and worklet processors)
    './synths/synth-worklet-processor.js',
    './synths/drum-worklet-processor.js',
    './synths/rgresonate1-synth.wasm',
    './synths/rg909-drum.wasm',

    // Renderers
    './renderers/milkdrop-renderer.js',
    './renderers/threejs-renderer.js',
    './renderers/video-renderer.js',
    './renderers/stream-renderer.js',
    './renderers/webpage-renderer.js',

    // Scenes
    './scenes/scene-manager.js',

    // Presets
    './presets/preset-manager.js',
    './presets/threejs/BasePreset.js',

    // Visuals
    './visuals/renderer.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching app assets');
            // Cache files individually to avoid failure if one file is missing
            return Promise.allSettled(
                ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('[ServiceWorker] Failed to cache:', url, err.message);
                    })
                )
            );
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

// Fetch event - CACHE FIRST (offline-first, reliable on flaky networks)
self.addEventListener('fetch', (event) => {
    // Skip caching external resources
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        // Try cache FIRST for instant response
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Serve from cache immediately (offline-first)
                console.log('[ServiceWorker] Serving from cache:', event.request.url);

                // Update cache in background (stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {
                    // Network failed, but we already served from cache, so ignore
                });

                return cachedResponse;
            }

            // Not in cache, try network
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Network failed and not in cache - offline fallback
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({
                        'Content-Type': 'text/plain'
                    })
                });
            });
        })
    );
});
