/**
 * MeisterRTC Protocol Extension
 * Extends MIDI-RTC with audio and video support for Meister, Revision, and related tools
 */

import {
    PROTOCOL_VERSION as MIDI_PROTOCOL_VERSION,
    MessageType as MIDIMessageType,
    Target as MIDITarget,
    Role,
    Capabilities,
    DATA_CHANNEL_CONFIG,
    ICE_CONFIG
} from '../midi-rtc/protocol.js';

/**
 * MeisterRTC protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Media types supported by MeisterRTC
 */
export const MediaType = {
    MIDI: 'midi',        // MIDI messages (uses MIDI-RTC)
    AUDIO: 'audio',      // Audio streams (MediaStream)
    VIDEO: 'video',      // Video streams (MediaStream)
    BINARY: 'binary'     // Custom binary data
};

/**
 * Extended message types
 */
export const MessageType = {
    ...MIDIMessageType,
    MEDIA_DESCRIPTOR: 'media-descriptor'  // Describes audio/video stream
};

/**
 * Extended targets for audio/video routing
 * Includes all MIDI-RTC targets plus audio/video specific ones
 */
export const Target = {
    // MIDI targets (from MIDI-RTC)
    ...MIDITarget,

    // Audio targets
    AUDIO_MASTER: 'audio-master',      // Master audio output
    AUDIO_DRUMS: 'audio-drums',        // Drum audio
    AUDIO_BASS: 'audio-bass',          // Bass audio
    AUDIO_VOCALS: 'audio-vocals',      // Vocal audio
    AUDIO_SYNTH: 'audio-synth',        // Synthesizer audio

    // Video targets
    VIDEO_MAIN: 'video-main',          // Main video feed
    VIDEO_VISUAL: 'video-visual',      // Visualizer output
    VIDEO_CAMERA: 'video-camera',      // Camera feed
    VIDEO_SCREEN: 'video-screen'       // Screen capture
};

/**
 * Audio stream format descriptor
 */
export const AudioFormat = {
    sampleRate: [8000, 16000, 24000, 48000, 96000],
    channels: [1, 2],  // Mono or Stereo
    bitDepth: [16, 24, 32]
};

/**
 * Video stream format descriptor
 */
export const VideoFormat = {
    width: [640, 1280, 1920, 3840],
    height: [480, 720, 1080, 2160],
    fps: [24, 30, 60, 120],
    codec: ['vp8', 'vp9', 'h264']
};

/**
 * Media descriptor message format
 */
export const MediaDescriptorFormat = {
    type: MessageType.MEDIA_DESCRIPTOR,
    mediaType: String,     // 'audio' or 'video'
    target: String,        // Target identifier
    streamId: String,      // MediaStream ID
    format: Object         // AudioFormat or VideoFormat
};

/**
 * Re-export MIDI-RTC constants for convenience
 */
export { Role, Capabilities, DATA_CHANNEL_CONFIG, ICE_CONFIG };

/**
 * Check if a target is audio-related
 */
export function isAudioTarget(target) {
    return target.startsWith('audio-');
}

/**
 * Check if a target is video-related
 */
export function isVideoTarget(target) {
    return target.startsWith('video-');
}

/**
 * Check if a target is MIDI-related
 */
export function isMIDITarget(target) {
    return !isAudioTarget(target) && !isVideoTarget(target);
}
