import * as THREE from 'three';
import { Campus } from './campus.js';
import { Daylight } from './sky.js';
import { Player } from './player.js';
import { Footsteps } from './audio.js';
import { Hud } from './hud.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Arena } from './combat/arena.js';
import { ViewModel } from './combat/viewmodel.js';
import { Flow } from './flow.js';

const canvas = document.getElementById('view');
const hud = new Hud();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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

// 相机入场景，其子物体(枪模)才渲染。
scene.add(camera);
const viewModel = new ViewModel(camera);

const touchMode = isTouchDevice();
const touch = new TouchControls(player, document.body);
let touchPlaying = false;

let arena = null;
let bannerShown = false;

// 流程：标题→开场→阵营→模式→匹配→对局。匹配结束回调 startMatch。
const flow = new Flow({
  camera,
  onGesture: () => footsteps.resume(),
  onStart: (faction) => startMatch(faction),
});

async function boot() {
  try {
    await campus.load('assets/campus.glb', manager, daylight.environment);
    hud.hideLoader();
  } catch (err) {
    console.error(err);
    hud.fail(`载入失败: ${err.message}`);
  }
}

// 匹配完成：按所选阵营建立对局。
function startMatch(faction) {
  arena = new Arena(scene, {
    playerTeam: faction,
    onKill: ({ headshot }) => hud.killFeed(headshot ? '你 ⟶ 爆头击杀 敌军' : '你 ⟶ 击杀 敌军', headshot),
    onHit: (headshot) => hud.hitMarker(headshot),
    onPlayerHit: () => hud.damageFlash(),
    onPlayerDied: () => hud.showDeath(),
    onPlayerRespawn: () => hud.clearDeath(),
  });
  arena.setCollider(campus.collider);
  arena.deploy();
  viewModel.setWeapon(arena.weapon.weapon.id);
  window.__arena = arena;

  const s = arena.playerSpawn();
  const gy = arena.groundHeight(s.x, s.z);
  player.position.set(s.x, gy + 0.95, s.z);
  player.velocity.set(0, 0, 0);
  // 面向敌方阵营(地图另一端)方向。
  const enemyZone = arena.enemyZone();
  player.yaw = Math.atan2(enemyZone.x - s.x, enemyZone.z - s.z) + Math.PI;
  player.pitch = 0;
  player.snapCamera();          // 相机立刻回到玩家视角(不再卡在开场俯瞰镜头)
  bannerShown = false;

  hud.enterPlay();
  if (touchMode) {
    touchPlaying = true;
    touch.setEnabled(true);
    document.body.classList.add('touch-mode');
  }
}

const gameActive = () => arena && flow.playing;
const canPlay = () => (touchMode ? touchPlaying : player.locked);

// 菜单结束后，桌面端点击画面锁定视角进入操作。
canvas.addEventListener('click', () => {
  if (gameActive() && !touchMode && !player.locked) player.requestLock();
});

document.addEventListener('pointerlockchange', () => {
  if (touchMode) return;
  if (player.locked) hud.enterPlay();
  else hud.exitPlay();
});

// 开火输入：左键连发、右键开镜、R 换弹。
let mouseFiring = false;
let aiming = false;
window.addEventListener('mousedown', (e) => {
  if (!gameActive() || !canPlay()) return;
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
  if (e.code === 'KeyR' && arena) arena.reload();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

Object.assign(window, {
  THREE,
  __player: player,
  __campus: campus,
  __footsteps: footsteps,
  __camera: camera,
  __vm: viewModel,
  __flow: flow,
  get __arena() { return arena; },
  // 测试用：只建立对局(不进入 playing，避免渲染循环与测试双重步进)。
  __buildArena: (faction = 'blue') => { startMatch(faction); flow.hideMenus(); return arena; },
  // 测试用：真正进入对局(渲染循环驱动)。
  __startMatch: (faction = 'blue') => { startMatch(faction); flow.hideMenus(); flow.state = 'playing'; return arena; },
  __debugHealth: () => ({
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    fps: hud.fps,
  }),
});

const timer = new THREE.Timer();

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = timer.getDelta();

  flow.update(dt);

  if (gameActive()) {
    const frozen = !arena.player.alive;
    if (canPlay() && !frozen) {
      player.update(dt, campus.collider);
      footsteps.update(player.bobPhaseValue, player.grounded, player.sprinting);
      hud.setPlace(campus.nearestLandmark(player.position));
    }

    const playerMoving = player.speed > 0.6;
    arena.update(dt, player, camera, playerMoving);
    arena.resolvePlayerCollision(player);

    if (canPlay() && (mouseFiring || touch.firing) && arena.player.alive) {
      if (arena.fire(camera)) { footsteps.playShot(arena.weapon.weapon.id); viewModel.kick(); }
    }

    const snap = arena.snapshot();
    hud.setCombat(snap);
    if (snap.winner && !bannerShown) {
      bannerShown = true;
      hud.exitPlay();
      if (!touchMode && player.locked) document.exitPointerLock?.();
      flow.showResult(snap.winner === arena.playerTeam, snap.blue, snap.red);
    }

    // 开镜。
    const wantAiming = aiming && canPlay();
    viewModel.setAiming(wantAiming);
    const targetFov = wantAiming ? HIP_FOV * 0.62 : HIP_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    viewModel.update(dt);
  }

  // 枪模仅在对局中显示(菜单/开场演出时隐藏)。
  viewModel.group.visible = gameActive();

  daylight.update(player.position);
  hud.tick(player.sprinting);
  renderer.render(scene, camera);
});

boot();
