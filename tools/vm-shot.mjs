// 截图查看第一人称枪模朝向。用法: node tools/vm-shot.mjs <weaponId>
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const weapon = process.argv[2] || 'rifle';
const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'vm-')),
  { channel: 'msedge', headless: true, viewport: { width: 900, height: 560 } },
);
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.__campus?.collider, null, { timeout: 120000 });
await page.waitForTimeout(600);
// 切到指定枪并等待 GLB 加载
await page.evaluate((w) => window.__vm?.setWeapon(w), weapon);
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/vm-${weapon}.png` });
await ctx.close();
console.log(`shots/vm-${weapon}.png`);
