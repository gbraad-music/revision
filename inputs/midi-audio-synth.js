// MIDIAudioSynth - Synthesizes audio from MIDI input for Milkdrop visualization
// Creates a synthetic audio signal that Milkdrop can analyze

class MIDIAudioSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.analyser = null;
        this.masterGain = null;

        // Polyphonic voice management
        this.voices = [];
        this.maxVoices = 8;

        // Beat-reactive bass synth
        this.beatOscillator = null;
        this.beatGain = null;
        this.beatEnvelope = null;

        // Output
        this.isActive = false;

        // Event emitter (for InputManager integration)
        this.listeners = new Map();

        // Frequency analysis
        this.frequencyData = null;
        this.timeDomainData = null;
    }

    initialize() {
        try {
            // Create analyser for Milkdrop
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;

            // Master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3; // Overall volume
            this.masterGain.connect(this.analyser);

            // Speaker output (can be toggled on/off)
            this.speakerGain = this.audioContext.createGain();
            this.speakerGain.gain.value = 0; // Start muted
            this.masterGain.connect(this.speakerGain);
            this.speakerGain.connect(this.audioContext.destination);
            this.isAudible = false;

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

            this.isActive = true;
            console.log('[MIDIAudioSynth] Initialized - AnalyserNode ready for Milkdrop');
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
        this.beatGain.connect(this.masterGain);

        this.beatOscillator.start();
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

        // Create oscillator for this note
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // MIDI note to frequency
        const frequency = 440 * Math.pow(2, (note - 69) / 12);
        oscillator.frequency.value = frequency;

        // Waveform based on note range
        if (note < 48) {
            oscillator.type = 'sawtooth'; // Bass
        } else if (note < 72) {
            oscillator.type = 'square'; // Mid
        } else {
            oscillator.type = 'sine'; // High
        }

        // Velocity to gain with envelope
        const velocityGain = (velocity / 127) * 0.4;
        gain.gain.value = 0;

        // Connect
        oscillator.connect(gain);
        gain.connect(this.masterGain);

        // Start and apply envelope
        oscillator.start();
        const now = this.audioContext.currentTime;

        // ADSR Envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocityGain, now + 0.01); // Attack
        gain.gain.exponentialRampToValueAtTime(velocityGain * 0.7, now + 0.1); // Decay to sustain

        // Store voice
        voice.oscillator = oscillator;
        voice.gain = gain;
        voice.note = note;
        voice.active = true;

        console.log('[MIDIAudioSynth] Note ON:', note, 'Velocity:', velocity, 'Freq:', frequency.toFixed(1), 'Hz');
    }

    // Handle MIDI note off
    handleNoteOff(note) {
        if (!this.isActive) return;

        const voice = this.voices.find(v => v.active && v.note === note);
        if (voice) {
            this.releaseVoice(voice);
            console.log('[MIDIAudioSynth] Note OFF:', note);
        }
    }

    releaseVoice(voice) {
        if (!voice.oscillator) return;

        const now = this.audioContext.currentTime;

        // Release envelope
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); // Release

        // Stop oscillator after release
        setTimeout(() => {
            if (voice.oscillator) {
                voice.oscillator.stop();
                voice.oscillator.disconnect();
                voice.gain.disconnect();
                voice.oscillator = null;
                voice.gain = null;
                voice.note = null;
                voice.active = false;
            }
        }, 350);
    }

    // Handle beat events - trigger kick drum
    handleBeat(intensity = 1.0) {
        if (!this.isActive || !this.beatGain) return;

        const now = this.audioContext.currentTime;

        // Pitch envelope (high to low for kick drum effect)
        this.beatOscillator.frequency.cancelScheduledValues(now);
        this.beatOscillator.frequency.setValueAtTime(150, now);
        this.beatOscillator.frequency.exponentialRampToValueAtTime(40, now + 0.1);

        // Amplitude envelope
        const kickGain = intensity * 0.8;
        this.beatGain.gain.cancelScheduledValues(now);
        this.beatGain.gain.setValueAtTime(kickGain, now);
        this.beatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        console.log('[MIDIAudioSynth] BEAT - Kick triggered, intensity:', intensity.toFixed(2));
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

    // Get analyser for Milkdrop
    getAnalyser() {
        return this.analyser;
    }

    // Toggle audible output
    setAudible(enabled) {
        if (!this.speakerGain) return;

        this.isAudible = enabled;
        const now = this.audioContext.currentTime;

        if (enabled) {
            this.speakerGain.gain.setValueAtTime(1.0, now);
            console.log('[MIDIAudioSynth] 🔊 Audible - you will HEAR the MIDI notes!');
        } else {
            this.speakerGain.gain.setValueAtTime(0, now);
            console.log('[MIDIAudioSynth] 🔇 Muted - visuals only, no sound');
        }
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
        this.stopAll();

        if (this.beatOscillator) {
            this.beatOscillator.stop();
            this.beatOscillator.disconnect();
        }

        if (this.beatGain) {
            this.beatGain.disconnect();
        }

        if (this.masterGain) {
            this.masterGain.disconnect();
        }

        this.isActive = false;
        console.log('[MIDIAudioSynth] Destroyed');
    }
}

window.MIDIAudioSynth = MIDIAudioSynth;
