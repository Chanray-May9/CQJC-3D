import * as THREE from 'three';

/**
 * PBR material library and the rules that decide which surface gets which one.
 *
 * The source GLB carries 18 flat-colour materials and UVs that were authored at
 * roughly one tile per 16 metres -- far too coarse for concrete to read as
 * concrete. So we do two things here: swap in scanned PBR sets, and rebuild the
 * UVs as a world-space box projection so tiling density is physically sized.
 */

const TEX_ROOT = 'assets/textures';

// Metres of world space covered by one tile of each texture set. Concrete slabs
// and asphalt read best around 4 m; grass needs to be tighter or it turns into
// visible green carpet squares.
const TILE_METRES = {
  concrete: 4,
  concrete_rough: 5,
  asphalt: 6,
  grass: 2.5,
  brick: 3,
  plaza: 3,
};

/**
 * Ordered match rules. First hit wins, so specific names must precede the
 * catch-alls. `test` runs against the node name.
 *
 * `tint` multiplies the scanned albedo, which is how buildings keep the
 * individual colours the generator gave them without needing a texture set each.
 *
 * `whiten` (0-1) instead lifts the albedo toward white. Tint alone cannot make a
 * surface white: it is a multiply, and scanned concrete sits around mid grey, so
 * even a pure white tint returns mid grey. Pushing tint above 1 would brighten
 * but clips the highlights flat. Mixing toward white keeps every bit of grain
 * and just raises the floor -- which is what the real campus walls look like.
 */
const WALL = { set: 'concrete', tint: 0xf7f5f1, whiten: 0.62 };

/**
 * Pale blue glazing.
 *
 * Relies on scene.environment for its reflection -- see sky.js. Roughness is
 * deliberately not zero: a perfect mirror shows the sky gradient too cleanly and
 * reads as chrome, while a touch of blur reads as architectural glass.
 */
const GLASS = {
  plain: {
    color: 0x27506f,
    roughness: 0.14,
    metalness: 0.35,
    // The prefiltered sky is high dynamic range, so anything near 1 here blows
    // the glazing out to white and it stops reading as blue at all.
    envMapIntensity: 0.35,
  },
};

/**
 * Colours the generator used for glazing, taken from the source materials. The
 * window strips are `part_#` nodes indistinguishable by name from wall panels,
 * so the original colour is the only thing that identifies them.
 */
const GLASS_COLOURS = ['8fa6b3', '5c7a88'];

const RULES = [
  // --- explicitly named glass and water --------------------------------
  { test: /玻璃/,                  ...GLASS },
  { test: /水池/,                  plain: { color: 0x4a7f96, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6 } },

  /*
   * Trees. Their trunk and canopy are `part_#` children of a `tree` node, so
   * without matching on the parent they fall through to the filler rule and get
   * a concrete scan mapped onto bark and leaves.
   */
  { test: /(^|\/)tree(_\d+)?\//,  set: null },

  // --- ground and paving ---
  { test: /^ground$/i,            set: 'grass',          tint: 0xdfe6cf },
  { test: /(东侧坡地|东侧下坡台地)/, set: 'grass',          tint: 0xd6dfc6 },
  { test: /^road_/i,              set: 'asphalt' },
  { test: /^(plaza_|axis_step)/i, set: 'plaza' },
  { test: /田径场_跑道/,           set: 'asphalt',        tint: 0xc65a3a }, // red rubber track
  { test: /田径场_草坪/,           set: 'grass' },
  { test: /(球场|网球场)/,          set: 'plaza',          tint: 0x6f8fa6 },

  // --- things that must keep their own colour ---
  { test: /红框/,                  set: null },  // 图文信息中心's red frame
  { test: /红色实训楼\w*_body/,     set: 'brick' },

  // --- roofs before bodies, since a roof node also ends in a building name ---
  { test: /_roof$/i,              set: 'concrete_rough', tint: 0x9aa0a2 },

  /*
   * Window strips, matched by the generator's glazing colours rather than by
   * name. 458 of them across 折板楼, 后教学楼, 宿舍楼, 北教学楼 and 红色实训楼.
   */
  { test: /\/part_/i, colours: GLASS_COLOURS, ...GLASS },

  /*
   * Wall panels of buildings modelled as a group of parts rather than a single
   * `_body` mesh -- the folded-plate blocks are built this way. Their source
   * colour is already near white, but multiplying it through a mid-grey concrete
   * scan drags it back to grey, so they need the same whitening as every other
   * wall.
   */
  { test: /(折板楼|东北实训楼|东实训楼|前教学楼|北教学楼|图文信息中心)\d*\/part_/i, ...WALL },

  /*
   * Painted white walls.
   *
   * Nearly every building exposes its massing as a `*_body` node, so one rule
   * covers 东实训楼A-D, 北教学楼, 前教学楼, 后教学楼, 图文信息中心, 宿舍楼 and the
   * rest. The few that do not follow the convention are listed after it.
   */
  { test: /_body$/i,              ...WALL },
  { test: /圆楼_屋盖/,             set: 'concrete_rough', tint: 0x9aa0a2 },
  { test: /(圆楼_(上体|下体|中环|辐条)|看台|廊桥)/, ...WALL },

  // Remaining filler blocks: slabs, parapets, kerbs. These keep the generator's
  // own colours over a concrete scan.
  { test: /part_/i,               set: 'concrete_rough' },
];

const FALLBACK = { set: 'concrete_rough' };

const SLOTS = {
  color: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  ao: 'aoMap',
};

/**
 * Load one texture set, consulting the manifest so we only request maps that
 * were actually published. Map coverage on ambientCG is uneven -- Concrete034
 * has no AO -- and blindly requesting a fixed list produces 404s.
 */
function loadSet(loader, name, available) {
  const maps = {};
  const tile = TILE_METRES[name] ?? 4;

  for (const file of available) {
    const slot = SLOTS[file];
    if (!slot) continue;

    const tex = loader.load(`${TEX_ROOT}/${name}/${file}.jpg`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // UVs are emitted in metres, so repeat is the inverse of the tile size.
    tex.repeat.setScalar(1 / tile);
    if (slot === 'map') tex.colorSpace = THREE.SRGBColorSpace;
    // aoMap defaults to the second UV set; ours is identical to the first, so
    // point it at channel 0 rather than storing a duplicate attribute.
    if (slot === 'aoMap') tex.channel = 0;
    tex.anisotropy = 8;
    maps[slot] = tex;
  }
  return maps;
}

/** Fetch the map-coverage manifest written by tools/fetch_textures.py. */
export async function loadTextureManifest() {
  const res = await fetch(`${TEX_ROOT}/manifest.json`);
  if (!res.ok) throw new Error(`texture manifest missing (${res.status})`);
  return res.json();
}

/**
 * Rebuild TEXCOORD_0 as a world-space box projection.
 *
 * Every vertex is projected along whichever axis its normal points at most
 * strongly, using world coordinates in metres. Vertices in this model are split
 * per face (24 per box), so each face gets a clean, independent projection with
 * no smearing across corners -- which is exactly why this works without a UV
 * unwrap step in Blender.
 */
export function boxProjectUVs(mesh) {
  const geom = mesh.geometry;
  const pos = geom.attributes.position;
  const nrm = geom.attributes.normal;
  if (!pos || !nrm) return;

  mesh.updateWorldMatrix(true, false);
  const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nrm, i).applyMatrix3(normalMat);

    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);

    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = p.x; v = p.z;          // floors and roofs
    } else if (ax >= az) {
      u = p.z; v = p.y;          // walls facing X
    } else {
      u = p.x; v = p.y;          // walls facing Z
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }

  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Lift a material's albedo toward white, preserving its texture variation.
 *
 * Injected right after `map_fragment`, where `diffuseColor` holds tint x sampled
 * albedo. Mixing there raises the overall level while leaving the relative
 * light/dark structure of the scan intact, so the wall reads as painted white
 * rather than as flat white paint with the concrete grain scrubbed off.
 *
 * The amount lives in a uniform rather than being baked into the source, so all
 * whitened materials share one compiled program regardless of their strength.
 */
function applyWhiten(material, amount) {
  material.userData.whiten = { value: amount };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWhiten = material.userData.whiten;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uWhiten;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uWhiten);`,
      );
  };

  // Whitened and plain materials must not share a compiled program.
  material.customProgramCacheKey = () => 'whiten';
}

export class MaterialLibrary {
  /**
   * @param environment  prefiltered sky, applied only to reflective surfaces.
   *                     See sky.js for why it is not the scene environment.
   */
  constructor(manager, manifest, environment = null) {
    this.loader = new THREE.TextureLoader(manager);
    this.manifest = manifest;
    this.environment = environment;
    this.sets = new Map();
    this.cache = new Map();
  }

  #set(name) {
    if (!this.sets.has(name)) {
      const available = this.manifest[name] ?? ['color'];
      this.sets.set(name, loadSet(this.loader, name, available));
    }
    return this.sets.get(name);
  }

  /**
   * Resolve the material for a node, reusing one instance per (set, tint, whiten)
   * combination so the 500-odd filler blocks collapse into a handful of
   * draw-call groups.
   */
  /**
   * @param path  "parentName/nodeName" -- the parent matters because several
   *              buildings and every tree are group nodes whose real surfaces
   *              are generically named `part_#` children.
   */
  resolve(path, sourceMaterial) {
    const sourceHex = sourceMaterial?.color?.getHexString();
    const rule = RULES.find((r) => {
      if (!r.test.test(path)) return false;
      // Some rules additionally key off the colour the generator assigned,
      // which is the only thing separating window strips from wall panels.
      return r.colours ? r.colours.includes(sourceHex) : true;
    }) ?? FALLBACK;

    if (rule.set === null) return sourceMaterial;

    // Untextured surfaces: glass, water. Smoothness is the whole look, and a
    // concrete scan on them would only get in the way.
    if (rule.plain) {
      const key = `plain|${JSON.stringify(rule.plain)}`;
      if (this.cache.has(key)) return this.cache.get(key);
      const { opacity, ...params } = rule.plain;
      const mat = new THREE.MeshStandardMaterial({
        ...params,
        ...(opacity !== undefined ? { transparent: true, opacity } : {}),
        envMap: this.environment,
      });
      this.cache.set(key, mat);
      return mat;
    }

    // Fall back to the colour the generator assigned so buildings stay distinct.
    const tint = rule.tint ?? sourceMaterial?.color?.getHex() ?? 0xffffff;
    const whiten = rule.whiten ?? 0;
    const key = `${rule.set}|${tint}|${whiten}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const mat = new THREE.MeshStandardMaterial({
      ...this.#set(rule.set),
      color: new THREE.Color(tint),
      roughness: 1,
      metalness: 0,
      aoMapIntensity: 0.9,
      normalScale: new THREE.Vector2(1.1, 1.1),
    });

    if (whiten > 0) applyWhiten(mat, whiten);

    this.cache.set(key, mat);
    return mat;
  }
}
