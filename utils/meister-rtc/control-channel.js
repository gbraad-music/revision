/**
 * MeisterRTC Control Channel
 *
 * Compatible with Revision's RemoteChannel interface, but works over WebRTC
 *
 * Can be used as:
 * 1. Standalone (like RemoteChannel with BroadcastChannel)
 * 2. Over WebRTC (remote control via MeisterRTC)
 * 3. Drop-in replacement for RemoteChannel
 */

export class ControlChannel {
    constructor(channelName, options = {}) {
        this.channelName = channelName;
        this.options = options;
        this.onmessage = null;

        // Transport modes
        this.broadcastChannel = null;
        this.dataChannel = null;  // WebRTC data channel
        this.meisterRTC = null;   // MeisterRTC connection

        // Role detection (like RemoteChannel)
        this.role = this.detectRole();

        // Transport selection
        this.transportMode = options.transport || 'auto';  // 'auto', 'local', 'webrtc'

        this.initialize();
    }

    detectRole() {
        // Detect if this is program or control interface
        const path = window.location.pathname;
        if (path.includes('control.html') || this.options.role === 'control') {
            return 'control';
        }
        return 'program';
    }

    async initialize() {
        if (this.transportMode === 'local') {
            // Force local BroadcastChannel only
            this.initBroadcastChannel();
        } else if (this.transportMode === 'webrtc') {
            // Force WebRTC only
            await this.initWebRTC();
        } else {
            // Auto: Try WebRTC, fallback to BroadcastChannel
            const webrtcSuccess = await this.tryWebRTC();
            if (!webrtcSuccess) {
                this.initBroadcastChannel();
            }
        }
    }

    /**
     * Initialize BroadcastChannel (local/standalone mode)
     * Compatible with RemoteChannel's BroadcastChannel fallback
     */
    initBroadcastChannel() {
        try {
            this.broadcastChannel = new BroadcastChannel(this.channelName);

            this.broadcastChannel.onmessage = (event) => {
                if (this.onmessage) {
                    this.onmessage(event);
                }
            };

            console.log('[ControlChannel] Using BroadcastChannel (local mode)');
        } catch (error) {
            console.error('[ControlChannel] BroadcastChannel failed:', error);
        }
    }

    /**
     * Try to initialize WebRTC control channel
     * Returns true if successful, false if should fallback
     */
    async tryWebRTC() {
        try {
            // Check if MeisterRTC connection is provided
            if (this.options.meisterRTC) {
                this.meisterRTC = this.options.meisterRTC;
                return await this.initWebRTC();
            }

            // No MeisterRTC connection available
            return false;
        } catch (error) {
            console.warn('[ControlChannel] WebRTC init failed, using local fallback');
            return false;
        }
    }

    /**
     * Initialize WebRTC control channel via MeisterRTC
     */
    async initWebRTC() {
        if (!this.meisterRTC) {
            throw new Error('MeisterRTC connection required for WebRTC mode');
        }

        // Use MeisterRTC's data channel for control messages
        // Subscribe to 'control' target
        this.meisterRTC.subscribe('control', (message) => {
            // Message is MIDI or control data
            // Decode to RemoteChannel-compatible format
            this.handleWebRTCMessage(message);
        });

        // Or create dedicated control data channel
        if (this.meisterRTC.peerConnection) {
            this.dataChannel = this.meisterRTC.peerConnection.createDataChannel(
                `${this.channelName}-control`,
                { ordered: true }  // Control messages need ordering
            );

            this.dataChannel.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (this.onmessage) {
                        this.onmessage({ data });
                    }
                } catch (error) {
                    console.error('[ControlChannel] Failed to parse WebRTC message:', error);
                }
            };

            this.dataChannel.onopen = () => {
                console.log('[ControlChannel] WebRTC data channel opened');
            };
        }

        console.log('[ControlChannel] Using WebRTC (remote control mode)');
        return true;
    }

    /**
     * Handle WebRTC message and convert to RemoteChannel format
     */
    handleWebRTCMessage(message) {
        // If message is MIDI SysEx control
        if (message.data && message.data[0] === 0xF0) {
            const decoded = this.decodeSysExControl(message.data);
            if (decoded && this.onmessage) {
                this.onmessage({ data: decoded });
            }
        }
        // If message is already in control format
        else if (message.command) {
            if (this.onmessage) {
                this.onmessage({ data: message });
            }
        }
    }

    /**
     * Decode MIDI SysEx control messages
     * Format: F0 7D [command] [data...] F7
     */
    decodeSysExControl(sysex) {
        if (sysex[0] !== 0xF0 || sysex[1] !== 0x7D) {
            return null;  // Not a control SysEx
        }

        const commandByte = sysex[2];
        const data = sysex.slice(3, -1);  // Remove F0 7D and F7

        const commands = {
            0x01: 'switchMode',
            0x02: 'switchScene',
            0x03: 'streamSelect',
            0x04: 'mediaSelect',
            0x05: 'rendererSelect',
            0x10: 'blackScreen'
        };

        const modes = {
            0x01: 'builtin',
            0x02: 'threejs',
            0x03: 'video',
            0x04: 'media',
            0x05: 'stream',
            0x06: 'milkdrop'
        };

        const command = commands[commandByte];
        if (!command) return null;

        let decodedData = null;

        switch (commandByte) {
            case 0x01:  // switchMode
                decodedData = modes[data[0]] || 'builtin';
                break;
            case 0x02:  // switchScene
                decodedData = data[0];
                break;
            case 0x03:  // streamSelect
            case 0x04:  // mediaSelect
                // Decode string from bytes
                decodedData = String.fromCharCode(...data);
                break;
            case 0x10:  // blackScreen
                decodedData = null;
                break;
            default:
                decodedData = data[0];
        }

        return { command, data: decodedData };
    }

    /**
     * Encode control message to MIDI SysEx
     * Compatible with RemoteChannel's message format
     */
    encodeSysExControl(command, data) {
        const commands = {
            'switchMode': 0x01,
            'switchScene': 0x02,
            'streamSelect': 0x03,
            'mediaSelect': 0x04,
            'rendererSelect': 0x05,
            'blackScreen': 0x10
        };

        const modes = {
            'builtin': 0x01,
            'threejs': 0x02,
            'video': 0x03,
            'media': 0x04,
            'stream': 0x05,
            'milkdrop': 0x06
        };

        const commandByte = commands[command];
        if (!commandByte) {
            console.warn('[ControlChannel] Unknown command:', command);
            return null;
        }

        const sysex = [0xF0, 0x7D, commandByte];

        switch (command) {
            case 'switchMode':
                sysex.push(modes[data] || 0x01);
                break;
            case 'switchScene':
                sysex.push(data & 0x7F);
                break;
            case 'streamSelect':
            case 'mediaSelect':
                // Encode string to bytes (limit to 120 chars)
                const str = String(data).substring(0, 120);
                for (let i = 0; i < str.length; i++) {
                    sysex.push(str.charCodeAt(i) & 0x7F);
                }
                break;
            case 'blackScreen':
                // No data
                break;
            default:
                sysex.push(data & 0x7F);
        }

        sysex.push(0xF7);
        return new Uint8Array(sysex);
    }

    /**
     * Send control message
     * Compatible with RemoteChannel.postMessage()
     */
    postMessage(message) {
        // BroadcastChannel (local)
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(message);
        }

        // WebRTC data channel (dedicated control)
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(message));
        }

        // WebRTC via MIDI SysEx (integrated with MeisterRTC)
        if (this.meisterRTC && this.meisterRTC.isConnected()) {
            const sysex = this.encodeSysExControl(message.command, message.data);
            if (sysex) {
                this.meisterRTC.sendMIDI(sysex, Date.now(), 'control');
            }
        }

        if (!this.broadcastChannel && !this.dataChannel && !this.meisterRTC) {
            console.warn('[ControlChannel] No active transport - message not sent:', message);
        }
    }

    /**
     * Close all transports
     */
    close() {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }

        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        // Don't close meisterRTC as it might be used elsewhere
        this.meisterRTC = null;
    }

    /**
     * Get current transport mode
     */
    getTransportMode() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            return 'webrtc-datachannel';
        }
        if (this.meisterRTC && this.meisterRTC.isConnected()) {
            return 'webrtc-midi';
        }
        if (this.broadcastChannel) {
            return 'broadcast';
        }
        return 'none';
    }

    /**
     * Check if using remote transport
     */
    isRemote() {
        const mode = this.getTransportMode();
        return mode.startsWith('webrtc');
    }
}

/**
 * Helper: Create control channel compatible with RemoteChannel
 * Drop-in replacement for Revision's RemoteChannel
 */
export function createControlChannel(channelName, options = {}) {
    // If standalone mode (no MeisterRTC), behave like RemoteChannel
    if (!options.meisterRTC && !options.transport) {
        options.transport = 'local';
    }

    return new ControlChannel(channelName, options);
}
