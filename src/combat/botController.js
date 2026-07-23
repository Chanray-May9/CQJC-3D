import * as THREE from 'three';
import { Vehicle, ArriveBehavior, WanderBehavior, SeparationBehavior } from 'yuka';
import { BotBrain, hitChance } from '../game/botBrain.js';
import { WeaponRuntime } from '../game/weaponRuntime.js';
import { WEAPONS } from '../game/weapons.js';

/**
 * 机器人集成层。移动用 Yuka(three.js 专用 Game AI 库)的转向行为驱动，让机器人在
 * 地图上真实机动，不再原地摇摆：
 *   - 无敌人   → WanderBehavior 漫游
 *   - 有敌无视线 → ArriveBehavior 直插敌人(跨地图接敌)
 *   - 有视线交战 → ArriveBehavior 环绕走位(保持偏好距离 + 侧向 strafe)
 *   - 血少撤退  → ArriveBehavior 逃离
 *   - 始终叠加 SeparationBehavior 队友分离
 * 开火/撤退决策仍用已测试的 BotBrain + 命中概率模型。
 */

const MAX_SPEED = 5.2;
const PREFERRED = 16;
const LOS_INTERVAL = 0.12;
const BOT_SHOT_INTERVAL = 0.55;
const EYE = 1.5;

export class BotController {
  constructor(combatant, avatar, { weaponId = 'rifle', difficulty = 0.7, entityManager }) {
    this.c = combatant;
    this.avatar = avatar;
    this.brain = new BotBrain();
    this.weapon = new WeaponRuntime(WEAPONS[weaponId]);
    this.difficulty = difficulty;

    this.pos = new THREE.Vector3();
    this.spawn = new THREE.Vector3();
    this.groundY = 0;

    // Yuka 载具 + 转向行为
    this.vehicle = new Vehicle();
    this.vehicle.maxSpeed = MAX_SPEED;
    this.vehicle.updateNeighborhood = true;
    this.vehicle.neighborhoodRadius = 4;
    this.vehicle.smoothingActive = true;
    this.arrive = new ArriveBehavior(this.vehicle.position.clone(), 3, 1.5);
    this.wander = new WanderBehavior();
    this.wander.radius = 3; this.wander.distance = 8; this.wander.jitter = 12;
    this.separation = new SeparationBehavior();
    this.vehicle.steering.add(this.arrive);
    this.vehicle.steering.add(this.wander);
    this.vehicle.steering.add(this.separation);
    entityManager.add(this.vehicle);

    this._strafePhase = Math.random() * Math.PI * 2;
    this._losTimer = Math.random() * LOS_INTERVAL;
    this._groundTimer = Math.random() * 0.15;
    this._hasLOS = false;
    this._mayShoot = true;
    this._lastShotAt = -99;

    this._enemyPos = new THREE.Vector3();
    this._enemyDist = 999;
    this._enemyAlive = false;
    this._enemyId = null;
    this._prev = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this._tmp = new THREE.Vector3();
    this._perp = new THREE.Vector3();
    this._out = { state: 'patrol', wantShoot: false };
  }

  place(x, y, z) {
    this.pos.set(x, y, z);
    this.spawn.set(x, y, z);
    this.groundY = y;
    this.vehicle.position.set(x, y, z);
    this.vehicle.velocity.set(0, 0, 0);
    this.avatar.setFootPosition(x, y, z);
  }

  setEnemy(pos, dist, alive, id) {
    if (pos) this._enemyPos.copy(pos);
    this._enemyDist = dist; this._enemyAlive = alive; this._enemyId = id;
  }

  // 阶段一：决策 + 设定转向目标（在 entityManager.update 之前）。
  steer(dt, ctx) {
    this._prev.copy(this.vehicle.position);
    const dead = !this.c.alive;
    this.arrive.active = false; this.wander.active = false; this.separation.active = !dead;
    if (dead) { this.vehicle.velocity.set(0, 0, 0); return; }

    this._eye.set(this.pos.x, this.groundY + EYE, this.pos.z);
    this._losTimer -= dt;
    if (this._losTimer <= 0) {
      this._losTimer = LOS_INTERVAL;
      this._hasLOS = this._enemyAlive && this.#lineOfSight(ctx.collider);
    }

    const out = this.brain.think({
      dt, now: ctx.clock, distance: this._enemyDist,
      hasLOS: this._hasLOS, playerAlive: this._enemyAlive, health: this.c.health,
    });
    this._out = out;

    const t = this._tmp;
    if (!this._enemyAlive) {
      this.wander.active = true;                       // 无敌人：漫游
    } else if (out.state === 'retreat') {
      t.subVectors(this.pos, this._enemyPos).setY(0).normalize().multiplyScalar(24).add(this.pos);
      this.arrive.active = true; this.#setTarget(t);
    } else if (this._hasLOS) {
      // 环绕走位：保持偏好距离 + 侧向 strafe
      t.subVectors(this.pos, this._enemyPos).setY(0);
      const dn = t.length() || 1; t.divideScalar(dn);
      const perp = this._perp.set(-t.z, 0, t.x);
      const strafe = Math.sin(ctx.clock * 1.1 + this._strafePhase) * 7;
      t.multiplyScalar(PREFERRED).add(this._enemyPos).addScaledVector(perp, strafe);
      this.arrive.active = true; this.#setTarget(t);
    } else {
      this.arrive.active = true; this.#setTarget(this._enemyPos);   // 有敌无视线：直插接敌
    }
  }

  #setTarget(v) { this.arrive.target.set(v.x, this.groundY, v.z); }

  // 阶段二：落地约束 + 同步 + 开火（在 entityManager.update 之后）。
  postStep(dt, ctx) {
    if (!this.c.alive) { this.avatar.update(dt); return; }

    // 墙体阻挡：若这步穿墙则退回上一位置。
    if (this.#blocked(ctx.collider)) {
      this.vehicle.position.copy(this._prev);
      this.vehicle.velocity.multiplyScalar(0.2);
    }
    // 贴地：每 ~0.15s 用下射线取脚下地面高度，跟随地形起伏(否则跑到高低处会飘/陷)。
    this._groundTimer -= dt;
    if (this._groundTimer <= 0) {
      this._groundTimer = 0.15;
      this.groundY = this.#groundAt(ctx.collider, this.vehicle.position.x, this.vehicle.position.z);
    }
    this.vehicle.position.y = this.groundY;
    this.vehicle.velocity.y = 0;
    this.pos.set(this.vehicle.position.x, this.groundY, this.vehicle.position.z);

    // 朝向：交战面向敌人，否则面向移动方向。
    let yaw;
    if (this._enemyAlive && (this._out.state === 'engage' || this._out.state === 'retreat')) {
      yaw = Math.atan2(this._enemyPos.x - this.pos.x, this._enemyPos.z - this.pos.z);
    } else {
      const v = this.vehicle.velocity;
      yaw = (v.x * v.x + v.z * v.z > 0.01) ? Math.atan2(v.x, v.z) : this.avatar.yaw;
    }
    this.avatar.faceYaw(yaw);
    this.avatar.setFootPosition(this.pos.x, this.groundY, this.pos.z);

    // 开火
    this.weapon.update(ctx.clock);
    const cadenceOk = (ctx.clock - this._lastShotAt) >= BOT_SHOT_INTERVAL;
    const aggroOk = this._enemyId === 'player' ? this._mayShoot : true;  // 上限只约束打玩家
    if (this._out.wantShoot && aggroOk && cadenceOk && this.weapon.tryFire(ctx.clock)) {
      this._lastShotAt = ctx.clock;
      const p = hitChance({ distance: this._enemyDist, playerMoving: ctx.isMoving(this._enemyId), difficulty: this.difficulty });
      if (Math.random() < p) {
        const isHead = Math.random() < 0.1;
        const dmg = this.weapon.weapon.damage * (isHead ? this.weapon.weapon.headshotMult : 1);
        ctx.dealDamage(this._enemyId, dmg, this.c.id);
      }
    }
    if (this.weapon.ammo === 0 && !this.weapon.reloading) this.weapon.reload(ctx.clock);

    const v = this.vehicle.velocity;
    this.avatar.update(dt, Math.hypot(v.x, v.z));
  }

  #lineOfSight(collider) {
    if (this._enemyDist > this.brain.cfg.engageRange + 5) return false;
    this._ray.origin.set(this.pos.x, this.groundY + EYE, this.pos.z);
    this._tmp.set(this._enemyPos.x - this._ray.origin.x, (this._enemyPos.y + 1) - this._ray.origin.y, this._enemyPos.z - this._ray.origin.z);
    const d = this._tmp.length();
    this._ray.direction.copy(this._tmp).normalize();
    const hit = collider.geometry.boundsTree.raycastFirst(this._ray, THREE.DoubleSide);
    return !hit || hit.distance >= d - 0.8;
  }

  #groundAt(collider, x, z) {
    this._ray.origin.set(x, this.groundY + 60, z);
    this._ray.direction.set(0, -1, 0);
    const hit = collider.geometry.boundsTree.raycastFirst(this._ray, THREE.DoubleSide);
    return hit ? hit.point.y : this.groundY;
  }

  #blocked(collider) {
    const dx = this.vehicle.position.x - this._prev.x;
    const dz = this.vehicle.position.z - this._prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return false;
    this._ray.origin.set(this._prev.x, this.groundY + 1.0, this._prev.z);
    this._ray.direction.set(dx / len, 0, dz / len);
    const hit = collider.geometry.boundsTree.raycastFirst(this._ray, THREE.DoubleSide);
    return !!hit && hit.distance < len + 0.5;
  }
}
