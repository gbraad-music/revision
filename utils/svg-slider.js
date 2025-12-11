/**
 * SVG Vertical Slider Web Component
 * A touch-friendly vertical slider built with SVG
 */

class SvgSlider extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Slider state
        this.value = 0;
        this.min = 0;
        this.max = 127;
        this.isDragging = false;
        this.activeTouchId = null; // Track which touch is controlling this slider
        this.cachedRect = null;

        this.render();
    }

    static get observedAttributes() {
        return ['value', 'min', 'max', 'width', 'color'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'value') this.value = parseFloat(newValue);
            if (name === 'min') this.min = parseFloat(newValue);
            if (name === 'max') this.max = parseFloat(newValue);
            this.updateThumbPosition();
        }
    }

    connectedCallback() {
        this.setupEventListeners();

        // Cache the bounding rect after a short delay to ensure layout is complete
        requestAnimationFrame(() => {
            setTimeout(() => {
                this.updateCachedRect();
            }, 100);
        });
    }

    updateCachedRect() {
        this.cachedRect = this.getBoundingClientRect();
    }

    render() {
        const width = this.getAttribute('width') || '60';
        const color = this.getAttribute('color') || '#CF1A37';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: ${width}px;
                    height: 100%;
                    min-height: 100px;
                    touch-action: none;
                    user-select: none;
                    -webkit-user-select: none;
                }

                svg {
                    width: 100%;
                    height: 100%;
                    display: block;
                }

                .track {
                    fill: #2a2a2a;
                }

                .thumb {
                    fill: ${color};
                    cursor: grab;
                    transition: filter 0.1s;
                }

                .thumb:hover {
                    filter: brightness(1.2);
                }

                .thumb.dragging {
                    cursor: grabbing;
                    filter: brightness(0.9);
                }
            </style>

            <svg viewBox="0 0 60 1000" preserveAspectRatio="none">
                <rect class="track" x="0" y="0" width="60" height="1000" rx="4" ry="4"/>
                <rect class="thumb" x="0" y="450" width="60" height="100" rx="2" ry="2"/>
            </svg>
        `;

        this.svg = this.shadowRoot.querySelector('svg');
        this.thumb = this.shadowRoot.querySelector('.thumb');
        this.updateThumbPosition();
    }

    setupEventListeners() {
        const svg = this.svg;

        // Mouse events - track and thumb both start drag
        svg.addEventListener('mousedown', (e) => this.startDrag(e));

        // Store bound handlers so we can remove them later
        this.boundMouseMove = (e) => this.onDrag(e);
        this.boundMouseUp = (e) => this.stopDrag(e);
        this.boundTouchMove = (e) => this.onDrag(e);
        this.boundTouchEnd = (e) => this.stopDrag(e);
        this.boundTouchCancel = (e) => this.stopDrag(e);

        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);

        // Touch events - track and thumb both start drag
        svg.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
        document.addEventListener('touchend', this.boundTouchEnd);
        document.addEventListener('touchcancel', this.boundTouchCancel);
    }

    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();

        // Store touch identifier for multi-touch support
        if (e.type.startsWith('touch')) {
            // Use changedTouches[0] which is the NEW touch that just started on THIS element
            // e.touches contains ALL active touches on the screen, not just this element
            if (e.changedTouches && e.changedTouches.length > 0) {
                this.activeTouchId = e.changedTouches[0].identifier;
            } else {
                return; // No touch to start with
            }
        } else {
            this.activeTouchId = null; // Mouse input
        }

        // Update cached rect at start of drag to get fresh position
        this.updateCachedRect();

        // Clear any existing interval (safety check)
        if (this.rectRefreshInterval) {
            clearInterval(this.rectRefreshInterval);
        }

        // For multi-touch: refresh cached rect periodically during drag
        // This prevents snapping if other faders cause layout shifts
        this.rectRefreshInterval = setInterval(() => {
            if (this.isDragging) {
                this.updateCachedRect();
            }
        }, 100); // Refresh every 100ms during drag

        this.isDragging = true;
        this.thumb.classList.add('dragging');
        this.onDrag(e);
    }

    stopDrag(e) {
        if (!this.isDragging) return;

        // For touch events, only stop if it's our touch
        if (e && e.type.startsWith('touch') && e.changedTouches) {
            let isOurTouch = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.activeTouchId) {
                    isOurTouch = true;
                    break;
                }
            }
            if (!isOurTouch) return; // Not our touch, ignore
        }

        // Clear the rect refresh interval
        if (this.rectRefreshInterval) {
            clearInterval(this.rectRefreshInterval);
            this.rectRefreshInterval = null;
        }

        this.isDragging = false;
        this.activeTouchId = null;
        this.thumb.classList.remove('dragging');
    }

    onDrag(e) {
        if (!this.isDragging) return;

        let clientY;
        if (e.type.startsWith('touch')) {
            // Only process if we have an active touch ID
            if (this.activeTouchId === null) return;

            // Find our specific touch in the current touches list
            let found = false;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.activeTouchId) {
                    clientY = e.touches[i].clientY;
                    found = true;
                    break;
                }
            }

            // Our touch not found in current touches - it may have ended
            if (!found) return;
        } else {
            clientY = e.clientY;
        }

        if (clientY !== undefined) {
            // Only prevent default and stop propagation if we're actually handling this event
            e.preventDefault();
            e.stopPropagation();
            this.updateValueFromPosition(clientY);
        }
    }

    updateValueFromPosition(clientY) {
        // Use cached rect instead of live getBoundingClientRect
        if (!this.cachedRect || this.cachedRect.height <= 0) {
            return;
        }

        const rect = this.cachedRect;
        const height = rect.height;
        const y = clientY - rect.top;

        // Clamp y to valid range
        const clampedY = Math.max(0, Math.min(height, y));
        const percentage = clampedY / height;

        // Invert: top (y=0, percentage=0) = max, bottom (y=height, percentage=1) = min
        const newValue = this.max - (percentage * (this.max - this.min));

        this.setValue(newValue);
    }

    setValue(newValue) {
        const oldValue = this.value;
        this.value = Math.round(Math.max(this.min, Math.min(this.max, newValue)));

        if (this.value !== oldValue) {
            this.updateThumbPosition();
            this.dispatchEvent(new CustomEvent('change', {
                detail: { value: this.value }
            }));
            this.dispatchEvent(new CustomEvent('input', {
                detail: { value: this.value }
            }));
        }
    }

    updateThumbPosition() {
        if (!this.thumb) {
            return;
        }

        // Calculate percentage (inverted: max at top, min at bottom)
        const percentage = 1 - ((this.value - this.min) / (this.max - this.min));
        const thumbHeight = 100; // Height of thumb in viewBox units
        const trackHeight = 1000; // Height of track in viewBox units

        // Position thumb (0 = top, 1000 = bottom, accounting for thumb height)
        const y = percentage * (trackHeight - thumbHeight);

        this.thumb.setAttribute('y', y);
    }

    getValue() {
        return this.value;
    }
}

customElements.define('svg-slider', SvgSlider);

export { SvgSlider };
