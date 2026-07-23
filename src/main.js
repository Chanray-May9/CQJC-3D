import * as THREE from 'three';
import { Campus } from './campus.js';
import { Daylight } from './sky.js';
import { Player } from './player.js';
import { Footsteps } from './audio.js';
import { Hud } from './hud.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Arena } from './combat/arena.js';
import { ViewModel } from './combat/viewmodel.js';

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

// 本地死亡竞赛。敌人在玩家落地后 deploy。
const arena = new Arena(scene, {
  onKill: ({ headshot, score }) => {
    hud.killFeed(headshot ? '你 ⟶ 爆头击杀 敌军' : '你 ⟶ 击杀 敌军', headshot);
    const snap = arena.snapshot();
    if (snap.winner) {
      hud.banner(snap.winner === 'blue' ? '国军(蓝)获胜' : '共军(红)获胜', snap.winner);
    }
  },
  onHit: (headshot) => hud.hitMarker(headshot),
});
let deployed = false;

// 相机需在场景图里，其子物体(枪模)才会渲染。
scene.add(camera);
const viewModel = new ViewModel(camera);
viewModel.setWeapon(arena.weapon.weapon.id);

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

// 开火输入。桌面：按住鼠标左键连发（射速由武器门控）；右键开镜；换弹 R。
let mouseFiring = false;
let aiming = false;
window.addEventListener('mousedown', (e) => {
  if (!playing()) return;
  if (e.button === 0) mouseFiring = true;
  if (e.button === 2) aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseFiring = false;
  if (e.button === 2) aiming = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { mouseFiring = false; aiming = false; });

const HIP_FOV = 72;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') footsteps.toggle();
  if (e.code === 'KeyR') arena.reload();
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
  __arena: arena,
  __camera: camera,

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

    // 玩家落地后把敌人铺到场上（一次）。
    if (!deployed && player.grounded) {
      arena.deploy(player.position);
      deployed = true;
    }

    if (deployed) {
      arena.update(dt);
      if (mouseFiring || touch.firing) {
        const fired = arena.fire(camera);
        if (fired) {
          footsteps.playShot(arena.weapon.weapon.id);
          viewModel.kick();
        }
      }
      hud.setCombat(arena.snapshot());
    }
  }

  // 开镜：拉近 FOV，枪模移到中心。
  const wantAiming = aiming && playing();
  viewModel.setAiming(wantAiming);
  const targetFov = wantAiming ? HIP_FOV * 0.62 : HIP_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  viewModel.update(dt);

  daylight.update(player.position);
  hud.tick(player.sprinting);
  renderer.render(scene, camera);
});

boot();
