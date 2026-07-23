import * as THREE from 'three';

/**
 * 第一人称枪械视图模型（viewmodel）。
 *
 * 程序化低模，挂在相机下作为子物体，永远跟随视角。本期(子计划2/3)用几何体拼一把
 * 能一眼看出枪种的枪；写实枪模与换弹/后坐动画在建模期(子计划4)替换 buildGun 即可，
 * 定位/开镜接口不变。
 */

const HIP = new THREE.Vector3(0.26, -0.22, -0.55);   // 腰射位置（右下）
const ADS = new THREE.Vector3(0.0, -0.13, -0.42);    // 开镜位置（居中拉近）

// 各枪的粗略外形参数：机匣长宽、枪管长、颜色。
const SHAPE = {
  pistol:  { body: [0.06, 0.11, 0.18], barrel: [0.03, 0.03, 0.10], color: 0x2b2b2f },
  rifle:   { body: [0.06, 0.10, 0.42], barrel: [0.025, 0.025, 0.24], color: 0x33352f },
  smg:     { body: [0.06, 0.11, 0.26], barrel: [0.024, 0.024, 0.12], color: 0x2e2e30 },
  sniper:  { body: [0.06, 0.10, 0.56], barrel: [0.022, 0.022, 0.34], color: 0x2a3226 },
  shotgun: { body: [0.07, 0.11, 0.44], barrel: [0.032, 0.032, 0.30], color: 0x3a2b22 },
};

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.copy(HIP);
    this.aiming = false;
    this._t = 0;          // 后坐动画计时
    this.camera.add(this.group);

    this._gun = null;
    this.setWeapon('rifle');
  }

  setWeapon(id) {
    if (this._gun) this.group.remove(this._gun);
    this._gun = this.#buildGun(id);
    this.group.add(this._gun);
  }

  #buildGun(id) {
    const s = SHAPE[id] ?? SHAPE.rifle;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.7, metalness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(...s.body), metal);
    g.add(body);

    // 枪管，从机匣前端伸出
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(s.barrel[0], s.barrel[1], s.barrel[2], 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, s.body[1] * 0.1, -(s.body[2] / 2 + s.barrel[2] / 2));
    g.add(barrel);

    // 握把
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark);
    grip.position.set(0, -s.body[1] / 2 - 0.05, s.body[2] * 0.2);
    grip.rotation.x = 0.3;
    g.add(grip);

    // 弹匣（手枪除外）
    if (id !== 'pistol') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), dark);
      mag.position.set(0, -s.body[1] / 2 - 0.06, 0);
      g.add(mag);
    }

    g.traverse((o) => { if (o.isMesh) o.renderOrder = 999; o.frustumCulled = false; });
    return g;
  }

  setAiming(on) { this.aiming = on; }

  // 开火时触发一小段后坐。
  kick() { this._t = 1; }

  update(dt) {
    // 位置在腰射/开镜之间平滑过渡
    const target = this.aiming ? ADS : HIP;
    this.group.position.lerp(target, Math.min(1, dt * 12));

    // 后坐：沿 -Z(向后) 弹一下再回位
    this._t = Math.max(0, this._t - dt * 6);
    const recoil = this._t * this._t * 0.06;
    this.group.position.z += recoil;
    this._gun.rotation.x = -this._t * 0.25;
  }
}
