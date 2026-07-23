/**
 * 流程冒烟测试（子计划5）。
 * 验证：标题→开场演出→跳过→阵营选择→模式选择→匹配(跳过)→进入对局；
 * 所选阵营正确应用；红方阵营也能正常建立(玩家在红区、敌方为蓝队)。
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'flow-')),
  { channel: 'msedge', headless: true, viewport: { width: 900, height: 560 } },
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://127.0.0.1:5183/', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.__campus?.collider, null, { timeout: 120000 });

const results = [];
const check = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}\n        ${d}`); };
const state = () => page.evaluate(() => window.__flow.state);

// 标题 → 开场
await page.click('#title-start');
await page.waitForTimeout(300);
check('点击开始进入开场演出', (await state()) === 'intro', `state=${await state()}`);

// 跳过开场 → 阵营
await page.click('#intro-skip');
await page.waitForTimeout(200);
check('跳过后进入阵营选择', (await state()) === 'faction', `state=${await state()}`);

// 选国军(蓝) → 模式
await page.click('#screen-faction [data-team="blue"]');
await page.waitForTimeout(200);
check('选阵营后进入模式选择', (await state()) === 'mode', `state=${await state()}`);

// 选普通团队竞技 → 匹配
await page.click('#screen-mode [data-mode="tdm"]');
await page.waitForTimeout(200);
check('选模式后进入匹配', (await state()) === 'match', `state=${await state()}`);
const matchTxt = await page.textContent('#match-status');
check('匹配显示预计 20 秒', /20\s*秒/.test(matchTxt), matchTxt);

// 跳过匹配等待 → 倒计时 → 对局
await page.click('#match-skip');
await page.waitForTimeout(3600);   // 3 秒倒计时
const st = await state();
const info = await page.evaluate(() => ({
  hasArena: !!window.__arena,
  team: window.__arena?.playerTeam,
  bots: window.__arena?.bots.length,
  enemyBots: window.__arena?.bots.filter(b => b.c.team !== window.__arena.playerTeam).length,
}));
check('匹配后进入对局', st === 'playing' && info.hasArena, `state=${st} arena=${info.hasArena}`);
check('8v8：15 个 AI(7 队友+8 敌)', info.bots === 15 && info.enemyBots === 8, `bots=${info.bots} enemy=${info.enemyBots}`);
check('玩家阵营=国军(蓝)', info.team === 'blue', `team=${info.team}`);

// 红方阵营也能建立
const red = await page.evaluate(() => {
  const a = window.__buildArena('red');
  return { team: a.playerTeam, enemy: a.enemyTeam, enemyBots: a.bots.filter(b => b.c.team === 'blue').length };
});
check('红方阵营可建立(敌方为蓝队8人)', red.team === 'red' && red.enemy === 'blue' && red.enemyBots === 8,
  `team=${red.team} enemy=${red.enemy} enemyBots=${red.enemyBots}`);

if (errors.length) { console.log(`\n${errors.length} console error(s):`); errors.slice(0, 8).forEach(e => console.log('  -', e)); }
await ctx.close();
const failed = results.filter(r => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length || errors.length ? 1 : 0);
