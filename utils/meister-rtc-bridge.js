// MeisterRTC Browser Bridge - WebRTC with MIDI, Audio, and Video for Revision
// Simple wrapper that adds audio/video to MIDI-RTC functionality

import { Role, ICE_CONFIG, Target, DATA_CHANNEL_CONFIG } from './midi-rtc/protocol.js';
import { MediaType } from './meister-rtc/protocol.js';

class BrowserMeisterRTC {
    constructor(mode, options = {}) {
        this.mode = mode; // 'sender' or 'receiver'
        this.connections = new Map(); // Multi-endpoint support for sender
        this.nextEndpointId = 1;
        this.deviceRoles = new Map(); // MIDI device ID -> [targets]

        // Web MIDI API
        this.midiAccess = null;

        // WebRTC
        this.peerConnection = null;
        this.dataChannel = null;

        // Media streams
        this.audioStreams = new Map();  // target -> MediaStream
        this.videoStreams = new Map();  // target -> MediaStream

        // Callbacks
        this.onMIDIMessage = null;
        this.onActiveTargets = null;
        this.onAudioStream = null;
        this.onVideoStream = null;
        this.onConnectionStateChange = null;
        this.onControlMessage = null;  // Control messages from remote control

        console.log(`[MeisterRTC] Created ${mode} bridge (MIDI + A/V + Control)`);
    }

    /**
     * Initialize - sets up WebRTC and Web MIDI
     */
    async initialize() {
        // Initialize Web MIDI for sender
        if (this.mode === 'sender') {
            await this.initializeMIDI();
        }

        console.log('[MeisterRTC] Initialized');
        return true;
    }

    /**
     * Initialize Web MIDI API
     */
    async initializeMIDI() {
        if (!navigator.requestMIDIAccess) {
            console.warn('[MeisterRTC] Web MIDI not supported');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
            console.log('[MeisterRTC] MIDI access granted');

            this.midiAccess.onstatechange = (e) => {
                console.log('[MeisterRTC] MIDI device state change:', e.port.name, e.port.state);
            };

            return true;
        } catch (error) {
            console.error('[MeisterRTC] Failed to get MIDI access:', error);
            return false;
        }
    }

    /**
     * Get available MIDI inputs
     */
    getMIDIInputs() {
        if (!this.midiAccess) return [];
        return Array.from(this.midiAccess.inputs.values());
    }

    /**
     * Get available MIDI outputs
     */
    getMIDIOutputs() {
        if (!this.midiAccess) return [];
        return Array.from(this.midiAccess.outputs.values());
    }

    /**
     * Connect MIDI input and route to WebRTC
     * @param {string} deviceId - MIDI input device ID
     * @param {Array<string>} targets - Target tags (e.g., ['control', 'synth'])
     */
    connectMIDIInput(deviceId, targets = ['control']) {
        if (!this.midiAccess) return false;

        const input = this.midiAccess.inputs.get(deviceId);
        if (!input) return false;

        input.onmidimessage = (message) => {
            // Send to all endpoints with target tags
            this.sendMIDI(message.data, message.timeStamp, targets, input.name);
        };

        this.deviceRoles.set(deviceId, targets);
        console.log(`[MeisterRTC] Connected MIDI input: ${input.name} → targets:`, targets);
        return true;
    }

    /**
     * Connect MIDI output to receive from WebRTC
     * @param {string} deviceId - MIDI output device ID
     * @param {Array<string>} targets - Targets to receive from
     */
    connectMIDIOutput(deviceId, targets = ['control']) {
        if (!this.midiAccess) return false;

        const output = this.midiAccess.outputs.get(deviceId);
        if (!output) return false;

        this.deviceRoles.set(deviceId, targets);
        console.log(`[MeisterRTC] Connected MIDI output: ${output.name} ← targets:`, targets);
        return true;
    }

    /**
     * Send MIDI to all connected endpoints
     * @param {Uint8Array} data - MIDI message
     * @param {number} timestamp - Message timestamp
     * @param {Array<string>} roles - Target roles
     * @param {string} deviceName - Source device name
     */
    sendMIDI(data, timestamp, roles = ['control'], deviceName = '') {
        // Convert to array if needed
        const roleArray = Array.isArray(roles) ? roles : [roles];

        const message = {
            data: Array.from(data),
            timestamp: timestamp,
            sent: performance.now(),
            roles: roleArray,
            deviceName: deviceName
        };

        // Send to all endpoints
        let sentCount = 0;
        for (const [endpointId, connection] of this.connections.entries()) {
            if (connection.dataChannel?.readyState === 'open') {
                connection.dataChannel.send(JSON.stringify(message));
                sentCount++;
            }
        }

        if (sentCount === 0 && this.dataChannel?.readyState === 'open') {
            // Single connection mode (receiver)
            this.dataChannel.send(JSON.stringify(message));
        }
    }

    /**
     * Create new endpoint for sender (bridge)
     * Returns endpoint ID only (offer created separately via createOffer)
     */
    async createEndpoint(name = '') {
        const endpointId = `endpoint-${this.nextEndpointId++}`;
        const peerConnection = new RTCPeerConnection(ICE_CONFIG);

        // Create MIDI data channel (unordered, low latency)
        const dataChannel = peerConnection.createDataChannel('midi', DATA_CHANNEL_CONFIG);

        // Create Control data channel (ordered, reliable)
        const controlChannel = peerConnection.createDataChannel('control', { ordered: true });

        const connection = {
            id: endpointId,
            name: name,
            peerConnection: peerConnection,
            dataChannel: dataChannel,
            controlChannel: controlChannel,
            state: 'new',
            stats: { messagesSent: 0 }
        };

        // Handle data channel
        dataChannel.onopen = () => {
            console.log(`[MeisterRTC] Data channel opened: ${endpointId}`);
            connection.state = 'connected';

            // Send active targets
            const activeTargets = this.getActiveTargets();
            dataChannel.send(JSON.stringify({
                type: 'active_targets',
                targets: activeTargets
            }));
        };

        dataChannel.onclose = () => {
            console.log(`[MeisterRTC] Data channel closed: ${endpointId}`);
            connection.state = 'closed';
        };

        dataChannel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data, endpointId);
        };

        // Handle control channel
        controlChannel.onopen = () => {
            console.log(`[MeisterRTC] Control channel opened: ${endpointId}`);
        };

        controlChannel.onclose = () => {
            console.log(`[MeisterRTC] Control channel closed: ${endpointId}`);
        };

        controlChannel.onmessage = (event) => {
            this.handleControlMessage(event.data, endpointId);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // ICE candidate generated - will be in local description
            }
        };

        // Handle connection state
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log(`[MeisterRTC] Connection state: ${state} (endpoint: ${endpointId})`);
            connection.state = state;

            // Notify callback (extended to include endpointId for multi-endpoint support)
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(state, endpointId);
            }
        };

        // Handle incoming tracks (audio/video from receiver - bidirectional)
        peerConnection.ontrack = (event) => {
            const stream = event.streams[0];
            const track = event.track;
            console.log('[MeisterRTC] Endpoint received track:', track.kind, 'stream:', stream.id);

            // Call appropriate callback
            if (track.kind === 'audio' && this.onAudioStream) {
                this.audioStreams.set(stream.id, stream);
                this.onAudioStream(stream, 'audio-default', {});
            } else if (track.kind === 'video' && this.onVideoStream) {
                this.videoStreams.set(stream.id, stream);
                this.onVideoStream(stream, 'video-default', {});
            }
        };

        this.connections.set(endpointId, connection);

        console.log(`[MeisterRTC] Created endpoint: ${endpointId}`);
        // Return just the ID - offer will be created via createOffer()
        return endpointId;
    }

    /**
     * Create offer (compatibility method)
     * @param {string} endpointId - Optional endpoint ID, creates new if not provided
     */
    async createOffer(endpointId = null) {
        console.log('[MeisterRTC] createOffer called, endpointId:', endpointId);

        if (this.mode !== 'sender') {
            throw new Error('createOffer() only available in sender mode');
        }

        // If no endpoint ID provided, create a new endpoint
        if (!endpointId) {
            console.log('[MeisterRTC] No endpoint provided, creating new one');
            const result = await this.createEndpoint();
            return result;
        }

        // Get existing endpoint and create new offer
        const connection = this.connections.get(endpointId);
        if (!connection) {
            throw new Error(`Endpoint not found: ${endpointId}`);
        }

        console.log(`[MeisterRTC] Creating offer for ${endpointId}`);
        const offer = await connection.peerConnection.createOffer();
        await connection.peerConnection.setLocalDescription(offer);

        console.log('[MeisterRTC] Waiting for ICE gathering...');
        await this.waitForICE(connection.peerConnection);

        console.log('[MeisterRTC] Offer ready');
        return {
            endpointId,
            offer: JSON.stringify(connection.peerConnection.localDescription)
        };
    }

    /**
     * Handle answer from receiver
     */
    async handleAnswer(endpointId, answerJSON) {
        const connection = this.connections.get(endpointId);
        if (!connection) {
            throw new Error(`Endpoint not found: ${endpointId}`);
        }

        const answer = JSON.parse(answerJSON);
        await connection.peerConnection.setRemoteDescription(answer);
        console.log(`[MeisterRTC] Answer set for ${endpointId}`);
    }

    /**
     * Handle WebRTC offer (receiver mode)
     */
    async handleOffer(offerJSON) {
        const offer = JSON.parse(offerJSON);

        // Create peer connection
        this.peerConnection = new RTCPeerConnection(ICE_CONFIG);

        // Handle data channels from sender
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;

            if (channel.label === 'midi') {
                // MIDI data channel
                this.dataChannel = channel;

                this.dataChannel.onopen = () => {
                    console.log('[MeisterRTC] MIDI channel opened (receiver)');

                    // Request active targets
                    this.dataChannel.send(JSON.stringify({
                        type: 'request_targets'
                    }));
                };

                this.dataChannel.onmessage = (event) => {
                    this.handleDataChannelMessage(event.data);
                };
            } else if (channel.label === 'control') {
                // Control data channel
                this.controlChannel = channel;

                this.controlChannel.onopen = () => {
                    console.log('[MeisterRTC] Control channel opened (receiver)');
                };

                this.controlChannel.onmessage = (event) => {
                    this.handleControlMessage(event.data);
                };
            }
        };

        // Handle incoming audio/video tracks
        this.peerConnection.ontrack = (event) => {
            const stream = event.streams[0];
            const track = event.track;

            console.log('[MeisterRTC] Received track:', track.kind, 'stream:', stream.id);

            // Call appropriate callback
            if (track.kind === 'audio' && this.onAudioStream) {
                this.audioStreams.set(stream.id, stream);
                this.onAudioStream(stream, 'audio-default', {});
            } else if (track.kind === 'video' && this.onVideoStream) {
                this.videoStreams.set(stream.id, stream);
                this.onVideoStream(stream, 'video-default', {});
            }
        };

        // Set offer and create answer
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        // Wait for ICE gathering
        await this.waitForICE(this.peerConnection);

        console.log('[MeisterRTC] Created answer');
        return JSON.stringify(this.peerConnection.localDescription);
    }

    /**
     * Add audio stream to send (sender mode)
     */
    async addAudioStream(stream, target = 'audio-default') {
        if (!this.peerConnection) {
            console.error('[MeisterRTC] No peer connection - call createEndpoint first');
            return false;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            console.error('[MeisterRTC] No audio track in stream');
            return false;
        }

        this.peerConnection.addTrack(audioTrack, stream);
        this.audioStreams.set(target, stream);
        console.log(`[MeisterRTC] Added audio stream: ${target}`);
        return true;
    }

    /**
     * Add video stream to send (sender mode)
     */
    async addVideoStream(stream, target = 'video-default') {
        if (!this.peerConnection) {
            console.error('[MeisterRTC] No peer connection - call createEndpoint first');
            return false;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            console.error('[MeisterRTC] No video track in stream');
            return false;
        }

        this.peerConnection.addTrack(videoTrack, stream);
        this.videoStreams.set(target, stream);
        console.log(`[MeisterRTC] Added video stream: ${target}`);
        return true;
    }

    /**
     * Wait for ICE gathering to complete
     */
    waitForICE(peerConnection) {
        return new Promise((resolve) => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                peerConnection.addEventListener('icegatheringstatechange', function checkState() {
                    if (peerConnection.iceGatheringState === 'complete') {
                        peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                });
            }
        });
    }

    /**
     * Handle incoming data channel message
     */
    handleDataChannelMessage(data, endpointId = null) {
        try {
            const message = JSON.parse(data);

            if (message.type === 'active_targets') {
                // Receiver got active targets from sender
                if (this.onActiveTargets) {
                    this.onActiveTargets(message.targets);
                }
            } else if (message.type === 'request_targets') {
                // Sender got request for active targets
                const targets = this.getActiveTargets();
                const connection = this.connections.get(endpointId);
                if (connection?.dataChannel?.readyState === 'open') {
                    connection.dataChannel.send(JSON.stringify({
                        type: 'active_targets',
                        targets: targets
                    }));
                }
            } else if (message.data && message.roles) {
                // MIDI message
                if (this.onMIDIMessage) {
                    this.onMIDIMessage(message);
                }

                // Route to MIDI outputs (sender mode)
                if (this.mode === 'sender' && this.midiAccess) {
                    this.routeToMIDIOutputs(message);
                }
            } else if (message.type === 'media-descriptor') {
                // Media stream descriptor (for audio/video)
                this.handleMediaDescriptor(message);
            }
        } catch (error) {
            console.error('[MeisterRTC] Failed to parse message:', error);
        }
    }

    /**
     * Route MIDI message to physical outputs
     */
    routeToMIDIOutputs(message) {
        const messageRoles = message.roles || [];

        this.midiAccess.outputs.forEach((output) => {
            const deviceRoles = this.deviceRoles.get(output.id) || [];

            // Send if device has any matching role
            const hasMatchingRole = messageRoles.some(role => deviceRoles.includes(role));
            if (hasMatchingRole && output.state === 'connected') {
                try {
                    output.send(message.data);
                } catch (error) {
                    console.error(`[MeisterRTC] Failed to send to ${output.name}:`, error);
                }
            }
        });
    }

    /**
     * Get active targets from connected MIDI devices
     */
    getActiveTargets() {
        const targets = new Set();

        for (const [deviceId, roles] of this.deviceRoles.entries()) {
            roles.forEach(role => targets.add(role));
        }

        return Array.from(targets);
    }

    /**
     * Set roles for a MIDI device
     */
    setDeviceRoles(deviceId, roles) {
        console.log(`[MeisterRTC] setDeviceRoles - deviceId: ${deviceId}, roles:`, roles);
        if (!roles || roles.length === 0) {
            this.deviceRoles.delete(deviceId);
            console.log(`[MeisterRTC] Removed device ${deviceId} from deviceRoles`);
        } else {
            this.deviceRoles.set(deviceId, roles);
            console.log(`[MeisterRTC] Set device ${deviceId} to roles:`, roles);
        }
        this.setupMIDIInputs();
    }

    /**
     * Setup MIDI input handlers
     */
    setupMIDIInputs() {
        if (!this.midiAccess) return;

        this.midiAccess.inputs.forEach((input) => {
            const roles = this.deviceRoles.get(input.id);
            if (roles && roles.length > 0) {
                // Connect this input
                this.connectMIDIInput(input.id, roles);
            } else {
                // Disconnect this input
                input.onmidimessage = null;
            }
        });
    }

    /**
     * Get list of MIDI devices with their roles
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
     * Get list of endpoints
     */
    getEndpoints() {
        return Array.from(this.connections.values()).map(conn => ({
            id: conn.id,
            name: conn.name,
            state: conn.state,
            stats: conn.stats || { messagesSent: 0 }
        }));
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
                totalSent += connection.stats?.messagesSent || 0;
                if (connection.dataChannel && connection.dataChannel.readyState === 'open') {
                    connected++;
                }
            }

            return {
                messagesSent: totalSent,
                messagesReceived: 0,
                totalEndpoints: this.connections.size,
                endpoints: this.connections.size,
                connected: connected,
                audioStreams: this.audioStreams.size,
                videoStreams: this.videoStreams.size,
                byRole: {
                    control: 0,  // TODO: Track per-role stats
                    synth: 0,
                    reactive: 0
                }
            };
        } else {
            // Receiver stats
            return {
                messagesSent: 0,
                messagesReceived: 0,
                totalEndpoints: this.dataChannel ? 1 : 0,
                endpoints: this.dataChannel ? 1 : 0,
                connected: this.dataChannel?.readyState === 'open' ? 1 : 0,
                audioStreams: this.audioStreams.size,
                videoStreams: this.videoStreams.size,
                byRole: {
                    control: 0,
                    synth: 0,
                    reactive: 0
                }
            };
        }
    }

    /**
     * Handle control message
     */
    handleControlMessage(data, endpointId = null) {
        try {
            const message = JSON.parse(data);
            console.log('[MeisterRTC] Control message received:', message.command || message.type);

            // Handle setIdentity internally (from receiver to sender)
            if (message.type === 'setIdentity' && endpointId) {
                const connection = this.connections.get(endpointId);
                if (connection) {
                    connection.identity = message.identity;
                    console.log(`[MeisterRTC] Endpoint ${endpointId} identity set to:`, message.identity);
                }
                return; // Don't forward to callback
            }

            // Handle endpointInfo internally (from sender to receiver)
            if (message.type === 'endpointInfo' && !endpointId) {
                // Receiver mode - store our endpoint info
                this.endpointId = message.endpointId;
                this.endpointName = message.endpointName;
                console.log('[MeisterRTC] Endpoint info received:', this.endpointId, this.endpointName);
                // Forward to callback so app can update UI
            }

            // Forward to callback
            if (this.onControlMessage) {
                this.onControlMessage(message, endpointId);
            }
        } catch (error) {
            console.error('[MeisterRTC] Failed to parse control message:', error);
        }
    }

    /**
     * Send control message to endpoint
     */
    sendControlMessage(message, endpointId = null) {
        const data = JSON.stringify(message);

        if (endpointId) {
            // Send to specific endpoint
            const connection = this.connections.get(endpointId);
            if (connection?.controlChannel?.readyState === 'open') {
                connection.controlChannel.send(data);
                console.log('[MeisterRTC] Control message sent to', endpointId);
            }
        } else {
            // Broadcast to all endpoints
            for (const connection of this.connections.values()) {
                if (connection.controlChannel?.readyState === 'open') {
                    connection.controlChannel.send(data);
                }
            }
        }
    }

    /**
     * Close all connections
     */
    close() {
        // Close all endpoints
        for (const [id, connection] of this.connections.entries()) {
            if (connection.dataChannel) {
                connection.dataChannel.close();
            }
            if (connection.peerConnection) {
                connection.peerConnection.close();
            }
        }
        this.connections.clear();

        // Close main connection (receiver)
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Stop all media streams
        for (const stream of this.audioStreams.values()) {
            stream.getTracks().forEach(track => track.stop());
        }
        for (const stream of this.videoStreams.values()) {
            stream.getTracks().forEach(track => track.stop());
        }
        this.audioStreams.clear();
        this.videoStreams.clear();

        // Disconnect MIDI
        if (this.midiAccess) {
            this.midiAccess.inputs.forEach(input => {
                input.onmidimessage = null;
            });
        }

        console.log('[MeisterRTC] Closed');
    }
}

// Backward compatibility with MIDI-RTC
window.WebRTCMIDI = BrowserMeisterRTC;
window.MeisterRTC = BrowserMeisterRTC;
window.MIDIRTCTarget = Target;
window.MIDIRTCRole = Role;
window.MeisterRTCTarget = Target;
window.MeisterRTCMediaType = MediaType;

export { BrowserMeisterRTC, Role, Target, MediaType };
