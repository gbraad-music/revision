/**
 * MIDI-RTC Protocol Specification
 * Platform-agnostic MIDI over WebRTC protocol definition
 */

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Message types
 */
export const MessageType = {
    MIDI: 'midi',
    PING: 'ping',
    PONG: 'pong',
    STATS: 'stats',
    HANDSHAKE: 'handshake'
};

/**
 * Connection roles
 */
export const Role = {
    SENDER: 'sender',      // Sends MIDI (e.g., MIDI bridge, Meister)
    RECEIVER: 'receiver'   // Receives MIDI (e.g., Revision, DAW)
};

/**
 * Data channel configuration
 * Optimized for lowest latency
 */
export const DATA_CHANNEL_CONFIG = {
    ordered: false,        // Don't wait for retransmits
    maxRetransmits: 0,     // No retransmits for lowest latency
    negotiated: false
};

/**
 * ICE configuration
 * Empty for direct P2P (LAN/Tailscale), add STUN/TURN if needed
 */
export const ICE_CONFIG = {
    iceServers: []  // Direct P2P over Tailscale/LAN
};

/**
 * Message format specification
 */
export const MessageFormat = {
    /**
     * MIDI message (with target-based routing)
     * {
     *   type: 'midi',
     *   data: [0x90, 0x3C, 0x7F],  // MIDI bytes (includes MIDI channel 1-16 in status byte)
     *   timestamp: 1234.567,        // High-resolution timestamp
     *   sent: 1234.567,             // Time when sent (for latency calc)
     *   target: 'synth'             // Target group for filtering/subscription - optional, defaults to 'default'
     * }
     */
    MIDI: {
        type: MessageType.MIDI,
        data: Array,           // MIDI data bytes (MIDI channel 1-16 embedded in status byte)
        timestamp: Number,     // Original MIDI timestamp
        sent: Number,          // Send time (performance.now())
        target: String         // Target group identifier (default: 'default')
    },

    /**
     * Ping message (for latency measurement)
     * {
     *   type: 'ping',
     *   sent: 1234.567
     * }
     */
    PING: {
        type: MessageType.PING,
        sent: Number
    },

    /**
     * Pong message (response to ping)
     * {
     *   type: 'pong',
     *   sent: 1234.567,
     *   received: 1234.789
     * }
     */
    PONG: {
        type: MessageType.PONG,
        sent: Number,
        received: Number
    },

    /**
     * Handshake message (initial connection)
     * {
     *   type: 'handshake',
     *   version: '1.0.0',
     *   role: 'sender',
     *   capabilities: ['sysex', 'clock']
     * }
     */
    HANDSHAKE: {
        type: MessageType.HANDSHAKE,
        version: String,
        role: String,
        capabilities: Array
    }
};

/**
 * MIDI capabilities
 */
export const Capabilities = {
    SYSEX: 'sysex',
    CLOCK: 'clock',
    SPP: 'spp',
    MTC: 'mtc'
};

/**
 * Target groups for MIDI routing/filtering
 * These are subscription/filtering tags, NOT MIDI channels (1-16)
 *
 * Think of these as multicast groups or signal path destinations.
 * Receivers can subscribe to specific targets to filter MIDI data.
 *
 * Note: MIDI channels (1-16) are embedded in the MIDI data bytes themselves.
 */
export const Target = {
    DEFAULT: 'default',    // All MIDI (trunk mode)
    SYNTH: 'synth',        // Musical notes (keyboards, sequencers)
    CONTROL: 'control',    // UI controls (Launchpad, APC40, faders)
    FEEDBACK: 'feedback',  // Controller feedback (LEDs, motorized faders)
    CLOCK: 'clock',        // MIDI clock/sync (Start, Stop, Clock, SPP)
    SYSEX: 'sysex'         // SysEx messages (device-specific commands)
};

/**
 * Connection modes
 */
export const Mode = {
    BRIDGE: 'bridge',      // Bridge physical MIDI devices to network (server mode)
    RECEIVER: 'receiver'   // Receive from network, create virtual MIDI devices (client mode)
};

/**
 * Error codes
 */
export const ErrorCode = {
    CONNECTION_FAILED: 'connection_failed',
    ICE_FAILED: 'ice_failed',
    DATA_CHANNEL_CLOSED: 'data_channel_closed',
    PROTOCOL_MISMATCH: 'protocol_mismatch',
    INVALID_MESSAGE: 'invalid_message'
};
