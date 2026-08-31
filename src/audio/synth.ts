// A small WebAudio synth. No sound files. Every sound is an oscillator envelope or a noise burst.
// Mobile browsers need a user gesture before audio starts, so unlock() runs on the first tap or key.

export type SoundName = 'attack' | 'death' | 'build' | 'capture' | 'warning' | 'victory' | 'defeat' | 'click';

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  volume = 0.7;
  muted = false;

  /** Create the context on a user gesture. Safe to call many times. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : v;
  }

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 1, at = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private burst(dur: number, gain: number, freq: number, at = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Play a named sound. Frequent sounds are rate limited so a big fight does not become a wall of clicks. */
  play(name: SoundName): void {
    if (!this.ready || this.muted) return;
    const now = performance.now(), gap = name === 'attack' ? 45 : name === 'death' ? 80 : 0;
    if (gap && now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    switch (name) {
      case 'attack': this.burst(0.05, 0.25, 1800 + Math.random() * 800); break;
      case 'death': this.tone(220, 0.18, 'square', 0.18, 0.4); this.burst(0.12, 0.2, 500); break;
      case 'build': this.tone(660, 0.08, 'square', 0.15); this.tone(880, 0.1, 'square', 0.15, 1, 0.08); break;
      case 'capture': this.tone(523, 0.1, 'triangle', 0.2); this.tone(659, 0.1, 'triangle', 0.2, 1, 0.1); this.tone(784, 0.16, 'triangle', 0.2, 1, 0.2); break;
      case 'warning': this.tone(330, 0.16, 'sawtooth', 0.18, 0.8); this.tone(330, 0.16, 'sawtooth', 0.18, 0.8, 0.22); break;
      case 'victory': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, 1, i * 0.14)); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.16, 0.9, i * 0.2)); break;
      case 'click': this.tone(1200, 0.03, 'square', 0.08); break;
    }
  }
}

export const synth = new Synth();
