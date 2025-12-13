/**
 * MIDI Utility Functions
 * Helper functions for working with MIDI data
 */

/**
 * Get MIDI channel (1-16) from MIDI status byte
 * @param {number} statusByte - MIDI status byte
 * @returns {number} MIDI channel (1-16) or 0 if not a channel message
 */
export function getMIDIChannel(statusByte) {
    // Channel messages are 0x80-0xEF
    if (statusByte >= 0x80 && statusByte <= 0xEF) {
        return (statusByte & 0x0F) + 1;  // Return 1-16
    }
    return 0;  // System message, no channel
}

/**
 * Set MIDI channel (1-16) in MIDI status byte
 * @param {number} statusByte - Original MIDI status byte
 * @param {number} midiChannel - MIDI channel (1-16)
 * @returns {number} Modified status byte
 */
export function setMIDIChannel(statusByte, midiChannel) {
    if (midiChannel < 1 || midiChannel > 16) {
        throw new Error('MIDI channel must be 1-16');
    }

    // Only modify channel messages (0x80-0xEF)
    if (statusByte >= 0x80 && statusByte <= 0xEF) {
        return (statusByte & 0xF0) | ((midiChannel - 1) & 0x0F);
    }

    return statusByte;  // Return unchanged for system messages
}

/**
 * Get MIDI message type description
 * @param {number} statusByte - MIDI status byte
 * @returns {string} Human-readable message type
 */
export function getMIDIMessageType(statusByte) {
    const type = statusByte & 0xF0;

    switch (type) {
        case 0x80: return 'Note Off';
        case 0x90: return 'Note On';
        case 0xA0: return 'Poly Aftertouch';
        case 0xB0: return 'Control Change';
        case 0xC0: return 'Program Change';
        case 0xD0: return 'Channel Aftertouch';
        case 0xE0: return 'Pitch Bend';
        default:
            switch (statusByte) {
                case 0xF0: return 'SysEx';
                case 0xF1: return 'MTC Quarter Frame';
                case 0xF2: return 'Song Position';
                case 0xF3: return 'Song Select';
                case 0xF6: return 'Tune Request';
                case 0xF7: return 'End of SysEx';
                case 0xF8: return 'Clock';
                case 0xFA: return 'Start';
                case 0xFB: return 'Continue';
                case 0xFC: return 'Stop';
                case 0xFE: return 'Active Sensing';
                case 0xFF: return 'Reset';
                default: return 'Unknown';
            }
    }
}

/**
 * Detect appropriate target group based on MIDI message content
 * @param {Uint8Array|Array} data - MIDI message data
 * @returns {string} Suggested target group
 */
export function detectTarget(data) {
    if (!data || data.length === 0) return 'default';

    const status = data[0];

    // SysEx messages
    if (status === 0xF0) return 'sysex';

    // Clock messages (F8-FC)
    if (status >= 0xF8 && status <= 0xFC) return 'clock';

    // Note On/Off - likely synth
    if ((status & 0xF0) === 0x80 || (status & 0xF0) === 0x90) {
        return 'synth';
    }

    // Control Change - control surface
    if ((status & 0xF0) === 0xB0) {
        return 'control';
    }

    return 'default';
}

/**
 * Format MIDI bytes as hex string
 * @param {Uint8Array|Array} data - MIDI message data
 * @returns {string} Formatted hex string (e.g., "90 3C 7F")
 */
export function formatMIDIBytes(data) {
    return Array.from(data)
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
}
