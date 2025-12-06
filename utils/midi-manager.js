// MIDI Manager with SPP (Song Position Pointer) Support
// Based on Meister MIDI infrastructure

class MIDIManager {
    constructor() {
        this.midiAccess = null;
        this.currentInput = null;
        this.listeners = new Map();

        // MIDI Clock and SPP tracking
        this.bpm = 120;
        this.isPlaying = false;
        this.clockCounter = 0;
        this.lastClockTime = 0;
        this.songPosition = 0; // In 16th notes

        // SPP-based BPM calculation
        this.lastSPPPosition = 0;
        this.lastSPPTime = 0;
        this.sppBPMSamples = [];

        // Callbacks
        this.onBPMChange = null;
        this.onPlayStateChange = null;
        this.onSongPositionChange = null;
        this.onConnectionChange = null;
    }

    async initialize() {
        try {
            if (!navigator.requestMIDIAccess) {
                console.error('[MIDI] Web MIDI API not supported');
                return false;
            }

            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

            // Listen for device connection changes
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e);

            console.log('[MIDI] MIDI Access initialized');
            return true;
        } catch (error) {
            console.error('[MIDI] Failed to initialize:', error);
            return false;
        }
    }

    getInputs() {
        if (!this.midiAccess) return [];
        return Array.from(this.midiAccess.inputs.values());
    }

    connectInput(inputId) {
        if (!this.midiAccess) return false;

        const input = this.midiAccess.inputs.get(inputId);
        if (!input) {
            console.error('[MIDI] Input not found:', inputId);
            return false;
        }

        // Disconnect previous input
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
        }

        // Connect new input
        this.currentInput = input;
        this.currentInput.onmidimessage = (msg) => this.handleMIDIMessage(msg);

        console.log('[MIDI] Connected to:', input.name);

        if (this.onConnectionChange) {
            this.onConnectionChange(true, input.name);
        }

        return true;
    }

    handleMIDIMessage(message) {
        const [status, data1, data2] = message.data;
        const command = status & 0xF0;
        const channel = status & 0x0F;

        // MIDI Clock Messages (System Real-Time)
        if (status === 0xF8) {
            this.handleClock();
            return;
        }

        if (status === 0xFA) {
            // Start
            this.handleStart();
            return;
        }

        if (status === 0xFB) {
            // Continue
            this.handleContinue();
            return;
        }

        if (status === 0xFC) {
            // Stop
            this.handleStop();
            return;
        }

        if (status === 0xF2) {
            // Song Position Pointer
            this.handleSongPosition(data1, data2);
            return;
        }

        // Regular MIDI Messages
        switch (command) {
            case 0x90: // Note On
                if (data2 > 0) {
                    this.emit('noteon', { channel, note: data1, velocity: data2 });
                } else {
                    this.emit('noteoff', { channel, note: data1, velocity: 0 });
                }
                break;

            case 0x80: // Note Off
                this.emit('noteoff', { channel, note: data1, velocity: data2 });
                break;

            case 0xB0: // Control Change
                this.emit('cc', { channel, controller: data1, value: data2 });
                break;

            case 0xE0: // Pitch Bend
                const pitchBend = (data2 << 7) | data1;
                this.emit('pitchbend', { channel, value: pitchBend });
                break;
        }
    }

    handleClock() {
        const now = performance.now();

        this.clockCounter++;

        // Calculate BPM every 24 clocks (1 quarter note)
        if (this.clockCounter >= 24) {
            if (this.lastClockTime > 0) {
                const interval = (now - this.lastClockTime) / 24; // ms per clock
                const newBPM = Math.round(60000 / (interval * 24)); // BPM

                if (newBPM > 20 && newBPM < 300) { // Sanity check
                    this.bpm = newBPM;
                    if (this.onBPMChange) {
                        this.onBPMChange(this.bpm);
                    }
                }
            }

            this.lastClockTime = now;
            this.clockCounter = 0;
        }

        // Increment song position (96 PPQ - 96 clocks per quarter note)
        // But we track in 16th notes, so increment every 6 clocks
        if (this.clockCounter % 6 === 0) {
            this.songPosition++;
            if (this.onSongPositionChange) {
                this.onSongPositionChange(this.songPosition);
            }
        }

        this.emit('clock', { bpm: this.bpm, position: this.songPosition });
    }

    handleStart() {
        console.log('[MIDI] Start');
        this.isPlaying = true;
        this.songPosition = 0;
        this.clockCounter = 0;

        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }

        this.emit('start');
    }

    handleContinue() {
        console.log('[MIDI] Continue');
        this.isPlaying = true;

        if (this.onPlayStateChange) {
            this.onPlayStateChange(true);
        }

        this.emit('continue');
    }

    handleStop() {
        console.log('[MIDI] Stop');
        this.isPlaying = false;

        if (this.onPlayStateChange) {
            this.onPlayStateChange(false);
        }

        this.emit('stop');
    }

    handleSongPosition(lsb, msb) {
        // SPP is in MIDI beats (16th notes)
        const newPosition = (msb << 7) | lsb;
        const now = performance.now();

        console.log('[MIDI] SPP received:', newPosition, 'previous:', this.lastSPPPosition);

        // Calculate BPM from SPP position changes (works even when not playing)
        if (this.lastSPPTime > 0) {
            const deltaPosition = newPosition - this.lastSPPPosition;
            const deltaTime = now - this.lastSPPTime;

            console.log('[MIDI] SPP Delta - Position:', deltaPosition, '16ths, Time:', deltaTime.toFixed(2), 'ms');

            if (deltaPosition > 0 && deltaTime > 100 && deltaTime < 5000) { // Reasonable interval
                // Convert: 16th notes per ms -> BPM
                // deltaPosition = 16th notes
                // deltaTime = ms
                // BPM = (deltaPosition / 4) / (deltaTime / 60000)
                const quarterNotes = deltaPosition / 4;
                const minutes = deltaTime / 60000;
                const calculatedBPM = Math.round(quarterNotes / minutes);

                console.log('[MIDI] SPP BPM calculation:', quarterNotes, 'quarter notes /', minutes.toFixed(6), 'minutes =', calculatedBPM, 'BPM');

                if (calculatedBPM > 20 && calculatedBPM < 300) {
                    // Add to samples for averaging (more samples for stability)
                    this.sppBPMSamples.push(calculatedBPM);
                    if (this.sppBPMSamples.length > 8) { // Increased from 4 to 8
                        this.sppBPMSamples.shift();
                    }

                    // Weighted average (favor recent samples slightly)
                    let weightedSum = 0;
                    let weightTotal = 0;
                    for (let i = 0; i < this.sppBPMSamples.length; i++) {
                        const weight = 1 + (i / this.sppBPMSamples.length) * 0.5; // Recent samples weighted 1.0-1.5
                        weightedSum += this.sppBPMSamples[i] * weight;
                        weightTotal += weight;
                    }
                    const avgBPM = Math.round(weightedSum / weightTotal);

                    console.log('[MIDI] SPP BPM samples:', this.sppBPMSamples, 'Weighted Average:', avgBPM);

                    // Only update if difference is significant (hysteresis to prevent jitter)
                    if (Math.abs(avgBPM - this.bpm) >= 2) {
                        this.bpm = avgBPM;
                        console.log('[MIDI] ✓ BPM updated from SPP:', this.bpm);

                        if (this.onBPMChange) {
                            this.onBPMChange(this.bpm);
                        }
                    } else if (this.sppBPMSamples.length >= 8) {
                        // After collecting enough samples, lock in the stable value
                        this.bpm = avgBPM;
                    }
                }
            }
        }

        this.songPosition = newPosition;
        this.lastSPPPosition = newPosition;
        this.lastSPPTime = now;

        if (this.onSongPositionChange) {
            this.onSongPositionChange(this.songPosition);
        }

        this.emit('songposition', { position: this.songPosition });
    }

    handleStateChange(event) {
        console.log('[MIDI] Device state change:', event.port.name, event.port.state);
        this.emit('statechange', event);
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

    // Utility methods
    getSongPositionFormatted() {
        // Convert 16th notes to bars.beats.sixteenths
        const bar = Math.floor(this.songPosition / 16);
        const beat = Math.floor((this.songPosition % 16) / 4);
        const sixteenth = this.songPosition % 4;
        return `${bar}.${beat}.${sixteenth}`;
    }

    getBPM() {
        return this.bpm;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    getSongPosition() {
        return this.songPosition;
    }
}

// Export as global
window.MIDIManager = MIDIManager;
