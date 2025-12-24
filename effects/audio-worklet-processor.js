// AudioWorklet Processor for WASM effects
// With MINIFY_WASM_IMPORTED_MODULES=0, function names are preserved!

class WasmEffectsProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.wasmModule = null;
        this.effects = new Map();
        this.audioBufferPtr = null;
        this.bufferSize = 8192;
        this.lastFrame = [0, 0]; // Store last frame to prevent clicks
        this.dcBlockerX = [0, 0]; // Previous input for DC blocker
        this.dcBlockerY = [0, 0]; // Previous output for DC blocker
        this.peakLevelFrameCounter = 0; // Counter for peak level polling

        this.port.onmessage = this.handleMessage.bind(this);

        // Get WASM bytes from the main thread
        this.port.postMessage({ type: 'needWasm' });
    }

    handleMessage(event) {
        const { type, data, state } = event.data;

        if (type === 'wasmBytes') {
            this.initWasm(data);  // Just the bytes, not JS code
        } else if (type === 'toggle') {
            this.toggleEffect(data.name, data.enabled);
        } else if (type === 'setParam') {
            this.setParameter(data.effect, data.param, data.value);
        } else if (type === 'getState') {
            const currentState = this.getEffectState();
            this.port.postMessage({ type: 'state', state: currentState });
        } else if (type === 'setState') {
            this.setEffectState(state);
        }
    }

    async initWasm(wasmData) {
        try {
            console.log('[Worklet] Loading Emscripten module...');

            const moduleCode = wasmData.jsCode;
            const wasmBytes = wasmData.wasmBytes;

            // Eval the Emscripten loader and capture memory reference
            // Modify code to expose wasmMemory before it returns
            const modifiedCode = moduleCode.replace(
                ';return moduleRtn',
                ';globalThis.__wasmMemory=wasmMemory;return moduleRtn'
            );

            eval(modifiedCode + '\nthis.RegrooveEffectsModule = RegrooveEffectsModule;');

            // Call the factory with WASM bytes
            this.wasmModule = await this.RegrooveEffectsModule({
                wasmBinary: wasmBytes
            });

            // Capture the memory reference that was exposed
            this.wasmMemory = globalThis.__wasmMemory;
            delete globalThis.__wasmMemory; // Clean up

            console.log('[Worklet] WASM ready!');

            // Allocate audio buffer
            this.audioBufferPtr = this.wasmModule._malloc(this.bufferSize * 2 * 4);
            console.log(`[Worklet] Buffer: 0x${this.audioBufferPtr.toString(16)}`);

            // Initialize all effects
            this.initEffects();

            this.port.postMessage({ type: 'ready' });
            console.log('[Worklet] ✅ Ready!');
        } catch (error) {
            console.error('[Worklet] ❌ Failed:', error);
            this.port.postMessage({ type: 'error', error: error.message });
        }
    }

    initEffects() {
        // Processing order: TRIM → SCULPT → LPF → HPF → other effects
        const effectConfigs = [
            { name: 'model1_trim', prefix: '_fx_model1_trim', defaultEnabled: true },
            { name: 'model1_sculpt', prefix: '_fx_model1_sculpt', defaultEnabled: true },
            { name: 'model1_lpf', prefix: '_fx_model1_lpf', defaultEnabled: true },
            { name: 'model1_hpf', prefix: '_fx_model1_hpf', defaultEnabled: true },
            { name: 'distortion', prefix: '_fx_distortion', defaultEnabled: false },
            { name: 'limiter', prefix: '_fx_limiter', defaultEnabled: false },
            { name: 'filter', prefix: '_fx_filter', defaultEnabled: false },
            { name: 'eq', prefix: '_fx_eq', defaultEnabled: false },
            { name: 'compressor', prefix: '_fx_compressor', defaultEnabled: false },
            { name: 'delay', prefix: '_fx_delay', defaultEnabled: false },
            { name: 'reverb', prefix: '_fx_reverb', defaultEnabled: false },
            { name: 'phaser', prefix: '_fx_phaser', defaultEnabled: false },
            { name: 'stereo_widen', prefix: '_fx_stereo_widen', defaultEnabled: false },
            { name: 'ring_mod', prefix: '_fx_ring_mod', defaultEnabled: false },
            { name: 'vocoder', prefix: '_fx_vocoder', defaultEnabled: false },
            { name: 'pitchshift', prefix: '_fx_pitchshift', defaultEnabled: false }
        ];

        for (const config of effectConfigs) {
            const createFn = this.wasmModule[config.prefix + '_create'];
            if (createFn) {
                const ptr = createFn();

                this.effects.set(config.name, {
                    ptr: ptr,
                    name: config.name,
                    prefix: config.prefix,
                    enabled: config.defaultEnabled
                });

                // Actually enable MODEL 1 effects in WASM
                if (config.defaultEnabled) {
                    const setEnabledFn = this.wasmModule[config.prefix + '_set_enabled'];
                    if (setEnabledFn) {
                        setEnabledFn(ptr, 1);
                    }
                }

                console.log(`[Worklet] ${config.name}: 0x${ptr.toString(16)} (${config.defaultEnabled ? 'enabled' : 'disabled'})`);
            }
        }
    }

    toggleEffect(name, enabled) {
        const effect = this.effects.get(name);
        if (!effect || !this.wasmModule) return;

        // Reset filter state BEFORE changing enabled state to clear any artifacts
        const resetFn = this.wasmModule[effect.prefix + '_reset'];
        if (resetFn) {
            resetFn(effect.ptr);
        }

        // Set enabled/disabled state
        const setEnabledFn = this.wasmModule[effect.prefix + '_set_enabled'];
        if (setEnabledFn) {
            setEnabledFn(effect.ptr, enabled ? 1 : 0);
            effect.enabled = enabled;
        }

        // Reset DC blocker state when toggling to prevent clicks
        this.dcBlockerX = [0, 0];
        this.dcBlockerY = [0, 0];
    }

    setParameter(effectName, paramName, value) {
        const effect = this.effects.get(effectName);
        if (!effect || !this.wasmModule) return;

        // Use direct function name: _fx_effectname_set_parametername
        const funcName = effect.prefix + '_set_' + paramName;
        const setFn = this.wasmModule[funcName];
        if (setFn) {
            setFn(effect.ptr, value);
        }
    }

    getEffectState() {
        const state = { effects: {} };

        // Parameter map for each effect
        const effectParams = {
            'model1_trim': ['drive'],
            'model1_hpf': ['cutoff'],
            'model1_lpf': ['cutoff'],
            'model1_sculpt': ['frequency', 'gain'],
            'distortion': ['drive', 'mix'],
            'limiter': ['threshold', 'release', 'ceiling', 'lookahead'],
            'filter': ['cutoff', 'resonance'],
            'eq': ['low', 'mid', 'high'],
            'compressor': ['threshold', 'ratio', 'attack', 'release', 'makeup'],
            'delay': ['time', 'feedback', 'mix'],
            'reverb': ['size', 'damping', 'mix'],
            'phaser': ['rate', 'depth', 'feedback'],
            'stereo_widen': ['width', 'mix'],
            'ring_mod': ['frequency', 'mix'],
            'vocoder': ['carrier_freq', 'carrier_wave', 'formant_shift', 'release', 'mix', 'carrier_mode', 'midi_note'],
            'pitchshift': ['pitch', 'mix']
        };

        for (const [name, effect] of this.effects) {
            const params = {};

            // Get enabled state
            const getEnabledFn = this.wasmModule[effect.prefix + '_get_enabled'];
            if (getEnabledFn) {
                params.enabled = getEnabledFn(effect.ptr);
            }

            // Get all parameters for this effect
            const paramNames = effectParams[name] || [];
            for (const paramName of paramNames) {
                const getFn = this.wasmModule[effect.prefix + '_get_' + paramName];
                if (getFn) {
                    params[paramName] = getFn(effect.ptr);
                }
            }

            state.effects[name] = params;
        }

        return state;
    }

    setEffectState(state) {
        if (!state || !state.effects) {
            console.log('[Worklet] setState: no state');
            return;
        }

        console.log('[Worklet] Setting state for', Object.keys(state.effects).length, 'effects');

        for (const [name, params] of Object.entries(state.effects)) {
            const effect = this.effects.get(name);
            if (!effect) {
                console.log('[Worklet] Effect not found:', name);
                continue;
            }

            // Set enabled state
            if (params.enabled !== undefined) {
                const setEnabledFn = this.wasmModule[effect.prefix + '_set_enabled'];
                if (setEnabledFn) {
                    setEnabledFn(effect.ptr, params.enabled);
                    console.log('[Worklet]', name, 'enabled:', params.enabled);
                }
            }

            // Set other parameters
            for (const [paramName, value] of Object.entries(params)) {
                if (paramName !== 'enabled') {
                    this.setParameter(name, paramName, value);
                    console.log('[Worklet]', name, paramName, '=', value);
                }
            }
        }

        console.log('[Worklet] ✅ State applied');
        this.port.postMessage({ type: 'stateApplied' });
    }

    process(inputs, outputs, parameters) {
        if (!this.wasmModule || !this.audioBufferPtr) {
            return true;
        }

        const input = inputs[0];
        const output = outputs[0];

        if (!input || !output || input.length === 0) {
            return true;
        }

        const frames = input[0].length;

        // Update heap view - access memory through captured wasmMemory
        const heapF32 = new Float32Array(
            this.wasmMemory.buffer,
            this.audioBufferPtr,
            frames * 2
        );

        // Interleave input with DC blocker
        const inputL = input[0];
        const inputR = input[1] || input[0];

        for (let i = 0; i < frames; i++) {
            heapF32[i * 2] = inputL[i];
            heapF32[i * 2 + 1] = inputR[i];
        }

        // Process through enabled effects
        for (const [name, effect] of this.effects) {
            if (effect.enabled) {
                // Determine process function based on effect type
                // model1_ and stereo_widen use interleaved processing
                const processSuffix = (name.startsWith('model1_') || name === 'stereo_widen')
                    ? '_process_interleaved'
                    : '_process_f32';
                const processFn = this.wasmModule[effect.prefix + processSuffix];

                if (processFn) {
                    processFn(effect.ptr, this.audioBufferPtr, frames, sampleRate);
                }
            }
        }

        // De-interleave output with soft clipping and DC removal
        const outputL = output[0];
        const outputR = output[1] || output[0];

        const alpha = 0.995; // DC blocker coefficient

        // Track stereo peaks while de-interleaving
        let leftPeak = 0;
        let rightPeak = 0;

        for (let i = 0; i < frames; i++) {
            let l = heapF32[i * 2];
            let r = heapF32[i * 2 + 1];

            // Only soft clip if signal is actually clipping (> 1.0)
            if (Math.abs(l) > 1.0) {
                l = Math.sign(l) * Math.tanh(Math.abs(l));
            }
            if (Math.abs(r) > 1.0) {
                r = Math.sign(r) * Math.tanh(Math.abs(r));
            }

            outputL[i] = l;
            outputR[i] = r;

            // Track peaks for VU meter
            leftPeak = Math.max(leftPeak, Math.abs(l));
            rightPeak = Math.max(rightPeak, Math.abs(r));
        }

        // Send stereo peaks to main thread every 128 frames (~3ms at 48kHz)
        this.peakLevelFrameCounter += frames;
        if (this.peakLevelFrameCounter >= 128) {
            this.peakLevelFrameCounter = 0;

            // Get TRIM peak level using direct function name
            const trimEffect = this.effects.get('model1_trim');
            if (trimEffect && trimEffect.enabled) {
                const getPeakLevelFn = this.wasmModule._fx_model1_trim_get_peak_level;
                if (getPeakLevelFn) {
                    const peakLevel = getPeakLevelFn(trimEffect.ptr);
                    this.port.postMessage({ type: 'peakLevel', level: peakLevel });
                }
            }

            // Send stereo peaks for VU meter
            this.port.postMessage({
                type: 'stereoPeaks',
                left: leftPeak,
                right: rightPeak
            });
        }

        return true;
    }
}

registerProcessor('wasm-effects-processor', WasmEffectsProcessor);
