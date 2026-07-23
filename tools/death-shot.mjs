// 截图查看敌人倒地效果。
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'death-')),
  { channel: 'msedge', headless: true, viewport: { width: 900, height: 560 } },
);
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => document.getElementById('start')?.classList.contains('hidden') === false,
  null, { timeout: 120000 });
await page.click('#start');
await page.waitForTimeout(600);

await page.evaluate(() => {
  const a = window.__arena, cam = window.__camera, THREE = window.THREE;
  a.deploy(new THREE.Vector3(0, 2, 0));
  const e = a.enemies[0];
  e.avatar.setFootPosition(-2.5, 0, -6);      // 正前方 6m，脚在地面
  cam.position.set(0, 1.6, 0);
  cam.lookAt(new THREE.Vector3(-2.5, 0.6, -6));
  cam.updateMatrixWorld(true);
  // 打死它（保持在 3s 复活线内，避免尸体又复活）
  for (let i = 0; i < 8 && e.combatant.alive; i++) { a.update(0.15); a.fire(cam); }
});
// 让倒地动画播完（约 0.5s）
for (let i = 0; i < 18; i++) { await page.evaluate(() => window.__arena.update(1 / 60)); await page.waitForTimeout(12); }
await page.evaluate(() => { const c = window.__camera; c.position.set(0, 1.6, 0); c.lookAt(new window.THREE.Vector3(-2.5, 0.2, -6)); c.updateMatrixWorld(true); });
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/death.png' });
await ctx.close();
console.log('shots/death.png');
