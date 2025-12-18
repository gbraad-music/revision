/**
 * M1 TRIM - Regroove Model 1 Trim effect wrapper
 * Provides M1 TRIM effect using shared WASM worklet
 */

class M1Trim {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.ready = false;
    }

    async initialize() {
        try {
            // Load WASM file
            const wasmResponse = await fetch('effects/regroove-effects.wasm');
            if (!wasmResponse.ok) {
                throw new Error('WASM file not found');
            }
            const wasmBytes = await wasmResponse.arrayBuffer();

            // Register audio worklet processor
            await this.audioContext.audioWorklet.addModule('effects/audio-worklet-processor.js');

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'wasm-effects-processor');

            // Initialize worklet with WASM
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('M1 TRIM worklet timeout')), 10000);

                this.workletNode.port.onmessage = (e) => {
                    if (e.data.type === 'needWasm') {
                        this.workletNode.port.postMessage({
                            type: 'wasmBytes',
                            data: wasmBytes
                        }, [wasmBytes]);
                    } else if (e.data.type === 'ready') {
                        clearTimeout(timeout);
                        // Set default M1 TRIM value (0.7 = neutral)
                        this.workletNode.port.postMessage({
                            type: 'setParam',
                            data: { effect: 'model1_trim', param: 'drive', value: 0.7 }
                        });
                        this.ready = true;
                        resolve();
                    } else if (e.data.type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(`M1 TRIM worklet: ${e.data.error}`));
                    }
                };
            });

            console.log('[M1Trim] Initialized');
            return this.workletNode;
        } catch (error) {
            console.error('[M1Trim] Failed to initialize:', error);
            throw error;
        }
    }

    setDrive(value) {
        if (!this.ready || !this.workletNode) {
            console.warn('[M1Trim] Cannot set drive - not initialized');
            return;
        }

        this.workletNode.port.postMessage({
            type: 'setParam',
            data: { effect: 'model1_trim', param: 'drive', value }
        });
    }

    getNode() {
        return this.workletNode;
    }

    destroy() {
        if (this.workletNode) {
            try {
                this.workletNode.disconnect();
            } catch (e) {
                // Already disconnected
            }
            this.workletNode = null;
        }
        this.ready = false;
        console.log('[M1Trim] Destroyed');
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.M1Trim = M1Trim;
}
