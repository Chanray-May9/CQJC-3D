/**
 * On-screen layer: load progress, the click-to-start gate, the location readout
 * and a small perf counter. Plain DOM over the canvas -- nothing here needs to
 * live in the 3D scene.
 */

export class Hud {
  constructor() {
    this.el = {
      loader: document.getElementById('loader'),
      loaderBar: document.getElementById('loader-bar'),
      loaderText: document.getElementById('loader-text'),
      start: document.getElementById('start'),
      place: document.getElementById('place'),
      stats: document.getElementById('stats'),
      crosshair: document.getElementById('crosshair'),
    };
    this.frames = 0;
    this.fpsClock = performance.now();
    this.fps = 0;
  }

  progress(loaded, total, label) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    this.el.loaderBar.style.width = `${pct}%`;
    this.el.loaderText.textContent = label ?? `载入中 ${pct}%`;
  }

  /** Load finished: swap the progress bar for the tap/click-to-enter prompt. */
  ready(summary, touchMode = false) {
    this.el.loader.classList.add('hidden');
    this.el.start.classList.remove('hidden');
    if (summary) this.el.start.querySelector('.detail').textContent = summary;

    if (touchMode) {
      this.el.start.querySelector('.enter').textContent = '点击进入';
      this.el.start.querySelector('.keys').innerHTML = `
        <span><b>左半屏</b> 摇杆移动</span>
        <span><b>右半屏</b> 拖动转视角</span>
        <span><b>跑 / 跳</b> 右下按钮</span>`;
    }
  }

  enterPlay() {
    this.el.start.classList.add('hidden');
    this.el.crosshair.classList.remove('hidden');
    this.el.place.classList.remove('hidden');
    this.el.stats.classList.remove('hidden');
  }

  exitPlay() {
    this.el.start.classList.remove('hidden');
    this.el.crosshair.classList.add('hidden');
  }

  fail(message) {
    this.el.loader.classList.remove('hidden');
    this.el.loaderText.textContent = message;
    this.el.loaderBar.style.background = '#c0392b';
  }

  setPlace(landmark) {
    if (!landmark) return;
    const d = Math.round(landmark.distance);
    this.el.place.textContent = d < 18 ? landmark.label : `${landmark.label} · ${d}m`;
  }

  tick(sprinting) {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsClock >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsClock));
      this.frames = 0;
      this.fpsClock = now;
      this.el.stats.textContent = `${this.fps} FPS${sprinting ? ' · 疾跑' : ''}`;
    }
  }
}
