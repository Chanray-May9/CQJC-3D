import * as THREE from 'three';

/**
 * Touch controls for phones and tablets.
 *
 * Pointer lock does not exist on mobile, and there is no keyboard, so the
 * desktop control scheme leaves a phone user standing still. This replaces it
 * with the layout every mobile shooter uses:
 *
 *   left half   floating stick -- appears where the thumb lands, drag to walk
 *   right half  drag to look
 *   buttons     sprint (toggle) and jump, bottom right
 *
 * Multi-touch is tracked per pointer id, so looking around while walking works;
 * handling only a single active touch is the usual reason these feel broken.
 */

const STICK_RADIUS = 62;      // px from centre for full deflection
const STICK_DEADZONE = 0.12;  // fraction of radius ignored, stops thumb jitter
const LOOK_SCALE = 1.5;       // touch drags cover fewer pixels than a mouse

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

    // pointerId -> what that finger is doing
    this.stickTouch = null;   // { id, originX, originY }
    this.lookTouch = null;    // { id, lastX, lastY }
    this.firing = false;      // 开火按钮是否按住，main.js 每帧读取

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
        <button id="btn-sprint" type="button">跑</button>
        <button id="btn-jump" type="button">跳</button>
      </div>
    `;
    this.container.appendChild(root);

    this.base = root.querySelector('#stick-base');
    this.knob = root.querySelector('#stick-knob');
    this.sprintBtn = root.querySelector('#btn-sprint');
    this.jumpBtn = root.querySelector('#btn-jump');
    this.fireBtn = root.querySelector('#btn-fire');
    return root;
  }

  #bind() {
    const jump = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.player.jumpQueued = true;
    };
    const sprint = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.player.sprintHeld = !this.player.sprintHeld;
      this.sprintBtn.classList.toggle('on', this.player.sprintHeld);
    };
    this.jumpBtn.addEventListener('pointerdown', jump);
    this.sprintBtn.addEventListener('pointerdown', sprint);

    // 开火：按住连发（实际射速由武器运行时门控）。firing 由 main.js 每帧读取。
    const fireOn = (e) => { e.preventDefault(); e.stopPropagation(); this.firing = true; this.fireBtn.classList.add('on'); };
    const fireOff = (e) => { e.preventDefault(); e.stopPropagation(); this.firing = false; this.fireBtn.classList.remove('on'); };
    this.fireBtn.addEventListener('pointerdown', fireOn);
    this.fireBtn.addEventListener('pointerup', fireOff);
    this.fireBtn.addEventListener('pointercancel', fireOff);
    this.fireBtn.addEventListener('pointerleave', fireOff);

    const el = this.container;
    el.addEventListener('pointerdown', (e) => this.#down(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.#move(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.#up(e));
    el.addEventListener('pointercancel', (e) => this.#up(e));
  }

  #down(e) {
    if (!this.enabled || e.pointerType !== 'touch') return;
    e.preventDefault();

    // Left half drives the stick, right half drives the camera. Splitting by
    // screen half rather than by a fixed stick position lets the stick appear
    // under the thumb wherever it lands, which is far more forgiving in play.
    if (e.clientX < window.innerWidth * 0.45) {
      if (this.stickTouch) return;
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
      // Rescale past the deadzone so the stick still reaches full speed.
      mag = mag < STICK_DEADZONE ? 0 : (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE);

      const ux = dist > 0 ? dx / dist : 0;
      const uy = dist > 0 ? dy / dist : 0;

      this.player.analog.x = ux * mag;
      this.player.analog.y = -uy * mag;   // screen down is backwards
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
      this.player.analog.x = 0;
      this.player.analog.y = 0;
      this.base.classList.remove('active');
      this.#setKnob(0, 0);
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
      this.stickTouch = null;
      this.lookTouch = null;
    }
  }
}
