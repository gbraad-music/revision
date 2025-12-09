/**
 * Screen Wake Lock Manager
 *
 * Prevents the screen from dimming or locking during VJ performances.
 * Uses the Screen Wake Lock API (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
 *
 * Browser Support:
 * - Chrome/Edge 84+
 * - Safari 16.4+
 * - Firefox: Not yet supported (as of 2024)
 */

class WakeLockManager {
    constructor() {
        this.wakeLock = null;
        this.isSupported = 'wakeLock' in navigator;
        this.isActive = false;

        // Re-acquire wake lock when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isActive) {
                this.request();
            }
        });
    }

    /**
     * Check if Wake Lock API is supported
     */
    static isSupported() {
        return 'wakeLock' in navigator;
    }

    /**
     * Request a wake lock to prevent screen from sleeping
     */
    async request() {
        if (!this.isSupported) {
            console.log('[WakeLock] Not supported in this browser');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.isActive = true;

            console.log('[WakeLock] ✓ Screen wake lock active - screen will not sleep');

            // Listen for wake lock release
            this.wakeLock.addEventListener('release', () => {
                console.log('[WakeLock] Wake lock released');
            });

            return true;

        } catch (error) {
            console.error('[WakeLock] Failed to acquire wake lock:', error);
            this.isActive = false;
            return false;
        }
    }

    /**
     * Release the wake lock (allow screen to sleep again)
     */
    async release() {
        if (this.wakeLock) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
                this.isActive = false;
                console.log('[WakeLock] Released - screen can sleep again');
                return true;
            } catch (error) {
                console.error('[WakeLock] Failed to release wake lock:', error);
                return false;
            }
        }
        return false;
    }

    /**
     * Get current wake lock status
     */
    getStatus() {
        return {
            supported: this.isSupported,
            active: this.isActive,
            locked: this.wakeLock !== null
        };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.WakeLockManager = WakeLockManager;
}
