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
