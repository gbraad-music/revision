// MobileCompatibility - Android and mobile browser fixes
// Handles: WebGL context loss, touch events, performance, permissions

class MobileCompatibility {
    constructor(canvas) {
        this.canvas = canvas;
        this.isMobile = this.detectMobile();
        this.isAndroid = this.detectAndroid();
        this.contextLostHandlers = [];
        this.contextRestoredHandlers = [];

        // Performance monitoring
        this.fps = 60;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;

        // Touch state
        this.touchActive = false;
        this.lastTouchTime = 0;
    }

    initialize() {
        console.log('[MobileCompat] Platform:', {
            isMobile: this.isMobile,
            isAndroid: this.isAndroid,
            userAgent: navigator.userAgent
        });

        if (this.isMobile) {
            this.setupMobileOptimizations();
        }

        if (this.canvas) {
            this.setupWebGLContextRecovery();
            this.setupTouchHandling();
        }

        // Prevent page scrolling on touch
        this.preventScrollBounce();

        // Handle screen orientation changes
        this.setupOrientationHandling();

        // Wake lock for performance sessions
        this.setupWakeLock();

        console.log('[MobileCompat] Initialized');
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    detectAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    setupMobileOptimizations() {
        console.log('[MobileCompat] Applying mobile optimizations...');

        // Reduce pixel ratio for better performance on high-DPI screens
        if (window.devicePixelRatio > 2) {
            console.log('[MobileCompat] High DPI detected, limiting to 2x');
            // This should be used when setting canvas size
            this.maxPixelRatio = 2;
        } else {
            this.maxPixelRatio = window.devicePixelRatio || 1;
        }

        // Disable text selection
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.webkitTouchCallout = 'none';

        // Optimize canvas for mobile
        if (this.canvas) {
            this.canvas.style.touchAction = 'none';
        }

        // Request high performance mode
        if (navigator.requestIdleCallback) {
            console.log('[MobileCompat] Using requestIdleCallback for background tasks');
        }
    }

    setupWebGLContextRecovery() {
        if (!this.canvas) return;

        // Handle WebGL context loss (common on mobile)
        this.canvas.addEventListener('webglcontextlost', (event) => {
            console.error('[MobileCompat] WebGL context lost!');
            event.preventDefault(); // Prevent default behavior

            // Notify handlers
            this.contextLostHandlers.forEach(handler => handler(event));

            // Show user notification
            this.showContextLossNotification();
        }, false);

        // Handle WebGL context restoration
        this.canvas.addEventListener('webglcontextrestored', (event) => {
            console.log('[MobileCompat] WebGL context restored');

            // Notify handlers to reinitialize
            this.contextRestoredHandlers.forEach(handler => handler(event));

            this.hideContextLossNotification();
        }, false);

        console.log('[MobileCompat] WebGL context recovery enabled');
    }

    onContextLost(handler) {
        this.contextLostHandlers.push(handler);
    }

    onContextRestored(handler) {
        this.contextRestoredHandlers.push(handler);
    }

    showContextLossNotification() {
        // Create notification overlay
        const notification = document.createElement('div');
        notification.id = 'webgl-context-lost-notification';
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            font-family: sans-serif;
            text-align: center;
        `;
        notification.innerHTML = `
            <h3>Graphics Error</h3>
            <p>Attempting to recover...</p>
            <p style="font-size: 12px;">If this persists, try refreshing the page</p>
        `;
        document.body.appendChild(notification);
    }

    hideContextLossNotification() {
        const notification = document.getElementById('webgl-context-lost-notification');
        if (notification) {
            notification.remove();
        }
    }

    setupTouchHandling() {
        if (!this.canvas) return;

        // Touch events for mobile interaction
        this.canvas.addEventListener('touchstart', (e) => {
            this.touchActive = true;
            this.lastTouchTime = performance.now();
            this.handleTouchStart(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (this.touchActive) {
                e.preventDefault(); // Prevent scrolling
                this.handleTouchMove(e);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            this.touchActive = false;
            this.handleTouchEnd(e);
        }, { passive: false });

        console.log('[MobileCompat] Touch handling enabled');
    }

    handleTouchStart(e) {
        // Convert touch to normalized coordinates
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;

        // Emit custom event for app to handle
        this.emitTouchEvent('touchstart', { x, y, touches: e.touches.length });
    }

    handleTouchMove(e) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) / rect.width;
        const y = (touch.clientY - rect.top) / rect.height;

        this.emitTouchEvent('touchmove', { x, y, touches: e.touches.length });
    }

    handleTouchEnd(e) {
        this.emitTouchEvent('touchend', { touches: e.touches.length });
    }

    emitTouchEvent(type, data) {
        const event = new CustomEvent('mobiletouch', {
            detail: { type, data }
        });
        this.canvas.dispatchEvent(event);
    }

    preventScrollBounce() {
        // Prevent rubber-band scrolling on iOS/Android
        document.body.addEventListener('touchmove', (e) => {
            if (e.target === document.body || e.target === this.canvas) {
                e.preventDefault();
            }
        }, { passive: false });

        // Prevent pull-to-refresh
        let lastTouchY = 0;
        let maybePreventPullToRefresh = false;

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            lastTouchY = e.touches[0].clientY;
            maybePreventPullToRefresh = window.pageYOffset === 0;
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const touchYDelta = touchY - lastTouchY;
            lastTouchY = touchY;

            if (maybePreventPullToRefresh && touchYDelta > 0) {
                e.preventDefault();
            }
        }, { passive: false });

        console.log('[MobileCompat] Scroll bounce prevention enabled');
    }

    setupOrientationHandling() {
        // Handle screen orientation changes
        const handleOrientationChange = () => {
            console.log('[MobileCompat] Orientation changed:', window.orientation);

            // Emit custom event
            const event = new CustomEvent('orientationchange', {
                detail: {
                    orientation: window.orientation,
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            });
            window.dispatchEvent(event);

            // Force canvas resize after orientation change
            setTimeout(() => {
                if (this.canvas) {
                    const resizeEvent = new Event('resize');
                    window.dispatchEvent(resizeEvent);
                }
            }, 100);
        };

        window.addEventListener('orientationchange', handleOrientationChange);

        // Also listen to resize as backup
        if (this.isMobile) {
            window.addEventListener('resize', () => {
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(handleOrientationChange, 100);
            });
        }

        console.log('[MobileCompat] Orientation handling enabled');
    }

    async setupWakeLock() {
        // Keep screen awake during performance
        if ('wakeLock' in navigator) {
            try {
                console.log('[MobileCompat] Wake Lock API available');
                this.wakeLockSupported = true;
            } catch (error) {
                console.warn('[MobileCompat] Wake Lock not supported:', error);
                this.wakeLockSupported = false;
            }
        }
    }

    async requestWakeLock() {
        if (!this.wakeLockSupported) return false;

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('[MobileCompat] Wake lock acquired');

            this.wakeLock.addEventListener('release', () => {
                console.log('[MobileCompat] Wake lock released');
            });

            return true;
        } catch (error) {
            console.error('[MobileCompat] Failed to acquire wake lock:', error);
            return false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }

    // Performance monitoring
    measureFPS() {
        const now = performance.now();
        const delta = now - this.lastFrameTime;

        this.frameCount++;

        if (delta >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / delta);
            this.frameCount = 0;
            this.lastFrameTime = now;

            // Warn if FPS is low on mobile
            if (this.isMobile && this.fps < 30) {
                console.warn('[MobileCompat] Low FPS detected:', this.fps);
            }
        }

        return this.fps;
    }

    // Get optimal settings for mobile
    getOptimalSettings() {
        if (!this.isMobile) {
            return {
                pixelRatio: window.devicePixelRatio || 1,
                fftSize: 2048,
                particleCount: 1000,
                quality: 'high'
            };
        }

        // Mobile optimizations
        return {
            pixelRatio: this.maxPixelRatio,
            fftSize: 1024,        // Smaller FFT for better performance
            particleCount: 300,    // Fewer particles
            quality: 'medium'
        };
    }

    // Battery status
    async checkBatteryStatus() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                console.log('[MobileCompat] Battery:', {
                    level: Math.round(battery.level * 100) + '%',
                    charging: battery.charging
                });

                // Suggest performance mode based on battery
                if (battery.level < 0.2 && !battery.charging) {
                    console.warn('[MobileCompat] Low battery - consider reducing quality');
                    return 'low-power';
                }

                return 'normal';
            } catch (error) {
                console.warn('[MobileCompat] Battery API not available');
            }
        }
        return 'unknown';
    }

    getInfo() {
        return {
            isMobile: this.isMobile,
            isAndroid: this.isAndroid,
            maxPixelRatio: this.maxPixelRatio,
            fps: this.fps,
            wakeLockSupported: this.wakeLockSupported,
            optimalSettings: this.getOptimalSettings()
        };
    }
}

window.MobileCompatibility = MobileCompatibility;
