// AudioInputSource - Web Audio API integration with frequency analysis

class AudioInputSource {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.mediaElementSource = null; // MediaElementSource for video/audio files
        this.connectedMediaElement = null; // Track which media element we're connected to
        this.frequencyData = null;
        this.timeDomainData = null;
        this.isActive = false;
        this.isPaused = false; // For pausing analysis when source is inactive
        this.listeners = new Map();
        this.inputGain = null; // Pre-EQ input gain control
        this.monitorGain = null; // For audio monitoring (hearing the input)
        this.monitoringEnabled = false;
        this.deviceName = null; // Friendly device name
        this.sourceType = 'audio'; // Track source type: 'audio' (microphone) or 'media' (media element)

        // Beat detection
        this.beatDetector = {
            threshold: 1.6, // Higher threshold = less sensitive (was 1.3)
            decay: 0.98,
            minTimeBetweenBeats: 400, // Longer gap between beats (was 200ms)
            lastBeatTime: 0,
            energyHistory: [],
            maxHistoryLength: 43 // ~1 second at 60fps
        };

        // Note duration tracking for auto-release
        this.noteTimers = new Map(); // Track timers for auto note-off
        this.noteDuration = 60; // ms - VERY SHORT notes to prevent cacophony
        this.noteLastTrigger = new Map(); // Track last trigger time per note
        this.noteCooldown = 300; // ms - long cooldown to prevent rapid re-triggering

        // Frequency bands
        this.bands = {
            sub: { low: 20, high: 60 },      // Sub bass
            bass: { low: 60, high: 250 },    // Bass
            lowMid: { low: 250, high: 500 }, // Low mids
            mid: { low: 500, high: 2000 },   // Mids
            highMid: { low: 2000, high: 4000 }, // High mids
            high: { low: 4000, high: 20000 } // Highs
        };

        // Frequency note state tracking (for Note ON/OFF)
        this.activeFrequencyNotes = new Set();
    }

    async initialize(options = {}) {
        try {
            // Get desired sample rate from settings (match microphone request)
            const desiredSampleRate = parseInt(localStorage.getItem('audioSampleRate') || '48000');

            // Create audio context with proper configuration for Android
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext({
                sampleRate: desiredSampleRate,
                latencyHint: 'playback' // Better for monitoring, less aggressive processing
            });

            console.log('[AudioInput] AudioContext created - sampleRate:', this.audioContext.sampleRate, 'Hz (requested:', desiredSampleRate, 'Hz)');

            // Create WASM effects processor (handles M1 TRIM, Kill EQ, etc.)
            this.wasmEffects = new WasmEffectsProcessor(this.audioContext);
            await this.wasmEffects.initialize();

            // Set inputGain to the WASM effects worklet (which has M1 TRIM built in)
            // Note: We use .workletNode directly here because we need port.postMessage access
            // For audio routing, you can also use: this.wasmEffects.connect(destination)
            this.inputGain = this.wasmEffects.workletNode;

            // Verify WASM worklet is ready
            if (!this.inputGain) {
                throw new Error('WASM effects worklet failed to initialize - inputGain is null');
            }

            this.m1TrimReady = true;

            // Enable M1 TRIM effect (EQ is already enabled by WasmEffectsProcessor.initialize())
            this.inputGain.port.postMessage({
                type: 'toggle',
                data: { name: 'model1_trim', enabled: true }
            });

            // Set default M1 TRIM value (0.7 = neutral)
            this.inputGain.port.postMessage({
                type: 'setParam',
                data: { effect: 'model1_trim', param: 'drive', value: 0.7 }
            });

            // Listen for peak level messages from worklet
            this.inputGain.port.onmessage = (e) => {
                if (e.data.type === 'peakLevel') {
                    // Emit event for local handling (if needed)
                    this.emit('trimPeakLevel', { level: e.data.level });
                }
            };

            console.log('[AudioInput] WASM effects worklet ready (M1 TRIM + Kill EQ enabled)');

            // Create analyser (mono - for frequency analysis)
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = options.fftSize || 2048;
            this.analyser.smoothingTimeConstant = options.smoothing || 0.8;

            // Create STEREO analysers for oscilloscope music
            this.stereoSplitter = this.audioContext.createChannelSplitter(2);
            this.analyserLeft = this.audioContext.createAnalyser();
            this.analyserLeft.fftSize = options.fftSize || 2048;
            this.analyserLeft.smoothingTimeConstant = 0.0; // No smoothing for oscilloscope
            this.analyserRight = this.audioContext.createAnalyser();
            this.analyserRight.fftSize = options.fftSize || 2048;
            this.analyserRight.smoothingTimeConstant = 0.0;
            console.log('[AudioInput] Created stereo analysers for oscilloscope music');

            // Create gain node for audio monitoring
            this.monitorGain = this.audioContext.createGain();
            this.monitorGain.gain.value = 1.0; // Full volume
            console.log('[AudioInput] Created monitor gain node');

            // Allocate buffers
            const bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeDomainData = new Uint8Array(bufferLength);

            console.log('[AudioInput] Initialized (no source yet)');
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to initialize:', error);
            return false;
        }
    }

    // Connect the audio processing chain (single place for all connection logic)
    connectAudioChain(sourceNode, sourceName) {
        // CRITICAL: Check if inputGain is ready (WASM worklet initialized)
        if (!this.inputGain) {
            console.error('[AudioInput] ❌ Cannot connect audio chain - inputGain is null (WASM initialization failed?)');
            throw new Error('Audio processing chain not initialized - check WASM effects initialization');
        }

        // CRITICAL: Ensure inputGain preserves stereo
        this.inputGain.channelCount = 2;
        this.inputGain.channelCountMode = 'max';
        this.inputGain.channelInterpretation = 'speakers';

        // Connect source to inputGain (WASM effects worklet with M1 TRIM + EQ)
        sourceNode.connect(this.inputGain);

        // Connect stereo splitter for oscilloscope
        this.inputGain.connect(this.stereoSplitter);
        this.stereoSplitter.connect(this.analyserLeft, 0); // Left channel
        this.stereoSplitter.connect(this.analyserRight, 1); // Right channel

        // Connect outputs (inputGain IS the wasmEffects worklet, so connect it directly)
        this.inputGain.connect(this.analyser);
        this.inputGain.connect(this.monitorGain);

        console.log(`[AudioInput] ✓ Audio chain: ${sourceName} → inputGain (M1 TRIM + EQ worklet) → outputs`);
    }

    async connectMicrophone(deviceId = null) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            // Get sample rate from settings
            const sampleRate = parseInt(localStorage.getItem('audioSampleRate') || '48000');

            // Build audio constraints
            const audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: { ideal: sampleRate }
            };

            // Add device ID if specified
            if (deviceId) {
                audioConstraints.deviceId = { exact: deviceId };
            }

            console.log('[AudioInput] Requesting sample rate:', sampleRate, 'Hz');

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });

            // Log which device was actually selected
            const tracks = stream.getAudioTracks();
            if (tracks.length > 0) {
                const track = tracks[0];
                const actualSettings = track.getSettings();
                const actualSampleRate = actualSettings.sampleRate || 'unknown';

                // Store friendly device name
                this.deviceName = track.label || 'Unknown Device';

                console.log('[AudioInput] ═══════════════════════════════════════');
                console.log('[AudioInput] Using audio device:', track.label);
                console.log('[AudioInput] REQUESTED sample rate:', sampleRate, 'Hz');
                console.log('[AudioInput] ACTUAL sample rate:', actualSampleRate, 'Hz');
                if (actualSampleRate !== sampleRate) {
                    console.warn('[AudioInput] ⚠️ Browser ignored sample rate request! Got', actualSampleRate, 'instead of', sampleRate);
                }
                console.log('[AudioInput] Track enabled:', track.enabled);
                console.log('[AudioInput] Track muted:', track.muted);
                console.log('[AudioInput] Track readyState:', track.readyState);
                console.log('[AudioInput] Full device settings:', actualSettings);
                console.log('[AudioInput] ═══════════════════════════════════════');
            }

            // CRITICAL: Resume AudioContext if suspended
            console.log('[AudioInput] AudioContext state BEFORE:', this.audioContext.state);
            if (this.audioContext.state === 'suspended') {
                console.warn('[AudioInput] AudioContext is SUSPENDED - attempting to resume...');
                await this.audioContext.resume();
                console.log('[AudioInput] AudioContext state AFTER resume:', this.audioContext.state);
            }

            // FORCE resume with user interaction if needed
            if (this.audioContext.state !== 'running') {
                console.error('[AudioInput] ⚠️ AudioContext is NOT running! State:', this.audioContext.state);
                console.error('[AudioInput] This usually requires user interaction (click)');

                // Try to resume anyway
                try {
                    await this.audioContext.resume();
                    console.log('[AudioInput] Force resume result - state:', this.audioContext.state);
                } catch (e) {
                    console.error('[AudioInput] Failed to resume:', e);
                }
            }

            // Create source from microphone
            this.microphone = this.audioContext.createMediaStreamSource(stream);

            console.log('[AudioInput] MediaStreamSource created');
            console.log('[AudioInput] MediaStreamSource channels:', this.microphone.channelCount);
            console.log('[AudioInput] MediaStreamSource active:', this.microphone.mediaStream.active);
            
            // CRITICAL: Preserve stereo from microphone/virtual audio cable
            this.microphone.channelCount = 2;
            this.microphone.channelCountMode = 'max';
            this.microphone.channelInterpretation = 'speakers';
            console.log('[AudioInput] ✓ Set microphone to preserve stereo channels');

            // Connect audio processing chain
            this.connectAudioChain(this.microphone, 'microphone');

            // Set source type to 'audio' (microphone)
            this.sourceType = 'audio';

            // Check if audio monitoring is enabled
            // Read from SettingsManager's JSON storage
            try {
                const settingsJson = localStorage.getItem('revision-settings');
                console.log('[AudioInput] Reading monitoring setting from localStorage');
                if (settingsJson) {
                    const settings = JSON.parse(settingsJson);
                    const monitoringEnabled = settings.audioBeatReactive === 'true';
                    console.log('[AudioInput] Monitoring setting:', monitoringEnabled, '(from settings:', settings.audioBeatReactive, ')');
                    this.setMonitoring(monitoringEnabled);
                } else {
                    console.log('[AudioInput] No settings found - monitoring disabled by default');
                    this.setMonitoring(false);
                }
            } catch (e) {
                console.warn('[AudioInput] Could not read monitoring setting:', e);
                this.setMonitoring(false);
            }

            this.isActive = true;
            this.startAnalysis();

            console.log('[AudioInput] Microphone connected:', this.deviceName);
            console.log('[AudioInput] AudioContext state:', this.audioContext.state, 'Sample rate:', this.audioContext.sampleRate);
            console.log('[AudioInput] Analyser FFT size:', this.analyser.fftSize);
            console.log('[AudioInput] Analyser smoothing:', this.analyser.smoothingTimeConstant);

            // Create a test oscillator to verify audio pipeline works
            console.log('[AudioInput] Testing audio pipeline with oscillator...');
            const testOsc = this.audioContext.createOscillator();
            const testGain = this.audioContext.createGain();
            testGain.gain.value = 0.01; // Very quiet
            testOsc.connect(testGain);
            testGain.connect(this.analyser);
            testOsc.start();

            setTimeout(() => {
                testOsc.stop();
                testGain.disconnect();
                console.log('[AudioInput] Test oscillator stopped');
            }, 500);

            // Verify audio is flowing
            setTimeout(() => {
                // const testMax = Math.max(...this.frequencyData);
                // const testAvg = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;

                // console.log('[AudioInput] ═══════════════════════════════════════');
                // console.log('[AudioInput] AUDIO DIAGNOSTIC RESULTS:');
                // console.log('[AudioInput] Max frequency value:', testMax);
                // console.log('[AudioInput] Avg frequency value:', testAvg.toFixed(1));
                // console.log('[AudioInput] AudioContext state:', this.audioContext.state);
                // console.log('[AudioInput] Stream active:', this.microphone.mediaStream.active);
                // console.log('[AudioInput] Track count:', this.microphone.mediaStream.getTracks().length);

                // if (testMax === 0) {
                //     console.error('[AudioInput] ⚠️⚠️⚠️ NO AUDIO SIGNAL DETECTED! ⚠️⚠️⚠️');
                //     console.error('[AudioInput] POSSIBLE CAUSES:');
                //     console.error('[AudioInput]   1. Wrong device selected');
                //     console.error('[AudioInput]   2. Device has no audio playing');
                //     console.error('[AudioInput]   3. Device/system muted');
                //     console.error('[AudioInput]   4. Browser permissions issue');
                //     console.error('[AudioInput]   5. AudioContext suspended');

                //     // Check tracks
                //     const tracks = this.microphone.mediaStream.getAudioTracks();
                //     tracks.forEach((track, i) => {
                //         console.error(`[AudioInput]   Track ${i}: enabled=${track.enabled} muted=${track.muted} readyState=${track.readyState}`);
                //     });
                // } else {
                //     console.log('[AudioInput] ✓✓✓ AUDIO SIGNAL DETECTED! Max level:', testMax);
                // }
                // console.log('[AudioInput] ═══════════════════════════════════════');
            }, 1500);

            this.emit('connected', { source: 'microphone', deviceId });
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to connect microphone:', error);
            this.emit('error', { error, source: 'microphone' });
            return false;
        }
    }

    async connectMediaElement(audioElement) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            // CRITICAL: Check if we're reconnecting to the SAME element
            // createMediaElementSource() can only be called ONCE per element
            // Calling it again throws: InvalidStateError: HTMLMediaElement already connected
            if (this.mediaElementSource && this.connectedMediaElement === audioElement) {
                console.log('[AudioInput] ✓ Already connected to this media element - reusing connection');

                // CRITICAL: Reconnect audio chain (may have been disconnected when switching sources)
                console.log('[AudioInput] Reconnecting audio chain...');
                this.mediaElementSource.disconnect(); // Disconnect first to ensure clean state
                this.connectAudioChain(this.mediaElementSource, 'mediaElement');

                // Check media state
                if (audioElement.muted) {
                    console.warn('[AudioInput] ⚠️ Media element is MUTED - frequency data may not flow');
                    console.warn('[AudioInput] → User should enable "Enable audio output" for reactive visualization');
                }

                if (audioElement.paused) {
                    console.warn('[AudioInput] ⚠️ Media element is PAUSED - no audio will flow');
                    console.warn('[AudioInput] → User must manually resume playback');
                } else {
                    console.log('[AudioInput] ✓ Media element is playing');
                }

                // Set source type to 'media' (media element)
                this.sourceType = 'media';

                this.isActive = true;
                this.isPaused = false;

                // Make sure analysis is running
                if (!this.analyserIntervalId) {
                    this.startAnalysis();
                }

                console.log('[AudioInput] Reused existing connection successfully');
                return true;
            }

            // Disconnect any existing media element source first (different element)
            if (this.mediaElementSource) {
                console.log('[AudioInput] Disconnecting previous media element source (different element)');
                this.mediaElementSource.disconnect();
                this.mediaElementSource = null;
                this.connectedMediaElement = null;
            }

            // Debug: Check media element state
            console.log('[AudioInput] DEBUG - Media element state BEFORE connection:', {
                paused: audioElement.paused,
                muted: audioElement.muted,
                volume: audioElement.volume,
                readyState: audioElement.readyState,
                currentTime: audioElement.currentTime,
                duration: audioElement.duration
            });

            if (audioElement.paused) {
                console.warn('[AudioInput] ⚠️ Media element is PAUSED! Audio might not flow to analyser.');
            }

            // CRITICAL: Check if element is muted
            // DON'T unmute programmatically - this can trigger autoplay policy and STOP playback!
            // User must enable "Enable audio output (unmute video/stream/camera)" for frequency data to work
            if (audioElement.muted) {
                console.warn('[AudioInput] ⚠️ Media element is MUTED - frequency data may not flow to analyser!');
                console.warn('[AudioInput] → User should enable "Enable audio output" for reactive visualization');
                console.warn('[AudioInput] → NOT unmuting programmatically to avoid triggering autoplay policy');
            }

            // CRITICAL: Resume AudioContext if suspended
            console.log('[AudioInput] AudioContext state BEFORE:', this.audioContext.state);
            if (this.audioContext.state === 'suspended') {
                console.warn('[AudioInput] AudioContext is SUSPENDED - attempting to resume...');
                await this.audioContext.resume();
                console.log('[AudioInput] AudioContext state AFTER resume:', this.audioContext.state);
            }

            // Create and connect media element source
            console.log('[AudioInput] Creating MediaElementSource from', audioElement.tagName, 'element...');
            this.mediaElementSource = this.audioContext.createMediaElementSource(audioElement);
            this.connectedMediaElement = audioElement; // Track which element we're connected to
            
            // Check channel count
            console.log('[AudioInput] ✓ MediaElementSource created');
            console.log('[AudioInput] MediaElementSource channels:', this.mediaElementSource.channelCount);
            console.log('[AudioInput] MediaElementSource interpretation:', this.mediaElementSource.channelCountMode);
            
            // CRITICAL: Set channel count mode to preserve stereo
            this.mediaElementSource.channelCount = 2;
            this.mediaElementSource.channelCountMode = 'max'; // Preserve all channels
            this.mediaElementSource.channelInterpretation = 'speakers';
            console.log('[AudioInput] ✓ Set source to preserve stereo channels');

            // Connect audio processing chain
            this.connectAudioChain(this.mediaElementSource, 'mediaElement');
            console.log('[AudioInput] Monitoring enabled:', this.monitoringEnabled);

            // Set source type to 'media' (media element)
            this.sourceType = 'media';

            // Check if media stopped after connection
            if (audioElement.paused) {
                console.error('[AudioInput] ✗ Media element is PAUSED after connection!');
                console.error('[AudioInput] → Cannot restart programmatically due to autoplay policy');
                console.error('[AudioInput] → User must manually resume playback (click play button)');
            } else {
                console.log('[AudioInput] ✓ Media element is still playing after connection');
            }

            this.isActive = true;
            this.isPaused = false;
            this.startAnalysis();

            console.log('[AudioInput] Media element connected successfully');

            // Debug: Log frequency data after 1 second to verify it's flowing
            setTimeout(() => {
                const maxFreq = Math.max(...this.frequencyData);
                const avgFreq = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;
                console.log('[AudioInput] DEBUG - Media feed frequency data:', {
                    max: maxFreq,
                    avg: avgFreq.toFixed(1),
                    sampleData: Array.from(this.frequencyData.slice(0, 10))
                });
                if (maxFreq === 0) {
                    console.error('[AudioInput] ⚠️ NO FREQUENCY DATA! Audio might not be playing or analyser not working');
                } else {
                    console.log('[AudioInput] ✓ Frequency data is flowing');
                }
            }, 1000);

            this.emit('connected', { source: 'media' });
            return true;
        } catch (error) {
            console.error('[AudioInput] Failed to connect media element:', error);
            console.error('[AudioInput] Error details:', error.message);
            this.emit('error', { error, source: 'media' });
            return false;
        }
    }

    disconnect() {
        // Stop analysis loop
        this.isActive = false;

        // Clear all note timers
        for (const timer of this.noteTimers.values()) {
            clearTimeout(timer);
        }
        this.noteTimers.clear();

        // Send Note OFF for all active frequency notes
        for (const note of this.activeFrequencyNotes) {
            this.emit('*', {
                type: 'note',
                data: {
                    note,
                    velocity: 0,
                    source: 'audio-frequency'
                }
            });
        }
        this.activeFrequencyNotes.clear();

        if (this.microphone) {
            // Stop all tracks on the media stream
            if (this.microphone.mediaStream) {
                this.microphone.mediaStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('[AudioInput] Stopped track:', track.label);
                });
            }

            // Disconnect audio node
            this.microphone.disconnect();
            this.microphone = null;
        }

        // Disconnect media element source if exists
        if (this.mediaElementSource) {
            console.log('[AudioInput] Disconnecting media element source');
            this.mediaElementSource.disconnect();
            // DON'T clear these - the element is permanently bound to the AudioContext
            // We'll reuse the connection if user switches back to program-media
            // this.mediaElementSource = null;
            // this.connectedMediaElement = null;
            console.log('[AudioInput] Media element source disconnected but retained for reuse');
        }

        console.log('[AudioInput] Disconnected');
        this.emit('disconnected', {});
    }

    pause() {
        // Pause analysis without disconnecting the stream
        // Used when switching to a different audio source
        if (!this.isPaused) {
            this.isPaused = true;
            console.log('[AudioInput] Analysis paused (source inactive)');

            // Clear all note timers
            for (const timer of this.noteTimers.values()) {
                clearTimeout(timer);
            }
            this.noteTimers.clear();

            // Send Note OFF for all active frequency notes
            for (const note of this.activeFrequencyNotes) {
                this.emit('*', {
                    type: 'note',
                    data: {
                        note,
                        velocity: 0,
                        source: 'audio-frequency'
                    }
                });
            }
            this.activeFrequencyNotes.clear();
        }
    }

    resume() {
        // Resume analysis when switching back to this source
        if (this.isPaused) {
            this.isPaused = false;
            console.log('[AudioInput] Analysis resumed (source active)');
        }
    }

    startAnalysis() {
        if (!this.isActive) return;

        this.analyze();
        requestAnimationFrame(() => this.startAnalysis());
    }

    analyze() {
        if (!this.analyser || !this.isActive || this.isPaused) return;

        // Get frequency and time domain data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Calculate RMS (root mean square) energy
        const rms = this.calculateRMS();

        // Calculate frequency bands
        const bandLevels = this.calculateBandLevels();

        // Debug: Log audio levels (commented to reduce spam - use EQ visualizer in control.html)
        // if (!this.lastDebugTime || performance.now() - this.lastDebugTime > 1000) {
        //     const maxFreq = Math.max(...this.frequencyData);
        //     const avgFreq = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;
        //     console.log('[AudioInput] RMS:', rms.toFixed(3), 'Max:', maxFreq, 'Avg:', avgFreq.toFixed(1),
        //         'Bass:', bandLevels.bass.toFixed(2), 'Mid:', bandLevels.mid.toFixed(2), 'High:', bandLevels.high.toFixed(2));
        //     this.lastDebugTime = performance.now();
        // }

        // Detect beats
        const beat = this.detectBeat(rms);
        if (beat) {
            // console.log('[AudioInput] BEAT detected - intensity:', beat.intensity.toFixed(2));
            this.emit('*', {
                type: 'beat',
                data: {
                    intensity: beat.intensity,
                    phase: 0, // Audio doesn't have phase info
                    source: this.sourceType // 'audio' for microphone, 'media' for media element
                }
            });
        }

        // Emit frequency data
        this.emit('*', {
            type: 'frequency',
            data: {
                bands: bandLevels,
                rms: rms,
                source: this.sourceType // 'audio' for microphone, 'media' for media element
            }
        });

        // Emit frequency-based "notes" for high-energy bands
        this.emitFrequencyNotes(bandLevels);
    }

    calculateRMS() {
        let sum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const normalized = (this.timeDomainData[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / this.timeDomainData.length);
    }

    calculateBandLevels() {
        const sampleRate = this.audioContext.sampleRate;
        const binWidth = sampleRate / this.analyser.fftSize;
        const levels = {};

        for (const [name, range] of Object.entries(this.bands)) {
            const lowBin = Math.floor(range.low / binWidth);
            const highBin = Math.floor(range.high / binWidth);

            let sum = 0;
            let count = 0;

            for (let i = lowBin; i <= highBin && i < this.frequencyData.length; i++) {
                sum += this.frequencyData[i];
                count++;
            }

            levels[name] = count > 0 ? (sum / count) / 255 : 0;
        }

        return levels;
    }

    detectBeat(energy) {
        const now = performance.now();

        // Add to history
        this.beatDetector.energyHistory.push(energy);
        if (this.beatDetector.energyHistory.length > this.beatDetector.maxHistoryLength) {
            this.beatDetector.energyHistory.shift();
        }

        // Calculate average energy
        const avgEnergy = this.beatDetector.energyHistory.reduce((a, b) => a + b, 0) /
                         this.beatDetector.energyHistory.length;

        // Detect beat if energy exceeds threshold
        if (energy > avgEnergy * this.beatDetector.threshold &&
            now - this.beatDetector.lastBeatTime > this.beatDetector.minTimeBetweenBeats) {

            this.beatDetector.lastBeatTime = now;
            const intensity = Math.min((energy / avgEnergy) - 1, 1);

            return { intensity, energy, avgEnergy };
        }

        return null;
    }

    emitFrequencyNotes(bandLevels) {
        // Map frequency bands to MIDI-like note events
        const bandNoteMap = {
            sub: 36,      // C1
            bass: 48,     // C2
            lowMid: 60,   // C3
            mid: 72,      // C4
            highMid: 84,  // C5
            high: 96      // C6
        };

        const now = performance.now();

        for (const [band, note] of Object.entries(bandNoteMap)) {
            const level = bandLevels[band];
            const isActive = this.activeFrequencyNotes.has(note);

            if (level > 0.6) {
                // Band is loud - send Note ON (only if not already active AND not in cooldown)
                if (!isActive) {
                    // Check cooldown to prevent rapid re-triggering
                    const lastTrigger = this.noteLastTrigger.get(note) || 0;
                    if (now - lastTrigger < this.noteCooldown) {
                        continue; // Skip - still in cooldown period
                    }

                    const velocity = Math.floor(level * 127);

                    // Send Note ON
                    this.emit('*', {
                        type: 'note',
                        data: {
                            note,
                            velocity,
                            source: 'audio-frequency'
                        }
                    });
                    this.activeFrequencyNotes.add(note);
                    this.noteLastTrigger.set(note, now);

                    // Schedule automatic Note OFF after duration (natural decay)
                    const timer = setTimeout(() => {
                        this.emit('*', {
                            type: 'note',
                            data: {
                                note,
                                velocity: 0,
                                source: 'audio-frequency'
                            }
                        });
                        this.activeFrequencyNotes.delete(note);
                        this.noteTimers.delete(note);
                    }, this.noteDuration);

                    // Clear any existing timer for this note
                    if (this.noteTimers.has(note)) {
                        clearTimeout(this.noteTimers.get(note));
                    }
                    this.noteTimers.set(note, timer);
                }
            }
            // Note: We don't manually send note-off anymore - it happens automatically via timer
        }
    }

    // Configuration
    setBeatThreshold(threshold) {
        this.beatDetector.threshold = threshold;
        console.log('[AudioInput] Beat threshold updated:', threshold);
    }

    setBeatMinTime(minTime) {
        this.beatDetector.minTimeBetweenBeats = minTime;
        console.log('[AudioInput] Beat min time updated:', minTime, 'ms (max', Math.floor(60000 / minTime), 'BPM)');
    }

    setNoteDuration(duration) {
        this.noteDuration = duration;
        console.log('[AudioInput] Note duration updated:', duration, 'ms');
    }

    // DJ-style kill EQ controls
    setEQKill(band, kill) {
        if (!this.eqFilters || !this.eqFilters[band]) {
            console.warn('[AudioInput] EQ filter not initialized:', band);
            return;
        }

        // Kill = -40dB cut, Restore = 0dB (no change)
        const gain = kill ? -40 : 0;
        this.eqFilters[band].gain.value = gain;
        console.log('[AudioInput] EQ', band, kill ? 'KILLED' : 'RESTORED', '(gain:', gain, 'dB)');
    }

    setFFTSize(size) {
        if (this.analyser) {
            this.analyser.fftSize = size;
            const bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeDomainData = new Uint8Array(bufferLength);
        }
    }

    setSmoothing(value) {
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = value;
        }
    }

    // Event emitter
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => callback(data));
    }

    getFrequencyData() {
        return this.frequencyData;
    }

    getTimeDomainData() {
        return this.timeDomainData;
    }

    getIsActive() {
        return this.isActive;
    }

    getMediaStats() {
        // Return stats for connected media element (media feed or program media)
        if (!this.connectedMediaElement) {
            return null;
        }

        const media = this.connectedMediaElement;
        const buffered = media.buffered;
        let bufferLength = 0;

        if (buffered.length > 0) {
            const currentTime = media.currentTime;
            const bufferedEnd = buffered.end(buffered.length - 1);
            bufferLength = bufferedEnd - currentTime;
        }

        return {
            duration: media.duration || 0,
            currentTime: media.currentTime || 0,
            buffered: bufferLength,
            networkState: media.networkState, // 0=empty, 1=idle, 2=loading, 3=no source
            readyState: media.readyState, // 0=nothing, 1=metadata, 2=current, 3=future, 4=enough
            paused: media.paused,
            ended: media.ended,
            muted: media.muted,
            volume: media.volume,
            playbackRate: media.playbackRate,
            // Video-specific (if available)
            videoWidth: media.videoWidth || 0,
            videoHeight: media.videoHeight || 0,
            // Network state labels
            networkStateLabel: ['Empty', 'Idle', 'Loading', 'No Source'][media.networkState] || 'Unknown',
            readyStateLabel: ['Nothing', 'Metadata', 'Current Data', 'Future Data', 'Enough Data'][media.readyState] || 'Unknown',
            bufferHealth: bufferLength >= 2 ? 'Good' : bufferLength >= 1 ? 'Fair' : 'Low'
        };
    }

    setInputGain(value) {
        if (!this.inputGain) {
            console.warn('[AudioInput] Cannot set input gain - audio not initialized');
            return;
        }

        // Map 0-100 knob to M1 TRIM range
        // M1 TRIM works around a neutral point (0.7), not from complete silence
        // 0 → 0.4 (minimum trim, -6dB)
        // 70 → 0.7 (neutral, 0dB)
        // 100 → 1.0 (maximum drive, +3dB)
        let driveValue;
        if (value < 70) {
            // Map 0-70 to 0.4-0.7 (linear)
            driveValue = 0.4 + (value / 70) * 0.3;
        } else {
            // Map 70-100 to 0.7-1.0 (linear)
            driveValue = 0.7 + ((value - 70) / 30) * 0.3;
        }

        // Check if M1 TRIM worklet is ready
        if (!this.m1TrimReady || !this.inputGain || !this.inputGain.port) {
            console.warn('[AudioInput] M1 TRIM not ready yet - input gain will be set when audio initializes');
            return;
        }

        // Send to M1 TRIM worklet
        this.inputGain.port.postMessage({
            type: 'setParam',
            data: { effect: 'model1_trim', param: 'drive', value: driveValue }
        });

        if (value === 70) {
            console.log('[AudioInput] M1 TRIM set to NEUTRAL (0.7 / 0dB)');
        } else if (value < 70) {
            const db = 20 * Math.log10(driveValue / 0.7);
            console.log(`[AudioInput] M1 TRIM set to ${db.toFixed(1)}dB (${driveValue.toFixed(2)})`);
        } else {
            const db = 20 * Math.log10(driveValue / 0.7);
            console.log(`[AudioInput] M1 TRIM set to +${db.toFixed(1)}dB DRIVE (${driveValue.toFixed(2)})`);
        }
    }

    setMonitoring(enabled) {
        if (!this.monitorGain || !this.audioContext) {
            console.warn('[AudioInput] Cannot set monitoring - audio not initialized');
            return;
        }

        console.log('[AudioInput] Audio monitoring:', enabled ? 'ENABLED' : 'DISABLED', '| AudioContext state:', this.audioContext.state);

        if (enabled && !this.monitoringEnabled) {
            // CRITICAL: Check AudioContext state before connecting
            if (this.audioContext.state === 'suspended') {
                console.warn('[AudioInput] ⚠️ AudioContext is SUSPENDED - cannot enable monitoring! Trying to resume...');
                this.audioContext.resume().then(() => {
                    console.log('[AudioInput] ✓ AudioContext resumed - state:', this.audioContext.state);
                    this.monitorGain.connect(this.audioContext.destination);
                    this.monitoringEnabled = true;
                    console.log('[AudioInput] ✓ Microphone now AUDIBLE through speakers');
                }).catch(err => {
                    console.error('[AudioInput] ✗ Failed to resume AudioContext:', err);
                });
            } else {
                // Connect gain to speakers
                this.monitorGain.connect(this.audioContext.destination);
                this.monitoringEnabled = true;
                console.log('[AudioInput] ✓ Microphone now AUDIBLE through speakers (AudioContext state:', this.audioContext.state + ')');
            }
        } else if (!enabled && this.monitoringEnabled) {
            // Disconnect from speakers
            this.monitorGain.disconnect(this.audioContext.destination);
            this.monitoringEnabled = false;
            console.log('[AudioInput] ✓ Microphone monitoring DISABLED (silent)');
        }
    }

}

window.AudioInputSource = AudioInputSource;
