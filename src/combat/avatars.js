import * as THREE from 'three';

/**
 * 占位士兵小人：胶囊身 + 球头，按阵营红/蓝上色。
 *
 * 本期(子计划2)仅作可射击的靶标——真正的 CC0 士兵模型与骨骼动画在子计划4
 * 接入，届时只需替换本文件构建的 group，hitscan 所需的 body/head 世界坐标接口
 * 保持不变即可。
 */

const TEAM_COLOR = { blue: 0x2f6fb0, red: 0xc0392b };

const BODY_RADIUS = 0.34;      // 与玩家胶囊同宽
const BODY_HEIGHT = 1.1;       // 胶囊圆柱段高
const HEAD_RADIUS = 0.22;
const HEAD_Y = 1.5;            // 头心相对脚底高度
const BODY_Y = 0.75;          // 身心相对脚底高度

export class Avatar {
  constructor(team) {
    this.team = team;
    const color = TEAM_COLOR[team] ?? 0x888888;

    this.group = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    this.material = mat;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT, 6, 12),
      mat,
    );
    body.position.y = BODY_Y;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_RADIUS, 16, 12),
      mat,
    );
    head.position.y = HEAD_Y;
    head.castShadow = true;

    this.group.add(body, head);

    // hitscan 用的半径（略大于几何，命中更跟手）
    this.bodyRadius = BODY_RADIUS + 0.18;
    this.headRadius = HEAD_RADIUS + 0.04;

    this._bodyOffset = BODY_Y;
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
    this.material.transparent = dead;
    this.material.opacity = dead ? 0.28 : 1;
    // 倒地：整体下沉压扁一点，作为死亡的廉价视觉反馈
    this.group.position.y += dead ? -0.4 : 0.4;
    this.group.scale.y = dead ? 0.35 : 1;
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
