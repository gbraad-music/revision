/**
 * Regroove Effects - DJ-style audio effects for live performance
 * Includes kill EQ and other DJ effects
 */

class KillEQ {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.input = null;
        this.output = null;
        this.filters = {};

        this.initialize();
    }

    initialize() {
        // Create DJ-style kill EQ filters
        this.filters = {
            low: this.audioContext.createBiquadFilter(),
            mid: this.audioContext.createBiquadFilter(),
            high: this.audioContext.createBiquadFilter()
        };

        // Configure low-shelf filter (bass kill)
        this.filters.low.type = 'lowshelf';
        this.filters.low.frequency.value = 250; // Below 250Hz
        this.filters.low.gain.value = 0; // No cut by default

        // Configure peaking filter (mid kill)
        this.filters.mid.type = 'peaking';
        this.filters.mid.frequency.value = 1000; // Around 1kHz
        this.filters.mid.Q.value = 1.0; // Moderate bandwidth
        this.filters.mid.gain.value = 0; // No cut by default

        // Configure high-shelf filter (treble kill)
        this.filters.high.type = 'highshelf';
        this.filters.high.frequency.value = 4000; // Above 4kHz
        this.filters.high.gain.value = 0; // No cut by default

        // Chain filters together: low → mid → high
        this.filters.low.connect(this.filters.mid);
        this.filters.mid.connect(this.filters.high);

        // Set input/output for external connections
        this.input = this.filters.low;
        this.output = this.filters.high;

        console.log('[KillEQ] Initialized - Low/Mid/High filters ready');
    }

    /**
     * Set gain for a frequency band
     * @param {string} band - 'low', 'mid', or 'high'
     * @param {number} value - 0-100 where 0=kill(-40dB), 50=neutral(0dB), 100=boost(+12dB)
     */
    setGain(band, value) {
        if (!this.filters[band]) {
            console.warn('[KillEQ] Invalid band:', band);
            return;
        }

        // Map 0-100 to -40dB to +12dB
        // 0-50 maps to -40dB to 0dB (cut range)
        // 50-100 maps to 0dB to +12dB (boost range)
        let gain;
        if (value <= 50) {
            // Cut range: 0 -> -40dB, 50 -> 0dB
            gain = (value / 50) * 40 - 40;
        } else {
            // Boost range: 50 -> 0dB, 100 -> +12dB
            gain = ((value - 50) / 50) * 12;
        }

        this.filters[band].gain.value = gain;
        console.log('[KillEQ]', band.toUpperCase(), 'set to', gain.toFixed(1), 'dB (knob:', value + '%)');
    }

    /**
     * Get current value (0-100) from gain
     * @param {string} band - 'low', 'mid', or 'high'
     * @returns {number} - 0-100 value
     */
    getValue(band) {
        if (!this.filters[band]) return 50;

        const gain = this.filters[band].gain.value;

        // Map -40dB to +12dB back to 0-100
        if (gain <= 0) {
            // Cut range: -40dB -> 0, 0dB -> 50
            return ((gain + 40) / 40) * 50;
        } else {
            // Boost range: 0dB -> 50, +12dB -> 100
            return (gain / 12) * 50 + 50;
        }
    }

    /**
     * Get current state of a band
     * @param {string} band - 'low', 'mid', or 'high'
     * @returns {boolean} - true if killed, false if active
     */
    isKilled(band) {
        if (!this.filters[band]) return false;
        return this.filters[band].gain.value < -20; // Threshold for "killed"
    }

    /**
     * Get the input node for connecting sources
     */
    getInput() {
        return this.input;
    }

    /**
     * Get the output node for connecting destinations
     */
    getOutput() {
        return this.output;
    }

    /**
     * Destroy the effect and disconnect nodes
     */
    destroy() {
        if (this.filters) {
            Object.values(this.filters).forEach(filter => {
                try {
                    filter.disconnect();
                } catch (e) {
                    // Already disconnected
                }
            });
        }
        this.filters = null;
        this.input = null;
        this.output = null;
        console.log('[KillEQ] Destroyed');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.KillEQ = KillEQ;
}
