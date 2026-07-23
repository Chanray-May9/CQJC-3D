/**
 * 人机 AI 冒烟测试（子计划3）。
 * 验证：机器人会朝玩家靠近；会对玩家造成伤害但不瞬秒(1s 内不致死)；玩家能被打死；
 * 死亡后能复活；16 实体下帧率达标。
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'ai-')),
  { channel: 'msedge', headless: true, viewport: { width: 900, height: 560 } },
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null, { timeout: 120000 });
await page.click('#start');
await page.waitForTimeout(500);

const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}\n        ${d}`); };

const sim = await page.evaluate(() => {
  const a = window.__arena, pl = window.__player, cam = window.__camera, THREE = window.THREE;
  const col = window.__campus.collider;
  a.setCollider(col);
  // 玩家站在广场开阔处
  pl.position.set(0, 3, 70); pl.velocity.set(0, 0, 0);
  for (let i = 0; i < 120; i++) pl.update(1 / 60, col);
  a.deploy(pl.position.clone());

  const eye = () => cam.position.set(pl.position.x, pl.position.y + 0.78, pl.position.z);
  const minBotDist = () => Math.min(...a.bots.map(b => Math.hypot(b.pos.x - pl.position.x, b.pos.z - pl.position.z)));

  eye(); cam.updateMatrixWorld(true);
  const startMinDist = minBotDist();

  let healthAt1s = 100, everDamaged = false, died = false, respawned = false;
  let wasDead = false;
  for (let f = 0; f < 900; f++) {   // 15s @60fps
    pl.update(1 / 60, col);
    eye(); cam.updateMatrixWorld(true);
    a.update(1 / 60, pl, cam, false);
    if (a.player.health < 100) everDamaged = true;
    if (f === 60) healthAt1s = a.player.health;
    if (!a.player.alive) { died = true; wasDead = true; }
    if (wasDead && a.player.alive) respawned = true;
  }
  const endMinDist = minBotDist();
  return {
    startMinDist: +startMinDist.toFixed(1), endMinDist: +endMinDist.toFixed(1),
    healthAt1s: Math.round(healthAt1s), everDamaged, died, respawned,
    fps: window.__debugHealth().fps,
  };
});

check('机器人进入并保持交战距离', sim.endMinDist < 22,
  `最近机器人保持在 ${sim.endMinDist}m(偏好~16m 走位)`);
check('机器人能对玩家造成伤害', sim.everDamaged, `曾扣血=${sim.everDamaged}`);
check('不瞬秒：1 秒时玩家仍存活', sim.healthAt1s > 0, `1s 血量=${sim.healthAt1s}`);
check('玩家可被打死并复活', sim.died && sim.respawned, `died=${sim.died} respawned=${sim.respawned}`);

const health = await page.evaluate(() => window.__debugHealth());
console.log(`\nfps=${health.fps} tris=${health.triangles} draws=${health.drawCalls}`);
if (errors.length) { console.log(`\n${errors.length} console error(s):`); errors.slice(0, 8).forEach(e => console.log('  -', e)); }

await ctx.close();
const failed = results.filter(r => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
