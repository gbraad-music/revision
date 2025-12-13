/**
 * Browser WebRTC MIDI Bridge
 * Multi-endpoint MIDI over WebRTC using midi-rtc protocol
 */

import { Role, ICE_CONFIG, Target, DATA_CHANNEL_CONFIG } from './midi-rtc/protocol.js';

class BrowserMIDIRTC {
    constructor(mode, options = {}) {
        this.mode = mode; // 'sender' or 'receiver'
        this.role = mode === 'sender' ? Role.SENDER : Role.RECEIVER;
        this.options = options;

        // Multi-endpoint support (sender mode)
        this.connections = new Map(); // endpointId -> { peerConnection, dataChannel, stats, state, name }
        this.nextEndpointId = 1;

        // Web MIDI API
        this.midiAccess = null;
        this.deviceRoles = new Map(); // device ID -> [targets]

        // Callbacks
        this.onMIDIMessage = null;
        this.onConnectionStateChange = null;
        this.onActiveTargets = null;
        this.onControlMessage = null;
        this.onError = null;

        // Global stats (aggregates all connections in sender mode)
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            latency: 0,
            lastMessageTime: 0,
            byRole: {}
        };
    }

    /**
     * Initialize with Web MIDI API
     */
    async initialize() {
        // Request MIDI access for sender mode
        if (this.role === Role.SENDER) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
                this.setupMIDIInputs();
                this.log('MIDI access granted');
            } catch (error) {
                this.error('MIDI access denied:', error);
                throw error;
            }
        }
    }

    /**
     * Create new endpoint connection (sender mode)
     */
    async createEndpoint(name = '') {
        if (this.mode !== 'sender') {
            throw new Error('createEndpoint() only available in sender mode');
        }

        const endpointId = `endpoint-${this.nextEndpointId++}`;
        const displayName = name || `Program ${this.nextEndpointId - 1}`;

        // Create peer connection
        const peerConnection = new RTCPeerConnection(ICE_CONFIG);

        // Monitor connection state
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            const connection = this.connections.get(endpointId);
            if (connection) {
                connection.state = state;
            }
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(state, endpointId);
            }
        };

        // Create MIDI data channel (unordered, low latency)
        const dataChannel = peerConnection.createDataChannel('midi', DATA_CHANNEL_CONFIG);

        dataChannel.onopen = () => {
            // Send active targets to receiver immediately
            const activeTargets = this.getActiveTargets();
            console.log(`[MIDI-RTC] [${endpointId}] Data channel opened, sending active targets:`, activeTargets);
            dataChannel.send(JSON.stringify({
                type: 'active_targets',
                targets: activeTargets
            }));
        };

        dataChannel.onmessage = (event) => {
            this.handleIncomingMessage(event.data);
        };

        // Create Control data channel (ordered, reliable) for control messages
        const controlChannel = peerConnection.createDataChannel('control', { ordered: true });

        controlChannel.onopen = () => {
            console.log(`[MIDI-RTC] [${endpointId}] Control channel opened`);
        };

        // Store connection
        this.connections.set(endpointId, {
            name: displayName,
            peerConnection,
            dataChannel,
            controlChannel,
            state: 'new',
            stats: {
                messagesSent: 0,
                byRole: {}
            }
        });

        return endpointId;
    }

    /**
     * Remove endpoint connection
     */
    removeEndpoint(endpointId) {
        const connection = this.connections.get(endpointId);
        if (!connection) {
            return false;
        }

        if (connection.dataChannel) {
            connection.dataChannel.close();
        }
        if (connection.peerConnection) {
            connection.peerConnection.close();
        }

        this.connections.delete(endpointId);
        return true;
    }

    /**
     * Get list of all endpoints
     */
    getEndpoints() {
        return Array.from(this.connections.entries()).map(([id, conn]) => ({
            id,
            name: conn.name,
            state: conn.state,
            stats: conn.stats
        }));
    }

    /**
     * Get active targets from device assignments
     */
    getActiveTargets() {
        const targets = new Set();
        for (const roleArray of this.deviceRoles.values()) {
            roleArray.forEach(role => targets.add(role));
        }
        return Array.from(targets);
    }

    /**
     * Setup MIDI input listeners (sender mode)
     */
    setupMIDIInputs() {
        if (!this.midiAccess || this.role !== Role.SENDER) return;

        console.log('[MIDI-RTC] Setting up MIDI inputs...');
        this.midiAccess.inputs.forEach((input) => {
            const roles = this.deviceRoles.get(input.id) || [];
            console.log(`[MIDI-RTC] Input: ${input.name} (${input.id}) -> roles:`, roles);

            if (roles.length > 0) {
                input.onmidimessage = (message) => {
                    console.log(`[MIDI-RTC] MIDI from ${input.name}, sending with roles:`, roles);
                    this.sendMIDI(message.data, message.timeStamp, roles, input.name);
                };
            } else {
                input.onmidimessage = null;
            }
        });

        // Handle device changes
        this.midiAccess.onstatechange = (e) => {
            if (e.port.state === 'connected' && e.port.type === 'input') {
                const roles = this.deviceRoles.get(e.port.id) || [];
                if (roles.length > 0) {
                    e.port.onmidimessage = (message) => {
                        this.sendMIDI(message.data, message.timeStamp, roles, e.port.name);
                    };
                }
            }
        };
    }

    /**
     * Set device roles/targets
     */
    setDeviceRoles(deviceId, roles) {
        console.log(`[MIDI-RTC] setDeviceRoles called - deviceId: ${deviceId}, roles:`, roles);
        if (!roles || roles.length === 0) {
            this.deviceRoles.delete(deviceId);
            console.log(`[MIDI-RTC] Removed device ${deviceId} from deviceRoles`);
        } else {
            this.deviceRoles.set(deviceId, roles);
            console.log(`[MIDI-RTC] Set device ${deviceId} to roles:`, roles);
        }
        console.log('[MIDI-RTC] Current deviceRoles map:', Array.from(this.deviceRoles.entries()));
        this.setupMIDIInputs();
    }

    /**
     * Get devices with their roles
     */
    getDevices() {
        if (!this.midiAccess) return [];

        return Array.from(this.midiAccess.inputs.values()).map(input => ({
            id: input.id,
            name: input.name,
            manufacturer: input.manufacturer,
            roles: this.deviceRoles.get(input.id) || []
        }));
    }

    /**
     * Send MIDI message to all connected endpoints (sender mode)
     */
    sendMIDI(data, timestamp = performance.now(), roles = ['control'], deviceName = 'Unknown') {
        // Normalize roles to array
        const roleArray = Array.isArray(roles) ? roles : [roles];

        // Package MIDI message
        const message = {
            data: Array.from(data),
            timestamp: timestamp,
            sent: performance.now(),
            roles: roleArray,
            deviceName: deviceName || (this.mode === 'receiver' ? 'Revision' : 'Unknown')
        };

        const messageJSON = JSON.stringify(message);
        let sentCount = 0;

        console.log(`[MIDI-RTC] Sending MIDI (${this.connections.size} endpoints):`, roleArray, Array.from(data));

        // Send to ALL connected endpoints
        for (const [endpointId, connection] of this.connections.entries()) {
            console.log(`[MIDI-RTC] [${endpointId}] Channel state:`, connection.dataChannel?.readyState);
            if (connection.dataChannel && connection.dataChannel.readyState === 'open') {
                try {
                    connection.dataChannel.send(messageJSON);

                    // Update stats
                    if (!connection.stats.messagesSent) connection.stats.messagesSent = 0;
                    connection.stats.messagesSent++;

                    roleArray.forEach(role => {
                        if (connection.stats.byRole[role] === undefined) {
                            connection.stats.byRole[role] = 0;
                        }
                        connection.stats.byRole[role]++;
                    });

                    sentCount++;
                    console.log(`[MIDI-RTC] [${endpointId}] Sent successfully`);
                } catch (error) {
                    console.error(`[MIDI-RTC] [${endpointId}] Send error:`, error);
                }
            }
        }

        if (sentCount === 0) {
            console.warn('[MIDI-RTC] No endpoints available to send MIDI!');
        }

        if (sentCount > 0) {
            // Update global stats
            this.stats.messagesSent++;
            roleArray.forEach(role => {
                if (this.stats.byRole[role] === undefined) {
                    this.stats.byRole[role] = 0;
                }
                this.stats.byRole[role]++;
            });
            this.stats.lastMessageTime = performance.now();
        }
    }

    /**
     * Send any JSON message
     */
    sendMessage(message) {
        const messageJSON = JSON.stringify(message);
        let sentCount = 0;

        for (const [endpointId, connection] of this.connections.entries()) {
            if (connection.dataChannel && connection.dataChannel.readyState === 'open') {
                try {
                    connection.dataChannel.send(messageJSON);
                    sentCount++;
                } catch (error) {
                    console.error(`[MIDI-RTC] [${endpointId}] Send error:`, error);
                }
            }
        }
        return sentCount > 0;
    }

    /**
     * Handle incoming message
     */
    handleIncomingMessage(data) {
        try {
            const message = JSON.parse(data);

            // Handle active targets request
            if (message.type === 'request_targets' && this.mode === 'sender') {
                const activeTargets = this.getActiveTargets();
                console.log('[MIDI-RTC] Received request_targets, sending:', activeTargets);
                this.sendMessage({
                    type: 'active_targets',
                    targets: activeTargets
                });
                return;
            }

            // Handle active targets announcement
            if (message.type === 'active_targets') {
                console.log('[MIDI-RTC] Received active_targets:', message.targets);
                if (this.onActiveTargets) {
                    console.log('[MIDI-RTC] Calling onActiveTargets callback');
                    this.onActiveTargets(message.targets);
                } else {
                    console.warn('[MIDI-RTC] No onActiveTargets callback set!');
                }
                return;
            }

            // Handle MIDI messages (receiver mode)
            if (message.data) {
                const received = performance.now();
                this.stats.latency = received - message.sent;
                this.stats.messagesReceived++;

                const roles = message.roles || (message.role ? [message.role] : ['control']);

                // Track stats by role
                roles.forEach(role => {
                    if (this.stats.byRole[role] === undefined) {
                        this.stats.byRole[role] = 0;
                    }
                    this.stats.byRole[role]++;
                });

                if (this.onMIDIMessage) {
                    this.onMIDIMessage({
                        data: new Uint8Array(message.data),
                        timestamp: message.timestamp,
                        latency: this.stats.latency,
                        roles: roles,
                        deviceName: message.deviceName || 'Unknown'
                    });
                }
            }
        } catch (error) {
            console.error('[MIDI-RTC] Parse error:', error);
        }
    }

    /**
     * Create offer for specific endpoint (sender mode)
     */
    async createOffer(endpointId = null) {
        console.log('[MIDI-RTC] createOffer called, endpointId:', endpointId);

        if (this.mode !== 'sender') {
            throw new Error('createOffer() only available in sender mode');
        }

        // If no endpoint ID provided, create a new endpoint
        if (!endpointId) {
            console.log('[MIDI-RTC] No endpoint provided, creating new one');
            endpointId = await this.createEndpoint();
        }

        const connection = this.connections.get(endpointId);
        if (!connection) {
            throw new Error(`Endpoint not found: ${endpointId}`);
        }

        console.log(`[MIDI-RTC] Creating offer for ${endpointId}`);
        const offer = await connection.peerConnection.createOffer();
        await connection.peerConnection.setLocalDescription(offer);

        console.log('[MIDI-RTC] Waiting for ICE gathering...');
        // Wait for ICE gathering
        await this.waitForICEGathering(connection.peerConnection);

        console.log('[MIDI-RTC] Offer ready');
        return {
            endpointId,
            offer: JSON.stringify(connection.peerConnection.localDescription)
        };
    }

    /**
     * Handle answer from receiver for specific endpoint (sender mode)
     */
    async handleAnswer(endpointId, answerJSON) {
        console.log(`[MIDI-RTC] handleAnswer called for ${endpointId}`);
        console.log('[MIDI-RTC] Mode:', this.mode);
        console.log('[MIDI-RTC] Connections:', Array.from(this.connections.keys()));

        if (this.mode !== 'sender') {
            throw new Error('handleAnswer() only available in sender mode');
        }

        const connection = this.connections.get(endpointId);
        if (!connection) {
            console.error(`[MIDI-RTC] Endpoint ${endpointId} not found!`);
            console.error('[MIDI-RTC] Available endpoints:', Array.from(this.connections.keys()));
            throw new Error(`Endpoint not found: ${endpointId}`);
        }

        console.log('[MIDI-RTC] Parsing answer JSON...');
        const answer = JSON.parse(answerJSON);
        console.log('[MIDI-RTC] Setting remote description...');
        await connection.peerConnection.setRemoteDescription(answer);
        console.log('[MIDI-RTC] Answer processed successfully, connection should establish');
    }

    /**
     * Handle offer from sender (receiver mode)
     */
    async handleOffer(offerJSON) {
        if (this.mode !== 'receiver') {
            throw new Error('handleOffer() only available in receiver mode');
        }

        // Create peer connection
        const peerConnection = new RTCPeerConnection(ICE_CONFIG);

        // Monitor connection state
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(state);
            }
        };

        // Handle incoming data channels (both MIDI and control)
        peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            console.log('[MIDI-RTC] Receiver: Data channel received:', channel.label);

            if (channel.label === 'midi') {
                // MIDI data channel
                channel.onopen = () => {
                    console.log('[MIDI-RTC] Receiver: MIDI channel opened, requesting active targets');
                    // Request active targets from bridge
                    channel.send(JSON.stringify({ type: 'request_targets' }));
                };

                channel.onmessage = (event) => {
                    this.handleIncomingMessage(event.data);
                };

                // Store or update connection with MIDI channel
                const existingConn = this.connections.get('bridge');
                if (existingConn) {
                    existingConn.dataChannel = channel;
                } else {
                    this.connections.set('bridge', {
                        name: 'MIDI Bridge',
                        peerConnection,
                        dataChannel: channel,
                        controlChannel: null,
                        state: 'connected',
                        stats: {
                            messagesReceived: 0,
                            byRole: {}
                        }
                    });
                }
            } else if (channel.label === 'control') {
                // Control data channel
                channel.onopen = () => {
                    console.log('[MIDI-RTC] Receiver: Control channel opened');
                };

                channel.onmessage = (event) => {
                    // Parse and forward control messages to app
                    try {
                        const message = JSON.parse(event.data);
                        console.log('[MIDI-RTC] Receiver: Control message received:', message);

                        // Handle endpointInfo message internally
                        if (message.type === 'endpointInfo') {
                            this.endpointId = message.endpointId;
                            this.endpointName = message.endpointName;
                            console.log('[MIDI-RTC] Endpoint info received:', this.endpointId, this.endpointName);
                            // Also forward to app via callback
                        }

                        if (this.onControlMessage) {
                            this.onControlMessage(message, 'bridge');
                        }
                    } catch (error) {
                        console.error('[MIDI-RTC] Error parsing control message:', error);
                    }
                };

                // Store or update connection with control channel
                const existingConn = this.connections.get('bridge');
                if (existingConn) {
                    existingConn.controlChannel = channel;
                } else {
                    this.connections.set('bridge', {
                        name: 'MIDI Bridge',
                        peerConnection,
                        dataChannel: null,
                        controlChannel: channel,
                        state: 'connected',
                        stats: {
                            messagesReceived: 0,
                            byRole: {}
                        }
                    });
                }
            }
        };

        const offer = JSON.parse(offerJSON);
        await peerConnection.setRemoteDescription(offer);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Wait for ICE gathering
        await this.waitForICEGathering(peerConnection);

        return JSON.stringify(peerConnection.localDescription);
    }

    /**
     * Wait for ICE gathering to complete
     */
    waitForICEGathering(peerConnection) {
        return new Promise((resolve) => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                peerConnection.addEventListener('icegatheringstatechange', () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                });
            }
        });
    }

    /**
     * Get connection statistics
     */
    getStats() {
        if (this.mode === 'sender') {
            // Aggregate stats from all endpoints
            let totalSent = 0;
            let connected = 0;

            for (const connection of this.connections.values()) {
                totalSent += connection.stats.messagesSent || 0;
                if (connection.dataChannel && connection.dataChannel.readyState === 'open') {
                    connected++;
                }
            }

            return {
                ...this.stats,
                messagesSent: totalSent,
                connected: connected,
                totalEndpoints: this.connections.size
            };
        } else {
            // Receiver mode - single connection stats
            return {
                ...this.stats,
                connected: this.connections.size > 0 ? 1 : 0
            };
        }
    }

    /**
     * Close connection
     */
    close() {
        for (const [endpointId, connection] of this.connections.entries()) {
            if (connection.dataChannel) {
                connection.dataChannel.close();
            }
            if (connection.peerConnection) {
                connection.peerConnection.close();
            }
        }
        this.connections.clear();
    }

    /**
     * Get control channel (for receiver mode)
     */
    get controlChannel() {
        const conn = this.connections.get('bridge');
        return conn?.controlChannel || null;
    }

    /**
     * Logging
     */
    log(...args) {
        if (this.options.debug) {
            console.log('[MIDI-RTC]', ...args);
        }
    }

    error(...args) {
        console.error('[MIDI-RTC]', ...args);
        if (this.onError) {
            this.onError(new Error(args.join(' ')));
        }
    }
}

// Export as global WebRTCMIDI for backward compatibility
window.WebRTCMIDI = BrowserMIDIRTC;
window.MIDIRTCTarget = Target;
window.MIDIRTCRole = Role;

export { BrowserMIDIRTC as default, BrowserMIDIRTC, Target, Role };
