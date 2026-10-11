/**
 * Theme effects: what the clock face and the playmat do when a bell rings, when doom comes, and on a few other
 * moments (a reservation firing, an echo, the clock being pushed, a heavy hit on a base).
 *
 * Every effect sits under the board: on the dial it is drawn below the ticks, numbers, hands and pins; on the mat
 * below the lanes and the cards. Nothing goes above 40% opacity and nothing shakes the screen. Bells and doom have
 * a form of their own for each theme; the other four share one form in the theme's colour.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { RULES } from '../core/rules';

// ------------------------------------------------------------------ shared textures
let glowTex: Texture | null = null;
/** A soft white disc (tinted for glows). */
function glow(): Texture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return (glowTex = Texture.from(cv));
}
let puffTex: Texture | null = null;
function puff(): Texture {
  if (puffTex) return puffTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(240,236,228,.9)'); g.addColorStop(1, 'rgba(240,236,228,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return (puffTex = Texture.from(cv));
}

// ------------------------------------------------------------------ shapes
type Shape = 'petal' | 'spark' | 'flower' | 'puff' | 'dot' | 'shard' | 'star';
function shape(kind: Shape, color: number, size: number): Container {
  if (kind === 'puff') { const s = new Sprite(puff()); s.anchor.set(0.5); s.width = s.height = size * 2; return s; }
  const g = new Graphics();
  switch (kind) {
    case 'petal': g.ellipse(0, 0, size, size * 0.62).fill(color).ellipse(-size * 0.3, -size * 0.15, size * 0.4, size * 0.2).fill({ color: 0xffffff, alpha: 0.35 }); break;
    case 'spark': g.rect(-size * 1.8, -size * 0.3, size * 3.6, size * 0.6).fill(color); g.blendMode = 'add'; break;
    case 'flower': for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.ellipse(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55, size * 0.55, size * 0.36).fill(color); }
      g.circle(0, 0, size * 0.22).fill(0xffd27a); g.blendMode = 'add'; break;
    case 'shard': g.poly([0, -size * 1.5, size * 0.8, 0, 0, size * 1.5, -size * 0.6, 0]).fill(color); g.blendMode = 'add'; break;
    case 'star': g.poly([0, -size, size * 0.22, -size * 0.22, size, 0, size * 0.22, size * 0.22, 0, size, -size * 0.22, size * 0.22, -size, 0, -size * 0.22, -size * 0.22]).fill(color); g.blendMode = 'add'; break;
    default: g.circle(0, 0, size).fill(color); g.blendMode = 'add';
  }
  return g;
}

interface Part { o: Container; x: number; y: number; vx: number; vy: number; ax: number; ay: number; vr: number; age: number; life: number; a: number; sway: number; ph: number }
type Anim = (dt: number) => boolean;

/** The colours and forms of each theme (by theme id, see lookArt.ts). */
export interface ThemeStyle { col: number; acc: number; doom: number }
export const THEME_STYLE: Record<string, ThemeStyle> = {
  skeleton: { col: 0xff4a66, acc: 0xf6dc98, doom: 0xd6334a },
  astro: { col: 0xfff3c4, acc: 0x9ab8ff, doom: 0xff4a4a },
  steam: { col: 0xffd2a8, acc: 0xffffff, doom: 0xe0483a },
  wadokei: { col: 0xff8ab4, acc: 0xf0cc80, doom: 0xd8203e },
  compass: { col: 0xffe8a0, acc: 0xbfc8ff, doom: 0x000000 },
  forge: { col: 0xffb347, acc: 0xfff2c0, doom: 0xff5a10 },
  archive: { col: 0xff9a8a, acc: 0xf0cc80, doom: 0xa01a2a },
  cathedral: { col: 0xbff0ff, acc: 0xffffff, doom: 0xe8f8ff },
};

/** Particles and short animations, run by the owner's tick. */
class Layer extends Container {
  protected parts: Part[] = [];
  protected anims: Anim[] = [];
  protected t = 0;
  protected add(kind: Shape, color: number, size: number, x: number, y: number, o: Partial<Omit<Part, 'o'>> = {}) {
    if (this.parts.length > 90) return;
    const s = shape(kind, color, size);
    s.x = x; s.y = y; s.alpha = 0; s.rotation = Math.random() * Math.PI * 2;
    this.addChild(s);
    this.parts.push({ o: s, x, y, vx: 0, vy: 0, ax: 0, ay: 0, vr: 0, age: 0, life: 1.5, a: 0.4, sway: 0, ph: Math.random() * 6, ...o });
  }
  protected glowAt(x: number, y: number, r: number, color: number, peak = 0.4, dur = 0.9, delay = 0) {
    const s = new Sprite(glow()); s.anchor.set(0.5); s.x = x; s.y = y; s.width = s.height = r * 2; s.tint = color; s.blendMode = 'add'; s.alpha = 0;
    this.addChild(s);
    let t = -delay;
    this.anims.push((dt) => {
      t += dt; if (t < 0) return true;
      const k = t / dur;
      if (k >= 1) { s.destroy(); return false; }
      s.alpha = peak * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      s.scale.set(((r * 2) / 128) * (0.85 + 0.25 * k));
      return true;
    });
  }
  protected ring(x: number, y: number, r0: number, r1: number, color: number, width: number, dur: number, opts: { delay?: number; dotted?: boolean; ry?: number; peak?: number } = {}) {
    const g = new Graphics(); g.blendMode = 'add'; this.addChild(g);
    let t = -(opts.delay ?? 0);
    this.anims.push((dt) => {
      t += dt; if (t < 0) return true;
      const k = t / dur;
      if (k >= 1) { g.destroy(); return false; }
      const e = 1 - Math.pow(1 - k, 3), r = r0 + (r1 - r0) * e, a = (opts.peak ?? 0.4) * (1 - k);
      g.clear();
      const ry = opts.ry ? opts.ry * (r / r1) : r;
      if (opts.dotted) {
        const n = Math.max(12, Math.round(r / 4));
        for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; g.circle(x + Math.cos(an) * r, y + Math.sin(an) * ry, width * 0.6).fill({ color, alpha: a }); }
      } else g.ellipse(x, y, r, ry).stroke({ color, width: width * (1 - k * 0.7), alpha: a });
      return true;
    });
  }
  /** A bright head with a tail running from one point to another (shooting star, light along a crack). */
  protected streak(pts: { x: number; y: number }[], color: number, dur: number, width = 3, tail = 0.25, peak = 0.4) {
    const g = new Graphics(); g.blendMode = 'add'; this.addChild(g);
    const seg: number[] = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = seg[seg.length - 1] || 1;
    const at = (d: number) => {
      d = Math.max(0, Math.min(L, d));
      let i = 1; while (i < seg.length - 1 && seg[i] < d) i++;
      const k = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    };
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const k = t / dur;
      if (k >= 1.25) { g.destroy(); return false; }
      g.clear();
      const head = Math.min(1, k) * L, back = Math.max(0, k - tail) * L;
      const n = 10, fade = k > 1 ? 1 - (k - 1) / 0.25 : 1;
      for (let i = 0; i < n; i++) {
        const a = at(back + ((head - back) * i) / n), b = at(back + ((head - back) * (i + 1)) / n);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width: width * (0.3 + (0.7 * i) / n), alpha: peak * fade * ((i + 1) / n), cap: 'round' });
      }
      const hp = at(head);
      g.circle(hp.x, hp.y, width * 1.6).fill({ color: 0xffffff, alpha: peak * fade });
      return true;
    });
  }
  step(ms: number) {
    const dt = Math.min(0.1, ms / 1000);
    this.t += dt;
    this.anims = this.anims.filter((a) => a(dt));
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { p.o.destroy(); this.parts.splice(i, 1); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.o.x = p.x + Math.sin(p.age * 2.2 + p.ph) * p.sway; p.o.y = p.y;
      p.o.rotation += p.vr * dt;
      const k = p.age / p.life;
      p.o.alpha = p.a * Math.min(1, k * 6) * Math.min(1, (1 - k) * 3);
    }
  }
}

// ================================================================== the clock face
/** The dial's frame: centre, radius and where a time sits (Dial.point). */
export interface DialFrame { cx: number; cy: number; R: number; point(t: number, r: number): { x: number; y: number } }
/** A point of the face designs (600×320, centre 300,304) on the board. */
const S = 1.032;
const B = (f: DialFrame, x: number, y: number) => ({ x: f.cx + (x - 300) * S, y: f.cy + (y - 304) * S });

export class DialFx extends Layer {
  private st: ThemeStyle;
  private doomLv = 0;
  private doomG = new Graphics();
  private doomFrom: number = RULES.DOOM_AT;
  private amb = 0;
  private mask_: Graphics;
  constructor(private theme: string, private f: DialFrame, private motion = true) {
    super();
    this.st = THEME_STYLE[theme] ?? THEME_STYLE.skeleton;
    // effects stay on the face (inside the outer rim)
    this.mask_ = new Graphics().moveTo(f.cx - f.R - 24, f.cy).arc(f.cx, f.cy, f.R + 24, Math.PI, Math.PI * 2).closePath().fill(0xffffff);
    this.addChild(this.mask_, this.doomG);
    this.mask = this.mask_;
  }
  setDoomFrom(t: number) { this.doomFrom = t; }
  /** The doom level without the moment of colour (a game picked up mid-way). */
  setLevel(level: number) { this.doomLv = level; }
  private bellPos(at: number) { return this.f.point(at, this.f.R - 40); }

  bell(at: number) {
    if (!this.motion) return;
    const p = this.bellPos(at), { col, acc } = this.st, big = at === 16 || at === 32;
    const R = this.f.R;
    switch (this.theme) {
      case 'skeleton':
        this.glowAt(p.x, p.y, big ? 70 : 56, col, 0.4, 0.9);
        for (const b of RULES.BELLS) if (b !== at) { const q = this.bellPos(b); this.glowAt(q.x, q.y, 34, col, 0.28, 0.8, 0.18); }
        break;
      case 'astro': {
        this.ring(p.x, p.y, 10, big ? 90 : 70, acc, 3, 0.9);
        this.glowAt(p.x, p.y, 50, col, 0.35, 0.8);
        const y0 = this.f.cy - R * (0.55 + Math.random() * 0.25);
        this.streak([{ x: this.f.cx - R * 0.75, y: y0 }, { x: this.f.cx + R * 0.35, y: y0 + R * 0.28 }], 0xfff6d8, 0.7, 2.6, 0.3);
        break;
      }
      case 'steam': {
        this.ring(p.x, p.y, 10, 64, col, 3, 0.8);
        // the screw turns an eighth
        const g = new Graphics();
        g.circle(0, 0, 13).fill({ color: 0xe0a860, alpha: 0.95 }).circle(0, 0, 13).stroke({ color: 0x6a3a14, width: 1.5 });
        g.rect(-8, -2.5, 16, 5).fill(0x2a1406).rect(-2.5, -8, 5, 16).fill(0x2a1406);
        g.x = p.x; g.y = p.y; g.scale.set(big ? 1.1 : 0.92); this.addChild(g);
        let t = 0;
        this.anims.push((dt) => { t += dt; const k = Math.min(1, t / 0.5); g.rotation = (Math.PI / 4) * (1 - Math.pow(1 - k, 3)); g.alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3); if (t >= 1) { g.destroy(); return false; } return true; });
        for (let i = 0; i < 5; i++) this.add('puff', 0xffffff, 14 + Math.random() * 8, p.x + (Math.random() - 0.5) * 10, p.y - 6, { vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, life: 1.4, a: 0.35, vr: 0 });
        break;
      }
      case 'wadokei': {
        this.glowAt(p.x, p.y, big ? 64 : 52, col, 0.4, 1);
        const moon = B(this.f, 300, 150);
        this.glowAt(moon.x, moon.y, 130, acc, 0.22, 1.1, 0.1);
        for (let i = 0; i < 12; i++) this.add('petal', i % 3 ? 0xffc0d8 : 0xff8ab4, 4 + Math.random() * 2.5, p.x, p.y, { vx: 50 + Math.random() * 90, vy: -30 - Math.random() * 60, ay: 40, vr: (Math.random() - 0.5) * 6, life: 1.6 + Math.random() * 0.6, a: 0.85, sway: 6 });
        break;
      }
      case 'compass': {
        this.glowAt(p.x, p.y, big ? 60 : 48, col, 0.4, 0.9);
        for (let i = 0; i < 7; i++) this.add('flower', 0xfff4cc, 3 + Math.random() * 3, p.x + (Math.random() - 0.5) * 20, p.y, { vy: -30 - Math.random() * 40, vr: (Math.random() - 0.5) * 2, life: 1.8 + Math.random() * 0.8, a: 0.8, sway: 8 });
        // light runs along the whale's back
        this.streak([B(this.f, 110, 186), B(this.f, 190, 150), B(this.f, 300, 128), B(this.f, 380, 126), B(this.f, 470, 150)], 0xd8e0ff, 0.9, 2.4, 0.35, 0.35);
        break;
      }
      case 'forge':
        this.glowAt(p.x, p.y, big ? 64 : 52, 0xfff2c0, 0.4, 0.7);
        this.glowAt(p.x, p.y, 40, col, 0.35, 0.9);
        for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120; this.add('spark', i % 2 ? 0xffd27a : 0xff8a3a, 2 + Math.random() * 1.5, p.x, p.y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, ay: 160, life: 0.6 + Math.random() * 0.4, a: 1 }); }
        break;
      case 'archive':
        this.ring(p.x, p.y, 10, big ? 80 : 64, 0xffd0a0, 3, 0.9);
        this.glowAt(p.x, p.y, 44, col, 0.3, 0.8);
        for (let i = 0; i < 5; i++) this.add('petal', 0xc8202e, 3.5 + Math.random() * 2, p.x + (Math.random() - 0.5) * 16, p.y, { vx: (Math.random() - 0.5) * 40, vy: 10 + Math.random() * 20, ay: 20, vr: (Math.random() - 0.5) * 4, life: 1.6, a: 0.8, sway: 10 });
        break;
      case 'cathedral': {
        this.glowAt(p.x, p.y, big ? 60 : 50, col, 0.4, 0.8);
        const g = new Graphics(); g.blendMode = 'add'; g.x = p.x; g.y = p.y; this.addChild(g);
        let t = 0;
        this.anims.push((dt) => { t += dt; const k = t / 0.8; if (k >= 1) { g.destroy(); return false; } const r = 16 + 26 * k; g.clear(); const pts: number[] = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; pts.push(Math.cos(a) * r, Math.sin(a) * r); } g.poly(pts).stroke({ color: col, width: 2.5 * (1 - k) + 0.5, alpha: 0.4 * (1 - k) }); return true; });
        // light from the core along the blade toward this bell
        const c = { x: this.f.cx, y: this.f.cy - 10 };
        this.streak([c, p], 0xffffff, 0.45, 3, 0.4, 0.38);
        break;
      }
      default:
        this.ring(p.x, p.y, 8, 80, col, 3, 0.8);
    }
  }

  /** Doom starting or rising a step: a moment of colour, then a slow breathing that stays. */
  doom(level: number) {
    this.doomLv = level;
    if (!this.motion) return;
    const { cx, cy, R } = this.f;
    const d = this.st.doom;
    switch (this.theme) {
      case 'compass': this.flashFace(0x000000, 0.35, 1.5); break;
      case 'cathedral': this.flashRim(0xffffff, 0.4, 1.5, 34); for (let i = 0; i < 14; i++) { const t = this.doomFrom + Math.random() * (RULES.END - this.doomFrom); const q = this.f.point(t, R + 6); this.add('star', 0xffffff, 3 + Math.random() * 3, q.x, q.y, { life: 1.2, a: 0.8, vr: 1 }); } break;
      case 'steam': this.flashRim(d, 0.35, 1.5, 22); for (let i = 0; i < 10; i++) { const t = this.doomFrom + Math.random() * (RULES.END - this.doomFrom); const q = this.f.point(t, R + 4); this.add('puff', 0xffffff, 16 + Math.random() * 10, q.x, q.y, { vx: (q.x - cx) * 0.15, vy: (q.y - cy) * 0.15 - 10, life: 1.6, a: 0.32 }); } break;
      case 'forge': this.flashRim(0xff7a1a, 0.4, 1.5, 40); for (let i = 0; i < 24; i++) { const t = this.doomFrom + Math.random() * (RULES.END - this.doomFrom); const q = this.f.point(t, R + 8); this.add('spark', 0xffc46b, 2, q.x, q.y, { vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, ay: 50, life: 1, a: 1 }); } break;
      case 'wadokei': { this.flashFace(d, 0.3, 1.5); const m = B(this.f, 300, 150); this.glowAt(m.x, m.y, 120, 0xff4040, 0.35, 1.5); break; }
      default: this.flashRim(d, 0.4, 1.5, 30); this.flashFace(d, 0.18, 1.5);
    }
    void cy;
  }
  private flashFace(color: number, peak: number, dur: number) {
    const { cx, cy, R } = this.f;
    const g = new Graphics().moveTo(cx - R - 24, cy).arc(cx, cy, R + 24, Math.PI, Math.PI * 2).closePath().fill(color);
    g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; const k = t / dur; if (k >= 1) { g.destroy(); return false; } g.alpha = peak * Math.sin(Math.PI * k); return true; });
  }
  private flashRim(color: number, peak: number, dur: number, w: number) {
    const { cx, cy, R } = this.f;
    const a0 = Math.PI + (Math.min(this.doomFrom, RULES.END) / RULES.END) * Math.PI;
    const g = new Graphics(); g.blendMode = 'add';
    for (let i = 0; i < 4; i++) g.arc(cx, cy, R + 4 - i * (w / 5), a0, Math.PI * 2).stroke({ color, width: w / 3, alpha: 0.5 - i * 0.1 });
    g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; const k = t / dur; if (k >= 1) { g.destroy(); return false; } g.alpha = peak * 2 * Math.sin(Math.PI * k); return true; });
  }
  /** The lasting doom tint, breathing slowly. */
  private drawDoom() {
    const g = this.doomG.clear();
    if (!this.doomLv) return;
    const { cx, cy, R } = this.f;
    const br = 0.5 + 0.5 * Math.sin(this.t * 1.6);
    const lv = Math.min(3, this.doomLv);
    const a0 = Math.PI + (Math.min(this.doomFrom, RULES.END) / RULES.END) * Math.PI;
    const face = () => g.moveTo(cx - R - 24, cy).arc(cx, cy, R + 24, Math.PI, Math.PI * 2).closePath();
    switch (this.theme) {
      case 'skeleton':
        for (const b of RULES.BELLS) { const q = this.bellPos(b); g.circle(q.x, q.y, 20).fill({ color: 0xff2040, alpha: (0.1 + 0.08 * br) * lv / 2 }); }
        break;
      case 'astro': case 'wadokei': case 'archive':
        face().fill({ color: this.st.doom, alpha: (0.05 + 0.04 * br) * lv }); break;
      case 'compass':
        face().fill({ color: 0x000000, alpha: (0.1 + 0.05 * br) * lv }); break;
      case 'cathedral':
        for (let i = 0; i < 3; i++) g.arc(cx, cy, R + 8 - i * 9, a0, Math.PI * 2).stroke({ color: 0xffffff, width: 10, alpha: (0.05 + 0.03 * br) * lv * (1 - i * 0.3) });
        break;
      case 'forge':
        for (let i = 0; i < 3; i++) g.arc(cx, cy, R + 8 - i * 10, a0, Math.PI * 2).stroke({ color: 0xff6a1a, width: 12, alpha: (0.06 + 0.05 * br) * lv * (1 - i * 0.3) });
        break;
      default:
        g.arc(cx, cy, R + 4, a0, Math.PI * 2).stroke({ color: this.st.doom, width: 14, alpha: (0.06 + 0.04 * br) * lv });
    }
  }

  // ---------------------------------------------------------- the four shared effects
  /** A reservation fires: its pin flashes and a dotted line runs to the centre. */
  trigger(at: { x: number; y: number }) {
    if (!this.motion) return;
    const { cx, cy } = this.f, c = this.st.col;
    this.glowAt(at.x, at.y, 46, c, 0.4, 0.8);
    const g = new Graphics(); g.blendMode = 'add'; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => {
      t += dt; const k = t / 0.8; if (k >= 1) { g.destroy(); return false; }
      g.clear();
      const n = 16, reach = Math.min(1, k * 2);
      for (let i = 0; i < n * reach; i++) { const q = i / n; g.circle(at.x + (cx - at.x) * q, at.y + (cy - at.y) * q, 2).fill({ color: c, alpha: 0.4 * (1 - k) }); }
      return true;
    });
  }
  echo(at: { x: number; y: number }) {
    if (!this.motion) return;
    for (let i = 0; i < 3; i++) this.ring(at.x, at.y, 6, 60 + i * 20, this.st.acc, 2, 0.7, { delay: i * 0.12, dotted: true, peak: 0.35 });
  }
  /** The clock was pushed: light runs along the stretch it moved. */
  clock(from: number, to: number) {
    if (!this.motion || from === to) return;
    const pts: { x: number; y: number }[] = [];
    const n = Math.max(2, Math.ceil(Math.abs(to - from) * 2));
    for (let i = 0; i <= n; i++) pts.push(this.f.point(from + ((to - from) * i) / n, this.f.R - 8));
    this.streak(pts, 0x9fe6ff, 0.6, 4, 0.6, 0.4);
  }
  /** A heavy hit on a base: the rim flushes red for a moment. */
  hit() {
    if (!this.motion) return;
    const { cx, cy, R } = this.f;
    const g = new Graphics(); g.blendMode = 'add';
    g.arc(cx, cy, R + 22, Math.PI, Math.PI * 2).stroke({ color: 0xff3a2a, width: 8 });
    g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; const k = t / 0.6; if (k >= 1) { g.destroy(); return false; } g.alpha = 0.4 * Math.sin(Math.PI * k); return true; });
  }

  tick(ms: number) {
    this.step(ms);
    if (this.doomLv) this.drawDoom();
    if (!this.motion) return;
    // ambient: petals drift over the night sky, flowers rise in the sea, frost glints on the ice
    const dt = ms / 1000, { cx, cy, R } = this.f;
    this.amb += dt;
    const every = this.theme === 'wadokei' ? 0.7 : this.theme === 'compass' ? 0.9 : this.theme === 'cathedral' ? 0.5 : 0;
    if (!every || this.amb < every) return;
    this.amb = 0;
    if (this.theme === 'wadokei') this.add('petal', this.doomLv ? 0xff5a7a : 0xffc0d8, 3 + Math.random() * 2, cx - R + Math.random() * R * 1.4, cy - R * (0.6 + Math.random() * 0.3), { vx: 18 + Math.random() * 16, vy: 14 + Math.random() * 10, vr: (Math.random() - 0.5) * 3, life: 6, a: 0.55, sway: 8 });
    else if (this.theme === 'compass') this.add('flower', 0xfff4cc, 2.4 + Math.random() * 2, cx - R * 0.8 + Math.random() * R * 1.6, cy - 10, { vy: -16 - Math.random() * 10, vr: (Math.random() - 0.5), life: 7, a: 0.45, sway: 10 });
    else { const a = Math.PI + Math.random() * Math.PI, r = 40 + Math.random() * (R - 20); this.add('star', 0xffffff, 2 + Math.random() * 2.5, cx + Math.cos(a) * r, cy + Math.sin(a) * r, { life: 0.9, a: 0.5, vr: 0.6 }); }
  }
}

// ================================================================== the playmat
/** Mat space: x 0–390, y 366 (front line) – 780. Points of the mat designs (390×414) sit 366 lower. */
const M = (x: number, y: number) => ({ x, y: y + 366 });

export class MatFx extends Layer {
  private st: ThemeStyle;
  private doomLv = 0;
  private doomG = new Graphics();
  private amb = 0;
  private cracks = new Graphics();
  constructor(private theme: string, private motion = true) {
    super();
    this.st = THEME_STYLE[theme] ?? THEME_STYLE.skeleton;
    const m = new Graphics().rect(0, 366, 390, 414).fill(0xffffff);
    this.addChild(m, this.doomG, this.cracks);
    this.mask = m;
  }

  setLevel(level: number) { this.doomLv = level; }
  bell() {
    if (!this.motion) return;
    const { col, acc } = this.st;
    switch (this.theme) {
      case 'skeleton':
        this.streak([M(-20, 230), M(410, 230)], acc, 0.9, 3, 0.5, 0.3);
        for (const [x, y] of [[372, 58], [40, 420], [178, 384], [352, 390]]) { const q = M(x, y); this.glowAt(q.x, q.y, 30, col, 0.32, 0.9, 0.2); }
        break;
      case 'astro': { const y = 220 + Math.random() * 80; this.streak([M(-20, y), M(300, y + 90)], 0xfff6d8, 0.8, 2.6, 0.3); this.glowAt(195, 676, 60, col, 0.25, 1); break; }
      case 'steam':
        for (const v of [M(30, 108), M(360, 308), M(200, 400)]) for (let i = 0; i < 4; i++) this.add('puff', 0xffffff, 18 + Math.random() * 10, v.x, v.y, { vx: (Math.random() - 0.5) * 24, vy: -30 - Math.random() * 20, life: 1.6, a: 0.32 });
        break;
      case 'wadokei':
        for (let i = 0; i < 14; i++) this.add('petal', i % 3 ? 0xffc0d8 : 0xff8ab4, 4 + Math.random() * 3, -10, 400 + Math.random() * 300, { vx: 120 + Math.random() * 80, vy: -10 + Math.random() * 20, vr: (Math.random() - 0.5) * 6, life: 3.2, a: 0.75, sway: 10 });
        this.glowAt(195, 706, 120, acc, 0.18, 1.1);
        break;
      case 'compass': this.ring(M(195, 384).x, M(195, 384).y, 10, 170, 0xd8e0ff, 2, 1.4, { ry: 22, peak: 0.4 }); this.ring(M(320, 384).x, M(320, 384).y, 4, 40, 0xffe8a0, 1.5, 1, { ry: 6, delay: 0.2 }); break;
      case 'forge': { const f = M(70, 280); for (let i = 0; i < 22; i++) this.add('spark', i % 2 ? 0xffd27a : 0xff8a3a, 2.2, f.x + (Math.random() - 0.5) * 60, f.y, { vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 120, ay: 140, life: 0.9 + Math.random() * 0.5, a: 1 }); this.glowAt(f.x, f.y + 40, 120, col, 0.3, 1); break; }
      case 'archive': for (let i = 0; i < 6; i++) this.add('petal', 0xc8202e, 4 + Math.random() * 2, 40 + Math.random() * 310, 380, { vx: (Math.random() - 0.5) * 20, vy: 50 + Math.random() * 30, vr: (Math.random() - 0.5) * 3, life: 2.8, a: 0.75, sway: 14 }); break;
      case 'cathedral': {
        const crack = [[195, 186], [195, 228], [232, 250], [232, 272], [268, 292], [268, 340]].map(([x, y]) => M(x, y));
        const crack2 = [[195, 228], [158, 250], [158, 272], [122, 292], [122, 340]].map(([x, y]) => M(x, y));
        this.streak(crack, 0xbff0ff, 0.8, 3, 0.5, 0.4); this.streak(crack2, 0xbff0ff, 0.8, 3, 0.5, 0.4);
        this.glowAt(40, 700, 90, col, 0.25, 1, 0.3); this.glowAt(350, 700, 90, col, 0.25, 1, 0.3);
        break;
      }
    }
  }
  doom(level: number) {
    this.doomLv = level;
    if (!this.motion) return;
    const d = this.st.doom;
    switch (this.theme) {
      case 'forge': case 'cathedral': {
        // cracks across the floor
        const g = this.cracks; g.clear();
        const c = this.theme === 'forge' ? 0xff7a2a : 0xd8f6ff;
        let seed = 7 + level;
        const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let k = 0; k < 2 + level; k++) { let x = 40 + r() * 310, y = 560 + r() * 200; g.moveTo(x, y); for (let i = 0; i < 5; i++) { x += (r() - 0.5) * 60; y -= 10 + r() * 30; g.lineTo(x, y); } g.stroke({ color: c, width: 1.6, alpha: 0.35 }); }
        this.flashAll(this.theme === 'forge' ? 0xff5a10 : 0xffffff, 0.25, 1.5);
        break;
      }
      case 'compass': this.flashAll(0x000000, 0.35, 1.5); break;
      default: this.flashAll(d, 0.25, 1.5);
    }
  }
  private flashAll(color: number, peak: number, dur: number) {
    const g = new Graphics().rect(0, 366, 390, 414).fill(color); g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; const k = t / dur; if (k >= 1) { g.destroy(); return false; } g.alpha = peak * Math.sin(Math.PI * k); return true; });
  }
  private drawDoom() {
    const g = this.doomG.clear();
    if (!this.doomLv) return;
    const br = 0.5 + 0.5 * Math.sin(this.t * 1.4), lv = Math.min(3, this.doomLv);
    if (this.theme === 'skeleton') {
      for (const [x, y] of [[0, 366], [390, 366], [0, 780], [390, 780]]) for (let i = 0; i < 4; i++) g.circle(x, y, 60 + i * 30).fill({ color: 0xd6334a, alpha: (0.03 + 0.02 * br) * lv });
      return;
    }
    if (this.theme === 'compass') { g.rect(0, 366, 390, 414).fill({ color: 0x000000, alpha: (0.1 + 0.05 * br) * lv }); return; }
    if (this.theme === 'steam') { for (let i = 0; i < 4; i++) g.rect(0, 700 + i * 20, 390, 80 - i * 20).fill({ color: 0xf0ece4, alpha: (0.03 + 0.02 * br) * lv }); return; }
    if (this.theme === 'archive') { for (const [x, y, r] of [[90, 620, 40], [300, 700, 34], [220, 560, 22]]) g.circle(x, y, r * (0.8 + 0.2 * lv)).fill({ color: 0xa01a2a, alpha: (0.08 + 0.04 * br) * lv / 2 }); return; }
    if (this.theme === 'cathedral') { for (let i = 0; i < 4; i++) g.rect(0, 760 - i * 14, 390, 20 + i * 14).fill({ color: 0xffffff, alpha: (0.02 + 0.015 * br) * lv }); return; }
    g.rect(0, 366, 390, 414).fill({ color: this.st.doom, alpha: (0.04 + 0.03 * br) * lv });
  }

  /** A reservation fired: the front edge of the mat glows. */
  trigger() {
    if (!this.motion) return;
    const g = new Graphics(); g.blendMode = 'add';
    for (let i = 0; i < 4; i++) g.rect(0, 366 + i * 5, 390, 6).fill({ color: this.st.col, alpha: 0.5 - i * 0.12 });
    g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; const k = t / 0.8; if (k >= 1) { g.destroy(); return false; } g.alpha = 0.6 * Math.sin(Math.PI * k); return true; });
  }
  echo() { if (this.motion) this.ring(195, 600, 10, 180, this.st.acc, 2, 1, { ry: 50, peak: 0.35 }); }
  clock() { if (this.motion) this.streak([{ x: -20, y: 760 }, { x: 410, y: 420 }], 0x9fe6ff, 0.7, 4, 0.5, 0.3); }
  /** My base took a heavy hit: the near edge glows red and cracks for a few seconds. */
  hit() {
    if (!this.motion) return;
    const g = new Graphics();
    for (let i = 0; i < 5; i++) g.rect(0, 760 - i * 14, 390, 20 + i * 14).fill({ color: 0xff2a1a, alpha: 0.07 });
    let x = 120 + Math.random() * 150, y = 780;
    g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (Math.random() - 0.5) * 50; y -= 14 + Math.random() * 18; g.lineTo(x, y); }
    g.stroke({ color: 0xffb0a0, width: 1.8, alpha: 0.6 });
    g.alpha = 0; this.addChild(g);
    let t = 0;
    this.anims.push((dt) => { t += dt; if (t >= 3) { g.destroy(); return false; } g.alpha = t < 0.15 ? t / 0.15 * 0.4 : 0.4 * (1 - (t - 0.15) / 2.85); return true; });
  }

  tick(ms: number) {
    this.step(ms);
    if (this.doomLv) this.drawDoom();
    if (!this.motion) return;
    const dt = ms / 1000;
    this.amb += dt;
    const every = this.theme === 'wadokei' ? 0.8 : this.theme === 'compass' ? 1 : this.theme === 'cathedral' ? 0.6 : 0;
    if (!every || this.amb < every) return;
    this.amb = 0;
    if (this.theme === 'wadokei') this.add('petal', this.doomLv ? 0xff5a7a : 0xffc0d8, 3.5 + Math.random() * 2.5, Math.random() * 300, 366 + Math.random() * 200, { vx: 14 + Math.random() * 14, vy: 18 + Math.random() * 12, vr: (Math.random() - 0.5) * 3, life: 8, a: 0.6, sway: 10 });
    else if (this.theme === 'compass') this.add('flower', 0xfff4cc, 2.6 + Math.random() * 2.4, 30 + Math.random() * 330, 760, { vy: -18 - Math.random() * 12, vr: (Math.random() - 0.5), life: 12, a: 0.5, sway: 12 });
    else this.add('star', 0xffffff, 2 + Math.random() * 3, Math.random() * 390, 380 + Math.random() * 380, { life: 1, a: 0.5, vr: 0.5 });
  }
}
