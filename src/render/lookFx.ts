/** Small ambient effects for the themed looks: embers, ripples on water, puffs of steam. */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

interface Spark { g: Graphics; x: number; y: number; vx: number; vy: number; age: number; life: number; ph: number }
/** Glowing specks that rise and fade. `spawn` gives a starting point (in this container's space). */
export class Embers extends Container {
  private parts: Spark[] = [];
  private acc = 0;
  constructor(private spawn: () => { x: number; y: number }, private rate = 6, private size = 2.4, private colors = [0xff8a3a, 0xffb04a, 0xffd38a], private rise = 46) { super(); }
  tick(ms: number) {
    const dt = ms / 1000;
    this.acc += dt * this.rate;
    while (this.acc >= 1 && this.parts.length < 40) {
      this.acc -= 1;
      const p = this.spawn();
      const g = new Graphics().circle(0, 0, this.size * (0.6 + Math.random() * 0.8)).fill(this.colors[Math.floor(Math.random() * this.colors.length)]);
      this.addChild(g);
      this.parts.push({ g, x: p.x, y: p.y, vx: (Math.random() - 0.5) * 12, vy: -this.rise * (0.6 + Math.random() * 0.8), age: 0, life: 1.6 + Math.random() * 1.8, ph: Math.random() * 6 });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const s = this.parts[i];
      s.age += dt;
      if (s.age >= s.life) { s.g.destroy(); this.parts.splice(i, 1); continue; }
      s.x += (s.vx + Math.sin(s.age * 3 + s.ph) * 10) * dt; s.y += s.vy * dt;
      s.g.x = s.x; s.g.y = s.y;
      const k = s.age / s.life;
      s.g.alpha = Math.min(1, k * 6) * (1 - k) * (0.6 + 0.4 * Math.sin(s.age * 14 + s.ph));
    }
  }
}

/** Rings spreading over water from one point, two at a time. */
export class Ripple extends Container {
  private g = new Graphics();
  private t = 0;
  constructor(private cx: number, private cy: number, private rx = 110, private ry = 34, private color = 0x2fb3a6, private period = 7) { super(); this.addChild(this.g); }
  tick(ms: number) {
    this.t += ms / 1000;
    const g = this.g.clear();
    for (const off of [0, 0.5]) {
      const k = ((this.t / this.period) + off) % 1;
      const s = 0.4 + k * 1.2;
      const a = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.5;
      g.ellipse(this.cx, this.cy, this.rx * s, this.ry * s).stroke({ color: this.color, width: 1.6, alpha: a });
    }
  }
}

let puffTex: Texture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(230,226,218,.9)'); gr.addColorStop(1, 'rgba(230,226,218,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  return (puffTex = Texture.from(cv));
}
/** Steam escaping from a few vents now and then. */
export class Steam extends Container {
  private parts: { s: Sprite; age: number; life: number; vx: number; vy: number }[] = [];
  private next: number[];
  constructor(private vents: { x: number; y: number }[], private size = 30) { super(); this.next = vents.map((_, i) => 1 + i * 2.2); }
  tick(ms: number) {
    const dt = ms / 1000;
    this.next = this.next.map((n, i) => {
      n -= dt;
      if (n <= 0) {
        for (let k = 0; k < 3; k++) {
          const s = new Sprite(puff()); s.anchor.set(0.5); s.x = this.vents[i].x; s.y = this.vents[i].y; s.alpha = 0; s.width = s.height = this.size;
          this.addChild(s);
          this.parts.push({ s, age: -k * 0.25, life: 2.6, vx: -8 - Math.random() * 10, vy: -14 - Math.random() * 10 });
        }
        return 4 + Math.random() * 4;
      }
      return n;
    });
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age >= p.life) { p.s.destroy(); this.parts.splice(i, 1); continue; }
      const k = p.age / p.life;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.width = p.s.height = this.size * (1 + k * 1.6);
      p.s.alpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.45;
    }
  }
}
