/**
 * Headed smoke test + screenshot rig.
 *
 * Drives the real Edge binary against a throwaway profile directory, so it never
 * contends with the user's running browser. Pointer lock is unavailable to an
 * automated run, so the camera is posed directly through a debug hook instead of
 * simulated input.
 *
 * usage: node tools/shoot.mjs <outDir>
 */

import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = 'http://127.0.0.1:5183/';
const OUT = process.argv[2] ?? 'shots';

/**
 * Poses to judge the render by.
 *
 * All at roughly eye height, and all facing away from the sun (which sits toward
 * +X / -Z) so cast shadows fall into frame rather than behind their buildings.
 * Staying near ground level also keeps the subject inside the 110 m shadow
 * frustum, which tracks the player -- fly far above it and everything in view
 * falls outside shadow coverage.
 */
const SHOTS = [
  { name: '01-plaza',    pos: [40, 1.7, 30],   look: [-120, 14, 60] },
  { name: '02-axis',     pos: [30, 1.7, -10],  look: [-140, 10, 20] },
  { name: '03-dorms',    pos: [10, 1.7, -40],  look: [-130, 18, -10] },
  { name: '04-field',    pos: [60, 1.7, 10],   look: [-60, 6, 55] },
  { name: '05-overview', pos: [70, 28, -30],   look: [-60, 0, 30] },
  { name: '06-street',   pos: [-10, 1.7, 60],  look: [-120, 12, 30] },
];

const browser = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'campus-shot-')),
  {
    channel: 'msedge',
    headless: false,
    viewport: { width: 1600, height: 900 },
    args: ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'],
  },
);

const page = await browser.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

// Wait for the loader to hand off to the start prompt -- that is the signal the
// GLB, all six texture sets, and the BVH build have completed.
// Note the explicit null arg: waitForFunction takes (fn, arg, options), so
// passing options in the second slot silently leaves the default 30s timeout.
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null,
  { timeout: 120000 },
);

const summary = await page.textContent('#start .detail');
console.log('loaded:', summary);

mkdirSync(OUT, { recursive: true });

// The start gate dims the canvas by 82%; hide the whole DOM layer so shots show
// the render and nothing else.
await page.addStyleTag({ content: '.overlay, #place, #stats, #crosshair { display: none !important; }' });

for (const shot of SHOTS) {
  await page.evaluate(({ pos, look }) => window.__debugPose(pos, look), shot);
  await page.waitForTimeout(700);  // let shadow map and texture streaming settle
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  console.log('shot:', shot.name);
}

const health = await page.evaluate(() => window.__debugHealth());
console.log('health:', JSON.stringify(health, null, 2));

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 12)) console.log('  -', e);
} else {
  console.log('\nno console errors');
}

await browser.close();
process.exit(errors.length ? 1 : 0);
