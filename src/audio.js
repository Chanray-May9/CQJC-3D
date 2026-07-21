/**
 * Procedural footsteps.
 *
 * A footfall is a short burst of noise shaped by a bandpass filter and a fast
 * decay envelope -- close enough to a shoe on concrete, and it ships as zero
 * bytes of audio. Every step randomises filter frequency and gain slightly,
 * which is what stops a repeating sample from sounding like a metronome.
 */

const STEP_INTERVAL = Math.PI;  // one footfall per half bob cycle

export class Footsteps {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.lastStepPhase = 0;
    this.enabled = true;
  }

  /** Must be called from a user gesture -- browsers block audio before one. */
  resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.noise = this.#buildNoiseBuffer();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** One second of white noise, reused as the source for every step. */
  #buildNoiseBuffer() {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  #playStep(hard) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // Random playback rate shifts the noise character step to step.
    src.playbackRate.value = 0.8 + Math.random() * 0.5;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (hard ? 1500 : 1050) * (0.85 + Math.random() * 0.3);
    band.Q.value = 0.9;

    // A little low end gives the step weight; without it footfalls sound like
    // paper rustling rather than a person.
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 220;
    low.gain.value = hard ? 9 : 5;

    const env = ctx.createGain();
    const peak = (hard ? 0.9 : 0.55) * (0.8 + Math.random() * 0.4);
    const decay = hard ? 0.11 : 0.15;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    src.connect(band).connect(low).connect(env).connect(this.master);
    src.start(now);
    src.stop(now + decay + 0.02);
  }

  /**
   * Drive from the player's bob phase so audio and head motion stay locked --
   * a step fires exactly when the camera reaches the bottom of its arc.
   */
  update(bobPhase, grounded, sprinting) {
    if (!this.ctx || !this.enabled) return;
    if (!grounded) return;

    if (bobPhase - this.lastStepPhase >= STEP_INTERVAL) {
      this.lastStepPhase = bobPhase - ((bobPhase - this.lastStepPhase) % STEP_INTERVAL);
      this.#playStep(sprinting);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
