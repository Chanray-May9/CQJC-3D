import * as THREE from 'three';

/**
 * 占位士兵：低模人形（头/躯干/双臂/双腿），按阵营红/蓝上色。
 *
 * 比早期的胶囊更像人，但仍是过渡资产——写实 CC0 士兵模型与骨骼动画在建模期
 * 接入，届时替换本文件构建的 group 即可。命中用的 body/head 世界坐标与半径接口
 * (bodyWorldCenter/headWorldCenter/bodyRadius/headRadius) 保持不变，hitscan 不受影响。
 */

const TEAM_COLOR = { blue: 0x2f6fb0, red: 0xc0392b };

// 阵营头像贴图：蓝队=蒋介石，红队=希特勒。全局共享，只加载一次。
const _texLoader = new THREE.TextureLoader();
const FACE_TEX = {
  blue: _texLoader.load('assets/faces/chiang.png'),
  red: _texLoader.load('assets/faces/hitler.png'),
};
for (const t of Object.values(FACE_TEX)) t.colorSpace = THREE.SRGBColorSpace;
const SKIN = 0xd9a67a;
const GEAR = 0x2a2f26;      // 装备/裤装深色

const HEAD_Y = 1.62;        // 头心相对脚底
const TORSO_Y = 1.05;       // 躯干中心
const BODY_HIT_Y = 1.1;     // 命中身球球心（覆盖躯干）

export class Avatar {
  constructor(team) {
    this.team = team;
    const teamColor = TEAM_COLOR[team] ?? 0x888888;

    this.group = new THREE.Group();

    const cloth = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.75, metalness: 0.05 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
    const gear = new THREE.MeshStandardMaterial({ color: GEAR, roughness: 0.8 });
    this.material = cloth;   // 阵营主色，死亡时改透明

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };

    // 躯干（阵营色军装）
    add(new THREE.BoxGeometry(0.5, 0.62, 0.28), cloth, 0, 1.05, 0);
    // 用大头照当头：一个方块头，前(+Z)后(-Z)两面贴领袖照，两侧肤色。
    // 作为 group 子物体，随身体朝向旋转(faceYaw 转 group.rotation.y)——不再对着相机。
    // 蓝=蒋介石，红=希特勒。约 2 倍普通头径。
    const facePhoto = new THREE.MeshBasicMaterial({ map: FACE_TEX[team] ?? FACE_TEX.blue });
    const headSkin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
    const headMats = [headSkin, headSkin, headSkin, headSkin, facePhoto, facePhoto]; // +X,-X,+Y,-Y,+Z,-Z
    // 放大三倍的巨型大头照(喜剧效果)，抬高使其坐在肩上。
    const HEAD_CENTER = 2.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.45, 0.42), headMats);
    head.position.set(0, HEAD_CENTER, 0);
    head.castShadow = true;
    this.group.add(head);
    this._face = head;
    // 铰接肢体：支点在髋/肩，肢体盒向下偏移，便于绕支点摆动做走路动画。
    const limb = (geo, mat, px, pivotY, len) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, pivotY, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = -len / 2;
      m.castShadow = true;
      pivot.add(m);
      this.group.add(pivot);
      return pivot;
    };
    // 双臂（支点在肩 y≈1.3）
    this.armL = limb(new THREE.BoxGeometry(0.14, 0.52, 0.16), cloth, -0.32, 1.3, 0.52);
    this.armR = limb(new THREE.BoxGeometry(0.14, 0.52, 0.16), cloth, 0.32, 1.3, 0.52);
    // 双腿（支点在髋 y≈0.74，深色裤装）
    this.legL = limb(new THREE.BoxGeometry(0.18, 0.72, 0.2), gear, -0.13, 0.74, 0.72);
    this.legR = limb(new THREE.BoxGeometry(0.18, 0.72, 0.2), gear, 0.13, 0.74, 0.72);
    this._walk = 0;

    // 手持步枪(本地 +Z 为面朝方向)：机匣 + 枪管，端在胸前偏右。
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x20211d, roughness: 0.6, metalness: 0.4 });
    const gun = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34), gunMat);
    receiver.position.set(0, 0, 0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, 0.36);
    gun.add(receiver, barrel);
    gun.position.set(0.2, 1.02, 0.18);   // 端在右胸前
    gun.castShadow = true;
    gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(gun);
    this._gun = gun;

    // hitscan 命中球（覆盖躯干与头，略放大更跟手）
    this.bodyRadius = 0.52;
    this.headRadius = 0.68;          // 命中球随巨型大头照放大(打中大头就算爆头)
    this._bodyOffset = BODY_HIT_Y;
    this._headOffset = 2.05;         // 对齐巨型头中心
    this._tmp = new THREE.Vector3();
    this.dead = false;
    this._footY = 0;
    this._fall = 0;       // 倒地动画进度 0→1
    this.yaw = 0;
  }

  // pos = 脚底世界坐标
  setFootPosition(x, y, z) {
    this.group.position.set(x, y, z);
    this._footY = y;
  }

  faceYaw(yaw) {
    this.yaw = yaw;
    if (!this.dead) this.group.rotation.y = yaw;
  }

  setDead(dead) {
    if (dead === this.dead) return;
    this.dead = dead;
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.transparent = dead; m.opacity = dead ? 0.55 : 1; }
    });
    if (!dead) {
      // 复活：站直归位。
      this._fall = 0;
      this.group.rotation.set(0, this.yaw, 0);
      this.group.position.y = this._footY;
    }
    // 倒地动画由 update() 逐帧推进，避免瞬间穿地。
  }

  // 每帧：推进倒地动画(死亡)或走路摆肢(存活)。speed = 当前移动速度(m/s)。
  update(dt, speed = 0) {
    if (this.dead) {
      if (this._fall < 1) {
        this._fall = Math.min(1, this._fall + dt * 3.2);
        const e = 1 - Math.pow(1 - this._fall, 3);
        this.group.rotation.x = -Math.PI / 2 * e;
        this.group.position.y = this._footY + 0.16 * e;
      }
      return;
    }
    // 走路：肢体绕支点前后摆动，幅度随速度增减；静止时回正。
    const intensity = Math.min(1, speed / 4);
    this._walk += dt * (4 + speed * 1.6);
    const swing = Math.sin(this._walk) * 0.6 * intensity;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
  }

  bodyWorldCenter() {
    return this._tmp.set(
      this.group.position.x,
      this.group.position.y + this._bodyOffset,
      this.group.position.z,
    ).clone();
  }

  headWorldCenter() {
    return this._tmp.set(
      this.group.position.x,
      this.group.position.y + this._headOffset,
      this.group.position.z,
    ).clone();
  }

  addTo(scene) { scene.add(this.group); }
}
