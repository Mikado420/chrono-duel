/** Synthesized sound effects (no audio files, no licensing). Starts silent until the first user gesture. */
type Sfx = 'tick' | 'bell' | 'summon' | 'hit' | 'heavyHit' | 'base' | 'destroy' | 'cast' | 'reserve' | 'reveal' | 'draw' | 'select' | 'deny' | 'heal' | 'doom' | 'win' | 'lose' | 'clock' | 'echo'
  | 'tear' | 'burst' | 'flip' | 'rareR' | 'rareE' | 'rareL' | 'coin' | 'charge';

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.7;
  muted = false;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  setVolume(v: number) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slide?: number) {
    const c = this.ctx!, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, gain: number, freq = 1200, when = 0, q = 1) {
    const c = this.ctx!, t = c.currentTime + when;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
  }
  play(name: Sfx) {
    if (!this.ctx || !this.master || this.muted) return;
    switch (name) {
      case 'tick': this.noise(0.03, 0.35, 4200, 0, 8); this.tone(2400, 0.03, 'square', 0.02); break;
      case 'clock': this.tone(300, 0.35, 'sawtooth', 0.06, 0, 90); this.noise(0.3, 0.2, 600); break;
      case 'bell':
        [523.25, 1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => this.tone(f, 1.8 - i * 0.25, 'sine', 0.12 / (i + 1)));
        break;
      case 'summon': this.tone(180, 0.25, 'triangle', 0.25, 0, 90); this.noise(0.25, 0.4, 300); this.tone(660, 0.18, 'sine', 0.05, 0.05); break;
      case 'hit': this.noise(0.12, 0.6, 1800, 0, 2); this.tone(140, 0.12, 'square', 0.1, 0, 60); break;
      case 'heavyHit': this.noise(0.3, 0.8, 500, 0, 1); this.tone(90, 0.35, 'sawtooth', 0.2, 0, 40); break;
      case 'base': this.noise(0.4, 0.8, 350, 0, 0.8); this.tone(70, 0.5, 'sine', 0.35, 0, 35); break;
      case 'destroy': this.noise(0.5, 0.5, 2600, 0, 0.7); this.tone(400, 0.4, 'triangle', 0.1, 0, 80); break;
      case 'cast': this.tone(440, 0.4, 'sine', 0.1, 0, 1320); this.tone(660, 0.4, 'sine', 0.06, 0.05, 1760); break;
      case 'reserve': this.tone(880, 0.12, 'sine', 0.1); this.tone(1320, 0.3, 'sine', 0.08, 0.08); this.noise(0.08, 0.2, 5000, 0.08, 6); break;
      case 'reveal': this.tone(220, 0.6, 'sawtooth', 0.06, 0, 880); this.tone(1760, 0.5, 'sine', 0.08, 0.25); break;
      case 'draw': this.noise(0.08, 0.25, 3000, 0, 1.5); break;
      case 'select': this.tone(1200, 0.05, 'sine', 0.06); break;
      case 'deny': this.tone(200, 0.12, 'square', 0.06); this.tone(150, 0.14, 'square', 0.06, 0.08); break;
      case 'heal': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.07, i * 0.07)); break;
      case 'doom': this.tone(55, 1.6, 'sawtooth', 0.25, 0, 40); this.tone(58, 1.6, 'sawtooth', 0.2); this.noise(1.2, 0.3, 200); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.12, i * 0.12)); break;
      case 'echo': [880, 1320].forEach((f, i) => { this.tone(f, 0.5, 'sine', 0.05, i * 0.09); this.tone(f, 0.4, 'sine', 0.025, 0.22 + i * 0.09); }); break;
      case 'tear': this.noise(0.45, 0.5, 2400, 0, 0.6); this.noise(0.3, 0.3, 5200, 0.12, 1.2); break;
      case 'burst': this.tone(110, 0.9, 'sawtooth', 0.12, 0, 55); this.noise(0.8, 0.45, 900, 0, 0.5); [523, 784, 1047].forEach((f, i) => this.tone(f, 1.2, 'triangle', 0.06, 0.08 + i * 0.05)); break;
      case 'flip': this.noise(0.09, 0.35, 3600, 0, 1.4); this.tone(1400, 0.05, 'sine', 0.03); break;
      case 'rareR': [784, 1175].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.08, i * 0.06)); break;
      case 'rareE': [587, 880, 1175, 1480].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.08, i * 0.07)); this.noise(0.5, 0.15, 6000, 0.2, 2); break;
      case 'rareL':
        this.tone(65, 1.6, 'sawtooth', 0.14, 0, 130);
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.tone(f, 2.2 - i * 0.2, 'triangle', 0.1, 0.1 + i * 0.09));
        [2093, 2637].forEach((f, i) => this.tone(f, 1.6, 'sine', 0.05, 0.7 + i * 0.12));
        break;
      case 'coin': this.tone(1568, 0.08, 'square', 0.04); this.tone(2093, 0.25, 'square', 0.04, 0.07); break;
      case 'charge': this.tone(220, 0.5, 'sawtooth', 0.06, 0, 880); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.1, i * 0.18)); break;
    }
  }
}
export const audio = new Audio();
