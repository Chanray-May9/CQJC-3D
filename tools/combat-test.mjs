/**
 * 战斗冒烟测试（子计划2）。
 *
 * DOM 层：点击进入游戏、战斗 HUD 出现、无控制台报错。
 * 模拟层：把一个敌人放到相机正前方，确定性地连续开火，断言击杀链路——
 * 敌人死亡、蓝方(国军)比分增长、HUD 快照弹药下降。
 */

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'campus-combat-')),
  { channel: 'msedge', headless: true, viewport: { width: 1000, height: 620 } },
);
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null, { timeout: 120000 },
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

await page.click('#start');
await page.waitForTimeout(400);

const hudShown = await page.evaluate(
  () => document.getElementById('combat-hud')?.classList.contains('hidden') === false);
check('进入游戏后战斗 HUD 显示', hudShown, `combat-hud visible=${hudShown}`);

const sim = await page.evaluate(() => {
  const arena = window.__arena;
  const camera = window.__camera;
  const THREE = window.THREE;

  arena.deploy(new THREE.Vector3(0, 2, 0));

  // 隔离测试开火链路：把 0 号机器人放到相机正前方并冻结(不跑 AI 移动)，
  // 手动步进 arena.clock 越过射速冷却，只验证 开火→命中→击杀→记分。
  const bot = arena.bots[0];
  bot.avatar.setFootPosition(0, 0, -10);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(bot.avatar.bodyWorldCenter());
  camera.updateMatrixWorld(true);

  const scoreBefore = arena.state.score('blue');
  const ammoBefore = arena.weapon.ammo;

  let shots = 0;
  for (let i = 0; i < 30 && bot.c.alive; i++) {
    arena.clock += 0.2;                 // 手动清射速冷却，不触发 bot 移动
    const fired = arena.fire(camera);
    if (fired) shots++;
  }

  return {
    dead: !bot.c.alive,
    scoreBefore, scoreAfter: arena.state.score('blue'),
    ammoBefore, ammoAfter: arena.weapon.ammo, shots,
  };
});

check('相机前方敌人被击杀', sim.dead, `enemy.alive=${!sim.dead}, 用了 ${sim.shots} 发`);
check('蓝方(国军)比分 +1', sim.scoreAfter === sim.scoreBefore + 1,
  `${sim.scoreBefore} → ${sim.scoreAfter}`);
check('开火消耗弹药', sim.ammoAfter < sim.ammoBefore,
  `弹药 ${sim.ammoBefore} → ${sim.ammoAfter}`);

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  errors.slice(0, 8).forEach((e) => console.log('  -', e));
}

await ctx.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
