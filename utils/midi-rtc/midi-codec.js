/**
 * MIDI Codec - Serialization and deserialization of MIDI messages
 * Platform-agnostic, works in browser, Node.js, and can be ported to C++
 */

import { MessageType } from './protocol.js';

/**
 * Encode MIDI message for transmission
 * @param {Uint8Array|Array} midiData - MIDI data bytes (MIDI channel 1-16 embedded in status byte)
 * @param {number} timestamp - Original MIDI timestamp
 * @param {number} sent - Send time (for latency measurement)
 * @param {string} target - Target group for filtering/routing (default: 'default')
 * @returns {string} JSON-encoded message
 */
export function encodeMIDI(midiData, timestamp, sent, target = 'default') {
    return JSON.stringify({
        type: MessageType.MIDI,
        data: Array.from(midiData),
        timestamp: timestamp,
        sent: sent,
        target: target  // Target group for filtering/routing
    });
}

/**
 * Decode MIDI message from transmission
 * @param {string} json - JSON-encoded message
 * @returns {Object} Decoded message with data as Uint8Array
 */
export function decodeMIDI(json) {
    const message = JSON.parse(json);
    return {
        type: message.type,
        data: new Uint8Array(message.data),
        timestamp: message.timestamp,
        sent: message.sent
    };
}

/**
 * Encode handshake message
 * @param {string} role - 'sender' or 'receiver'
 * @param {string} version - Protocol version
 * @param {Array<string>} capabilities - Supported capabilities
 * @returns {string} JSON-encoded handshake
 */
export function encodeHandshake(role, version, capabilities) {
    return JSON.stringify({
        type: MessageType.HANDSHAKE,
        role: role,
        version: version,
        capabilities: capabilities
    });
}

/**
 * Encode ping message
 * @param {number} sent - Send time
 * @returns {string} JSON-encoded ping
 */
export function encodePing(sent) {
    return JSON.stringify({
        type: MessageType.PING,
        sent: sent
    });
}

/**
 * Encode pong message
 * @param {number} sent - Original ping send time
 * @param {number} received - Pong send time
 * @returns {string} JSON-encoded pong
 */
export function encodePong(sent, received) {
    return JSON.stringify({
        type: MessageType.PONG,
        sent: sent,
        received: received
    });
}

/**
 * Validate MIDI message structure
 * @param {Object} message - Decoded message
 * @returns {boolean} True if valid
 */
export function validateMIDIMessage(message) {
    return (
        message &&
        message.type === MessageType.MIDI &&
        Array.isArray(message.data) &&
        typeof message.timestamp === 'number' &&
        typeof message.sent === 'number'
    );
}

/**
 * Calculate latency from message
 * @param {number} sent - Send time from message
 * @param {number} received - Current time (performance.now())
 * @returns {number} Latency in milliseconds
 */
export function calculateLatency(sent, received) {
    return received - sent;
}

/**
 * Get MIDI message type (for logging/filtering)
 * @param {Uint8Array} data - MIDI data bytes
 * @returns {string} Message type name
 */
export function getMIDIMessageType(data) {
    if (!data || data.length === 0) return 'unknown';

    const status = data[0];

    // Channel messages
    if ((status & 0xF0) === 0x80) return 'note_off';
    if ((status & 0xF0) === 0x90) return 'note_on';
    if ((status & 0xF0) === 0xA0) return 'polyphonic_aftertouch';
    if ((status & 0xF0) === 0xB0) return 'control_change';
    if ((status & 0xF0) === 0xC0) return 'program_change';
    if ((status & 0xF0) === 0xD0) return 'channel_aftertouch';
    if ((status & 0xF0) === 0xE0) return 'pitch_bend';

    // System messages
    if (status === 0xF0) return 'sysex';
    if (status === 0xF1) return 'mtc_quarter_frame';
    if (status === 0xF2) return 'song_position';
    if (status === 0xF3) return 'song_select';
    if (status === 0xF6) return 'tune_request';
    if (status === 0xF7) return 'sysex_end';
    if (status === 0xF8) return 'clock';
    if (status === 0xFA) return 'start';
    if (status === 0xFB) return 'continue';
    if (status === 0xFC) return 'stop';
    if (status === 0xFE) return 'active_sensing';
    if (status === 0xFF) return 'reset';

    return 'unknown';
}

/**
 * Format MIDI message for logging
 * @param {Uint8Array} data - MIDI data bytes
 * @returns {string} Formatted string
 */
export function formatMIDIMessage(data) {
    const type = getMIDIMessageType(data);
    const bytes = Array.from(data).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    return `${type} [${bytes}]`;
}
