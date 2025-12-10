// WebpageRenderer - Displays webpages in an iframe
class WebpageRenderer {
    constructor(container) {
        this.container = container;
        this.iframe = null;
        this.isActive = false;
        this.currentURL = '';

        // Audio-reactive settings (applied via CSS filters)
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
        this.animationId = null;
    }

    loadWebpage(url) {
        console.log('[WebpageRenderer] Loading webpage:', url);

        // Clean up old iframe
        this.stop();

        this.isActive = true;
        this.currentURL = url;

        // Create iframe element
        this.iframe = document.createElement('iframe');
        this.iframe.src = url;
        this.iframe.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: #000;
        `;

        // Add to container
        this.container.appendChild(this.iframe);

        // Start effects loop if reactive modes enabled
        if (this.audioReactive || this.beatReactive) {
            this.startEffectsLoop();
        }

        console.log('[WebpageRenderer] ✓ Webpage loaded');
    }

    startEffectsLoop() {
        if (this.animationId) return;

        const updateEffects = () => {
            if (!this.isActive || !this.iframe) return;

            let filters = [];
            let transform = '';

            // Audio-reactive effects
            if (this.audioReactive) {
                this.hueShift = this.bassLevel * 180;
                this.saturation = 1.0 + (this.midLevel * 0.5);
                this.brightness = 1.0 + (this.highLevel * 0.3);

                filters.push(`hue-rotate(${this.hueShift}deg)`);
                filters.push(`saturate(${this.saturation})`);
                filters.push(`brightness(${this.brightness})`);
            }

            // Beat-reactive zoom
            if (this.beatReactive) {
                this.beatZoom += (this.targetZoom - this.beatZoom) * 0.15;
                this.targetZoom += (1.0 - this.targetZoom) * 0.1;

                if (this.beatZoom !== 1.0) {
                    transform = `scale(${this.beatZoom})`;
                }
            }

            // Apply filters and transform
            this.iframe.style.filter = filters.length > 0 ? filters.join(' ') : 'none';
            this.iframe.style.transform = transform;

            this.animationId = requestAnimationFrame(updateEffects);
        };

        updateEffects();
    }

    stop() {
        console.log('[WebpageRenderer] Stopping...');
        this.isActive = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.iframe) {
            this.iframe.remove();
            this.iframe = null;
        }

        this.currentURL = '';
        console.log('[WebpageRenderer] ✓ Stopped and cleaned up');
    }

    resize(width, height) {
        console.log('[WebpageRenderer] Resizing to:', width, 'x', height);
        if (this.iframe) {
            this.iframe.style.width = width + 'px';
            this.iframe.style.height = height + 'px';
        }
    }

    setAudioReactive(enabled) {
        this.audioReactive = enabled;
        console.log('[WebpageRenderer] Audio reactive:', enabled);

        if (enabled && this.isActive && !this.animationId) {
            this.startEffectsLoop();
        } else if (!enabled && !this.beatReactive && this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            if (this.iframe) {
                this.iframe.style.filter = 'none';
            }
        }
    }

    setBeatReactive(enabled) {
        this.beatReactive = enabled;
        console.log('[WebpageRenderer] Beat reactive:', enabled);

        if (enabled && this.isActive && !this.animationId) {
            this.startEffectsLoop();
        } else if (!enabled && !this.audioReactive && this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            if (this.iframe) {
                this.iframe.style.transform = 'none';
            }
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
