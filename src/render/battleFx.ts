/* The big moments of a battle: hit weight, doom, the finishing blow and legendary cards (chosen from the 2026-10 video tests). */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { COLORS, FONTS } from './theme';
import { ease, type Tweener } from './tween';
import type { Fx } from './fx';
import { cardArt } from './cardArt';
import { cardDef } from '../core/cards';

export const MINUS = 0xff6b3d;

export function bigText(s: string, size: number, color: number, font: string = FONTS.display, stroke = 8) {
  const t = new Text({ text: s, style: { fontFamily: font, fontSize: size, fontWeight: '700', fill: color, letterSpacing: 4, stroke: { color: 0x05080a, width: stroke }, dropShadow: { color: 0x000000, blur: 10, distance: 0, alpha: 0.9 } } });
  t.anchor.set(0.5);
  return t;
}

/** Screen-level effects for one battle. `world` is the container the whole board is scaled in (zoom punches move it). */
export class BattleFx {
  constructor(private tw: Tweener, private fx: Fx, private board: Container, private world: () => Container | null) {}
  private get on() { return !this.tw.reduced; }

  /** The real clock, so a hit can freeze every tween for a moment. */
  async hitstop(ms: number) {
    if (!this.on) return;
    const sp = this.tw.speed;
    this.tw.speed = 0;
    await new Promise<void>((r) => setTimeout(r, ms));
    this.tw.speed = sp;
  }

  /** Zoom toward a board point and back. */
  async punch(p: { x: number; y: number }, amt: number, inMs = 70, outMs = 300) {
    const w = this.world();
    if (!w || !this.on) return;
    const G = this.board.toGlobal(p), s0 = w.scale.x, x0 = w.x, y0 = w.y;
    const set = (f: number) => { w.scale.set(s0 * f); w.x = G.x - (G.x - x0) * f; w.y = G.y - (G.y - y0) * f; };
    await this.tw.run(inMs, (k) => set(1 + amt * k), ease.outCubic);
    await this.tw.run(outMs, (k) => set(1 + amt * (1 - k)), ease.outCubic);
    w.scale.set(s0); w.x = x0; w.y = y0;
  }
  /** Zoom in and stay; the returned function zooms back. */
  async zoomHold(p: { x: number; y: number }, amt: number, ms: number) {
    const w = this.world();
    if (!w || !this.on) return async () => {};
    const G = this.board.toGlobal(p), s0 = w.scale.x, x0 = w.x, y0 = w.y;
    const set = (f: number) => { w.scale.set(s0 * f); w.x = G.x - (G.x - x0) * f; w.y = G.y - (G.y - y0) * f; };
    await this.tw.run(ms, (k) => set(1 + amt * k), ease.inOutCubic);
    return async () => { await this.tw.run(380, (k) => set(1 + amt * (1 - k)), ease.inOutCubic); w.scale.set(s0); w.x = x0; w.y = y0; };
  }

  shade(alpha: number, ms = 250, color = 0x000000) {
    const g = new Graphics().rect(-400, -400, 1520, 2080).fill(color);
    g.alpha = 0;
    this.fx.layer.addChild(g);
    void this.tw.to(g, { alpha }, ms);
    return { g, off: (ms2 = 300) => this.tw.to(g, { alpha: 0 }, ms2).then(() => g.destroy()) };
  }
  /** Coloured light pressing in from the screen edges. */
  edge(color: number, peak = 1, ms = 700) {
    const g = new Graphics();
    for (let i = 0; i < 10; i++) g.rect(-60 + i * 14, -60 + i * 14, 840 - i * 28, 1400 - i * 28).stroke({ color, width: 16, alpha: 0.11 });
    g.alpha = 0; g.blendMode = 'add';
    this.fx.layer.addChild(g);
    return this.tw.run(ms, (k) => { g.alpha = peak * Math.sin(Math.PI * k); }).then(() => g.destroy());
  }
  /** The number lands like a stamp, then drifts away. */
  async stamp(x: number, y: number, s: string, size: number, color = MINUS) {
    const t = bigText(s, size, color, FONTS.num, 9);
    t.x = x; t.y = y; t.scale.set(2.2); t.alpha = 0;
    this.fx.layer.addChild(t);
    await Promise.all([this.tw.to(t.scale, { x: 1, y: 1 }, 150, ease.outCubic), this.tw.to(t, { alpha: 1 }, 90)]);
    void this.fx.shake(4, 120);
    await this.tw.wait(520);
    await this.tw.to(t, { y: y - 40, alpha: 0 }, 320);
    t.destroy();
  }
  /** Gathering ring around an attacker before it moves. */
  charge(x: number, y: number, color: number) { return this.fx.ring(x, y, color, 130, 60, 240, 5); }
  /** A hit lands: shock rings, dust, a zoom punch. */
  impact(x: number, y: number, heavy: boolean, color = 0xffb070) {
    void this.punch({ x, y }, heavy ? 0.08 : 0.05, heavy ? 80 : 70, heavy ? 340 : 280);
    void this.fx.ring(x, y, 0xffffff, 20, heavy ? 200 : 150, heavy ? 420 : 380, heavy ? 10 : 8);
    void this.fx.ring(x, y, color, 30, heavy ? 300 : 210, heavy ? 600 : 520, heavy ? 6 : 5);
    this.fx.burst(x, y + 50, 0xa89c88, 20, 220, { grav: 50, life: 0.6, size: 5 });
  }

  /** A legendary card: a slanted band with its art, name and 伝説 crosses the screen. */
  async legend(card: string, color: number) {
    if (!this.on) return;
    const sh = this.shade(0.65, 220);
    await this.tw.wait(220);
    const c = new Container(); c.x = 1500; c.y = 600; c.rotation = -0.16;
    const H = 330;
    const art = new Sprite(Texture.from(cardArt(card, 900, 690))); art.anchor.set(0.5); art.width = 980; art.height = 751;
    const m = new Graphics().rect(-700, -H / 2, 1400, H).fill(0xffffff);
    art.mask = m;
    const edge = new Graphics().rect(-700, -H / 2 - 6, 1400, 6).fill(COLORS.brass).rect(-700, H / 2, 1400, 6).fill(COLORS.brass);
    const shadeLow = new Graphics().rect(-700, H / 2 - 120, 1400, 120).fill({ color: 0x000000, alpha: 0.55 });
    const name = bigText(cardDef(card).name, 72, COLORS.ivory, FONTS.display, 8); name.x = 60; name.y = H / 2 - 62; name.style.letterSpacing = 10;
    if (name.width > 560) name.scale.set(560 / name.width);
    const tag = new Container();
    tag.addChild(new Graphics().roundRect(-62, -24, 124, 48, 4).fill(COLORS.brass).roundRect(-62, -24, 124, 48, 4).stroke({ color, width: 3 }), bigText('伝説', 30, COLORS.ink, FONTS.display, 0));
    tag.x = -230; tag.y = H / 2 - 62;
    c.addChild(m, art, shadeLow, edge, name, tag);
    this.fx.layer.addChild(c);
    const streaks = new Graphics(); streaks.blendMode = 'add';
    this.fx.layer.addChild(streaks);
    const lines = Array.from({ length: 16 }, () => ({ y: 440 + Math.random() * 320, x: Math.random() * 720, l: 80 + Math.random() * 200, v: 1400 + Math.random() * 1600 }));
    const run = this.tw.run(1500, (k) => {
      streaks.clear();
      for (const s of lines) { const x = ((s.x - s.v * k * 1.7) % 1100 + 1100) % 1100 - 200; streaks.moveTo(x, s.y).lineTo(x + s.l, s.y - s.l * 0.16).stroke({ color: COLORS.brass, width: 2, alpha: 0.7 }); }
    });
    await this.tw.to(c, { x: 400 }, 260, ease.outCubic);
    void this.fx.flash(COLORS.brass, 0.2, 300);
    await this.tw.run(950, (k) => { c.x = 400 - 80 * k; art.x = 40 * k; });
    await this.tw.to(c, { x: -900 }, 220, ease.inCubic);
    await run; streaks.destroy();
    c.destroy({ children: true });
    void sh.off(300);
  }
  /** The card lands on its lane with a gold shock. */
  legendLand(x: number, y: number) {
    void this.fx.ring(x, y, COLORS.brass, 40, 380, 650, 12);
    void this.fx.ring(x, y, 0xffffff, 30, 240, 420, 6);
    this.fx.burst(x, y, COLORS.brass, 60, 520, { shape: 'spark', grav: 0, life: 0.9 });
    void this.punch({ x, y }, 0.05, 70, 300);
    void this.fx.shake(18, 380);
  }

  /** 勝利 with light behind it, 敗北 without, 引き分け plain. */
  async verdict(kind: 'win' | 'lose' | 'draw', title: string) {
    const c = new Container(); c.x = 360; c.y = 560;
    this.fx.layer.addChild(c);
    const color = kind === 'win' ? COLORS.brass : kind === 'lose' ? 0x9fb2c0 : COLORS.ivory;
    let rays: Graphics | null = null;
    if (kind === 'win') {
      rays = new Graphics(); rays.blendMode = 'add';
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, w = 0.06; rays.poly([0, 0, Math.cos(a - w) * 560, Math.sin(a - w) * 560, Math.cos(a + w) * 560, Math.sin(a + w) * 560]).fill({ color: COLORS.brass, alpha: 0.16 }); }
      rays.alpha = 0; c.addChild(rays);
      void this.tw.to(rays, { alpha: 1 }, 400);
    }
    const t = bigText(title, title.length > 2 ? 110 : 150, color, FONTS.display, 12);
    t.style.letterSpacing = title.length > 2 ? 12 : 30;
    const sub = bigText(kind === 'win' ? 'VICTORY' : kind === 'lose' ? 'DEFEAT' : 'DRAW', 30, COLORS.ivory, FONTS.num, 5); sub.y = 110; sub.style.letterSpacing = 14;
    c.addChild(t, sub);
    t.alpha = 0; t.scale.set(1.3); sub.alpha = 0;
    await Promise.all([this.tw.to(t, { alpha: 1 }, 400), this.tw.to(t.scale, { x: 1, y: 1 }, 600, ease.outCubic), rays ? this.tw.run(2000, (k) => { rays!.rotation = k * 0.4; }) : Promise.resolve(), (async () => { await this.tw.wait(300); await this.tw.to(sub, { alpha: 1 }, 300); })()]);
    await this.tw.to(c, { alpha: 0 }, 300);
    c.destroy({ children: true });
  }
}
