import * as THREE from 'three';
import { EntityManager } from 'yuka';
import { GameState } from '../game/gameState.js';
import { DeathmatchMode } from '../game/deathmatch.js';
import { Combatant } from '../game/combatant.js';
import { WeaponRuntime } from '../game/weaponRuntime.js';
import { WEAPONS, computeDamage } from '../game/weapons.js';
import { pickTarget } from './hitscan.js';
import { Avatar } from './avatars.js';
import { BotController } from './botController.js';

/**
 * 本地死亡竞赛竞技场：8v8（玩家+7 蓝队 AI 队友 vs 8 红队 AI），先到 50 杀获胜。
 *
 * 两队在地图两端各自的阵营区出生/复活（蓝 +Z 端 / 红 -Z 端）。机器人锁定最近的
 * 敌方（可为敌方 bot 或玩家），用 Yuka 转向行为在地图上机动交火，敌我互杀都计分。
 */

const TEAM_SIZE = 8;
const RESPAWN_DELAY = 3;
const KILL_TARGET = 50;
const AGGRO_CAP = 3;            // 同时可对"玩家"开火的红队上限——防止焦点火力秒杀
const BLUE_WEAPONS = ['rifle', 'rifle', 'smg', 'sniper', 'rifle', 'smg', 'shotgun'];
const RED_WEAPONS = ['rifle', 'rifle', 'smg', 'rifle', 'sniper', 'smg', 'rifle', 'shotgun'];

export class Arena {
  constructor(scene, { onKill, onHit, onPlayerHit, onPlayerDied, onPlayerRespawn, playerWeaponId = 'rifle', playerTeam = 'blue' } = {}) {
    this.scene = scene;
    this.onKill = onKill ?? (() => {});
    this.onHit = onHit ?? (() => {});
    this.onPlayerHit = onPlayerHit ?? (() => {});
    this.onPlayerDied = onPlayerDied ?? (() => {});
    this.onPlayerRespawn = onPlayerRespawn ?? (() => {});

    this.playerTeam = playerTeam;                       // 'blue'(国军) | 'red'(共军)
    this.enemyTeam = playerTeam === 'blue' ? 'red' : 'blue';

    this.state = new GameState();
    this.mode = new DeathmatchMode({ killTarget: KILL_TARGET, respawnDelay: RESPAWN_DELAY });
    this.em = new EntityManager();
    this.clock = 0;
    this.deployed = false;
    this._playerWasDead = false;
    this._playerMoving = false;

    // 玩家：所选阵营的 8 人之一。
    this.player = new Combatant({ id: 'player', team: playerTeam, isBot: false });
    this.state.add(this.player);
    this.weapon = new WeaponRuntime(WEAPONS[playerWeaponId]);

    this.blueZone = new THREE.Vector3();
    this.redZone = new THREE.Vector3();

    // 玩家队补 7 个 AI 队友；敌队 8 个 AI。
    this.bots = [];
    const teamWeapons = { blue: BLUE_WEAPONS, red: RED_WEAPONS };
    for (let i = 0; i < TEAM_SIZE - 1; i++) this.#addBot(playerTeam, `${playerTeam}${i}`, teamWeapons[playerTeam][i % teamWeapons[playerTeam].length]);
    for (let i = 0; i < TEAM_SIZE; i++) this.#addBot(this.enemyTeam, `${this.enemyTeam}${i}`, teamWeapons[this.enemyTeam][i % teamWeapons[this.enemyTeam].length]);
  }

  #zoneOf(team) { return team === 'blue' ? this.blueZone : this.redZone; }

  #addBot(team, id, weaponId) {
    const combatant = new Combatant({ id, team, isBot: true });
    const avatar = new Avatar(team);
    avatar.addTo(this.scene);
    this.state.add(combatant);
    this.bots.push(new BotController(combatant, avatar, { weaponId, difficulty: 0.7, entityManager: this.em }));
  }

  setCollider(collider) { this._collider = collider; }

  // 公开：某点地面高度(供玩家出生落地)。
  groundHeight(x, z) { return this.#groundY(x, z); }

  #groundY(x, z) {
    if (!this._collider) return 0;
    const ray = new THREE.Ray(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
    const hit = this._collider.geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);
    return hit ? hit.point.y : 0;
  }

  // 定两端阵营区并随机分配给红蓝，铺开双方。玩家由 main 用 playerSpawn() 放置。
  // 两端取开阔平地的对角两角，最大化间距；哪队在哪端随机(不因玩家固定)。
  deploy() {
    const endA = new THREE.Vector3(55, 0, 128);
    const endB = new THREE.Vector3(-55, 0, 5);
    if (Math.random() < 0.5) {
      this.blueZone.copy(endA); this.redZone.copy(endB);
    } else {
      this.blueZone.copy(endB); this.redZone.copy(endA);
    }
    let bi = 0, ri = 0;
    for (const bot of this.bots) {
      if (bot.c.team === 'blue') this.#spawnInZone(bot, this.blueZone, bi++);
      else this.#spawnInZone(bot, this.redZone, ri++);
    }
    this.deployed = true;
  }

  // 玩家出生点(己方阵营区)。deploy() 之后调用。
  playerSpawn() { return this.#spawnPoint(this.#zoneOf(this.playerTeam), 7); }
  enemyZone() { return this.#zoneOf(this.enemyTeam); }

  // 阵营区内的出生点，且必须落在平地(拒绝屋顶)。找不到就退回区中心地面。
  #spawnPoint(zone, i) {
    const baseY = this.#groundY(zone.x, zone.z);
    const roofLimit = baseY + 2.5;          // 高于区域地面 2.5m 视为屋顶/障碍
    for (let k = 0; k < 8; k++) {
      const ang = (i + k) * 2.399;          // 黄金角散布
      const r = 2 + ((i + k) % 5) * 2.6;
      const x = zone.x + Math.cos(ang) * r;
      const z = zone.z + Math.sin(ang) * r;
      const y = this.#groundY(x, z);
      if (y <= roofLimit) return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(zone.x, baseY, zone.z);
  }

  #spawnInZone(bot, zone, i) {
    const p = this.#spawnPoint(zone, i);
    bot.place(p.x, p.y, p.z);
  }

  // 玩家开火：命中最近的存活红队。
  fire(camera) {
    if (!this.player.alive) return false;
    if (!this.weapon.tryFire(this.clock)) return false;
    const origin = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const targets = this.bots
      .filter((b) => b.c.team === this.enemyTeam && b.c.alive)
      .map((b) => ({
        id: b.c.id,
        body: b.avatar.bodyWorldCenter(), bodyRadius: b.avatar.bodyRadius,
        head: b.avatar.headWorldCenter(), headRadius: b.avatar.headRadius,
      }));
    const hit = pickTarget(origin, dir, targets, this.weapon.weapon.range);
    if (!hit) return true;
    const dmg = computeDamage({ weapon: this.weapon.weapon, distance: hit.distance, isHeadshot: hit.isHeadshot });
    this.dealDamage(hit.id, dmg, 'player', hit.isHeadshot);
    this.onHit(hit.isHeadshot);
    return true;
  }

  reload() { this.weapon.reload(this.clock); }

  // 统一伤害入口：结算伤害/死亡/记分，玩家受击/阵亡回调。
  dealDamage(victimId, dmg, attackerId, isHead = false) {
    const victim = this.state.get(victimId);
    if (!victim || !victim.alive) return;
    const res = victim.applyDamage(dmg, attackerId);
    if (victimId === 'player') this.onPlayerHit({ dmg });
    if (res.died) {
      this.mode.handleKill(this.state, { attackerId, victimId });
      if (attackerId === 'player') {
        this.onKill({ headshot: isHead, score: this.state.score('blue') });
        const w = this.mode.winner(this.state);
        if (w) this.onWinner?.(w);
      }
      if (victimId === 'player') this.onPlayerDied({ score: this.state.score('red') });
    }
  }

  #actorPos(bot) { return bot.pos; }

  update(dt, player, camera, playerMoving) {
    this.clock += dt;
    const now = this.clock;
    this._playerMoving = playerMoving;

    this.weapon.update(now);
    if (this.weapon.ammo === 0 && !this.weapon.reloading) this.weapon.reload(now);

    // 组装全体存活单位（含玩家），供各 bot 找最近敌人。
    const actors = [{ id: 'player', team: 'blue', pos: camera.position, alive: this.player.alive }];
    for (const b of this.bots) actors.push({ id: b.c.id, team: b.c.team, pos: b.pos, alive: b.c.alive, bot: b });

    const ctx = {
      clock: now, collider: this._collider,
      dealDamage: (vid, dmg, aid) => this.dealDamage(vid, dmg, aid, Math.random() < 0.1),
      isMoving: (id) => this.#isMoving(id),
    };

    // 为每个 bot 锁定最近敌方。
    for (const b of this.bots) {
      if (!b.c.alive) { b.setEnemy(null, 999, false, null); continue; }
      let best = null, bestD = Infinity;
      for (const a of actors) {
        if (a.team === b.c.team || !a.alive) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < bestD) { bestD = d; best = a; }
      }
      b.setEnemy(best ? best.pos : null, best ? bestD : 999, !!best, best ? best.id : null);
    }

    // Aggro 上限：仅限制"瞄准玩家"的红队开火数。
    const onPlayer = this.bots
      .filter((b) => b.c.alive && b._enemyId === 'player')
      .sort((a, b) => a._enemyDist - b._enemyDist);
    onPlayer.forEach((b, i) => { b._mayShoot = i < AGGRO_CAP; });
    for (const b of this.bots) if (b._enemyId !== 'player') b._mayShoot = true;

    // 两阶段：先决策/设目标，再由 Yuka 统一积分，最后落地+开火。
    for (const b of this.bots) b.steer(dt, ctx);
    this.em.update(dt);
    for (const b of this.bots) b.postStep(dt, ctx);

    this.mode.update(this.state, dt);

    // 死亡瞬间触发倒地动画。
    for (const b of this.bots) {
      if (!b.c.alive && !b.avatar.dead) b.avatar.setDead(true);
    }

    // 复活：机器人回己方阵营区，玩家回蓝区。
    for (const b of this.bots) {
      if (b.c.alive && b.avatar.dead) {
        b.avatar.setDead(false);
        const zone = b.c.team === 'blue' ? this.blueZone : this.redZone;
        this.#spawnInZone(b, zone, Math.floor(Math.random() * 8));
      }
    }
    if (this._playerWasDead && this.player.alive) {
      const p = this.#spawnPoint(this.#zoneOf(this.playerTeam), Math.floor(Math.random() * 6));
      player.position.set(p.x, p.y + 1.0, p.z);
      player.velocity.set(0, 0, 0);
      this.onPlayerRespawn();
    }
    this._playerWasDead = !this.player.alive;
    return now;
  }

  #isMoving(id) {
    if (id === 'player') return this._playerMoving;
    const b = this.bots.find((x) => x.c.id === id);
    if (!b) return false;
    const v = b.vehicle.velocity;
    return (v.x * v.x + v.z * v.z) > 0.4;
  }

  resolvePlayerCollision(player) {
    const R = 0.34 + 0.42;
    for (const b of this.bots) {
      if (!b.c.alive) continue;
      const dx = player.position.x - b.pos.x, dz = player.position.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < R) {
        const push = R - d;
        player.position.x += (dx / d) * push;
        player.position.z += (dz / d) * push;
      }
    }
  }

  snapshot() {
    return {
      health: Math.max(0, Math.round(this.player.health)),
      alive: this.player.alive,
      ammo: this.weapon.ammo, mag: this.weapon.weapon.magSize,
      reloading: this.weapon.reloading, weaponName: this.weapon.weapon.name,
      blue: this.state.score('blue'), red: this.state.score('red'),
      target: KILL_TARGET, winner: this.mode.winner(this.state),
    };
  }
}
