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
        this.audioReactive = true;
        this.bassLevel = 0;
        this.midLevel = 0;
        this.highLevel = 0;

        // Effect parameters
        this.hueShift = 0;
        this.saturation = 1.0;
        this.brightness = 1.0;
    }

    async initialize(deviceId = null) {
        try {
            console.log('[VideoRenderer] Initializing...');

            // Create video element
            this.video = document.createElement('video');
            this.video.autoplay = true;
            this.video.playsInline = true;

            // Request camera access
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : true,
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });

            console.log('[VideoRenderer] Video stream active:', this.video.videoWidth, 'x', this.video.videoHeight);
            this.isActive = true;
            return true;
        } catch (error) {
            console.error('[VideoRenderer] Failed to initialize:', error);
            return false;
        }
    }

    async switchCamera(deviceId) {
        console.log('[VideoRenderer] Switching camera to:', deviceId);

        // Stop current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        // Initialize with new camera
        return await this.initialize(deviceId);
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
        // Could trigger beat-reactive effects (flash, zoom, etc.)
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

    destroy() {
        this.stop();

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.srcObject = null;
            this.video = null;
        }

        this.isActive = false;
        console.log('[VideoRenderer] Destroyed');
    }
}

window.VideoRenderer = VideoRenderer;
