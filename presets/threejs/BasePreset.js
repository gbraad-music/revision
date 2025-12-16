// BasePreset - Base class for all Three.js presets
// Users extend this class to create custom visualizations

class ThreeJSBasePreset {
    constructor(scene, camera, renderer, audioContext) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.audioContext = audioContext;

        // Audio-reactive data (updated by ThreeJSRenderer)
        this.frequencyData = { bass: 0, mid: 0, high: 0 };
        this.beatPhase = 0;
        this.beatIntensity = 0;

        // Time tracking
        this.time = 0;
        this.deltaTime = 0;
        
        // Audio analyser for raw waveform access
        this.audioAnalyser = null;
        this.audioAnalyserLeft = null;
        this.audioAnalyserRight = null;
    }

    // Called once when preset is loaded
    initialize() {
        // Override in subclass to create objects, lights, etc.
    }

    // Called every frame
    update(deltaTime) {
        this.deltaTime = deltaTime;
        this.time += deltaTime;
        // Override in subclass for animations
    }

    // Called when beat is detected
    onBeat(intensity) {
        this.beatIntensity = intensity;
        // Override in subclass for beat reactions
    }

    // Called when note is played
    onNote(note, velocity) {
        // Override in subclass for note reactions
    }

    // Called when control change is received
    onControl(id, value) {
        // Override in subclass for CC reactions
    }

    // Called when frequency data is updated
    onFrequency(bands) {
        this.frequencyData = bands;
        // Override in subclass for frequency reactions
    }

    // Called when preset is being unloaded
    dispose() {
        // Override in subclass to clean up resources
        // Remove objects from scene, dispose geometries/materials, etc.
    }

    // Helper: Create basic lighting
    addBasicLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
    }
}

window.ThreeJSBasePreset = ThreeJSBasePreset;
