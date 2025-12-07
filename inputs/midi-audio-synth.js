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

        // Frequency monitoring interval
        this.monitoringInterval = null;
    }

    initialize() {
        try {
            // Create analyser for Milkdrop - FAST RESPONSE for MIDI transients
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 8192; // Larger FFT for better bass resolution (5.9 Hz/bin @ 48kHz)
            this.analyser.smoothingTimeConstant = 0.0; // NO SMOOTHING - instant response to MIDI!

            // Master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0; // Normal level, richness comes from harmonics
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

            // Initialize frequency data arrays
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.fftSize);

            // Start frequency monitoring for visual feedback
            this.startFrequencyMonitoring();

            this.isActive = true;
            console.log('[MIDIAudioSynth] Initialized - AnalyserNode ready for Milkdrop + frequency events');
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

        // Create RICH sound with multiple oscillators for visual impact
        const gain = this.audioContext.createGain();
        const frequency = 440 * Math.pow(2, (note - 69) / 12);

        // Note name helper
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteName = noteNames[note % 12];
        const octave = Math.floor(note / 12) - 1; // MIDI octave (C4 = middle C = note 60)

        // Main oscillator (sawtooth has rich harmonics)
        const oscillator = this.audioContext.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sawtooth'; // Sawtooth - rich harmonics
        const osc1Gain = this.audioContext.createGain();
        osc1Gain.gain.value = 0.3;
        oscillator.connect(osc1Gain);
        osc1Gain.connect(gain);

        // Add a detuned second oscillator for width (square wave for bass content)
        const osc2 = this.audioContext.createOscillator();
        osc2.frequency.value = frequency * 1.005; // Very slightly detuned
        osc2.type = 'square'; // Square wave has strong fundamental for bass
        const osc2Gain = this.audioContext.createGain();
        osc2Gain.gain.value = 0.2;
        osc2.connect(osc2Gain);
        osc2Gain.connect(gain);

        // Add sub-bass for low-end punch (boosted for bass notes)
        const subOsc = this.audioContext.createOscillator();
        subOsc.frequency.value = frequency * 0.5; // One octave down
        subOsc.type = 'sine';
        const subGain = this.audioContext.createGain();
        subGain.gain.value = 0.4; // Boosted sub-bass
        subOsc.connect(subGain);
        subGain.connect(gain);

        // Velocity to gain
        const velocityGain = (velocity / 127) * 0.6;
        gain.gain.value = 0;

        // Connect to master
        gain.connect(this.masterGain);

        // Start ALL oscillators
        oscillator.start();
        osc2.start();
        subOsc.start();

        const now = this.audioContext.currentTime;

        // ADSR Envelope with automatic release after 2 seconds
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocityGain, now + 0.01); // Attack
        gain.gain.exponentialRampToValueAtTime(velocityGain * 0.7, now + 0.1); // Decay to sustain
        gain.gain.exponentialRampToValueAtTime(velocityGain * 0.5, now + 2.0); // Hold sustain
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.3); // Auto release after 2.3 seconds

        // Auto-stop oscillator after envelope completes
        // Store note name for logging
        const noteNameForLog = noteName + octave;
        setTimeout(() => {
            try {
                // Stop these specific oscillator instances regardless of voice state
                // (voice may have been stolen and reassigned to a new note)
                oscillator.stop();
                osc2.stop();
                subOsc.stop();
                oscillator.disconnect();
                osc2.disconnect();
                subOsc.disconnect();
                osc1Gain.disconnect();
                osc2Gain.disconnect();
                subGain.disconnect();
                gain.disconnect();

                // Only clear voice if it still references these oscillators
                if (voice.oscillator === oscillator) {
                    voice.oscillator = null;
                    voice.osc2 = null;
                    voice.subOsc = null;
                    voice.osc1Gain = null;
                    voice.osc2Gain = null;
                    voice.subGain = null;
                    voice.gain = null;
                    voice.note = null;
                    voice.active = false;
                }
                console.log('[MIDIAudioSynth] Auto-stopped:', noteNameForLog);
            } catch (e) {
                // Oscillator may have already been stopped by note-off
                console.log('[MIDIAudioSynth] Auto-stop error (already stopped):', e.message);
            }
        }, 2400);

        // Store voice with all oscillators for cleanup
        voice.oscillator = oscillator;
        voice.osc2 = osc2;
        voice.subOsc = subOsc;
        voice.osc1Gain = osc1Gain;
        voice.osc2Gain = osc2Gain;
        voice.subGain = subGain;
        voice.gain = gain;
        voice.note = note;
        voice.active = true;

        // console.log('[MIDIAudioSynth] Note ON:', noteName + octave, '(MIDI', note + ') Vel:', velocity, 'Freq:', frequency.toFixed(1), 'Hz');
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

        // Release envelope - cancel scheduled values and apply immediate release
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); // Release

        // Stop ALL oscillators and disconnect all nodes after release
        const osc = voice.oscillator;
        const osc2 = voice.osc2;
        const subOsc = voice.subOsc;
        const osc1Gain = voice.osc1Gain;
        const osc2Gain = voice.osc2Gain;
        const subGain = voice.subGain;
        const gainNode = voice.gain;
        setTimeout(() => {
            try {
                if (osc) {
                    osc.stop();
                    osc.disconnect();
                }
                if (osc2) {
                    osc2.stop();
                    osc2.disconnect();
                }
                if (subOsc) {
                    subOsc.stop();
                    subOsc.disconnect();
                }
                if (osc1Gain) {
                    osc1Gain.disconnect();
                }
                if (osc2Gain) {
                    osc2Gain.disconnect();
                }
                if (subGain) {
                    subGain.disconnect();
                }
                if (gainNode) {
                    gainNode.disconnect();
                }
            } catch (e) {
                console.log('[MIDIAudioSynth] Error stopping oscillators:', e.message);
            }
            voice.oscillator = null;
            voice.osc2 = null;
            voice.subOsc = null;
            voice.osc1Gain = null;
            voice.osc2Gain = null;
            voice.subGain = null;
            voice.gain = null;
            voice.note = null;
            voice.active = false;
            console.log('[MIDIAudioSynth] ✓ Voice released');
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

        // Amplitude envelope - BOOSTED for strong visuals
        const kickGain = intensity * 2.0; // BOOSTED (was 0.8)
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
        console.log('[MIDIAudioSynth] getAnalyser() called - returning:', this.analyser ? 'VALID ANALYSER' : 'NULL');
        if (this.analyser) {
            // Test if analyser is receiving data
            const testData = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(testData);
            const max = Math.max(...testData);
            const avg = testData.reduce((a, b) => a + b, 0) / testData.length;
            console.log('[MIDIAudioSynth] Analyser data - Max:', max, 'Avg:', avg.toFixed(1));
        }
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

    // Start frequency monitoring for visual feedback (like audio-input-source)
    startFrequencyMonitoring() {
        console.log('[MIDIAudioSynth] ✓ Starting frequency monitoring...');
        const analyzeFrequency = () => {
            if (!this.isActive) {
                console.log('[MIDIAudioSynth] Frequency monitoring stopped - not active');
                return;
            }

            this.analyser.getByteFrequencyData(this.frequencyData);

            // Calculate bass, mid, high with 8192 FFT (5.86 Hz/bin @ 48kHz)
            // Optimized for very low MIDI bass frequencies
            const bass = this.calculateBand(0, 85); // 0-500 Hz (captures sub-bass to bass)
            const mid = this.calculateBand(85, 680); // 500-4000 Hz (fundamental to harmonics)
            const high = this.calculateBand(680, 2048); // 4000-12000 Hz (high harmonics)

            // Calculate overall RMS
            let sum = 0;
            for (let i = 0; i < this.frequencyData.length; i++) {
                sum += this.frequencyData[i] * this.frequencyData[i];
            }
            const rms = Math.sqrt(sum / this.frequencyData.length) / 255;

            // Emit frequency event (data flowing correctly - use EQ visualizer in control.html)
            this.emit('*', {
                type: 'frequency',
                data: {
                    bands: {
                        bass,
                        mid,
                        high
                    },
                    rms,
                    source: 'midi-synth'
                }
            });

            // Continue monitoring
            this.monitoringInterval = setTimeout(analyzeFrequency, 50); // 20Hz update rate
        };

        analyzeFrequency();
    }

    calculateBand(startBin, endBin) {
        let sum = 0;
        for (let i = startBin; i < endBin && i < this.frequencyData.length; i++) {
            sum += this.frequencyData[i];
        }
        return (sum / ((endBin - startBin) * 255));
    }

    // Event emitter methods
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
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
        // Stop frequency monitoring
        if (this.monitoringInterval) {
            clearTimeout(this.monitoringInterval);
            this.monitoringInterval = null;
        }
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
