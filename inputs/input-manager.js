// InputManager - Unified input abstraction layer
// Handles MIDI, Audio, OSC, Keyboard, and other input sources

class InputManager {
    constructor() {
        this.sources = new Map();
        this.sourceCallbacks = new Map(); // Store callbacks so we can remove them
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
        console.log('[InputManager] Registered source:', name);

        // Remove old callback if re-registering
        if (this.sourceCallbacks.has(name)) {
            const oldCallback = this.sourceCallbacks.get(name);
            const oldSource = this.sources.get(name);
            if (oldSource && oldSource.off) {
                oldSource.off('*', oldCallback);
            }
        }

        this.sources.set(name, source);

        // Create callback to forward all events from source
        const callback = (event) => {
            this.emit(event.type, event.data);
        };

        // Store callback so we can remove it later
        this.sourceCallbacks.set(name, callback);

        // Attach listener
        source.on('*', callback);
    }

    unregisterSource(name) {
        const source = this.sources.get(name);
        const callback = this.sourceCallbacks.get(name);

        // CRITICAL: Remove event listener to stop receiving events from this source
        if (source && callback && source.off) {
            source.off('*', callback);
        }

        // Don't disconnect audio source - keep it running in background for quick switching
        // Only disconnect MIDI sources (midi-synth should be destroyed manually)
        if (source && source.disconnect && name !== 'audio') {
            source.disconnect();
        }

        this.sources.delete(name);
        this.sourceCallbacks.delete(name);
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
