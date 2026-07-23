import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/game/gameState.js';
import { Combatant } from '../src/game/combatant.js';

function seed() {
  const gs = new GameState();
  gs.add(new Combatant({ id: 'b1', team: 'blue', isBot: false }));
  gs.add(new Combatant({ id: 'r1', team: 'red', isBot: true }));
  return gs;
}

test('加入后可按 id 与阵营查询', () => {
  const gs = seed();
  assert.equal(gs.get('b1').team, 'blue');
  assert.equal(gs.byTeam('red').length, 1);
  assert.equal(gs.all().length, 2);
});

test('初始比分为 0', () => {
  const gs = seed();
  assert.equal(gs.score('blue'), 0);
  assert.equal(gs.score('red'), 0);
});

test('addScore 累加对应阵营比分', () => {
  const gs = seed();
  gs.addScore('blue', 1);
  gs.addScore('blue', 1);
  assert.equal(gs.score('blue'), 2);
  assert.equal(gs.score('red'), 0);
});

test('存活敌方战斗员枚举正确', () => {
  const gs = seed();
  gs.get('r1').applyDamage(999, 'b1'); // r1 阵亡
  assert.equal(gs.aliveEnemiesOf('blue').length, 0);
  assert.equal(gs.aliveEnemiesOf('red').length, 1); // b1 仍存活
});
