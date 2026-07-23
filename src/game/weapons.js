// 武器配置表。数值以对局手感为准，可独立调平衡。
// 注意：表中不含任何"定位/推荐"信息——那类倾向只存在于设计文档，游戏内绝不展示。
export const WEAPONS = {
  pistol:  { id:'pistol',  name:'手枪',   damage:34, headshotMult:1.5, fireInterval:0.28,  recoil:0.6, range:40,  falloffStart:20,  spread:0.020, magSize:12, reloadTime:1.4 },
  rifle:   { id:'rifle',   name:'步枪',   damage:26, headshotMult:1.5, fireInterval:0.12,  recoil:1.0, range:80,  falloffStart:45,  spread:0.015, magSize:30, reloadTime:2.2 },
  smg:     { id:'smg',     name:'冲锋枪', damage:18, headshotMult:1.5, fireInterval:0.075, recoil:0.9, range:35,  falloffStart:15,  spread:0.030, magSize:35, reloadTime:2.0 },
  sniper:  { id:'sniper',  name:'狙击',   damage:90, headshotMult:1.5, fireInterval:1.30,  recoil:2.5, range:200, falloffStart:200, spread:0.000, magSize:5,  reloadTime:3.0 },
  shotgun: { id:'shotgun', name:'霰弹',   damage:12, headshotMult:1.5, fireInterval:0.90,  recoil:2.2, range:18,  falloffStart:6,   spread:0.080, magSize:6,  reloadTime:2.6, pellets:8 },
};

const FLOOR_FACTOR = 0.35; // 超出有效射程后的伤害地板

// 单发命中的伤害：衰减起点内满伤，之后线性降到地板系数，超射程钳制在地板。
export function computeDamage({ weapon, distance, isHeadshot }) {
  let factor = 1;
  if (distance > weapon.falloffStart) {
    const span = Math.max(1e-6, weapon.range - weapon.falloffStart);
    const t = Math.min(1, (distance - weapon.falloffStart) / span);
    factor = 1 - (1 - FLOOR_FACTOR) * t;
  }
  const dmg = weapon.damage * factor * (isHeadshot ? weapon.headshotMult : 1);
  return dmg;
}
