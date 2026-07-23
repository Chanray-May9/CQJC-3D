import * as THREE from 'three';
import { BotBrain, hitChance } from '../game/botBrain.js';
import { WeaponRuntime } from '../game/weaponRuntime.js';
import { WEAPONS, computeDamage } from '../game/weapons.js';

/**
 * 机器人集成层：用 BotBrain 的决策驱动一个 Avatar 在场景里移动、朝向、对玩家射击。
 *
 * 借鉴网页 FPS 常用做法：
 *  - 视线(LOS)用一条 BVH 射线判断是否被墙挡；为省性能每 ~0.12s 才重算一次(分帧)。
 *  - 移动在 XZ 平面按固定地面高度进行(广场大致平坦)，避开墙体、与队友分离，
 *    不做逐帧胶囊物理——16 人手机也扛得住。
 *  - 开火按命中概率掷骰，命中才结算武器伤害；配合反应延迟，做到"比真人稍强但不秒杀"。
 */

const SPEED = { patrol: 2.4, engage: 3.2, retreat: 3.6 };
const PREFERRED = 16;       // 交战偏好距离(米)
const SEPARATION = 1.5;     // 队友最小间距
const LOS_INTERVAL = 0.12;  // 视线重算间隔(秒)
const EYE = 1.5;
// 机器人开火节奏：不按武器最高射速狂扫，而是有瞄准间隔——避免秒杀玩家。
const BOT_SHOT_INTERVAL = 0.55;

export class BotController {
  constructor(combatant, avatar, { weaponId = 'rifle', difficulty = 1 } = {}) {
    this.c = combatant;
    this.avatar = avatar;
    this.brain = new BotBrain();
    this.weapon = new WeaponRuntime(WEAPONS[weaponId]);
    this.difficulty = difficulty;

    this.pos = new THREE.Vector3();
    this.spawn = new THREE.Vector3();
    this.waypoint = new THREE.Vector3();
    this.groundY = 0;

    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._strafeT = 1 + Math.random() * 1.5;
    this._losTimer = Math.random() * LOS_INTERVAL;
    this._hasLOS = false;
    this._dist = 999;
    this._mayShoot = true;      // 由 arena 的 aggro 上限每帧设定
    this._lastShotAt = -99;

    this._eye = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this._dir = new THREE.Vector3();
    this._sep = new THREE.Vector3();
  }

  place(x, y, z) {
    this.pos.set(x, y, z);
    this.spawn.set(x, y, z);
    this.groundY = y;
    this.avatar.setFootPosition(x, y, z);
    this.#newWaypoint();
  }

  respawn() {
    this.c.respawn();
    this.avatar.setDead(false);
    this.place(this.spawn.x, this.spawn.y, this.spawn.z);
  }

  #newWaypoint() {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 12;
    this.waypoint.set(this.spawn.x + Math.cos(a) * r, this.groundY, this.spawn.z + Math.sin(a) * r);
  }

  // ctx: { clock, dt, playerPos, playerCombatant, playerMoving, collider, bots, onPlayerHit }
  update(dt, ctx) {
    this.weapon.update(ctx.clock);
    if (!this.c.alive) { this.avatar.update(dt); return; }

    this._eye.set(this.pos.x, this.groundY + EYE, this.pos.z);
    this._to.subVectors(ctx.playerPos, this._eye);
    this._dist = this._to.length();

    // 分帧重算视线
    this._losTimer -= dt;
    if (this._losTimer <= 0) {
      this._losTimer = LOS_INTERVAL;
      this._hasLOS = ctx.playerCombatant.alive && this.#lineOfSight(ctx.collider);
    }

    const out = this.brain.think({
      dt, now: ctx.clock, distance: this._dist,
      hasLOS: this._hasLOS, playerAlive: ctx.playerCombatant.alive, health: this.c.health,
    });

    this.#move(dt, out.moveMode, ctx);

    const face = (out.state === 'engage' || out.state === 'retreat') ? ctx.playerPos : this.waypoint;
    this.avatar.faceYaw(Math.atan2(face.x - this.pos.x, face.z - this.pos.z));
    this.avatar.setFootPosition(this.pos.x, this.groundY, this.pos.z);

    const cadenceOk = (ctx.clock - this._lastShotAt) >= BOT_SHOT_INTERVAL;
    if (out.wantShoot && this._mayShoot && cadenceOk && this.weapon.tryFire(ctx.clock)) {
      this._lastShotAt = ctx.clock;
      const p = hitChance({ distance: this._dist, playerMoving: ctx.playerMoving, difficulty: this.difficulty });
      if (Math.random() < p) {
        const isHead = Math.random() < 0.1;
        const dmg = computeDamage({ weapon: this.weapon.weapon, distance: this._dist, isHeadshot: isHead });
        const res = ctx.playerCombatant.applyDamage(dmg, this.c.id);
        ctx.onPlayerHit?.({ dmg, attackerId: this.c.id, attackerTeam: this.c.team, died: res.died });
      }
    }
    if (this.weapon.ammo === 0 && !this.weapon.reloading) this.weapon.reload(ctx.clock);

    this.avatar.update(dt);
  }

  #lineOfSight(collider) {
    if (this._dist > this.brain.cfg.engageRange + 5) return false;
    this._ray.origin.copy(this._eye);
    this._ray.direction.copy(this._to).normalize();
    const hit = collider.geometry.boundsTree.raycastFirst(this._ray, THREE.DoubleSide);
    return !hit || hit.distance >= this._dist - 0.8;   // 墙比玩家近才算被挡
  }

  #move(dt, mode, ctx) {
    const dir = this._dir.set(0, 0, 0);
    const speed = SPEED[mode] ?? SPEED.patrol;

    if (mode === 'patrol') {
      dir.set(this.waypoint.x - this.pos.x, 0, this.waypoint.z - this.pos.z);
      if (dir.length() < 1.2) this.#newWaypoint();
    } else if (mode === 'engage') {
      this._to.set(ctx.playerPos.x - this.pos.x, 0, ctx.playerPos.z - this.pos.z);
      const dn = this._to.length() || 1;
      this._to.divideScalar(dn);
      const radial = dn > PREFERRED + 2 ? 1 : (dn < PREFERRED - 2 ? -1 : 0);
      const side = new THREE.Vector3(-this._to.z, 0, this._to.x).multiplyScalar(this._strafeDir);
      dir.addScaledVector(this._to, radial).addScaledVector(side, 0.7);
      this._strafeT -= dt;
      if (this._strafeT <= 0) { this._strafeDir *= -1; this._strafeT = 1 + Math.random() * 1.5; }
    } else { // retreat
      dir.set(this.pos.x - ctx.playerPos.x, 0, this.pos.z - ctx.playerPos.z);
    }

    if (dir.lengthSq() === 0) { this.pos.y = this.groundY; return; }
    dir.normalize();

    // 队友分离
    this._sep.set(0, 0, 0);
    for (const b of ctx.bots) {
      if (b === this || !b.c.alive) continue;
      const dx = this.pos.x - b.pos.x, dz = this.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < SEPARATION) { this._sep.x += dx / d * (SEPARATION - d); this._sep.z += dz / d * (SEPARATION - d); }
    }
    dir.add(this._sep);
    if (dir.lengthSq() > 0) dir.normalize();

    const nx = this.pos.x + dir.x * speed * dt;
    const nz = this.pos.z + dir.z * speed * dt;
    if (!this.#wallAhead(ctx.collider, nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (mode === 'patrol') this.#newWaypoint();
    this.pos.y = this.groundY;
  }

  #wallAhead(collider, nx, nz) {
    this._ray.origin.set(this.pos.x, this.groundY + 1.0, this.pos.z);
    const dx = nx - this.pos.x, dz = nz - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return false;
    this._ray.direction.set(dx / len, 0, dz / len);
    const hit = collider.geometry.boundsTree.raycastFirst(this._ray, THREE.DoubleSide);
    return !!hit && hit.distance < len + 0.5;
  }
}
