import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 第一人称枪械视图模型（viewmodel）。
 *
 * 加载 Quaternius《Ultimate Guns Pack》的 CC0 GLB 真枪模（public/assets/weapons/*.glb），
 * 按包围盒归一化大小与朝向后挂在相机下。GLB 加载失败时回退到程序化几何枪，保证
 * 任何情况下都看得见手里的枪。
 */

const HIP = new THREE.Vector3(0.26, -0.22, -0.55);   // 腰射位置（右下）
const ADS = new THREE.Vector3(0.0, -0.13, -0.42);    // 开镜位置（居中拉近）

const TARGET_LEN = 0.5;    // 归一化后枪的最长边（米）

// 各枪的兜底外形（GLB 加载失败时用）。
const SHAPE = {
  pistol:  { body: [0.06, 0.11, 0.18], barrel: [0.03, 0.03, 0.10], color: 0x2b2b2f },
  rifle:   { body: [0.06, 0.10, 0.42], barrel: [0.025, 0.025, 0.24], color: 0x33352f },
  smg:     { body: [0.06, 0.11, 0.26], barrel: [0.024, 0.024, 0.12], color: 0x2e2e30 },
  sniper:  { body: [0.06, 0.10, 0.56], barrel: [0.022, 0.022, 0.34], color: 0x2a3226 },
  shotgun: { body: [0.07, 0.11, 0.44], barrel: [0.032, 0.032, 0.30], color: 0x3a2b22 },
};

// 每把枪归一化后的额外旋转（弧度），用于把枪管对准 -Z、握把朝下。可按截图微调。
const ORIENT = {
  rifle:   { x: 0, y: Math.PI / 2, z: 0 },
  pistol:  { x: 0, y: Math.PI / 2, z: 0 },
  smg:     { x: 0, y: Math.PI / 2, z: 0 },
  sniper:  { x: 0, y: Math.PI / 2, z: 0 },
  shotgun: { x: 0, y: Math.PI / 2, z: 0 },
};

const loader = new GLTFLoader();

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.copy(HIP);
    this.aiming = false;
    this._t = 0;
    this._token = 0;        // 防止异步加载竞态：切枪后旧加载结果作废
    this.camera.add(this.group);

    this._gun = null;
    this.#buildArms();
    this.setWeapon('rifle');
  }

  // 一双持久的第一人称手臂（蓝袖=国军 + 肤色手），跟随枪一起动。
  // 枪模本身不含手臂，这是网页 FPS 的通行做法：程序化手臂托住枪。
  #buildArms() {
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a67a, roughness: 0.6 });
    const arms = new THREE.Group();

    // 手贴在枪上，粗长前臂几乎竖直向下伸出画面底部(=连到身体)，杜绝"断手悬空"。
    const makeArm = (px, py, pz, rotX, rotZ) => {
      const arm = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.6, 6, 12), sleeve);
      fore.position.set(0, -0.34, 0.02);      // 长前臂向下伸到画面外
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.11), skin);
      arm.add(fore, hand);
      arm.position.set(px, py, pz);
      arm.rotation.set(rotX, 0, rotZ);
      return arm;
    };

    // 右手握把(靠后)，左手托前护木(靠前)。前臂近乎竖直下垂并略前倾。
    arms.add(makeArm(0.05, -0.03, 0.06, 0.45, 0.18));
    arms.add(makeArm(-0.04, -0.03, -0.12, 0.5, -0.1));
    arms.traverse((o) => { if (o.isMesh) { o.renderOrder = 998; o.frustumCulled = false; o.castShadow = false; } });

    this._arms = arms;
    this.group.add(arms);
  }

  setWeapon(id) {
    const token = ++this._token;
    // 先放程序化兜底，真模型加载完再替换。
    this.#swap(this.#buildFallback(id));
    loader.load(
      `assets/weapons/${id}.glb`,
      (gltf) => {
        if (token !== this._token) return;   // 已切到别的枪
        this.#swap(this.#normalize(gltf.scene, id));
      },
      undefined,
      () => { /* 加载失败：保留兜底枪 */ },
    );
  }

  #swap(obj) {
    if (this._gun) this.group.remove(this._gun);
    this._gun = obj;
    this.group.add(obj);
  }

  // 把加载的模型缩放居中、对准 -Z，包成一个 group。
  #normalize(scene, id) {
    const wrap = new THREE.Group();
    const o = ORIENT[id] ?? { x: 0, y: 0, z: 0 };
    scene.rotation.set(o.x, o.y, o.z);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = TARGET_LEN / maxDim;

    scene.position.sub(center);           // 居中到原点
    scene.scale.setScalar(s);
    scene.position.multiplyScalar(s);

    scene.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = false;
      m.frustumCulled = false;
      m.renderOrder = 999;
    });
    wrap.add(scene);
    return wrap;
  }

  #buildFallback(id) {
    const s = SHAPE[id] ?? SHAPE.rifle;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.7, metalness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(...s.body), metal);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(s.barrel[0], s.barrel[1], s.barrel[2], 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, s.body[1] * 0.1, -(s.body[2] / 2 + s.barrel[2] / 2));
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark);
    grip.position.set(0, -s.body[1] / 2 - 0.05, s.body[2] * 0.2);
    grip.rotation.x = 0.3;
    g.add(grip);
    if (id !== 'pistol') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), dark);
      mag.position.set(0, -s.body[1] / 2 - 0.06, 0);
      g.add(mag);
    }
    g.traverse((o) => { if (o.isMesh) { o.renderOrder = 999; o.frustumCulled = false; } });
    return g;
  }

  setAiming(on) { this.aiming = on; }
  kick() { this._t = 1; }

  update(dt) {
    const target = this.aiming ? ADS : HIP;
    this.group.position.lerp(target, Math.min(1, dt * 12));
    this._t = Math.max(0, this._t - dt * 6);
    const recoil = this._t * this._t * 0.06;
    this.group.position.z += recoil;
    if (this._gun) this._gun.rotation.x = -this._t * 0.25;
  }
}
