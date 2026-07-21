import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * Mid-morning lighting: bright, clearly readable, with real directional shadows.
 *
 * Sun sits at ~38 degrees elevation from the east-southeast. High enough that the
 * campus is evenly lit rather than raking, low enough that every building throws a
 * shadow long enough to give the flat massing some depth.
 */

const SUN_ELEVATION = 38;   // degrees above horizon
const SUN_AZIMUTH = 105;    // degrees, from north -- puts the sun ESE
const SHADOW_EXTENT = 110;  // metres covered by the shadow camera, centred on the player

export class Daylight {
  constructor(scene, renderer) {
    this.scene = scene;

    // --- sky dome -------------------------------------------------------
    const sky = new Sky();
    sky.scale.setScalar(20000);
    // The dome sits far beyond the fog's far plane, so without this it renders
    // as 100% fog colour -- a flat white ceiling instead of a sky.
    sky.material.fog = false;

    const u = sky.material.uniforms;
    u.turbidity.value = 3.2;      // low haze: morning air after the mist burns off
    u.rayleigh.value = 1.6;       // sky blue without going tropical
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;

    // --- sun position ---------------------------------------------------
    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    // --- environment map ------------------------------------------------
    /*
     * Prefilter the sky into an environment map before the dome joins the main
     * scene. Glass needs something to reflect: with no environment, a smooth
     * low-roughness surface has nothing to gather and renders near black, which
     * is the opposite of the pale blue glazing we want.
     *
     * This is handed to the glass materials individually rather than assigned as
     * scene.environment. The Sky shader emits high dynamic range radiance -- into
     * the hundreds near the sun -- so as a scene-wide ambient it overwhelms the
     * sun and hemisphere fill and washes everything out, even at low intensity.
     * Scoping it to the surfaces that actually need reflections keeps the rest of
     * the lighting exactly as tuned.
     *
     * PMREMGenerator.fromScene needs the dome in a scene of its own, and an
     * Object3D has a single parent, so build the environment first and move the
     * dome across afterwards.
     */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky);
    this.environment = pmrem.fromScene(envScene, 0, 1, 20000).texture;
    pmrem.dispose();

    scene.add(sky);

    // --- key light ------------------------------------------------------
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.1);
    sun.position.copy(this.sunDir).multiplyScalar(300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);

    const cam = sun.shadow.camera;
    cam.near = 1;
    cam.far = 900;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.updateProjectionMatrix();

    // Tuned against the 4096 map at 110 m extent: enough to kill acne on the
    // large flat ground plane without detaching shadows from wall bases.
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;

    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // --- fill -----------------------------------------------------------
    // Sky/ground bounce. Keeps shadowed facades from going dead black, which is
    // what actually sells "bright morning" over "harsh noon".
    const hemi = new THREE.HemisphereLight(0xbdd7f5, 0x6b6255, 1.15);
    scene.add(hemi);
    this.hemi = hemi;

    // Very light aerial perspective. At 520 m across, distant buildings need a
    // touch of haze or the scene reads as a flat diorama.
    scene.fog = new THREE.Fog(0xcfe0ee, 260, 1100);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    // PCFSoft is deprecated in current three and silently falls back to PCF, so
    // ask for PCF directly and get the softness from the 4096 map instead.
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  /**
   * Re-centre the shadow frustum on the viewer each frame. Without this a single
   * map stretched over the whole 520x320 m campus gives roughly 7 cm texels and
   * the shadow edges turn to mush.
   */
  update(focus) {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.updateMatrixWorld();
  }
}
