// MIDIInputSource - Wrapper for MIDI with SysEx support and InputManager integration

class MIDIInputSource {
    constructor() {
        this.midiAccess = null;
        this.currentInput = null;
        this.listeners = new Map();

        // MIDI Clock and SPP tracking
        this.bpm = 120;
        this.isPlaying = false;
        this.clockCounter = 0;
        this.lastClockTime = 0;
        this.songPosition = 0; // In 16th notes

        // SPP-based BPM calculation
        this.lastSPPPosition = 0;
        this.lastSPPTime = 0;
        this.sppBPMSamples = [];

        // SysEx buffer for multi-packet messages
        this.sysexBuffer = [];
        this.receivingSysex = false;
    }

    async initialize(requestSysex = true) {
        try {
            if (!navigator.requestMIDIAccess) {
                console.error('[MIDIInput] Web MIDI API not supported');
                return false;
            }

            // Request MIDI access WITH SysEx support
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: requestSysex });

            // Listen for device connection changes
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e);

            console.log('[MIDIInput] MIDI Access initialized (SysEx:', requestSysex, ')');
            this.emit('*', { type: 'initialized', data: { sysex: requestSysex } });
            return true;
        } catch (error) {
            console.error('[MIDIInput] Failed to initialize:', error);
            if (error.name === 'SecurityError') {
                console.error('[MIDIInput] SysEx requires user permission - browser may have blocked it');
            }
            return false;
        }
    }

    getInputs() {
        if (!this.midiAccess) return [];
        return Array.from(this.midiAccess.inputs.values());
    }

    connectInput(inputId) {
        if (!this.midiAccess) return false;

        const input = this.midiAccess.inputs.get(inputId);
        if (!input) {
            console.error('[MIDIInput] Input not found:', inputId);
            return false;
        }

        // Disconnect previous input
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
        }

        // Connect new input
        this.currentInput = input;
        this.currentInput.onmidimessage = (msg) => this.handleMIDIMessage(msg);

        console.log('[MIDIInput] Connected to:', input.name);
        this.emit('*', { type: 'connected', data: { deviceName: input.name } });

        return true;
    }

    disconnect() {
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
            this.currentInput = null;
        }
        console.log('[MIDIInput] Disconnected');
        this.emit('*', { type: 'disconnected', data: {} });
    }

    handleMIDIMessage(message) {
        const [status, data1, data2] = message.data;
        const command = status & 0xF0;
        const channel = status & 0x0F;

        // Debug: Log all System Real-Time messages
        if (status >= 0xF0) {
            if (!this.lastMidiDebugTime || performance.now() - this.lastMidiDebugTime > 2000) {
                const messageTypes = {
                    0xF0: 'SysEx Start',
                    0xF2: 'SPP',
                    0xF7: 'SysEx End',
                    0xF8: 'Clock',
                    0xFA: 'Start',
                    0xFB: 'Continue',
                    0xFC: 'Stop'
                };
                // console.log('[MIDIInput] Received:', messageTypes[status] || `0x${status.toString(16)}`,
                //     status === 0xF2 ? `Position: ${(data2 << 7) | data1}` : '');
                this.lastMidiDebugTime = performance.now();
            }
        }

        // IMPORTANT: Handle System Real-Time messages (0xF8-0xFF) FIRST
        // These can appear at ANY time, even in the middle of SysEx, and must be processed immediately
        if (status >= 0xF8) {
            if (status === 0xF8) {
                this.handleClock();
                return;
            }
            if (status === 0xFA) {
                this.handleStart();
                return;
            }
            if (status === 0xFB) {
                this.handleContinue();
                return;
            }
            if (status === 0xFC) {
                this.handleStop();
                return;
            }
        }

        // Handle System Common messages (0xF0-0xF7) that are NOT SysEx
        if (status === 0xF2) {
            // Song Position Pointer - process immediately, NOT part of SysEx
            this.handleSongPosition(data1, data2);
            return;
        }

        // System Exclusive (SysEx) messages
        if (status === 0xF0) {
            // Start of SysEx
            this.receivingSysex = true;
            this.sysexBuffer = [status];
            return;
        }

        if (status === 0xF7) {
            // End of SysEx
            if (this.receivingSysex) {
                this.sysexBuffer.push(status);
                this.handleSysEx(new Uint8Array(this.sysexBuffer));
                this.sysexBuffer = [];
                this.receivingSysex = false;
            }
            return;
        }

        // Accumulate SysEx data (only if we're in the middle of a SysEx message)
        if (this.receivingSysex) {
            this.sysexBuffer.push(status);
            if (data1 !== undefined) this.sysexBuffer.push(data1);
            if (data2 !== undefined) this.sysexBuffer.push(data2);
            return;
        }

        // Regular MIDI Messages
        switch (command) {
            case 0x90: // Note On
                if (data2 > 0) {
                    // console.log(`[MIDIInput] 🎹 Note ON  - Ch.${channel + 1} Note:${data1} Vel:${data2}`);
                    this.emit('*', {
                        type: 'note',
                        data: { note: data1, velocity: data2, source: 'midi', channel }
                    });
                } else {
                    // Note off (velocity 0)
                    // console.log(`[MIDIInput] 🎹 Note OFF - Ch.${channel + 1} Note:${data1}`);
                    this.emit('*', {
                        type: 'note',
                        data: { note: data1, velocity: 0, source: 'midi', channel }
                    });
                }
                break;

            case 0x80: // Note Off
                // console.log(`[MIDIInput] 🎹 Note OFF - Ch.${channel + 1} Note:${data1}`);
                this.emit('*', {
                    type: 'note',
                    data: { note: data1, velocity: 0, source: 'midi', channel }
                });
                break;

            case 0xB0: // Control Change
                this.emit('*', {
                    type: 'control',
                    data: { id: data1, value: data2 / 127, source: 'midi', channel }
                });
                break;

            case 0xE0: // Pitch Bend
                const pitchBend = ((data2 << 7) | data1) / 16383; // Normalize to 0-1
                this.emit('*', {
                    type: 'control',
                    data: { id: 'pitchbend', value: pitchBend, source: 'midi', channel }
                });
                break;
        }
    }

    handleSysEx(data) {
        console.log('[MIDIInput] SysEx received:', data.length, 'bytes');

        // Parse common SysEx messages
        if (data.length < 4) {
            console.warn('[MIDIInput] SysEx too short');
            return;
        }

        // SysEx format: 0xF0 [Manufacturer ID] [Data...] 0xF7
        const manufacturerId = data[1];
        const payload = data.slice(2, -1); // Remove 0xF0, manufacturer, and 0xF7

        console.log('[MIDIInput] SysEx - Manufacturer:', manufacturerId.toString(16), 'Payload:', payload);

        // Emit SysEx event
        this.emit('*', {
            type: 'sysex',
            data: {
                manufacturerId,
                payload,
                raw: data,
                source: 'midi'
            }
        });

        // Handle specific manufacturer messages
        this.parseSysExMessage(manufacturerId, payload);
    }

    parseSysExMessage(manufacturerId, payload) {
        // Common manufacturer IDs
        const manufacturers = {
            0x00: 'Extended ID',
            0x41: 'Roland',
            0x42: 'Korg',
            0x43: 'Yamaha',
            0x47: 'Akai',
            0x7D: 'Educational/Development',
            0x7E: 'Universal Non-Real Time',
            0x7F: 'Universal Real Time'
        };

        const mfr = manufacturers[manufacturerId] || 'Unknown';
        console.log('[MIDIInput] SysEx from:', mfr);

        // Parse Universal SysEx (0x7E/0x7F)
        if (manufacturerId === 0x7E || manufacturerId === 0x7F) {
            this.parseUniversalSysEx(payload);
        }
    }

    parseUniversalSysEx(payload) {
        if (payload.length < 2) return;

        const deviceId = payload[0];
        const subId1 = payload[1];
        const subId2 = payload.length > 2 ? payload[2] : null;

        // Common Universal SysEx messages
        if (subId1 === 0x06) {
            console.log('[MIDIInput] Identity Request/Reply');
        } else if (subId1 === 0x09) {
            console.log('[MIDIInput] General MIDI message');
        } else if (subId1 === 0x7B) {
            console.log('[MIDIInput] Sample Dump');
        } else if (subId1 === 0x7C) {
            console.log('[MIDIInput] File Dump');
        }
    }

    handleClock() {
        const now = performance.now();
        this.clockCounter++;

        // Calculate BPM every 24 clocks (1 quarter note)
        if (this.clockCounter >= 24) {
            if (this.lastClockTime > 0) {
                const interval = (now - this.lastClockTime) / 24;
                const newBPM = Math.round(60000 / (interval * 24));

                if (newBPM > 20 && newBPM < 300) {
                    this.bpm = newBPM;
                    this.emit('*', {
                        type: 'transport',
                        data: { state: 'bpm', bpm: this.bpm, source: 'midi' }
                    });
                }
            }

            this.lastClockTime = now;
            this.clockCounter = 0;
        }

        // Increment song position (every 6 clocks = 1 sixteenth note)
        if (this.clockCounter % 6 === 0) {
            this.songPosition++;
            const phase = (this.songPosition % 4) / 4; // Beat phase (0-1 within beat)

            this.emit('*', {
                type: 'beat',
                data: { phase, intensity: 1.0, source: 'midi' }
            });
        }
    }

    handleStart() {
        // console.log('[MIDIInput] Start');
        this.isPlaying = true;
        this.songPosition = 0;
        this.clockCounter = 0;

        this.emit('*', {
            type: 'transport',
            data: { state: 'play', bpm: this.bpm, source: 'midi' }
        });
    }

    handleContinue() {
        // console.log('[MIDIInput] Continue');
        this.isPlaying = true;

        this.emit('*', {
            type: 'transport',
            data: { state: 'continue', bpm: this.bpm, source: 'midi' }
        });
    }

    handleStop() {
        // console.log('[MIDIInput] Stop');
        this.isPlaying = false;

        this.emit('*', {
            type: 'transport',
            data: { state: 'stop', bpm: this.bpm, source: 'midi' }
        });
    }

    handleSongPosition(lsb, msb) {
        const newPosition = (msb << 7) | lsb;
        const now = performance.now();

        // console.log('[MIDIInput] ►►► SPP RECEIVED ◄◄◄ Position:', newPosition, 'LSB:', lsb, 'MSB:', msb);

        // Calculate BPM from SPP changes
        if (this.lastSPPTime > 0) {
            const deltaPosition = newPosition - this.lastSPPPosition;
            const deltaTime = now - this.lastSPPTime;

            if (deltaPosition > 0 && deltaTime > 100 && deltaTime < 5000) {
                const quarterNotes = deltaPosition / 4;
                const minutes = deltaTime / 60000;
                const calculatedBPM = Math.round(quarterNotes / minutes);

                if (calculatedBPM > 20 && calculatedBPM < 300) {
                    this.sppBPMSamples.push(calculatedBPM);
                    if (this.sppBPMSamples.length > 8) {
                        this.sppBPMSamples.shift();
                    }

                    const avgBPM = Math.round(
                        this.sppBPMSamples.reduce((a, b) => a + b, 0) / this.sppBPMSamples.length
                    );

                    if (Math.abs(avgBPM - this.bpm) >= 2) {
                        this.bpm = avgBPM;
                        this.emit('*', {
                            type: 'transport',
                            data: { state: 'bpm', bpm: this.bpm, source: 'midi-spp' }
                        });
                    }
                }
            }
        }

        this.songPosition = newPosition;
        this.lastSPPPosition = newPosition;
        this.lastSPPTime = now;
    }

    handleStateChange(event) {
        console.log('[MIDIInput] Device state change:', event.port.name, event.port.state);
        this.emit('*', {
            type: 'device-change',
            data: { name: event.port.name, state: event.port.state }
        });
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

    // Utility methods
    getBPM() {
        return this.bpm;
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    getSongPosition() {
        return this.songPosition;
    }
}

window.MIDIInputSource = MIDIInputSource;
