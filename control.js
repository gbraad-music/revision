// RemoteChannel for tab-to-tab and remote communication (WebSocket + BroadcastChannel fallback)
const controlChannel = new RemoteChannel('revision-control');

// UNIFIED PREVIEW SYSTEM - Single canvas, one renderer at a time
let currentPreviewMode = 'black'; // Which tab is active: black/builtin/threejs/milkdrop/video/media
let unifiedCanvas = null;
let unifiedPreviewRenderer = null; // VideoRenderer OR VisualRenderer
let unifiedSceneManager = null; // For built-in scenes
let unifiedThreeJSRenderer = null; // For Three.js
let unifiedMilkdropVisualizer = null; // For Milkdrop
let unifiedAudioContext = null;
let currentVideoDeviceId = null;

// Media file state
let stagedMediaFile = null; // File object
let stagedMediaURL = null; // Object URL for preview
let stagedMediaType = null; // 'image' or 'video'
let mediaElement = null; // IMG or VIDEO element for rendering
let mediaFitMode = 'cover'; // How to fit media: cover, contain, fill

// Current program state (synced from main app)
let currentProgramMode = 'builtin';
let currentProgramRenderer = 'webgl';
let currentProgramScene = 0;
let lastProgramWidth = null;
let lastProgramHeight = null;

// Staged renderer mode (for preview, not synced after init)
let currentRendererMode = 'webgl';

// Staged state (preview before sending to program)
let stagedBuiltinScene = 0;
let stagedMilkdropIndex = 0;
let stagedThreeJSIndex = 0;
let stagedVideoDeviceId = '';
let milkdropPresetList = [];
let threejsPresetList = ['geometric', 'particles', 'tunnel', 'gblogo'];

// UNIFIED GO TO PROGRAM - Single button for all modes
function goToProgram() {
    console.log('[Control] GO TO PROGRAM - Preview Mode:', currentPreviewMode);

    switch (currentPreviewMode) {
        case 'black':
            console.log('[Control] GO TO PROGRAM: Black Screen');
            // Black screen is NOT a scene - it's achieved by hiding all canvases
            // Send custom command to show only black-screen div
            sendCommand('blackScreen');
            break;
        case 'builtin':
            goToProgramBuiltin();
            break;
        case 'threejs':
            goToProgramThreeJS();
            break;
        case 'milkdrop':
            goToProgramMilkdrop();
            break;
        case 'video':
            goToProgramVideo();
            break;
        case 'media':
            goToProgramMedia();
            break;
        case 'stream':
            goToProgramStream();
            break;
        case 'webpage':
            goToProgramWebpage();
            break;
    }
}

function goToProgramBuiltin() {
    console.log('[Control] GO TO PROGRAM: Built-in Scene', stagedBuiltinScene, 'Renderer:', currentRendererMode);

    if (currentProgramMode === 'builtin') {
        // Already in builtin - just switch scene and renderer simultaneously
        sendCommand('switchScene', stagedBuiltinScene);
        sendCommand('rendererSelect', currentRendererMode);
    } else {
        // Switch to builtin mode first
        sendCommand('switchMode', 'builtin');
        setTimeout(() => {
            sendCommand('switchScene', stagedBuiltinScene);
            sendCommand('rendererSelect', currentRendererMode);
        }, 100);
    }
}

function goToProgramThreeJS() {
    console.log('[Control] GO TO PROGRAM: Three.js Preset', threejsPresetList[stagedThreeJSIndex]);
    sendCommand('switchMode', 'threejs');
    setTimeout(() => {
        sendCommand('threejsSelect', threejsPresetList[stagedThreeJSIndex]);
    }, 100);
}

function goToProgramMilkdrop() {
    console.log('[Control] GO TO PROGRAM: Milkdrop Preset', stagedMilkdropIndex);

    if (milkdropPresetList.length === 0) {
        console.warn('[Control] No Milkdrop presets loaded yet - staying in current mode');
        return;
    }

    sendCommand('switchMode', 'milkdrop');
    setTimeout(() => {
        sendCommand('milkdropSelect', stagedMilkdropIndex);
    }, 100);
}

function goToProgramVideo() {
    console.log('[Control] GO TO PROGRAM: Video Camera', stagedVideoDeviceId);
    if (stagedVideoDeviceId) {
        sendCommand('switchMode', 'video');
        setTimeout(() => {
            sendCommand('videoDeviceSelect', stagedVideoDeviceId);
        }, 100);
    } else {
        console.warn('[Control] No camera selected');
    }
}

// SWITCH PREVIEW MODE - Tabs for Black/Built-in/ThreeJS/Milkdrop/Video/Media
function switchPreviewMode(mode) {
    console.log('[Control] Switching preview mode to:', mode);
    currentPreviewMode = mode;

    // Update tab button styles
    document.getElementById('preview-tab-black').style.background = mode === 'black' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-black').style.borderColor = mode === 'black' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-black').style.color = mode === 'black' ? 'white' : '#888';

    document.getElementById('preview-tab-builtin').style.background = mode === 'builtin' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-builtin').style.borderColor = mode === 'builtin' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-builtin').style.color = mode === 'builtin' ? 'white' : '#888';

    document.getElementById('preview-tab-threejs').style.background = mode === 'threejs' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-threejs').style.borderColor = mode === 'threejs' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-threejs').style.color = mode === 'threejs' ? 'white' : '#888';

    document.getElementById('preview-tab-milkdrop').style.background = mode === 'milkdrop' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-milkdrop').style.borderColor = mode === 'milkdrop' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-milkdrop').style.color = mode === 'milkdrop' ? 'white' : '#888';

    document.getElementById('preview-tab-video').style.background = mode === 'video' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-video').style.borderColor = mode === 'video' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-video').style.color = mode === 'video' ? 'white' : '#888';

    document.getElementById('preview-tab-media').style.background = mode === 'media' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-media').style.borderColor = mode === 'media' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-media').style.color = mode === 'media' ? 'white' : '#888';

    document.getElementById('preview-tab-stream').style.background = mode === 'stream' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-stream').style.borderColor = mode === 'stream' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-stream').style.color = mode === 'stream' ? 'white' : '#888';

    document.getElementById('preview-tab-webpage').style.background = mode === 'webpage' ? '#0066FF' : '#2a2a2a';
    document.getElementById('preview-tab-webpage').style.borderColor = mode === 'webpage' ? '#0088FF' : '#3a3a3a';
    document.getElementById('preview-tab-webpage').style.color = mode === 'webpage' ? 'white' : '#888';

    // Show/hide control sections
    document.getElementById('builtin-controls').style.display = mode === 'builtin' ? 'block' : 'none';
    document.getElementById('threejs-controls').style.display = mode === 'threejs' ? 'block' : 'none';
    document.getElementById('milkdrop-controls').style.display = mode === 'milkdrop' ? 'block' : 'none';
    document.getElementById('video-controls').style.display = mode === 'video' ? 'block' : 'none';
    document.getElementById('media-controls').style.display = mode === 'media' ? 'block' : 'none';
    document.getElementById('stream-controls').style.display = mode === 'stream' ? 'block' : 'none';
    document.getElementById('webpage-controls').style.display = mode === 'webpage' ? 'block' : 'none';

    // Update preview mode label
    const labels = { black: 'BLACK', builtin: 'BUILT-IN', threejs: 'THREE.JS', milkdrop: 'MILKDROP', video: 'VIDEO', media: 'MEDIA', stream: 'STREAM', webpage: 'WEBPAGE' };
    document.getElementById('preview-mode-label').textContent = labels[mode];

    // Stop and cleanup old preview renderer
    cleanupPreview();

    // Start appropriate preview
    switch (mode) {
        case 'black':
            initBlackPreview();
            break;
        case 'builtin':
            initBuiltinPreview();
            break;
        case 'threejs':
            initThreeJSPreview();
            break;
        case 'milkdrop':
            initMilkdropPreview();
            break;
        case 'video':
            initVideoPreview();
            break;
        case 'media':
            initMediaPreview();
            break;
        case 'stream':
            initStreamPreview();
            break;
        case 'webpage':
            initWebpagePreview();
            break;
    }
}

// CLEANUP PREVIEW - Stop current preview renderer
function cleanupPreview() {
    console.log('[Control] Cleaning up preview renderer');

    // Stop video renderer
    if (unifiedPreviewRenderer && unifiedPreviewRenderer.release) {
        unifiedPreviewRenderer.release();
        unifiedPreviewRenderer = null;
    }

    // Stop built-in renderer
    if (unifiedPreviewRenderer && unifiedPreviewRenderer.stop) {
        unifiedPreviewRenderer.stop();
        unifiedPreviewRenderer = null;
    }

    // Stop Three.js renderer
    if (unifiedThreeJSRenderer && unifiedThreeJSRenderer.stop) {
        unifiedThreeJSRenderer.stop();
        unifiedThreeJSRenderer = null;
    }

    // Stop Milkdrop visualizer
    if (unifiedMilkdropVisualizer) {
        window.milkdropPreviewAnimating = false;
        unifiedMilkdropVisualizer = null;
    }

    // Stop media rendering
    if (window.mediaPreviewAnimating) {
        window.mediaPreviewAnimating = false;
    }

    // Stop stream rendering
    if (window.streamPreviewAnimating) {
        window.streamPreviewAnimating = false;
    }

    // Clean up stream resources
    if (streamHls) {
        console.log('[Control] Destroying HLS instance');
        streamHls.destroy();
        streamHls = null;
    }
    if (streamVideoElement) {
        console.log('[Control] Cleaning up stream video element');
        streamVideoElement.pause();
        streamVideoElement.src = '';
        streamVideoElement = null;
    }

    unifiedSceneManager = null;
}

// INIT BLACK PREVIEW
function initBlackPreview() {
    console.log('[Control] Initializing black screen preview...');

    // CRITICAL: Replace canvas to ensure fresh 2D context and clear any WebGL content
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = 640;
    newCanvas.height = 360;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for black screen mode');

    // Clear canvas to black
    const ctx = unifiedCanvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
    }

    // Update staged name
    document.getElementById('staged-name').textContent = 'Black Screen';
    console.log('[Control] ✓ Black screen preview loaded');
}

// INIT BUILT-IN PREVIEW
function initBuiltinPreview() {
    console.log('[Control] Initializing built-in preview...');

    // Replace canvas if it was used for 2D rendering (from video mode)
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.width; // Use canvas resolution, not CSS size
    newCanvas.height = oldCanvas.height;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for built-in mode');

    // Create renderer if not exists or mode changed
    if (!unifiedPreviewRenderer || unifiedPreviewRenderer.mode !== currentRendererMode) {
        if (unifiedPreviewRenderer) {
            unifiedPreviewRenderer.stop();
        }
        unifiedPreviewRenderer = new VisualRenderer('unified-preview-canvas');
        unifiedPreviewRenderer.initialize(currentRendererMode);
        unifiedSceneManager = new SceneManager(unifiedPreviewRenderer);
        console.log('[Control] ✓ Built-in renderer initialized with mode:', currentRendererMode);
    }

    // Load current staged scene
    unifiedSceneManager.switchScene(stagedBuiltinScene);
    unifiedPreviewRenderer.start();

    // Update staged name
    const sceneNames = ['1 - Tunnel', '2 - Particles', '3 - Kaleidoscope', '4 - Waveform'];
    document.getElementById('staged-name').textContent = sceneNames[stagedBuiltinScene];
}

// INIT THREE.JS PREVIEW
async function initThreeJSPreview() {
    console.log('[Control] Initializing Three.js preview...');

    if (typeof THREE === 'undefined') {
        console.error('[Control] THREE.js library not loaded');
        document.getElementById('staged-name').textContent = 'THREE.js not loaded';
        return;
    }

    console.log('[Control] THREE.js ready');

    // Replace canvas to ensure fresh WebGL context
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.width; // Use canvas resolution, not CSS size
    newCanvas.height = oldCanvas.height;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for Three.js mode');

    // Create Three.js renderer if not exists
    if (!unifiedThreeJSRenderer) {
        try {
            unifiedThreeJSRenderer = new ThreeJSRenderer(unifiedCanvas);
            await unifiedThreeJSRenderer.initialize();
            console.log('[Control] ✓ Three.js renderer created');

            // Load current staged preset on-demand
            const presetKey = threejsPresetList[stagedThreeJSIndex];
            const loaded = await loadThreeJSPreset(presetKey, true);

            if (loaded) {
                unifiedThreeJSRenderer.loadPreset(presetKey);
                unifiedThreeJSRenderer.start();

                // Update staged name
                const presetNames = ['Geometric Shapes', 'Particles Field', 'Tunnel Infinity', 'GB Logo'];
                document.getElementById('staged-name').textContent = presetNames[stagedThreeJSIndex];

                console.log('[Control] ✓ Three.js preview initialized with fresh preset:', presetKey);
            }
        } catch (error) {
            console.error('[Control] Failed to initialize Three.js renderer:', error);
            document.getElementById('staged-name').textContent = 'Error loading Three.js';
        }
    } else {
        // Renderer exists, load preset on-demand
        const presetKey = threejsPresetList[stagedThreeJSIndex];
        const loaded = await loadThreeJSPreset(presetKey, true);

        if (loaded) {
            unifiedThreeJSRenderer.loadPreset(presetKey);
            if (!unifiedThreeJSRenderer.isAnimating) {
                unifiedThreeJSRenderer.start();
            }

            // Update staged name
            const presetNames = ['Geometric Shapes', 'Particles Field', 'Tunnel Infinity', 'GB Logo'];
            document.getElementById('staged-name').textContent = presetNames[stagedThreeJSIndex];

            console.log('[Control] ✓ Three.js preview loaded fresh preset:', presetKey);
        }
    }
}

// INIT MILKDROP PREVIEW
function initMilkdropPreview() {
    console.log('[Control] Initializing Milkdrop preview...');

    if (typeof butterchurn === 'undefined' || typeof butterchurnPresets === 'undefined') {
        console.error('[Control] Butterchurn library not loaded');
        document.getElementById('staged-name').textContent = 'Butterchurn not loaded';
        return;
    }

    // Load preset list directly from butterchurnPresets (control.html is in charge)
    if (milkdropPresetList.length === 0) {
        console.log('[Control] Loading Milkdrop presets directly from butterchurnPresets...');
        const allPresets = butterchurnPresets.getPresets();
        milkdropPresetList = Object.keys(allPresets);
        console.log('[Control] ✓ Loaded', milkdropPresetList.length, 'Milkdrop presets');

        // Update preset list UI
        displayPresets(milkdropPresetList);
    }

    // Replace canvas to ensure fresh WebGL context
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.width; // Use canvas resolution, not CSS size
    newCanvas.height = oldCanvas.height;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for Milkdrop mode');

    const displayWidth = unifiedCanvas.width;
    const displayHeight = unifiedCanvas.height;
    console.log('[Control] Milkdrop canvas size:', displayWidth, 'x', displayHeight);

    if (!unifiedMilkdropVisualizer) {
        // Create AudioContext if needed
        if (!unifiedAudioContext) {
            unifiedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const butterchurnAPI = butterchurn.createVisualizer ? butterchurn : (butterchurn.default || butterchurn);
        if (!butterchurnAPI.createVisualizer) {
            console.error('[Control] Butterchurn API not available');
            return;
        }

        // Create visualizer with actual canvas size
        unifiedMilkdropVisualizer = butterchurnAPI.createVisualizer(unifiedAudioContext, unifiedCanvas, {
            width: displayWidth,
            height: displayHeight,
            pixelRatio: window.devicePixelRatio || 1,
            meshWidth: 32,
            meshHeight: 24
        });
        console.log('[Control] ✓ Milkdrop visualizer created at', displayWidth, 'x', displayHeight);
    }

    // Load first preset automatically
    if (milkdropPresetList.length > 0) {
        console.log('[Control] Auto-loading first preset...');
        const allPresets = butterchurnPresets.getPresets();
        const presetKey = milkdropPresetList[0]; // Always load first preset
        const preset = allPresets[presetKey];

        if (preset && unifiedMilkdropVisualizer) {
            stagedMilkdropIndex = 0; // Set to first preset
            unifiedMilkdropVisualizer.loadPreset(preset, 2.7); // 2.7 second blend time
            document.getElementById('staged-name').textContent = presetKey;
            console.log('[Control] ✓ Auto-loaded first preset:', presetKey);
        } else {
            console.error('[Control] Failed to load first preset - preset or visualizer not ready');
        }
    } else {
        console.warn('[Control] No presets available to load');
        document.getElementById('staged-name').textContent = 'No presets available';
    }

    // Start render loop
    if (!window.milkdropPreviewAnimating) {
        window.milkdropPreviewAnimating = true;
        function animateMilkdropPreview() {
            if (unifiedMilkdropVisualizer && window.milkdropPreviewAnimating) {
                try {
                    unifiedMilkdropVisualizer.render();
                    requestAnimationFrame(animateMilkdropPreview);
                } catch (err) {
                    console.error('[Control] Milkdrop render error:', err);
                    window.milkdropPreviewAnimating = false;
                }
            }
        }
        animateMilkdropPreview();
    }
}

// INIT VIDEO PREVIEW
async function initVideoPreview() {
    console.log('[Control] Initializing video preview...');
    console.log('[Control] Staged device ID:', stagedVideoDeviceId);

    // CRITICAL: Get a fresh canvas element by replacing it
    // This is needed because we can't mix WebGL and 2D contexts
    const container = document.getElementById('unified-preview-container').querySelector('div');
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.clientWidth;
    newCanvas.height = oldCanvas.clientHeight;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    // Replace old canvas with new one
    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas replaced for video mode');

    // If there's a staged camera, load it
    if (stagedVideoDeviceId) {
        try {
            console.log('[Control] Creating VideoRenderer for canvas:', unifiedCanvas.id);
            // Create fresh video renderer
            unifiedPreviewRenderer = new VideoRenderer(unifiedCanvas);
            console.log('[Control] VideoRenderer created, initializing with device:', stagedVideoDeviceId);

            const success = await unifiedPreviewRenderer.initialize(stagedVideoDeviceId);
            console.log('[Control] VideoRenderer initialize result:', success);

            if (success) {
                console.log('[Control] Starting video renderer...');
                unifiedPreviewRenderer.start();
                console.log('[Control] ✓ Video preview started');

                // Get device name for display
                const devices = await navigator.mediaDevices.enumerateDevices();
                const device = devices.find(d => d.deviceId === stagedVideoDeviceId);
                const deviceName = device ? device.label : stagedVideoDeviceId.substring(0, 20) + '...';
                document.getElementById('staged-name').textContent = 'Camera: ' + deviceName;
            } else {
                console.error('[Control] ✗ Failed to initialize video preview');
                document.getElementById('staged-name').textContent = 'Failed to load camera';

                // Show error message on canvas
                const ctx = unifiedCanvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
                    ctx.fillStyle = '#ff0000';
                    ctx.font = '14px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Camera failed to load', unifiedCanvas.width / 2, unifiedCanvas.height / 2 - 10);
                    ctx.fillStyle = '#888';
                    ctx.font = '12px sans-serif';
                    ctx.fillText('Check permissions or try another camera', unifiedCanvas.width / 2, unifiedCanvas.height / 2 + 10);
                }
            }
        } catch (error) {
            console.error('[Control] Exception initializing video preview:', error);
            console.error('[Control] Error stack:', error.stack);
            document.getElementById('staged-name').textContent = 'Error: ' + error.message;
        }
    } else {
        // Clear canvas and show message
        console.log('[Control] No camera selected, showing placeholder');
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select a camera below', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
        }
        document.getElementById('staged-name').textContent = 'No camera selected';
    }
}

// INIT MEDIA PREVIEW
function initMediaPreview() {
    console.log('[Control] Initializing media preview...');

    // Replace canvas to ensure fresh 2D context
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.clientWidth;
    newCanvas.height = oldCanvas.clientHeight;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for media mode');

    if (stagedMediaFile) {
        // Render the staged media file
        renderMediaPreview();
    } else {
        // Show placeholder
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select a media file below', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
        }
        document.getElementById('staged-name').textContent = 'No media selected';
    }
}

// Calculate dimensions based on fit mode
function calculateFitDimensions(mediaWidth, mediaHeight, canvasWidth, canvasHeight, fitMode) {
    const mediaAspect = mediaWidth / mediaHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    let drawWidth, drawHeight, drawX, drawY;

    switch (fitMode) {
        case 'cover':
            // Fill canvas, may crop
            if (canvasAspect > mediaAspect) {
                drawWidth = canvasWidth;
                drawHeight = drawWidth / mediaAspect;
                drawX = 0;
                drawY = (canvasHeight - drawHeight) / 2;
            } else {
                drawHeight = canvasHeight;
                drawWidth = drawHeight * mediaAspect;
                drawX = (canvasWidth - drawWidth) / 2;
                drawY = 0;
            }
            break;

        case 'contain':
            // Fit all, may letterbox
            if (canvasAspect > mediaAspect) {
                drawHeight = canvasHeight;
                drawWidth = drawHeight * mediaAspect;
                drawX = (canvasWidth - drawWidth) / 2;
                drawY = 0;
            } else {
                drawWidth = canvasWidth;
                drawHeight = drawWidth / mediaAspect;
                drawX = 0;
                drawY = (canvasHeight - drawHeight) / 2;
            }
            break;

        case 'fill':
            // Stretch to fill
            drawWidth = canvasWidth;
            drawHeight = canvasHeight;
            drawX = 0;
            drawY = 0;
            break;

        default:
            // Default to cover
            return calculateFitDimensions(mediaWidth, mediaHeight, canvasWidth, canvasHeight, 'cover');
    }

    return { drawWidth, drawHeight, drawX, drawY };
}

// RENDER MEDIA PREVIEW
function renderMediaPreview() {
    if (!stagedMediaFile || !stagedMediaURL) return;

    const ctx = unifiedCanvas.getContext('2d');
    if (!ctx) {
        console.error('[Control] Failed to get 2D context for media preview');
        return;
    }

    // Create IMG or VIDEO element based on type
    if (stagedMediaType === 'image') {
        if (!mediaElement || mediaElement.tagName !== 'IMG') {
            mediaElement = document.createElement('img');
        }

        mediaElement.onload = () => {
            console.log('[Control] Image loaded:', stagedMediaFile.name);
            document.getElementById('staged-name').textContent = 'Image: ' + stagedMediaFile.name;

            // Start animation loop for image (needed for fit mode changes)
            if (!window.mediaPreviewAnimating) {
                window.mediaPreviewAnimating = true;
                function renderImageFrame() {
                    if (!window.mediaPreviewAnimating) return;

                    if (mediaElement && mediaElement.tagName === 'IMG' && mediaElement.complete) {
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);

                        const { drawWidth, drawHeight, drawX, drawY } = calculateFitDimensions(
                            mediaElement.width,
                            mediaElement.height,
                            unifiedCanvas.width,
                            unifiedCanvas.height,
                            mediaFitMode
                        );

                        ctx.drawImage(mediaElement, drawX, drawY, drawWidth, drawHeight);
                    }

                    requestAnimationFrame(renderImageFrame);
                }
                renderImageFrame();
            }
        };

        mediaElement.onerror = () => {
            console.error('[Control] Failed to load image');
            document.getElementById('staged-name').textContent = 'Error loading image';
        };

        mediaElement.src = stagedMediaURL;

    } else if (stagedMediaType === 'video') {
        if (!mediaElement || mediaElement.tagName !== 'VIDEO') {
            mediaElement = document.createElement('video');
            mediaElement.muted = true; // ALWAYS muted - preview is visual only
            mediaElement.loop = document.getElementById('media-loop').checked;
        }

        mediaElement.onloadedmetadata = () => {
            console.log('[Control] Video loaded:', stagedMediaFile.name, 'Duration:', mediaElement.duration);
            document.getElementById('staged-name').textContent = 'Video: ' + stagedMediaFile.name;

            mediaElement.play().catch(err => {
                console.warn('[Control] Video autoplay failed:', err);
            });

            // Start render loop for video
            if (!window.mediaPreviewAnimating) {
                window.mediaPreviewAnimating = true;
                function renderVideoFrame() {
                    if (!window.mediaPreviewAnimating) return;

                    if (mediaElement && mediaElement.readyState >= 2) {
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);

                        const { drawWidth, drawHeight, drawX, drawY } = calculateFitDimensions(
                            mediaElement.videoWidth,
                            mediaElement.videoHeight,
                            unifiedCanvas.width,
                            unifiedCanvas.height,
                            mediaFitMode
                        );

                        ctx.drawImage(mediaElement, drawX, drawY, drawWidth, drawHeight);
                    }

                    requestAnimationFrame(renderVideoFrame);
                }
                renderVideoFrame();
            }
        };

        mediaElement.onerror = () => {
            console.error('[Control] Failed to load video');
            document.getElementById('staged-name').textContent = 'Error loading video';
        };

        mediaElement.src = stagedMediaURL;
    }
}

// GO TO PROGRAM - Media mode
function goToProgramMedia() {
    console.log('[Control] GO TO PROGRAM: Media file');

    if (!stagedMediaFile || !stagedMediaURL) {
        console.warn('[Control] No media file selected');
        return;
    }

    // Send media file data to main app
    // Note: We can't send File objects via BroadcastChannel, so we send the Object URL
    sendCommand('switchMode', 'media');
    setTimeout(() => {
        sendCommand('mediaLoad', {
            url: stagedMediaURL,
            type: stagedMediaType,
            name: stagedMediaFile.name,
            loop: document.getElementById('media-loop').checked,
            fitMode: mediaFitMode
        });
    }, 100);
}

// CLEAR MEDIA FILE
function clearMediaFile() {
    console.log('[Control] Clearing media file...');

    // Revoke object URL to free memory
    if (stagedMediaURL) {
        URL.revokeObjectURL(stagedMediaURL);
        stagedMediaURL = null;
    }

    // Clear media element
    if (mediaElement) {
        if (mediaElement.tagName === 'VIDEO') {
            mediaElement.pause();
        }
        mediaElement.src = '';
        mediaElement = null;
    }

    stagedMediaFile = null;
    stagedMediaType = null;

    // Update UI
    const fileInput = document.getElementById('media-file-input');
    if (fileInput) {
        fileInput.value = '';
    }

    document.getElementById('media-file-info').style.display = 'none';
    document.getElementById('staged-name').textContent = 'No media selected';

    // Stop animation loop
    window.mediaPreviewAnimating = false;

    // If currently in media preview mode, show placeholder
    if (currentPreviewMode === 'media') {
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select a media file below', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
        }
    }

    console.log('[Control] ✓ Media file cleared');
}

// INIT STREAM PREVIEW
let stagedStreamURL = '';
let stagedStreamType = 'auto';
let stagedStreamFitMode = 'cover';
let streamVideoElement = null;
let streamHls = null;

function initStreamPreview() {
    console.log('[Control] Initializing stream preview...');

    // Replace canvas to ensure fresh 2D context
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.clientWidth;
    newCanvas.height = oldCanvas.clientHeight;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for stream mode');

    if (stagedStreamURL) {
        // Render the staged stream
        renderStreamPreview();
    } else {
        // Show placeholder
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Enter stream URL and click Load Stream', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
        }
        document.getElementById('staged-name').textContent = 'No stream loaded';
    }
}

// LOAD STREAM TO PREVIEW
async function loadStreamPreview() {
    const url = document.getElementById('stream-url').value.trim();
    if (!url) {
        alert('Please enter a stream URL');
        return;
    }

    stagedStreamURL = url;
    stagedStreamType = document.getElementById('stream-type').value;
    stagedStreamFitMode = document.getElementById('stream-fit-mode').value;

    console.log('[Control] Loading stream:', url, 'Type:', stagedStreamType);

    // If currently in stream preview mode, load it
    if (currentPreviewMode === 'stream') {
        await renderStreamPreview();
    } else {
        console.log('[Control] Stream staged - switch to Stream tab to preview');
    }
}

// RENDER STREAM PREVIEW
async function renderStreamPreview() {
    if (!stagedStreamURL) return;

    const ctx = unifiedCanvas.getContext('2d');
    if (!ctx) {
        console.error('[Control] Failed to get 2D context for stream preview');
        return;
    }

    // Clean up old stream
    if (streamHls) {
        streamHls.destroy();
        streamHls = null;
    }
    if (streamVideoElement) {
        streamVideoElement.pause();
        streamVideoElement.src = '';
        streamVideoElement = null;
    }

    // Create video element
    streamVideoElement = document.createElement('video');
    streamVideoElement.muted = true;
    streamVideoElement.playsInline = true;
    streamVideoElement.autoplay = true;

    // Detect stream type if auto
    let type = stagedStreamType;
    if (type === 'auto') {
        if (stagedStreamURL.includes('.m3u8')) {
            type = 'hls';
        } else if (stagedStreamURL.startsWith('webrtc://') || stagedStreamURL.startsWith('rtc://')) {
            type = 'webrtc';
        } else {
            type = 'direct';
        }
    }

    try {
        if (type === 'hls') {
            // Load HLS stream
            if (typeof Hls === 'undefined') {
                throw new Error('HLS.js library not loaded');
            }

            if (Hls.isSupported()) {
                streamHls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });

                streamHls.loadSource(stagedStreamURL);
                streamHls.attachMedia(streamVideoElement);

                streamHls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('[Control] HLS manifest parsed');
                    streamVideoElement.play().catch(err => {
                        console.warn('[Control] Video autoplay failed:', err);
                    });
                    startStreamRender();
                });

                streamHls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('[Control] HLS fatal error:', data);
                        showStreamError('HLS error: ' + data.type);
                    }
                });
            } else if (streamVideoElement.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                streamVideoElement.src = stagedStreamURL;
                await streamVideoElement.play();
                startStreamRender();
            } else {
                throw new Error('HLS is not supported in this browser');
            }
        } else if (type === 'webrtc') {
            throw new Error('WebRTC streaming not yet implemented. Use HLS or direct stream.');
        } else {
            // Direct video stream
            streamVideoElement.src = stagedStreamURL;
            await streamVideoElement.play();
            startStreamRender();
        }

        document.getElementById('staged-name').textContent = 'Stream: ' + stagedStreamURL.substring(0, 50) + '...';
        console.log('[Control] ✓ Stream loaded to preview');

    } catch (error) {
        console.error('[Control] Failed to load stream:', error);
        showStreamError(error.message);
    }
}

// START STREAM RENDER LOOP
function startStreamRender() {
    if (window.streamPreviewAnimating) return;

    window.streamPreviewAnimating = true;
    function renderFrame() {
        if (!window.streamPreviewAnimating) return;

        if (streamVideoElement && streamVideoElement.readyState >= 2) {
            const ctx = unifiedCanvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);

            const { drawWidth, drawHeight, drawX, drawY } = calculateFitDimensions(
                streamVideoElement.videoWidth,
                streamVideoElement.videoHeight,
                unifiedCanvas.width,
                unifiedCanvas.height,
                stagedStreamFitMode
            );

            ctx.drawImage(streamVideoElement, drawX, drawY, drawWidth, drawHeight);
        }

        requestAnimationFrame(renderFrame);
    }
    renderFrame();
}

// SHOW STREAM ERROR
function showStreamError(message) {
    const ctx = unifiedCanvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
        ctx.fillStyle = '#ff0000';
        ctx.font = '14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Stream failed to load', unifiedCanvas.width / 2, unifiedCanvas.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '12px sans-serif';
        ctx.fillText(message, unifiedCanvas.width / 2, unifiedCanvas.height / 2);
    }
    document.getElementById('staged-name').textContent = 'Error: ' + message;
}

// RELEASE STREAM
function releaseStream() {
    console.log('[Control] Releasing stream...');

    // Stop animation
    window.streamPreviewAnimating = false;

    // Clean up HLS
    if (streamHls) {
        streamHls.destroy();
        streamHls = null;
    }

    // Clean up video element
    if (streamVideoElement) {
        streamVideoElement.pause();
        streamVideoElement.src = '';
        streamVideoElement = null;
    }

    // Clear staged URL
    stagedStreamURL = '';
    document.getElementById('stream-url').value = '';

    // Clear canvas
    const ctx = unifiedCanvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Stream released', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
    }
    document.getElementById('staged-name').textContent = 'No stream loaded';

    console.log('[Control] ✓ Stream released and cleaned up');
}

// GO TO PROGRAM - Stream mode
function goToProgramStream() {
    console.log('[Control] GO TO PROGRAM: Stream');

    // Read stream URL directly from input field (no preview required)
    const streamURL = document.getElementById('stream-url').value.trim();
    if (!streamURL) {
        console.warn('[Control] No stream URL entered');
        alert('Please enter a stream URL first');
        return;
    }

    // Use staged values if available, otherwise use defaults
    const streamType = stagedStreamType || document.getElementById('stream-type').value;
    const fitMode = stagedStreamFitMode || document.getElementById('stream-fit').value;

    console.log('[Control] Sending stream to program:', streamURL, 'Type:', streamType, 'Fit:', fitMode);

    // Send stream data to main app
    sendCommand('streamLoad', {
        url: streamURL,
        streamType: streamType,
        fitMode: fitMode
    });
}

// INIT WEBPAGE PREVIEW
let stagedWebpageURL = '';

function initWebpagePreview() {
    console.log('[Control] Initializing webpage preview...');

    // Replace canvas to ensure fresh 2D context
    const oldCanvas = document.getElementById('unified-preview-canvas');
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'unified-preview-canvas';
    newCanvas.width = oldCanvas.clientWidth;
    newCanvas.height = oldCanvas.clientHeight;
    newCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';

    oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
    unifiedCanvas = newCanvas;
    console.log('[Control] Canvas refreshed for webpage mode');

    if (stagedWebpageURL) {
        // Show message that webpage is staged
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Webpage: ' + stagedWebpageURL, unifiedCanvas.width / 2, unifiedCanvas.height / 2);
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText('(Preview not available for iframes)', unifiedCanvas.width / 2, unifiedCanvas.height / 2 + 20);
        }
        document.getElementById('staged-name').textContent = 'Webpage: ' + stagedWebpageURL.substring(0, 50) + '...';
    } else {
        // Show placeholder
        const ctx = unifiedCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Enter webpage URL and click Load Webpage', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
            ctx.fillText('(Preview not available - will load in program)', unifiedCanvas.width / 2, unifiedCanvas.height / 2 + 20);
        }
        document.getElementById('staged-name').textContent = 'No webpage loaded';
    }
}

// LOAD WEBPAGE PRESET
function loadWebpagePreset(url) {
    document.getElementById('webpage-url').value = url;
    loadWebpagePreview();
}

// LOAD WEBPAGE TO PREVIEW
function loadWebpagePreview() {
    const url = document.getElementById('webpage-url').value.trim();
    if (!url) {
        alert('Please enter a webpage URL');
        return;
    }

    stagedWebpageURL = url;
    console.log('[Control] Webpage staged:', url);

    // Show staged message
    const ctx = unifiedCanvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
        ctx.fillStyle = '#0066FF';
        ctx.font = '14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✓ Webpage Staged', unifiedCanvas.width / 2, unifiedCanvas.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText(url, unifiedCanvas.width / 2, unifiedCanvas.height / 2);
        ctx.fillText('Click "GO TO PROGRAM" to display', unifiedCanvas.width / 2, unifiedCanvas.height / 2 + 20);
    }
    document.getElementById('staged-name').textContent = 'Webpage: ' + url.substring(0, 50) + '...';
}

// GO TO PROGRAM - Webpage mode
function goToProgramWebpage() {
    console.log('[Control] GO TO PROGRAM: Webpage');

    // Read webpage URL directly from input field (no preview required)
    const webpageURL = document.getElementById('webpage-url').value.trim();
    if (!webpageURL) {
        console.warn('[Control] No webpage URL entered');
        alert('Please enter a webpage URL first');
        return;
    }

    console.log('[Control] Sending webpage to program:', webpageURL);

    // Send webpage data to main app
    sendCommand('webpageLoad', {
        url: webpageURL
    });
}

// MILKDROP NAVIGATION
function stageMilkdropNav(direction) {
    if (direction === 'next') {
        stagedMilkdropIndex = (stagedMilkdropIndex + 1) % milkdropPresetList.length;
    } else {
        stagedMilkdropIndex--;
        if (stagedMilkdropIndex < 0) stagedMilkdropIndex = milkdropPresetList.length - 1;
    }

    // Reload preview with new preset
    if (currentPreviewMode === 'milkdrop' && unifiedMilkdropVisualizer) {
        const allPresets = butterchurnPresets.getPresets();
        const presetKey = milkdropPresetList[stagedMilkdropIndex];
        const preset = allPresets[presetKey];

        if (preset) {
            unifiedMilkdropVisualizer.loadPreset(preset, 0);
            document.getElementById('staged-name').textContent = presetKey;
            console.log('[Control] ✓ Loaded preset:', presetKey);
        }
    }
}

// THREE.JS NAVIGATION
function stageThreeJSNav(direction) {
    if (direction === 'next') {
        stagedThreeJSIndex = (stagedThreeJSIndex + 1) % threejsPresetList.length;
    } else {
        stagedThreeJSIndex--;
        if (stagedThreeJSIndex < 0) stagedThreeJSIndex = threejsPresetList.length - 1;
    }

    // Update preview if in threejs mode
    previewThreeJSPreset(stagedThreeJSIndex);
}

// THREE.JS PRESET PREVIEW
async function previewThreeJSPreset(index) {
    stagedThreeJSIndex = index;

    // Update button visual states
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`threejs-preset-${i}`);
        if (btn) {
            if (i === index) {
                btn.style.background = '#0066FF';
                btn.style.borderColor = '#0088FF';
            } else {
                btn.style.background = '#2a2a2a';
                btn.style.borderColor = '#3a3a3a';
            }
        }
    }

    // Update staged name
    const presetNames = ['Geometric Shapes', 'Particles Field', 'Tunnel Infinity', 'GB Logo'];
    document.getElementById('staged-name').textContent = presetNames[index];

    // If currently in threejs preview mode, load the preset on-demand
    if (currentPreviewMode === 'threejs' && unifiedThreeJSRenderer) {
        const presetKey = threejsPresetList[index];
        // Load fresh preset from disk
        const loaded = await loadThreeJSPreset(presetKey, true);
        if (loaded) {
            unifiedThreeJSRenderer.loadPreset(presetKey);
            console.log('[Control] ✓ Loaded fresh Three.js preset:', presetKey);
        }
    } else {
        console.log('[Control] Staged Three.js preset:', threejsPresetList[index]);
    }
}

// BUILT-IN SCENE PREVIEW
function previewBuiltinScene(sceneIndex) {
    stagedBuiltinScene = sceneIndex;

    // Update button visual states
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`scene-${i}`);
        if (btn) {
            if (i === sceneIndex) {
                btn.style.background = '#0066FF';
                btn.style.borderColor = '#0088FF';
            } else {
                btn.style.background = '#2a2a2a';
                btn.style.borderColor = '#3a3a3a';
            }
        }
    }

    // If currently in builtin preview mode, update the preview immediately
    if (currentPreviewMode === 'builtin') {
        // Reinitialize if renderer mode changed
        const needsReinit = unifiedPreviewRenderer && unifiedPreviewRenderer.mode !== currentRendererMode;
        if (needsReinit) {
            console.log('[Control] Renderer mode changed, reinitializing...');
            unifiedPreviewRenderer.stop();
            unifiedPreviewRenderer = new VisualRenderer('unified-preview-canvas');
            unifiedPreviewRenderer.initialize(currentRendererMode);
            unifiedSceneManager = new SceneManager(unifiedPreviewRenderer);
        }

        // Switch scene and update display
        if (unifiedSceneManager) {
            unifiedSceneManager.switchScene(sceneIndex);
            const sceneNames = ['1 - Tunnel', '2 - Particles', '3 - Kaleidoscope', '4 - Waveform'];
            document.getElementById('staged-name').textContent = sceneNames[sceneIndex];

            // CRITICAL: Make sure renderer is running after scene switch
            if (!unifiedPreviewRenderer.isRunning) {
                unifiedPreviewRenderer.start();
            }

            console.log('[Control] ✓ Previewing scene:', sceneNames[sceneIndex]);
        }
    } else {
        // Just update the staged value, will load when user switches to builtin tab
        const sceneNames = ['1 - Tunnel', '2 - Particles', '3 - Kaleidoscope', '4 - Waveform'];
        console.log('[Control] Staged scene:', sceneNames[sceneIndex]);
    }
}

// OLD MILKDROP PREVIEW FUNCTION - REPLACED BY UNIFIED SYSTEM
function previewMilkdropPreset(index) {
    try {
        if (!milkdropPresetList || milkdropPresetList.length === 0) {
            console.warn('[Control] No milkdrop preset list available');
            return;
        }

        // Check if butterchurn is loaded
        if (typeof butterchurn === 'undefined' || typeof butterchurnPresets === 'undefined') {
            console.error('[Control] Butterchurn library not loaded - skipping preview');
            return;
        }

        stagedMilkdropIndex = index;

        // Initialize Milkdrop if not exists
        if (!milkdropPreviewVisualizer) {
            console.log('[Control] Creating Milkdrop preview visualizer...');
            const canvas = document.getElementById('milkdrop-preview-canvas');
            canvas.width = 640;
            canvas.height = 360;

            // Create AudioContext for butterchurn
            milkdropPreviewAudioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Try both API variations (butterchurn vs butterchurn.default)
            const butterchurnAPI = butterchurn.createVisualizer ? butterchurn : (butterchurn.default || butterchurn);

            if (!butterchurnAPI.createVisualizer) {
                console.error('[Control] Butterchurn API not available - createVisualizer not found');
                console.log('[Control] Available butterchurn properties:', Object.keys(butterchurn));
                return;
            }

            // Create butterchurn instance
            milkdropPreviewVisualizer = butterchurnAPI.createVisualizer(milkdropPreviewAudioContext, canvas, {
                width: 640,
                height: 360,
                pixelRatio: 1,
                meshWidth: 32,
                meshHeight: 24
            });

            console.log('[Control] ✓ Milkdrop preview visualizer created');
        }

        // Show preview container
        document.getElementById('milkdrop-preview-container').style.display = 'block';

        // Load preset
        const allPresets = butterchurnPresets.getPresets();
        const presetKey = milkdropPresetList[index];
        const preset = allPresets[presetKey];

        if (!preset) {
            console.error('[Control] Preset not found:', presetKey);
            return;
        }

        milkdropPreviewVisualizer.loadPreset(preset, 0); // 0 = no blend transition
        console.log('[Control] ✓ Previewing Milkdrop preset:', presetKey);

        // Start render loop if not already running
        if (!window.milkdropPreviewAnimating) {
            window.milkdropPreviewAnimating = true;
            function animateMilkdropPreview() {
                if (milkdropPreviewVisualizer) {
                    try {
                        milkdropPreviewVisualizer.render();
                        requestAnimationFrame(animateMilkdropPreview);
                    } catch (err) {
                        console.error('[Control] Milkdrop render error:', err);
                        window.milkdropPreviewAnimating = false;
                    }
                }
            }
            animateMilkdropPreview();
        }
    } catch (error) {
        console.error('[Control] Failed to preview Milkdrop preset:', error);
        console.error('[Control] Error stack:', error.stack);
        // Don't show alert - just log error to avoid blocking UI
    }
}

// MIDI for optional external control
let midiAccess = null;
let midiOutput = null;

// Send command to main tab via BroadcastChannel
function sendCommand(command, data) {
    const message = { command, data };
    controlChannel.postMessage(message);
    console.log('[Control] Sent:', message);
}

// Receive state updates from main tab
controlChannel.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'stateUpdate':
            updateState(data);
            break;
        case 'presetList':
            // Ignore - control.html loads presets directly from butterchurnPresets
            // (Similar to how Three.js works)
            break;
    }
};

function updateState(state) {
    // Update connection status
    document.getElementById('connection-status').classList.add('connected');

    // Update BPM and position
    if (state.bpm !== undefined) {
        document.getElementById('current-bpm').textContent = state.bpm;
    }
    // Only update position when SPP is active (position will be undefined when no SPP)
    if (state.position !== undefined) {
        document.getElementById('current-position').textContent = state.position;
    } else if (state.sppActive === false) {
        // Show dash when no SPP data available
        document.getElementById('current-position').textContent = '-';
    }

    // Update audio device selection
    if (state.audioDeviceId !== undefined) {
        const audioSelect = document.getElementById('audio-device-select');
        audioSelect.value = state.audioDeviceId;
    }

    // Update EQ bars
    if (state.frequency !== undefined) {
        const bass = Math.min(100, Math.round((state.frequency.bass || 0) * 100));
        const mid = Math.min(100, Math.round((state.frequency.mid || 0) * 100));
        const high = Math.min(100, Math.round((state.frequency.high || 0) * 100));

        document.getElementById('bass-bar').style.height = `${bass}%`;
        document.getElementById('mid-bar').style.height = `${mid}%`;
        document.getElementById('high-bar').style.height = `${high}%`;
    }

    // Update SPP indicator
    if (state.sppActive === true) {
        const sppIndicator = document.getElementById('spp-indicator');
        sppIndicator.classList.add('spp');
        // Remove after animation completes
        setTimeout(() => {
            sppIndicator.classList.remove('spp');
        }, 300);
    }

    // Update visual audio source - ALWAYS from main app state, NEVER from saved settings
    if (state.visualAudioSource !== undefined) {
        const dropdown = document.getElementById('milkdrop-audio-source');
        dropdown.value = state.visualAudioSource;
        // Removed spam log - broadcasts every 100ms
        // Note: MIDI synth options are now in a separate section, always visible
    }

    // Update MIDI synth settings
    if (state.midiSynthEnabled !== undefined) {
        document.getElementById('midi-synth-enable').checked = state.midiSynthEnabled === 'true';
    }
    if (state.midiSynthChannel !== undefined) {
        document.getElementById('midi-synth-channel').value = state.midiSynthChannel;
    }
    if (state.midiSynthAudible !== undefined) {
        document.getElementById('midi-synth-audible').checked = state.midiSynthAudible === 'true';
    }
    if (state.midiSynthAutoFeed !== undefined) {
        document.getElementById('midi-synth-auto-feed').checked = state.midiSynthAutoFeed === 'true';
    }
    if (state.midiSynthFeedInput !== undefined) {
        document.getElementById('midi-synth-feed-input').checked = state.midiSynthFeedInput === 'true';
    }
    if (state.midiSynthBeatKick !== undefined) {
        document.getElementById('midi-synth-beat-kick').checked = state.midiSynthBeatKick === 'true';
    }

    // Update current mode display and track program mode
    if (state.mode) {
        currentProgramMode = state.mode; // Track current program mode
        const modeNames = { black: 'Black', builtin: 'Built-in', threejs: 'Three.js', milkdrop: 'Milkdrop', video: 'Video', media: 'Media', stream: 'Stream', webpage: 'Webpage' };
        document.getElementById('current-mode-display').textContent = modeNames[state.mode] || state.mode;

        // Show/hide scene display based on mode
        const sceneDisplay = document.getElementById('program-scene-display');
        if (sceneDisplay) {
            if (state.mode === 'builtin' && state.scene !== undefined) {
                currentProgramScene = state.scene; // Track current scene
                const sceneNames = ['1 - Tunnel', '2 - Particles', '3 - Kaleidoscope', '4 - Waveform'];
                const sceneNameElement = document.getElementById('program-scene-name');
                if (sceneNameElement) {
                    sceneNameElement.textContent = sceneNames[state.scene] || state.scene;
                }
                sceneDisplay.style.display = '';
            } else {
                sceneDisplay.style.display = 'none';
            }
        }

        // Update Built-in section program display
        const builtinProgramDisplay = document.getElementById('program-builtin-display');
        if (builtinProgramDisplay) {
            if (state.mode === 'builtin' && state.scene !== undefined) {
                const sceneNames = ['1 - Tunnel', '2 - Particles', '3 - Kaleidoscope', '4 - Waveform'];
                const builtinNameElement = document.getElementById('program-builtin-name');
                if (builtinNameElement) {
                    builtinNameElement.textContent = sceneNames[state.scene];
                }
                builtinProgramDisplay.style.display = '';
            } else {
                builtinProgramDisplay.style.display = 'none';
            }
        }
    }

    // DON'T sync scene buttons from program - they represent what's staged, not what's on program
    // Scene button styling is controlled by previewBuiltinScene() function

    // Update program preset name (what's on main display)
    if (state.presetName && state.mode === 'milkdrop') {
        const programPresetDisplay = document.getElementById('program-preset-display');
        const programPresetName = document.getElementById('program-preset-name');
        if (programPresetDisplay && programPresetName) {
            programPresetName.textContent = state.presetName;
            programPresetDisplay.style.display = '';
        }
    } else {
        const programPresetDisplay = document.getElementById('program-preset-display');
        if (programPresetDisplay) {
            programPresetDisplay.style.display = 'none';
        }
    }

    // Update audio device display (microphone)
    const audioDeviceElement = document.getElementById('current-audio-device');
    if (audioDeviceElement) {
        if (state.audioDeviceId && state.audioDeviceId !== 'none') {
            // Find the device name from the dropdown
            const audioSelect = document.getElementById('audio-device-select');
            const selectedOption = audioSelect.querySelector(`option[value="${state.audioDeviceId}"]`);
            audioDeviceElement.textContent = selectedOption ? selectedOption.textContent : 'Connected';
        } else {
            audioDeviceElement.textContent = 'None';
        }
    }

    // Update reactive input display (what drives visuals)
    const reactiveInputElement = document.getElementById('current-reactive-input');
    if (reactiveInputElement) {
        if (state.visualAudioSource === 'midi') {
            reactiveInputElement.textContent = 'MIDI Synthesizer';
            reactiveInputElement.style.color = '#FF6600'; // Orange for MIDI
        } else {
            reactiveInputElement.textContent = 'Audio Input Device';
            reactiveInputElement.style.color = '#0066FF'; // Blue for audio
        }
    }

    // Update MIDI input device
    if (state.midiInputId !== undefined) {
        const midiSelect = document.getElementById('midi-input-select');
        if (midiSelect && midiSelect.querySelector(`option[value="${state.midiInputId}"]`)) {
            midiSelect.value = state.midiInputId;
        }
    }

    // Update SysEx setting
    if (state.enableSysEx !== undefined) {
        const sysexElement = document.getElementById('sysex-enable');
        if (sysexElement) {
            sysexElement.value = state.enableSysEx;
        }
    }

    // Update program renderer display (what's actually on main display)
    if (state.renderer !== undefined && state.mode === 'builtin') {
        currentProgramRenderer = state.renderer; // Track current program renderer
        const rendererNames = { webgl: 'WebGL', canvas2d: 'Canvas 2D' };
        const rendererNameElement = document.getElementById('program-renderer-name');
        const rendererDisplayElement = document.getElementById('program-renderer-display');
        if (rendererNameElement && rendererDisplayElement) {
            rendererNameElement.textContent = rendererNames[state.renderer] || state.renderer;
            rendererDisplayElement.style.display = '';
        }

        // Only initialize staged renderer dropdown once on first state update
        if (!window.rendererInitialized) {
            currentRendererMode = state.renderer;
            const rendererSelect = document.getElementById('renderer-select');
            if (rendererSelect) {
                rendererSelect.value = state.renderer;
            }
            window.rendererInitialized = true;
        }
    } else {
        const rendererDisplay = document.getElementById('program-renderer-display');
        if (rendererDisplay) {
            rendererDisplay.style.display = 'none';
        }
    }

    // Update OSC server
    if (state.oscServer !== undefined) {
        const oscServerElement = document.getElementById('osc-server');
        if (oscServerElement) {
            oscServerElement.value = state.oscServer;
        }
    }

    // Update video device selection
    if (state.videoDeviceId !== undefined) {
        const videoSelect = document.getElementById('video-device-select');
        if (videoSelect && videoSelect.querySelector(`option[value="${state.videoDeviceId}"]`)) {
            videoSelect.value = state.videoDeviceId;
        }
    }

    // Update video audio reactive toggle
    if (state.videoAudioReactive !== undefined) {
        const videoAudioReactiveElement = document.getElementById('video-audio-reactive');
        if (videoAudioReactiveElement) {
            videoAudioReactiveElement.checked = state.videoAudioReactive === 'true';
        }
    }

    // Update video beat reactive toggle
    if (state.videoBeatReactive !== undefined) {
        const videoBeatReactiveElement = document.getElementById('video-beat-reactive');
        if (videoBeatReactiveElement) {
            videoBeatReactiveElement.checked = state.videoBeatReactive === 'true';
        }
    }

    // Update global audio output toggle (PROGRAM Output section)
    if (state.videoAudioOutput !== undefined) {
        const globalAudioOutputElement = document.getElementById('global-audio-output');
        if (globalAudioOutputElement) {
            globalAudioOutputElement.checked = state.videoAudioOutput === 'true';
        }
    }

    // Update global audio beat-reactive toggle (PROGRAM Output section)
    if (state.audioBeatReactive !== undefined) {
        const globalBeatReactiveElement = document.getElementById('global-audio-beat-reactive');
        if (globalBeatReactiveElement) {
            globalBeatReactiveElement.checked = state.audioBeatReactive === 'true';
        }
    }

    // Update display settings checkboxes
    if (state.showStatusBar !== undefined) {
        const showStatusBarElement = document.getElementById('show-status-bar');
        if (showStatusBarElement) {
            showStatusBarElement.checked = state.showStatusBar === 'true';
        }
    }
    if (state.showControlPanel !== undefined) {
        const showControlPanelElement = document.getElementById('show-control-panel');
        if (showControlPanelElement) {
            showControlPanelElement.checked = state.showControlPanel === 'true';
        }
    }
    if (state.isFullscreen !== undefined) {
        const useFullscreenElement = document.getElementById('use-fullscreen');
        if (useFullscreenElement) {
            useFullscreenElement.checked = state.isFullscreen === 'true';
        }
    }

    // Update preview aspect ratio based on actual program dimensions (for 100% mode)
    if (state.programWidth !== undefined && state.programHeight !== undefined) {
        const resolution = document.getElementById('program-resolution').value;

        // Only update if in 100% mode AND dimensions changed
        if (resolution === '100%' && (state.programWidth !== lastProgramWidth || state.programHeight !== lastProgramHeight)) {
            lastProgramWidth = state.programWidth;
            lastProgramHeight = state.programHeight;
            updatePreviewAspectRatio(resolution, {
                width: state.programWidth,
                height: state.programHeight
            });
        }
    }
}


// Load preset list - control.html is in charge (like Three.js)
async function loadPresets() {
    console.log('[Control] Milkdrop presets will be loaded on-demand when preview is opened');
    // Presets loaded directly from butterchurnPresets in initMilkdropPreview()
}

function displayPresets(presets) {
    if (!presets || presets.length === 0) {
        console.warn('[Control] displayPresets called with empty list');
        return;
    }

    console.log('[Control] Displaying', presets.length, 'presets in UI');

    const list = document.getElementById('preset-list');
    list.innerHTML = '';

    presets.forEach((preset, index) => {
        const item = document.createElement('div');
        item.className = 'preset-item';
        item.textContent = `${index}: ${preset}`;
        item.dataset.index = index;
        item.dataset.preset = preset;
        list.appendChild(item);
    });
}

// Event delegation for preset clicks - LOAD preset into unified preview
document.getElementById('preset-list').addEventListener('click', (e) => {
    const item = e.target.closest('.preset-item');
    if (item) {
        const index = parseInt(item.dataset.index);

        // Update active state
        document.querySelectorAll('.preset-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Update staged index
        stagedMilkdropIndex = index;

        // If currently in milkdrop preview mode, load the preset immediately
        if (currentPreviewMode === 'milkdrop' && unifiedMilkdropVisualizer) {
            const allPresets = butterchurnPresets.getPresets();
            const presetKey = milkdropPresetList[index];
            const preset = allPresets[presetKey];

            if (preset) {
                unifiedMilkdropVisualizer.loadPreset(preset, 0);
                document.getElementById('staged-name').textContent = presetKey;
                console.log('[Control] ✓ Loaded preset:', presetKey);
            }
        } else {
            // Just stage it - will load when user switches to milkdrop tab
            console.log('[Control] Preset staged - switch to Milkdrop tab to preview');
        }
    }
});

// Audio device selection
document.getElementById('audio-device-select').addEventListener('change', (e) => {
    sendCommand('audioDeviceSelect', e.target.value);
});

// Audio sample rate selection
document.getElementById('audio-samplerate-select').addEventListener('change', (e) => {
    sendCommand('audioSampleRate', e.target.value);
});

// Milkdrop audio source selection
document.getElementById('milkdrop-audio-source').addEventListener('change', (e) => {
    const source = e.target.value;
    sendCommand('milkdropAudioSource', source);

    // Note: MIDI synth options are now in a separate section, always visible
});

// MIDI synth enable/disable toggle
document.getElementById('midi-synth-enable').addEventListener('change', (e) => {
    sendCommand('midiSynthEnable', e.target.checked ? 'true' : 'false');
});

// MIDI synth channel
document.getElementById('midi-synth-channel').addEventListener('change', (e) => {
    sendCommand('midiSynthChannel', e.target.value);
});

// MIDI synth audible toggle
document.getElementById('midi-synth-audible').addEventListener('change', (e) => {
    sendCommand('midiSynthAudible', e.target.checked ? 'true' : 'false');
});

// MIDI synth auto-feed audio-frequency notes toggle
document.getElementById('midi-synth-auto-feed').addEventListener('change', (e) => {
    sendCommand('midiSynthAutoFeed', e.target.checked ? 'true' : 'false');
});

// MIDI synth feed MIDI input notes toggle
document.getElementById('midi-synth-feed-input').addEventListener('change', (e) => {
    sendCommand('midiSynthFeedInput', e.target.checked ? 'true' : 'false');
});

// MIDI synth beat kick toggle
document.getElementById('midi-synth-beat-kick').addEventListener('change', (e) => {
    sendCommand('midiSynthBeatKick', e.target.checked ? 'true' : 'false');
});

// MIDI synth input device selection (separate from clock/SPP)
document.getElementById('midi-synth-input-select').addEventListener('change', (e) => {
    sendCommand('midiSynthInputSelect', e.target.value);
});

// MIDI input device selection
document.getElementById('midi-input-select').addEventListener('change', (e) => {
    sendCommand('midiInputSelect', e.target.value);
});

// SysEx enable
document.getElementById('sysex-enable').addEventListener('change', (e) => {
    sendCommand('sysexEnable', e.target.value);
});

// Reactive Output - Audio-frequency notes
const reactiveOutputFrequency = document.getElementById('reactive-output-frequency');
if (reactiveOutputFrequency) {
    reactiveOutputFrequency.addEventListener('change', (e) => {
        sendCommand('reactiveOutputFrequency', e.target.checked ? 'true' : 'false');
    });
}

// Reactive Output - Beat kick notes
const reactiveOutputBeatKick = document.getElementById('reactive-output-beat-kick');
if (reactiveOutputBeatKick) {
    reactiveOutputBeatKick.addEventListener('change', (e) => {
        sendCommand('reactiveOutputBeatKick', e.target.checked ? 'true' : 'false');
    });
}

// MIDI Output device selection
const midiOutputSelect = document.getElementById('midi-output-select');
if (midiOutputSelect) {
    midiOutputSelect.addEventListener('change', (e) => {
        sendCommand('midiOutputSelect', e.target.value);
    });
}

// MIDI Output channel
const midiOutputChannel = document.getElementById('midi-output-channel');
if (midiOutputChannel) {
    midiOutputChannel.addEventListener('change', (e) => {
        sendCommand('midiOutputChannel', e.target.value);
    });
}

// Renderer selection - STAGE ONLY (don't send to program immediately)
document.getElementById('renderer-select').addEventListener('change', (e) => {
    const newMode = e.target.value;
    currentRendererMode = newMode;
    console.log('[Control] Renderer changed to:', newMode);

    // Reinitialize unified preview if builtin mode is active
    if (currentPreviewMode === 'builtin' && unifiedPreviewRenderer) {
        console.log('[Control] Reinitializing preview with new renderer...');
        unifiedPreviewRenderer.stop();
        unifiedPreviewRenderer = new VisualRenderer('unified-preview-canvas');
        unifiedPreviewRenderer.initialize(currentRendererMode);
        unifiedSceneManager = new SceneManager(unifiedPreviewRenderer);
        unifiedSceneManager.switchScene(stagedBuiltinScene);
        unifiedPreviewRenderer.start();
        console.log('[Control] ✓ Preview reinitialized');
    }

    // DON'T send to main app - only send when user clicks GO TO PROGRAM
});

// Program Resolution change
document.getElementById('program-resolution').addEventListener('change', (e) => {
    const resolution = e.target.value;
    console.log('[Control] Resolution changed to:', resolution);

    // Show/hide custom inputs
    const customInputs = document.getElementById('custom-resolution-inputs');
    if (resolution === 'custom') {
        customInputs.style.display = 'block';
        // Load saved custom dimensions
        const savedWidth = localStorage.getItem('customResolutionWidth') || '1920';
        const savedHeight = localStorage.getItem('customResolutionHeight') || '1080';
        document.getElementById('custom-width').value = savedWidth;
        document.getElementById('custom-height').value = savedHeight;
    } else {
        customInputs.style.display = 'none';
    }

    // Save setting
    localStorage.setItem('programResolution', resolution);

    // Update preview aspect ratio
    updatePreviewAspectRatio(resolution);

    // Send to main app
    const dimensions = getResolutionDimensions(resolution);
    sendCommand('programResolution', {
        preset: resolution,
        width: dimensions ? dimensions.width : null,
        height: dimensions ? dimensions.height : null
    });
});

// Display settings - Status Bar
document.getElementById('show-status-bar').addEventListener('change', (e) => {
    sendCommand('toggleStatusBar', e.target.checked ? 'true' : 'false');
});

// Display settings - Control Panel
document.getElementById('show-control-panel').addEventListener('change', (e) => {
    sendCommand('toggleControlPanel', e.target.checked ? 'true' : 'false');
});

// Display settings - Fullscreen (read-only status display)
// Fullscreen can only be triggered by user gesture in main window (use F11)
// Checkbox is disabled and only shows current fullscreen state

// OSC server
document.getElementById('osc-server').addEventListener('change', (e) => {
    sendCommand('oscServer', e.target.value);
});

// Video device selection - show preview first
document.getElementById('video-device-select').addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    stagedVideoDeviceId = deviceId;

    if (!deviceId) {
        console.log('[Control] No camera selected');
        // If currently in video preview mode, clear it
        if (currentPreviewMode === 'video') {
            const ctx = unifiedCanvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select a camera below', unifiedCanvas.width / 2, unifiedCanvas.height / 2);
            document.getElementById('staged-name').textContent = 'No camera selected';

            // Release renderer
            if (unifiedPreviewRenderer) {
                unifiedPreviewRenderer.release();
                unifiedPreviewRenderer = null;
            }
        }
        return;
    }

    console.log('[Control] Camera selected:', deviceId);

    // If currently in video preview mode, reload preview with new camera
    if (currentPreviewMode === 'video') {
        // Release old camera
        if (unifiedPreviewRenderer) {
            console.log('[Control] Releasing previous camera...');
            unifiedPreviewRenderer.release();
            await new Promise(resolve => setTimeout(resolve, 300));
            unifiedPreviewRenderer = null;
        }

        // Load new camera
        await initVideoPreview();
    } else {
        // Just staged - will load when user switches to video tab
        console.log('[Control] Camera staged - switch to Video tab to preview');
    }
});

// Video audio reactive toggle
const videoAudioReactiveCheckbox = document.getElementById('video-audio-reactive');
if (videoAudioReactiveCheckbox) {
    videoAudioReactiveCheckbox.addEventListener('change', (e) => {
        sendCommand('videoAudioReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] video-audio-reactive element not found');
}

// Video beat reactive toggle
const videoBeatReactiveCheckbox = document.getElementById('video-beat-reactive');
if (videoBeatReactiveCheckbox) {
    videoBeatReactiveCheckbox.addEventListener('change', (e) => {
        sendCommand('videoBeatReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] video-beat-reactive element not found');
}

// Video resolution change - save and reload if in preview
const videoResolutionSelect = document.getElementById('video-resolution-select');
if (videoResolutionSelect) {
    videoResolutionSelect.addEventListener('change', async (e) => {
        const resolution = e.target.value;
        sendCommand('videoResolution', resolution);

        // If currently previewing video, reload with new resolution
        if (currentPreviewMode === 'video' && stagedVideoDeviceId) {
            console.log('[Control] Resolution changed to', resolution, '- reloading preview');
            if (unifiedPreviewRenderer) {
                unifiedPreviewRenderer.release();
                await new Promise(resolve => setTimeout(resolve, 300));
                unifiedPreviewRenderer = null;
            }
            await initVideoPreview();
        }
    });
} else {
    console.warn('[Control] video-resolution-select element not found');
}

// Video framerate change - save and reload if in preview
const videoFramerateSelect = document.getElementById('video-framerate-select');
if (videoFramerateSelect) {
    videoFramerateSelect.addEventListener('change', async (e) => {
        const framerate = e.target.value;
        sendCommand('videoFramerate', framerate);

        // If currently previewing video, reload with new framerate
        if (currentPreviewMode === 'video' && stagedVideoDeviceId) {
            console.log('[Control] Framerate changed to', framerate, 'fps - reloading preview');
            if (unifiedPreviewRenderer) {
                unifiedPreviewRenderer.release();
                await new Promise(resolve => setTimeout(resolve, 300));
                unifiedPreviewRenderer = null;
            }
            await initVideoPreview();
        }
    });
} else {
    console.warn('[Control] video-framerate-select element not found');
}

// Drag-and-drop for media files
const dropZone = document.getElementById('media-drop-zone');
const fileInput = document.getElementById('media-file-input');

if (dropZone && fileInput) {
    // Click to browse
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag over
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#0066FF';
        dropZone.style.background = '#0a1a2a';
    });

    // Drag leave
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '#2a2a2a';
        dropZone.style.background = '#0a0a0a';
    });

    // Drop
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#2a2a2a';
        dropZone.style.background = '#0a0a0a';

        const file = e.dataTransfer.files[0];
        if (file) {
            handleMediaFile(file);
        }
    });

    // File input change (from click to browse)
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleMediaFile(file);
        }
    });
} else {
    console.warn('[Control] media-drop-zone or media-file-input element not found');
}

// Unified media file handler
function handleMediaFile(file) {
    console.log('[Control] Media file selected:', file.name, 'Type:', file.type, 'Size:', file.size);

    // Determine media type
    if (file.type.startsWith('image/')) {
        stagedMediaType = 'image';
    } else if (file.type.startsWith('video/')) {
        stagedMediaType = 'video';
    } else {
        alert('Unsupported file type. Please select an image or video file.');
        fileInput.value = '';
        return;
    }

    // Revoke previous object URL if exists
    if (stagedMediaURL) {
        URL.revokeObjectURL(stagedMediaURL);
    }

    // Create object URL for preview
    stagedMediaFile = file;
    stagedMediaURL = URL.createObjectURL(file);

    // Update file info display
    document.getElementById('media-file-name').textContent = file.name;
    document.getElementById('media-file-type').textContent = `Type: ${file.type}`;
    document.getElementById('media-file-size').textContent = `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    document.getElementById('media-file-info').style.display = 'block';

    // If currently in media preview mode, reload preview
    if (currentPreviewMode === 'media') {
        renderMediaPreview();
    } else {
        console.log('[Control] Media file staged - switch to Media tab to preview');
    }
}

// Media fit mode selector
document.getElementById('media-fit-mode').addEventListener('change', (e) => {
    mediaFitMode = e.target.value;
    console.log('[Control] Media fit mode STAGED:', mediaFitMode);

    // DON'T send to program - only stage it for preview
    // It will be sent when user clicks "GO TO PROGRAM"

    // If currently in media preview mode and media is loaded, re-render
    if (currentPreviewMode === 'media' && mediaElement) {
        if (stagedMediaType === 'image') {
            // Re-render image
            const ctx = unifiedCanvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, unifiedCanvas.width, unifiedCanvas.height);

            const { drawWidth, drawHeight, drawX, drawY } = calculateFitDimensions(
                mediaElement.width,
                mediaElement.height,
                unifiedCanvas.width,
                unifiedCanvas.height,
                mediaFitMode
            );

            ctx.drawImage(mediaElement, drawX, drawY, drawWidth, drawHeight);
        }
        // Video will update automatically in render loop
    }
});

// Media loop toggle
document.getElementById('media-loop').addEventListener('change', (e) => {
    if (mediaElement && mediaElement.tagName === 'VIDEO') {
        mediaElement.loop = e.target.checked;
        console.log('[Control] Video loop:', e.target.checked);
    }
});

// Media audio reactive toggle
const mediaAudioReactiveCheckbox = document.getElementById('media-audio-reactive');
if (mediaAudioReactiveCheckbox) {
    mediaAudioReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Media audio reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('mediaAudioReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] media-audio-reactive element not found');
}

// Media beat reactive toggle
const mediaBeatReactiveCheckbox = document.getElementById('media-beat-reactive');
if (mediaBeatReactiveCheckbox) {
    mediaBeatReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Media beat reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('mediaBeatReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] media-beat-reactive element not found');
}

// Global audio output toggle
const globalAudioOutputCheckbox = document.getElementById('global-audio-output');
if (globalAudioOutputCheckbox) {
    globalAudioOutputCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Global audio output:', e.target.checked);
        sendCommand('videoAudioOutput', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] global-audio-output element not found');
}

// Global audio beat-reactive toggle
const globalAudioBeatReactiveCheckbox = document.getElementById('global-audio-beat-reactive');
if (globalAudioBeatReactiveCheckbox) {
    globalAudioBeatReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Global audio beat-reactive:', e.target.checked);
        sendCommand('audioBeatReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] global-audio-beat-reactive element not found');
}

// Stream audio reactive toggle
const streamAudioReactiveCheckbox = document.getElementById('stream-audio-reactive');
if (streamAudioReactiveCheckbox) {
    streamAudioReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Stream audio reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('streamAudioReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] stream-audio-reactive element not found');
}

// Stream beat reactive toggle
const streamBeatReactiveCheckbox = document.getElementById('stream-beat-reactive');
if (streamBeatReactiveCheckbox) {
    streamBeatReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Stream beat reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('streamBeatReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] stream-beat-reactive element not found');
}

// Stream fit mode selector
document.getElementById('stream-fit-mode').addEventListener('change', (e) => {
    stagedStreamFitMode = e.target.value;
    console.log('[Control] Stream fit mode STAGED:', stagedStreamFitMode);
    // If currently in stream preview mode and stream is loaded, re-render
    // (Fit mode will update in real-time via render loop)
});

// Webpage audio reactive toggle
const webpageAudioReactiveCheckbox = document.getElementById('webpage-audio-reactive');
if (webpageAudioReactiveCheckbox) {
    webpageAudioReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Webpage audio reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('webpageAudioReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] webpage-audio-reactive element not found');
}

// Webpage beat reactive toggle
const webpageBeatReactiveCheckbox = document.getElementById('webpage-beat-reactive');
if (webpageBeatReactiveCheckbox) {
    webpageBeatReactiveCheckbox.addEventListener('change', (e) => {
        console.log('[Control] Webpage beat reactive:', e.target.checked);
        // Send to program in real-time
        sendCommand('webpageBeatReactive', e.target.checked ? 'true' : 'false');
    });
} else {
    console.warn('[Control] webpage-beat-reactive element not found');
}

// Preset drag-drop reload
const presetDropZone = document.getElementById('preset-drop-zone');

presetDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    presetDropZone.style.borderColor = '#0066FF';
    presetDropZone.style.background = '#0a1a2a';
});

presetDropZone.addEventListener('dragleave', () => {
    presetDropZone.style.borderColor = '#2a2a2a';
    presetDropZone.style.background = '#0a0a0a';
});

presetDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    presetDropZone.style.borderColor = '#2a2a2a';
    presetDropZone.style.background = '#0a0a0a';

    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.js')) {
        console.warn('[Control] Please drop a .js preset file');
        return;
    }

    console.log('[Control] Loading preset file:', file.name);

    // Read file content
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const code = event.target.result;

            // Extract class name from code
            const classMatch = code.match(/class\s+(\w+)\s+extends/);
            if (!classMatch) {
                console.error('[Control] Could not find preset class in file');
                return;
            }
            const className = classMatch[1];
            const presetKey = file.name.replace('.js', '').toLowerCase();

            console.log('[Control] Found preset class:', className, 'Key:', presetKey);

            // Remove old script if exists
            const oldScript = document.querySelector(`script[data-preset="${presetKey}"]`);
            if (oldScript) {
                oldScript.remove();
                console.log('[Control] Removed old script');
            }

            // Delete old class from window
            if (window[className]) {
                delete window[className];
                console.log('[Control] Deleted old class from window');
            }

            // Create new script element with code
            const script = document.createElement('script');
            script.setAttribute('data-preset', presetKey);
            script.textContent = code;
            document.head.appendChild(script);

            console.log('[Control] ✓ Loaded new preset code');

            // Re-register in renderer if currently in threejs mode
            if (unifiedThreeJSRenderer && window[className]) {
                unifiedThreeJSRenderer.registerPreset(presetKey, window[className]);
                console.log('[Control] ✓ Registered preset:', presetKey);

                // Reload if this is the current preset
                if (threejsPresetList[stagedThreeJSIndex] === presetKey) {
                    console.log('[Control] Reloading current preset...');
                    unifiedThreeJSRenderer.loadPreset(presetKey);
                }
            }

            // Send to main app too
            sendCommand('reloadPreset', { key: presetKey, className: className, code: code });

            console.log('[Control] ✓ Preset reloaded without page refresh!');

        } catch (error) {
            console.error('[Control] Failed to load preset:', error);
        }
    };

    reader.readAsText(file);
});

// Populate audio devices
// NOTE: Devices need permission granted first to show proper labels
// Permission should already be granted by index.html on load
async function loadAudioDevices() {
    const select = document.getElementById('audio-device-select');
    const warning = document.getElementById('audio-perm-warning');
    select.innerHTML = '<option value="none">No Audio Input</option>';

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        // Check if we have permission (devices will have labels)
        const hasPermission = audioInputs.length > 0 && audioInputs[0].label !== '';

        if (!hasPermission && audioInputs.length > 0) {
            // Devices exist but no labels = permission not granted
            console.log('[Control] Audio permission not granted - device labels are empty');
            console.log('[Control] ⚠️ Click PERMISSIONS button in index.html to grant audio access');
            warning.style.display = 'inline';
            return;
        }

        // Hide warning - permission granted
        warning.style.display = 'none';

        if (audioInputs.length === 0) {
            console.log('[Control] No audio input devices found');
            select.innerHTML = '<option value="none">No audio devices found</option>';
            return;
        }

        // We have permission - show device names
        audioInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label;
            select.appendChild(option);
        });

        console.log('[Control] Found', audioInputs.length, 'audio devices with labels');
    } catch (error) {
        console.error('[Control] Failed to enumerate audio devices:', error.message);
        select.innerHTML = '<option value="none">Error loading audio devices</option>';
    }
}

// Populate MIDI devices
// NOTE: MIDI is OPTIONAL - browser may not support it or it may require HTTPS
async function loadMIDIDevices() {
    const select = document.getElementById('midi-input-select');
    const synthSelect = document.getElementById('midi-synth-input-select');
    const warning = document.getElementById('midi-perm-warning');

    try {
        // Only request if not already available (won't trigger new prompt if granted)
        const access = await navigator.requestMIDIAccess();
        select.innerHTML = '';
        synthSelect.innerHTML = '';

        // Hide warning - MIDI is available
        warning.style.display = 'none';

        const inputs = Array.from(access.inputs.values());

        if (inputs.length === 0) {
            select.innerHTML = '<option value="">No MIDI devices found</option>';
            synthSelect.innerHTML = '<option value="">No MIDI devices found</option>';
            console.log('[Control] MIDI access granted but no devices connected');
            return;
        }

        // Populate both dropdowns with same devices
        inputs.forEach(input => {
            // Clock/SPP input
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name;
            select.appendChild(option);

            // Synth input
            const synthOption = document.createElement('option');
            synthOption.value = input.id;
            synthOption.textContent = input.name;
            synthSelect.appendChild(synthOption);
        });

        console.log('[Control] Found', inputs.length, 'MIDI devices');
    } catch (error) {
        // MIDI not available - this is OPTIONAL, so just hide warning and show message
        console.log('[Control] MIDI not available:', error.message);
        console.log('[Control] This is optional - browser may not support MIDI or requires HTTPS');

        // Hide warning - MIDI is optional, not required
        warning.style.display = 'none';

        select.innerHTML = '<option value="">MIDI not available (browser may not support it)</option>';
        synthSelect.innerHTML = '<option value="">MIDI not available (browser may not support it)</option>';
    }
}

// Populate MIDI output devices
async function loadMIDIOutputDevices() {
    const select = document.getElementById('midi-output-select');

    try {
        const access = await navigator.requestMIDIAccess();
        select.innerHTML = '';

        const outputs = Array.from(access.outputs.values());

        if (outputs.length === 0) {
            select.innerHTML = '<option value="">No MIDI outputs found</option>';
            console.log('[Control] MIDI access granted but no output devices connected');
            return;
        }

        outputs.forEach(output => {
            const option = document.createElement('option');
            option.value = output.id;
            option.textContent = output.name;
            select.appendChild(option);
        });

        console.log('[Control] Found', outputs.length, 'MIDI output devices');
    } catch (error) {
        console.log('[Control] MIDI output not available:', error.message);
        select.innerHTML = '<option value="">MIDI not available</option>';
    }
}

// Populate video devices
async function loadVideoDevices() {
    const select = document.getElementById('video-device-select');
    const warning = document.getElementById('video-perm-warning');
    select.innerHTML = '<option value="">No camera selected</option>';

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');

        // Check if we have permission (devices will have labels)
        const hasPermission = videoInputs.length > 0 && videoInputs[0].label !== '';

        if (!hasPermission && videoInputs.length > 0) {
            // Devices exist but no labels = permission not granted
            console.log('[Control] Video permission not granted - device labels are empty');
            console.log('[Control] ⚠️ Click PERMISSIONS button in index.html to grant camera access');
            warning.style.display = 'inline';
            return;
        }

        // Hide warning - permission granted
        warning.style.display = 'none';

        videoInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label;
            select.appendChild(option);
        });

        console.log('[Control] Found', videoInputs.length, 'video devices with labels');
    } catch (error) {
        console.error('[Control] Failed to enumerate video devices:', error.message);
    }
}

// Dynamic Three.js preset loader
// Preset info mapping
function getThreeJSPresetInfo(presetName) {
    const presetMap = {
        'geometric': { file: 'presets/threejs/GeometricShapes.js', className: 'GeometricShapesPreset' },
        'particles': { file: 'presets/threejs/Particles.js', className: 'ParticlesPreset' },
        'tunnel': { file: 'presets/threejs/Tunnel.js', className: 'TunnelPreset' },
        'gblogo': { file: 'presets/threejs/GBLogo.js', className: 'GBLogoPreset' }
    };
    return presetMap[presetName];
}

async function loadThreeJSPreset(presetName, cacheBust = true) {
    const presetInfo = getThreeJSPresetInfo(presetName);
    if (!presetInfo) {
        console.error(`[Control] Unknown preset: ${presetName}`);
        return false;
    }

    try {
        // CRITICAL: Delete old class from window to avoid "already declared" error
        if (window[presetInfo.className]) {
            delete window[presetInfo.className];
            console.log(`[Control] Deleted old class: ${presetInfo.className}`);
        }

        console.log(`[Control] Loading Three.js preset on-demand: ${presetName}${cacheBust ? ' (fresh)' : ''}`);
        await loadScript(presetInfo.file, cacheBust);

        if (typeof window[presetInfo.className] !== 'undefined') {
            unifiedThreeJSRenderer.registerPreset(presetName, window[presetInfo.className]);
            console.log(`[Control] ✓ Loaded Three.js preset: ${presetName}`);
            return true;
        } else {
            console.warn(`[Control] ✗ Preset class ${presetInfo.className} not found`);
            return false;
        }
    } catch (error) {
        console.error(`[Control] Failed to load preset ${presetName}:`, error);
        return false;
    }
}

async function loadThreeJSPresets() {
    const presetNames = ['geometric', 'particles', 'tunnel'];
    for (const presetName of presetNames) {
        await loadThreeJSPreset(presetName, false);
    }
}

function loadScript(src, cacheBust = false) {
    return new Promise((resolve, reject) => {
        // Remove old script with same src if it exists
        const oldScripts = document.querySelectorAll(`script[data-preset-src="${src}"]`);
        oldScripts.forEach(s => s.remove());

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

// Force dropdown to default to "microphone" on load
// Main app will NEVER auto-start MIDI synth, so this is always correct initially
document.getElementById('milkdrop-audio-source').value = 'microphone';
// Note: MIDI synth options are now in a separate section, always visible
console.log('[Control] Defaulted to Audio Input Device');

// CRITICAL: Force main app to microphone mode on control.html load
// This ensures MIDI synth is never auto-started (requires user gesture)
console.log('[Control] Forcing Visual Reactive Input to microphone...');
sendCommand('milkdropAudioSource', 'microphone');

// Get resolution dimensions from preset or custom
function getResolutionDimensions(resolution) {
    const resolutions = {
        'auto': null, // Will use window size
        '100%': 'container', // Will use container size
        '1080p': { width: 1920, height: 1080 },
        '720p': { width: 1280, height: 720 },
        '4k': { width: 3840, height: 2160 },
        'square': { width: 1080, height: 1080 },
        'vertical': { width: 1080, height: 1920 },
        'custom': {
            width: parseInt(document.getElementById('custom-width').value) || 1920,
            height: parseInt(document.getElementById('custom-height').value) || 1080
        }
    };
    return resolutions[resolution];
}

// Update preview aspect ratio to match selected resolution
function updatePreviewAspectRatio(resolution = null, programDimensions = null) {
    if (!resolution) {
        resolution = document.getElementById('program-resolution').value;
    }

    const dimensions = getResolutionDimensions(resolution);

    const wrapper = document.getElementById('preview-aspect-wrapper');
    if (!wrapper) return;

    // Maximum constraints for preview
    const MAX_WIDTH = 640;
    const MAX_HEIGHT = 480;

    let sourceWidth, sourceHeight;

    if (!dimensions) {
        // Auto mode - use 16:9 as default
        sourceWidth = 1920;
        sourceHeight = 1080;
    } else if (dimensions === 'container') {
        // 100% mode - use program dimensions if provided
        if (programDimensions && programDimensions.width && programDimensions.height) {
            sourceWidth = programDimensions.width;
            sourceHeight = programDimensions.height;
        } else {
            // Default to 16:9 until we get program dimensions
            sourceWidth = 1920;
            sourceHeight = 1080;
        }
    } else {
        // Use preset dimensions
        sourceWidth = dimensions.width;
        sourceHeight = dimensions.height;
    }

    // Calculate aspect ratio
    const aspectRatio = sourceWidth / sourceHeight;

    // Calculate preview dimensions within max constraints
    let previewWidth, previewHeight;

    if (aspectRatio >= 1) {
        // Landscape or square - constrain by width first
        previewWidth = Math.min(sourceWidth, MAX_WIDTH);
        previewHeight = previewWidth / aspectRatio;

        // If height exceeds max, constrain by height
        if (previewHeight > MAX_HEIGHT) {
            previewHeight = MAX_HEIGHT;
            previewWidth = previewHeight * aspectRatio;
        }
    } else {
        // Portrait - constrain by height first
        previewHeight = Math.min(sourceHeight, MAX_HEIGHT);
        previewWidth = previewHeight * aspectRatio;

        // If width exceeds max, constrain by width
        if (previewWidth > MAX_WIDTH) {
            previewWidth = MAX_WIDTH;
            previewHeight = previewWidth / aspectRatio;
        }
    }

    // Set explicit dimensions instead of padding-bottom trick
    wrapper.style.width = `${Math.round(previewWidth)}px`;
    wrapper.style.height = `${Math.round(previewHeight)}px`;
    wrapper.style.paddingBottom = '0'; // Remove padding-bottom

    // CRITICAL: Set canvas resolution to match display size for performance
    const canvas = document.getElementById('unified-preview-canvas');
    if (canvas) {
        canvas.width = Math.round(previewWidth);
        canvas.height = Math.round(previewHeight);

        // Notify active renderer to resize
        if (typeof unifiedPreviewRenderer !== 'undefined' && unifiedPreviewRenderer && unifiedPreviewRenderer.resize) {
            unifiedPreviewRenderer.resize();
        }
        if (typeof unifiedThreeJSRenderer !== 'undefined' && unifiedThreeJSRenderer && unifiedThreeJSRenderer.resize) {
            unifiedThreeJSRenderer.resize(Math.round(previewWidth), Math.round(previewHeight));
        }
        // Note: Milkdrop visualizer doesn't have resize - recreate when switching to milkdrop mode
    }

    console.log(`[Control] Preview set to ${resolution} (${sourceWidth}x${sourceHeight}) -> display ${Math.round(previewWidth)}x${Math.round(previewHeight)}`);
}

// Apply custom resolution
function applyCustomResolution() {
    const width = parseInt(document.getElementById('custom-width').value);
    const height = parseInt(document.getElementById('custom-height').value);

    if (!width || !height || width < 320 || height < 240) {
        alert('Please enter valid dimensions (min 320x240)');
        return;
    }

    console.log('[Control] Applying custom resolution:', width, 'x', height);

    // Save custom dimensions
    localStorage.setItem('customResolutionWidth', width);
    localStorage.setItem('customResolutionHeight', height);

    // Update preview
    updatePreviewAspectRatio('custom');

    // Send to main app
    sendCommand('programResolution', {
        preset: 'custom',
        width: width,
        height: height
    });
}

// Initialize unified preview system
console.log('[Control] Initializing unified preview system...');
unifiedCanvas = document.getElementById('unified-preview-canvas');

// Load saved resolution setting
const savedResolution = localStorage.getItem('programResolution') || 'auto';
document.getElementById('program-resolution').value = savedResolution;
if (savedResolution === 'custom') {
    document.getElementById('custom-resolution-inputs').style.display = 'block';
    const savedWidth = localStorage.getItem('customResolutionWidth') || '1920';
    const savedHeight = localStorage.getItem('customResolutionHeight') || '1080';
    document.getElementById('custom-width').value = savedWidth;
    document.getElementById('custom-height').value = savedHeight;
}

// Set preview aspect ratio to match selected resolution
updatePreviewAspectRatio(savedResolution);

// Start with black screen by default
setTimeout(() => {
    switchPreviewMode('black');
}, 100);

// Initialize
loadPresets();
loadAudioDevices();
loadMIDIDevices();
loadMIDIOutputDevices();
loadVideoDevices();

// Request full state after a short delay (allows commands to be processed first)
setTimeout(() => {
    console.log('[Control] Requesting state from main app...');
    sendCommand('requestState');
}, 200);
