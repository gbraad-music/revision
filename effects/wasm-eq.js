/**
 * WASM-based Kill EQ for Revision
 * Replaces the Web Audio API BiquadFilter implementation with WASM processing
 */

class WasmKillEQ {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.eqEffect = null;
        this.input = null;
        this.output = null;
        this.isReady = false;
    }

    async initialize() {
        try {
            console.log('[WasmKillEQ] Loading WASM module...');

            // Register AudioWorklet processor
            await this.audioContext.audioWorklet.addModule('./effects/audio-worklet-processor.js');
            console.log('[WasmKillEQ] AudioWorklet registered');

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'wasm-effects-processor');

            // Load WASM files
            const [jsResponse, wasmResponse] = await Promise.all([
                fetch('./effects/regroove-effects.js'),
                fetch('./effects/regroove-effects.wasm')
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to load WASM files');
            }

            const wasmBytes = await wasmResponse.arrayBuffer();

            // Wait for worklet to request WASM
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Worklet timeout')), 10000);

                this.workletNode.port.onmessage = (e) => {
                    if (e.data.type === 'needWasm') {
                        console.log('[WasmKillEQ] Sending WASM to worklet...');
                        this.workletNode.port.postMessage({
                            type: 'wasmBytes',
                            data: wasmBytes
                        }, [wasmBytes]);
                    } else if (e.data.type === 'ready') {
                        clearTimeout(timeout);
                        console.log('[WasmKillEQ] Worklet ready');
                        resolve();
                    } else if (e.data.type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(`Worklet error: ${e.data.error}`));
                    }
                };
            });

            // Enable EQ effect by default
            this.workletNode.port.postMessage({
                type: 'toggle',
                data: { name: 'eq', enabled: true }
            });

            // Set initial values to neutral (50 = 0dB)
            ['low', 'mid', 'high'].forEach(param => {
                this.workletNode.port.postMessage({
                    type: 'setParam',
                    data: { effect: 'eq', param, value: 0.5 } // 50% = neutral
                });
            });

            // Set input/output
            this.input = this.workletNode;
            this.output = this.workletNode;
            this.isReady = true;

            console.log('[WasmKillEQ] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[WasmKillEQ] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Set gain for a frequency band
     * @param {string} band - 'low', 'mid', or 'high'
     * @param {number} value - 0-100 where 0=kill(-40dB), 50=neutral(0dB), 100=boost(+12dB)
     */
    setGain(band, value) {
        if (!this.isReady) {
            console.warn('[WasmKillEQ] Not initialized yet');
            return;
        }

        // Convert 0-100 to 0.0-1.0 for WASM
        const normalizedValue = value / 100;

        this.workletNode.port.postMessage({
            type: 'setParam',
            data: { effect: 'eq', param: band, value: normalizedValue }
        });

        // Calculate dB for logging (same mapping as original KillEQ)
        let gain;
        if (value <= 50) {
            gain = (value / 50) * 40 - 40;
        } else {
            gain = ((value - 50) / 50) * 12;
        }

        console.log('[WasmKillEQ]', band.toUpperCase(), 'set to', gain.toFixed(1), 'dB (knob:', value + '%)');
    }

    /**
     * Get current value (0-100) from stored state
     * Note: WASM doesn't expose getters, so we'd need to track state
     * For now, return neutral value
     */
    getValue(band) {
        return 50; // Neutral
    }

    /**
     * Get current state of a band
     * @param {string} band - 'low', 'mid', or 'high'
     * @returns {boolean} - true if killed, false if active
     */
    isKilled(band) {
        // Would need state tracking to implement this properly
        return false;
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
        if (this.workletNode) {
            try {
                this.workletNode.disconnect();
            } catch (e) {
                // Already disconnected
            }
            this.workletNode = null;
        }
        this.input = null;
        this.output = null;
        this.isReady = false;
        console.log('[WasmKillEQ] Destroyed');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.WasmKillEQ = WasmKillEQ;
}
