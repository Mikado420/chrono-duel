/**
 * Booster pack opening. Sequence:
 *   1. the pack floats under a spotlight; swipe along the top (or tap) to tear it
 *   2. light pours out in the colour of the best card inside (the only hint)
 *   3. five cards rise face down and deal out; each one glows by rarity
 *   4. tap to flip; 秘宝 and 伝説 get a full-screen spotlight moment
 *   5. summary with NEW marks and coins from duplicates
 */
import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { RARITY_NAMES, cardDef, type Rarity } from '../core/cards';
import type { Opening, Pull } from '../meta/economy';
import { audio } from './audio';
import { PACK_H, PACK_W, packArt } from './cardArt';
import type { Fx } from './fx';
import { COLORS, FONTS } from './theme';
import { ease, type Tweener } from './tween';
import { Button, label } from './ui';
import { backTex, faceTex } from './views';

function drawRays(g: Graphics, n: number, w: number, color: number) {
  g.clear();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.moveTo(0, 0).lineTo(Math.cos(a - w) * 1000, Math.sin(a - w) * 1000).lineTo(Math.cos(a + w) * 1000, Math.sin(a + w) * 1000).closePath();
  }
  g.fill({ color, alpha: 1 });
}
const GLOW: Record<Rarity, number> = { C: 0x9fb3b8, R: 0x5fe0c8, E: 0xc79bff, L: 0xffd66e };
const CARD_S = 0.5;
const SLOTS = [{ x: 150, y: 0 }, { x: 360, y: 0 }, { x: 570, y: 0 }, { x: 255, y: 1 }, { x: 465, y: 1 }];

interface Slot { pull: Pull; c: Container; card: Sprite; aura: Graphics; badge: Container; open: boolean; t: number }

export interface PackOpenHost {
  /** Label and availability of "open another", or null to hide the button. */
  again(): { label: string; enabled: boolean } | null;
  onAgain(): void;
  onClose(): void;
}

export class PackOpenScene extends Container {
  private bg = new Graphics();
  private rays = new Graphics();
  private stage2 = new Container();
  private pack = new Container();
  private packTop!: Sprite;
  private packBody!: Sprite;
  private sheen = new Graphics();
  private tearG = new Graphics();
  private hint: Text;
  private ui = new Container();
  private slots: Slot[] = [];
  private phase: 'idle' | 'tearing' | 'opening' | 'deal' | 'reveal' | 'spot' | 'done' = 'idle';
  private tear = { active: false, from: 0, max: 0 };
  private time = 0;
  private rayColor: number = COLORS.brass;
  private rayAlpha = 0.08;
  private raysDrawn = -1;
  private rowY = [470, 760];
  private h = 1280;
  private skipBtn: Button;
  private allBtn: Button | null = null;
  private dead = false;
  private spotDone: (() => void) | null = null;

  constructor(private tw: Tweener, private fx: Fx, private ticker: Ticker, private o: Opening, private host: PackOpenHost, extra = 0) {
    super();
    this.h = 1280 + extra;
    const cy = this.h * 0.47;
    this.rowY = [cy - 150, cy + 150];
    this.bg.rect(-400, -400, 1520, this.h + 800).fill({ color: 0x03080b, alpha: 0.94 });
    this.bg.eventMode = 'static';
    this.drawSpot();
    this.rays.x = 360; this.rays.y = cy; this.rays.blendMode = 'add';

    // the pack: two sprites cut from one texture so the top strip can tear away
    const base = Texture.from(packArt(o.pack.name, o.pack.sub));
    const TOP = 64;
    this.packTop = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, 0, PACK_W, TOP) }));
    this.packBody = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, TOP, PACK_W, PACK_H - TOP) }));
    this.packTop.anchor.set(0.5, 1); this.packTop.y = -PACK_H / 2 + TOP;
    this.packBody.anchor.set(0.5, 0); this.packBody.y = -PACK_H / 2 + TOP;
    const mask = new Graphics().rect(-PACK_W / 2, -PACK_H / 2, PACK_W, PACK_H).fill(0xffffff);
    this.sheen.mask = mask; this.sheen.blendMode = 'add';
    this.pack.addChild(this.packBody, this.packTop, mask, this.sheen, this.tearG);
    this.pack.x = 360; this.pack.y = cy; this.pack.scale.set(0.2); this.pack.alpha = 0;
    this.pack.eventMode = 'static'; this.pack.cursor = 'pointer';

    this.hint = label('パックの上の端を横になぞって開封（タップでも開きます）', 22, COLORS.ivory, { align: 'center', wrap: 620 });
    this.hint.anchor.set(0.5); this.hint.x = 360; this.hint.y = cy + PACK_H / 2 + 60; this.hint.alpha = 0;

    const title = label(`${o.pack.name}`, 30, COLORS.brass, { font: FONTS.display, weight: '700', align: 'center' });
    title.anchor.set(0.5); title.x = 360; title.y = 70;
    const paid = label(o.paidWith === 'ticket' ? 'チケットで開封' : `${o.pack.price} コインで開封`, 18, COLORS.mute, { align: 'center' });
    paid.anchor.set(0.5); paid.x = 360; paid.y = 108;
    this.skipBtn = new Button('スキップ', 130, 52, 'plain', undefined, () => void this.skip());
    this.skipBtn.x = 630; this.skipBtn.y = 70;
    this.ui.addChild(title, paid, this.skipBtn);

    this.addChild(this.bg, this.rays, this.pack, this.stage2, this.hint, this.ui);
    this.eventMode = 'static';
    this.hitArea = { contains: () => true };
    this.pack.on('pointerdown', (e) => this.onDown(e));
    this.on('globalpointermove', (e) => this.onMove(e));
    this.on('pointerup', () => this.onUp());
    this.on('pointerupoutside', () => this.onUp());
    this.bg.on('pointertap', () => this.onBgTap());
    this.on('pointertap', () => { if (this.phase === 'spot') this.spotDone?.(); });
    ticker.add(this.tick);
    void this.intro();
  }

  override destroy() {
    this.dead = true;
    this.ticker.remove(this.tick);
    super.destroy({ children: true });
  }

  private drawSpot() {
    const g = this.bg;
    const cy = this.h * 0.47;
    for (let i = 0; i < 14; i++) g.circle(360, cy, 520 - i * 34).fill({ color: 0x1b4450, alpha: 0.018 + i * 0.004 });
  }

  // ------------------------------------------------------------------ continuous motion
  private tick = (t: Ticker) => {
    if (this.dead) return;
    const dt = t.deltaMS / 1000;
    this.time += dt;
    // light rays: drawn once, only turned and faded here (cheap on slow phones)
    if (this.raysDrawn !== this.rayColor) { drawRays(this.rays, 18, 0.08, this.rayColor); this.raysDrawn = this.rayColor; }
    this.rays.rotation = this.time * 0.12;
    this.rays.alpha = this.rayAlpha * (0.8 + 0.2 * Math.sin(this.time * 2));
    // pack bob and sheen
    if (this.phase === 'idle' || this.phase === 'tearing') {
      this.pack.rotation = Math.sin(this.time * 1.1) * 0.025;
      const sx = ((this.time * 260) % 1100) - 550;
      this.sheen.clear().poly([sx - 60, -PACK_H / 2, sx + 20, -PACK_H / 2, sx - 120, PACK_H / 2, sx - 200, PACK_H / 2]).fill({ color: 0xffffff, alpha: 0.13 });
      if (this.phase === 'idle') this.hint.alpha = 0.55 + 0.35 * Math.sin(this.time * 3);
    }
    // auras
    for (const s of this.slots) {
      s.t += dt;
      if (s.open) continue;
      const k = 0.5 + 0.5 * Math.sin(s.t * (s.pull.rarity === 'L' ? 5 : 3.2));
      s.aura.alpha = s.pull.rarity === 'C' ? 0.25 : 0.55 + 0.45 * k;
      if (s.pull.rarity === 'L' || s.pull.rarity === 'E') s.aura.scale.set(1 + 0.03 * k);
      if ((s.pull.rarity === 'L' && Math.random() < dt * 14) || (s.pull.rarity === 'E' && Math.random() < dt * 6)) {
        this.fx.burst(s.c.x + (Math.random() - 0.5) * 170, s.c.y + (Math.random() - 0.5) * 230, GLOW[s.pull.rarity], 1, 60, { grav: -80, life: 0.9, size: 3 });
      }
    }
  };

  // ------------------------------------------------------------------ stage 1: the pack
  private async intro() {
    audio.play('reserve');
    this.rayAlpha = 0.05;
    await Promise.all([this.tw.to(this.pack, { alpha: 1 }, 300), this.tw.to(this.pack.scale, { x: 1, y: 1 }, 650, ease.outBack)]);
    if (this.dead) return;
    this.fx.burst(360, this.pack.y, COLORS.brass, 20, 220, { grav: 0, life: 0.7, shape: 'spark' });
  }

  private tearLineY() { return this.pack.y - PACK_H / 2 + 64; }
  private onDown(e: FederatedPointerEvent) {
    if (this.phase !== 'idle') return;
    const p = this.toLocal(e.global);
    audio.unlock();
    if (Math.abs(p.y - this.tearLineY()) < 110) { this.phase = 'tearing'; this.tear = { active: true, from: p.x, max: 0 }; }
  }
  private onMove(e: FederatedPointerEvent) {
    if (this.phase !== 'tearing' || !this.tear.active) return;
    const p = this.toLocal(e.global);
    const prog = Math.min(1, Math.abs(p.x - this.tear.from) / (PACK_W * 0.8));
    if (prog > this.tear.max) {
      if (Math.floor(prog * 10) > Math.floor(this.tear.max * 10)) audio.play('tick');
      this.tear.max = prog;
      this.drawTear(prog, p.x > this.tear.from ? 1 : -1);
      this.fx.burst(p.x, this.tearLineY(), 0xfff0c8, 2, 120, { grav: 200, life: 0.4, size: 2.5, shape: 'spark' });
    }
    if (prog >= 0.75) { this.tear.active = false; void this.open(p.x > this.tear.from ? 1 : -1); }
  }
  private onUp() {
    if (this.phase === 'tearing' && this.tear.active) {
      this.tear.active = false;
      // a short or no swipe still opens it: tapping is a valid way to play
      void this.open(1);
    }
  }
  private onBgTap() {
    if (this.phase === 'idle') void this.open(1);
    else if (this.phase === 'spot') this.spotDone?.();
  }
  private drawTear(prog: number, dir: number) {
    const y = -PACK_H / 2 + 64;
    const x0 = dir > 0 ? -PACK_W / 2 : PACK_W / 2;
    const x1 = x0 + dir * PACK_W * prog;
    this.tearG.clear().moveTo(x0, y).lineTo(x1, y).stroke({ color: 0xfff0c8, width: 4, alpha: 0.95 }).moveTo(x0, y).lineTo(x1, y).stroke({ color: GLOW[this.o.best], width: 12, alpha: 0.35 });
  }

  // ------------------------------------------------------------------ stage 2: the burst
  private async open(dir: number) {
    if (this.phase === 'opening' || this.phase === 'deal' || this.phase === 'reveal' || this.phase === 'done') return;
    this.phase = 'opening';
    this.hint.alpha = 0;
    await this.tw.run(160, (k) => this.drawTear(Math.max(this.tear.max, k), dir));
    audio.play('tear');
    const best = this.o.best;
    const col = GLOW[best];
    // top strip flies off
    void this.tw.run(600, (k) => { this.packTop.x = dir * 260 * k; this.packTop.y = -PACK_H / 2 + 64 - 240 * k + 300 * k * k; this.packTop.rotation = dir * 1.4 * k; this.packTop.alpha = 1 - k; }, ease.outCubic);
    this.tearG.clear();
    // light from inside, coloured by the best card: the only hint of what is coming
    const top = this.tearLineY();
    const beam = new Graphics(); beam.blendMode = 'add';
    this.addChildAt(beam, this.getChildIndex(this.pack) + 1);
    void this.tw.run(900, (k) => {
      const w = 60 + 260 * k;
      beam.clear().poly([360 - PACK_W / 2 + 20, top, 360 + PACK_W / 2 - 20, top, 360 + w, top - 700, 360 - w, top - 700]).fill({ color: col, alpha: 0.35 * (1 - k * 0.6) });
    }, ease.outCubic).then(() => beam.destroy());
    audio.play('burst');
    this.rayColor = col;
    void this.tw.run(700, (k) => (this.rayAlpha = 0.05 + (best === 'C' ? 0.04 : best === 'R' ? 0.08 : 0.14) * k));
    this.fx.burst(360, top, col, best === 'L' ? 60 : 32, best === 'L' ? 520 : 380, { grav: 220, life: 1.1, shape: 'spark' });
    void this.fx.ring(360, top, col, 10, 360, 700, 10);
    if (best === 'L') {
      void this.fx.flash(0xffd66e, 0.4, 700);
      void this.fx.shake(14, 500);
      audio.play('bell');
    } else if (best === 'E') void this.fx.flash(0xc79bff, 0.25, 500);
    await this.tw.wait(best === 'L' ? 500 : 250);
    await this.deal();
  }

  // ------------------------------------------------------------------ stage 3: deal
  private async deal() {
    this.phase = 'deal';
    const origin = { x: 360, y: this.pack.y - 60 };
    this.o.pulls.forEach((pull, i) => {
      const c = new Container();
      const aura = new Graphics();
      const glow = GLOW[pull.rarity];
      for (let k = 0; k < 6; k++) aura.roundRect(-92 - k * 5, -125 - k * 5, 184 + k * 10, 250 + k * 10, 16 + k * 4).stroke({ color: glow, width: 6, alpha: 0.28 - k * 0.04 });
      aura.blendMode = 'add';
      const card = new Sprite(backTex()); card.anchor.set(0.5); card.scale.set(CARD_S * 0.2);
      const badge = new Container();
      c.addChild(aura, card, badge);
      c.x = origin.x; c.y = origin.y; c.alpha = 0;
      c.eventMode = 'static'; c.cursor = 'pointer';
      const slot: Slot = { pull, c, card, aura, badge, open: false, t: i * 0.7 };
      c.on('pointertap', (e) => { e.stopPropagation(); void this.flip(slot, false); });
      this.stage2.addChild(c);
      this.slots.push(slot);
    });
    // cards rise out of the pack in a stack, then the wrapper falls away
    await Promise.all(this.slots.map((s, i) => (async () => {
      await this.tw.wait(i * 70);
      s.c.alpha = 1;
      audio.play('draw');
      await Promise.all([this.tw.to(s.c, { y: origin.y - 150 - i * 6 }, 380, ease.outCubic), this.tw.to(s.card.scale, { x: CARD_S * 0.8, y: CARD_S * 0.8 }, 380, ease.outCubic)]);
    })()));
    this.pack.eventMode = 'none';
    // the empty wrapper falls away; once gone it must not catch taps meant for the buttons below
    void Promise.all([this.tw.to(this.pack, { y: this.pack.y + 700, alpha: 0 }, 600, ease.inCubic), this.tw.to(this.pack, { rotation: 0.3 }, 600)]).then(() => { if (!this.dead) this.pack.visible = false; });
    await this.tw.wait(120);
    await Promise.all(this.slots.map((s, i) => (async () => {
      await this.tw.wait(i * 90);
      const to = SLOTS[i];
      audio.play('flip');
      await Promise.all([
        this.tw.to(s.c, { x: to.x, y: this.rowY[to.y] }, 460, ease.outBack),
        this.tw.to(s.card.scale, { x: CARD_S, y: CARD_S }, 460, ease.outCubic),
        this.tw.run(460, (k) => (s.c.rotation = (1 - k) * (i - 2) * 0.2)),
      ]);
    })()));
    this.phase = 'reveal';
    this.allBtn = new Button('すべてめくる', 260, 70, 'primary', undefined, () => void this.revealAll(false));
    this.allBtn.x = 360; this.allBtn.y = this.rowY[1] + 230;
    this.ui.addChild(this.allBtn);
    const tip = label('カードをタップしてめくる', 20, COLORS.mute, { align: 'center' });
    tip.anchor.set(0.5); tip.x = 360; tip.y = this.rowY[0] - 175;
    tip.label = 'tip';
    this.ui.addChild(tip);
  }

  // ------------------------------------------------------------------ stage 4: reveal
  private async flip(s: Slot, quick: boolean) {
    if (s.open || (this.phase !== 'reveal' && !quick)) return;
    s.open = true;
    const r = s.pull.rarity;
    const big = !quick && (r === 'E' || r === 'L');
    if (big) this.phase = 'spot';
    audio.play('flip');
    const sx = s.card.scale.x;
    await this.tw.run(quick ? 90 : 140, (k) => (s.card.scale.x = sx * (1 - k)), ease.inCubic);
    s.card.texture = faceTex(s.pull.card);
    await this.tw.run(quick ? 110 : 200, (k) => (s.card.scale.x = sx * k), ease.outBack);
    void this.tw.to(s.aura, { alpha: r === 'C' ? 0 : 0.6 }, 300);
    if (r !== 'C') { audio.play(r === 'L' ? 'rareL' : r === 'E' ? 'rareE' : 'rareR'); void this.fx.ring(s.c.x, s.c.y, GLOW[r], 30, 200, 520, 6); }
    if (!quick) this.fx.burst(s.c.x, s.c.y, GLOW[r], r === 'C' ? 8 : 22, 260, { grav: 60, life: 0.6, shape: 'spark' });
    this.decorate(s);
    if (big) await this.spot(s);
    if (this.phase === 'spot') this.phase = 'reveal';
    if (this.slots.every((x) => x.open)) await this.finish();
  }

  /** NEW ribbon or duplicate coins on a revealed card. */
  private decorate(s: Slot) {
    const b = s.badge;
    b.removeChildren().forEach((c) => c.destroy());
    if (s.pull.isNew) {
      const g = new Graphics().roundRect(-40, -16, 80, 32, 16).fill(COLORS.foe).roundRect(-40, -16, 80, 32, 16).stroke({ color: 0xffffff, width: 2 });
      const t = label('NEW', 20, 0xffffff, { font: FONTS.num, weight: '700', align: 'center' });
      t.anchor.set(0.5);
      b.addChild(g, t);
      b.x = -58; b.y = -128;
      b.scale.set(0.2);
      void this.tw.to(b.scale, { x: 1, y: 1 }, 300, ease.outBack);
    } else if (s.pull.dupeShards) {
      const t = label(`+${s.pull.dupeShards} 欠片`, 20, 0xc9a8ff, { weight: '700', align: 'center' });
      t.anchor.set(0.5); t.y = 140;
      const sub = label('上限枚数のため欠片に', 14, COLORS.mute, { align: 'center' });
      sub.anchor.set(0.5); sub.y = 162;
      b.addChild(t, sub);
      audio.play('coin');
    }
  }

  /** Full-screen moment for 秘宝 and 伝説. Waits for a tap (or a few seconds). */
  private async spot(s: Slot) {
    const r = s.pull.rarity;
    const d = cardDef(s.pull.card);
    const col = GLOW[r];
    const layer = new Container();
    const dim = new Graphics().rect(-400, -400, 1520, this.h + 800).fill({ color: 0x020507, alpha: 0.85 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.spotDone?.());
    const rays = new Graphics(); rays.x = 360; rays.y = this.h * 0.44; rays.blendMode = 'add';
    const big = new Sprite(faceTex(s.pull.card)); big.anchor.set(0.5); big.x = s.c.x; big.y = s.c.y; big.scale.set(CARD_S);
    big.eventMode = 'static'; big.on('pointertap', () => this.spotDone?.());
    const band = new Container();
    const bandBg = new Graphics().rect(-360, -62, 720, 124).fill({ color: 0x05090c, alpha: 0.85 }).rect(-360, -62, 720, 2).fill(col).rect(-360, 60, 720, 2).fill(col);
    const rn = label(`${RARITY_NAMES[r]}${r === 'L' ? '  LEGEND' : ''}`, 22, col, { font: FONTS.num, weight: '700', align: 'center', spacing: 6 });
    rn.anchor.set(0.5); rn.y = -28;
    const nm = label(d.name, 40, 0xffffff, { font: FONTS.display, weight: '700', align: 'center' });
    nm.anchor.set(0.5); nm.y = 16;
    if (nm.width > 660) nm.scale.set(660 / nm.width);
    band.addChild(bandBg, rn, nm);
    band.x = 360; band.y = this.h * 0.44 + 330; band.alpha = 0;
    const tap = label('タップして続ける', 18, COLORS.mute, { align: 'center' });
    tap.anchor.set(0.5); tap.x = 360; tap.y = band.y + 100; tap.alpha = 0;
    layer.addChild(dim, rays, big, band, tap);
    if (s.pull.isNew) {
      const nb = label('NEW', 26, 0xffffff, { font: FONTS.num, weight: '700', align: 'center' });
      const ng = new Graphics().roundRect(-52, -20, 104, 40, 20).fill(COLORS.foe);
      const nc = new Container(); nc.addChild(ng, nb); nb.anchor.set(0.5);
      nc.x = 360 + 150; nc.y = this.h * 0.44 - 250; nc.rotation = 0.2;
      layer.addChild(nc);
    }
    this.addChild(layer);
    dim.alpha = 0;
    // a tap while the moment is still building up is remembered, not lost
    let want = false;
    this.spotDone = () => { want = true; };
    drawRays(rays, r === 'L' ? 28 : 18, 0.05, col);
    rays.alpha = 0.12;
    const rayFn = (t: Ticker) => { rays.rotation += (t.deltaMS / 1000) * (r === 'L' ? 0.35 : 0.2); };
    this.ticker.add(rayFn);
    if (r === 'L') { void this.fx.flash(0xffd66e, 0.5, 900); void this.fx.shake(10, 450); }
    await Promise.all([
      this.tw.to(dim, { alpha: 1 }, 260),
      this.tw.to(big, { x: 360, y: this.h * 0.44 }, 480, ease.outBack),
      this.tw.to(big.scale, { x: 1.05, y: 1.05 }, 480, ease.outBack),
    ]);
    void this.fx.ring(360, this.h * 0.44, col, 80, 520, 800, 12);
    this.fx.burst(360, this.h * 0.44, col, r === 'L' ? 70 : 36, r === 'L' ? 560 : 380, { grav: 120, life: 1.3, shape: 'spark' });
    if (r === 'L') this.fx.burst(360, this.h * 0.44, 0xffffff, 30, 300, { grav: -40, life: 1.6, size: 3 });
    await Promise.all([this.tw.to(band, { alpha: 1 }, 300), this.tw.to(tap, { alpha: 1 }, 600)]);
    await new Promise<void>((res) => {
      let done = false;
      const fin = () => { if (!done) { done = true; this.spotDone = null; res(); } };
      this.spotDone = fin;
      if (want) void this.tw.wait(600).then(fin); // let the name register for a moment
      void this.tw.wait(r === 'L' ? 6000 : 4000).then(fin);
    });
    if (this.dead) return;
    await Promise.all([this.tw.to(layer, { alpha: 0 }, 260), this.tw.to(big.scale, { x: CARD_S, y: CARD_S }, 260), this.tw.to(big, { x: s.c.x, y: s.c.y }, 260)]);
    this.ticker.remove(rayFn);
    layer.destroy({ children: true });
  }

  private async revealAll(quick: boolean) {
    if (this.phase !== 'reveal') return;
    for (const s of this.slots) {
      if (s.open) continue;
      await this.flip(s, quick);
      if (this.dead) return;
      await this.tw.wait(quick ? 40 : 160);
    }
  }

  private async skip() {
    if (this.phase === 'done' || this.dead) return;
    this.spotDone?.();
    if (this.phase === 'idle' || this.phase === 'tearing') { this.tear.active = false; await this.open(1); }
    while (this.phase === 'opening' || this.phase === 'deal' || this.phase === 'spot') { await this.tw.wait(50); if (this.dead) return; }
    await this.revealAll(true);
  }

  // ------------------------------------------------------------------ stage 5: summary
  private async finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.skipBtn.visible = false;
    this.allBtn?.destroy(); this.allBtn = null;
    this.ui.getChildByLabel('tip')?.destroy();
    const news = this.o.pulls.filter((p) => p.isNew).length;
    const coins = this.o.pulls.reduce((n, p) => n + p.dupeShards, 0);
    const line = [news ? `新しいカード ${news}種` : '新しいカードはありませんでした', coins ? `欠片 +${coins}` : ''].filter(Boolean).join('　・　');
    const t = label(line, 22, COLORS.ivory, { align: 'center' });
    t.anchor.set(0.5); t.x = 360; t.y = this.rowY[1] + 185; t.alpha = 0;
    this.ui.addChild(t);
    const ag = this.host.again();
    const btns: Button[] = [];
    const ws: number[] = [];
    if (ag) { const b = new Button('もう1パック', 300, 76, 'primary', ag.label, () => this.host.onAgain()); b.enabled = ag.enabled; btns.push(b); ws.push(300); }
    btns.push(new Button('閉じる', ag ? 180 : 260, 76, 'plain', undefined, () => this.host.onClose())); ws.push(ag ? 180 : 260);
    const total = ws.reduce((n, w) => n + w, 0) + (btns.length - 1) * 20;
    let x = 360 - total / 2;
    btns.forEach((b, i) => { b.x = x + ws[i] / 2; b.y = this.rowY[1] + 270; x += ws[i] + 20; b.alpha = 0; this.ui.addChild(b); });
    await Promise.all([this.tw.to(t, { alpha: 1 }, 300), ...btns.map((b) => this.tw.to(b, { alpha: b.enabled ? 1 : 0.42 }, 300))]);
  }
}
