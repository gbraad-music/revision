// AudioWorklet Processor for RG909 WASM Drum Synth
// Handles drum triggers and audio generation

class DrumWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        console.log('[DrumWorklet] ✅ LOADED - TR-909 Style Drum Machine');
        this.wasmModule = null;
        this.drumPtr = null;
        this.audioBufferPtr = null;
        this.bufferSize = 128; // AudioWorklet quantum size
        this.sampleRate = 48000;

        this.port.onmessage = this.handleMessage.bind(this);

        // Request WASM bytes from main thread
        this.port.postMessage({ type: 'needWasm' });
    }

    handleMessage(event) {
        const { type, data } = event.data;

        if (type === 'wasmBytes') {
            this.initWasm(data, data.sampleRate || 48000);
        } else if (type === 'triggerDrum') {
            this.triggerDrum(data.note, data.velocity);
        } else if (type === 'reset') {
            this.reset();
        }
    }

    async initWasm(wasmData, sampleRate) {
        try {
            console.log('[DrumWorklet] Loading Emscripten module...');
            this.sampleRate = sampleRate;

            const moduleCode = wasmData.jsCode;
            const wasmBytes = wasmData.wasmBytes;

            // Eval the Emscripten loader and capture memory reference
            const modifiedCode = moduleCode.replace(
                ';return moduleRtn',
                ';globalThis.__wasmMemory=wasmMemory;return moduleRtn'
            );

            eval(modifiedCode + '\nthis.RG909Module = RG909Module;');

            // Call the factory with WASM bytes
            this.wasmModule = await this.RG909Module({
                wasmBinary: wasmBytes
            });

            // Capture the memory reference
            this.wasmMemory = globalThis.__wasmMemory;
            delete globalThis.__wasmMemory;

            console.log('[DrumWorklet] WASM ready');

            // Allocate audio buffer (stereo interleaved)
            this.audioBufferPtr = this.wasmModule._malloc(this.bufferSize * 2 * 4);

            if (!this.audioBufferPtr) {
                throw new Error('_malloc returned null - memory allocation failed');
            }

            console.log(`[DrumWorklet] Buffer: 0x${this.audioBufferPtr.toString(16)}`);

            // Create drum synth instance
            this.drumPtr = this.wasmModule._rg909_create(this.sampleRate);
            console.log(`[DrumWorklet] Drum created: 0x${this.drumPtr.toString(16)}`);

            this.port.postMessage({ type: 'ready' });
            console.log('[DrumWorklet] ✅ Ready!');
        } catch (error) {
            console.error('[DrumWorklet] ❌ Failed:', error);
            this.port.postMessage({ type: 'error', error: error.message });
        }
    }

    triggerDrum(note, velocity) {
        if (!this.drumPtr || !this.wasmModule._rg909_trigger_drum) return;
        this.wasmModule._rg909_trigger_drum(this.drumPtr, note, velocity, this.sampleRate);
    }

    reset() {
        if (!this.drumPtr || !this.wasmModule._rg909_reset) return;
        this.wasmModule._rg909_reset(this.drumPtr);
    }

    process(inputs, outputs, parameters) {
        if (!this.wasmModule || !this.drumPtr || !this.audioBufferPtr || !this.wasmModule._rg909_process_f32) {
            // Output silence
            return true;
        }

        const output = outputs[0];
        if (!output || output.length === 0) {
            return true;
        }

        const frames = output[0].length;

        // Update heap view (use saved memory reference)
        const heapF32 = new Float32Array(
            this.wasmMemory.buffer,
            this.audioBufferPtr,
            frames * 2
        );

        // Zero the buffer
        heapF32.fill(0);

        // Process audio through drum synth
        this.wasmModule._rg909_process_f32(this.drumPtr, this.audioBufferPtr, frames, this.sampleRate);

        // De-interleave output
        const outputL = output[0];
        const outputR = output[1] || output[0];

        for (let i = 0; i < frames; i++) {
            outputL[i] = heapF32[i * 2];
            outputR[i] = heapF32[i * 2 + 1];
        }

        return true;
    }
}

registerProcessor('drum-worklet-processor', DrumWorkletProcessor);
