# 逻辑核心 Implementation Plan（子计划 1/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现团队竞技枪战的纯逻辑核心——武器伤害计算、战斗员状态、对局状态、死亡竞赛规则——完全独立于 three.js，用 node 单元测试全覆盖。

**Architecture:** 四个无渲染依赖的 ES module 放在 `src/game/`：`weapons.js`（武器配置表 + 伤害函数）、`combatant.js`（血量/受击/死亡/回血）、`gameState.js`（阵营名单 + 比分）、`deathmatch.js`（击杀记分 + 先到 50 胜 + 复活调度）。上层渲染/AI/网络都只调用这一层的接口，二期换网络权威只改调用方，不改本层。

**Tech Stack:** 原生 ES modules（`"type":"module"` 已启用），`node:test` + `node:assert/strict` 内置测试运行器（node v24），无新增依赖。

**约定：** 阵营常量 `'blue'` = 国军（KMT），`'red'` = 共军（CCP）。所有时间单位为秒。测试放在 `test/`，用 `node --test` 运行。git 提交不加 Co-Authored-By。

---

### Task 1: 武器配置表与伤害计算（weapons.js）

**Files:**
- Create: `src/game/weapons.js`
- Test: `test/weapons.test.js`

- [ ] **Step 1: Write the failing test**

`test/weapons.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/weapons.test.js`
Expected: FAIL — `Cannot find module '../src/game/weapons.js'`

- [ ] **Step 3: Write minimal implementation**

`src/game/weapons.js`:

```js
// 武器配置表。数值以对局手感为准，可独立调平衡。
// 注意：表中不含任何"定位/推荐"信息——那类倾向只存在于设计文档，游戏内绝不展示。
export const WEAPONS = {
  pistol:  { id:'pistol',  name:'手枪',   damage:34, headshotMult:1.5, fireInterval:0.28,  recoil:0.6, range:40,  falloffStart:20,  spread:0.020, magSize:12, reloadTime:1.4 },
  rifle:   { id:'rifle',   name:'步枪',   damage:26, headshotMult:1.5, fireInterval:0.12,  recoil:1.0, range:80,  falloffStart:45,  spread:0.015, magSize:30, reloadTime:2.2 },
  smg:     { id:'smg',     name:'冲锋枪', damage:18, headshotMult:1.5, fireInterval:0.075, recoil:0.9, range:35,  falloffStart:15,  spread:0.030, magSize:35, reloadTime:2.0 },
  sniper:  { id:'sniper',  name:'狙击',   damage:90, headshotMult:1.5, fireInterval:1.30,  recoil:2.5, range:200, falloffStart:200, spread:0.000, magSize:5,  reloadTime:3.0 },
  shotgun: { id:'shotgun', name:'霰弹',   damage:12, headshotMult:1.5, fireInterval:0.90,  recoil:2.2, range:18,  falloffStart:6,   spread:0.080, magSize:6,  reloadTime:2.6, pellets:8 },
};

const FLOOR_FACTOR = 0.35; // 超出有效射程后的伤害地板

// 单发命中的伤害：衰减起点内满伤，之后线性降到地板系数，超射程钳制在地板。
export function computeDamage({ weapon, distance, isHeadshot }) {
  let factor = 1;
  if (distance > weapon.falloffStart) {
    const span = Math.max(1e-6, weapon.range - weapon.falloffStart);
    const t = Math.min(1, (distance - weapon.falloffStart) / span);
    factor = 1 - (1 - FLOOR_FACTOR) * t;
  }
  const dmg = weapon.damage * factor * (isHeadshot ? weapon.headshotMult : 1);
  return dmg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/weapons.test.js`
Expected: PASS（4 项全绿）

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons.js test/weapons.test.js
git commit -m "feat(game): 武器配置表与伤害衰减计算"
```

---

### Task 2: 战斗员状态（combatant.js）

**Files:**
- Create: `src/game/combatant.js`
- Test: `test/combatant.test.js`

- [ ] **Step 1: Write the failing test**

`test/combatant.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/combatant.test.js`
Expected: FAIL — `Cannot find module '../src/game/combatant.js'`

- [ ] **Step 3: Write minimal implementation**

`src/game/combatant.js`:

```js
const MAX_HEALTH = 100;
const REGEN_DELAY = 5;    // 脱战多少秒后开始回血
const REGEN_RATE = 12;    // 每秒回血量

// 战斗员：玩家与机器人共用的纯状态。不含任何渲染/位置逻辑——
// 位置与朝向由上层(player.js / bot)持有，本类只管生死与血量。
export class Combatant {
  constructor({ id, team, isBot = false }) {
    this.id = id;
    this.team = team;         // 'blue'(国军) | 'red'(共军)
    this.isBot = isBot;
    this.health = MAX_HEALTH;
    this.alive = true;
    this.killedBy = null;
    this.timeSinceDamage = Infinity;
  }

  // 返回 { died }：本次伤害是否致死。已死亡时为无操作。
  applyDamage(amount, attackerId) {
    if (!this.alive) return { died: false };
    this.health -= amount;
    this.timeSinceDamage = 0;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.killedBy = attackerId;
      return { died: true };
    }
    return { died: false };
  }

  respawn() {
    this.health = MAX_HEALTH;
    this.alive = true;
    this.killedBy = null;
    this.timeSinceDamage = Infinity;
  }

  tick(dt) {
    if (!this.alive) return;
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage >= REGEN_DELAY && this.health < MAX_HEALTH) {
      this.health = Math.min(MAX_HEALTH, this.health + REGEN_RATE * dt);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/combatant.test.js`
Expected: PASS（7 项全绿）

- [ ] **Step 5: Commit**

```bash
git add src/game/combatant.js test/combatant.test.js
git commit -m "feat(game): 战斗员状态(血量/受击/死亡/复活/回血)"
```

---

### Task 3: 对局状态与名单（gameState.js）

**Files:**
- Create: `src/game/gameState.js`
- Test: `test/gameState.test.js`

- [ ] **Step 1: Write the failing test**

`test/gameState.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/gameState.test.js`
Expected: FAIL — `Cannot find module '../src/game/gameState.js'`

- [ ] **Step 3: Write minimal implementation**

`src/game/gameState.js`:

```js
// 对局唯一权威数据源：名单 + 比分。
// 二期联机时，这份数据的"写入权"从本地移交到网络层——上层查询接口保持不变。
export class GameState {
  constructor() {
    this.combatants = new Map();     // id -> Combatant
    this.scores = { blue: 0, red: 0 };
  }

  add(combatant) {
    this.combatants.set(combatant.id, combatant);
    return combatant;
  }

  get(id) { return this.combatants.get(id); }
  all() { return [...this.combatants.values()]; }
  byTeam(team) { return this.all().filter(c => c.team === team); }

  score(team) { return this.scores[team]; }
  addScore(team, n) { this.scores[team] += n; }

  enemyTeamOf(team) { return team === 'blue' ? 'red' : 'blue'; }
  aliveEnemiesOf(team) {
    return this.byTeam(this.enemyTeamOf(team)).filter(c => c.alive);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/gameState.test.js`
Expected: PASS（4 项全绿）

- [ ] **Step 5: Commit**

```bash
git add src/game/gameState.js test/gameState.test.js
git commit -m "feat(game): 对局状态与阵营名单/比分"
```

---

### Task 4: 死亡竞赛规则（deathmatch.js）

**Files:**
- Create: `src/game/deathmatch.js`
- Test: `test/deathmatch.test.js`

- [ ] **Step 1: Write the failing test**

`test/deathmatch.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/deathmatch.test.js`
Expected: FAIL — `Cannot find module '../src/game/deathmatch.js'`

- [ ] **Step 3: Write minimal implementation**

`src/game/deathmatch.js`:

```js
// 普通团队竞技规则。设计成可插拔 Mode——占点/攻防将是本类的同级实现，
// 共享 handleKill / update / winner 三个接口。
export class DeathmatchMode {
  constructor({ killTarget = 50, respawnDelay = 3 } = {}) {
    this.killTarget = killTarget;
    this.respawnDelay = respawnDelay;
    this._pending = [];   // { id, remaining }
  }

  // 一次击杀事件：仅当击杀者与死者异阵营才计分；随后把死者排入复活队列。
  handleKill(gs, { attackerId, victimId }) {
    const attacker = gs.get(attackerId);
    const victim = gs.get(victimId);
    if (!victim) return;
    if (attacker && attacker.team !== victim.team) {
      gs.addScore(attacker.team, 1);
    }
    this._pending.push({ id: victimId, remaining: this.respawnDelay });
  }

  // 推进复活计时；到点则复活。同时推进各战斗员自身的回血计时。
  update(gs, dt) {
    for (const c of gs.all()) c.tick(dt);
    const still = [];
    for (const p of this._pending) {
      p.remaining -= dt;
      if (p.remaining <= 0) {
        const c = gs.get(p.id);
        if (c) c.respawn();
      } else {
        still.push(p);
      }
    }
    this._pending = still;
  }

  // 返回先达目标的阵营，否则 null。
  winner(gs) {
    if (gs.score('blue') >= this.killTarget) return 'blue';
    if (gs.score('red') >= this.killTarget) return 'red';
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/deathmatch.test.js`
Expected: PASS（5 项全绿）

- [ ] **Step 5: Commit**

```bash
git add src/game/deathmatch.js test/deathmatch.test.js
git commit -m "feat(game): 死亡竞赛规则(记分/复活调度/胜负判定)"
```

---

### Task 5: 汇总测试脚本

**Files:**
- Modify: `package.json`（`scripts.test`）

- [ ] **Step 1: 改测试脚本**

把 `package.json` 中的 `"test": "node tools/walk-test.mjs"` 改为运行逻辑核心单测（walk-test 为渲染冒烟测试，移到 `test:walk`）：

```json
"test": "node --test test/",
"test:walk": "node tools/walk-test.mjs",
```

- [ ] **Step 2: 全量跑一次**

Run: `npm test`
Expected: PASS，四个测试文件共 20 项全绿。

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: npm test 运行逻辑核心单元测试"
```

---

## 交付物

完成后你将拥有一个**经完整单测、零渲染依赖**的游戏逻辑核心：武器伤害、战斗员生死、对局比分、死亡竞赛胜负与复活。子计划 2（战斗渲染）将在此之上接入 three.js、射线命中与 HUD。

## 自查记录

- **spec 覆盖**：武器 5 把差异化(§4.4)→Task1；血量/受击/死亡/回血(§4.3)→Task2；阵营/比分(§3 状态层)→Task3；8v8 先到 50 胜、固定复活、队友不计分、可插拔 Mode(§1/§4/§9)→Task4。渲染、AI、演出、流程、模型属子计划 2–5，本计划不含。
- **占位符**：无。
- **类型一致性**：`Combatant.applyDamage/respawn/tick`、`GameState.get/all/byTeam/score/addScore/aliveEnemiesOf`、`DeathmatchMode.handleKill/update/winner` 在各任务间签名一致。
