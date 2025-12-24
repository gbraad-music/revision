// MIDIAudioSynth - Synthesizes audio from MIDI input for Milkdrop visualization
// Creates a synthetic audio signal that Milkdrop can analyze

class MIDIAudioSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.frequencyAnalyzer = null;
        this.masterGain = null;

        // Polyphonic voice management
        this.voices = [];
        this.maxVoices = 8;

        // Beat-reactive bass synth
        this.beatOscillator = null;
        this.beatGain = null;
        this.beatEnvelope = null;
        this.beatOscillatorStopped = false;

        // Output
        this.isActive = false;

        // Event emitter (for InputManager integration)
        this.listeners = new Map();
    }

    initialize() {
        console.log('[MIDIAudioSynth] 🎛️ Initializing MIDI Audio Synth...');
        try {
            // Frequency analyzer is now managed externally (shared MIDI analyzer in app.js)
            // Individual synth analyzers are disabled to prevent duplicate frequency streams
            this.frequencyAnalyzer = null;

            // Master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0; // Normal level, richness comes from harmonics

            // Speaker output (can be toggled on/off)
            this.speakerGain = this.audioContext.createGain();
            this.speakerGain.gain.value = 0; // Start muted
            this.speakerGain.connect(this.audioContext.destination);

            // Audio graph: masterGain → speakerGain → destination
            // (External analyzer in app.js taps into masterGain separately)
            this.masterGain.connect(this.speakerGain);

            console.log('[MIDIAudioSynth] Initialized (muted - use setAudible() to hear)');

            // Beat synth setup (kick drum)
            this.setupBeatSynth();

            // Initialize voice pool
            for (let i = 0; i < this.maxVoices; i++) {
                this.voices.push({
                    oscillator: null,
                    gain: null,
                    note: null,
                    active: false
                });
            }

            // CRITICAL: Set isActive BEFORE starting monitoring
            this.isActive = true;

            console.log('[MIDIAudioSynth] Initialized - audio routing ready');
            return true;
        } catch (error) {
            console.error('[MIDIAudioSynth] Failed to initialize:', error);
            return false;
        }
    }

    setupBeatSynth() {
        // Create kick drum synthesizer for beat events
        this.beatOscillator = this.audioContext.createOscillator();
        this.beatOscillator.type = 'sine';
        this.beatOscillator.frequency.value = 60; // Deep bass

        this.beatGain = this.audioContext.createGain();
        this.beatGain.gain.value = 0;

        this.beatOscillator.connect(this.beatGain);

        // Connect beat kick to masterGain (goes through speakerGain like notes)
        // This way "Make MIDI synth audible" controls BOTH notes AND kick drum
        this.beatGain.connect(this.masterGain);

        // CRITICAL: Reset stopped flag before starting oscillator
        this.beatOscillatorStopped = false;

        // Start oscillator (may fail if AudioContext is suspended - will work after resume)
        try {
            this.beatOscillator.start();
            console.log('[MIDIAudioSynth] Beat oscillator started (goes through main audible control)');
        } catch (e) {
            console.warn('[MIDIAudioSynth] Beat oscillator failed to start (AudioContext suspended):', e.message);
            this.beatOscillatorStopped = true; // Mark as stopped if start failed
        }
    }

    // Handle MIDI note on
    handleNoteOn(note, velocity) {
        if (!this.isActive) return;

        // Find free voice
        let voice = this.voices.find(v => !v.active);
        if (!voice) {
            // Steal oldest voice
            voice = this.voices[0];
            this.releaseVoice(voice);
        }

        // Create SIMPLE sound - ONE oscillator per note for CPU efficiency
        const gain = this.audioContext.createGain();
        const frequency = 440 * Math.pow(2, (note - 69) / 12);

        // Note name helper
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteName = noteNames[note % 12];
        const octave = Math.floor(note / 12) - 1; // MIDI octave (C4 = middle C = note 60)

        // Single oscillator - sawtooth for rich harmonics
        const oscillator = this.audioContext.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sawtooth'; // Sawtooth - rich harmonics for visualization
        oscillator.connect(gain);

        // Velocity to gain - REDUCED for less volume buildup
        const velocityGain = (velocity / 127) * 0.3; // Halved from 0.6
        gain.gain.value = 0;

        // Connect to master
        gain.connect(this.masterGain);

        // Start oscillator
        oscillator.start();

        const now = this.audioContext.currentTime;

        // ADSR Envelope - FAST attack, short sustain
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocityGain, now + 0.005); // Very fast attack (5ms)
        gain.gain.exponentialRampToValueAtTime(velocityGain * 0.6, now + 0.05); // Quick decay
        gain.gain.setValueAtTime(velocityGain * 0.5, now + 0.05); // Lower sustain level

        // Store voice for cleanup
        voice.oscillator = oscillator;
        voice.gain = gain;
        voice.note = note;
        voice.active = true;

        // console.log('[MIDIAudioSynth] 🎵 Note ON:', noteName + octave, '(MIDI', note + ') Vel:', velocity, 'Freq:', frequency.toFixed(1), 'Hz');
    }

    // Handle MIDI note off
    handleNoteOff(note) {
        if (!this.isActive) return;

        const voice = this.voices.find(v => v.active && v.note === note);
        if (voice) {
            // console.log('[MIDIAudioSynth] 🔽 Note OFF received:', note);
            this.releaseVoice(voice);
        }
        // else {
        //     console.log('[MIDIAudioSynth] ⚠️ Note OFF for inactive note:', note);
        // }
    }

    releaseVoice(voice) {
        if (!voice.oscillator) {
            // console.log('[MIDIAudioSynth] ⚠️ releaseVoice called but no oscillator');
            return;
        }

        const now = this.audioContext.currentTime;

        // console.log('[MIDIAudioSynth] 📉 Releasing voice - note:', voice.note);

        // FAST release envelope - SHORT decay to prevent buildup
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); // FAST 50ms release

        // Stop oscillator and disconnect after release
        const osc = voice.oscillator;
        const gainNode = voice.gain;
        setTimeout(() => {
            try {
                if (osc) {
                    osc.stop();
                    osc.disconnect();
                }
                if (gainNode) {
                    gainNode.disconnect();
                }
            } catch (e) {
                console.log('[MIDIAudioSynth] Error stopping oscillators:', e.message);
            }
            voice.oscillator = null;
            voice.gain = null;
            voice.note = null;
            voice.active = false;
        }, 60); // Fast cleanup after 50ms release
    }

    // Handle beat events - trigger kick drum
    handleBeat(intensity = 1.0) {
        if (!this.isActive || !this.beatGain) return;

        // CRITICAL: Check if beatOscillator is still running (might have stopped if AudioContext was suspended)
        if (!this.beatOscillator || this.beatOscillatorStopped) {
            console.warn('[MIDIAudioSynth] Beat oscillator not running - restarting...');
            try {
                // Recreate oscillator
                if (this.beatOscillator) {
                    try { this.beatOscillator.disconnect(); } catch (e) {}
                }

                this.beatOscillator = this.audioContext.createOscillator();
                this.beatOscillator.type = 'sine';
                this.beatOscillator.frequency.value = 60;
                this.beatOscillator.connect(this.beatGain);
                this.beatOscillator.start();
                this.beatOscillatorStopped = false;
                console.log('[MIDIAudioSynth] ✓ Beat oscillator restarted');
            } catch (e) {
                console.error('[MIDIAudioSynth] Failed to restart beat oscillator:', e.message);
                return;
            }
        }

        const now = this.audioContext.currentTime;

        // Pitch envelope (high to low for kick drum effect)
        this.beatOscillator.frequency.cancelScheduledValues(now);
        this.beatOscillator.frequency.setValueAtTime(200, now); // Start higher
        this.beatOscillator.frequency.exponentialRampToValueAtTime(50, now + 0.05); // Drop faster
        this.beatOscillator.frequency.exponentialRampToValueAtTime(40, now + 0.15); // Settle lower

        // Amplitude envelope - VERY LOUD and LONGER for strong visuals and audibility
        const kickGain = intensity * 5.0; // MUCH LOUDER (was 3.0)
        this.beatGain.gain.cancelScheduledValues(now);
        this.beatGain.gain.setValueAtTime(kickGain, now);
        this.beatGain.gain.exponentialRampToValueAtTime(kickGain * 0.3, now + 0.05); // Quick decay
        this.beatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4); // Longer tail (was 0.2)

        // Removed kick logging to prevent console spam (triggers on every beat)
    }

    // Handle control changes - could modulate synth parameters
    handleControl(cc, value) {
        if (!this.isActive) return;

        // CC 7 = Volume
        if (cc === 7) {
            const volume = (value / 127) * 0.5;
            this.masterGain.gain.setValueAtTime(volume, this.audioContext.currentTime);
            console.log('[MIDIAudioSynth] Volume:', (value / 127 * 100).toFixed(0), '%');
        }

        // CC 1 = Modulation - could affect vibrato, filter, etc.
        // Future: Add filter, LFO, etc.
    }

    /**
     * Connect this synth to a destination node (Web Audio API standard)
     * @param {AudioNode} destination - The destination node to connect to
     * @returns {AudioNode} - The destination node (for chaining)
     */
    connect(destination) {
        if (!this.masterGain) {
            console.warn('[MIDIAudioSynth] Cannot connect - not initialized');
            return destination;
        }
        return this.masterGain.connect(destination);
    }

    /**
     * Disconnect this synth from all destinations
     */
    disconnect() {
        if (this.masterGain) {
            this.masterGain.disconnect();
        }
    }

    /**
     * Get analyser node for visualization (e.g., Milkdrop)
     * Note: For audio routing, use connect(destination) instead
     * @returns {AnalyserNode} - The analyser node for reading frequency data
     */
    getAnalyser() {
        return this.frequencyAnalyzer ? this.frequencyAnalyzer.getAnalyser() : null;
    }

    // Toggle audible output
    async setAudible(enabled) {
        if (!this.speakerGain) return;

        this.isAudible = enabled;

        if (enabled) {
            // CRITICAL: Resume AudioContext if suspended (requires user gesture)
            if (this.audioContext.state === 'suspended') {
                console.log('[MIDIAudioSynth] ⚠️ AudioContext suspended, resuming...');
                try {
                    await this.audioContext.resume();
                    console.log('[MIDIAudioSynth] ✓ AudioContext resumed:', this.audioContext.state);
                } catch (e) {
                    console.error('[MIDIAudioSynth] ✗ Failed to resume AudioContext:', e.message);
                    return;
                }
            }

            const now = this.audioContext.currentTime;
            this.speakerGain.gain.setValueAtTime(1.0, now);
            console.log('[MIDIAudioSynth] 🔊 Audible - you will HEAR the MIDI notes! (AudioContext state:', this.audioContext.state + ')');
        } else {
            const now = this.audioContext.currentTime;
            this.speakerGain.gain.setValueAtTime(0, now);
            console.log('[MIDIAudioSynth] 🔇 Muted - visuals only, no sound (notes AND kick)');
        }
    }


    // Event emitter methods
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
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => callback(data));
    }

    // Stop all voices
    stopAll() {
        this.voices.forEach(voice => {
            if (voice.active) {
                this.releaseVoice(voice);
            }
        });
        console.log('[MIDIAudioSynth] All notes stopped');
    }

    destroy() {
        this.isActive = false;

        // Stop and destroy frequency analyzer
        if (this.frequencyAnalyzer) {
            this.frequencyAnalyzer.stop();
            this.frequencyAnalyzer.destroy();
            this.frequencyAnalyzer = null;
        }

        this.stopAll();

        if (this.beatOscillator) {
            try {
                this.beatOscillator.stop();
                this.beatOscillator.disconnect();
            } catch (e) {
                console.log('[MIDIAudioSynth] Beat oscillator already stopped');
            }
            this.beatOscillatorStopped = true;
        }

        if (this.beatGain) {
            this.beatGain.disconnect();
        }

        if (this.masterGain) {
            this.masterGain.disconnect();
        }

        console.log('[MIDIAudioSynth] Destroyed');
    }
}

window.MIDIAudioSynth = MIDIAudioSynth;
