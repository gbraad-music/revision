// InputManager - Unified input abstraction layer
// Handles MIDI, Audio, OSC, Keyboard, and other input sources

class InputManager {
    constructor() {
        this.sources = new Map();
        this.listeners = new Map();

        // Normalized event types
        this.eventTypes = {
            BEAT: 'beat',           // { intensity: 0-1, phase: 0-1 }
            NOTE: 'note',           // { note: 0-127, velocity: 0-127, source: 'midi'|'audio' }
            CONTROL: 'control',     // { id: number, value: 0-1, source: string }
            TRANSPORT: 'transport', // { state: 'play'|'stop'|'continue', bpm: number }
            FREQUENCY: 'frequency', // { bands: Float32Array, rms: 0-1 }
            SYSEX: 'sysex'         // { data: Uint8Array, source: string }
        };

        // Global state
        this.bpm = 120;
        this.isPlaying = false;
        this.beatPhase = 0;
        this.barPhase = 0;
    }

    registerSource(name, source) {
        this.sources.set(name, source);

        // Forward all events from source
        source.on('*', (event) => {
            // Debug: Log frequency events (commented to reduce spam - use EQ visualizer in control.html)
            // if (event.type === 'frequency') {
            //     if (!this.lastFreqLogTime || performance.now() - this.lastFreqLogTime > 1000) {
            //         const bands = event.data.bands || {};
            //         console.log('[InputManager] Forwarding frequency from', name,
            //             '- Bass:', (bands.bass || 0).toFixed(2),
            //             'Mid:', (bands.mid || 0).toFixed(2),
            //             'High:', (bands.high || 0).toFixed(2));
            //         this.lastFreqLogTime = performance.now();
            //     }
            // }
            this.emit(event.type, event.data);
        });

        console.log('[InputManager] Registered source:', name);
    }

    unregisterSource(name) {
        const source = this.sources.get(name);
        if (source && source.disconnect) {
            source.disconnect();
        }
        this.sources.delete(name);
        console.log('[InputManager] Unregistered source:', name);
    }

    getSource(name) {
        return this.sources.get(name);
    }

    getAllSources() {
        return Array.from(this.sources.keys());
    }

    // Normalized event emission
    emitBeat(intensity, phase, source = 'unknown') {
        this.beatPhase = phase;
        this.emit(this.eventTypes.BEAT, {
            intensity,
            phase,
            source,
            timestamp: performance.now()
        });
    }

    emitNote(note, velocity, source = 'unknown') {
        this.emit(this.eventTypes.NOTE, {
            note,
            velocity,
            source,
            timestamp: performance.now()
        });
    }

    emitControl(id, value, source = 'unknown') {
        this.emit(this.eventTypes.CONTROL, {
            id,
            value,
            source,
            timestamp: performance.now()
        });
    }

    emitTransport(state, bpm = null, source = 'unknown') {
        if (bpm !== null) {
            this.bpm = bpm;
        }
        this.isPlaying = (state === 'play' || state === 'continue');

        this.emit(this.eventTypes.TRANSPORT, {
            state,
            bpm: this.bpm,
            isPlaying: this.isPlaying,
            source,
            timestamp: performance.now()
        });
    }

    emitFrequency(bands, rms, source = 'audio') {
        this.emit(this.eventTypes.FREQUENCY, {
            bands,
            rms,
            source,
            timestamp: performance.now()
        });
    }

    emitSysEx(data, source = 'midi') {
        this.emit(this.eventTypes.SYSEX, {
            data,
            source,
            timestamp: performance.now()
        });
    }

    // Event emitter pattern
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

    // Global state accessors
    getBPM() {
        return this.bpm;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    getBeatPhase() {
        return this.beatPhase;
    }

    getBarPhase() {
        return this.barPhase;
    }
}

window.InputManager = InputManager;
