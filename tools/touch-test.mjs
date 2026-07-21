/**
 * Touch control test, run against an emulated phone.
 *
 * Uses a real mobile device profile so `isTouchDevice()` takes the mobile path,
 * then drives actual touchscreen gestures through CDP -- dispatching synthetic
 * pointer events instead would bypass the very branch under test.
 */

import { chromium, devices } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const phone = devices['Pixel 7'];

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'campus-touch-')),
  { channel: 'msedge', headless: false, ...phone },
);
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null,
  { timeout: 180000 },
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

// --- mobile branch actually taken? ------------------------------------
const hints = await page.textContent('#start .keys');
check('mobile control hints shown', hints.includes('摇杆'), hints.replace(/\s+/g, ' ').trim());

await page.tap('#start');
await page.waitForTimeout(1500);

const uiVisible = await page.evaluate(() =>
  document.getElementById('touch-ui').classList.contains('visible'));
check('touch UI enabled on tap', uiVisible, `visible=${uiVisible}`);

const state = () => page.evaluate(() => ({
  pos: window.__player.position.toArray().map((n) => +n.toFixed(2)),
  yaw: +window.__player.yaw.toFixed(3),
  analog: { x: +window.__player.analog.x.toFixed(2), y: +window.__player.analog.y.toFixed(2) },
  sprint: window.__player.sprintHeld,
  grounded: window.__player.grounded,
}));

await page.waitForTimeout(1500);   // let the drop settle
const before = await state();
check('player on the ground', before.grounded, `y=${before.pos[1]}`);

// --- gesture helper ---------------------------------------------------
/*
 * Every gesture gets a fresh touch id and is fully released before the next one
 * starts. Reusing a single id across gestures lets the browser thread them
 * together as one continuing pointer, which leaks a look-drag into the stick and
 * makes results differ run to run.
 */
const cdp = await ctx.newCDPSession(page);
let touchId = 100;

async function gesture(points, holdMs = 0) {
  const id = ++touchId;
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: first[0], y: first[1], id }],
  });
  await page.waitForTimeout(120);

  for (const [x, y] of rest) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id }],
    });
    await page.waitForTimeout(120);
  }

  if (holdMs) await page.waitForTimeout(holdMs);
  const snapshot = await state();

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  return snapshot;
}

// --- left half: walk with the stick -----------------------------------
// Thumb lands on the left half, then pushes forward (up the screen).
const walking = await gesture([[120, 500], [120, 430]], 2000);

const dist = Math.hypot(walking.pos[0] - before.pos[0], walking.pos[2] - before.pos[2]);
check('stick deflection registers', walking.analog.y > 0.5,
  `analog=(${walking.analog.x}, ${walking.analog.y})`);
check('stick walks the player', dist > 2, `travelled ${dist.toFixed(2)} m in 2 s`);

const released = await state();
check('releasing the stick stops input', released.analog.y === 0,
  `analog=(${released.analog.x}, ${released.analog.y})`);

// --- right half: drag to look -----------------------------------------
// Coordinates are CSS pixels in the emulated viewport (Pixel 7 is 412 wide), so
// the look drag has to stay inside it and right of the 45% split.
const { width } = page.viewportSize();
const rightX = Math.round(width * 0.8);
const yawBefore = (await state()).yaw;
const looked = await gesture([[rightX, 500], [rightX - 60, 500], [rightX - 120, 500]]);
check('right-half drag turns the view', Math.abs(looked.yaw - yawBefore) > 0.1,
  `yaw ${yawBefore} -> ${looked.yaw}`);

// --- buttons ----------------------------------------------------------
// Read the button's own state rather than assuming a starting value, so the
// assertion is about the toggle flipping, not about which way it flipped.
const sprintBefore = (await state()).sprint;
await page.tap('#btn-sprint');
await page.waitForTimeout(250);
const sprintAfter = (await state()).sprint;
check('sprint button toggles', sprintAfter !== sprintBefore,
  `sprintHeld ${sprintBefore} -> ${sprintAfter}`);

// Land first: the jump is ignored while airborne, which is correct behaviour but
// makes for a flaky assertion if the previous step left the player in the air.
await page.waitForFunction(() => window.__player.grounded, null, { timeout: 10000 });
await page.tap('#btn-jump');
await page.waitForTimeout(120);
const jumped = await page.evaluate(() => window.__player.velocity.y);
check('jump button leaves the ground', jumped > 0, `velocity.y=${jumped.toFixed(2)}`);

await page.screenshot({ path: 'shots/mobile.png' });

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  errors.slice(0, 8).forEach((e) => console.log('  -', e));
}

await ctx.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
