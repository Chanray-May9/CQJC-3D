import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, computeDamage } from '../src/game/weapons.js';

test('五把枪都存在且字段完整', () => {
  for (const id of ['pistol', 'rifle', 'smg', 'sniper', 'shotgun']) {
    const w = WEAPONS[id];
    assert.ok(w, `缺少武器 ${id}`);
    assert.equal(w.id, id);
    for (const f of ['name','damage','headshotMult','fireInterval','recoil','range','falloffStart','spread','magSize','reloadTime']) {
      assert.equal(typeof w[f === 'name' ? 'name' : f], f === 'name' ? 'string' : 'number', `${id}.${f} 类型错`);
    }
  }
});

test('近距离(未超衰减起点)造成满伤', () => {
  const d = computeDamage({ weapon: WEAPONS.rifle, distance: 5, isHeadshot: false });
  assert.equal(d, WEAPONS.rifle.damage);
});

test('爆头 1.5 倍', () => {
  const body = computeDamage({ weapon: WEAPONS.rifle, distance: 5, isHeadshot: false });
  const head = computeDamage({ weapon: WEAPONS.rifle, distance: 5, isHeadshot: true });
  assert.equal(head, body * 1.5);
});

test('超过衰减起点后伤害线性下降，且不低于地板系数', () => {
  const w = WEAPONS.rifle;
  const near = computeDamage({ weapon: w, distance: w.falloffStart, isHeadshot: false });
  const far  = computeDamage({ weapon: w, distance: w.range, isHeadshot: false });
  const beyond = computeDamage({ weapon: w, distance: w.range * 3, isHeadshot: false });
  assert.equal(near, w.damage);
  assert.ok(far < near, '有效射程处应已衰减');
  assert.equal(beyond, far, '超出射程后钳制在地板伤害');
  assert.ok(far >= w.damage * 0.34, '不应低于 35% 地板');
});
