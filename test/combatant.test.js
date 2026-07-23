import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combatant } from '../src/game/combatant.js';

test('初始满血存活', () => {
  const c = new Combatant({ id: 'p1', team: 'blue', isBot: false });
  assert.equal(c.health, 100);
  assert.equal(c.alive, true);
  assert.equal(c.team, 'blue');
});

test('受击扣血，未死不返回 died', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  const r = c.applyDamage(30, 'e1');
  assert.equal(c.health, 70);
  assert.equal(r.died, false);
});

test('血量归零则死亡并记录击杀者', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  const r = c.applyDamage(150, 'e1');
  assert.equal(c.alive, false);
  assert.equal(c.health, 0);
  assert.equal(c.killedBy, 'e1');
  assert.equal(r.died, true);
});

test('死亡后再次受击不再触发 died', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  c.applyDamage(150, 'e1');
  const r = c.applyDamage(50, 'e2');
  assert.equal(r.died, false);
  assert.equal(c.killedBy, 'e1'); // 首个击杀者不被覆盖
});

test('复活回满血并存活', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  c.applyDamage(150, 'e1');
  c.respawn();
  assert.equal(c.health, 100);
  assert.equal(c.alive, true);
  assert.equal(c.killedBy, null);
});

test('脱战满 5 秒后开始缓慢回血', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  c.applyDamage(40, 'e1'); // 60
  c.tick(4);               // 未满 5 秒，不回
  assert.equal(c.health, 60);
  c.tick(2);               // 累计 6 秒，回血 1 秒
  assert.ok(c.health > 60 && c.health <= 100);
});

test('回血不会超过 100', () => {
  const c = new Combatant({ id: 'p1', team: 'blue' });
  c.applyDamage(5, 'e1'); // 95
  c.tick(100);
  assert.equal(c.health, 100);
});
