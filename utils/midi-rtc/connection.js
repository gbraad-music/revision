/**
 * Base MIDI-RTC Connection class
 * Platform-agnostic base class to be extended by platform-specific implementations
 */

import { Role, DATA_CHANNEL_CONFIG, ICE_CONFIG, PROTOCOL_VERSION, Capabilities } from './protocol.js';
import { encodeMIDI, decodeMIDI, encodeHandshake, encodePing, encodePong, calculateLatency, formatMIDIMessage } from './midi-codec.js';

/**
 * Base connection class
 * Extend this for browser, Node.js, Electron, or other platforms
 */
export class MIDIRTCConnection {
    constructor(role, options = {}) {
        this.role = role;
        this.options = {
            autoReconnect: options.autoReconnect !== false,
            reconnectDelay: options.reconnectDelay || 5000,
            pingInterval: options.pingInterval || 1000,
            capabilities: options.capabilities || [Capabilities.SYSEX, Capabilities.CLOCK, Capabilities.SPP],
            debug: options.debug || false,
            ...options
        };

        // Connection state
        this.peerConnection = null;
        this.dataChannel = null;
        this.connectionState = 'disconnected';
        this.remoteRole = null;
        this.remoteCapabilities = [];

        // Target subscriptions (filtering by target group)
        this.targetSubscriptions = new Map();  // target -> callback
        this.subscribedTargets = new Set();    // Set of target names
        this.trunkMode = options.trunkMode !== false;  // Default: receive all targets

        // Statistics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            latency: 0,
            lastMessageTime: 0,
            connectTime: null,
            uptime: 0
        };

        // Event handlers (to be set by user)
        this.onMIDIMessage = null;  // Trunk mode: receives all targets
        this.onConnectionStateChange = null;
        this.onError = null;
        this.onStats = null;

        // Internal state
        this.pingTimer = null;
        this.reconnectTimer = null;
    }

    /**
     * Create peer connection (platform-specific)
     * Override this in platform implementations
     */
    createPeerConnection() {
        throw new Error('createPeerConnection() must be implemented by platform-specific subclass');
    }

    /**
     * Initialize connection
     */
    async initialize() {
        this.log('Initializing MIDI-RTC connection as', this.role);

        // Create peer connection
        this.peerConnection = this.createPeerConnection();

        // Monitor connection state
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.log('Connection state:', state);
            this.handleConnectionStateChange(state);
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.log('ICE candidate:', event.candidate.candidate);
            }
        };

        // ICE gathering state
        this.peerConnection.onicegatheringstatechange = () => {
            this.log('ICE gathering state:', this.peerConnection.iceGatheringState);
        };

        // Setup data channel based on role
        if (this.role === Role.SENDER) {
            await this.setupSender();
        } else {
            await this.setupReceiver();
        }
    }

    /**
     * Setup as sender (creates data channel)
     */
    async setupSender() {
        this.log('Setting up as sender');

        // Create data channel
        this.dataChannel = this.peerConnection.createDataChannel('midi', DATA_CHANNEL_CONFIG);

        this.setupDataChannelHandlers();
    }

    /**
     * Setup as receiver (waits for data channel)
     */
    async setupReceiver() {
        this.log('Setting up as receiver');

        // Handle incoming data channel
        this.peerConnection.ondatachannel = (event) => {
            this.log('Data channel received');
            this.dataChannel = event.channel;
            this.setupDataChannelHandlers();
        };
    }

    /**
     * Setup data channel event handlers
     */
    setupDataChannelHandlers() {
        this.dataChannel.onopen = () => {
            this.log('Data channel opened');
            this.handleDataChannelOpen();
        };

        this.dataChannel.onclose = () => {
            this.log('Data channel closed');
            this.handleDataChannelClose();
        };

        this.dataChannel.onerror = (error) => {
            this.log('Data channel error:', error);
            this.handleError(error);
        };

        this.dataChannel.onmessage = (event) => {
            this.handleIncomingMessage(event.data);
        };
    }

    /**
     * Handle data channel open
     */
    handleDataChannelOpen() {
        this.connectionState = 'connected';
        this.stats.connectTime = Date.now();

        // Send handshake
        this.sendHandshake();

        // Start ping timer
        this.startPingTimer();

        this.emitEvent('connectionStateChange', 'connected');
    }

    /**
     * Handle data channel close
     */
    handleDataChannelClose() {
        this.connectionState = 'disconnected';
        this.stopPingTimer();

        this.emitEvent('connectionStateChange', 'disconnected');

        // Auto-reconnect if enabled
        if (this.options.autoReconnect) {
            this.scheduleReconnect();
        }
    }

    /**
     * Handle connection state change
     */
    handleConnectionStateChange(state) {
        this.connectionState = state;

        if (state === 'connected') {
            this.emitEvent('connectionStateChange', 'connected');
        } else if (state === 'failed' || state === 'disconnected') {
            this.emitEvent('connectionStateChange', state);
        }
    }

    /**
     * Send handshake message
     */
    sendHandshake() {
        const handshake = encodeHandshake(this.role, PROTOCOL_VERSION, this.options.capabilities);
        this.sendRaw(handshake);
        this.log('Sent handshake');
    }

    /**
     * Send MIDI message
     * @param {Uint8Array|Array} data - MIDI data bytes (MIDI channel 1-16 embedded in status byte)
     * @param {number} timestamp - MIDI timestamp
     * @param {string} target - Target group for filtering/routing (default: 'default')
     */
    sendMIDI(data, timestamp = performance.now(), target = 'default') {
        if (!this.isConnected()) {
            this.log('Cannot send MIDI - not connected');
            return false;
        }

        const sent = performance.now();
        const message = encodeMIDI(data, timestamp, sent, target);

        this.sendRaw(message);
        this.stats.messagesSent++;
        this.stats.bytesSent += message.length;
        this.stats.lastMessageTime = sent;

        return true;
    }

    /**
     * Send raw message
     */
    sendRaw(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
        } else {
            this.log('Cannot send - data channel not ready');
        }
    }

    /**
     * Handle incoming message
     */
    handleIncomingMessage(data) {
        try {
            const message = JSON.parse(data);
            const received = performance.now();

            this.stats.messagesReceived++;
            this.stats.bytesReceived += data.length;

            switch (message.type) {
                case 'midi':
                    this.handleMIDIMessage(message, received);
                    break;
                case 'ping':
                    this.handlePing(message, received);
                    break;
                case 'pong':
                    this.handlePong(message, received);
                    break;
                case 'handshake':
                    this.handleHandshake(message);
                    break;
                default:
                    this.log('Unknown message type:', message.type);
            }
        } catch (error) {
            this.log('Error parsing message:', error);
            this.handleError(error);
        }
    }

    /**
     * Handle MIDI message with target-based filtering
     */
    handleMIDIMessage(message, received) {
        // Calculate latency
        this.stats.latency = calculateLatency(message.sent, received);

        const target = message.target || 'default';

        // Check if this target should be processed
        if (!this.trunkMode && !this.subscribedTargets.has(target)) {
            // Access mode: Only process subscribed targets
            return;
        }

        const midiMessage = {
            data: new Uint8Array(message.data),
            timestamp: message.timestamp,
            target: target,
            latency: this.stats.latency
        };

        // Target-specific callback (access mode)
        if (this.targetSubscriptions.has(target)) {
            const callback = this.targetSubscriptions.get(target);
            callback(midiMessage);
        }

        // Trunk mode callback (receives all)
        if (this.trunkMode && this.onMIDIMessage) {
            this.onMIDIMessage(midiMessage);
        }

        // Debug logging
        if (this.options.debug && this.stats.messagesReceived % 100 === 0) {
            this.log(`[${target}] Latency: ${this.stats.latency.toFixed(2)}ms (${this.stats.messagesReceived} msgs)`);
        }
    }

    /**
     * Subscribe to a specific target (access mode)
     * @param {string} target - Target identifier (e.g., 'synth', 'control')
     * @param {Function} callback - Callback for MIDI messages on this target
     */
    subscribe(target, callback) {
        this.targetSubscriptions.set(target, callback);
        this.subscribedTargets.add(target);
        this.log(`Subscribed to target: ${target}`);
    }

    /**
     * Unsubscribe from a target
     * @param {string} target - Target identifier
     */
    unsubscribe(target) {
        this.targetSubscriptions.delete(target);
        this.subscribedTargets.delete(target);
        this.log(`Unsubscribed from target: ${target}`);
    }

    /**
     * Get list of subscribed targets
     */
    getSubscriptions() {
        return Array.from(this.subscribedTargets);
    }

    /**
     * Set trunk mode (receive all targets) or access mode (only subscribed)
     * @param {boolean} enabled - True for trunk mode, false for access mode
     */
    setTrunkMode(enabled) {
        this.trunkMode = enabled;
        this.log(`${enabled ? 'Trunk' : 'Access'} mode enabled`);
    }

    /**
     * Handle ping
     */
    handlePing(message, received) {
        // Send pong
        const pong = encodePong(message.sent, received);
        this.sendRaw(pong);
    }

    /**
     * Handle pong
     */
    handlePong(message, received) {
        // Calculate round-trip latency
        const latency = calculateLatency(message.sent, received);
        this.stats.latency = latency;

        if (this.options.debug) {
            this.log(`Ping latency: ${latency.toFixed(2)}ms`);
        }

        this.emitEvent('stats', this.getStats());
    }

    /**
     * Handle handshake
     */
    handleHandshake(message) {
        this.remoteRole = message.role;
        this.remoteCapabilities = message.capabilities || [];
        this.log('Received handshake from', message.role, 'with capabilities:', message.capabilities);
    }

    /**
     * Start ping timer
     */
    startPingTimer() {
        if (this.pingTimer) return;

        this.pingTimer = setInterval(() => {
            if (this.isConnected()) {
                const ping = encodePing(performance.now());
                this.sendRaw(ping);
            }
        }, this.options.pingInterval);
    }

    /**
     * Stop ping timer
     */
    stopPingTimer() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    /**
     * Schedule reconnect
     */
    scheduleReconnect() {
        if (this.reconnectTimer) return;

        this.log(`Reconnecting in ${this.options.reconnectDelay}ms...`);

        this.reconnectTimer = setTimeout(() => {
            this.log('Attempting reconnect...');
            this.reconnectTimer = null;
            // Reconnection logic depends on platform implementation
            this.emitEvent('reconnect');
        }, this.options.reconnectDelay);
    }

    /**
     * Create offer (sender initiates)
     */
    async createOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        await this.waitForICEGathering();
        return JSON.stringify(this.peerConnection.localDescription);
    }

    /**
     * Handle answer (sender receives answer from receiver)
     */
    async handleAnswer(answerJSON) {
        const answer = JSON.parse(answerJSON);
        await this.peerConnection.setRemoteDescription(answer);
        this.log('Answer processed, connection should establish');
    }

    /**
     * Handle offer (receiver processes offer from sender)
     */
    async handleOffer(offerJSON) {
        const offer = JSON.parse(offerJSON);
        await this.peerConnection.setRemoteDescription(offer);

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await this.waitForICEGathering();
        return JSON.stringify(this.peerConnection.localDescription);
    }

    /**
     * Wait for ICE gathering to complete
     */
    waitForICEGathering() {
        return new Promise((resolve) => {
            if (this.peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                this.peerConnection.addEventListener('icegatheringstatechange', () => {
                    if (this.peerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                });
            }
        });
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.dataChannel && this.dataChannel.readyState === 'open';
    }

    /**
     * Get connection statistics
     */
    getStats() {
        if (this.stats.connectTime) {
            this.stats.uptime = Date.now() - this.stats.connectTime;
        }

        return {
            ...this.stats,
            connected: this.isConnected(),
            connectionState: this.connectionState,
            role: this.role,
            remoteRole: this.remoteRole,
            remoteCapabilities: this.remoteCapabilities
        };
    }

    /**
     * Close connection
     */
    close() {
        this.stopPingTimer();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.dataChannel) {
            this.dataChannel.close();
        }

        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.connectionState = 'disconnected';
        this.log('Connection closed');
    }

    /**
     * Emit event
     */
    emitEvent(event, data) {
        const handler = this['on' + event.charAt(0).toUpperCase() + event.slice(1)];
        if (handler) {
            handler(data);
        }
    }

    /**
     * Handle error
     */
    handleError(error) {
        this.log('Error:', error);
        this.emitEvent('error', error);
    }

    /**
     * Log message
     */
    log(...args) {
        if (this.options.debug) {
            console.log('[MIDI-RTC]', `[${this.role}]`, ...args);
        }
    }
}
