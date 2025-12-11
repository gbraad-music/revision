/**
 * Fader Components for Meister
 * Web components for MIX, CHANNEL, and TEMPO faders
 */

import './svg-slider.js';

/**
 * Base Fader Component
 * Shared functionality for all fader types
 */
class BaseFader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    createSlider(value, min, max, step = 1) {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'fader-slider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        return slider;
    }

    createButton(label, className = '') {
        const button = document.createElement('button');
        button.className = `fader-button ${className}`;
        button.textContent = label;
        return button;
    }

    getBaseStyles() {
        return `
            :host {
                display: inline-flex;
                flex-direction: column;
                width: 80px;
                height: 100%;
                background: transparent;
                padding: 0;
                gap: 8px;
                font-family: Arial, sans-serif;
                box-sizing: border-box;
                margin: 0 8px;
                align-items: center;
                justify-content: flex-start;
            }

            .fader-label {
                text-align: center;
                color: #aaa;
                font-size: 0.75em;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 6px;
                background: #1a1a1a;
                border-radius: 4px;
                font-weight: bold;
            }

            .fader-button {
                width: 60px;
                min-height: 44px;
                padding: 12px;
                margin: 0 auto;
                background: #2a2a2a;
                color: #aaa;
                border: none;
                cursor: pointer;
                font-size: 1em;
                font-weight: bold;
                text-transform: uppercase;
                transition: all 0.15s;
                border-radius: 4px;
                touch-action: manipulation;
            }

            .fader-button:hover {
                background: #3a3a3a;
            }

            .fader-button:active {
                transform: scale(0.98);
            }

            .fader-button.active {
                background: #CF1A37;
                color: #fff;
            }

            /* FX button specific states (only for mix-fader) */
            #fx-btn.active {
                background: #ccaa44;
                color: #fff;
            }

            #fx-btn.warning {
                background: #CF1A37;
                color: #fff;
            }

            .slider-container {
                width: 60px;
                flex: 1;
                min-height: 0;
                display: flex;
                align-items: stretch;
            }

            svg-slider {
                width: 100%;
                height: 100%;
            }

            .pan-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: center;
                width: 100%;
            }

            .pan-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 16px;
                background: #2a2a2a;
                outline: none;
                border-radius: 4px;
                cursor: pointer;
                touch-action: none;
            }

            .pan-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                background: #CF1A37;
                cursor: grab;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .pan-slider::-webkit-slider-thumb:active {
                cursor: grabbing;
                box-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }

            .pan-slider::-moz-range-thumb {
                width: 24px;
                height: 24px;
                background: #CF1A37;
                cursor: grab;
                border: none;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .pan-slider::-moz-range-thumb:active {
                cursor: grabbing;
                box-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
        `;
    }
}

/**
 * MIX Fader Component
 * Format: Label, FX Toggle, Pan, Volume, Mute
 */
class MixFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['label', 'volume', 'pan', 'fx', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update sliders directly, never re-render for volume/pan changes
        if (name === 'volume') {
            const slider = this.shadowRoot?.getElementById('volume-slider');
            if (slider) {
                // Convert percentage (0-100) to wire format (0-127) for slider
                const wireValue = Math.round((parseInt(newValue) / 100) * 127);
                slider.setAttribute('value', wireValue);
            }
            return;
        }

        if (name === 'pan') {
            const slider = this.shadowRoot?.getElementById('pan-slider');
            if (slider) slider.value = newValue;
            return;
        }

        // For other attributes (fx, muted, label), re-render
        this.render();
    }

    render() {
        const label = this.getAttribute('label') || 'MIX';
        const volumePercent = parseInt(this.getAttribute('volume') || '100'); // 0-100 percentage
        const volume = Math.round((volumePercent / 100) * 127); // Convert to 0-127 for slider
        const pan = parseInt(this.getAttribute('pan') || '0');
        const fxAttr = this.getAttribute('fx') || 'false';
        const muted = this.getAttribute('muted') === 'true';

        // FX states: 'false' (off), 'true'/'active' (yellow - enabled for this fader), 'warning' (red - enabled elsewhere)
        let fxClass = '';
        if (fxAttr === 'true' || fxAttr === 'active') {
            fxClass = 'active'; // Yellow
        } else if (fxAttr === 'warning') {
            fxClass = 'warning'; // Red
        }

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${label}</div>
            <button class="fader-button ${fxClass}" id="fx-btn">FX</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const fxBtn = this.shadowRoot.getElementById('fx-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        fxBtn?.addEventListener('click', () => {
            // FX button logic:
            // Yellow (active for us) → Off
            // Red (active elsewhere) → Yellow (take over)
            // Off → Yellow (turn on for us)
            const currentState = this.getAttribute('fx') || 'false';
            const newState = (currentState === 'active') ? false : true;
            this.dispatchEvent(new CustomEvent('fx-toggle', { detail: { enabled: newState } }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', { detail: { value: parseInt(e.target.value) } }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const wireValue = e.detail?.value ?? e.target?.value; // Slider sends 0-127
            const percentValue = Math.round((wireValue / 127) * 100); // Convert to 0-100 percentage
            this.setAttribute('volume', percentValue); // Store as percentage
            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('volume-change', { detail: { value: parseInt(wireValue) } })); // Send wire value
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', { detail: { muted: newState } }));
        });
    }
}

/**
 * CHANNEL Fader Component
 * Format: Channel #, Solo, Pan, Volume, Mute
 */
class ChannelFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['channel', 'volume', 'pan', 'solo', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update sliders directly, never re-render for volume/pan changes
        if (name === 'volume') {
            const slider = this.shadowRoot?.getElementById('volume-slider');
            if (slider) {
                // Convert percentage (0-100) to wire format (0-127) for slider
                const wireValue = Math.round((parseInt(newValue) / 100) * 127);
                slider.setAttribute('value', wireValue);
            }
            return;
        }

        if (name === 'pan') {
            const slider = this.shadowRoot?.getElementById('pan-slider');
            if (slider) slider.value = newValue;
            return;
        }

        // For other attributes (channel, solo, muted), re-render
        this.render();
    }

    render() {
        const channel = parseInt(this.getAttribute('channel') || '0');
        const volumePercent = parseInt(this.getAttribute('volume') || '100'); // 0-100 percentage
        const volume = Math.round((volumePercent / 100) * 127); // Convert to 0-127 for slider
        const pan = parseInt(this.getAttribute('pan') || '0');
        const solo = this.getAttribute('solo') === 'true';
        const muted = this.getAttribute('muted') === 'true';
        const deviceName = this.dataset.deviceName || '';

        // Create label with optional device name
        const labelText = deviceName ? `CH ${channel + 1}<br><span style="font-size: 0.8em; opacity: 0.7;">${deviceName}</span>` : `CH ${channel + 1}`;

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${labelText}</div>
            <button class="fader-button ${solo ? 'active' : ''}" id="solo-btn">S</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const channel = parseInt(this.getAttribute('channel') || '0');
        const soloBtn = this.shadowRoot.getElementById('solo-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        soloBtn?.addEventListener('click', () => {
            const newState = !soloBtn.classList.contains('active');
            this.setAttribute('solo', newState);
            this.dispatchEvent(new CustomEvent('solo-toggle', {
                detail: { channel, solo: newState },
                bubbles: true,
                composed: true
            }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', {
                detail: { channel, value: parseInt(e.target.value) }
            }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const wireValue = e.detail?.value ?? e.target?.value; // Slider sends 0-127
            const percentValue = Math.round((wireValue / 127) * 100); // Convert to 0-100 percentage
            this.setAttribute('volume', percentValue); // Store as percentage
            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { channel, value: parseInt(wireValue) } // Send wire value to backend
            }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', {
                detail: { channel, muted: newState }
            }));
        });
    }
}

/**
 * TEMPO Fader Component
 * Format: Just slider with reset button
 */
class TempoFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['bpm'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update slider directly, never re-render for BPM changes
        if (name === 'bpm') {
            const slider = this.shadowRoot?.getElementById('tempo-slider');
            if (slider) slider.setAttribute('value', newValue);
            return;
        }

        this.render();
    }

    render() {
        const bpm = parseInt(this.getAttribute('bpm') || '120');

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">TEMPO</div>
            <button class="fader-button" style="display: none;">S</button>
            <div class="pan-container" style="display: none;">
                <input type="range" class="pan-slider"
                       min="-100" max="100" value="0" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="tempo-slider" min="20" max="300" value="${bpm}" width="60"></svg-slider>
            </div>
            <button class="fader-button" id="reset-btn">R</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const tempoSlider = this.shadowRoot.getElementById('tempo-slider');
        const resetBtn = this.shadowRoot.getElementById('reset-btn');

        tempoSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('bpm', value);
            // Mark that we're actively changing the tempo
            this.dataset.tempoChanging = 'true';
            clearTimeout(this._tempoChangeTimeout);
            this._tempoChangeTimeout = setTimeout(() => {
                delete this.dataset.tempoChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('tempo-change', {
                detail: { bpm: parseInt(value) }
            }));
        });

        resetBtn?.addEventListener('click', () => {
            this.setAttribute('bpm', '125');
            this.dispatchEvent(new CustomEvent('tempo-reset', { detail: { bpm: 125 } }));
        });
    }
}

/**
 * STEREO SEPARATION Fader Component
 * Format: Just slider with reset button
 * Range: 0-127 (maps to 0-200, where 64≈100=normal)
 */
class StereoFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['separation'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update slider directly, never re-render for separation changes
        if (name === 'separation') {
            const slider = this.shadowRoot?.getElementById('stereo-slider');
            if (slider) slider.setAttribute('value', newValue);
            return;
        }

        this.render();
    }

    render() {
        const separation = parseInt(this.getAttribute('separation') || '64'); // Default to 64 (≈100 = normal)

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">STEREO</div>
            <button class="fader-button" style="display: none;">S</button>
            <div class="pan-container" style="display: none;">
                <input type="range" class="pan-slider"
                       min="-100" max="100" value="0" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="stereo-slider" min="0" max="127" value="${separation}" width="60"></svg-slider>
            </div>
            <button class="fader-button" id="reset-btn">R</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const stereoSlider = this.shadowRoot.getElementById('stereo-slider');
        const resetBtn = this.shadowRoot.getElementById('reset-btn');

        stereoSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('separation', value);
            // Mark that we're actively changing the separation
            this.dataset.separationChanging = 'true';
            clearTimeout(this._separationChangeTimeout);
            this._separationChangeTimeout = setTimeout(() => {
                delete this.dataset.separationChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('separation-change', {
                detail: { separation: parseInt(value) }
            }));
        });

        resetBtn?.addEventListener('click', () => {
            this.setAttribute('separation', '64'); // Reset to 64 (≈100 = normal stereo)
            this.dispatchEvent(new CustomEvent('separation-reset', { detail: { separation: 64 } }));
        });
    }
}

/**
 * Program Fader Component (for Samplecrate)
 * Format: Label, FX Enable, Pan, Volume, Mute
 * Similar to CHANNEL but with FX button instead of SOLO
 */
class ProgramFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['program', 'label', 'volume', 'pan', 'fx', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update sliders directly, never re-render for volume/pan changes
        if (name === 'volume') {
            const slider = this.shadowRoot?.getElementById('volume-slider');
            if (slider) {
                // Convert percentage (0-100) to wire format (0-127) for slider
                const wireValue = Math.round((parseInt(newValue) / 100) * 127);
                slider.setAttribute('value', wireValue);
            }
            return;
        }

        if (name === 'pan') {
            const slider = this.shadowRoot?.getElementById('pan-slider');
            if (slider) slider.value = newValue;
            return;
        }

        // For other attributes (program, label, fx, muted), re-render
        this.render();
    }

    render() {
        const program = parseInt(this.getAttribute('program') || '0');
        const label = this.getAttribute('label') || `PROG ${program}`;
        const volumePercent = parseInt(this.getAttribute('volume') || '100'); // 0-100 percentage
        const volume = Math.round((volumePercent / 100) * 127); // Convert to 0-127 for slider
        const pan = parseInt(this.getAttribute('pan') || '0');
        const fx = this.getAttribute('fx') === 'true';
        const muted = this.getAttribute('muted') === 'true';

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${label}</div>
            <button class="fader-button ${fx ? 'active' : ''}" id="fx-btn">FX</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const program = parseInt(this.getAttribute('program') || '0');
        const fxBtn = this.shadowRoot.getElementById('fx-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        fxBtn?.addEventListener('click', () => {
            const newState = !fxBtn.classList.contains('active');
            this.setAttribute('fx', newState);
            this.dispatchEvent(new CustomEvent('fx-toggle', {
                detail: { program, enabled: newState },
                bubbles: true,
                composed: true
            }));
        });

        panSlider?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.setAttribute('pan', value);
            this.dispatchEvent(new CustomEvent('pan-change', {
                detail: { program, value },
                bubbles: true,
                composed: true
            }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const wireValue = e.detail?.value ?? e.target?.value; // Slider sends 0-127
            const percentValue = Math.round((wireValue / 127) * 100); // Convert to 0-100 percentage
            this.setAttribute('volume', percentValue); // Store as percentage

            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce

            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { program, value: parseInt(wireValue) }, // Send wire value
                bubbles: true,
                composed: true
            }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', {
                detail: { program, muted: newState },
                bubbles: true,
                composed: true
            }));
        });
    }
}

/**
 * DECK Fader Component (for Mixxx DJ Decks)
 * Format: Deck Label (colored), Volume, Mute
 * No pan slider - simplified for DJ deck control
 */
class DeckFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['deck', 'volume', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        // ALWAYS just update slider directly for volume changes
        if (name === 'volume') {
            const slider = this.shadowRoot?.getElementById('volume-slider');
            if (slider) {
                // Convert percentage (0-100) to wire format (0-127) for slider
                const wireValue = Math.round((parseInt(newValue) / 100) * 127);
                slider.setAttribute('value', wireValue);
            }
            return;
        }

        // For muted or deck changes, re-render
        this.render();
    }

    render() {
        const deck = parseInt(this.getAttribute('deck') || '1');
        const volumePercent = parseInt(this.getAttribute('volume') || '100'); // 0-100 percentage
        const volume = Math.round((volumePercent / 100) * 127); // Convert to 0-127 for slider
        const muted = this.getAttribute('muted') === 'true';

        // Deck labels: A, B, C, D
        const deckLabels = { 1: 'DECK A', 2: 'DECK B', 3: 'DECK C', 4: 'DECK D' };
        const deckLabel = deckLabels[deck] || `DECK ${deck}`;

        // Deck colors: RED for A, BLUE for B, default for C/D
        const deckColors = { 1: '#FF0000', 2: '#0000FF', 3: '#00FF00', 4: '#FFFF00' };
        const borderColor = deckColors[deck] || '#CF1A37';

        this.shadowRoot.innerHTML = `
            <style>
                ${this.getBaseStyles()}

                .fader-label {
                    border: 2px solid ${borderColor};
                }
            </style>
            <div class="fader-label">${deckLabel}</div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const deck = parseInt(this.getAttribute('deck') || '1');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        volumeSlider?.addEventListener('input', (e) => {
            const wireValue = e.detail?.value ?? e.target?.value; // Slider sends 0-127
            const percentValue = Math.round((wireValue / 127) * 100); // Convert to 0-100 percentage
            this.setAttribute('volume', percentValue); // Store as percentage

            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce to prevent state updates during drag

            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { deck, value: parseInt(wireValue) }, // Send wire value
                bubbles: true,
                composed: true
            }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', {
                detail: { deck, muted: newState },
                bubbles: true,
                composed: true
            }));
        });
    }
}

/**
 * CC Fader Component
 * Generic MIDI CC fader for any CC number
 * Supports both vertical (default) and horizontal orientation
 */
class CCFader extends BaseFader {
    static get observedAttributes() {
        return ['label', 'cc', 'value', 'min', 'max', 'horizontal'];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.shadowRoot) {
            if (name === 'value') {
                const slider = this.shadowRoot.querySelector('#cc-slider');
                const valueDisplay = this.shadowRoot.querySelector('.fader-value');
                const isHorizontal = this.getAttribute('horizontal') === 'true';

                if (slider) {
                    // For horizontal (HTML range), set .value; for vertical (svg-slider), set attribute
                    if (isHorizontal) {
                        slider.value = newValue;
                    } else {
                        slider.setAttribute('value', newValue);
                    }
                }
                if (valueDisplay) valueDisplay.textContent = newValue;
            } else if (name === 'horizontal') {
                this.render();  // Re-render when orientation changes
            }
        }
    }

    render() {
        const label = this.getAttribute('label') || 'CC';
        const cc = this.getAttribute('cc') || '1';
        const value = parseInt(this.getAttribute('value') || '64');
        const min = parseInt(this.getAttribute('min') || '0');
        const max = parseInt(this.getAttribute('max') || '127');
        const isHorizontal = this.getAttribute('horizontal') === 'true';

        if (isHorizontal) {
            // Horizontal layout - use HTML range input
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        height: 100%;
                        padding: 8px;
                        gap: 10px;
                        box-sizing: border-box;
                    }

                    .fader-label {
                        color: #aaa;
                        font-size: 0.85em;
                        font-weight: bold;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        white-space: nowrap;
                    }

                    .horizontal-slider {
                        -webkit-appearance: none;
                        appearance: none;
                        flex: 1;
                        height: 24px;
                        background: #2a2a2a;
                        outline: none;
                        border-radius: 4px;
                        cursor: pointer;
                        touch-action: none;
                    }

                    .horizontal-slider::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 32px;
                        height: 32px;
                        background: #CF1A37;
                        cursor: grab;
                        border-radius: 4px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    }

                    .horizontal-slider::-webkit-slider-thumb:active {
                        cursor: grabbing;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    }

                    .horizontal-slider::-moz-range-thumb {
                        width: 32px;
                        height: 32px;
                        background: #CF1A37;
                        cursor: grab;
                        border: none;
                        border-radius: 4px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    }

                    .horizontal-slider::-moz-range-thumb:active {
                        cursor: grabbing;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    }

                    .fader-value {
                        font-size: 0.85em;
                        color: #888;
                        padding: 4px 8px;
                        background: #0a0a0a;
                        border-radius: 4px;
                        min-width: 40px;
                        text-align: center;
                        white-space: nowrap;
                    }
                </style>

                <div class="fader-label">${label}</div>
                <input type="range" class="horizontal-slider" id="cc-slider"
                       min="${min}" max="${max}" value="${value}">
                <div class="fader-value">${value}</div>
            `;
        } else {
            // Vertical layout - use svg-slider
            this.shadowRoot.innerHTML = `
                <style>
                    ${this.getBaseStyles()}

                    .fader-value {
                        font-size: 0.9em;
                        color: #888;
                        padding: 4px 8px;
                        background: #0a0a0a;
                        border-radius: 4px;
                        min-width: 40px;
                        text-align: center;
                    }

                    .cc-number {
                        font-size: 0.7em;
                        color: #666;
                        margin-top: 4px;
                    }
                </style>

                <div class="fader-label">${label}</div>
                <div class="fader-value">${value}</div>
                <div class="slider-container">
                    <svg-slider id="cc-slider" min="${min}" max="${max}" value="${value}" width="60"></svg-slider>
                </div>
                <div class="cc-number">CC ${cc}</div>
            `;
        }
    }

    setupEventListeners() {
        const slider = this.shadowRoot.querySelector('#cc-slider');
        const valueDisplay = this.shadowRoot.querySelector('.fader-value');
        const cc = parseInt(this.getAttribute('cc') || '1');
        const isHorizontal = this.getAttribute('horizontal') === 'true';

        slider?.addEventListener('input', (e) => {
            // For horizontal (HTML range), use e.target.value; for vertical (svg-slider), use e.detail.value
            const value = isHorizontal ? parseInt(e.target.value) : e.detail.value;
            valueDisplay.textContent = value;

            // Mark as changing to prevent state updates from interfering
            this.dataset.ccChanging = 'true';

            this.dispatchEvent(new CustomEvent('cc-change', {
                detail: { cc, value },
                bubbles: true,
                composed: true
            }));
        });

        slider?.addEventListener('change', (e) => {
            // Release the changing lock after user stops dragging
            // Wait 300ms to ensure Mixxx state update has time to catch up
            setTimeout(() => {
                delete this.dataset.ccChanging;
            }, 300);
        });
    }
}

// Register custom elements
customElements.define('mix-fader', MixFader);
customElements.define('channel-fader', ChannelFader);
customElements.define('tempo-fader', TempoFader);
customElements.define('stereo-fader', StereoFader);
customElements.define('program-fader', ProgramFader);
customElements.define('deck-fader', DeckFader);
customElements.define('cc-fader', CCFader);

export { MixFader, ChannelFader, TempoFader, DeckFader, CCFader };
