import { Container, Graphics, type Ticker } from 'pixi.js';
import { COLORS } from './theme';

function gearShape(g: Graphics, r: number, teeth: number, color: number, alpha: number, width = 2) {
  const pts: number[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.88 : r;
    pts.push(Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  g.poly(pts).stroke({ color, width, alpha });
  g.circle(0, 0, r * 0.62).stroke({ color, width: width * 0.8, alpha: alpha * 0.8 });
  g.circle(0, 0, r * 0.18).stroke({ color, width, alpha });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18).lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62).stroke({ color, width: width * 0.7, alpha: alpha * 0.7 });
  }
}

/** Slow clockwork backdrop that fills the whole window behind every screen. */
export class Backdrop extends Container {
  private gears: { g: Graphics; speed: number }[] = [];
  private dust: { g: Graphics; vx: number; vy: number }[] = [];
  private grad = new Graphics();
  private w = 720;
  private h = 1280;
  constructor(ticker: Ticker) {
    super();
    this.addChild(this.grad);
    const specs: [number, number, number, number, number, number][] = [
      // x, y (fractions), radius, teeth, speed, alpha
      [0.12, 0.2, 260, 36, 0.02, 0.1], [0.92, 0.35, 180, 24, -0.03, 0.08], [0.5, 0.95, 380, 48, 0.012, 0.07], [0.85, 0.92, 120, 16, -0.05, 0.1], [0.05, 0.75, 150, 20, 0.04, 0.07],
    ];
    for (const [x, y, r, t, sp, a] of specs) {
      const g = new Graphics();
      gearShape(g, r, t, COLORS.brass, a);
      g.x = x; g.y = y; // fractions, resolved in resize
      this.addChild(g);
      this.gears.push({ g, speed: sp });
    }
    for (let i = 0; i < 46; i++) {
      const g = new Graphics().circle(0, 0, Math.random() * 1.8 + 0.4).fill({ color: COLORS.brass, alpha: Math.random() * 0.5 + 0.1 });
      g.x = Math.random(); g.y = Math.random();
      this.addChild(g);
      this.dust.push({ g, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 10 - 2 });
    }
    ticker.add((t) => this.step(t.deltaMS));
  }
  private placed = false;
  resize(w: number, h: number) {
    const fx = (v: number) => (this.placed ? v / this.w : v);
    for (const { g } of this.gears) { const rx = fx(g.x), ry = this.placed ? g.y / this.h : g.y; g.x = rx * w; g.y = ry * h; }
    for (const { g } of this.dust) { const rx = fx(g.x), ry = this.placed ? g.y / this.h : g.y; g.x = rx * w; g.y = ry * h; }
    this.placed = true;
    this.w = w; this.h = h;
    const gr = this.grad.clear();
    gr.rect(0, 0, w, h).fill(COLORS.ink);
    // soft radial light from the top
    for (let i = 10; i > 0; i--) gr.ellipse(w / 2, h * 0.28, w * 0.09 * i, h * 0.05 * i).fill({ color: 0x173746, alpha: 0.05 });
  }
  private step(ms: number) {
    const dt = ms / 1000;
    for (const { g, speed } of this.gears) g.rotation += speed * dt;
    for (const d of this.dust) {
      d.g.x += d.vx * dt; d.g.y += d.vy * dt;
      if (d.g.y < -5) { d.g.y = this.h + 5; d.g.x = Math.random() * this.w; }
      if (d.g.x < -5) d.g.x = this.w + 5;
      if (d.g.x > this.w + 5) d.g.x = -5;
    }
  }
}
