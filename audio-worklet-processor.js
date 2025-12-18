// AudioWorklet Processor for WASM effects
// The URL to the WASM file is passed via the constructor

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

        // WASM function name mappings (mangled keys from Emscripten after rebuild)
        this.WASM_FUNCS = {
            create: {
                model1_trim: 'Ta', model1_sculpt: 'qb', model1_lpf: 'ib', model1_hpf: 'ab',
                distortion: 'd', filter: 'p', eq: 'z', compressor: 'L',
                delay: '$', reverb: 'la', phaser: 'xa', stereo_widen: 'Ja'
            },
            set_enabled: {
                model1_trim: 'Za', model1_hpf: 'eb', model1_lpf: 'mb', model1_sculpt: 'ub',
                distortion: 'j', filter: 't', eq: 'D', compressor: 'P',
                delay: 'da', reverb: 'pa', phaser: 'Ba', stereo_widen: 'Ma'
            },
            reset: {
                model1_trim: 'Va', model1_hpf: 'cb', model1_lpf: 'kb', model1_sculpt: 'sb',
                distortion: 'f', filter: 'q', eq: 'A', compressor: 'M',
                delay: 'ba', reverb: 'na', phaser: 'za', stereo_widen: 'La'
            },
            process: {
                model1_trim: 'Wa', model1_hpf: 'db', model1_lpf: 'lb', model1_sculpt: 'tb',
                distortion: 'i', filter: 's', eq: 'C', compressor: 'O',
                delay: 'ca', reverb: 'oa', phaser: 'Aa', stereo_widen: 'Sa'
            },
            params: {
                model1_trim: { drive: 'Xa' },
                model1_hpf: { cutoff: 'fb' },
                model1_lpf: { cutoff: 'nb' },
                model1_sculpt: { frequency: 'vb', gain: 'wb' },
                distortion: { drive: 'k', mix: 'l' },
                filter: { cutoff: 'u', resonance: 'v' },
                eq: { low: 'E', mid: 'F', high: 'G' },
                compressor: { threshold: 'Q', ratio: 'R', attack: 'S', release: 'T', makeup: 'U' },
                delay: { time: 'ea', feedback: 'fa', mix: 'ga' },
                reverb: { size: 'qa', damping: 'ra', mix: 'sa' },
                phaser: { rate: 'Ca', depth: 'Da', feedback: 'Ea' },
                stereo_widen: { width: 'Na', mix: 'Oa' }
            }
        };

        this.port.onmessage = this.handleMessage.bind(this);

        // Get WASM bytes from the main thread
        this.port.postMessage({ type: 'needWasm' });
    }
    
    handleMessage(event) {
        const { type, data } = event.data;
        
        if (type === 'wasmBytes') {
            this.initWasm(data);  // Just the bytes, not JS code
        } else if (type === 'toggle') {
            this.toggleEffect(data.name, data.enabled);
        } else if (type === 'setParam') {
            this.setParameter(data.effect, data.param, data.value);
        }
    }
    
    async initWasm(wasmBytes) {
        try {
            console.log('[Worklet] Compiling WASM...');
            
            // Compile and instantiate WASM directly
            const wasmModule = await WebAssembly.compile(wasmBytes);
            const instance = await WebAssembly.instantiate(wasmModule, {
                a: {
                    a: (size) => { // _emscripten_resize_heap
                        console.warn('[Worklet] Heap resize requested:', size);
                        return false;
                    }
                }
            });
            
            console.log('[Worklet] WASM instantiated');
            
            // Create module wrapper
            this.wasmModule = {
                ...instance.exports,
                HEAPF32: new Float32Array(instance.exports.b.buffer), // memory.buffer
                _malloc: instance.exports.e,
                _free: instance.exports.h
            };
            
            console.log('[Worklet] WASM ready');
            
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
        const effectNames = [
            'model1_trim', 'model1_sculpt', 'model1_lpf', 'model1_hpf',
            'distortion', 'filter', 'eq', 'compressor',
            'delay', 'reverb', 'phaser', 'stereo_widen'
        ];

        for (const name of effectNames) {
            const createFn = this.wasmModule[this.WASM_FUNCS.create[name]];
            if (createFn) {
                const ptr = createFn();
                // All MODEL 1 effects enabled by default
                const isModel1 = name.startsWith('model1_');
                const defaultEnabled = isModel1;

                this.effects.set(name, {
                    ptr: ptr,
                    name: name,
                    enabled: defaultEnabled
                });

                // Actually enable MODEL 1 effects in WASM
                if (defaultEnabled) {
                    const setEnabledFn = this.wasmModule[this.WASM_FUNCS.set_enabled[name]];
                    if (setEnabledFn) {
                        setEnabledFn(ptr, 1);
                    }
                }

                console.log(`[Worklet] ${name}: 0x${ptr.toString(16)} (${defaultEnabled ? 'enabled' : 'disabled'})`);
            }
        }
    }
    
    toggleEffect(name, enabled) {
        const effect = this.effects.get(name);
        if (!effect || !this.wasmModule) return;

        // Reset filter state BEFORE changing enabled state to clear any artifacts
        const resetFn = this.wasmModule[this.WASM_FUNCS.reset[name]];
        if (resetFn) {
            resetFn(effect.ptr);
        }

        // Set enabled/disabled state
        const setEnabledFn = this.wasmModule[this.WASM_FUNCS.set_enabled[name]];
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

        const funcName = this.WASM_FUNCS.params[effectName]?.[paramName];
        const setFn = funcName && this.wasmModule[funcName];
        if (setFn) {
            setFn(effect.ptr, value);
        }
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
        
        // Update heap view
        const heapF32 = new Float32Array(
            this.wasmModule.b.buffer,  // memory
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
                const processFn = this.wasmModule[this.WASM_FUNCS.process[name]];
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

        // Poll M1 TRIM peak level and send VU meter updates periodically
        this.peakLevelFrameCounter += frames;
        if (this.peakLevelFrameCounter >= 128) {
            this.peakLevelFrameCounter = 0;
            const trimEffect = this.effects.get('model1_trim');
            if (trimEffect && trimEffect.enabled) {
                const getPeakLevelFn = this.wasmModule['$a']; // fx_model1_trim_get_peak_level
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
