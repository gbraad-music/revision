// WebRTCMIDISource - Virtual MIDI device from WebRTC connection
// Appears in Revision's MIDI device dropdowns when connected
// Delegates MIDI parsing to existing MIDIInputSource to avoid code duplication

class WebRTCMIDISource {
    constructor() {
        this.listeners = new Map();
        this.isActive = false;
        this.lastMessage = null;
        this.roleFilter = 'all'; // Which role to accept: 'control', 'synth', 'reactive', or 'all'

        // CRITICAL: Use existing MIDI parser instead of duplicating logic!
        // This ensures SPP, BPM, Clock handling is identical to physical MIDI
        this.midiParser = new MIDIInputSource();

        // Forward all events from parser to our listeners
        this.midiParser.on('*', (event) => {
            if (event.type === 'transport' && event.data.state === 'bpm') {
                console.log('[WebRTCMIDISource] ✓ BPM EVENT RECEIVED from parser, forwarding:', event.data.bpm, 'source:', event.data.source);
            }
            this.emit('*', event);
        });

        console.log('[WebRTCMIDISource] Created (using MIDIInputSource parser)');
    }

    /**
     * Set which role to accept messages from
     * @param {string} role - 'control', 'synth', 'reactive', or 'all'
     */
    setRoleFilter(role) {
        this.roleFilter = role;
        console.log(`[WebRTCMIDISource] Role filter set to: ${role}`);
    }

    /**
     * Initialize (called when WebRTC MIDI connects)
     * @param {boolean} enableSysEx - Ignored for WebRTC (compatibility parameter)
     */
    initialize(enableSysEx = false) {
        this.isActive = true;
        console.log('[WebRTCMIDISource] Initialized');
        this.emit('*', { type: 'initialized', data: {} });
        return Promise.resolve(true); // Return promise for compatibility
    }

    /**
     * Connect to input (no-op for WebRTC - already connected)
     * @param {string} deviceId - Ignored (compatibility method)
     */
    connectInput(deviceId) {
        console.log(`[WebRTCMIDISource] connectInput called (no-op for WebRTC)`);
        return true;
    }

    /**
     * Get virtual device info (appears in dropdowns)
     */
    getDeviceInfo() {
        return {
            id: 'webrtc-midi',
            name: 'WebRTC MIDI',
            manufacturer: 'Network',
            state: 'connected'
        };
    }

    /**
     * Handle incoming MIDI message from WebRTC
     * Called by app.js when WebRTC MIDI is received
     * DELEGATES to existing MIDIInputSource parser
     * @param {Object} message - MIDI message with data and timeStamp
     * @param {Array<string>} roles - Roles this message is tagged with
     */
    handleMIDIMessage(message, roles = ['control']) {
        if (!this.isActive) return;

        // Filter by role: only process if roleFilter is 'all' OR roles includes roleFilter
        if (this.roleFilter !== 'all' && !roles.includes(this.roleFilter)) {
            return; // Ignore message - doesn't match our role filter
        }

        const status = message.data[0];
        const isSPP = status === 0xF2;

        if (isSPP) {
            console.log('[WebRTCMIDISource] SPP MESSAGE RECEIVED - passing to parser');
            console.log('  roleFilter:', this.roleFilter);
            console.log('  message roles:', roles);
            console.log('  SPP data:', Array.from(message.data));
        }

        this.lastMessage = message;

        // CRITICAL: Feed message to existing MIDI parser
        // This ensures SPP/BPM/Clock handling is identical to physical MIDI
        this.midiParser.handleMIDIMessage(message);

        if (isSPP) {
            console.log('[WebRTCMIDISource] SPP passed to midiParser');
        }
    }

    /**
     * Disconnect/cleanup
     */
    disconnect() {
        this.isActive = false;
        this.emit('*', { type: 'disconnected', data: {} });
        console.log('[WebRTCMIDISource] Disconnected');
    }

    /**
     * Event emitter implementation
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        // Emit to specific event listeners
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }

        // Emit to wildcard listeners
        if (event !== '*' && this.listeners.has('*')) {
            this.listeners.get('*').forEach(callback => callback(data));
        }
    }

    /**
     * Get current BPM (delegate to parser)
     */
    getBPM() {
        return this.midiParser.getBPM();
    }

    /**
     * Get playing state (delegate to parser)
     */
    getPlayingState() {
        return this.midiParser.getIsPlaying();
    }

    /**
     * Get song position (delegate to parser)
     */
    getSongPosition() {
        return this.midiParser.getSongPosition();
    }
}
