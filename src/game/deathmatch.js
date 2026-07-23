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
