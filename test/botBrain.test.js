import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotBrain, hitChance } from '../src/game/botBrain.js';

function brain(cfg) { return new BotBrain(cfg); }
const base = { dt: 0.1, now: 0, distance: 20, hasLOS: true, playerAlive: true, health: 100 };

test('无视线时巡逻且不开火', () => {
  const b = brain();
  const out = b.think({ ...base, hasLOS: false });
  assert.equal(out.state, 'patrol');
  assert.equal(out.wantShoot, false);
});

test('刚发现玩家：反应延迟内不开火', () => {
  const b = brain({ reaction: 0.4 });
  const out = b.think({ ...base, now: 0 });      // 首次看到
  assert.equal(out.state, 'engage');
  assert.equal(out.wantShoot, false);            // 还没过反应时间
});

test('过了反应延迟后开火', () => {
  const b = brain({ reaction: 0.4 });
  b.think({ ...base, now: 0 });
  const out = b.think({ ...base, now: 0.5 });     // 已过 0.4s
  assert.equal(out.wantShoot, true);
});

test('丢失视线后重新发现需重新等待反应延迟', () => {
  const b = brain({ reaction: 0.4 });
  b.think({ ...base, now: 0 });
  b.think({ ...base, now: 0.5 });                 // 可开火
  b.think({ ...base, now: 0.6, hasLOS: false });  // 丢失
  const out = b.think({ ...base, now: 0.7 });     // 重新发现，刚过 0.1s
  assert.equal(out.wantShoot, false);
});

test('血量过低进入撤退', () => {
  const b = brain({ retreatHealth: 30 });
  const out = b.think({ ...base, now: 1, health: 20 });
  assert.equal(out.state, 'retreat');
});

test('玩家死亡则回到巡逻不开火', () => {
  const b = brain();
  b.think({ ...base, now: 0 });
  const out = b.think({ ...base, now: 1, playerAlive: false });
  assert.equal(out.state, 'patrol');
  assert.equal(out.wantShoot, false);
});

test('超出交战射程不开火', () => {
  const b = brain({ engageRange: 60, reaction: 0 });
  const out = b.think({ ...base, now: 1, distance: 100 });
  assert.equal(out.wantShoot, false);
});

// --- 命中概率 ---
test('命中概率随距离单调下降', () => {
  const near = hitChance({ distance: 5, playerMoving: false, difficulty: 1 });
  const far = hitChance({ distance: 60, playerMoving: false, difficulty: 1 });
  assert.ok(near > far);
});

test('玩家移动降低命中', () => {
  const still = hitChance({ distance: 20, playerMoving: false, difficulty: 1 });
  const moving = hitChance({ distance: 20, playerMoving: true, difficulty: 1 });
  assert.ok(moving < still);
});

test('命中概率永不为 1（不必中/不秒杀），也不低于地板', () => {
  const veryClose = hitChance({ distance: 0.5, playerMoving: false, difficulty: 3 });
  const veryFar = hitChance({ distance: 500, playerMoving: true, difficulty: 0.1 });
  assert.ok(veryClose <= 0.95, `close=${veryClose}`);
  assert.ok(veryFar >= 0.05, `far=${veryFar}`);
});
