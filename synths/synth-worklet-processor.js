// AudioWorklet Processor for RGResonate1 WASM Synth
// Handles MIDI events and audio generation
// VERSION v170 - Added mapWasmFunctions call

class SynthWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        console.log('[SynthWorklet] ✅ LOADED v170 - Added mapWasmFunctions call');
        this.wasmModule = null;
        this.synthPtr = null;
        this.audioBufferPtr = null;
        this.bufferSize = 128; // AudioWorklet quantum size
        this.sampleRate = 48000;

        // WASM function name mappings (will be filled after examining WASM exports)
        this.wasmFuncs = {
            create: null,
            destroy: null,
            note_on: null,
            note_off: null,
            all_notes_off: null,
            process: null,
            reset: null,
            set_parameter_value: null
        };

        this.port.onmessage = this.handleMessage.bind(this);

        // Request WASM bytes from main thread
        this.port.postMessage({ type: 'needWasm' });
    }

    handleMessage(event) {
        const { type, data } = event.data;

        if (type === 'wasmBytes') {
            this.initWasm(data, data.sampleRate || 48000);
        } else if (type === 'noteOn') {
            this.handleNoteOn(data.note, data.velocity);
        } else if (type === 'noteOff') {
            this.handleNoteOff(data.note);
        } else if (type === 'allNotesOff') {
            this.allNotesOff();
        } else if (type === 'setParam') {
            this.setParameter(data.index, data.value);
        } else if (type === 'reset') {
            this.reset();
        }
    }

    async initWasm(wasmData, sampleRate) {
        try {
            console.log('[SynthWorklet] Loading Emscripten module...');
            this.sampleRate = sampleRate;

            const moduleCode = wasmData.jsCode;
            const wasmBytes = wasmData.wasmBytes;

            // Eval the Emscripten loader and capture memory reference
            const modifiedCode = moduleCode.replace(
                ';return moduleRtn',
                ';globalThis.__wasmMemory=wasmMemory;return moduleRtn'
            );

            eval(modifiedCode + '\nthis.RGResonate1Module = RGResonate1Module;');

            // Call the factory with WASM bytes
            this.wasmModule = await this.RGResonate1Module({
                wasmBinary: wasmBytes
            });

            // Capture the memory reference
            this.wasmMemory = globalThis.__wasmMemory;
            delete globalThis.__wasmMemory;

            console.log('[SynthWorklet] WASM ready');

            // Map function names
            this.mapWasmFunctions();

            // Allocate audio buffer (stereo interleaved)
            this.audioBufferPtr = this.wasmModule._malloc(this.bufferSize * 2 * 4);

            if (!this.audioBufferPtr) {
                throw new Error('_malloc returned null - memory allocation failed');
            }

            console.log(`[SynthWorklet] Buffer: 0x${this.audioBufferPtr.toString(16)}`);

            // Create synth instance (engine=0 for RESONATE1, sampleRate)
            if (this.wasmFuncs.create) {
                const SYNTH_ENGINE_RESONATE1 = 0;
                this.synthPtr = this.wasmFuncs.create(SYNTH_ENGINE_RESONATE1, this.sampleRate);
                console.log(`[SynthWorklet] Synth created: 0x${this.synthPtr.toString(16)}`);
            } else {
                throw new Error('regroove_synth_create not found in WASM exports');
            }

            this.port.postMessage({ type: 'ready' });
            console.log('[SynthWorklet] ✅ Ready!');
        } catch (error) {
            console.error('[SynthWorklet] ❌ Failed:', error);
            this.port.postMessage({ type: 'error', error: error.message });
        }
    }

    mapWasmFunctions() {
        // Debug: List available functions
        const exportedFuncs = Object.keys(this.wasmModule).filter(k => k.startsWith('_'));
        console.log('[SynthWorklet] Available exports:', exportedFuncs.slice(0, 20));

        // Map Emscripten Module exports
        this.wasmFuncs.create = this.wasmModule._regroove_synth_create;
        this.wasmFuncs.destroy = this.wasmModule._regroove_synth_destroy;
        this.wasmFuncs.reset = this.wasmModule._regroove_synth_reset;
        this.wasmFuncs.note_on = this.wasmModule._regroove_synth_note_on;
        this.wasmFuncs.note_off = this.wasmModule._regroove_synth_note_off;
        this.wasmFuncs.all_notes_off = this.wasmModule._regroove_synth_all_notes_off;
        this.wasmFuncs.process = this.wasmModule._regroove_synth_process_f32;
        this.wasmFuncs.set_parameter_value = this.wasmModule._regroove_synth_set_parameter;

        console.log('[SynthWorklet] ✓ Mapped synth functions');
    }

    handleNoteOn(note, velocity) {
        if (!this.synthPtr || !this.wasmFuncs.note_on) return;
        this.wasmFuncs.note_on(this.synthPtr, note, velocity);
    }

    handleNoteOff(note) {
        if (!this.synthPtr || !this.wasmFuncs.note_off) return;
        this.wasmFuncs.note_off(this.synthPtr, note);
    }

    allNotesOff() {
        if (!this.synthPtr || !this.wasmFuncs.all_notes_off) return;
        this.wasmFuncs.all_notes_off(this.synthPtr);
    }

    setParameter(index, value) {
        if (!this.synthPtr || !this.wasmFuncs.set_parameter_value) return;
        this.wasmFuncs.set_parameter_value(this.synthPtr, index, value);
    }

    reset() {
        if (!this.synthPtr || !this.wasmFuncs.reset) return;
        this.wasmFuncs.reset(this.synthPtr);
    }

    process(inputs, outputs, parameters) {
        if (!this.wasmModule || !this.synthPtr || !this.audioBufferPtr || !this.wasmFuncs.process) {
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

        // Process audio through synth
        this.wasmFuncs.process(this.synthPtr, this.audioBufferPtr, frames, this.sampleRate);

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

registerProcessor('synth-worklet-processor', SynthWorkletProcessor);
