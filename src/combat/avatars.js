import * as THREE from 'three';

/**
 * 占位士兵：低模人形（头/躯干/双臂/双腿），按阵营红/蓝上色。
 *
 * 比早期的胶囊更像人，但仍是过渡资产——写实 CC0 士兵模型与骨骼动画在建模期
 * 接入，届时替换本文件构建的 group 即可。命中用的 body/head 世界坐标与半径接口
 * (bodyWorldCenter/headWorldCenter/bodyRadius/headRadius) 保持不变，hitscan 不受影响。
 */

const TEAM_COLOR = { blue: 0x2f6fb0, red: 0xc0392b };
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
    // 头 + 钢盔
    add(new THREE.SphereGeometry(0.16, 16, 12), skin, 0, HEAD_Y, 0);
    add(new THREE.SphereGeometry(0.185, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gear, 0, HEAD_Y + 0.03, 0);
    // 双臂
    add(new THREE.BoxGeometry(0.14, 0.56, 0.16), cloth, -0.32, 1.02, 0);
    add(new THREE.BoxGeometry(0.14, 0.56, 0.16), cloth, 0.32, 1.02, 0);
    // 双腿（深色裤装）
    add(new THREE.BoxGeometry(0.18, 0.72, 0.2), gear, -0.13, 0.38, 0);
    add(new THREE.BoxGeometry(0.18, 0.72, 0.2), gear, 0.13, 0.38, 0);

    // hitscan 命中球（覆盖躯干与头，略放大更跟手）
    this.bodyRadius = 0.52;
    this.headRadius = 0.24;
    this._bodyOffset = BODY_HIT_Y;
    this._headOffset = HEAD_Y;
    this._tmp = new THREE.Vector3();
    this.dead = false;
  }

  // pos = 脚底世界坐标
  setFootPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  faceYaw(yaw) {
    this.group.rotation.y = yaw;
  }

  setDead(dead) {
    if (dead === this.dead) return;
    this.dead = dead;
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = dead;
      o.material.opacity = dead ? 0.3 : 1;
    });
    // 倒地：整体压扁下沉
    this.group.position.y += dead ? -0.3 : 0.3;
    this.group.rotation.x = dead ? -Math.PI / 2.2 : 0;
    this.group.scale.set(1, dead ? 0.85 : 1, 1);
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
