/**
 * Remote Channel - Multi-transport control channel
 * Supports: WebRTC data channel > WebSocket > BroadcastChannel
 * Enables communication between index.html and control.html
 *
 * Priority: WebRTC (remote over existing connection) > WebSocket (remote with server) > BroadcastChannel (local only)
 */

class RemoteChannel {
    constructor(channelName, options = {}) {
        this.channelName = channelName;
        this.role = null; // 'program' or 'control'
        this.onmessage = null;

        // Transport options
        this.ws = null;
        this.fallbackChannel = null;
        this.webrtcDataChannel = null;  // WebRTC data channel for control
        this.meisterRTC = options.meisterRTC || null;  // MeisterRTC connection

        this.reconnectInterval = 2000;
        this.reconnectTimer = null;
        this.hasLoggedFallback = false;

        // Auto-detect role from URL
        this.detectRole();

        // Try transports in order: WebRTC > WebSocket > BroadcastChannel
        if (this.meisterRTC) {
            this.initWebRTCDataChannel();
        } else {
            // Try WebSocket first, fallback to BroadcastChannel if no server
            this.initWebSocket();
        }
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

    /**
     * Initialize WebRTC data channel for control messages
     */
    initWebRTCDataChannel() {
        if (!this.meisterRTC) return;

        console.log('[RemoteChannel] Setting up WebRTC data channel control');

        // Create or listen for dedicated control data channel
        if (this.meisterRTC.peerConnection) {
            // If sender (bridge), create control channel
            if (this.meisterRTC.mode === 'sender') {
                this.webrtcDataChannel = this.meisterRTC.peerConnection.createDataChannel(
                    `${this.channelName}-control`,
                    { ordered: true }  // Control needs ordering
                );
                this.setupWebRTCDataChannel();
            }
            // If receiver (Revision), listen for channel
            else {
                this.meisterRTC.peerConnection.addEventListener('datachannel', (event) => {
                    if (event.channel.label === `${this.channelName}-control`) {
                        this.webrtcDataChannel = event.channel;
                        this.setupWebRTCDataChannel();
                    }
                });
            }
        }

        // Fallback to WebSocket if WebRTC not ready
        if (!this.webrtcDataChannel) {
            this.initWebSocket();
        }
    }

    /**
     * Setup WebRTC data channel event handlers
     */
    setupWebRTCDataChannel() {
        if (!this.webrtcDataChannel) return;

        this.webrtcDataChannel.onopen = () => {
            console.log('[RemoteChannel] WebRTC data channel opened - remote mode active');

            // Disable WebSocket and BroadcastChannel
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
            if (this.fallbackChannel) {
                this.fallbackChannel.close();
                this.fallbackChannel = null;
            }
        };

        this.webrtcDataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onmessage) {
                    this.onmessage({ data });
                }
            } catch (error) {
                console.error('[RemoteChannel] Failed to parse WebRTC message:', error);
            }
        };

        this.webrtcDataChannel.onclose = () => {
            console.log('[RemoteChannel] WebRTC data channel closed');
            this.webrtcDataChannel = null;
            // Fallback to WebSocket/BroadcastChannel
            this.initWebSocket();
        };

        this.webrtcDataChannel.onerror = (error) => {
            console.error('[RemoteChannel] WebRTC data channel error:', error);
        };
    }

    fallbackToBroadcastChannel() {
        // Only create fallback if WebSocket failed and we don't already have one
        if (this.fallbackChannel || this.ws || this.webrtcDataChannel) return;

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
        // Try WebRTC data channel first (highest priority)
        if (this.webrtcDataChannel && this.webrtcDataChannel.readyState === 'open') {
            this.webrtcDataChannel.send(JSON.stringify(message));
        }
        // Try WebSocket second
        else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

    /**
     * Get current transport mode
     */
    getTransportMode() {
        if (this.webrtcDataChannel && this.webrtcDataChannel.readyState === 'open') {
            return 'webrtc';
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return 'websocket';
        }
        if (this.fallbackChannel) {
            return 'broadcast';
        }
        return 'none';
    }

    close() {
        if (this.webrtcDataChannel) {
            this.webrtcDataChannel.close();
            this.webrtcDataChannel = null;
        }
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
        // Don't close meisterRTC - it's managed externally
        this.meisterRTC = null;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.RemoteChannel = RemoteChannel;
}
