/**
 * 8v8 人机 AI 冒烟测试（子计划3.5）。
 * 验证：两队在地图两端分开出生；机器人会在地图上移动(不只原地摇)；我方(蓝)AI 也会
 * 击杀红队(双方都得分)；玩家不被瞬秒；玩家能被打死并在蓝区复活；帧率达标。
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
  pl.position.set(0, 3, 70); pl.velocity.set(0, 0, 0);
  for (let i = 0; i < 120; i++) pl.update(1 / 60, col);
  a.deploy(pl.position.clone());

  // 出生分区：蓝队平均 z 应明显大于红队平均 z。
  const avgZ = (t) => { const g = a.bots.filter(b => b.c.team === t); return g.reduce((s, b) => s + b.pos.z, 0) / g.length; };
  const blueZ0 = avgZ('blue'), redZ0 = avgZ('red');

  const startPos = a.bots.map(b => b.pos.clone());
  const eye = () => cam.position.set(pl.position.x, pl.position.y + 0.78, pl.position.z);

  // 玩家面向 -Z 并向前推进(走进战场)，以验证会被红队打死。
  pl.yaw = 0; pl.pitch = 0; pl.analog = { x: 0, y: 1 };
  let healthAt1s = 100, everDamaged = false, died = false, respawned = false, wasDead = false;
  for (let f = 0; f < 1500; f++) {   // 25s
    pl.update(1 / 60, col); eye(); cam.updateMatrixWorld(true);
    a.update(1 / 60, pl, cam, false);
    if (a.player.health < 100) everDamaged = true;
    if (f === 60) healthAt1s = a.player.health;
    if (!a.player.alive) { died = true; wasDead = true; }
    if (wasDead && a.player.alive) respawned = true;
  }
  // 移动量：机器人平均位移
  const moved = a.bots.reduce((s, b, i) => s + b.pos.distanceTo(startPos[i]), 0) / a.bots.length;

  return {
    blueZ0: +blueZ0.toFixed(0), redZ0: +redZ0.toFixed(0),
    avgMoved: +moved.toFixed(1),
    blueScore: a.state.score('blue'), redScore: a.state.score('red'),
    healthAt1s: Math.round(healthAt1s), everDamaged, died, respawned,
    fps: window.__debugHealth().fps,
  };
});

check('两队在地图两端分开出生', sim.blueZ0 - sim.redZ0 > 60,
  `蓝队 z≈${sim.blueZ0} vs 红队 z≈${sim.redZ0}`);
check('机器人在地图上真实移动(非原地摇)', sim.avgMoved > 8,
  `平均位移 ${sim.avgMoved}m`);
check('双方 AI 都能击杀得分', sim.blueScore > 0 && sim.redScore > 0,
  `蓝 ${sim.blueScore} · 红 ${sim.redScore}`);
check('玩家不被瞬秒(1s 存活)', sim.healthAt1s > 0, `1s 血量=${sim.healthAt1s}`);
check('玩家可被打死并复活', sim.died && sim.respawned, `died=${sim.died} respawned=${sim.respawned}`);

console.log(`\nfps=${sim.fps}`);
if (errors.length) { console.log(`\n${errors.length} console error(s):`); errors.slice(0, 8).forEach(e => console.log('  -', e)); }

await ctx.close();
const failed = results.filter(r => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
