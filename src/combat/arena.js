import * as THREE from 'three';
import { GameState } from '../game/gameState.js';
import { DeathmatchMode } from '../game/deathmatch.js';
import { Combatant } from '../game/combatant.js';
import { WeaponRuntime } from '../game/weaponRuntime.js';
import { WEAPONS, computeDamage } from '../game/weapons.js';
import { pickTarget } from './hitscan.js';
import { Avatar } from './avatars.js';

/**
 * 本地死亡竞赛竞技场（子计划2：单机 + 静止占位敌人）。
 *
 * 把逻辑核心(GameState/DeathmatchMode/Combatant)、命中(hitscan)、渲染(Avatar)
 * 串成一局可玩的对局。敌人本期为静止靶，会走位/开火的真人机在子计划3接入——
 * 那时只需给每个敌人挂一个 BotBrain 驱动 avatar 位置，本文件的开火/记分/复活
 * 管线不变。
 */

const ENEMY_COUNT = 8;         // 本期红队占位敌人数量
const RESPAWN_DELAY = 3;
const KILL_TARGET = 50;

export class Arena {
  constructor(scene, { onKill, onHit, playerWeaponId = 'rifle' } = {}) {
    this.scene = scene;
    this.onKill = onKill ?? (() => {});
    this.onHit = onHit ?? (() => {});

    this.state = new GameState();
    this.mode = new DeathmatchMode({ killTarget: KILL_TARGET, respawnDelay: RESPAWN_DELAY });
    this.clock = 0;
    this.deployed = false;

    // 玩家：蓝队。位置由 player.js 持有，这里只持有其战斗员状态。
    this.player = new Combatant({ id: 'player', team: 'blue', isBot: false });
    this.state.add(this.player);
    this.weapon = new WeaponRuntime(WEAPONS[playerWeaponId]);

    // 红队占位敌人：Avatar + Combatant 一一对应。
    this.enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i++) {
      const id = `red${i}`;
      const combatant = new Combatant({ id, team: 'red', isBot: true });
      const avatar = new Avatar('red');
      avatar.addTo(scene);
      this.state.add(combatant);
      this.enemies.push({ id, combatant, avatar, spawn: new THREE.Vector3() });
    }
  }

  // 玩家落地后调用一次：以玩家所在为中心，把敌人环形铺在地面上。
  deploy(center) {
    const groundY = center.y - 0.9;  // 玩家胶囊中心 → 脚底附近
    this.enemies.forEach((e, i) => {
      const ang = (i / ENEMY_COUNT) * Math.PI * 2;
      const r = 12 + (i % 3) * 4;
      e.spawn.set(center.x + Math.cos(ang) * r, groundY, center.z + Math.sin(ang) * r);
      this.#placeEnemy(e);
    });
    this.deployed = true;
  }

  #placeEnemy(e) {
    e.avatar.setDead(false);
    e.avatar.setFootPosition(e.spawn.x, e.spawn.y, e.spawn.z);
  }

  // 玩家开火：从相机发射线，命中最近敌人则结算伤害。用内部游戏时钟门控射速。
  fire(camera) {
    if (!this.player.alive) return false;
    if (!this.weapon.tryFire(this.clock)) return false;

    const origin = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());

    const targets = this.enemies
      .filter((e) => e.combatant.alive)
      .map((e) => ({
        id: e.id,
        body: e.avatar.bodyWorldCenter(),
        bodyRadius: e.avatar.bodyRadius,
        head: e.avatar.headWorldCenter(),
        headRadius: e.avatar.headRadius,
      }));

    const hit = pickTarget(origin, dir, targets, this.weapon.weapon.range);
    if (!hit) return true; // 开了枪但没打中

    const victim = this.state.get(hit.id);
    const dmg = computeDamage({ weapon: this.weapon.weapon, distance: hit.distance, isHeadshot: hit.isHeadshot });
    const res = victim.applyDamage(dmg, 'player');
    this.onHit(hit.isHeadshot);

    if (res.died) {
      this.mode.handleKill(this.state, { attackerId: 'player', victimId: hit.id });
      this.onKill({ headshot: hit.isHeadshot, score: this.state.score('blue') });
    }
    return true;
  }

  reload() { this.weapon.reload(this.clock); }

  update(dt) {
    this.clock += dt;
    const now = this.clock;

    this.weapon.update(now);
    this.mode.update(this.state, dt);   // 复活 + 回血

    // 同步敌人渲染：刚被复活的重新立起并归位。
    for (const e of this.enemies) {
      const wasDead = e.avatar.dead;
      if (e.combatant.alive && wasDead) this.#placeEnemy(e);
      else if (!e.combatant.alive && !wasDead) e.avatar.setDead(true);
    }

    return now;
  }

  // ---- 给 HUD 的只读快照 ----
  snapshot() {
    return {
      health: Math.round(this.player.health),
      ammo: this.weapon.ammo,
      mag: this.weapon.weapon.magSize,
      reloading: this.weapon.reloading,
      weaponName: this.weapon.weapon.name,
      blue: this.state.score('blue'),
      red: this.state.score('red'),
      target: KILL_TARGET,
      winner: this.mode.winner(this.state),
    };
  }
}
