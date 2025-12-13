// WebRTC MIDI Output - Send MIDI back to the bridge
// Wraps WebRTCMIDI to match MIDIOutputSource API

class WebRTCMIDIOutput {
    constructor(webrtcMidi) {
        this.webrtcMidi = webrtcMidi; // Reference to WebRTCMIDI instance
        this.isActive = false;
        this.outputId = null;
        this.channel = 0; // 0-15 (MIDI channel 1-16), or 'all' for omni
        this.roles = ['control']; // Default role for output messages
    }

    // Set which role(s) to tag outgoing messages with
    setRoles(roles) {
        this.roles = Array.isArray(roles) ? roles : [roles];
        console.log('[WebRTC MIDI Output] Roles set to:', this.roles);
    }

    // Extract role from WebRTC device ID (e.g., 'webrtc-control' -> 'control')
    connectOutput(outputId) {
        if (!this.webrtcMidi) {
            console.error('[WebRTC MIDI Output] WebRTC MIDI not initialized');
            return false;
        }

        // Extract role from ID (e.g., 'webrtc-control' -> 'control')
        if (outputId && outputId.startsWith('webrtc-')) {
            const role = outputId.replace('webrtc-', '');
            this.setRoles([role]);
        }

        this.outputId = outputId;
        this.isActive = true;
        console.log('[WebRTC MIDI Output] Connected to:', outputId);
        return true;
    }

    disconnect() {
        if (this.isActive) {
            // Send all notes off on disconnect
            this.allNotesOff();
        }
        this.outputId = null;
        this.isActive = false;
        console.log('[WebRTC MIDI Output] Disconnected');
    }

    setChannel(channel) {
        this.channel = channel;
        console.log('[WebRTC MIDI Output] Channel set to:', channel === 'all' ? 'Omni (All)' : `${parseInt(channel) + 1}`);
    }

    sendNoteOn(note, velocity, channel = null) {
        if (!this.isActive || !this.webrtcMidi) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            // Omni mode - send on all channels
            for (let i = 0; i < 16; i++) {
                const status = 0x90 | i; // Note On + channel
                this.webrtcMidi.sendMIDI([status, note, velocity], performance.now(), this.roles, 'Revision');
            }
        } else {
            const status = 0x90 | ch; // Note On + channel
            this.webrtcMidi.sendMIDI([status, note, velocity], performance.now(), this.roles, 'Revision');
        }
    }

    sendNoteOff(note, channel = null) {
        if (!this.isActive || !this.webrtcMidi) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            // Omni mode - send on all channels
            for (let i = 0; i < 16; i++) {
                const status = 0x80 | i; // Note Off + channel
                this.webrtcMidi.sendMIDI([status, note, 0], performance.now(), this.roles, 'Revision');
            }
        } else {
            const status = 0x80 | ch; // Note Off + channel
            this.webrtcMidi.sendMIDI([status, note, 0], performance.now(), this.roles, 'Revision');
        }
    }

    sendControlChange(cc, value, channel = null) {
        if (!this.isActive || !this.webrtcMidi) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            for (let i = 0; i < 16; i++) {
                const status = 0xB0 | i; // CC + channel
                this.webrtcMidi.sendMIDI([status, cc, value], performance.now(), this.roles, 'Revision');
            }
        } else {
            const status = 0xB0 | ch; // CC + channel
            this.webrtcMidi.sendMIDI([status, cc, value], performance.now(), this.roles, 'Revision');
        }
    }

    allNotesOff() {
        if (!this.isActive || !this.webrtcMidi) return;

        // Send All Notes Off (CC 123) on all channels
        for (let i = 0; i < 16; i++) {
            const status = 0xB0 | i;
            this.webrtcMidi.sendMIDI([status, 123, 0], performance.now(), this.roles, 'Revision');
        }
        console.log('[WebRTC MIDI Output] All notes off sent');
    }
}

window.WebRTCMIDIOutput = WebRTCMIDIOutput;
