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

    async connectMicrophone() {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Create source from microphone
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);

            this.isActive = true;
            this.startAnalysis();

            console.log('[AudioInput] Microphone connected');
            this.emit('connected', { source: 'microphone' });
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

        // Detect beats
        const beat = this.detectBeat(rms);
        if (beat) {
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
