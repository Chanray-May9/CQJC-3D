/**
 * Movement and collision test.
 *
 * Two layers, deliberately separated:
 *
 *  - DOM layer: does clicking actually get you into the game? Real gesture, real
 *    pointer lock.
 *  - Simulation layer: does the controller behave? Driven by setting the key set
 *    and stepping a fixed timestep directly.
 *
 * The split exists because an automated pointer-lock session emits spurious
 * mousemove and keydown events -- yaw drifts on its own and phantom keys appear
 * -- which makes distance assertions through the DOM meaningless. Input handling
 * is verified once, up top; everything about motion is measured deterministically.
 */

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'campus-walk-')),
  { channel: 'msedge', headless: false, viewport: { width: 1000, height: 620 } },
);
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null,
  { timeout: 120000 },
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

// --- DOM layer --------------------------------------------------------
// The start overlay covers the canvas, so this also guards against the overlay
// swallowing the click that enters the game.
await page.click('#start');
await page.waitForTimeout(500);
const locked = await page.evaluate(() => window.__player.locked);
check('clicking the start overlay enters mouse-look', locked, `pointerLock=${locked}`);

const audioLive = await page.evaluate(() => window.__footsteps?.ctx?.state ?? 'none');
check('audio context unlocked by the same gesture', audioLive === 'running',
  `AudioContext=${audioLive}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- simulation layer -------------------------------------------------
const sim = await page.evaluate(() => {
  const pl = window.__player;
  const col = window.__campus.collider;
  const STEP = 1 / 60;

  const settle = (x, y, z, yaw) => {
    pl.position.set(x, y, z);
    pl.velocity.set(0, 0, 0);
    pl.yaw = yaw;
    pl.pitch = 0;
    pl.keys.clear();
    for (let i = 0; i < 90; i++) pl.update(STEP, col);
  };

  // Horizontal distance only. Using 3D distance would count a fall as forward
  // progress, which silently inverts the meaning of the wall test.
  const run = (frames) => {
    const start = pl.position.clone();
    for (let i = 0; i < frames; i++) pl.update(STEP, col);
    return {
      dist: +Math.hypot(pl.position.x - start.x, pl.position.z - start.z).toFixed(2),
      drop: +(start.y - pl.position.y).toFixed(2),
      grounded: pl.grounded,
      y: +pl.position.y.toFixed(2),
    };
  };

  // Spawn point, on the plaza.
  settle(0, 20, 70, Math.PI);
  const spawn = { y: +pl.position.y.toFixed(2), grounded: pl.grounded };

  settle(0, 3, 70, Math.PI);
  pl.keys.add('KeyW');
  const walk = run(120);

  settle(0, 3, 70, Math.PI);
  pl.keys.add('KeyW');
  pl.keys.add('ShiftLeft');
  const sprint = run(120);

  // Walk into a real building. Stand just clear of its +X face at ground level
  // and face -X. Spawning above the centre would land the player on the roof,
  // where "forward progress" measures a walk across the roof instead.
  let wallBox = null;
  window.__campus.root.traverse((o) => {
    if (!o.isMesh || !/宿舍楼\d*_body/.test(o.name || o.parent?.name || '')) return;
    const b = new window.THREE.Box3().setFromObject(o);
    if (!wallBox) wallBox = b;
  });
  const standX = wallBox.max.x + 2.5;
  const standZ = (wallBox.min.z + wallBox.max.z) / 2;
  // forward = (-sin(yaw), 0, -cos(yaw)), so yaw = +pi/2 points down -X.
  settle(standX, wallBox.min.y + 4, standZ, Math.PI / 2);
  const gapBefore = +(pl.position.x - wallBox.max.x).toFixed(2);
  pl.keys.add('KeyW');
  const intoWall = run(240);
  const penetration = +(wallBox.max.x - pl.position.x).toFixed(2);

  // Jump should leave the ground.
  settle(0, 3, 70, Math.PI);
  pl.keys.add('Space');
  pl.update(STEP, col);
  const airborne = !pl.grounded && pl.velocity.y > 0;

  return {
    spawn, walk, sprint, intoWall, airborne,
    wall: { gapBefore, penetration, faceX: +wallBox.max.x.toFixed(1) },
  };
});

check('player settles on the ground from a 20 m drop',
  sim.spawn.grounded && sim.spawn.y > -5,
  `grounded=${sim.spawn.grounded} y=${sim.spawn.y}`);

// 2 s at 3.4 m/s, minus a few frames of acceleration.
check('walk speed is right', sim.walk.dist > 6 && sim.walk.dist < 7.2,
  `${sim.walk.dist} m in 2 s (${(sim.walk.dist / 2).toFixed(2)} m/s, target 3.4)`);

check('sprint speed is right', sim.sprint.dist > 12.5 && sim.sprint.dist < 14.5,
  `${sim.sprint.dist} m in 2 s (${(sim.sprint.dist / 2).toFixed(2)} m/s, target 7.0)`);

// Free walking covers ~13.6 m in 4 s. The player starts 2.5 m from the facade,
// so anything beyond a couple of metres means the capsule went through it.
check('building wall blocks the player',
  sim.intoWall.dist < 4 && sim.wall.penetration < 0.5,
  `advanced ${sim.intoWall.dist} m of a possible 13.6 m from ${sim.wall.gapBefore} m out; ` +
  `capsule centre ended ${sim.wall.penetration} m past the facade (x=${sim.wall.faceX})`);

check('player stays on the ground while blocked', sim.intoWall.grounded,
  `grounded=${sim.intoWall.grounded} y=${sim.intoWall.y}`);

check('jump leaves the ground', sim.airborne, `airborne=${sim.airborne}`);

const health = await page.evaluate(() => window.__debugHealth());
console.log(`\nfps=${health.fps}  drawCalls=${health.drawCalls}  tris=${health.triangles}`);

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  errors.slice(0, 8).forEach((e) => console.log('  -', e));
}

await ctx.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
