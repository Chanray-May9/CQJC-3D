import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeathmatchMode } from '../src/game/deathmatch.js';
import { GameState } from '../src/game/gameState.js';
import { Combatant } from '../src/game/combatant.js';

function setup() {
  const gs = new GameState();
  gs.add(new Combatant({ id: 'b1', team: 'blue' }));
  gs.add(new Combatant({ id: 'r1', team: 'red' }));
  const mode = new DeathmatchMode({ killTarget: 3, respawnDelay: 3 });
  return { gs, mode };
}

test('击杀敌人给击杀者阵营 +1', () => {
  const { gs, mode } = setup();
  gs.get('r1').applyDamage(999, 'b1');
  mode.handleKill(gs, { attackerId: 'b1', victimId: 'r1' });
  assert.equal(gs.score('blue'), 1);
  assert.equal(gs.score('red'), 0);
});

test('误伤队友不计分', () => {
  const { gs, mode } = setup();
  gs.add(new Combatant({ id: 'b2', team: 'blue' }));
  gs.get('b2').applyDamage(999, 'b1');
  mode.handleKill(gs, { attackerId: 'b1', victimId: 'b2' });
  assert.equal(gs.score('blue'), 0);
});

test('比分先到目标即判该阵营胜', () => {
  const { gs, mode } = setup();
  gs.addScore('red', 3);
  assert.equal(mode.winner(gs), 'red');
});

test('未达目标无胜者', () => {
  const { gs, mode } = setup();
  gs.addScore('red', 2);
  assert.equal(mode.winner(gs), null);
});

test('死者经过 respawnDelay 后被复活', () => {
  const { gs, mode } = setup();
  gs.get('r1').applyDamage(999, 'b1');
  mode.handleKill(gs, { attackerId: 'b1', victimId: 'r1' });
  assert.equal(gs.get('r1').alive, false);
  mode.update(gs, 2);   // 未到 3 秒
  assert.equal(gs.get('r1').alive, false);
  mode.update(gs, 1.5); // 累计 3.5 秒
  assert.equal(gs.get('r1').alive, true);
  assert.equal(gs.get('r1').health, 100);
});
