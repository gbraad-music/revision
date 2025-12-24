// RG909Drum - TR-909 Style WASM Drum Synthesizer
// For beat kicks and drum sounds

class RG909Drum {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.speakerGain = null;
        this.isActive = false;
        this.isAudible = false;

        // WASM state
        this.wasmReady = false;
    }

    async initialize() {
        console.log('[RG909Drum] 🥁 Initializing WASM Drum Synth...');
        try {
            // Master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0;

            // Speaker output (can be toggled on/off)
            this.speakerGain = this.audioContext.createGain();
            this.speakerGain.gain.value = 0; // Start muted
            this.speakerGain.connect(this.audioContext.destination);

            // Audio graph: worklet → masterGain → speakerGain → destination
            this.masterGain.connect(this.speakerGain);

            // Load and register AudioWorklet processor
            await this.audioContext.audioWorklet.addModule('synths/drum-worklet-processor.js');

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'drum-worklet-processor');
            this.workletNode.connect(this.masterGain);

            // Handle worklet messages
            this.workletNode.port.onmessage = (event) => {
                const { type, data } = event.data;

                if (type === 'needWasm') {
                    this.loadWasm();
                } else if (type === 'ready') {
                    console.log('[RG909Drum] ✅ WASM Drum Synth ready');
                    this.wasmReady = true;
                } else if (type === 'error') {
                    console.error('[RG909Drum] WASM error:', data);
                }
            };

            this.isActive = true;

            console.log('[RG909Drum] Initialized - waiting for WASM...');
            return true;
        } catch (error) {
            console.error('[RG909Drum] Failed to initialize:', error);
            return false;
        }
    }

    async loadWasm() {
        try {
            console.log('[RG909Drum] Loading WASM...');

            // Fetch both JS glue code and WASM binary
            const [jsResponse, wasmResponse] = await Promise.all([
                fetch('synths/rg909-drum.js'),
                fetch('synths/rg909-drum.wasm')
            ]);

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            // Send to worklet
            this.workletNode.port.postMessage({
                type: 'wasmBytes',
                data: {
                    jsCode: jsCode,
                    wasmBytes: wasmBytes,
                    sampleRate: this.audioContext.sampleRate
                }
            });

            console.log('[RG909Drum] WASM sent to worklet');
        } catch (error) {
            console.error('[RG909Drum] Failed to load WASM:', error);
        }
    }

    // Trigger drum hit (MIDI note 36 = bass drum)
    handleBeat(intensity = 1.0) {
        if (!this.wasmReady || !this.workletNode) return;

        const note = 36; // MIDI_NOTE_BD (bass drum)
        const velocity = Math.floor(intensity * 127);

        this.workletNode.port.postMessage({
            type: 'triggerDrum',
            data: { note, velocity }
        });
    }

    // Trigger specific drum note
    triggerDrum(note, velocity = 127) {
        if (!this.wasmReady || !this.workletNode) return;

        this.workletNode.port.postMessage({
            type: 'triggerDrum',
            data: { note, velocity }
        });
    }

    async setAudible(enabled) {
        if (!this.speakerGain) {
            console.error('[RG909Drum] ❌ setAudible called but speakerGain is null!');
            return;
        }

        this.isAudible = enabled;
        console.log(`[RG909Drum] setAudible(${enabled})`);

        // Resume AudioContext if needed
        if (enabled && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('[RG909Drum] AudioContext resumed');
            } catch (error) {
                console.error('[RG909Drum] Failed to resume AudioContext:', error);
                return;
            }
        }

        // Smooth fade to avoid clicks
        const currentTime = this.audioContext.currentTime;
        this.speakerGain.gain.cancelScheduledValues(currentTime);
        this.speakerGain.gain.setValueAtTime(this.speakerGain.gain.value, currentTime);
        this.speakerGain.gain.linearRampToValueAtTime(enabled ? 1.0 : 0.0, currentTime + 0.05);

        console.log(`[RG909Drum] ✅ ${enabled ? 'AUDIBLE' : 'MUTED'}`);
    }

    destroy() {
        console.log('[RG909Drum] Destroying...');

        this.isActive = false;

        // Disconnect audio graph
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }

        console.log('[RG909Drum] Destroyed');
    }
}
