import * as THREE from 'three';

/**
 * 前端流程状态机：标题 → 开场演出(旁白+地图扫描) → 阵营选择 → 模式选择 →
 * 匹配(20s 填人机) → 对局 → 结算。自建 DOM 与样式，主循环每帧调 update()。
 *
 * 开场故事：国共内战中两军被时空裂隙卷入这座现代校园，战斗在此继续——解释了为何
 * 两军会在高职校园里开打。
 */

const NARRATION =
  '一九四七年，内战正酣。国共两军在战场上殊死相搏。' +
  '就在此时，一道诡异的时空裂隙骤然撕开，两支军队连人带枪，被卷入了这座陌生的校园。' +
  '硝烟未散，战斗，在此地继续。';

const MATCH_SECONDS = 20;   // 预计匹配时间

export class Flow {
  constructor({ camera, onStart, onGesture }) {
    this.camera = camera;
    this.onStart = onStart;
    this.onGesture = onGesture ?? (() => {});
    this.state = 'title';
    this.faction = 'blue';
    this.mode = 'tdm';

    this._matchT = 0;
    this._introElapsed = 0;
    this._introDur = 17;        // 与旁白时长匹配，读完再切界面
    // 高空环绕四角的巡游航点(y 均高于建筑，避免穿模)。
    this._tour = [
      { pos: new THREE.Vector3(110, 70, 190), look: new THREE.Vector3(0, 0, 70) },
      { pos: new THREE.Vector3(-110, 65, 180), look: new THREE.Vector3(0, 0, 60) },
      { pos: new THREE.Vector3(-120, 60, -30), look: new THREE.Vector3(0, 6, 40) },
      { pos: new THREE.Vector3(120, 62, -10), look: new THREE.Vector3(0, 6, 60) },
      { pos: new THREE.Vector3(10, 90, 130), look: new THREE.Vector3(0, 0, 30) },
    ];

    this.#inject();
    this.#bind();
    this.#show('title');
  }

  // ---- 公开 ----
  update(dt) {
    if (this.state === 'intro') this.#tourStep(dt);
    else if (this.state === 'match') this.#tickMatch(dt);
  }

  // winnerTeam: 'blue'(国军) | 'red'(共军)；playerTeam: 玩家所在阵营
  showResult(winnerTeam, playerTeam, blue, red) {
    this.state = 'result';
    const won = winnerTeam === playerTeam;
    this.$('result-title').textContent = winnerTeam === 'blue' ? '国军胜利' : '共军胜利';
    this.$('result-title').style.color = winnerTeam === 'blue' ? '#6ab0f5' : '#f5776a';
    this.$('result-score').textContent = `国军 ${blue} · 共军 ${red} — 你所在阵营${won ? '获胜！' : '落败'}`;
    this.$('result-score').style.color = won ? '#cdd7e2' : '#9fb0c2';
    this.#show('result');
  }

  get playing() { return this.state === 'playing'; }

  // 隐藏所有菜单界面(测试用)。
  hideMenus() { this.#hideAll(); }

  // ---- 内部流程 ----
  #beginIntro() {
    this.state = 'intro';
    this._introElapsed = 0;
    this.#show('intro');
    this.$('intro-text').textContent = '';
    this.#type(NARRATION, this._introDur * 0.9);
    this.#speak(NARRATION);
  }

  #toFaction() { this.state = 'faction'; this.#show('faction'); }
  #toMode() { this.state = 'mode'; this.#show('mode'); }
  #toMatch() {
    this.state = 'match';
    this._matchT = 0;
    this.$('match-fill').style.width = '0%';
    this.$('match-status').textContent = `预计匹配时间 ${MATCH_SECONDS} 秒`;
    this.#show('match');
  }

  #tickMatch(dt) {
    this._matchT += dt;
    const p = Math.min(1, this._matchT / MATCH_SECONDS);
    this.$('match-fill').style.width = `${p * 100}%`;
    const remain = Math.ceil(MATCH_SECONDS - this._matchT);
    if (this._matchT < MATCH_SECONDS) {
      this.$('match-status').textContent = `预计匹配时间 ${Math.max(0, remain)} 秒 · 正在寻找玩家…`;
    } else {
      this.#finishMatch();
    }
  }

  #finishMatch() {
    this.$('match-status').textContent = '未找到足够玩家，已为双方补充人机 · 匹配完成';
    this.$('match-fill').style.width = '100%';
    this.state = 'matched';
    setTimeout(() => { if (this.state === 'matched') this.#toFaction(); }, 1000);
  }

  #startMatch() {
    this.#stopSpeak();
    this.#hideAll();
    this.state = 'playing';
    this.onStart(this.faction, this.mode);
  }

  #reset() { this.state = 'title'; this.#show('title'); }

  // 高空四角巡游：相机沿航点环绕整张地图，旁白在画面上载入。读完(到时长)才切界面。
  #tourStep(dt) {
    this._introElapsed += dt;
    const wp = this._tour;
    const segDur = this._introDur / wp.length;
    const f = (this._introElapsed % this._introDur) / segDur;   // 循环巡游
    const i = Math.floor(f) % wp.length;
    const j = (i + 1) % wp.length;
    const t = f - Math.floor(f);
    const e = t * t * (3 - 2 * t);                              // smoothstep
    const pos = wp[i].pos.clone().lerp(wp[j].pos, e);
    const look = wp[i].look.clone().lerp(wp[j].look, e);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (this._introElapsed >= this._introDur) this.#startMatch();
  }

  // ---- 语音 ----
  #speak(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.92; u.pitch = 0.9;
      this._utter = u;
      synth.cancel(); synth.speak(u);
    } catch { /* 无 TTS 也不影响演出 */ }
  }
  #stopSpeak() { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } }

  // 逐字显示旁白，节奏铺满给定时长。
  #type(text, seconds = 14) {
    const el = this.$('intro-text');
    let i = 0;
    clearInterval(this._typer);
    const step = Math.max(45, (seconds * 1000) / text.length);
    this._typer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(this._typer);
    }, step);
  }

  // ---- DOM ----
  $(id) { return document.getElementById(id); }

  #show(name) { this.#hideAll(); this.$(`screen-${name}`)?.classList.add('active'); }
  #hideAll() { this.root.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); }

  #bind() {
    // 顺序：开始 → 选模式 → 匹配 → 选阵营 → 旁白开场 → 战场
    this.$('title-start').addEventListener('click', () => { this.onGesture(); this.#toMode(); });
    this.root.querySelectorAll('#screen-mode [data-mode]').forEach((b) =>
      b.addEventListener('click', () => { this.mode = b.dataset.mode; this.#toMatch(); }));
    this.$('match-skip').addEventListener('click', () => this.#finishMatch());
    this.root.querySelectorAll('#screen-faction [data-team]').forEach((b) =>
      b.addEventListener('click', () => { this.faction = b.dataset.team; this.#beginIntro(); }));
    this.$('intro-skip').addEventListener('click', () => { clearInterval(this._typer); this.#stopSpeak(); this.#startMatch(); });
    this.$('result-again').addEventListener('click', () => location.reload());
  }

  #inject() {
    const root = document.createElement('div');
    root.id = 'flow-root';
    root.innerHTML = `
      <div id="screen-title" class="screen active">
        <div class="brand">时空战场</div>
        <div class="tagline">重庆建筑工程职业学院 · 团队竞技枪战</div>
        <button class="fbtn primary" id="title-start">开始</button>
        <div class="hint">国民党(蓝) vs 共产党(红) · 8v8 · 先到 50 杀获胜</div>
      </div>

      <div id="screen-intro" class="screen intro">
        <div id="intro-text"></div>
        <button class="fbtn ghost" id="intro-skip">跳过 ▶</button>
      </div>

      <div id="screen-faction" class="screen">
        <div class="head">选择你的阵营</div>
        <div class="cards">
          <button class="card blue" data-team="blue"><b>国民党 · 国军</b><em>蓝方</em></button>
          <button class="card red" data-team="red"><b>共产党 · 共军</b><em>红方</em></button>
        </div>
      </div>

      <div id="screen-mode" class="screen">
        <div class="head">选择模式</div>
        <div class="cards wide">
          <button class="card mode" data-mode="tdm"><b>普通团队竞技</b><em>8v8 · 先到 50 杀</em></button>
          <button class="card mode locked"><b>战术团队竞技</b><em>敬请期待</em></button>
          <button class="card mode locked"><b>占领点</b><em>敬请期待</em></button>
          <button class="card mode locked"><b>攻防模式</b><em>敬请期待</em></button>
        </div>
      </div>

      <div id="screen-match" class="screen">
        <div class="head">匹配中…</div>
        <div class="matchbar"><div id="match-fill"></div></div>
        <div id="match-status">预计匹配时间 ${MATCH_SECONDS} 秒</div>
        <button class="fbtn ghost" id="match-skip">跳过等待</button>
      </div>

      <div id="screen-result" class="screen">
        <div class="brand" id="result-title">胜利</div>
        <div id="result-score" class="tagline"></div>
        <button class="fbtn primary" id="result-again">再来一局</button>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;

    const style = document.createElement('style');
    style.textContent = `
      #flow-root { position: fixed; inset: 0; z-index: 20; pointer-events: none; }
      .screen {
        position: fixed; inset: 0; display: none; z-index: 20;
        flex-direction: column; align-items: center; justify-content: center; gap: 22px;
        background: radial-gradient(ellipse at center, rgba(14,20,28,.86), rgba(6,9,13,.96));
        backdrop-filter: blur(5px); pointer-events: auto; color: #e8eef5;
        font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif;
      }
      .screen.active { display: flex; }
      .screen.dark { background: rgba(3,5,8,.94); }
      /* 开场：透明，让实时地图扫描透出来；旁白坐在底部渐变遮罩上。 */
      .screen.intro {
        background: linear-gradient(to bottom, rgba(0,0,0,.35) 0%, transparent 22%, transparent 55%, rgba(0,0,0,.78) 100%);
        backdrop-filter: none; justify-content: flex-end; padding-bottom: 11%;
      }
      .brand { font-size: 52px; font-weight: 800; letter-spacing: .16em; text-shadow: 0 4px 24px rgba(0,0,0,.7); }
      .tagline { font-size: 15px; color: #9fb0c2; letter-spacing: .14em; }
      .hint { font-size: 13px; color: #6f7d8c; letter-spacing: .08em; margin-top: 6px; }
      .head { font-size: 26px; font-weight: 700; letter-spacing: .1em; margin-bottom: 6px; }
      .fbtn {
        pointer-events: auto; cursor: pointer; font-family: inherit;
        padding: 13px 44px; border-radius: 4px; font-size: 17px; letter-spacing: .18em;
        border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #e8eef5;
        transition: all .18s;
      }
      .fbtn.primary { background: linear-gradient(90deg,#2f6fb0,#4f97e0); border-color: transparent; font-weight: 700; }
      .fbtn.primary:hover { filter: brightness(1.12); }
      .fbtn.ghost { position: absolute; right: 34px; bottom: 30px; padding: 9px 22px; font-size: 14px; }
      .fbtn:hover { background: rgba(255,255,255,.14); }
      #intro-text {
        max-width: 680px; font-size: 23px; line-height: 2; letter-spacing: .08em;
        color: #d7e0ea; text-align: center; text-shadow: 0 2px 12px rgba(0,0,0,.9); padding: 0 30px;
        min-height: 160px;
      }
      .cards { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; max-width: 760px; }
      .cards.wide .card { width: 210px; }
      .card {
        pointer-events: auto; cursor: pointer; font-family: inherit; color: #e8eef5;
        width: 230px; padding: 26px 20px; border-radius: 8px; text-align: center;
        display: flex; flex-direction: column; gap: 8px; align-items: center;
        border: 1.5px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); transition: all .18s;
      }
      .card b { font-size: 20px; letter-spacing: .06em; }
      .card em { font-style: normal; font-size: 13px; color: #9fb0c2; }
      .card:hover { transform: translateY(-3px); background: rgba(255,255,255,.1); }
      .card.blue { border-color: rgba(90,160,230,.6); box-shadow: 0 6px 24px rgba(47,111,176,.25); }
      .card.blue:hover { background: rgba(47,111,176,.25); }
      .card.red { border-color: rgba(229,106,90,.6); box-shadow: 0 6px 24px rgba(192,57,43,.25); }
      .card.red:hover { background: rgba(192,57,43,.25); }
      .card.locked { opacity: .4; cursor: not-allowed; }
      .card.locked:hover { transform: none; background: rgba(255,255,255,.05); }
      .matchbar { width: 340px; height: 8px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
      #match-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#2f6fb0,#7cc0ff); transition: width .3s linear; }
      #match-status { font-size: 15px; color: #cdd7e2; letter-spacing: .08em; }
    `;
    document.head.appendChild(style);
  }
}
