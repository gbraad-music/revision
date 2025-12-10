// MIDIOutputSource - Send MIDI messages to external devices
// Use case: Audio-reactive MIDI generation from frequency analysis

class MIDIOutputSource {
    constructor() {
        this.midiAccess = null;
        this.output = null;
        this.outputId = null;
        this.channel = 0; // 0-15 (MIDI channel 1-16), or 'all' for omni
        this.isActive = false;
    }

    async initialize() {
        try {
            // Request MIDI access (no SysEx needed for output)
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            console.log('[MIDIOutput] Initialized');
            return true;
        } catch (error) {
            console.error('[MIDIOutput] Failed to initialize:', error);
            return false;
        }
    }

    getAvailableOutputs() {
        if (!this.midiAccess) return [];

        const outputs = [];
        for (const output of this.midiAccess.outputs.values()) {
            outputs.push({
                id: output.id,
                name: output.name,
                manufacturer: output.manufacturer,
                state: output.state
            });
        }
        return outputs;
    }

    connectOutput(outputId) {
        if (!this.midiAccess) {
            console.error('[MIDIOutput] Not initialized');
            return false;
        }

        this.output = this.midiAccess.outputs.get(outputId);
        if (!this.output) {
            console.error('[MIDIOutput] Output not found:', outputId);
            return false;
        }

        this.outputId = outputId;
        this.isActive = true;
        console.log('[MIDIOutput] Connected to:', this.output.name);
        return true;
    }

    disconnect() {
        if (this.output) {
            // Send all notes off on disconnect
            this.allNotesOff();
        }
        this.output = null;
        this.outputId = null;
        this.isActive = false;
        console.log('[MIDIOutput] Disconnected');
    }

    setChannel(channel) {
        // channel can be 0-15 or 'all'
        this.channel = channel;
        console.log('[MIDIOutput] Channel set to:', channel === 'all' ? 'Omni (All)' : `${parseInt(channel) + 1}`);
    }

    sendNoteOn(note, velocity, channel = null) {
        if (!this.output || !this.isActive) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            // Omni mode - send on all channels
            for (let i = 0; i < 16; i++) {
                const status = 0x90 | i; // Note On + channel
                this.output.send([status, note, velocity]);
            }
        } else {
            const status = 0x90 | ch; // Note On + channel
            this.output.send([status, note, velocity]);
        }
    }

    sendNoteOff(note, channel = null) {
        if (!this.output || !this.isActive) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            // Omni mode - send on all channels
            for (let i = 0; i < 16; i++) {
                const status = 0x80 | i; // Note Off + channel
                this.output.send([status, note, 0]);
            }
        } else {
            const status = 0x80 | ch; // Note Off + channel
            this.output.send([status, note, 0]);
        }
    }

    sendControlChange(cc, value, channel = null) {
        if (!this.output || !this.isActive) return;

        const ch = channel !== null ? channel : this.channel;

        if (ch === 'all') {
            for (let i = 0; i < 16; i++) {
                const status = 0xB0 | i; // CC + channel
                this.output.send([status, cc, value]);
            }
        } else {
            const status = 0xB0 | ch; // CC + channel
            this.output.send([status, cc, value]);
        }
    }

    allNotesOff() {
        if (!this.output || !this.isActive) return;

        // Send All Notes Off (CC 123) on all channels
        for (let i = 0; i < 16; i++) {
            const status = 0xB0 | i;
            this.output.send([status, 123, 0]); // All Notes Off
        }
        console.log('[MIDIOutput] All notes off sent');
    }
}

window.MIDIOutputSource = MIDIOutputSource;
