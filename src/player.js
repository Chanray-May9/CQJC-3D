import * as THREE from 'three';

/**
 * First-person walker.
 *
 * Movement is a capsule swept against the campus BVH: integrate velocity, then
 * push the capsule back out of anything it ended up inside. Resolving after the
 * fact (rather than sweeping ahead) is what lets the player walk up the plaza
 * steps without any explicit stair logic -- shallow penetrations resolve mostly
 * upward, so short risers get climbed and tall walls do not.
 */

const EYE_HEIGHT = 1.68;
const CAPSULE_RADIUS = 0.34;
const CAPSULE_HEIGHT = 1.8;      // total, including the two hemisphere caps

const WALK_SPEED = 3.4;          // m/s, a normal campus walk
const SPRINT_SPEED = 7.0;
const ACCEL = 14;                // m/s^2 toward the target velocity
const GRAVITY = -22;
const JUMP_SPEED = 7.2;

const MAX_STEP_ITERATIONS = 5;
const GROUND_NORMAL_Y = 0.55;    // above this a contact counts as standing, not sliding
const LOOK_SENSITIVITY = 0.0022;
const MAX_SUBSTEP = 1 / 60;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.position = new THREE.Vector3(0, 4, 60);
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.sprinting = false;

    this.yaw = Math.PI;
    this.pitch = 0;

    this.keys = new Set();
    this.bobPhase = 0;
    this.distanceWalked = 0;

    // Analog input, written by the touch layer. Kept separate from `keys` so a
    // joystick can express partial deflection -- keyboard movement is all or
    // nothing, and collapsing the two would throw that away.
    this.analog = { x: 0, y: 0 };  // x = strafe, y = forward
    this.sprintHeld = false;       // touch sprint, mirrors the Shift key
    this.jumpQueued = false;       // touch jump, consumed on the next step

    // Scratch objects -- the update loop runs every frame and must not allocate.
    this._segment = new THREE.Line3();
    this._box = new THREE.Box3();
    this._tri = new THREE.Vector3();
    this._cap = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._correction = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._before = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._mat = new THREE.Matrix4();

    this.#bindInput();
  }

  #bindInput() {
    const dom = this.dom;

    dom.addEventListener('click', () => this.requestLock());

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.look(e.movementX, e.movementY);
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  /**
   * Enter mouse-look. Must be called from a user gesture. Exposed because the
   * start overlay sits on top of the canvas and swallows the click that would
   * otherwise reach it.
   */
  requestLock() {
    if (!this.locked) this.dom.requestPointerLock();
  }

  /**
   * Turn the view by a pixel delta. Shared by the mouse (pointer-lock movement)
   * and the touch look-drag, so sensitivity and the pitch clamp stay in one place.
   */
  look(dx, dy, scale = 1) {
    this.yaw -= dx * LOOK_SENSITIVITY * scale;
    this.pitch -= dy * LOOK_SENSITIVITY * scale;
    // Stop just shy of straight up/down so the view never flips.
    const limit = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /**
   * Desired horizontal direction in world space, combining WASD and the analog
   * stick. Returns a vector of length 0-1: a joystick at half deflection walks
   * at half speed, while any key press saturates it.
   */
  #wishDirection() {
    const k = this.keys;
    let f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.analog.y;
    let r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.analog.x;

    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._wish.set(0, 0, 0).addScaledVector(this._fwd, f).addScaledVector(this._right, r);
    const len = this._wish.length();
    if (len > 1) this._wish.divideScalar(len);
    return this._wish;
  }

  update(dt, collider) {
    // Long frames (tab switch, first-frame hitch) would otherwise tunnel the
    // capsule through walls, so integrate in bounded substeps.
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SUBSTEP);
      this.#step(step, collider);
      remaining -= step;
    }
    this.#applyCamera();
  }

  #step(dt, collider) {
    const wish = this.#wishDirection();
    this.sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintHeld;
    const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    // Horizontal velocity eases toward the target; airborne control is reduced
    // so a jump commits to its arc.
    const control = this.grounded ? 1 : 0.25;
    this.velocity.x += (wish.x * speed - this.velocity.x) * Math.min(1, ACCEL * control * dt);
    this.velocity.z += (wish.z * speed - this.velocity.z) * Math.min(1, ACCEL * control * dt);

    if (this.grounded && (this.keys.has('Space') || this.jumpQueued)) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this.jumpQueued = false;
    } else {
      this.velocity.y += GRAVITY * dt;
    }

    this._before.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.#resolveCollisions(collider);

    // Head bob is driven by ground distance actually covered, so it stops dead
    // when the player walks into a wall instead of bobbing on the spot.
    this._delta.subVectors(this.position, this._before);
    this._delta.y = 0;
    const travelled = this._delta.length();
    this.distanceWalked += travelled;
    if (this.grounded) this.bobPhase += travelled * (this.sprinting ? 3.1 : 3.8);

    return travelled;
  }

  /**
   * Push the capsule out of the world.
   *
   * Repeats a few times because resolving one contact can push the capsule into
   * another -- an inside corner needs at least two passes to settle.
   */
  #resolveCollisions(collider) {
    const bvh = collider.geometry.boundsTree;
    const half = CAPSULE_HEIGHT / 2 - CAPSULE_RADIUS;

    this.grounded = false;

    for (let iter = 0; iter < MAX_STEP_ITERATIONS; iter++) {
      const seg = this._segment;
      seg.start.set(this.position.x, this.position.y - half, this.position.z);
      seg.end.set(this.position.x, this.position.y + half, this.position.z);

      this._box.setFromPoints([seg.start, seg.end]).expandByScalar(CAPSULE_RADIUS);

      let hit = false;
      const correction = this._correction.set(0, 0, 0);

      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(this._box),
        intersectsTriangle: (tri) => {
          const triPoint = this._tri;
          const capPoint = this._cap;
          const dist = tri.closestPointToSegment(seg, triPoint, capPoint);
          if (dist >= CAPSULE_RADIUS) return false;

          hit = true;
          const depth = CAPSULE_RADIUS - dist;
          const dir = capPoint.sub(triPoint).normalize();
          correction.addScaledVector(dir, depth);

          if (dir.y > GROUND_NORMAL_Y) this.grounded = true;
          return false;
        },
      });

      if (!hit) break;

      this.position.add(correction);

      // Kill the velocity component driving us into the surface; keep the rest
      // so the player slides along walls instead of sticking to them.
      const n = this._normal.copy(correction).normalize();
      const into = this.velocity.dot(n);
      if (into < 0) this.velocity.addScaledVector(n, -into);
    }

    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;

    // Last-resort floor. If the player ever escapes the collider (a gap in the
    // model, a bad spawn) this stops an unrecoverable fall.
    if (this.position.y < -40) {
      this.position.set(0, 6, 60);
      this.velocity.set(0, 0, 0);
    }
  }

  #applyCamera() {
    // Vertical bob only, with a slight roll -- lateral sway at this amplitude
    // reads as motion sickness rather than footfalls.
    const amp = this.sprinting ? 0.055 : 0.035;
    const bobY = Math.sin(this.bobPhase) * amp;
    const roll = Math.cos(this.bobPhase * 0.5) * (this.sprinting ? 0.008 : 0.004);

    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT - CAPSULE_HEIGHT / 2 + bobY,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
  }

  /** True on the frame a footfall lands, for the audio layer. */
  get bobPhaseValue() {
    return this.bobPhase;
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}
