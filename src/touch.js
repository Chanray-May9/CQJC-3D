/**
 * Touch controls for phones and tablets.
 *
 *   left half   floating stick -- appears where the thumb lands, drag to move.
 *               往前推是走路；推过阈值是奔跑；推到底松手是"奔跑锁定"(持续前进)。
 *   right half  drag to look
 *   buttons     开火(最大) + 瞄准(右上) + 跳 + 换弹，围绕开火按钮。
 *
 * Multi-touch is tracked per pointer id, so looking around while moving works.
 */

const STICK_RADIUS = 62;      // px from centre for full deflection
const STICK_DEADZONE = 0.12;  // fraction of radius ignored, stops thumb jitter
const LOOK_SCALE = 1.5;       // touch drags cover fewer pixels than a mouse

const RUN_THRESHOLD = 0.72;   // 摇杆前推超过此比例(向前为主) → 奔跑
const LOCK_THRESHOLD = 0.94;  // 推到接近顶端再松手 → 锁定奔跑
const FORWARD_MIN = 0.45;     // 前向分量至少这么大才算"往前推"

/** Touch-primary device? Coarse pointer plus an actual touch digitiser. */
export function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches
    && navigator.maxTouchPoints > 0;
}

export class TouchControls {
  constructor(player, container) {
    this.player = player;
    this.container = container;
    this.enabled = false;

    this.stickTouch = null;   // { id, originX, originY }
    this.lookTouch = null;    // { id, lastX, lastY }

    // main.js 每帧读取这些标志。
    this.firing = false;
    this.aiming = false;
    this.onReload = () => {};

    this.runLock = false;     // 奔跑锁定(松手后持续前进)
    this._inLockZone = false; // 当前摇杆是否在"推到顶"区

    this.root = this.#buildUi();
    this.#bind();
  }

  #buildUi() {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `
      <div id="stick-base"><div id="stick-knob"></div></div>
      <div id="touch-buttons">
        <button id="btn-fire" type="button">开火</button>
        <button id="btn-aim" type="button">瞄准</button>
        <button id="btn-jump" type="button">跳</button>
        <button id="btn-reload" type="button">换弹</button>
      </div>
    `;
    this.container.appendChild(root);

    this.base = root.querySelector('#stick-base');
    this.knob = root.querySelector('#stick-knob');
    this.fireBtn = root.querySelector('#btn-fire');
    this.aimBtn = root.querySelector('#btn-aim');
    this.jumpBtn = root.querySelector('#btn-jump');
    this.reloadBtn = root.querySelector('#btn-reload');
    return root;
  }

  #bind() {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

    // 跳、换弹：点按。
    this.jumpBtn.addEventListener('pointerdown', (e) => { stop(e); this.player.jumpQueued = true; });
    this.reloadBtn.addEventListener('pointerdown', (e) => { stop(e); this.onReload(); });

    // 开火：按住连发(射速由武器门控)。
    this.fireBtn.addEventListener('pointerdown', (e) => { stop(e); this.firing = true; this.fireBtn.classList.add('on'); });
    const fireOff = (e) => { stop(e); this.firing = false; this.fireBtn.classList.remove('on'); };
    this.fireBtn.addEventListener('pointerup', fireOff);
    this.fireBtn.addEventListener('pointercancel', fireOff);
    this.fireBtn.addEventListener('pointerleave', fireOff);

    // 瞄准：点击切换开镜/关闭(非长按)。
    this.aimBtn.addEventListener('pointerdown', (e) => {
      stop(e);
      this.aiming = !this.aiming;
      this.aimBtn.classList.toggle('on', this.aiming);
    });

    const el = this.container;
    el.addEventListener('pointerdown', (e) => this.#down(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.#move(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.#up(e));
    el.addEventListener('pointercancel', (e) => this.#up(e));
  }

  #down(e) {
    if (!this.enabled || e.pointerType !== 'touch') return;
    e.preventDefault();

    if (e.clientX < window.innerWidth * 0.45) {
      if (this.stickTouch) return;
      // 重新握摇杆即解除奔跑锁定，交回手动控制。
      this.runLock = false;
      this.player.sprintHeld = false;
      this.stickTouch = { id: e.pointerId, originX: e.clientX, originY: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('active');
      this.#setKnob(0, 0);
    } else {
      if (this.lookTouch) return;
      this.lookTouch = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    }
  }

  #move(e) {
    if (!this.enabled || e.pointerType !== 'touch') return;
    e.preventDefault();

    if (this.stickTouch?.id === e.pointerId) {
      const dx = e.clientX - this.stickTouch.originX;
      const dy = e.clientY - this.stickTouch.originY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, STICK_RADIUS);

      let mag = clamped / STICK_RADIUS;
      mag = mag < STICK_DEADZONE ? 0 : (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE);

      const ux = dist > 0 ? dx / dist : 0;
      const uy = dist > 0 ? dy / dist : 0;
      const forward = -uy;                 // 屏幕向上=前进

      this.player.analog.x = ux * mag;
      this.player.analog.y = forward * mag;

      // 分级：前推为主且推得够远 → 奔跑；推到接近顶端 → 进入锁定区。
      const pushingForward = forward > FORWARD_MIN;
      this.player.sprintHeld = pushingForward && mag >= RUN_THRESHOLD;
      this._inLockZone = pushingForward && mag >= LOCK_THRESHOLD;

      this.#setKnob(ux * clamped, uy * clamped);
      return;
    }

    if (this.lookTouch?.id === e.pointerId) {
      this.player.look(
        e.clientX - this.lookTouch.lastX,
        e.clientY - this.lookTouch.lastY,
        LOOK_SCALE,
      );
      this.lookTouch.lastX = e.clientX;
      this.lookTouch.lastY = e.clientY;
    }
  }

  #up(e) {
    if (this.stickTouch?.id === e.pointerId) {
      this.stickTouch = null;
      this.base.classList.remove('active');
      this.#setKnob(0, 0);
      if (this._inLockZone) {
        // 推到顶松手 → 锁定奔跑：持续全速前进，直到再次握摇杆。
        this.runLock = true;
        this.player.analog.x = 0;
        this.player.analog.y = 1;
        this.player.sprintHeld = true;
      } else {
        this.player.analog.x = 0;
        this.player.analog.y = 0;
        this.player.sprintHeld = false;
      }
      this._inLockZone = false;
    }
    if (this.lookTouch?.id === e.pointerId) this.lookTouch = null;
  }

  #setKnob(x, y) {
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  setEnabled(on) {
    this.enabled = on;
    this.root.classList.toggle('visible', on);
    if (!on) {
      this.player.analog.x = 0;
      this.player.analog.y = 0;
      this.player.sprintHeld = false;
      this.stickTouch = null;
      this.lookTouch = null;
      this.runLock = false;
      this.firing = false;
      this.aiming = false;
    }
  }
}
