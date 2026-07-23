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

  // 手动部署：以原点为中心铺敌人。
  arena.deploy(new THREE.Vector3(0, 2, 0));

  // 把 0 号敌人放到相机正前方 10m 的地面。
  const enemy = arena.enemies[0];
  enemy.avatar.setFootPosition(0, 0, -10);

  // 相机站在原点、眼高 1.6，直视敌人躯干。
  camera.position.set(0, 1.6, 0);
  camera.lookAt(enemy.avatar.bodyWorldCenter());
  camera.updateMatrixWorld(true);

  const scoreBefore = arena.state.score('blue');
  const ammoBefore = arena.weapon.ammo;

  // 连续开火直到该敌人死亡（步枪 26 伤、100 血 → 约 4 发）。每发间推进时钟越过射速冷却。
  let shots = 0, hits = 0;
  for (let i = 0; i < 30 && enemy.combatant.alive; i++) {
    arena.update(0.2);                 // 推进游戏时钟，清射速冷却
    camera.updateMatrixWorld(true);
    const fired = arena.fire(camera);
    if (fired) shots++;
    if (arena.weapon.ammo < ammoBefore - shots + 1) { /* noop */ }
    hits = i;
  }

  return {
    dead: !enemy.combatant.alive,
    scoreBefore,
    scoreAfter: arena.state.score('blue'),
    ammoBefore,
    ammoAfter: arena.weapon.ammo,
    shots,
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
