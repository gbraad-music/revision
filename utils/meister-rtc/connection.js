/**
 * MeisterRTC Connection class
 * Extends MIDI-RTC with audio and video streaming support
 */

import { MIDIRTCConnection } from '../midi-rtc/connection.js';
import { MediaType, MessageType, Target, isAudioTarget, isVideoTarget } from './protocol.js';

/**
 * MeisterRTC connection class
 * Adds audio/video MediaStream support on top of MIDI-RTC
 */
export class MeisterRTCConnection extends MIDIRTCConnection {
    constructor(role, options = {}) {
        super(role, options);

        // Media stream management
        this.audioStreams = new Map();  // target -> { stream, sender, format }
        this.videoStreams = new Map();  // target -> { stream, sender, format }
        this.streamDescriptors = new Map();  // streamId -> { mediaType, target, format }

        // Event handlers for media streams
        this.onAudioStream = null;
        this.onVideoStream = null;

        // Track handling
        this.setupTrackHandling();
    }

    /**
     * Setup WebRTC track event handling
     */
    setupTrackHandling() {
        // Will be called after peerConnection is created
        this.on('peerConnectionCreated', () => {
            this.peerConnection.ontrack = (event) => {
                this.handleTrack(event);
            };
        });
    }

    /**
     * Override initialize to emit peerConnectionCreated
     */
    async initialize() {
        await super.initialize();
        this.emitEvent('peerConnectionCreated');
    }

    /**
     * Add audio stream
     * @param {MediaStream} stream - Audio MediaStream
     * @param {string} target - Target identifier (e.g., 'audio-synth')
     * @param {Object} format - Audio format descriptor
     */
    async addAudioStream(stream, target, format = {}) {
        if (!stream || !stream.getAudioTracks().length) {
            this.log('No audio tracks in stream');
            return false;
        }

        const audioTrack = stream.getAudioTracks()[0];
        const sender = this.peerConnection.addTrack(audioTrack, stream);

        // Store locally
        this.audioStreams.set(target, { stream, sender, format });
        this.streamDescriptors.set(stream.id, {
            mediaType: MediaType.AUDIO,
            target: target,
            format: format
        });

        // Send descriptor via data channel
        this.sendMediaDescriptor({
            mediaType: MediaType.AUDIO,
            target: target,
            streamId: stream.id,
            format: {
                sampleRate: format.sampleRate || 48000,
                channels: format.channels || 2,
                bitDepth: format.bitDepth || 24
            }
        });

        this.log(`Added audio stream: ${target} (${stream.id})`);
        return true;
    }

    /**
     * Add video stream
     * @param {MediaStream} stream - Video MediaStream
     * @param {string} target - Target identifier (e.g., 'video-visual')
     * @param {Object} format - Video format descriptor
     */
    async addVideoStream(stream, target, format = {}) {
        if (!stream || !stream.getVideoTracks().length) {
            this.log('No video tracks in stream');
            return false;
        }

        const videoTrack = stream.getVideoTracks()[0];
        const sender = this.peerConnection.addTrack(videoTrack, stream);

        // Store locally
        this.videoStreams.set(target, { stream, sender, format });
        this.streamDescriptors.set(stream.id, {
            mediaType: MediaType.VIDEO,
            target: target,
            format: format
        });

        // Send descriptor via data channel
        this.sendMediaDescriptor({
            mediaType: MediaType.VIDEO,
            target: target,
            streamId: stream.id,
            format: {
                width: format.width || 1920,
                height: format.height || 1080,
                fps: format.fps || 60,
                codec: format.codec || 'vp9'
            }
        });

        this.log(`Added video stream: ${target} (${stream.id})`);
        return true;
    }

    /**
     * Remove audio stream
     * @param {string} target - Target identifier
     */
    removeAudioStream(target) {
        const streamInfo = this.audioStreams.get(target);
        if (!streamInfo) return false;

        // Remove track from peer connection
        this.peerConnection.removeTrack(streamInfo.sender);

        // Cleanup
        this.audioStreams.delete(target);
        this.streamDescriptors.delete(streamInfo.stream.id);

        this.log(`Removed audio stream: ${target}`);
        return true;
    }

    /**
     * Remove video stream
     * @param {string} target - Target identifier
     */
    removeVideoStream(target) {
        const streamInfo = this.videoStreams.get(target);
        if (!streamInfo) return false;

        // Remove track from peer connection
        this.peerConnection.removeTrack(streamInfo.sender);

        // Cleanup
        this.videoStreams.delete(target);
        this.streamDescriptors.delete(streamInfo.stream.id);

        this.log(`Removed video stream: ${target}`);
        return true;
    }

    /**
     * Send media descriptor via data channel
     */
    sendMediaDescriptor(descriptor) {
        const message = JSON.stringify({
            type: MessageType.MEDIA_DESCRIPTOR,
            ...descriptor,
            timestamp: performance.now()
        });

        this.sendRaw(message);
    }

    /**
     * Handle incoming WebRTC track
     */
    handleTrack(event) {
        const stream = event.streams[0];
        this.log('Received track:', event.track.kind, 'stream:', stream.id);

        // Wait for descriptor to arrive via data channel
        // Store temporarily until descriptor arrives
        if (!this.pendingStreams) {
            this.pendingStreams = new Map();
        }
        this.pendingStreams.set(stream.id, { stream, track: event.track });
    }

    /**
     * Override handleIncomingMessage to handle media descriptors
     */
    handleIncomingMessage(data) {
        try {
            const message = JSON.parse(data);

            if (message.type === MessageType.MEDIA_DESCRIPTOR) {
                this.handleMediaDescriptor(message);
            } else {
                // Pass to parent for MIDI/ping/pong handling
                super.handleIncomingMessage(data);
            }
        } catch (error) {
            this.log('Error parsing message:', error);
            this.handleError(error);
        }
    }

    /**
     * Handle media descriptor message
     */
    handleMediaDescriptor(descriptor) {
        const { mediaType, target, streamId, format } = descriptor;

        // Store descriptor
        this.streamDescriptors.set(streamId, { mediaType, target, format });

        // Check if we have a pending stream for this ID
        if (this.pendingStreams && this.pendingStreams.has(streamId)) {
            const { stream, track } = this.pendingStreams.get(streamId);

            if (mediaType === MediaType.AUDIO) {
                this.audioStreams.set(target, { stream, format });
                this.log(`Received audio stream: ${target} (${streamId})`);

                if (this.onAudioStream) {
                    this.onAudioStream(stream, target, format);
                }
            } else if (mediaType === MediaType.VIDEO) {
                this.videoStreams.set(target, { stream, format });
                this.log(`Received video stream: ${target} (${streamId})`);

                if (this.onVideoStream) {
                    this.onVideoStream(stream, target, format);
                }
            }

            this.pendingStreams.delete(streamId);
        }
    }

    /**
     * Get all audio streams
     */
    getAudioStreams() {
        return Array.from(this.audioStreams.entries()).map(([target, info]) => ({
            target,
            stream: info.stream,
            format: info.format
        }));
    }

    /**
     * Get all video streams
     */
    getVideoStreams() {
        return Array.from(this.videoStreams.entries()).map(([target, info]) => ({
            target,
            stream: info.stream,
            format: info.format
        }));
    }

    /**
     * Get audio stream by target
     */
    getAudioStream(target) {
        const info = this.audioStreams.get(target);
        return info ? info.stream : null;
    }

    /**
     * Get video stream by target
     */
    getVideoStream(target) {
        const info = this.videoStreams.get(target);
        return info ? info.stream : null;
    }

    /**
     * Override close to cleanup media streams
     */
    close() {
        // Stop all audio streams
        for (const [target, info] of this.audioStreams.entries()) {
            info.stream.getTracks().forEach(track => track.stop());
        }

        // Stop all video streams
        for (const [target, info] of this.videoStreams.entries()) {
            info.stream.getTracks().forEach(track => track.stop());
        }

        // Clear maps
        this.audioStreams.clear();
        this.videoStreams.clear();
        this.streamDescriptors.clear();

        // Call parent close
        super.close();
    }

    /**
     * Override getStats to include media stream info
     */
    getStats() {
        const baseStats = super.getStats();

        return {
            ...baseStats,
            audioStreams: this.audioStreams.size,
            videoStreams: this.videoStreams.size,
            audioTargets: Array.from(this.audioStreams.keys()),
            videoTargets: Array.from(this.videoStreams.keys())
        };
    }
}
