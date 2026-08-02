// Procedural audio: all SFX are synthesised, music is a scheduled arpeggio +
// pad per world. No audio files, so nothing extra to load.

const SCALES = {
  // semitone offsets from the root
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  whole: [0, 2, 4, 6, 8, 10],
};

export const MUSIC_THEMES = {
  menu:     { root: 55.0, scale: 'minor', bpm: 84, wave: 'triangle', pad: 'sine', bright: 0.5 },
  facility: { root: 55.0, scale: 'minor', bpm: 96, wave: 'triangle', pad: 'sine', bright: 0.55 },
  city:     { root: 61.7, scale: 'dorian', bpm: 124, wave: 'sawtooth', pad: 'triangle', bright: 0.8 },
  caves:    { root: 49.0, scale: 'minor', bpm: 78, wave: 'sine', pad: 'sine', bright: 0.35 },
  temple:   { root: 58.3, scale: 'phrygian', bpm: 88, wave: 'triangle', pad: 'sine', bright: 0.45 },
  frost:    { root: 65.4, scale: 'lydian', bpm: 72, wave: 'sine', pad: 'triangle', bright: 0.6 },
  void:     { root: 46.2, scale: 'whole', bpm: 108, wave: 'sawtooth', pad: 'sawtooth', bright: 0.3 },
  boss:     { root: 51.9, scale: 'phrygian', bpm: 140, wave: 'sawtooth', pad: 'sawtooth', bright: 0.7 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.sfxVolume = 0.55;
    this.musicVolume = 0.34;
    this.theme = null;
    this._step = 0;
    this._nextNote = 0;
    this._timer = null;
    this._noise = null;
  }

  /** Must be called from a user gesture on most browsers. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------------ sfx
  tone(freq, dur, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.now + (opts.delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opts.wave || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t + dur);
    const vol = (opts.gain === undefined ? 0.3 : opts.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.setValueAtTime(opts.cutoff || 900, t);
      if (opts.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.cutoffTo), t + dur);
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, opts = {}) {
    if (!this.enabled || !this.ctx || !this._noise) return;
    const t = this.now + (opts.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = opts.rate || 1;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.cutoff || 1200, t);
    if (opts.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.cutoffTo), t + dur);
    f.Q.value = opts.q === undefined ? 1 : opts.q;
    const g = this.ctx.createGain();
    const vol = opts.gain === undefined ? 0.25 : opts.gain;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone(340, 0.16, { wave: 'square', slideTo: 620, gain: 0.16 });
        break;
      case 'land':
        this.noise(0.09, { cutoff: 420, gain: 0.16, filter: 'lowpass' });
        break;
      case 'step':
        this.noise(0.045, { cutoff: 900, gain: 0.05, q: 0.8 });
        break;
      case 'grab':
        this.tone(300, 0.14, { wave: 'sine', slideTo: 780, gain: 0.14 });
        this.tone(600, 0.1, { wave: 'triangle', slideTo: 1200, gain: 0.06, delay: 0.02 });
        break;
      case 'release':
        this.tone(700, 0.1, { wave: 'sine', slideTo: 260, gain: 0.1 });
        break;
      case 'throw':
        this.tone(180, 0.2, { wave: 'sawtooth', slideTo: 90, gain: 0.14, filter: 'lowpass', cutoff: 1800, cutoffTo: 300 });
        this.noise(0.14, { cutoff: 2200, cutoffTo: 500, gain: 0.12 });
        break;
      case 'push':
        this.noise(0.28, { cutoff: 300, cutoffTo: 2400, gain: 0.2, filter: 'bandpass', q: 0.6 });
        this.tone(90, 0.3, { wave: 'sine', slideTo: 40, gain: 0.2 });
        break;
      case 'stasis':
        this.tone(1200, 0.3, { wave: 'sine', slideTo: 300, gain: 0.1 });
        this.tone(1810, 0.35, { wave: 'triangle', slideTo: 450, gain: 0.06, delay: 0.03 });
        break;
      case 'dash':
        this.noise(0.22, { cutoff: 400, cutoffTo: 4000, gain: 0.16 });
        this.tone(520, 0.22, { wave: 'triangle', slideTo: 1400, gain: 0.12 });
        break;
      case 'shock':
        this.tone(70, 0.5, { wave: 'sine', slideTo: 32, gain: 0.3 });
        this.noise(0.42, { cutoff: 1800, cutoffTo: 160, gain: 0.24, filter: 'lowpass' });
        break;
      case 'build':
        this.tone(420, 0.22, { wave: 'triangle', slideTo: 840, gain: 0.13 });
        this.tone(840, 0.2, { wave: 'sine', gain: 0.07, delay: 0.06 });
        break;
      case 'switch':
        this.tone(880, 0.07, { wave: 'square', gain: 0.14 });
        this.tone(1320, 0.1, { wave: 'square', gain: 0.1, delay: 0.06 });
        break;
      case 'door':
        this.noise(0.5, { cutoff: 240, gain: 0.16, filter: 'lowpass' });
        this.tone(120, 0.5, { wave: 'sawtooth', slideTo: 180, gain: 0.1 });
        break;
      case 'break':
        this.noise(0.34, { cutoff: 900, cutoffTo: 200, gain: 0.28, filter: 'bandpass', q: 0.5 });
        break;
      case 'hurt':
        this.tone(300, 0.26, { wave: 'sawtooth', slideTo: 90, gain: 0.22 });
        break;
      case 'die':
        this.tone(400, 0.7, { wave: 'square', slideTo: 60, gain: 0.2 });
        this.noise(0.6, { cutoff: 1200, cutoffTo: 120, gain: 0.16 });
        break;
      case 'pickup':
        this.tone(880, 0.1, { wave: 'triangle', gain: 0.14 });
        this.tone(1320, 0.14, { wave: 'triangle', gain: 0.12, delay: 0.07 });
        break;
      case 'power':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, 0.35, { wave: 'triangle', gain: 0.16, delay: i * 0.1 }));
        break;
      case 'checkpoint':
        this.tone(659, 0.14, { wave: 'sine', gain: 0.13 });
        this.tone(988, 0.22, { wave: 'sine', gain: 0.11, delay: 0.1 });
        break;
      case 'hitEnemy':
        this.noise(0.12, { cutoff: 1600, cutoffTo: 400, gain: 0.2 });
        this.tone(220, 0.12, { wave: 'square', slideTo: 110, gain: 0.12 });
        break;
      case 'enemyDie':
        this.noise(0.3, { cutoff: 2000, cutoffTo: 200, gain: 0.22 });
        this.tone(180, 0.3, { wave: 'sawtooth', slideTo: 50, gain: 0.16 });
        break;
      case 'shoot':
        this.tone(760, 0.1, { wave: 'square', slideTo: 300, gain: 0.09 });
        break;
      case 'deflect':
        this.tone(1400, 0.12, { wave: 'square', slideTo: 2400, gain: 0.12 });
        break;
      case 'menu':
        this.tone(660, 0.06, { wave: 'square', gain: 0.09 });
        break;
      case 'select':
        this.tone(520, 0.08, { wave: 'square', gain: 0.12 });
        this.tone(780, 0.1, { wave: 'square', gain: 0.1, delay: 0.05 });
        break;
      case 'bossHit':
        this.tone(140, 0.24, { wave: 'sawtooth', slideTo: 60, gain: 0.24 });
        this.noise(0.24, { cutoff: 800, gain: 0.2 });
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone(f, 0.5, { wave: 'triangle', gain: 0.17, delay: i * 0.13 }));
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- music
  setTheme(name) {
    if (this.theme === name) return;
    this.theme = name;
    this._step = 0;
    if (!this.ctx) return;
    const target = this.musicOn ? this.musicVolume : 0;
    this.musicBus.gain.cancelScheduledValues(this.now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, this.now);
    this.musicBus.gain.linearRampToValueAtTime(target, this.now + 0.8);
    if (!this._timer) {
      this._nextNote = this.now + 0.1;
      this._timer = setInterval(() => this._schedule(), 60);
    }
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.linearRampToValueAtTime(on ? this.musicVolume : 0, this.now + 0.4);
  }

  setSfxOn(on) {
    this.enabled = on;
    if (this.ctx) this.sfxBus.gain.value = on ? this.sfxVolume : 0;
  }

  stopMusic() {
    if (this.ctx) this.musicBus.gain.linearRampToValueAtTime(0, this.now + 0.5);
    this.theme = null;
  }

  _schedule() {
    if (!this.ctx || !this.theme) return;
    const th = MUSIC_THEMES[this.theme] || MUSIC_THEMES.menu;
    const beat = 60 / th.bpm / 2; // eighth notes
    const scale = SCALES[th.scale];
    while (this._nextNote < this.now + 0.4) {
      const t = this._nextNote;
      const s = this._step;
      const bar = Math.floor(s / 16);
      // arpeggio
      const patt = [0, 2, 4, 6, 4, 2, 3, 1];
      const deg = patt[s % patt.length] + (bar % 2 === 1 ? 2 : 0);
      const oct = 2 + ((s % 16) >= 8 ? 1 : 0);
      const freq = th.root * Math.pow(2, oct + scale[deg % scale.length] / 12 + Math.floor(deg / scale.length));
      if (s % 2 === 0 || Math.random() < 0.4) {
        this._note(freq, beat * 1.6, th.wave, 0.055 * th.bright, t);
      }
      // bass on the downbeat
      if (s % 4 === 0) {
        const bdeg = [0, 5, 3, 4][bar % 4];
        this._note(th.root * Math.pow(2, scale[bdeg % scale.length] / 12), beat * 3.2, 'sine', 0.10, t);
      }
      // pad every bar
      if (s % 16 === 0) {
        const pdeg = [0, 4, 2, 5][bar % 4];
        for (const k of [0, 2, 4]) {
          const f = th.root * Math.pow(2, 2 + scale[(pdeg + k) % scale.length] / 12);
          this._note(f, beat * 14, th.pad, 0.028, t);
        }
      }
      // hats
      if (th.bpm > 100 && s % 2 === 1) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(this.musicBus);
        src.start(t); src.stop(t + 0.06);
      }
      this._nextNote += beat;
      this._step++;
    }
  }

  _note(freq, dur, wave, gain, t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = wave;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
