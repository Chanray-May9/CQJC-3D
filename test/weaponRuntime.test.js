import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeaponRuntime } from '../src/game/weaponRuntime.js';
import { WEAPONS } from '../src/game/weapons.js';

test('初始化为满弹', () => {
  const w = new WeaponRuntime(WEAPONS.rifle);
  assert.equal(w.ammo, WEAPONS.rifle.magSize);
  assert.equal(w.reloading, false);
});

test('射速冷却内不能连发，且不耗弹', () => {
  const w = new WeaponRuntime(WEAPONS.rifle);
  assert.equal(w.tryFire(0), true);
  assert.equal(w.ammo, WEAPONS.rifle.magSize - 1);
  assert.equal(w.tryFire(0.01), false);           // 仍在冷却
  assert.equal(w.ammo, WEAPONS.rifle.magSize - 1); // 未耗弹
});

test('冷却结束后可再次开火', () => {
  const w = new WeaponRuntime(WEAPONS.rifle);
  w.tryFire(0);
  const ok = w.tryFire(WEAPONS.rifle.fireInterval + 0.001);
  assert.equal(ok, true);
  assert.equal(w.ammo, WEAPONS.rifle.magSize - 2);
});

test('空仓无法开火', () => {
  const w = new WeaponRuntime(WEAPONS.pistol);
  let t = 0;
  for (let i = 0; i < WEAPONS.pistol.magSize; i++) {
    assert.equal(w.tryFire(t), true);
    t += WEAPONS.pistol.fireInterval + 0.001;
  }
  assert.equal(w.ammo, 0);
  assert.equal(w.tryFire(t), false);
});

test('换弹中不能开火，到点回满', () => {
  const w = new WeaponRuntime(WEAPONS.pistol);
  w.tryFire(0);
  w.reload(1);
  assert.equal(w.reloading, true);
  assert.equal(w.tryFire(1.1), false);                 // 换弹中
  w.update(1 + WEAPONS.pistol.reloadTime + 0.001);     // 换弹完成
  assert.equal(w.reloading, false);
  assert.equal(w.ammo, WEAPONS.pistol.magSize);
});

test('满弹时换弹为无操作', () => {
  const w = new WeaponRuntime(WEAPONS.rifle);
  w.reload(0);
  assert.equal(w.reloading, false);
});
