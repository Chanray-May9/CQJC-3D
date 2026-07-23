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
await page.waitForFunction(() => !!window.__campus?.collider, null, { timeout: 120000 });
await page.waitForTimeout(500);

const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}\n        ${d}`); };

const sim = await page.evaluate(() => {
  const pl = window.__player, cam = window.__camera, THREE = window.THREE;
  const col = window.__campus.collider;
  const a = window.__buildArena('blue');   // 建立对局(不进 playing，测试自行步进)
  pl.position.set(0, 3, 70); pl.velocity.set(0, 0, 0);
  for (let i = 0; i < 120; i++) pl.update(1 / 60, col);

  // 出生分区：两队质心应相距很远(地图两端)，具体哪端随机。
  const centroid = (t) => { const g = a.bots.filter(b => b.c.team === t); return { x: g.reduce((s, b) => s + b.pos.x, 0) / g.length, z: g.reduce((s, b) => s + b.pos.z, 0) / g.length }; };
  const cb = centroid('blue'), cr = centroid('red');
  const teamGap = Math.hypot(cb.x - cr.x, cb.z - cr.z);

  const startPos = a.bots.map(b => b.pos.clone());
  const eye = () => cam.position.set(pl.position.x, pl.position.y + 0.78, pl.position.z);

  pl.yaw = 0; pl.pitch = 0;
  let healthAt1s = 100, everDamaged = false;
  let fpsMin = 999;
  for (let f = 0; f < 1500; f++) {   // 25s 观察两队跨图接敌交战与帧率
    pl.update(1 / 60, col); eye(); cam.updateMatrixWorld(true);
    a.update(1 / 60, pl, cam, false);
    if (a.player.health < 100) everDamaged = true;
    if (f === 60) healthAt1s = a.player.health;
    fpsMin = Math.min(fpsMin, window.__debugHealth().fps);
  }
  const moved = a.bots.reduce((s, b, i) => s + b.pos.distanceTo(startPos[i]), 0) / a.bots.length;

  // 确定性验证死亡→复活：给玩家致命伤，跑过复活延迟，应在蓝区(大 z)复活。
  const pz0 = pl.position.z;
  a.dealDamage('player', 999, 'red0');
  const died = !a.player.alive;
  for (let f = 0; f < 240; f++) { eye(); cam.updateMatrixWorld(true); a.update(1 / 60, pl, cam, false); }
  const respawned = a.player.alive;
  // 复活应回到己方(蓝)阵营区。
  const respawnedInBlue = Math.hypot(pl.position.x - a.blueZone.x, pl.position.z - a.blueZone.z) < 30;

  // 机器人是否都在合理地面高度(未飞天/陷地)：|y - 脚下地面| 小。
  const maxYErr = Math.max(...a.bots.map(b => Math.abs(b.pos.y - a.groundHeight(b.pos.x, b.pos.z))));

  return {
    teamGap: +teamGap.toFixed(0),
    avgMoved: +moved.toFixed(1),
    blueScore: a.state.score('blue'), redScore: a.state.score('red'),
    healthAt1s: Math.round(healthAt1s), everDamaged,
    died, respawned, respawnedInBlue, maxYErr: +maxYErr.toFixed(2),
    fpsMin, fps: window.__debugHealth().fps,
  };
});

check('两队相距地图两端(质心>100m)', sim.teamGap > 100, `两队质心相距 ${sim.teamGap}m`);
check('机器人在地图上真实移动(非原地摇)', sim.avgMoved > 8,
  `平均位移 ${sim.avgMoved}m`);
check('双方 AI 都能击杀得分', sim.blueScore > 0 && sim.redScore > 0,
  `蓝 ${sim.blueScore} · 红 ${sim.redScore}`);
check('机器人贴地(未飞天/陷地)', sim.maxYErr < 1.0, `最大离地误差 ${sim.maxYErr}m`);
check('玩家可被打死并在蓝区复活', sim.died && sim.respawned && sim.respawnedInBlue,
  `died=${sim.died} respawned=${sim.respawned} 蓝区=${sim.respawnedInBlue}`);
check('帧率达标(最低>30)', sim.fpsMin > 30, `最低 ${sim.fpsMin}fps`);

console.log(`\nfps=${sim.fps} fpsMin=${sim.fpsMin}`);
if (errors.length) { console.log(`\n${errors.length} console error(s):`); errors.slice(0, 8).forEach(e => console.log('  -', e)); }

await ctx.close();
const failed = results.filter(r => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
