// 纯几何射线命中，不依赖 three.js，便于单测。
// 向量用 {x,y,z} 普通对象；射线方向 dir 需已归一化。

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

// 射线与球最近正向交点距离；无交或全在背向返回 null。
export function raySphere(origin, dir, center, radius) {
  const oc = sub(center, origin);
  const tca = dot(oc, dir);            // 球心在射线上的投影
  if (tca < 0) return null;            // 球心在背后
  const d2 = dot(oc, oc) - tca * tca;  // 球心到射线的垂距平方
  const r2 = radius * radius;
  if (d2 > r2) return null;            // 未相交
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;                 // 近交点
  return t >= 0 ? t : tca + thc;       // 起点在球内时取远交点
}

// 在候选目标中选最近命中；命中头球判爆头。
// targets: [{ id, body, bodyRadius, head, headRadius }]
export function pickTarget(origin, dir, targets, maxRange) {
  let best = null;
  for (const t of targets) {
    const bodyD = raySphere(origin, dir, t.body, t.bodyRadius);
    const headD = raySphere(origin, dir, t.head, t.headRadius);
    // 取该目标身/头两球中更近的命中
    let dist = null, isHeadshot = false;
    if (headD !== null && (bodyD === null || headD <= bodyD)) { dist = headD; isHeadshot = true; }
    else if (bodyD !== null) { dist = bodyD; isHeadshot = false; }
    if (dist === null || dist > maxRange) continue;
    if (!best || dist < best.distance) best = { id: t.id, isHeadshot, distance: dist };
  }
  return best;
}
