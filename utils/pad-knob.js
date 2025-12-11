/**
 * Pad Knob Component
 * A mini rotary knob that can be embedded in a pad for CC control
 */

class PadKnob extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isDragging = false;
        this.startY = 0;
        this.startValue = 0;
    }

    static get observedAttributes() {
        return ['cc', 'value', 'min', 'max', 'label', 'sublabel'];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'value') {
                this.updateKnob();
            } else if (name === 'label') {
                this.updateLabel();
            }
        }
    }

    render() {
        const label = this.getAttribute('label') || 'CC';
        const sublabel = this.getAttribute('sublabel') || '';
        const cc = this.getAttribute('cc') || '1';
        const value = parseInt(this.getAttribute('value') || '64');
        const min = parseInt(this.getAttribute('min') || '0');
        const max = parseInt(this.getAttribute('max') || '127');

        const percentage = ((value - min) / (max - min)) * 100;
        const rotation = (percentage / 100) * 270 - 135; // -135° to +135°

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    height: 100%;
                    padding: 12px;
                    box-sizing: border-box;
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }

                .knob-label {
                    font-size: 0.85em;
                    font-weight: bold;
                    color: #d0d0d0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    text-align: center;
                }

                .knob-sublabel {
                    font-size: 0.65em;
                    color: #555;
                    text-align: center;
                    white-space: pre-line;
                }

                .knob-container {
                    position: relative;
                    width: min(120px, 100%);
                    aspect-ratio: 1 / 1;
                    max-height: 100%;
                    flex-shrink: 0;
                }

                .knob-track {
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    background: #1a1a1a;
                    border: 2px solid #333;
                }

                .knob-indicator {
                    position: absolute;
                    top: 10%;
                    left: 50%;
                    width: 3px;
                    height: 40%;
                    background: #CF1A37;
                    border-radius: 2px;
                    transform-origin: bottom center;
                    transform: translateX(-50%) rotate(${rotation}deg);
                    transition: transform 0.05s linear;
                }

                .knob-center {
                    position: absolute;
                    inset: 30%;
                    border-radius: 50%;
                    background: #2a2a2a;
                    cursor: grab;
                }

                .knob-center:active {
                    cursor: grabbing;
                }

                .knob-value {
                    font-size: 1em;
                    font-weight: bold;
                    color: #aaa;
                    text-align: center;
                    padding: 4px 8px;
                    background: #0a0a0a;
                    border-radius: 4px;
                    min-width: 40px;
                }

                .knob-cc {
                    font-size: 0.6em;
                    color: #666;
                }
            </style>

            <div class="knob-label">${label}</div>
            <div class="knob-container">
                <div class="knob-track"></div>
                <div class="knob-indicator"></div>
                <div class="knob-center"></div>
            </div>
            <div class="knob-value">${value}</div>
            ${sublabel ? `<div class="knob-sublabel">${sublabel}</div>` : ''}
        `;
    }

    updateKnob() {
        const value = parseInt(this.getAttribute('value') || '64');
        const min = parseInt(this.getAttribute('min') || '0');
        const max = parseInt(this.getAttribute('max') || '127');

        const percentage = ((value - min) / (max - min)) * 100;
        const rotation = (percentage / 100) * 270 - 135;

        const indicator = this.shadowRoot.querySelector('.knob-indicator');
        const valueDisplay = this.shadowRoot.querySelector('.knob-value');

        if (indicator) {
            indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        }
        if (valueDisplay) {
            valueDisplay.textContent = value;
        }
    }

    updateLabel() {
        // Ensure shadow DOM is rendered before updating
        const labelDisplay = this.shadowRoot?.querySelector('.knob-label');

        if (!labelDisplay) {
            // Shadow DOM not ready yet - will be rendered in connectedCallback
            return;
        }

        const label = this.getAttribute('label') || 'CC';
        labelDisplay.textContent = label;
    }

    setupEventListeners() {
        const knobCenter = this.shadowRoot.querySelector('.knob-center');
        const knobContainer = this.shadowRoot.querySelector('.knob-container');

        const handleStart = (e) => {
            this.isDragging = true;
            this.startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            this.startValue = parseInt(this.getAttribute('value') || '64');
            e.preventDefault();
        };

        const handleMove = (e) => {
            if (!this.isDragging) return;

            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            const deltaY = this.startY - clientY; // Inverted: drag up = increase
            const min = parseInt(this.getAttribute('min') || '0');
            const max = parseInt(this.getAttribute('max') || '127');
            const range = max - min;

            // Scale movement: 100px = full range
            const sensitivity = range / 100;
            const newValue = Math.max(min, Math.min(max, Math.round(this.startValue + deltaY * sensitivity)));

            this.setAttribute('value', newValue);

            const cc = parseInt(this.getAttribute('cc') || '1');
            this.dispatchEvent(new CustomEvent('cc-change', {
                detail: { cc, value: newValue },
                bubbles: true,
                composed: true
            }));

            e.preventDefault();
        };

        const handleEnd = () => {
            this.isDragging = false;
        };

        // Mouse events
        knobCenter.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);

        // Touch events
        knobCenter.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);

        // Prevent context menu on knob
        knobContainer.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
    }
}

customElements.define('pad-knob', PadKnob);

export { PadKnob };
