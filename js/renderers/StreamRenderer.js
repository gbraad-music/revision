// StreamRenderer - Handles live streaming video (HLS, WebRTC, RTMP via HLS)
class StreamRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.videoElement = null;
        this.streamType = null; // 'hls', 'webrtc', 'direct'
        this.hls = null; // HLS.js instance
        this.animationId = null;
        this.isActive = false;
        this.fitMode = 'cover';

        // Audio-reactive settings
        this.audioReactive = false;
        this.beatReactive = false;
        this.bassLevel = 0;
        this.midLevel = 0;
        this.highLevel = 0;
        this.hueShift = 0;
        this.saturation = 1.0;
        this.brightness = 1.0;
        this.beatZoom = 1.0;
        this.targetZoom = 1.0;
        this.lastBeatTime = 0;
    }

    async loadStream(url, type = 'auto', options = {}) {
        console.log('[StreamRenderer] Loading stream:', type, 'URL:', url);

        // Clean up old stream
        this.stop();

        this.isActive = true;
        this.fitMode = options.fitMode || 'cover';

        // Create video element
        this.videoElement = document.createElement('video');
        // Use passed option if available, otherwise read from localStorage
        const audioOutputEnabled = options.audioOutput !== undefined
            ? options.audioOutput
            : localStorage.getItem('videoAudioOutput') === 'true';
        this.videoElement.muted = !audioOutputEnabled;
        this.videoElement.playsInline = true;
        this.videoElement.autoplay = true;
        console.log('[StreamRenderer] Stream audio output (from options):', audioOutputEnabled);

        // Detect stream type if auto
        if (type === 'auto') {
            if (url.includes('.m3u8')) {
                type = 'hls';
            } else if (url.startsWith('webrtc://') || url.startsWith('rtc://')) {
                type = 'webrtc';
            } else {
                type = 'direct';
            }
        }

        this.streamType = type;

        try {
            if (type === 'hls') {
                await this.loadHLS(url);
            } else if (type === 'webrtc') {
                await this.loadWebRTC(url);
            } else {
                // Direct video stream (RTSP via proxy, etc.)
                this.videoElement.src = url;
                await this.videoElement.play();
            }

            // Start rendering
            this.startRender();
            console.log('[StreamRenderer] ✓ Stream loaded successfully');
        } catch (error) {
            console.error('[StreamRenderer] Failed to load stream:', error);
            this.stop();
            throw error;
        }
    }

    async loadHLS(url) {
        if (typeof Hls === 'undefined') {
            throw new Error('HLS.js library not loaded. Include hls.js script in index.html');
        }

        if (Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });

            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoElement);

            return new Promise((resolve, reject) => {
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('[StreamRenderer] HLS manifest parsed');
                    this.videoElement.play()
                        .then(resolve)
                        .catch(reject);
                });

                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        console.error('[StreamRenderer] HLS fatal error:', data);
                        reject(new Error(`HLS error: ${data.type}`));
                    }
                });
            });
        } else if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            this.videoElement.src = url;
            return this.videoElement.play();
        } else {
            throw new Error('HLS is not supported in this browser');
        }
    }

    async loadWebRTC(url) {
        // WebRTC implementation would go here
        // This is a placeholder - would need WebRTC signaling server
        throw new Error('WebRTC streaming not yet implemented. Use HLS or direct stream.');
    }

    calculateFitDimensions(videoWidth, videoHeight) {
        const videoAspect = videoWidth / videoHeight;
        const canvasAspect = this.canvas.width / this.canvas.height;
        let drawWidth, drawHeight, drawX, drawY;

        switch (this.fitMode) {
            case 'cover':
                // Fill canvas, may crop
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
                break;

            case 'contain':
                // Fit all, may letterbox
                if (canvasAspect > videoAspect) {
                    drawHeight = this.canvas.height;
                    drawWidth = drawHeight * videoAspect;
                    drawX = (this.canvas.width - drawWidth) / 2;
                    drawY = 0;
                } else {
                    drawWidth = this.canvas.width;
                    drawHeight = drawWidth / videoAspect;
                    drawX = 0;
                    drawY = (this.canvas.height - drawHeight) / 2;
                }
                break;

            case 'fill':
                // Stretch to fill
                drawWidth = this.canvas.width;
                drawHeight = this.canvas.height;
                drawX = 0;
                drawY = 0;
                break;

            default:
                this.fitMode = 'cover';
                return this.calculateFitDimensions(videoWidth, videoHeight);
        }

        return { drawWidth, drawHeight, drawX, drawY };
    }

    startRender() {
        if (this.animationId) return;

        const renderFrame = () => {
            if (!this.isActive) return;

            if (this.videoElement && this.videoElement.readyState >= 2) {
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                let { drawWidth, drawHeight, drawX, drawY } = this.calculateFitDimensions(
                    this.videoElement.videoWidth,
                    this.videoElement.videoHeight
                );

                // Apply beat-reactive zoom
                if (this.beatReactive) {
                    this.beatZoom += (this.targetZoom - this.beatZoom) * 0.15;
                    this.targetZoom += (1.0 - this.targetZoom) * 0.1;

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
                    this.hueShift = this.bassLevel * 180;
                    this.saturation = 1.0 + (this.midLevel * 0.5);
                    this.brightness = 1.0 + (this.highLevel * 0.3);

                    this.ctx.filter = `
                        hue-rotate(${this.hueShift}deg)
                        saturate(${this.saturation})
                        brightness(${this.brightness})
                    `;
                } else {
                    this.ctx.filter = 'none';
                }

                this.ctx.drawImage(this.videoElement, drawX, drawY, drawWidth, drawHeight);
                this.ctx.filter = 'none';
            }

            this.animationId = requestAnimationFrame(renderFrame);
        };

        renderFrame();
    }

    stop() {
        console.log('[StreamRenderer] Stopping...');
        this.isActive = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.muted = true;
            this.videoElement.src = '';
            this.videoElement.load();
            if (this.videoElement.parentNode) {
                this.videoElement.remove();
            }
            this.videoElement = null;
        }

        // Clear canvas
        if (this.ctx) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        console.log('[StreamRenderer] ✓ Stopped and cleaned up');
    }

    resize(width, height) {
        console.log('[StreamRenderer] Resizing canvas to:', width, 'x', height);
        this.canvas.width = width;
        this.canvas.height = height;
    }

    setAudioReactive(enabled) {
        this.audioReactive = enabled;
        console.log('[StreamRenderer] Audio reactive:', enabled);
    }

    setBeatReactive(enabled) {
        this.beatReactive = enabled;
        console.log('[StreamRenderer] Beat reactive:', enabled);
    }

    setAudioOutput(enabled) {
        console.log('[StreamRenderer] Audio output:', enabled);
        if (this.videoElement) {
            this.videoElement.muted = !enabled;
            console.log('[StreamRenderer] Video element muted:', this.videoElement.muted);
        }
    }

    handleBeat(data) {
        if (!this.beatReactive) return;

        const now = performance.now();
        if (now - this.lastBeatTime >= 100) {
            this.lastBeatTime = now;
            const intensity = data.intensity || 1.0;
            this.targetZoom = 1.0 + (intensity * 0.15);
            this.beatZoom = this.targetZoom;
        }
    }

    handleFrequency(data) {
        if (!this.audioReactive) return;

        if (data.bands) {
            this.bassLevel = data.bands.bass || 0;
            this.midLevel = data.bands.mid || 0;
            this.highLevel = data.bands.high || 0;
        }
    }
}
