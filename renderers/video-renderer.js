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

    async initialize(deviceId = null) {
        try {
            console.log('[VideoRenderer] Initializing camera...');

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
                this.video.muted = true; // Mute to avoid audio feedback
                this.video.style.display = 'none'; // Hidden - we draw to canvas
                document.body.appendChild(this.video); // CRITICAL: Add to DOM for metadata loading
                console.log('[VideoRenderer] Created video element in DOM');
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
            console.log('[VideoRenderer] Waiting for video metadata...');

            // Wait for video to be ready (with fallback for virtual cameras)
            const metadataLoaded = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn('[VideoRenderer] Metadata timeout - probably virtual camera, proceeding anyway');
                    resolve(false); // Don't reject - just flag as failed
                }, 3000); // Shorter timeout, then fallback

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

            // Try to play regardless of metadata loading (works for most virtual cameras)
            try {
                await this.video.play();
                console.log('[VideoRenderer] ✓ Video playing');
            } catch (err) {
                console.warn('[VideoRenderer] Auto-play failed:', err.message);
                // Continue anyway - it might still work
            }

            console.log('[VideoRenderer] ✓ Video stream active:', this.video.videoWidth, 'x', this.video.videoHeight);
            this.isActive = true;

            // Resize canvas to match video
            if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                console.log('[VideoRenderer] Video dimensions:', this.video.videoWidth, 'x', this.video.videoHeight);
            } else {
                console.warn('[VideoRenderer] Video dimensions not available yet - may need to wait for first frame');
            }

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

        // ALWAYS release old camera completely - user intentionally switched
        if (this.stream) {
            console.log('[VideoRenderer] Releasing old camera (user requested switch)');
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('[VideoRenderer] Stopped track:', track.label);
            });
            this.stream = null;
        }

        if (this.video) {
            this.video.srcObject = null;
        }

        this.isActive = false;

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

        // Resize canvas to match video aspect ratio
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;

        if (vw && vh) {
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

            // Clear canvas
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Apply audio-reactive effects
            if (this.audioReactive) {
                this.applyAudioEffects();
            }

            // Draw video frame
            this.ctx.drawImage(this.video, drawX, drawY, drawWidth, drawHeight);

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
            this.video.srcObject = null;
        }

        this.isActive = false;
        console.log('[VideoRenderer] ✓ Camera released');
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
