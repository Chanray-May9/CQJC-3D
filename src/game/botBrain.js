// 机器人 AI 的纯逻辑：有限状态机 + 命中概率模型。不依赖 three.js，便于单测。
// 集成层(botController.js)负责把感知(距离/视线)喂进来，并把动作(移动/开火)落到场景。
//
// 难度取向：比真人稍强但不秒杀——发现玩家有反应延迟，开火按概率命中(永不必中)。

const DEFAULTS = {
  reaction: 0.45,       // 发现玩家到首次开火的延迟(秒)
  engageRange: 70,      // 进入交战/开火的最大距离(米)
  retreatHealth: 30,    // 低于此血量撤退
};

export class BotBrain {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.state = 'patrol';
    this._acquiredAt = null;   // 最近一次获得视线的时刻；丢失则清空
  }

  // sense: { dt, now, distance, hasLOS, playerAlive, health }
  // 返回: { state, wantShoot, moveMode, aimError }
  think(sense) {
    const { now, distance, hasLOS, playerAlive, health } = sense;
    const c = this.cfg;

    // 视线追踪：用于反应延迟。丢失视线即重置计时。
    if (hasLOS && playerAlive) {
      if (this._acquiredAt === null) this._acquiredAt = now;
    } else {
      this._acquiredAt = null;
    }

    let state;
    if (!playerAlive || !hasLOS) {
      state = 'patrol';
    } else if (health < c.retreatHealth) {
      state = 'retreat';
    } else {
      state = 'engage';
    }
    this.state = state;

    const reacted = this._acquiredAt !== null && (now - this._acquiredAt) >= c.reaction;
    const inRange = distance <= c.engageRange;
    // 撤退时仍可还击，但只在近距；巡逻不开火。
    const wantShoot = playerAlive && hasLOS && reacted && inRange && state !== 'patrol';

    const moveMode = state; // patrol / engage / retreat，交给控制层解释
    return { state, wantShoot, moveMode, aimError: 0 };
  }
}

// 命中概率：近距高、随距离降、玩家移动打折、难度缩放。永远钳制在 [0.05, 0.95]——
// 既不必中(不秒杀玩家)，也保留基础威胁。
export function hitChance({ distance, playerMoving, difficulty = 1 }) {
  const d = Math.max(0, distance);
  // 15m 内接近满值，之后线性下降，60m 处约 0.35。
  let p = 0.9 - Math.max(0, d - 15) * (0.55 / 45);
  if (playerMoving) p *= 0.68;
  p *= difficulty;
  return Math.max(0.05, Math.min(0.95, p));
}
