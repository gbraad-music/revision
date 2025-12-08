# Three.js Custom Presets

This folder contains Three.js visualization presets. You can create your own custom presets by extending the `ThreeJSBasePreset` class!

## Creating a Custom Preset

1. **Create a new file** in this folder (e.g., `MyAwesomePreset.js`)

2. **Extend the base class:**

```javascript
class MyAwesomePreset extends ThreeJSBasePreset {
    initialize() {
        // Called once when preset loads
        // Create your 3D objects, lights, materials here

        // Example: Add basic lighting
        this.addBasicLighting();

        // Example: Create a spinning cube
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        this.cube = new THREE.Mesh(geometry, material);
        this.scene.add(this.cube);
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Called every frame
        // Animate your objects here

        if (this.cube) {
            this.cube.rotation.x += deltaTime;
            this.cube.rotation.y += deltaTime * 0.5;

            // React to audio
            const scale = 1.0 + this.frequencyData.bass * 2;
            this.cube.scale.setScalar(scale);
        }
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Called when beat is detected
        // Trigger flash effects, color changes, etc.

        if (this.cube) {
            this.cube.material.emissive.setHex(0xff0000);
        }
    }

    dispose() {
        // Called when preset is unloaded
        // Clean up your objects to prevent memory leaks

        if (this.cube) {
            this.scene.remove(this.cube);
            this.cube.geometry.dispose();
            this.cube.material.dispose();
        }
    }
}

// Make it available globally
window.MyAwesomePreset = MyAwesomePreset;
```

3. **Add the script to index.html:**

```html
<script src="presets/threejs/MyAwesomePreset.js"></script>
```

4. **Register the preset in app.js** (around line 210):

```javascript
if (typeof MyAwesomePreset !== 'undefined') {
    this.threeJSRenderer.registerPreset('awesome', MyAwesomePreset);
}
```

## Available Properties

Your preset has access to:

- `this.scene` - Three.js scene
- `this.camera` - Three.js camera
- `this.renderer` - Three.js renderer
- `this.audioContext` - Web Audio API context
- `this.frequencyData` - Audio frequency bands: `{ bass, mid, high }` (0.0 - 1.0)
- `this.beatPhase` - Current beat phase (0.0 - 1.0)
- `this.beatIntensity` - Last beat intensity (0.0 - 1.0+)
- `this.time` - Total elapsed time in seconds
- `this.deltaTime` - Time since last frame

## Available Methods

Override these methods in your preset:

- `initialize()` - Create objects, lights, setup scene
- `update(deltaTime)` - Animate objects every frame
- `onBeat(intensity)` - React to beat detection
- `onNote(note, velocity)` - React to MIDI notes (0-127)
- `onControl(id, value)` - React to MIDI CC (id: 0-127, value: 0.0-1.0)
- `onFrequency(bands)` - React to audio frequencies `{ bass, mid, high }`
- `dispose()` - Clean up resources

## Helper Methods

- `this.addBasicLighting()` - Adds ambient + directional light

## Examples

Check out the included presets:
- `GeometricShapes.js` - Rotating cubes with audio reactivity
- `Particles.js` - Particle system with color shifts
- `Tunnel.js` - Infinite tunnel effect

## Tips

1. **Always dispose**: Clean up geometries, materials, and objects in `dispose()`
2. **Use deltaTime**: Multiply rotations/movements by `deltaTime` for smooth animation
3. **Audio reactive**: Use `this.frequencyData` for real-time audio visualization
4. **Beat sync**: Use `onBeat()` for synchronized flashes and pulses
5. **Performance**: Keep polygon counts reasonable (< 100k triangles)

## Sharing Your Presets

Want to share your cool preset? Drop it in this folder and it becomes part of Revision!

Happy visualizing! 🎨✨
