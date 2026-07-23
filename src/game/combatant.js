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
