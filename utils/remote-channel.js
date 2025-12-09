/**
 * Remote Channel - WebSocket-based replacement for BroadcastChannel
 * Enables communication between index.html and control.html across different devices
 *
 * Falls back to BroadcastChannel for local-only usage
 */

class RemoteChannel {
    constructor(channelName) {
        this.channelName = channelName;
        this.role = null; // 'program' or 'control'
        this.onmessage = null;
        this.ws = null;
        this.fallbackChannel = null;
        this.reconnectInterval = 2000;
        this.reconnectTimer = null;
        this.hasLoggedFallback = false;

        // Auto-detect role from URL
        this.detectRole();

        // Try WebSocket first, fallback to BroadcastChannel if no server
        this.initWebSocket();
    }

    detectRole() {
        // Detect if this is index.html (program) or control.html (control)
        const path = window.location.pathname;
        if (path.includes('control.html')) {
            this.role = 'control';
        } else {
            this.role = 'program';
        }
        console.log(`[RemoteChannel] Detected role: ${this.role}`);
    }

    initWebSocket() {
        try {
            // Construct WebSocket URL from current location
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            // Skip WebSocket if using file:// protocol
            if (window.location.protocol === 'file:') {
                console.log('[RemoteChannel] File protocol detected - using BroadcastChannel only');
                this.fallbackToBroadcastChannel();
                return;
            }

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[RemoteChannel] WebSocket connected - remote mode active');

                // Register with server
                this.ws.send(JSON.stringify({
                    type: 'register',
                    role: this.role
                }));

                // Stop reconnection attempts
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }

                // Disable fallback channel
                if (this.fallbackChannel) {
                    console.log('[RemoteChannel] WebSocket active - disabling BroadcastChannel fallback');
                    this.fallbackChannel.close();
                    this.fallbackChannel = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Trigger onmessage handler like BroadcastChannel
                    if (this.onmessage) {
                        this.onmessage({ data });
                    }
                } catch (error) {
                    console.error('[RemoteChannel] Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onerror = () => {
                // Silently fail - this is expected when no server is running
                this.fallbackToBroadcastChannel();
            };

            this.ws.onclose = () => {
                this.ws = null;
                this.fallbackToBroadcastChannel();
                // Don't attempt reconnection - if server appears later, page will reload anyway
            };

        } catch (error) {
            // Silently fail and use BroadcastChannel
            this.fallbackToBroadcastChannel();
        }
    }

    scheduleReconnect() {
        // Disabled - no auto-reconnection
        // If server becomes available, user will refresh page anyway
        return;
    }

    fallbackToBroadcastChannel() {
        // Only create fallback if WebSocket failed and we don't already have one
        if (this.fallbackChannel || this.ws) return;

        try {
            if (!this.hasLoggedFallback) {
                console.log('[RemoteChannel] Using BroadcastChannel (local-only mode)');
                this.hasLoggedFallback = true;
            }
            this.fallbackChannel = new BroadcastChannel(this.channelName);

            // Forward messages from BroadcastChannel to our onmessage handler
            this.fallbackChannel.onmessage = (event) => {
                if (this.onmessage) {
                    this.onmessage(event);
                }
            };
        } catch (error) {
            console.error('[RemoteChannel] BroadcastChannel also failed:', error);
        }
    }

    postMessage(message) {
        // Try WebSocket first
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
        // Fallback to BroadcastChannel
        else if (this.fallbackChannel) {
            this.fallbackChannel.postMessage(message);
        }
        else {
            console.warn('[RemoteChannel] No active channel - message not sent:', message);
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.fallbackChannel) {
            this.fallbackChannel.close();
            this.fallbackChannel = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.RemoteChannel = RemoteChannel;
}
