// FrequencyAnalyzer - Reusable audio frequency analysis component
// Creates an AnalyserNode that can be connected to any audio source
// Automatically calculates bass/mid/high bands and emits frequency events

class FrequencyAnalyzer {
    constructor(audioContext, options = {}) {
        this.audioContext = audioContext;

        // Create analyser node
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = options.fftSize || 8192;
        // Use Web Audio API smoothing for visualization (applies to raw analyser reads)
        this.analyser.smoothingTimeConstant = options.smoothing || 0.0;

        // Create pass-through gain node (allows both analysis and audio routing)
        this.inputGain = audioContext.createGain();
        this.inputGain.gain.value = 1.0;
        this.inputGain.connect(this.analyser);

        // Frequency data buffers
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeDomainData = new Uint8Array(this.analyser.fftSize);

        // Event emitter
        this.listeners = new Map();

        // Monitoring state
        this.isActive = false;
        this.monitoringInterval = null;
        this.updateRate = options.updateRate || 50; // ms (20Hz default)

        // Source identifier (for event metadata)
        this.sourceName = options.sourceName || 'unknown';
        this.analyzerId = Math.random().toString(36).substr(2, 5);

        // Decay smoothing (for MIDI synth to prevent flashing)
        this.enableDecay = options.enableDecay || false;
        this.decayRate = options.decayRate || 0.95;
        this.lastBands = null;

        console.log(`[FrequencyAnalyzer] ⚙️ Created for source: ${this.sourceName} (id=${this.analyzerId})`);
    }

    /**
     * Connect an audio source to this analyzer (Web Audio API standard)
     * @param {AudioNode} source - The audio source to analyze
     * @returns {FrequencyAnalyzer} - This analyzer (for chaining)
     */
    connect(source) {
        if (source && source.connect) {
            source.connect(this.inputGain);
            console.log(`[FrequencyAnalyzer] Connected to source: ${this.sourceName}`);
        }
        return this;
    }

    /**
     * Connect this analyzer's output to a destination (e.g., speakers)
     * @param {AudioNode} destination - The destination node
     * @returns {AudioNode} - The destination (for chaining)
     */
    connectTo(destination) {
        return this.inputGain.connect(destination);
    }

    /**
     * Disconnect from all sources and destinations
     */
    disconnect() {
        this.inputGain.disconnect();
        console.log(`[FrequencyAnalyzer] Disconnected: ${this.sourceName}`);
    }

    /**
     * Get the analyser node (for direct access if needed)
     * @returns {AnalyserNode}
     */
    getAnalyser() {
        return this.analyser;
    }

    /**
     * Start frequency monitoring and event emission
     */
    start() {
        if (this.isActive) {
            console.log(`[FrequencyAnalyzer] Already active: ${this.sourceName}`);
            return;
        }

        this.isActive = true;
        this.monitoringInterval = setInterval(() => {
            this.analyzeFrequency();
        }, this.updateRate);

        console.log(`[FrequencyAnalyzer] Started monitoring: ${this.sourceName}`);
    }

    /**
     * Stop frequency monitoring
     */
    stop() {
        if (!this.isActive) return;

        this.isActive = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log(`[FrequencyAnalyzer] Stopped monitoring: ${this.sourceName}`);
    }

    /**
     * Analyze frequency data and emit events
     * @private
     */
    analyzeFrequency() {
        if (!this.isActive) return;

        // Get frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Calculate bass, mid, high with 8192 FFT (5.86 Hz/bin @ 48kHz)
        let bassRaw = this.calculateBand(0, 85);       // 0-500 Hz
        let midRaw = this.calculateBand(85, 680);      // 500-4000 Hz
        let highRaw = this.calculateBand(680, 2048);   // 4000-12000 Hz

        let bass = bassRaw;
        let mid = midRaw;
        let high = highRaw;

        // Apply ADAPTIVE smoothing if enabled (for MIDI synth)
        // Fast attack (new notes), slow decay (notes stopping)
        if (this.enableDecay && this.lastBands) {
            const attackFactor = 0.7;   // 70% new value on increase (fast attack)
            const decayFactor = 0.3;    // 30% new value on decrease (slow decay)

            // Adaptive smoothing: use different factors for attack vs decay
            const bassSmooth = bassRaw > this.lastBands.bass ? attackFactor : decayFactor;
            const midSmooth = midRaw > this.lastBands.mid ? attackFactor : decayFactor;
            const highSmooth = highRaw > this.lastBands.high ? attackFactor : decayFactor;

            bass = bassRaw * bassSmooth + this.lastBands.bass * (1 - bassSmooth);
            mid = midRaw * midSmooth + this.lastBands.mid * (1 - midSmooth);
            high = highRaw * highSmooth + this.lastBands.high * (1 - highSmooth);
        }

        // Store for next smoothing calculation
        this.lastBands = { bass, mid, high };

        // Calculate overall RMS
        let sum = 0;
        for (let i = 0; i < this.frequencyData.length; i++) {
            sum += this.frequencyData[i] * this.frequencyData[i];
        }
        const rms = Math.sqrt(sum / this.frequencyData.length) / 255;

        // Emit frequency event (standard format)
        this.emit('*', {
            type: 'frequency',
            data: {
                bands: {
                    bass,
                    mid,
                    high
                },
                rms,
                source: this.sourceName
            }
        });
    }

    /**
     * Calculate frequency band average
     * @private
     */
    calculateBand(startBin, endBin) {
        let sum = 0;
        for (let i = startBin; i < endBin && i < this.frequencyData.length; i++) {
            sum += this.frequencyData[i];
        }
        return (sum / ((endBin - startBin) * 255));
    }

    /**
     * Clamp change to prevent pops
     * @private
     */
    clampChange(oldValue, newValue, maxChange) {
        const delta = newValue - oldValue;
        if (Math.abs(delta) > maxChange) {
            return oldValue + Math.sign(delta) * maxChange;
        }
        return newValue;
    }

    // Event emitter interface
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
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[FrequencyAnalyzer] Error in ${event} listener:`, error);
            }
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        this.disconnect();
        this.listeners.clear();
        console.log(`[FrequencyAnalyzer] Destroyed: ${this.sourceName}`);
    }
}

window.FrequencyAnalyzer = FrequencyAnalyzer;
