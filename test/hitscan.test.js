import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raySphere, pickTarget } from '../src/combat/hitscan.js';

const O = { x: 0, y: 0, z: 0 };
const FWD = { x: 0, y: 0, z: -1 }; // 朝 -z

test('正前方球命中，返回近似距离', () => {
  const d = raySphere(O, FWD, { x: 0, y: 0, z: -10 }, 1);
  assert.ok(d !== null);
  assert.ok(Math.abs(d - 9) < 1e-6); // 球面在 z=-9
});

test('背向的球不命中', () => {
  const d = raySphere(O, FWD, { x: 0, y: 0, z: 10 }, 1);
  assert.equal(d, null);
});

test('偏离射线的球不命中', () => {
  const d = raySphere(O, FWD, { x: 5, y: 0, z: -10 }, 1);
  assert.equal(d, null);
});

test('pickTarget 命中身体返回非爆头', () => {
  const targets = [
    { id: 'e1', body: { x: 0, y: 0, z: -10 }, bodyRadius: 0.5, head: { x: 0, y: 1.6, z: -10 }, headRadius: 0.22 },
  ];
  const hit = pickTarget(O, FWD, targets, 100);
  assert.equal(hit.id, 'e1');
  assert.equal(hit.isHeadshot, false);
});

test('pickTarget 命中头部判爆头', () => {
  // 从头部高度平射：射线错过较低的身球，只命中头球
  const eye = { x: 0, y: 1.6, z: 0 };
  const targets = [
    { id: 'e1', body: { x: 0, y: 0, z: -10 }, bodyRadius: 0.5, head: { x: 0, y: 1.6, z: -10 }, headRadius: 0.25 },
  ];
  const hit = pickTarget(eye, FWD, targets, 100);
  assert.equal(hit.id, 'e1');
  assert.equal(hit.isHeadshot, true);
});

test('pickTarget 取最近目标', () => {
  const targets = [
    { id: 'far', body: { x: 0, y: 0, z: -30 }, bodyRadius: 0.5, head: { x: 0, y: 1.6, z: -30 }, headRadius: 0.22 },
    { id: 'near', body: { x: 0, y: 0, z: -10 }, bodyRadius: 0.5, head: { x: 0, y: 1.6, z: -10 }, headRadius: 0.22 },
  ];
  const hit = pickTarget(O, FWD, targets, 100);
  assert.equal(hit.id, 'near');
});

test('超出射程不命中', () => {
  const targets = [
    { id: 'e1', body: { x: 0, y: 0, z: -50 }, bodyRadius: 0.5, head: { x: 0, y: 1.6, z: -50 }, headRadius: 0.22 },
  ];
  assert.equal(pickTarget(O, FWD, targets, 20), null);
});
