/**
 * WASM Effects Processor for Revision
 * Handles M1 TRIM, Kill EQ, and other WASM-based effects
 */

class WasmEffectsProcessor {
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
            console.log('[WasmEffects] Loading WASM module...');

            // Register AudioWorklet processor
            await this.audioContext.audioWorklet.addModule('./effects/audio-worklet-processor.js');
            console.log('[WasmEffects] AudioWorklet registered');

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'wasm-effects-processor');

            // Load WASM files (both JS and WASM binary)
            const [jsResponse, wasmResponse] = await Promise.all([
                fetch('./effects/regroove-effects.js'),
                fetch('./effects/regroove-effects.wasm')
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to load WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            // Wait for worklet to request WASM
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Worklet timeout')), 10000);

                this.workletNode.port.onmessage = (e) => {
                    if (e.data.type === 'needWasm') {
                        console.log('[WasmEffects] Sending WASM to worklet...');
                        this.workletNode.port.postMessage({
                            type: 'wasmBytes',
                            data: {
                                jsCode: jsCode,
                                wasmBytes: wasmBytes
                            }
                        }, [wasmBytes]);
                    } else if (e.data.type === 'ready') {
                        clearTimeout(timeout);
                        console.log('[WasmEffects] Worklet ready');
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

            console.log('[WasmEffects] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[WasmEffects] Initialization failed:', error);
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
            console.warn('[WasmEffects] Not initialized yet');
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

        console.log('[WasmEffects]', band.toUpperCase(), 'set to', gain.toFixed(1), 'dB (knob:', value + '%)');
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
     * Connect this effect to a destination node (Web Audio API standard)
     * @param {AudioNode} destination - The destination node to connect to
     * @returns {AudioNode} - The destination node (for chaining)
     */
    connect(destination) {
        if (!this.output) {
            console.warn('[WasmEffects] Cannot connect - not initialized');
            return destination;
        }
        return this.output.connect(destination);
    }

    /**
     * Disconnect this effect from all destinations
     */
    disconnect() {
        if (this.output) {
            this.output.disconnect();
        }
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
        console.log('[WasmEffects] Destroyed');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.WasmEffectsProcessor = WasmEffectsProcessor;
}
