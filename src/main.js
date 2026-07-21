import * as THREE from 'three';
import { Campus } from './campus.js';
import { Daylight } from './sky.js';
import { Player } from './player.js';
import { Footsteps } from './audio.js';
import { Hud } from './hud.js';
import { TouchControls, isTouchDevice } from './touch.js';

const canvas = document.getElementById('view');
const hud = new Hud();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 4000);

const daylight = new Daylight(scene, renderer);
const player = new Player(camera, canvas);
const footsteps = new Footsteps();

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => hud.progress(loaded, total);

const campus = new Campus(scene);

async function boot() {
  try {
    const info = await campus.load('assets/campus.glb', manager, daylight.environment);

    // Drop the player onto the plaza rather than the model origin, which sits
    // underground on this model.
    player.position.set(0, 8, 70);

    hud.ready(`${info.meshCount} 个网格 · ${info.landmarks} 处地标`, touchMode);
  } catch (err) {
    console.error(err);
    hud.fail(`载入失败: ${err.message}`);
  }
}

/*
 * Input mode.
 *
 * Desktop gates play on pointer lock. Mobile has no pointer lock and no
 * keyboard, so it gates on an explicit flag instead and drives the player
 * through the on-screen stick.
 */
const touchMode = isTouchDevice();
const touch = new TouchControls(player, document.body);
let touchPlaying = false;

const playing = () => (touchMode ? touchPlaying : player.locked);

// The start overlay covers the canvas, so it -- not the canvas -- receives the
// tap or click that has to unlock audio and begin play.
function enter() {
  footsteps.resume();
  if (touchMode) {
    touchPlaying = true;
    touch.setEnabled(true);
    document.body.classList.add('touch-mode');
    hud.enterPlay();
  } else {
    player.requestLock();
  }
}

canvas.addEventListener('click', enter);
document.getElementById('start').addEventListener('click', enter);

document.addEventListener('pointerlockchange', () => {
  if (touchMode) return;
  if (player.locked) hud.enterPlay();
  else hud.exitPlay();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') footsteps.toggle();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/**
 * Hooks used by tools/ for screenshots and tests.
 *
 * The screenshot rig cannot acquire pointer lock, so it poses the camera through
 * __debugPose. The movement tests drive the controller directly rather than
 * through DOM input, because an automated pointer-lock session emits spurious
 * mousemove and keydown events that make measured distances meaningless.
 * Nothing in normal play calls any of this.
 */
Object.assign(window, {
  THREE,
  __player: player,
  __campus: campus,
  __footsteps: footsteps,

  __debugPose: (pos, look) => {
    camera.position.set(...pos);
    camera.lookAt(new THREE.Vector3(...look));
    // The shadow frustum tracks the player, so move it with the debug camera.
    player.position.set(...pos);
  },

  __debugHealth: () => ({
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    landmarks: campus.landmarks.map((l) => l.label),
    fps: hud.fps,
  }),
});

const timer = new THREE.Timer();

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = timer.getDelta();

  if (campus.collider && playing()) {
    player.update(dt, campus.collider);
    footsteps.update(player.bobPhaseValue, player.grounded, player.sprinting);
    hud.setPlace(campus.nearestLandmark(player.position));
  }

  daylight.update(player.position);
  hud.tick(player.sprinting);
  renderer.render(scene, camera);
});

boot();
