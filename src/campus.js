import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import { MaterialLibrary, boxProjectUVs, loadTextureManifest } from './materials.js';

/**
 * Loads the campus GLB, re-skins it with PBR materials, and derives the single
 * merged BVH the player controller collides against.
 */

/** Named landmarks, surfaced to the player as an on-screen location readout. */
const LANDMARKS = [
  { match: /圆楼/,       label: '圆楼' },
  { match: /宿舍楼/,      label: '宿舍区' },
  { match: /后教学楼/,    label: '后教学楼' },
  { match: /红色实训楼/,  label: '实训楼' },
  { match: /折板楼/,      label: '折板楼' },
  { match: /田径场/,      label: '田径场' },
  { match: /看台/,        label: '看台' },
  { match: /网球场/,      label: '网球场' },
  { match: /球场/,        label: '球场' },
  { match: /plaza/i,     label: '中心广场' },
];

/**
 * Give a geometry a trivial sequential index if it has none.
 *
 * The GLB mixes indexed and non-indexed primitives, and the collider merge
 * refuses to combine the two. Adding the index is the cheaper direction: it
 * touches only a handful of meshes and leaves vertex data untouched.
 */
function ensureIndexed(geom) {
  if (geom.index) return;
  const count = geom.attributes.position.count;
  const Ctor = count > 65535 ? Uint32Array : Uint16Array;
  const idx = new Ctor(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
}

export class Campus {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.collider = null;
    this.landmarks = [];
  }

  async load(url, manager, environment = null) {
    const [gltf, manifest] = await Promise.all([
      new GLTFLoader(manager).loadAsync(url),
      loadTextureManifest(),
    ]);
    const root = gltf.scene;
    const lib = new MaterialLibrary(manager, manifest, environment);

    root.updateMatrixWorld(true);

    let meshCount = 0;
    let cloned = 0;
    // 618 nodes share only 388 geometries in this file. Box projection bakes
    // world coordinates into the UVs, so instances must not share a geometry --
    // otherwise the last one traversed overwrites the others' mapping.
    const seenGeometries = new Set();

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      meshCount++;

      // Match on "parent/self": several buildings and every tree are group
      // nodes whose actual surfaces are generically named `part_#` children,
      // so the node's own name is not enough to classify it.
      const path = `${obj.parent?.name ?? ''}/${obj.name}`;

      if (seenGeometries.has(obj.geometry)) {
        obj.geometry = obj.geometry.clone();
        cloned++;
      }
      seenGeometries.add(obj.geometry);

      ensureIndexed(obj.geometry);
      boxProjectUVs(obj);
      obj.material = lib.resolve(path, obj.material);
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.geometry.computeBoundingSphere();
    });

    // Landmark anchors for the HUD readout.
    root.traverse((obj) => {
      const name = obj.name || '';
      const hit = LANDMARKS.find((l) => l.match.test(name));
      if (!hit) return;
      if (this.landmarks.some((l) => l.label === hit.label)) return;

      const box = new THREE.Box3().setFromObject(obj);
      if (!box.isEmpty()) {
        this.landmarks.push({ label: hit.label, centre: box.getCenter(new THREE.Vector3()) });
      }
    });

    this.scene.add(root);
    this.root = root;
    this.collider = this.#buildCollider(root);

    const bounds = new THREE.Box3().setFromObject(root);
    return {
      meshCount,
      clonedGeometries: cloned,
      landmarks: this.landmarks.length,
      bounds,
    };
  }

  /**
   * Flatten every mesh into one static geometry and wrap it in a BVH. One tree
   * over ~8k triangles makes capsule sweeps effectively free, and it means the
   * controller never has to care about the scene graph.
   */
  #buildCollider(root) {
    const generator = new StaticGeometryGenerator(root);
    generator.attributes = ['position'];
    const merged = generator.generate();
    merged.boundsTree = new MeshBVH(merged);

    const collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }));
    collider.matrixAutoUpdate = false;
    this.scene.add(collider);
    return collider;
  }

  /** Nearest named landmark to a world position, for the HUD. */
  nearestLandmark(position) {
    let best = null;
    let bestDist = Infinity;
    for (const l of this.landmarks) {
      const d = l.centre.distanceTo(position);
      if (d < bestDist) {
        bestDist = d;
        best = l;
      }
    }
    return best ? { label: best.label, distance: bestDist } : null;
  }
}
