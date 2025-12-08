// VideoRenderer - Webcam/Video feed display with optional audio-reactive effects
// Can be used as a preset type alongside builtin, threejs, and milkdrop

class VideoRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.video = null;
        this.stream = null;
        this.isActive = false;
        this.animationId = null;

        // Audio-reactive effects
        this.audioReactive = false; // Disabled by default
        this.bassLevel = 0;
        this.midLevel = 0;
        this.highLevel = 0;

        // Effect parameters
        this.hueShift = 0;
        this.saturation = 1.0;
        this.brightness = 1.0;

        // Beat-reactive effects
        this.beatReactive = false; // Disabled by default
        this.beatZoom = 1.0; // Current zoom level
        this.targetZoom = 1.0; // Target zoom level
        this.lastBeatTime = 0;
    }

    async initialize(deviceId = null, retryCount = 0) {
        try {
            console.log('[VideoRenderer] Initializing camera... (attempt', retryCount + 1, ')');

            // Clean up any existing stream first
            if (this.stream) {
                console.log('[VideoRenderer] Releasing existing stream before reinitializing');
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // Create video element (needs to be in DOM for some browsers)
            if (!this.video) {
                this.video = document.createElement('video');
                this.video.autoplay = true;
                this.video.playsInline = true;
                this.video.muted = true;
                this.video.style.display = 'none';
                document.body.appendChild(this.video);
                console.log('[VideoRenderer] Created video element in DOM');
            } else {
                // Clear old srcObject
                this.video.srcObject = null;
            }

            // Request camera access
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : true,
                audio: false
            };

            console.log('[VideoRenderer] Requesting camera access:', deviceId || 'default');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('[VideoRenderer] ✓ Got media stream, tracks:', this.stream.getTracks().map(t => t.label).join(', '));

            this.video.srcObject = this.stream;

            // Wait for metadata with longer timeout for C920
            const metadataLoaded = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn('[VideoRenderer] Metadata timeout - camera slow to respond');
                    resolve(false);
                }, 5000);

                this.video.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    console.log('[VideoRenderer] ✓ Metadata loaded');
                    resolve(true);
                };

                this.video.onerror = (err) => {
                    clearTimeout(timeout);
                    console.error('[VideoRenderer] Video error:', err);
                    resolve(false);
                };
            });

            // Wait for video to start streaming
            await new Promise(resolve => setTimeout(resolve, 200));

            // Try to play
            try {
                await this.video.play();
                console.log('[VideoRenderer] ✓ Video playing');
            } catch (err) {
                console.warn('[VideoRenderer] Auto-play failed:', err.message);
            }

            // Check if we got valid dimensions
            let attempts = 0;
            while ((this.video.videoWidth === 0 || this.video.videoHeight === 0) && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
                console.error('[VideoRenderer] ✗ Camera failed to provide valid dimensions after 1 second');

                // Retry if first attempt (common with C920)
                if (retryCount < 2) {
                    console.log('[VideoRenderer] Retrying initialization...');
                    return this.initialize(deviceId, retryCount + 1);
                }

                throw new Error('Camera dimensions invalid (0x0)');
            }

            // Mark as active
            this.isActive = true;
            console.log('[VideoRenderer] ✓ Stream initialized successfully, dimensions:', this.video.videoWidth, 'x', this.video.videoHeight);

            return true;
        } catch (error) {
            console.error('[VideoRenderer] ✗ Failed to initialize:', error.name, error.message);

            // CRITICAL: Clean up partial initialization on failure
            if (this.stream) {
                console.log('[VideoRenderer] Cleaning up failed stream');
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (this.video) {
                this.video.srcObject = null;
                this.video = null;
            }
            this.isActive = false;

            if (error.name === 'NotAllowedError') {
                console.error('[VideoRenderer] Camera permission denied - please allow camera access');
            } else if (error.name === 'NotFoundError') {
                console.error('[VideoRenderer] No camera found - check device ID');
            } else if (error.name === 'AbortError') {
                console.error('[VideoRenderer] Camera access aborted - may be in use by another app');
            }
            return false;
        }
    }

    async switchCamera(deviceId) {
        console.log('[VideoRenderer] Switching camera to:', deviceId);

        // CRITICAL: Stop render loop first
        this.stop();

        // Release old camera completely
        if (this.stream) {
            console.log('[VideoRenderer] Releasing old camera (user requested switch)');
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('[VideoRenderer] Stopped track:', track.label);
            });
            this.stream = null;
        }

        // CRITICAL: Destroy video element completely
        if (this.video) {
            this.video.srcObject = null;
            this.video.load(); // Force unload
            if (this.video.parentNode) {
                this.video.parentNode.removeChild(this.video);
            }
            this.video = null;
            console.log('[VideoRenderer] Video element destroyed');
        }

        this.isActive = false;

        // Wait for browser to release hardware
        await new Promise(resolve => setTimeout(resolve, 200));

        // Try to initialize new camera with clean slate
        const success = await this.initialize(deviceId);

        if (success) {
            console.log('[VideoRenderer] ✓ Camera switch successful');
        } else {
            console.error('[VideoRenderer] ✗ Camera switch failed - all cameras released, ready for retry');
        }

        return success;
    }

    start() {
        if (!this.isActive || this.animationId) return;

        console.log('[VideoRenderer] Starting render loop...');
        this.render();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            console.log('[VideoRenderer] Stopped');
        }
    }

    render() {
        if (!this.isActive) return;

        // Clear canvas first
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Get video dimensions
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;

        // Log dimensions once when they change
        if (!this._lastLoggedDimensions || this._lastLoggedDimensions !== `${vw}x${vh}`) {
            console.log('[VideoRenderer] Render dimensions:', vw, 'x', vh);
            this._lastLoggedDimensions = `${vw}x${vh}`;
        }

        // Draw video if dimensions are available
        if (vw > 0 && vh > 0) {
            const canvasAspect = this.canvas.width / this.canvas.height;
            const videoAspect = vw / vh;

            let drawWidth, drawHeight, drawX, drawY;

            // Cover canvas with video (like CSS background-size: cover)
            if (canvasAspect > videoAspect) {
                drawWidth = this.canvas.width;
                drawHeight = drawWidth / videoAspect;
                drawX = 0;
                drawY = (this.canvas.height - drawHeight) / 2;
            } else {
                drawHeight = this.canvas.height;
                drawWidth = drawHeight * videoAspect;
                drawX = (this.canvas.width - drawWidth) / 2;
                drawY = 0;
            }

            // Apply beat-reactive zoom (smooth interpolation)
            if (this.beatReactive) {
                // Smoothly interpolate zoom back to 1.0
                this.beatZoom += (this.targetZoom - this.beatZoom) * 0.15;
                this.targetZoom += (1.0 - this.targetZoom) * 0.1;

                // Apply zoom by scaling from center
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
                this.applyAudioEffects();
            }

            // Draw video frame
            try {
                this.ctx.drawImage(this.video, drawX, drawY, drawWidth, drawHeight);
            } catch (err) {
                // Video not ready yet, will try next frame
            }

            // Reset filters
            this.ctx.filter = 'none';
        }

        this.animationId = requestAnimationFrame(() => this.render());
    }

    applyAudioEffects() {
        // Hue shift based on bass (0-360 degrees)
        this.hueShift = this.bassLevel * 180;

        // Saturation based on mid
        this.saturation = 1.0 + (this.midLevel * 0.5);

        // Brightness based on high
        this.brightness = 1.0 + (this.highLevel * 0.3);

        // Apply CSS filters
        this.ctx.filter = `
            hue-rotate(${this.hueShift}deg)
            saturate(${this.saturation})
            brightness(${this.brightness})
        `;
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        console.log('[VideoRenderer] Resized to:', width, 'x', height);
    }

    // Handle audio-reactive input
    handleFrequency(data) {
        if (!this.audioReactive || !data.bands) return;

        this.bassLevel = data.bands.bass || 0;
        this.midLevel = data.bands.mid || 0;
        this.highLevel = data.bands.high || 0;
    }

    handleBeat(data) {
        if (!this.beatReactive) return;

        const now = performance.now();

        // Prevent beat spam (min 100ms between beats)
        if (now - this.lastBeatTime < 100) return;
        this.lastBeatTime = now;

        // Trigger zoom pulse on beat (4-on-the-floor style)
        const intensity = data.intensity || 1.0;
        this.targetZoom = 1.0 + (intensity * 0.15); // Zoom in 15% max
        this.beatZoom = this.targetZoom;

        console.log('[VideoRenderer] Beat! Zoom:', this.targetZoom.toFixed(2));
    }

    handleNote(data) {
        // Could trigger note-reactive effects
    }

    handleControl(data) {
        // Could map MIDI CC to effect parameters
    }

    setAudioReactive(enabled) {
        this.audioReactive = enabled;
        console.log('[VideoRenderer] Audio reactive:', enabled);
    }

    setBeatReactive(enabled) {
        this.beatReactive = enabled;
        console.log('[VideoRenderer] Beat reactive:', enabled);
    }

    release() {
        console.log('[VideoRenderer] Releasing camera...');
        this.stop();

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('[VideoRenderer] Stopped track:', track.label);
            });
            this.stream = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
            this.video.load(); // Force browser to release resources

            // Remove from DOM if still attached
            if (this.video.parentNode) {
                this.video.parentNode.removeChild(this.video);
                console.log('[VideoRenderer] Video element removed from DOM');
            }

            this.video = null;
        }

        this.isActive = false;
        console.log('[VideoRenderer] ✓ Camera fully released');
    }

    destroy() {
        this.release();

        if (this.video) {
            this.video = null;
        }

        console.log('[VideoRenderer] Destroyed');
    }
}

window.VideoRenderer = VideoRenderer;
