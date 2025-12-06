// OSC Client - WebSocket-based OSC for external control
class OSCClient {
    constructor() {
        this.ws = null;
        this.serverUrl = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;

        this.listeners = new Map();
    }

    connect(serverUrl) {
        if (!serverUrl) {
            console.log('[OSC] No server URL provided');
            return false;
        }

        this.serverUrl = serverUrl;

        try {
            console.log('[OSC] Connecting to:', serverUrl);

            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                console.log('[OSC] Connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onerror = (error) => {
                console.error('[OSC] WebSocket error:', error);
                this.emit('error', error);
            };

            this.ws.onclose = () => {
                console.log('[OSC] Connection closed');
                this.isConnected = false;
                this.emit('disconnected');

                // Auto-reconnect
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`[OSC] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    setTimeout(() => this.connect(this.serverUrl), this.reconnectDelay);
                }
            };

            return true;
        } catch (error) {
            console.error('[OSC] Failed to connect:', error);
            return false;
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    handleMessage(data) {
        try {
            // Parse OSC message (assumes JSON-formatted OSC over WebSocket)
            const message = JSON.parse(data);

            if (message.address && message.args !== undefined) {
                console.log('[OSC] Received:', message.address, message.args);
                this.emit('message', message);

                // Emit specific address listeners
                this.emit(message.address, message.args);
            }
        } catch (error) {
            console.error('[OSC] Failed to parse message:', error);
        }
    }

    send(address, ...args) {
        if (!this.isConnected || !this.ws) {
            console.warn('[OSC] Not connected, cannot send:', address);
            return false;
        }

        try {
            const message = {
                address: address,
                args: args
            };

            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('[OSC] Failed to send:', error);
            return false;
        }
    }

    // Event Emitter
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => callback(data));
    }

    getConnectionStatus() {
        return this.isConnected;
    }
}

window.OSCClient = OSCClient;
