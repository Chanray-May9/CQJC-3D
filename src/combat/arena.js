import * as THREE from 'three';
import { GameState } from '../game/gameState.js';
import { DeathmatchMode } from '../game/deathmatch.js';
import { Combatant } from '../game/combatant.js';
import { WeaponRuntime } from '../game/weaponRuntime.js';
import { WEAPONS, computeDamage } from '../game/weapons.js';
import { pickTarget } from './hitscan.js';
import { Avatar } from './avatars.js';
import { BotController } from './botController.js';

/**
 * 本地死亡竞赛竞技场（子计划3：8 个红队机器人 + 玩家）。
 *
 * 逻辑核心(GameState/DeathmatchMode/Combatant) + 命中(hitscan) + 渲染(Avatar) +
 * AI(BotController) 串成一局可玩对局。玩家(蓝/国军)对阵 8 个红队(共军)机器人，
 * 先到 50 杀获胜。玩家会被机器人打死，3 秒后在己方出生点复活。
 */

const ENEMY_COUNT = 8;
const RESPAWN_DELAY = 3;
const KILL_TARGET = 50;
const BOT_WEAPONS = ['rifle', 'rifle', 'smg', 'rifle', 'sniper', 'smg', 'rifle', 'shotgun'];
const BOT_DIFFICULTY = 0.7;   // 命中率缩放：比真人稍强但留生存空间
const AGGRO_CAP = 3;          // 同时可对玩家开火的机器人上限——防止八方焦点火力秒杀

export class Arena {
  constructor(scene, { onKill, onHit, onPlayerHit, onPlayerDied, onPlayerRespawn, playerWeaponId = 'rifle' } = {}) {
    this.scene = scene;
    this.onKill = onKill ?? (() => {});
    this.onHit = onHit ?? (() => {});
    this.onPlayerHit = onPlayerHit ?? (() => {});
    this.onPlayerDied = onPlayerDied ?? (() => {});
    this.onPlayerRespawn = onPlayerRespawn ?? (() => {});

    this.state = new GameState();
    this.mode = new DeathmatchMode({ killTarget: KILL_TARGET, respawnDelay: RESPAWN_DELAY });
    this.clock = 0;
    this.deployed = false;
    this._playerWasDead = false;

    this.player = new Combatant({ id: 'player', team: 'blue', isBot: false });
    this.state.add(this.player);
    this.weapon = new WeaponRuntime(WEAPONS[playerWeaponId]);

    this.blueSpawns = [];

    this.bots = [];
    for (let i = 0; i < ENEMY_COUNT; i++) {
      const id = `red${i}`;
      const combatant = new Combatant({ id, team: 'red', isBot: true });
      const avatar = new Avatar('red');
      avatar.addTo(scene);
      this.state.add(combatant);
      this.bots.push(new BotController(combatant, avatar, { weaponId: BOT_WEAPONS[i % BOT_WEAPONS.length], difficulty: BOT_DIFFICULTY }));
    }
  }

  // 玩家落地后调用一次：以玩家所在为中心铺开机器人与己方出生点。
  deploy(center) {
    const groundY = center.y - 0.9;
    this.bots.forEach((bot, i) => {
      const ang = (i / ENEMY_COUNT) * Math.PI * 2;
      const r = 16 + (i % 3) * 5;
      bot.place(center.x + Math.cos(ang) * r, groundY, center.z + Math.sin(ang) * r);
    });
    // 己方(蓝)出生点：玩家附近几处。
    this.blueSpawns = [
      new THREE.Vector3(center.x, center.y, center.z),
      new THREE.Vector3(center.x + 4, center.y, center.z + 4),
      new THREE.Vector3(center.x - 4, center.y, center.z - 3),
    ];
    this.deployed = true;
  }

  // 玩家开火：从相机发射线，命中最近机器人则结算伤害。
  fire(camera) {
    if (!this.player.alive) return false;
    if (!this.weapon.tryFire(this.clock)) return false;

    const origin = camera.position;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const targets = this.bots
      .filter((b) => b.c.alive)
      .map((b) => ({
        id: b.c.id,
        body: b.avatar.bodyWorldCenter(), bodyRadius: b.avatar.bodyRadius,
        head: b.avatar.headWorldCenter(), headRadius: b.avatar.headRadius,
      }));

    const hit = pickTarget(origin, dir, targets, this.weapon.weapon.range);
    if (!hit) return true;

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

  // player = Player 对象(持位置)，camera 提供玩家眼位。
  update(dt, player, camera, playerMoving) {
    this.clock += dt;
    const now = this.clock;

    this.weapon.update(now);
    if (this.weapon.ammo === 0 && !this.weapon.reloading) this.weapon.reload(now);

    // 机器人 AI。视线射线在各 bot 内部分帧，这里可整批 tick。
    const ctx = {
      clock: now, dt,
      playerPos: camera.position,
      playerCombatant: this.player,
      playerMoving,
      collider: this._collider,
      bots: this.bots,
      onPlayerHit: (info) => this.#playerHit(info),
    };
    for (const bot of this.bots) bot.update(dt, ctx);

    // Aggro 上限：只让最近的 AGGRO_CAP 个存活机器人在下一帧可开火，其余憋火。
    const alive = this.bots.filter((b) => b.c.alive).sort((a, b) => a._dist - b._dist);
    alive.forEach((b, i) => { b._mayShoot = i < AGGRO_CAP; });

    // 复活计时 + 回血
    this.mode.update(this.state, dt);

    // 机器人复活：从死亡转为存活时重新起身归位。
    for (const bot of this.bots) {
      if (bot.c.alive && bot.avatar.dead) { bot.avatar.setDead(false); bot.place(bot.spawn.x, bot.spawn.y, bot.spawn.z); }
    }

    // 玩家复活：从死亡转存活时传送到己方出生点。
    if (this._playerWasDead && this.player.alive) {
      const s = this.blueSpawns[Math.floor(Math.random() * this.blueSpawns.length)] ?? camera.position;
      player.position.copy(s);
      player.velocity.set(0, 0, 0);
      this.onPlayerRespawn();
    }
    this._playerWasDead = !this.player.alive;

    return now;
  }

  #playerHit(info) {
    this.onPlayerHit(info);
    if (info.died) {
      this.mode.handleKill(this.state, { attackerId: info.attackerId, victimId: 'player' });
      this.onPlayerDied({ score: this.state.score('red') });
    }
  }

  setCollider(collider) { this._collider = collider; }

  // 把玩家胶囊推出所有存活机器人（XZ 圆形碰撞）。
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
