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
        const effects = [
            { name: 'distortion', create: 'd', prefix: 'distortion' },
            { name: 'filter', create: 'p', prefix: 'filter' },
            { name: 'eq', create: 'z', prefix: 'eq' },
            { name: 'compressor', create: 'L', prefix: 'compressor' },
            { name: 'delay', create: 'Z', prefix: 'delay' },
            { name: 'reverb', create: 'ja', prefix: 'reverb' },
            { name: 'phaser', create: 'va', prefix: 'phaser' }
        ];
        
        for (const effect of effects) {
            const createFn = this.wasmModule[effect.create];
            if (createFn) {
                const ptr = createFn();
                this.effects.set(effect.name, {
                    ptr: ptr,
                    name: effect.name,
                    enabled: false
                });
                console.log(`[Worklet] ${effect.name}: 0x${ptr.toString(16)}`);
            }
        }
    }
    
    toggleEffect(name, enabled) {
        const effect = this.effects.get(name);
        if (!effect || !this.wasmModule) return;

        // Map to mangled names
        const toggleMap = {
            distortion: 'j', filter: 't', eq: 'D', compressor: 'P',
            delay: 'ba', reverb: 'na', phaser: 'za'
        };

        const resetMap = {
            distortion: 'f', filter: 'q', eq: 'A', compressor: 'M',
            delay: '$', reverb: 'la', phaser: 'xa'
        };

        // Always reset effect state when toggling to avoid clicks
        const resetFn = this.wasmModule[resetMap[name]];
        if (resetFn) {
            resetFn(effect.ptr);
        }

        const setEnabledFn = this.wasmModule[toggleMap[name]];
        if (setEnabledFn) {
            setEnabledFn(effect.ptr, enabled ? 1 : 0);
            effect.enabled = enabled;
        }

        // Reset DC blocker state when toggling effects to prevent clicks
        this.dcBlockerX = [0, 0];
        this.dcBlockerY = [0, 0];
    }
    
    setParameter(effectName, paramName, value) {
        const effect = this.effects.get(effectName);
        if (!effect || !this.wasmModule) return;
        
        // Map to mangled function names
        const paramMap = {
            distortion: { drive: 'k', mix: 'l' },
            filter: { cutoff: 'u', resonance: 'v' },
            eq: { low: 'E', mid: 'F', high: 'G' },
            compressor: { threshold: 'Q', ratio: 'R', attack: 'S', release: 'T' },
            delay: { time: 'ca', feedback: 'da', mix: 'ea' },
            reverb: { size: 'oa', damping: 'pa', mix: 'qa' },
            phaser: { rate: 'Aa', depth: 'Ba', feedback: 'Ca' }
        };
        
        const funcName = paramMap[effectName]?.[paramName];
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
        const processMap = {
            distortion: 'i', filter: 's', eq: 'C', compressor: 'O',
            delay: 'aa', reverb: 'ma', phaser: 'ya'
        };
        
        for (const [name, effect] of this.effects) {
            if (effect.enabled) {
                const processFn = this.wasmModule[processMap[name]];
                if (processFn) {
                    processFn(effect.ptr, this.audioBufferPtr, frames, 48000);
                }
            }
        }
        
        // De-interleave output with soft clipping and DC removal
        const outputL = output[0];
        const outputR = output[1] || output[0];

        const alpha = 0.995; // DC blocker coefficient

        for (let i = 0; i < frames; i++) {
            let l = heapF32[i * 2];
            let r = heapF32[i * 2 + 1];

            // Proper DC blocker (high-pass filter): y[n] = x[n] - x[n-1] + alpha * y[n-1]
            const dcL = l - this.dcBlockerX[0] + alpha * this.dcBlockerY[0];
            const dcR = r - this.dcBlockerX[1] + alpha * this.dcBlockerY[1];

            this.dcBlockerX[0] = l;
            this.dcBlockerX[1] = r;
            this.dcBlockerY[0] = dcL;
            this.dcBlockerY[1] = dcR;

            // Soft clip to prevent harsh distortion
            l = Math.tanh(dcL * 0.8);
            r = Math.tanh(dcR * 0.8);

            // Smooth crossfade at buffer boundaries to prevent clicks
            if (i < 8) {
                const fade = i / 8;
                l = this.lastFrame[0] * (1 - fade) + l * fade;
                r = this.lastFrame[1] * (1 - fade) + r * fade;
            }

            outputL[i] = l;
            outputR[i] = r;

            // Store last few samples for next buffer
            if (i === frames - 1) {
                this.lastFrame[0] = l;
                this.lastFrame[1] = r;
            }
        }
        
        return true;
    }
}

registerProcessor('wasm-effects-processor', WasmEffectsProcessor);
