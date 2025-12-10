// AudioInputSource - Web Audio API integration with frequency analysis

class AudioInputSource {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.frequencyData = null;
        this.timeDomainData = null;
        this.isActive = false;
        this.listeners = new Map();

        // Beat detection
        this.beatDetector = {
            threshold: 1.3,
            decay: 0.98,
            minTimeBetweenBeats: 200, // ms
            lastBeatTime: 0,
            energyHistory: [],
            maxHistoryLength: 43 // ~1 second at 60fps
        };

        // Frequency bands
        this.bands = {
            sub: { low: 20, high: 60 },      // Sub bass
            bass: { low: 60, high: 250 },    // Bass
            lowMid: { low: 250, high: 500 }, // Low mids
            mid: { low: 500, high: 2000 },   // Mids
            highMid: { low: 2000, high: 4000 }, // High mids
            high: { low: 4000, high: 20000 } // Highs
        };
    }

    async initialize(options = {}) {
        try {
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();

            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = options.fftSize || 2048;
            this.analyser.smoothingTimeConstant = options.smoothing || 0.8;

            // Allocate buffers
            const bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeDomainData = new Uint8Array(bufferLength);

            console.log('[AudioInput] Initialized (no source yet)');
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to initialize:', error);
            return false;
        }
    }

    async connectMicrophone(deviceId = null) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            // Get sample rate from settings
            const sampleRate = parseInt(localStorage.getItem('audioSampleRate') || '48000');

            // Build audio constraints
            const audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: { ideal: sampleRate }
            };

            // Add device ID if specified
            if (deviceId) {
                audioConstraints.deviceId = { exact: deviceId };
            }

            console.log('[AudioInput] Requesting sample rate:', sampleRate, 'Hz');

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });

            // Log which device was actually selected
            const tracks = stream.getAudioTracks();
            if (tracks.length > 0) {
                const track = tracks[0];
                console.log('[AudioInput] ═══════════════════════════════════════');
                console.log('[AudioInput] Using audio device:', track.label);
                console.log('[AudioInput] Track enabled:', track.enabled);
                console.log('[AudioInput] Track muted:', track.muted);
                console.log('[AudioInput] Track readyState:', track.readyState);
                console.log('[AudioInput] Device settings:', track.getSettings());
                console.log('[AudioInput] ═══════════════════════════════════════');
            }

            // CRITICAL: Resume AudioContext if suspended
            console.log('[AudioInput] AudioContext state BEFORE:', this.audioContext.state);
            if (this.audioContext.state === 'suspended') {
                console.warn('[AudioInput] AudioContext is SUSPENDED - attempting to resume...');
                await this.audioContext.resume();
                console.log('[AudioInput] AudioContext state AFTER resume:', this.audioContext.state);
            }

            // FORCE resume with user interaction if needed
            if (this.audioContext.state !== 'running') {
                console.error('[AudioInput] ⚠️ AudioContext is NOT running! State:', this.audioContext.state);
                console.error('[AudioInput] This usually requires user interaction (click)');

                // Try to resume anyway
                try {
                    await this.audioContext.resume();
                    console.log('[AudioInput] Force resume result - state:', this.audioContext.state);
                } catch (e) {
                    console.error('[AudioInput] Failed to resume:', e);
                }
            }

            // Create source from microphone
            this.microphone = this.audioContext.createMediaStreamSource(stream);

            console.log('[AudioInput] MediaStreamSource created');
            console.log('[AudioInput] MediaStreamSource mediaStream:', this.microphone.mediaStream);
            console.log('[AudioInput] MediaStreamSource active:', this.microphone.mediaStream.active);

            this.microphone.connect(this.analyser);
            console.log('[AudioInput] ✓ Connected to analyser');

            this.isActive = true;
            this.startAnalysis();

            const deviceName = deviceId ? `device ${deviceId.substring(0, 8)}...` : 'default';
            console.log('[AudioInput] Microphone connected:', deviceName);
            console.log('[AudioInput] AudioContext state:', this.audioContext.state, 'Sample rate:', this.audioContext.sampleRate);
            console.log('[AudioInput] Analyser FFT size:', this.analyser.fftSize);
            console.log('[AudioInput] Analyser smoothing:', this.analyser.smoothingTimeConstant);

            // Create a test oscillator to verify audio pipeline works
            console.log('[AudioInput] Testing audio pipeline with oscillator...');
            const testOsc = this.audioContext.createOscillator();
            const testGain = this.audioContext.createGain();
            testGain.gain.value = 0.01; // Very quiet
            testOsc.connect(testGain);
            testGain.connect(this.analyser);
            testOsc.start();

            setTimeout(() => {
                testOsc.stop();
                testGain.disconnect();
                console.log('[AudioInput] Test oscillator stopped');
            }, 500);

            // Verify audio is flowing
            setTimeout(() => {
                // const testMax = Math.max(...this.frequencyData);
                // const testAvg = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;

                // console.log('[AudioInput] ═══════════════════════════════════════');
                // console.log('[AudioInput] AUDIO DIAGNOSTIC RESULTS:');
                // console.log('[AudioInput] Max frequency value:', testMax);
                // console.log('[AudioInput] Avg frequency value:', testAvg.toFixed(1));
                // console.log('[AudioInput] AudioContext state:', this.audioContext.state);
                // console.log('[AudioInput] Stream active:', this.microphone.mediaStream.active);
                // console.log('[AudioInput] Track count:', this.microphone.mediaStream.getTracks().length);

                // if (testMax === 0) {
                //     console.error('[AudioInput] ⚠️⚠️⚠️ NO AUDIO SIGNAL DETECTED! ⚠️⚠️⚠️');
                //     console.error('[AudioInput] POSSIBLE CAUSES:');
                //     console.error('[AudioInput]   1. Wrong device selected');
                //     console.error('[AudioInput]   2. Device has no audio playing');
                //     console.error('[AudioInput]   3. Device/system muted');
                //     console.error('[AudioInput]   4. Browser permissions issue');
                //     console.error('[AudioInput]   5. AudioContext suspended');

                //     // Check tracks
                //     const tracks = this.microphone.mediaStream.getAudioTracks();
                //     tracks.forEach((track, i) => {
                //         console.error(`[AudioInput]   Track ${i}: enabled=${track.enabled} muted=${track.muted} readyState=${track.readyState}`);
                //     });
                // } else {
                //     console.log('[AudioInput] ✓✓✓ AUDIO SIGNAL DETECTED! Max level:', testMax);
                // }
                // console.log('[AudioInput] ═══════════════════════════════════════');
            }, 1500);

            this.emit('connected', { source: 'microphone', deviceId });
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to connect microphone:', error);
            this.emit('error', { error, source: 'microphone' });
            return false;
        }
    }

    async connectMediaElement(audioElement) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            const source = this.audioContext.createMediaElementSource(audioElement);
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination); // Allow playback

            this.isActive = true;
            this.startAnalysis();

            console.log('[AudioInput] Media element connected');
            this.emit('connected', { source: 'media' });
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to connect media element:', error);
            this.emit('error', { error, source: 'media' });
            return false;
        }
    }

    disconnect() {
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        this.isActive = false;
        console.log('[AudioInput] Disconnected');
        this.emit('disconnected', {});
    }

    startAnalysis() {
        if (!this.isActive) return;

        this.analyze();
        requestAnimationFrame(() => this.startAnalysis());
    }

    analyze() {
        if (!this.analyser || !this.isActive) return;

        // Get frequency and time domain data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Calculate RMS (root mean square) energy
        const rms = this.calculateRMS();

        // Calculate frequency bands
        const bandLevels = this.calculateBandLevels();

        // Debug: Log audio levels (commented to reduce spam - use EQ visualizer in control.html)
        // if (!this.lastDebugTime || performance.now() - this.lastDebugTime > 1000) {
        //     const maxFreq = Math.max(...this.frequencyData);
        //     const avgFreq = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;
        //     console.log('[AudioInput] RMS:', rms.toFixed(3), 'Max:', maxFreq, 'Avg:', avgFreq.toFixed(1),
        //         'Bass:', bandLevels.bass.toFixed(2), 'Mid:', bandLevels.mid.toFixed(2), 'High:', bandLevels.high.toFixed(2));
        //     this.lastDebugTime = performance.now();
        // }

        // Detect beats
        const beat = this.detectBeat(rms);
        if (beat) {
            // console.log('[AudioInput] BEAT detected - intensity:', beat.intensity.toFixed(2));
            this.emit('*', {
                type: 'beat',
                data: {
                    intensity: beat.intensity,
                    phase: 0, // Audio doesn't have phase info
                    source: 'audio'
                }
            });
        }

        // Emit frequency data
        this.emit('*', {
            type: 'frequency',
            data: {
                bands: bandLevels,
                rms: rms,
                source: 'audio'
            }
        });

        // Emit frequency-based "notes" for high-energy bands
        this.emitFrequencyNotes(bandLevels);
    }

    calculateRMS() {
        let sum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const normalized = (this.timeDomainData[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / this.timeDomainData.length);
    }

    calculateBandLevels() {
        const sampleRate = this.audioContext.sampleRate;
        const binWidth = sampleRate / this.analyser.fftSize;
        const levels = {};

        for (const [name, range] of Object.entries(this.bands)) {
            const lowBin = Math.floor(range.low / binWidth);
            const highBin = Math.floor(range.high / binWidth);

            let sum = 0;
            let count = 0;

            for (let i = lowBin; i <= highBin && i < this.frequencyData.length; i++) {
                sum += this.frequencyData[i];
                count++;
            }

            levels[name] = count > 0 ? (sum / count) / 255 : 0;
        }

        return levels;
    }

    detectBeat(energy) {
        const now = performance.now();

        // Add to history
        this.beatDetector.energyHistory.push(energy);
        if (this.beatDetector.energyHistory.length > this.beatDetector.maxHistoryLength) {
            this.beatDetector.energyHistory.shift();
        }

        // Calculate average energy
        const avgEnergy = this.beatDetector.energyHistory.reduce((a, b) => a + b, 0) /
                         this.beatDetector.energyHistory.length;

        // Detect beat if energy exceeds threshold
        if (energy > avgEnergy * this.beatDetector.threshold &&
            now - this.beatDetector.lastBeatTime > this.beatDetector.minTimeBetweenBeats) {

            this.beatDetector.lastBeatTime = now;
            const intensity = Math.min((energy / avgEnergy) - 1, 1);

            return { intensity, energy, avgEnergy };
        }

        return null;
    }

    emitFrequencyNotes(bandLevels) {
        // Map frequency bands to MIDI-like note events
        const bandNoteMap = {
            sub: 36,      // C1
            bass: 48,     // C2
            lowMid: 60,   // C3
            mid: 72,      // C4
            highMid: 84,  // C5
            high: 96      // C6
        };

        for (const [band, note] of Object.entries(bandNoteMap)) {
            const level = bandLevels[band];

            // Emit note if band exceeds threshold
            if (level > 0.6) {
                const velocity = Math.floor(level * 127);
                this.emit('*', {
                    type: 'note',
                    data: {
                        note,
                        velocity,
                        source: 'audio-frequency'
                    }
                });
            }
        }
    }

    // Configuration
    setBeatThreshold(threshold) {
        this.beatDetector.threshold = threshold;
    }

    setFFTSize(size) {
        if (this.analyser) {
            this.analyser.fftSize = size;
            const bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeDomainData = new Uint8Array(bufferLength);
        }
    }

    setSmoothing(value) {
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = value;
        }
    }

    // Event emitter
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

    getFrequencyData() {
        return this.frequencyData;
    }

    getTimeDomainData() {
        return this.timeDomainData;
    }

    getIsActive() {
        return this.isActive;
    }
}

window.AudioInputSource = AudioInputSource;
