// Regroove Effects - WASM ONLY VERSION
// NO FALLBACK - Requires compiled WebAssembly

class AudioEffectsProcessor {
    constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.analyser = null;
        this.isPlaying = false;
        this.audioBuffer = null;
        this.micStream = null;
        this.selectedMicDeviceId = null;
        this.playbackGain = null;  // For fade out
        
        this.wasmModule = null;
        this.workletNode = null;
    }

    async init() {
        console.log('🚀 Initializing Regroove Effects (WASM ONLY)');
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.connect(this.audioContext.destination);
        
        updateStatus('Loading WebAssembly...', 'fallback');
        
        await this.initWasm();
        
        console.log('✅ WASM READY - Using Real C Code!');
        updateStatus('✅ WASM LOADED - Real C Implementation', 'wasm');
        
        await this.enumerateDevices();
    }

    async initWasm() {
        console.log('📡 Loading WASM files...');
        
        // Load both the JS and WASM files from main thread
        const [jsResponse, wasmResponse] = await Promise.all([
            fetch('regroove-effects.js'),
            fetch('regroove-effects.wasm')
        ]);
        
        if (!jsResponse.ok || !wasmResponse.ok) {
            throw new Error('❌ WASM files not found! Run: cd web && ./build.sh');
        }
        
        console.log('📦 Reading WASM...');
        const jsCode = await jsResponse.text();
        const wasmBytes = await wasmResponse.arrayBuffer();
        
        console.log('🎛️ Registering AudioWorklet...');
        await this.audioContext.audioWorklet.addModule('audio-worklet-processor.js');
        
        console.log('🔧 Creating worklet...');
        this.workletNode = new AudioWorkletNode(this.audioContext, 'wasm-effects-processor');
        
        // Wait for worklet to ask for WASM
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Worklet timeout')), 10000);
            
            this.workletNode.port.onmessage = (e) => {
                if (e.data.type === 'needWasm') {
                    console.log('📨 Sending WASM to worklet...');
                    this.workletNode.port.postMessage({
                        type: 'wasmBytes',
                        data: wasmBytes
                    }, [wasmBytes]);
                } else if (e.data.type === 'ready') {
                    clearTimeout(timeout);
                    console.log('✅ Worklet ready!');
                    resolve();
                } else if (e.data.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(`Worklet: ${e.data.error}`));
                } else if (e.data.type === 'peakLevel') {
                    // Update M1 TRIM LED indicator
                    this.updateTrimLED(e.data.level);
                }
            };
        });
        
        this.workletNode.connect(this.analyser);
        
        console.log('🎉 COMPLETE!');
        console.log('🔊 Audio: Source → WASM → Speakers');
    }

    async enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            
            const selector = document.getElementById('micDeviceList');
            selector.innerHTML = '<option value="">Default Microphone</option>';
            
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${selector.options.length}`;
                selector.appendChild(option);
            });
            
            if (audioInputs.length > 0) {
                document.getElementById('micDeviceSelector').style.display = 'block';
            }
            
            selector.onchange = () => {
                this.selectedMicDeviceId = selector.value || null;
                console.log('🎤 Selected device:', selector.options[selector.selectedIndex].text);
            };
        } catch (error) {
            console.warn('Could not enumerate devices:', error);
        }
    }

    toggleEffect(name, enabled) {
        this.workletNode.port.postMessage({
            type: 'toggle',
            data: { name, enabled }
        });
    }

    setParameter(effectName, paramName, value) {
        this.workletNode.port.postMessage({
            type: 'setParam',
            data: { effect: effectName, param: paramName, value }
        });
    }

    updateTrimLED(peakLevel) {
        const led = document.getElementById('trim-drive-led');
        if (!led) return;

        // LED glows based on peak level (matching plugin behavior)
        // Starts glowing at 0.5 (-6dB), full red at 1.0+ (0dB/clipping)
        const threshold = 0.5;
        let glow = (peakLevel - threshold) / (1.0 - threshold);
        glow = Math.max(0, Math.min(glow, 1)); // Clamp 0-1

        // Fill the circle based on glow level
        if (glow > 0.01) {
            const r = Math.round(180 + glow * 75); // 180 -> 255
            led.style.backgroundColor = `rgb(${r}, 0, 0)`;
            const shadowIntensity = 3 + glow * 8;
            led.style.boxShadow = `
                0 0 ${shadowIntensity}px rgba(255, 0, 0, ${glow * 0.8}),
                inset 0 0 3px rgba(255, 255, 255, ${glow * 0.3})
            `;
        } else {
            // Dark/off state
            led.style.backgroundColor = '#300';
            led.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.5)';
        }
    }

    async loadAudioFile(file) {
        console.log(`📂 Loading: ${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        console.log(`✅ Loaded: ${(this.audioBuffer.duration).toFixed(1)}s @ ${this.audioBuffer.sampleRate}Hz`);
    }

    async startMicrophone() {
        // Stop any playing audio first
        if (this.sourceNode && this.sourceNode.stop) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Already stopped
            }
            this.sourceNode = null;
        }

        // Stop any existing microphone
        if (this.micStream) {
            this.stopMicrophone();
        }

        // CRITICAL: Resume AudioContext (browsers suspend it until user interaction)
        if (this.audioContext.state !== 'running') {
            console.log(`⚠️ AudioContext state: ${this.audioContext.state}`);
            await this.audioContext.resume();
            console.log(`✅ AudioContext resumed: ${this.audioContext.state}`);
        }

        // Request stereo audio input
        const constraints = {
            audio: {
                deviceId: this.selectedMicDeviceId ? { exact: this.selectedMicDeviceId } : undefined,
                channelCount: 2,  // Request stereo
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        console.log('🎤 Starting microphone...');
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Log actual track settings
        const track = this.micStream.getAudioTracks()[0];
        const settings = track.getSettings();
        console.log(`   Track settings: ${settings.channelCount} channels @ ${settings.sampleRate}Hz`);

        const source = this.audioContext.createMediaStreamSource(this.micStream);

        // CRITICAL: Preserve stereo channels
        source.channelCount = 2;
        source.channelCountMode = 'explicit';
        source.channelInterpretation = 'speakers';

        this.sourceNode = source;

        console.log('🔗 Mic → WASM');
        console.log(`   Source channels: ${source.channelCount}`);
        this.sourceNode.connect(this.workletNode);

        this.isPlaying = true;
        console.log('✅ Microphone active');
        console.log(`   AudioContext: ${this.audioContext.state}`);
        console.log(`   Sample rate: ${this.audioContext.sampleRate}Hz`);
    }

    stopMicrophone() {
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        this.isPlaying = false;
        console.log('⏹ Microphone stopped');

        // Reset Drive LED when microphone stops
        this.updateTrimLED(0);
    }

    play() {
        // Stop microphone if active
        if (this.micStream) {
            this.stopMicrophone();
        }

        // Stop any existing playback
        if (this.sourceNode && this.sourceNode.stop) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Already stopped
            }
        }

        if (this.audioBuffer) {
            console.log('▶️ Playing (looped)...');
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = this.audioBuffer;
            this.sourceNode.loop = true;  // Enable looping

            console.log('🔗 File → WASM');
            this.sourceNode.connect(this.workletNode);

            this.sourceNode.start(0);
            this.isPlaying = true;

            this.sourceNode.onended = () => {
                this.isPlaying = false;
                updatePlaybackButtons();
                console.log('⏹ Playback ended');
            };
        }
    }

    generateTestSignal(type) {
        console.log(`🔊 Generating ${type} signal...`);
        const duration = 5;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(2, duration * sampleRate, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            
            if (type === 'sine') {
                const freq = 440;
                for (let i = 0; i < data.length; i++) {
                    data[i] = Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.5;
                }
            } else if (type === 'noise') {
                for (let i = 0; i < data.length; i++) {
                    data[i] = (Math.random() * 2 - 1) * 0.3;
                }
            } else if (type === 'sweep') {
                const startFreq = 20;
                const endFreq = 20000;
                const logRatio = Math.log(endFreq / startFreq);

                // Exponential sweep with continuous phase
                for (let i = 0; i < data.length; i++) {
                    const t = i / sampleRate;
                    const progress = t / duration;

                    // Phase accumulation for exponential sweep (integral of frequency)
                    // phase(t) = 2π * f0 * T / ln(f1/f0) * [(f1/f0)^(t/T) - 1]
                    const phase = 2 * Math.PI * startFreq * duration / logRatio *
                                  (Math.exp(logRatio * progress) - 1);

                    data[i] = Math.sin(phase) * 0.3;
                }
            }
        }
        
        this.audioBuffer = buffer;
        console.log('✅ Test signal ready');
    }

    stop() {
        if (this.sourceNode && this.sourceNode.stop) {
            try {
                // Create a fade-out gain node
                const fadeGain = this.audioContext.createGain();
                const fadeTime = 0.05;
                const now = this.audioContext.currentTime;

                // Reconnect through fade gain
                this.sourceNode.disconnect();
                this.sourceNode.connect(fadeGain);
                fadeGain.connect(this.workletNode);

                // Fade out
                fadeGain.gain.setValueAtTime(1.0, now);
                fadeGain.gain.linearRampToValueAtTime(0, now + fadeTime);

                // Stop after fade
                setTimeout(() => {
                    try {
                        if (this.sourceNode) {
                            this.sourceNode.stop();
                            this.sourceNode.disconnect();
                            this.sourceNode = null;
                        }
                        fadeGain.disconnect();
                    } catch (e) {
                        // Ignore - already stopped
                    }
                }, fadeTime * 1000 + 10);

            } catch (e) {
                // Fallback - just stop immediately
                try {
                    this.sourceNode.stop();
                    this.sourceNode.disconnect();
                    this.sourceNode = null;
                } catch (e2) {
                    // Ignore
                }
            }
        }
        this.stopMicrophone();
        this.isPlaying = false;

        // Reset Drive LED when playback stops
        this.updateTrimLED(0);
    }

    getAnalyserData() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }
}

// UI Controller
const processor = new AudioEffectsProcessor();
let visualizerAnimationId = null;

// MODEL 1 input effects (all enabled by default)
// Display order: TRIM → HPF → SCULPT → LPF
const model1EffectDefinitions = [
    { name: 'model1_trim', title: 'M1 Trim', params: ['drive'], enabledByDefault: true },
    { name: 'model1_hpf', title: 'M1 HPF', params: ['cutoff'], enabledByDefault: true },
    { name: 'model1_sculpt', title: 'M1 Sculpt', params: ['frequency', 'gain'], enabledByDefault: true },
    { name: 'model1_lpf', title: 'M1 LPF', params: ['cutoff'], enabledByDefault: true }
];

// Standard effects (with on/off toggle)
const effectDefinitions = [
    { name: 'distortion', title: 'Distortion', params: ['drive', 'mix'] },
    { name: 'filter', title: 'Filter', params: ['cutoff', 'resonance'] },
    { name: 'eq', title: 'EQ', params: ['low', 'mid', 'high'] },
    { name: 'compressor', title: 'Compressor', params: ['threshold', 'ratio', 'attack', 'release'] },
    { name: 'delay', title: 'Delay', params: ['time', 'feedback', 'mix'] },
    { name: 'reverb', title: 'Reverb', params: ['size', 'damping', 'mix'] },
    { name: 'phaser', title: 'Phaser', params: ['rate', 'depth', 'feedback'] }
];

function createModel1UI() {
    const container = document.getElementById('model1-effects');
    if (!container) return;

    model1EffectDefinitions.forEach(def => {
        const card = document.createElement('div');
        card.className = 'effect-card';
        card.id = `effect-${def.name}`;

        const header = document.createElement('div');
        header.className = 'effect-header';

        const title = document.createElement('div');
        title.className = 'effect-title';
        title.textContent = def.title;

        // Add toggle switch for all MODEL 1 effects
        const toggle = document.createElement('div');
        const enabledByDefault = def.enabledByDefault || false;
        toggle.className = enabledByDefault ? 'toggle-switch active' : 'toggle-switch';
        toggle.dataset.enabled = enabledByDefault ? 'true' : 'false';
        toggle.onclick = () => {
            const enabled = toggle.dataset.enabled !== 'true';
            toggle.dataset.enabled = enabled;
            processor.toggleEffect(def.name, enabled);
            toggle.classList.toggle('active', enabled);
            card.classList.toggle('enabled', enabled);

            // CRITICAL: Re-send current parameter values when enabling
            if (enabled) {
                def.params.forEach(paramName => {
                    const knob = document.getElementById(`${def.name}-${paramName}-knob`);
                    if (knob) {
                        const value = parseFloat(knob.getAttribute('value')) / 100;
                        processor.setParameter(def.name, paramName, value);
                        console.log(`[Toggle] Restoring ${def.name}.${paramName} = ${value}`);
                    }
                });
            }
        };
        header.appendChild(toggle);
        if (enabledByDefault) {
            card.classList.add('enabled');
        }

        header.appendChild(title);
        card.appendChild(header);

        // Create knobs container for parameters
        const knobsContainer = document.createElement('div');
        knobsContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center;';

        def.params.forEach((paramName, idx) => {
            // Set defaults based on effect and parameter
            let defaultValue = 50;
            if (def.name === 'model1_trim' && paramName === 'drive') {
                defaultValue = 70; // 0.7 = neutral, no drive
            } else if (def.name === 'model1_hpf' && paramName === 'cutoff') {
                defaultValue = 0; // FLAT (20Hz)
            } else if (def.name === 'model1_lpf' && paramName === 'cutoff') {
                defaultValue = 100; // FLAT (20kHz)
            } else if (def.name === 'model1_sculpt') {
                if (paramName === 'frequency') {
                    defaultValue = 50; // Mid frequency
                } else if (paramName === 'gain') {
                    defaultValue = 50; // 0dB (neutral)
                }
            }

            // Container for knob + LED
            const knobWrapper = document.createElement('div');
            const isTrim = def.name === 'model1_trim' && paramName === 'drive';
            knobWrapper.style.cssText = isTrim
                ? 'display: flex; flex-direction: row; align-items: center; gap: 20px;'
                : 'display: flex; flex-direction: column; align-items: center;';

            // Use pad-knob component for each parameter
            const knob = document.createElement('pad-knob');
            knob.id = `${def.name}-${paramName}-knob`;
            // For TRIM effect, label it as "TRIM" not "DRIVE"
            knob.setAttribute('label', isTrim ? 'TRIM' : paramName.toUpperCase());
            knob.setAttribute('cc', String(idx + 1));
            knob.setAttribute('value', String(defaultValue));
            knob.setAttribute('min', '0');
            knob.setAttribute('max', '100');
            knob.style.cssText = 'width: 100px; height: 140px;';

            // Listen for value changes
            knob.addEventListener('cc-change', (e) => {
                const value = e.detail.value / 100;
                processor.setParameter(def.name, paramName, value);
            });

            knobWrapper.appendChild(knob);

            // Add LED indicator for TRIM drive
            if (isTrim) {
                const ledContainer = document.createElement('div');
                ledContainer.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 5px;';

                const led = document.createElement('div');
                led.id = 'trim-drive-led';
                led.style.cssText = `
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background-color: #300;
                    border: 2px solid #666;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
                    transition: background-color 0.05s, box-shadow 0.05s;
                `;

                const ledLabel = document.createElement('div');
                ledLabel.textContent = 'DRIVE';
                ledLabel.style.cssText = 'color: #aaa; font-size: 11px; font-weight: bold; margin-top: 2px;';

                ledContainer.appendChild(led);
                ledContainer.appendChild(ledLabel);
                knobWrapper.appendChild(ledContainer);

                // Store LED reference for later updates
                window.trimDriveLED = led;
            }

            knobsContainer.appendChild(knobWrapper);
        });

        card.appendChild(knobsContainer);
        container.appendChild(card);
    });

    // Set default values for Model 1 effects
    processor.setParameter('model1_trim', 'drive', 0.7);
    processor.setParameter('model1_hpf', 'cutoff', 0.0);  // FLAT (20Hz)
    processor.setParameter('model1_lpf', 'cutoff', 1.0);  // FLAT (20kHz)
    processor.setParameter('model1_sculpt', 'frequency', 0.5);  // Mid frequency
    processor.setParameter('model1_sculpt', 'gain', 0.5);  // 0dB neutral
}

function createEffectUI() {
    const container = document.getElementById('effects');

    effectDefinitions.forEach(def => {
        const card = document.createElement('div');
        card.className = 'effect-card';
        card.id = `effect-${def.name}`;
        
        const header = document.createElement('div');
        header.className = 'effect-header';
        
        const title = document.createElement('div');
        title.className = 'effect-title';
        title.textContent = def.title;
        
        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch';
        toggle.dataset.enabled = 'false';
        toggle.onclick = () => {
            const enabled = toggle.dataset.enabled !== 'true';
            toggle.dataset.enabled = enabled;
            processor.toggleEffect(def.name, enabled);
            toggle.classList.toggle('active', enabled);
            card.classList.toggle('enabled', enabled);

            // CRITICAL: Re-send current parameter values when enabling
            if (enabled) {
                def.params.forEach(paramName => {
                    const knob = document.getElementById(`${def.name}-${paramName}-knob`);
                    if (knob) {
                        const value = parseFloat(knob.getAttribute('value')) / 100;
                        processor.setParameter(def.name, paramName, value);
                        console.log(`[Toggle] Restoring ${def.name}.${paramName} = ${value}`);
                    }
                });
            }
        };

        header.appendChild(title);
        header.appendChild(toggle);
        card.appendChild(header);
        
        // Create knobs container for parameters
        const knobsContainer = document.createElement('div');
        knobsContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center;';

        def.params.forEach((paramName, idx) => {
            const defaultValue = 50;

            // Use pad-knob component for each parameter
            const knob = document.createElement('pad-knob');
            knob.id = `${def.name}-${paramName}-knob`;
            knob.setAttribute('label', paramName.toUpperCase());
            knob.setAttribute('cc', String(idx + 1));
            knob.setAttribute('value', String(defaultValue));
            knob.setAttribute('min', '0');
            knob.setAttribute('max', '100');
            knob.style.cssText = 'width: 100px; height: 140px;';

            // Listen for value changes
            knob.addEventListener('cc-change', (e) => {
                const value = e.detail.value / 100;
                processor.setParameter(def.name, paramName, value);
            });

            knobsContainer.appendChild(knob);
        });

        card.appendChild(knobsContainer);
        
        container.appendChild(card);
    });
}

function drawSpectrum() {
    const canvas = document.getElementById('spectrum');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = processor.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    processor.analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        const hue = (i / bufferLength) * 20; // Red spectrum
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

function drawVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Initialize spectrum canvas
    const spectrumCanvas = document.getElementById('spectrum');
    if (spectrumCanvas) {
        spectrumCanvas.width = spectrumCanvas.offsetWidth;
        spectrumCanvas.height = spectrumCanvas.offsetHeight;
    }

    const draw = () => {
        visualizerAnimationId = requestAnimationFrame(draw);

        const dataArray = processor.getAnalyserData();
        const bufferLength = dataArray.length;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (canvas.height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#CF1A37';
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // Draw spectrum analyzer
        drawSpectrum();
    };

    draw();
}

function updatePlaybackButtons() {
    document.getElementById('playBtn').disabled = !processor.audioBuffer || processor.isPlaying;
    document.getElementById('stopBtn').disabled = !processor.isPlaying;
}

function updateStatus(message, type = 'fallback') {
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const modeIndicator = document.getElementById('mode-indicator');
    
    statusText.textContent = message;
    statusBar.className = `status-bar ${type}`;
    modeIndicator.textContent = type === 'wasm' ? '[WASM]' : '[LOADING...]';
}

// Event Listeners
document.getElementById('audioFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            // Stop microphone if active when loading new audio
            if (processor.micStream) {
                processor.stopMicrophone();
                document.getElementById('micBtn').textContent = '🎤 Microphone';
            }
            updateStatus(`Loading: ${file.name}...`, 'wasm');
            await processor.loadAudioFile(file);
            updateStatus(`Ready: ${file.name}`, 'wasm');
            updatePlaybackButtons();
        } catch (error) {
            updateStatus(`Error: ${error.message}`, 'fallback');
        }
    }
});

document.getElementById('micBtn').addEventListener('click', async () => {
    try {
        if (processor.micStream) {
            processor.stopMicrophone();
            updateStatus('Microphone stopped', 'wasm');
            document.getElementById('micBtn').textContent = '🎤 Microphone';
        } else {
            await processor.startMicrophone();
            updateStatus('Microphone ACTIVE', 'wasm');
            document.getElementById('micBtn').textContent = '🎤 Stop Mic';
        }
        updatePlaybackButtons();
    } catch (error) {
        updateStatus(`Mic error: ${error.message}`, 'fallback');
    }
});

document.getElementById('playBtn').addEventListener('click', () => {
    processor.play();
    updatePlaybackButtons();
    // Reset mic button text if mic was stopped
    document.getElementById('micBtn').textContent = '🎤 Microphone';
});

document.getElementById('stopBtn').addEventListener('click', () => {
    processor.stop();
    updatePlaybackButtons();
    document.getElementById('micBtn').textContent = '🎤 Microphone';
    updateStatus('Stopped', 'wasm');
});

document.getElementById('testSignal').addEventListener('change', (e) => {
    if (e.target.value) {
        // Stop microphone if active (generating test signal is like loading a file)
        if (processor.micStream) {
            processor.stopMicrophone();
            document.getElementById('micBtn').textContent = '🎤 Microphone';
        }
        processor.generateTestSignal(e.target.value);
        updateStatus(`Test: ${e.target.value}`, 'wasm');
        updatePlaybackButtons();
        e.target.value = '';
    }
});

// Initialize
(async () => {
    try {
        await processor.init();
        createModel1UI();
        createEffectUI();
        drawVisualizer();
    } catch (error) {
        updateStatus(`❌ ERROR: ${error.message}`, 'fallback');
        console.error('INIT ERROR:', error);
        console.error('Stack:', error.stack);
    }
})();
