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
      combat: document.getElementById('combat-hud'),
      scoreBlue: document.getElementById('score-blue'),
      scoreRed: document.getElementById('score-red'),
      scoreTarget: document.getElementById('score-target'),
      barBlue: document.getElementById('bar-blue'),
      barRed: document.getElementById('bar-red'),
      healthBar: document.getElementById('health-bar'),
      healthNum: document.getElementById('health-num'),
      ammoCount: document.getElementById('ammo-count'),
      ammoName: document.getElementById('ammo-name'),
      killfeed: document.getElementById('killfeed'),
      hitmarker: document.getElementById('hitmarker'),
      banner: document.getElementById('banner'),
      damageFlash: document.getElementById('damage-flash'),
      death: document.getElementById('death'),
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

  /** 载入完成：收起进度条(流程界面负责后续入口)。 */
  hideLoader() {
    this.el.loader.classList.add('hidden');
    this.el.start?.classList.add('hidden');
  }

  enterPlay() {
    this.el.start?.classList.add('hidden');
    this.el.crosshair.classList.remove('hidden');
    this.el.place.classList.remove('hidden');
    this.el.stats.classList.remove('hidden');
    if (this.el.combat) this.el.combat.classList.remove('hidden');
  }

  /** 每帧刷新战斗数值：血量/弹药/比分。参数为 Arena.snapshot()。 */
  setCombat(s) {
    if (!this.el.combat) return;
    this.el.healthBar.style.width = `${Math.max(0, s.health)}%`;
    this.el.healthBar.style.background = s.health > 40
      ? 'linear-gradient(90deg, #4caf50, #8bd48e)'
      : 'linear-gradient(90deg, #c0392b, #e57368)';
    this.el.healthNum.textContent = String(s.health);
    this.el.ammoCount.textContent = s.reloading ? '换弹…' : String(s.ammo);
    this.el.ammoCount.classList.toggle('reloading', s.reloading);
    this.el.ammoName.textContent = s.weaponName;
    this.el.scoreBlue.textContent = String(s.blue);
    this.el.scoreRed.textContent = String(s.red);
    this.el.scoreTarget.textContent = String(s.target);
    if (this.el.barBlue) this.el.barBlue.style.width = `${Math.min(100, (s.blue / s.target) * 100)}%`;
    if (this.el.barRed) this.el.barRed.style.width = `${Math.min(100, (s.red / s.target) * 100)}%`;
  }

  killFeed(text, headshot = false) {
    if (!this.el.killfeed) return;
    const item = document.createElement('div');
    item.className = 'item' + (headshot ? ' head' : '');
    item.textContent = text;
    this.el.killfeed.appendChild(item);
    setTimeout(() => item.remove(), 3000);
  }

  hitMarker(headshot = false) {
    const m = this.el.hitmarker;
    if (!m) return;
    m.classList.toggle('head', headshot);
    m.classList.remove('show');
    void m.offsetWidth; // 重启动画
    m.classList.add('show');
  }

  banner(text, team) {
    const b = this.el.banner;
    if (!b) return;
    b.textContent = text;
    b.style.color = team === 'blue' ? '#5aa0e6' : '#e56a5a';
    b.classList.remove('hidden');
  }

  damageFlash() {
    const f = this.el.damageFlash;
    if (!f) return;
    f.classList.remove('hit');
    void f.offsetWidth;
    f.classList.add('hit');
  }

  showDeath() { this.el.death?.classList.add('show'); }
  clearDeath() { this.el.death?.classList.remove('show'); }

  // 暂停(指针解锁)：仅收起准星，不弹旧遮罩。
  exitPlay() {
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
