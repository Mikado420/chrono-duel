/**
 * Sound: synthesized effects plus streamed background music. Everything starts silent until the first user gesture
 * (browsers do not allow sound before one), so `unlock` is called from every tap.
 *
 * BGM streams from <audio> elements routed through Web Audio, which gives iOS a working volume and lets two decks
 * crossfade. Tracks are loaded only when played, so they cost no download until needed.
 */
export type BgmScene = 'title' | 'home' | 'battle';
const BGM: Record<BgmScene, string[]> = {
  title: ['title_azure_core'],
  home: ['home_tsuki_no_furu_machi'],
  battle: ['battle_crystal_brilliance', 'battle_crystal_reverie', 'battle_crystal_afterimage'],
};
/** AAC plays in every major browser; builds without it (open-source Chromium, some Linux browsers) get Opus. */
let bgmExt = '';
const bgmUrl = (t: string) => {
  bgmExt ||= document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"') ? 'm4a' : 'ogg';
  return `./bgm/${t}.${bgmExt}`;
};
const FADE = 1.2;

type Sfx = 'tick' | 'bell' | 'summon' | 'hit' | 'heavyHit' | 'base' | 'destroy' | 'cast' | 'reserve' | 'reveal' | 'draw' | 'select' | 'deny' | 'heal' | 'doom' | 'win' | 'lose' | 'clock' | 'echo'
  | 'tear' | 'burst' | 'flip' | 'rareR' | 'rareE' | 'rareL' | 'coin' | 'charge';

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private decks: { el: HTMLAudioElement; g: GainNode; track: string }[] = [];
  private live = 0;
  private scene: BgmScene | null = null;
  private lastBattle = '';
  /** The battle track the next battle will use, chosen early so it can be downloaded in advance. */
  private nextBattle = '';
  private warmed = new Set<string>();
  private hidden = false;
  volume = 0.7;
  bgmVolume = 0.5;
  muted = false;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicLevel();
      this.music.connect(this.ctx.destination);
      document.addEventListener('visibilitychange', () => this.onVisibility());
    } catch { this.ctx = null; }
    // the scene asked for music before sound was allowed: start it inside this gesture
    if (this.scene) this.startWanted();
  }
  /** Whether background music is actually sounding (the title uses this to know if its first tap only woke the sound). */
  get musicOn() { const d = this.decks[this.live]; return !!d && !d.el.paused && this.musicLevel() > 0; }
  setVolume(v: number) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }
  setBgmVolume(v: number) { this.bgmVolume = v; this.applyMusicLevel(); }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; this.applyMusicLevel(); }
  private musicLevel() { return this.muted ? 0 : this.bgmVolume * 0.9; }
  private applyMusicLevel() {
    if (!this.music || !this.ctx) return;
    this.music.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, 0.05);
    if (this.musicLevel() > 0 && this.scene) this.startWanted();
  }

  // ------------------------------------------------------------------ music
  /**
   * Switches the background music to a scene. Battles pick one of their tracks at random and move on to another when it
   * ends; `fresh` picks a new one even if a battle track is already playing (each new battle).
   */
  bgm(scene: BgmScene | null, fresh = false) {
    if (scene === this.scene && !fresh) { if (scene) this.startWanted(); return; }
    this.scene = scene;
    this.prefetchFor(scene);
    if (!this.ctx) return;
    if (!scene) { this.fadeOutAll(); return; }
    this.crossfadeTo(this.pick(scene));
  }
  private pick(scene: BgmScene): string {
    if (scene !== 'battle') return BGM[scene][0];
    const t = this.peekBattle();
    this.lastBattle = t;
    this.nextBattle = '';
    return t;
  }
  private peekBattle(): string {
    if (!this.nextBattle) {
      const pool = BGM.battle.filter((t) => t !== this.lastBattle);
      this.nextBattle = pool[Math.floor(Math.random() * pool.length)];
    }
    return this.nextBattle;
  }
  /**
   * Downloads the music the player is about to hear into the browser cache, so it starts at once instead of streaming
   * from nothing when the scene changes (the slow part on phones). Loading needs no gesture, only playing does.
   */
  private prefetchFor(scene: BgmScene | null) {
    const later = (ms: number, t: () => string) => setTimeout(() => this.warm(t()), ms);
    if (scene === 'title') { this.warm(BGM.title[0]); later(2500, () => BGM.home[0]); }
    if (scene === 'home') { this.warm(BGM.home[0]); later(3000, () => this.peekBattle()); }
    if (scene === 'battle') later(20000, () => this.peekBattle());
  }
  private warm(track: string) {
    const u = bgmUrl(track);
    if (this.warmed.has(u)) return;
    this.warmed.add(u);
    fetch(u).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))).catch(() => this.warmed.delete(u));
  }
  private deck(i: number) {
    while (this.decks.length <= i) {
      const el = document.createElement('audio');
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      const g = this.ctx!.createGain();
      g.gain.value = 0;
      this.ctx!.createMediaElementSource(el).connect(g).connect(this.music!);
      const d = { el, g, track: '' };
      el.addEventListener('ended', () => { if (this.decks[this.live] === d && this.scene === 'battle') this.crossfadeTo(this.pick('battle'), true); });
      this.decks.push(d);
    }
    return this.decks[i];
  }
  private crossfadeTo(track: string, instant = false) {
    const c = this.ctx!, now = c.currentTime;
    const old = this.decks[this.live];
    if (old?.track === track && !old.el.paused) return;
    // fade in only when replacing a track that is sounding; from silence the music should start right away
    const fadeIn = instant || !old || old.el.paused ? 0.25 : FADE;
    this.live = old ? 1 - this.live : 0;
    const d = this.deck(this.live);
    if (old) {
      old.g.gain.cancelScheduledValues(now);
      old.g.gain.setValueAtTime(old.g.gain.value, now);
      old.g.gain.linearRampToValueAtTime(0, now + FADE * 0.8);
      const el = old.el;
      setTimeout(() => { if (this.decks[this.live]?.el !== el) el.pause(); }, FADE * 1000 + 100);
    }
    d.track = track;
    d.el.src = bgmUrl(track);
    d.el.loop = this.scene !== 'battle';
    d.g.gain.cancelScheduledValues(now);
    d.g.gain.setValueAtTime(0, now);
    d.g.gain.linearRampToValueAtTime(1, now + fadeIn);
    this.playEl(d.el);
  }
  private startWanted() {
    if (!this.ctx || !this.scene || this.hidden) return;
    void this.ctx.resume();
    const d = this.decks[this.live];
    if (!d?.track) { this.crossfadeTo(this.pick(this.scene)); return; }
    if (d.el.paused) { d.g.gain.setValueAtTime(1, this.ctx.currentTime); this.playEl(d.el); }
  }
  private playEl(el: HTMLAudioElement) {
    if (this.hidden) return;
    // blocked without a gesture on some browsers; the next tap calls unlock → startWanted and tries again
    el.play().catch(() => {});
  }
  private fadeOutAll() {
    const now = this.ctx!.currentTime;
    for (const d of this.decks) { d.g.gain.cancelScheduledValues(now); d.g.gain.setValueAtTime(d.g.gain.value, now); d.g.gain.linearRampToValueAtTime(0, now + FADE); const el = d.el; setTimeout(() => { if (!this.scene) el.pause(); }, FADE * 1000 + 100); }
  }
  private onVisibility() {
    this.hidden = document.visibilityState === 'hidden';
    if (this.hidden) { for (const d of this.decks) d.el.pause(); return; }
    this.startWanted();
  }

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
