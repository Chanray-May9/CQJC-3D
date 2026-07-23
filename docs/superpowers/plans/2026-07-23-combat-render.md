# 战斗渲染 & 手感 Implementation Plan（子计划 2/5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 把逻辑核心接上 three.js，实现"第一次能玩"：拿枪、开火射线命中占位敌人、扣血击杀加分、自己会死并复活、战斗 HUD（准星/血量/弹药/比分）。

**Architecture:** 新增纯逻辑单元 `weaponRuntime.js`（弹药/射速/换弹，TDD 单测）与 `hitscan.js`（射线-球体相交，纯数学，TDD 单测）；渲染层 `avatars.js`（占位小人=胶囊身+球头，红蓝）、`arena.js`（本地死亡竞赛：建 GameState+玩家+占位敌人，串开火→命中→伤害→死亡→复活）。改 `main.js`/`hud.js`/`touch.js`/`index.html` 接入。真人机 AI 在子计划 3，敌人本期为静止/微动占位靶。

**Tech Stack:** three.js 0.185（已装）、node:test 单测、playwright 冒烟。提交不加 Claude 署名。

**约定：** 敌人占位靶按玩家落地后的 `position.y` 放置，避免依赖未知地面高度。

---

### Task 1: 武器运行时（weaponRuntime.js，TDD）
弹匣、射速间隔门控、换弹计时。

**Files:** Create `src/game/weaponRuntime.js`, Test `test/weaponRuntime.test.js`

- [ ] 写失败测试 → 跑失败 → 实现 → 跑绿 → 提交。测试覆盖：满弹初始化；`tryFire(now)` 在冷却内返回 false 不耗弹；冷却后返回 true 且弹药 -1；空仓 tryFire 返回 false；`reload(now)`/`update(now)` 到点回满且换弹中不能开火。

### Task 2: 射线命中（hitscan.js，TDD）
纯数学：射线 vs 目标球（身/头两球）。

**Files:** Create `src/combat/hitscan.js`, Test `test/hitscan.test.js`

- [ ] TDD。`raySphere(origin,dir,center,radius)` 返回命中距离或 null；`pickTarget(origin,dir,targets,maxRange)` 返回最近 `{id,isHeadshot,distance}`（头球命中判 headshot），无命中返回 null；背向不命中；超程不命中。

### Task 3: 占位小人（avatars.js，渲染）
胶囊身 + 球头，红蓝材质，位置/生死显隐。

**Files:** Create `src/combat/avatars.js`

- [ ] `Avatar(team)` 建 group（body capsule + head sphere），红=#c0392b 蓝=#2f6fb0；`setPosition(v)`、`setDead(bool)`（死亡半透明下沉）、`headWorldCenter()/bodyWorldCenter()` 供 hitscan。冒烟验证：build 通过。

### Task 4: 竞技场（arena.js，集成）
本地死亡竞赛的胶水层。

**Files:** Create `src/combat/arena.js`

- [ ] 构造：建 `GameState` + `DeathmatchMode(killTarget:50)`，玩家 Combatant(蓝)，若干红队占位敌人（Avatar+Combatant），出生点相对玩家落点。`fire(camera)`：从相机发射线→`pickTarget`→`computeDamage`→`applyDamage`→死则 `handleKill`。`update(dt,player)`：推进 mode（复活）、同步 avatar 位置/生死、玩家死亡则计时复活到出生点。暴露 `__arena` 调试钩子。

### Task 5: 战斗 HUD + 输入接入
**Files:** Modify `index.html`, `src/hud.js`, `src/main.js`, `src/touch.js`

- [ ] index.html 加血条/弹药/比分/击杀提示 DOM；hud.js 加 `setCombat({health,ammo,mag,score})`、`killFeed(text)`、`hitMarker()`；main.js 实例化 arena、鼠标左键/触屏开火按钮触发 `arena.fire`、循环里 `arena.update`；touch.js 加"开火"按钮。

### Task 6: 冒烟验证 + 合并
- [ ] `npm test` 全绿；`npm run build` 通过；playwright 脚本载入页面、调 `__arena` 开火钩子、断言击杀数增长。通过后 finishing-a-development-branch 合并 main。

## 自查
- spec 覆盖：第一人称持枪/射线命中/爆头(§4.3)→T2,T4；血量弹药比分HUD→T5；死亡固定点复活→T4；占位敌人为本期临时(真AI子计划3)。
- 占位符：无实体占位，均在实现时补全代码。
