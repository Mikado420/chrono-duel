import { Container, Graphics, Text, type ColorSource } from 'pixi.js';
import { FONTS } from './theme';
import { ease, type Tweener } from './tween';

interface Particle { g: Graphics; vx: number; vy: number; life: number; max: number; spin: number; grav: number; fade: boolean }

/** Particles, floating numbers, flashes and screen shake, all drawn on one top layer. */
export class Fx {
  readonly layer = new Container();
  private parts: Particle[] = [];
  constructor(private tw: Tweener, ticker: { add: (fn: (t: { deltaMS: number }) => void) => void }, private shakeTarget: Container) {
    ticker.add((t) => this.step(t.deltaMS));
  }
  private step(ms: number) {
    const dt = (ms / 1000) * this.tw.speed;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.vy += p.grav * dt;
      p.g.x += p.vx * dt; p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      const k = p.life / p.max;
      if (p.fade) p.g.alpha = Math.max(0, 1 - k);
      p.g.scale.set(Math.max(0.05, 1 - k * 0.6));
      if (k >= 1) { p.g.destroy(); this.parts.splice(i, 1); }
    }
  }
  burst(x: number, y: number, color: ColorSource, n = 18, speed = 260, opts: { size?: number; grav?: number; life?: number; shape?: 'dot' | 'shard' | 'spark' } = {}) {
    if (this.tw.reduced) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      const s = (opts.size ?? 4) * (0.5 + Math.random());
      if (opts.shape === 'shard') g.poly([0, -s * 1.6, s, 0, 0, s * 1.6, -s * 0.6, 0]).fill(color);
      else if (opts.shape === 'spark') g.rect(-s * 2.2, -s * 0.35, s * 4.4, s * 0.7).fill(color);
      else g.circle(0, 0, s).fill(color);
      g.blendMode = 'add';
      g.x = x; g.y = y;
      const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.8);
      g.rotation = a;
      this.layer.addChild(g);
      this.parts.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: (opts.life ?? 0.7) * (0.6 + Math.random() * 0.6), spin: (Math.random() - 0.5) * 8, grav: opts.grav ?? 300, fade: true });
    }
  }
  ring(x: number, y: number, color: ColorSource, r0 = 10, r1 = 120, dur = 500, width = 6) {
    const g = new Graphics();
    g.x = x; g.y = y; g.blendMode = 'add';
    this.layer.addChild(g);
    return this.tw.run(dur, (k) => {
      g.clear().circle(0, 0, r0 + (r1 - r0) * k).stroke({ color, width: width * (1 - k) + 0.5, alpha: 1 - k });
    }, ease.outCubic).then(() => g.destroy());
  }
  floatText(x: number, y: number, text: string, color: ColorSource, size = 44, rise = 70, dur = 900) {
    const t = new Text({ text, style: { fontFamily: FONTS.num, fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0x05080a, width: 6 }, dropShadow: { color: 0x000000, blur: 6, distance: 0, alpha: 0.8 } } });
    t.anchor.set(0.5); t.x = x; t.y = y; t.scale.set(0.4);
    this.layer.addChild(t);
    void this.tw.to(t.scale, { x: 1, y: 1 }, 220, ease.outBack);
    return this.tw.run(dur, (k) => { t.y = y - rise * ease.outCubic(k); t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }).then(() => t.destroy());
  }
  banner(text: string, sub: string, color: ColorSource, cx: number, cy: number, width = 720) {
    const c = new Container();
    c.x = cx; c.y = cy;
    const band = new Graphics().rect(-width / 2, -70, width, 140).fill({ color: 0x05090c, alpha: 0.82 });
    band.rect(-width / 2, -70, width, 2).fill({ color, alpha: 0.9 }).rect(-width / 2, 68, width, 2).fill({ color, alpha: 0.9 });
    const t = new Text({ text, style: { fontFamily: FONTS.display, fontSize: 56, fontWeight: '700', fill: color, letterSpacing: 6 } });
    t.anchor.set(0.5); t.y = -12;
    const s = new Text({ text: sub, style: { fontFamily: FONTS.body, fontSize: 22, fill: 0xf1e7d0, letterSpacing: 2 } });
    s.anchor.set(0.5); s.y = 40;
    c.addChild(band, t, s);
    c.alpha = 0; c.scale.y = 0.2;
    this.layer.addChild(c);
    return (async () => {
      await Promise.all([this.tw.to(c, { alpha: 1 }, 180), this.tw.to(c.scale, { y: 1 }, 260, ease.outBack)]);
      await this.tw.wait(850);
      await this.tw.to(c, { alpha: 0 }, 260);
      c.destroy({ children: true });
    })();
  }
  flash(color: ColorSource, alpha = 0.35, dur = 300, w = 4000, h = 4000) {
    const g = new Graphics().rect(-w / 2, -h / 2, w * 2, h * 2).fill(color);
    g.alpha = alpha; g.blendMode = 'add';
    this.layer.addChild(g);
    return this.tw.to(g, { alpha: 0 }, dur).then(() => g.destroy());
  }
  shake(power = 10, dur = 300) {
    if (this.tw.reduced) return Promise.resolve();
    const t = this.shakeTarget;
    const ox = t.x, oy = t.y;
    return this.tw.run(dur, (k) => {
      const p = power * (1 - k);
      t.x = ox + (Math.random() - 0.5) * p * 2;
      t.y = oy + (Math.random() - 0.5) * p * 2;
    }).then(() => { t.x = ox; t.y = oy; });
  }
  /** A glowing streak from a to b (used for spell hits and triggers). */
  async beam(ax: number, ay: number, bx: number, by: number, color: ColorSource, dur = 260) {
    const g = new Graphics(); g.blendMode = 'add';
    this.layer.addChild(g);
    await this.tw.run(dur, (k) => {
      const hx = ax + (bx - ax) * k, hy = ay + (by - ay) * k;
      const tx = ax + (bx - ax) * Math.max(0, k - 0.35), ty = ay + (by - ay) * Math.max(0, k - 0.35);
      g.clear().moveTo(tx, ty).lineTo(hx, hy).stroke({ color, width: 10, alpha: 0.35 }).moveTo(tx, ty).lineTo(hx, hy).stroke({ color: 0xffffff, width: 3, alpha: 0.9 }).circle(hx, hy, 9).fill({ color, alpha: 0.9 });
    }, ease.inCubic);
    g.destroy();
  }
}
