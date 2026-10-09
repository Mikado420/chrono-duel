import { Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { DIAL_ART, DIAL_S, DIAL_VIEW, type DialLook } from './lookArt';
import { Embers } from './lookFx';
import { isArtDial, loadDial } from './looks';
import { cardDef } from '../core/cards';
import { RULES } from '../core/rules';
import type { PlayerIndex } from '../core/engine';
import { cardArt } from './cardArt';
import { COLORS, FONTS } from './theme';
import { ease, type Tweener } from './tween';
import { label } from './ui';

const TAU = Math.PI * 2;
/** Blend two colours (k = 0 gives a, 1 gives b). */
const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

interface Pin { c: Container; pi: PlayerIndex; T: number; card: string | null; face: Container; echo: boolean; stem: Graphics }

/** Clock faces (looks bought in the shop). The plain ones change colour only; themed ones (lookArt.ts) bring a picture. */
export interface DialSkin { face: number; faceAlpha: number; rim: number; inner: number; tick: number; minor: number; num: number; star?: boolean; art?: DialLook }
export const DIAL_SKINS: Record<string, DialSkin> = {
  'dial:brass': { face: COLORS.ink2, faceAlpha: 0.9, rim: COLORS.brassDeep, inner: COLORS.line, tick: COLORS.brass, minor: COLORS.mute, num: COLORS.brass },
  'dial:verdigris': { face: 0x0c2a26, faceAlpha: 0.92, rim: 0x3fa58f, inner: 0x1f6b5c, tick: 0x8fe3c8, minor: 0x5f9f8f, num: 0x9ff0dc },
  'dial:ember': { face: 0x1d0f0b, faceAlpha: 0.92, rim: 0xc8642f, inner: 0x6e2a12, tick: 0xffb07a, minor: 0xb06a48, num: 0xffc08a },
  'dial:ivory': { face: 0x26231d, faceAlpha: 0.94, rim: 0xe9dfc8, inner: 0x6b6352, tick: 0xf6efdc, minor: 0xb5ab95, num: 0xf6efdc },
  'dial:night': { face: 0x0b1030, faceAlpha: 0.94, rim: 0xb9c6e6, inner: 0x2f3a6a, tick: 0xe6e2ff, minor: 0x8a93c4, num: 0xd6dcff, star: true },
  ...Object.fromEntries(Object.entries(DIAL_ART).map(([id, a]) => [id, { face: a.face, faceAlpha: 1, rim: a.rim, inner: a.rim, tick: a.tick, minor: a.minor, num: a.num, art: a }])),
};
/** A design-space point of a themed face, on the board. */
const D = (x: number, y: number) => ({ x: 360 + (x - 195) * DIAL_S, y: 388 + (y - 210) * DIAL_S });

/**
 * The shared clock. Two hands (yours and the opponent's) point at each side's time.
 * Reservations sit as pins outside the rim. The rim from DOOM_AT on burns red.
 */
export class Dial extends Container {
  readonly cx = 360;
  readonly cy = 388;
  readonly R = 268;
  private band = new Graphics();
  private doomBand = new Graphics();
  private ticks = new Graphics();
  private hands: [Container, Container];
  private handNum: [Text, Text];
  private handT: [number, number] = [0, 0];
  private ghost = new Container();
  private ghostNum: Text;
  private resvCursor = new Container();
  private cursorTxt: Text;
  private pins = new Map<number, Pin>();
  private plate = new Container();
  private plateMain: Text;
  private plateSub: Text;
  private plateBg = new Graphics();
  private doomLevel = 0;
  private glowT = 0;

  private skin: DialSkin;
  // themed faces
  private artC = new Container();
  private spins: { s: Sprite; speed: number }[] = [];
  private pulse: { s: Sprite; min: number; max: number; period: number } | null = null;
  private embers: Embers | null = null;
  private kick = 0;
  constructor(private tw: Tweener, skin = 'dial:brass', private motion = true) {
    super();
    this.skin = DIAL_SKINS[skin] ?? DIAL_SKINS['dial:brass'];
    this.addChild(this.artC, this.band, this.doomBand, this.ticks);
    if (isArtDial(skin)) void this.loadArt(skin);
    this.drawStatic();
    const mk = (pi: PlayerIndex) => {
      const c = new Container();
      const color = pi === 0 ? COLORS.you : COLORS.foe;
      const len = this.tipR(pi) - 14;
      const g = new Graphics();
      g.moveTo(0, 0).lineTo(len - 26, 0).stroke({ color, width: pi === 0 ? 7 : 5, alpha: 0.95, cap: 'round' });
      g.moveTo(0, 0).lineTo(len - 26, 0).stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
      g.poly([len - 30, -9, len - 8, 0, len - 30, 9]).fill(color);
      g.circle(len + 14, 0, 19).fill(COLORS.ink).circle(len + 14, 0, 19).stroke({ color, width: 3 });
      c.addChild(g);
      return c;
    };
    this.hands = [mk(0), mk(1)];
    this.handNum = [this.numLabel(COLORS.you), this.numLabel(COLORS.foe)];
    for (const pi of [1, 0] as PlayerIndex[]) {
      this.hands[pi].x = this.cx; this.hands[pi].y = this.cy;
      this.addChild(this.hands[pi]);
    }
    // ghost preview hand
    const gg = new Graphics();
    gg.moveTo(0, 0).lineTo(this.R - 44, 0).stroke({ color: COLORS.you, width: 4, alpha: 0.45 });
    gg.circle(this.R - 4, 0, 17).fill({ color: COLORS.ink, alpha: 0.85 }).circle(this.R - 4, 0, 17).stroke({ color: COLORS.you, width: 2, alpha: 0.8 });
    this.ghost.addChild(gg);
    this.ghost.x = this.cx; this.ghost.y = this.cy; this.ghost.visible = false;
    this.ghostNum = this.numLabel(COLORS.you, 18);
    this.addChild(this.ghost);
    this.addChild(this.handNum[1], this.handNum[0], this.ghostNum);
    this.ghostNum.visible = false;
    // reservation cursor
    const cg = new Graphics().poly([0, -16, 13, 0, 0, 16, -13, 0]).fill({ color: COLORS.brass, alpha: 0.9 }).stroke({ color: 0xffffff, width: 2 });
    this.cursorTxt = label('', 20, COLORS.brass, { font: FONTS.num, weight: '700' });
    this.cursorTxt.anchor.set(0.5);
    this.resvCursor.addChild(cg, this.cursorTxt);
    this.cursorTxt.y = 34;
    this.resvCursor.visible = false;
    this.addChild(this.resvCursor);
    // hub
    const hub = new Graphics().circle(this.cx, this.cy, 16).fill(COLORS.brassDeep).circle(this.cx, this.cy, 16).stroke({ color: COLORS.brass, width: 3 }).circle(this.cx, this.cy, 5).fill(COLORS.ivory);
    this.addChild(hub);
    // status plate
    this.plateMain = label('', 30, COLORS.ivory, { font: FONTS.display, weight: '700', align: 'center' });
    this.plateSub = label('', 17, COLORS.mute, { align: 'center' });
    this.plateMain.anchor.set(0.5); this.plateSub.anchor.set(0.5);
    this.plateMain.y = -12; this.plateSub.y = 22;
    this.plate.addChild(this.plateBg, this.plateMain, this.plateSub);
    this.plate.x = this.cx; this.plate.y = this.cy - 96;
    this.addChild(this.plate);
    this.setHand(0, 0, false); this.setHand(1, 0, false);
  }

  private numLabel(color: number, size = 20): Text {
    const t = label('0', size, color, { font: FONTS.num, weight: '700', align: 'center' });
    t.anchor.set(0.5);
    return t;
  }

  angleOf(t: number) { return Math.PI + (Math.min(t, RULES.END) / RULES.END) * Math.PI; }
  point(t: number, r: number) { const a = this.angleOf(t); return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r }; }
  tFromPoint(x: number, y: number): number {
    let a = Math.atan2(y - this.cy, x - this.cx);
    if (a > 0) a = x < this.cx ? -Math.PI : 0;
    return Math.round(((a + Math.PI) / Math.PI) * RULES.END);
  }
  /** Whether a point is on the clock face (used as a drop zone for reservations). */
  hit(x: number, y: number) {
    const d = Math.hypot(x - this.cx, y - this.cy);
    return y < this.cy + 10 && d > 90 && d < this.R + 70;
  }

  private drawStatic() {
    const { cx, cy, R } = this;
    const k = this.skin;
    const b = this.band.clear();
    const art = k.art;
    // face (themed faces bring their own)
    if (!art) b.moveTo(cx - R - 26, cy).arc(cx, cy, R + 26, Math.PI, TAU).lineTo(cx - R - 26, cy).fill({ color: k.face, alpha: k.faceAlpha });
    if (k.star) {
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 70; i++) { const a = Math.PI + rnd() * Math.PI, r = 40 + rnd() * (R - 20); b.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + rnd() * 1.6).fill({ color: 0xffffff, alpha: 0.25 + rnd() * 0.5 }); }
    }
    if (!art) {
      b.arc(cx, cy, R + 26, Math.PI, TAU).stroke({ color: k.rim, width: 3 });
      b.arc(cx, cy, R - 60, Math.PI, TAU).stroke({ color: k.inner, width: 1.5 });
      b.moveTo(cx - R - 26, cy).lineTo(cx + R + 26, cy).stroke({ color: k.rim, width: 3 });
    }
    // inner guilloché
    for (let i = 0; i < (art ? 0 : 36); i++) {
      const a = Math.PI + (i / 36) * Math.PI;
      b.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40).lineTo(cx + Math.cos(a) * (R - 64), cy + Math.sin(a) * (R - 64)).stroke({ color: k.inner, width: 1, alpha: 0.35 });
    }
    const t = this.ticks.clear();
    for (let i = 0; i <= RULES.END; i++) {
      const major = i % 5 === 0;
      const p1 = this.point(i, R + 22), p2 = this.point(i, R + (major ? 4 : 12));
      t.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ color: major ? k.tick : k.minor, width: major ? 3 : 1.5, alpha: major ? 1 : 0.6 });
      if (major) {
        const lp = this.point(i, R - 16);
        const text = art?.labels?.[i / 5] ?? String(i);
        const hot = art?.hot ? Math.max(0, (i - 10) / 30) : 0;
        const color = hot ? mix(k.num, 0xffb04a, Math.min(1, hot * 1.3)) : k.num;
        const tx = label(text, art?.labels ? 15 : 17, color, { font: art?.numFont === 'display' ? FONTS.display : FONTS.num, weight: '700' });
        if (art?.italic) tx.style.fontStyle = 'italic';
        if (art?.numStroke !== undefined) tx.style.stroke = { color: art.numStroke, width: 4, join: 'round' };
        tx.anchor.set(0.5); tx.x = lp.x; tx.y = lp.y + (i === 0 || i === RULES.END ? -10 : 0);
        this.addChild(tx);
      }
    }
    for (const bell of art ? [] : RULES.BELLS) {
      const p = this.point(bell, R - 40);
      const g = new Graphics();
      g.moveTo(-8, 6).bezierCurveTo(-7, -2, -6, -9, 0, -9).bezierCurveTo(6, -9, 7, -2, 8, 6).closePath().fill({ color: k.tick, alpha: 0.85 });
      g.circle(0, 8, 2.5).fill(k.tick);
      g.x = p.x; g.y = p.y;
      this.addChild(g);
    }
    const dp = this.point(RULES.DOOM_AT, R + 44);
    const dl = label('終焉', 15, COLORS.doom, { font: FONTS.display, weight: '700' });
    dl.anchor.set(0.5); dl.x = dp.x; dl.y = dp.y;
    this.addChild(dl);
    this.drawDoom();
  }

  private drawDoom() {
    const { cx, cy, R } = this;
    const a0 = this.angleOf(RULES.DOOM_AT), a1 = TAU;
    const alpha = this.doomLevel ? 0.55 + 0.25 * Math.sin(this.glowT * 3) : 0.22;
    this.doomBand.clear().arc(cx, cy, R + 13, a0, a1).stroke({ color: COLORS.doom, width: 18 + this.doomLevel * 2, alpha });
  }
  /** Builds the themed face once its pictures are ready. */
  private async loadArt(id: string) {
    const a = DIAL_ART[id].art;
    const cv = await loadDial(id).catch(() => null);
    if (!cv || this.destroyed) return;
    const top = D(DIAL_VIEW.x, DIAL_VIEW.y);
    const full = (c: HTMLCanvasElement) => { const s = new Sprite(Texture.from(c)); s.x = top.x; s.y = top.y; s.width = DIAL_VIEW.w * DIAL_S; s.height = DIAL_VIEW.h * DIAL_S; return s; };
    this.artC.addChild(full(cv.under));
    if (cv.spins.length) {
      const sc = new Container();
      const m = new Graphics().moveTo(this.cx - (a.clip ?? 150) * DIAL_S, this.cy).arc(this.cx, this.cy, (a.clip ?? 150) * DIAL_S, Math.PI, TAU).closePath().fill(0xffffff);
      sc.mask = m;
      cv.spins.forEach((c, i) => {
        const l = a.spins![i];
        const s = new Sprite(Texture.from(c)); s.anchor.set(0.5);
        const p = D(l.cx, l.cy); s.x = p.x; s.y = p.y; s.width = s.height = l.r * 2 * DIAL_S;
        sc.addChild(s);
        this.spins.push({ s, speed: l.speed });
      });
      this.artC.addChild(m, sc);
    }
    if (cv.pulse && a.pulse) { const s = full(cv.pulse); this.artC.addChild(s); this.pulse = { s, ...a.pulse }; s.alpha = a.pulse.max; }
    this.artC.addChild(full(cv.over));
    if (a.embers && this.motion) {
      // sparks off the heated rim (from DOOM_AT to the end)
      this.embers = new Embers(() => { const t = RULES.DOOM_AT + Math.random() * (RULES.END - RULES.DOOM_AT); const p = this.point(t, this.R + 8 + Math.random() * 14); return p; }, 5, 2.6);
      this.artC.addChild(this.embers);
    }
    this.artC.alpha = 0;
    void this.tw.run(300, (k) => { this.artC.alpha = k; });
  }

  tick(ms: number) {
    this.glowT += ms / 1000;
    if (this.motion && this.spins.length) {
      const step = this.kick * Math.min(1, ms / 250);
      this.kick -= step;
      for (const p of this.spins) p.s.rotation += p.speed * (ms / 1000) + Math.sign(p.speed) * step / Math.max(0.5, Math.abs(p.speed) * 6);
    }
    if (this.pulse) { const k = this.motion ? 0.5 + 0.5 * Math.sin((this.glowT / this.pulse.period) * TAU) : 1; this.pulse.s.alpha = this.pulse.min + (this.pulse.max - this.pulse.min) * k; }
    this.embers?.tick(ms);
    if (this.doomLevel) this.drawDoom();
    for (const p of this.pins.values()) if (p.pi === 1 && !p.card) p.face.rotation = Math.sin(this.glowT * 2 + p.T) * 0.12;
  }
  setDoom(level: number) { this.doomLevel = level; this.drawDoom(); }

  /** Rotate a hand to `t`, ticking through each step for the clockwork feel. */
  async setHand(pi: PlayerIndex, t: number, animate = true, onStep?: () => void) {
    const from = this.handT[pi];
    this.handT[pi] = t;
    const put = (v: number) => {
      this.hands[pi].rotation = this.angleOf(v);
      const p = this.point(v, this.tipR(pi));
      this.handNum[pi].x = p.x; this.handNum[pi].y = p.y;
      this.handNum[pi].text = String(Math.round(v));
    };
    if (!animate || from === t) { put(t); return; }
    const steps = Math.abs(t - from);
    this.kick += Math.min(steps, 12) * 0.05;
    const dur = Math.min(900, 160 + steps * 90);
    let last = Math.round(from);
    await this.tw.run(dur, (k) => {
      const v = from + (t - from) * k;
      put(v);
      const r = Math.round(v);
      if (r !== last) { last = r; onStep?.(); }
    }, ease.inOutCubic);
    put(t);
  }
  handTip(pi: PlayerIndex) { return this.point(this.handT[pi], this.tipR(pi)); }
  tipR(pi: PlayerIndex) { return pi === 0 ? this.R - 4 : this.R - 62; }

  showGhost(t: number | null) {
    if (t === null) { this.ghost.visible = false; this.ghostNum.visible = false; return; }
    this.ghost.visible = true; this.ghostNum.visible = true;
    this.ghost.rotation = this.angleOf(t);
    const p = this.point(t, this.R - 4);
    this.ghostNum.x = p.x; this.ghostNum.y = p.y; this.ghostNum.text = String(t);
  }
  showCursor(T: number | null, ok = true) {
    if (T === null) { this.resvCursor.visible = false; return; }
    this.resvCursor.visible = true;
    const p = this.point(T, this.R + 44);
    this.resvCursor.x = p.x; this.resvCursor.y = p.y;
    this.cursorTxt.text = ok ? `${T}刻に予約` : '予約できない時刻';
    this.cursorTxt.style.fill = ok ? COLORS.brass : COLORS.foe;
    this.resvCursor.alpha = ok ? 1 : 0.6;
  }
  setStatus(main: string, sub: string, tone: 'you' | 'foe' | 'neutral') {
    this.plateMain.text = main;
    this.plateSub.text = sub;
    const w = Math.max(260, this.plateMain.width + 60, this.plateSub.width + 50);
    const col = tone === 'you' ? COLORS.you : tone === 'foe' ? COLORS.foe : COLORS.brassDeep;
    this.plateMain.style.fill = tone === 'you' ? COLORS.you : tone === 'foe' ? COLORS.foe : COLORS.ivory;
    this.plateBg.clear().roundRect(-w / 2, -40, w, 80, 16).fill({ color: COLORS.ink, alpha: 0.9 }).roundRect(-w / 2, -40, w, 80, 16).stroke({ color: col, width: 2, alpha: 0.9 });
  }

  // ---------------------------------------------------------- pins
  /** Where a pin for time T goes. Pins sharing a time fan out so none hides another. */
  pinPoint(T: number, pi: PlayerIndex, echo = false, skip?: number) {
    const same = [...this.pins.entries()].filter(([u, p]) => p.T === T && u !== skip).length;
    const off = same === 0 ? 0 : (same % 2 ? 1 : -1) * Math.ceil(same / 2) * 0.62 * (pi === 0 ? -1 : 1);
    void echo;
    return this.point(T + off, this.R + 46);
  }
  addPin(uid: number, pi: PlayerIndex, T: number, card: string | null, echo = false) {
    const c = new Container();
    const p = this.pinPoint(T, pi, echo);
    c.x = p.x; c.y = p.y;
    const stem = new Graphics();
    const face = new Container();
    this.drawPinFace(face, pi, card, echo);
    c.addChild(stem, face);
    c.eventMode = 'static'; c.cursor = 'pointer';
    this.addChild(c);
    const pin = { c, pi, T, card, face, echo, stem };
    this.pins.set(uid, pin);
    this.drawStem(pin);
    return c;
  }
  private drawStem(p: Pin) {
    const inner = this.point(p.T, this.R + 20);
    const color = p.pi === 0 ? COLORS.you : COLORS.foe;
    p.stem.clear().moveTo(inner.x - p.c.x, inner.y - p.c.y).lineTo(0, 0).stroke({ color, width: p.echo ? 1.5 : 2, alpha: p.echo ? 0.55 : 0.8 });
  }
  /** Slides a pin to a new time (残響術士 pulls the future closer). */
  async movePin(uid: number, T: number) {
    const p = this.pins.get(uid);
    if (!p) return;
    const to = this.pinPoint(T, p.pi, p.echo, uid);
    const fx = p.c.x, fy = p.c.y;
    p.T = T;
    await this.tw.run(420, (k) => { p.c.x = fx + (to.x - fx) * k; p.c.y = fy + (to.y - fy) * k; this.drawStem(p); });
  }
  private drawPinFace(face: Container, pi: PlayerIndex, card: string | null, echo = false) {
    face.removeChildren().forEach((ch) => ch.destroy());
    const color = pi === 0 ? COLORS.you : COLORS.foe;
    if (echo) {
      // echoes: round, smaller, with a ripple, and always face up
      const g = new Graphics().circle(0, 0, 16).fill(COLORS.ink).circle(0, 0, 16).stroke({ color, width: 2.5 });
      g.arc(0, 0, 21, -0.9, 0.9).stroke({ color, width: 1.5, alpha: 0.7 }).arc(0, 0, 21, Math.PI - 0.9, Math.PI + 0.9).stroke({ color, width: 1.5, alpha: 0.7 });
      face.addChild(g);
      if (card) {
        const s = new Sprite(Texture.from(cardArt(card, 80, 80)));
        s.anchor.set(0.5); s.width = 26; s.height = 26;
        const m = new Graphics().circle(0, 0, 13).fill(0xffffff);
        s.mask = m; s.alpha = 0.85;
        face.addChild(m, s);
      }
      return;
    }
    const g = new Graphics().poly([0, -22, 20, 0, 0, 22, -20, 0]).fill(COLORS.ink).poly([0, -22, 20, 0, 0, 22, -20, 0]).stroke({ color, width: 3 });
    face.addChild(g);
    if (card) {
      const s = new Sprite(Texture.from(cardArt(card, 80, 80)));
      s.anchor.set(0.5); s.width = 26; s.height = 26;
      const m = new Graphics().poly([0, -19, 17, 0, 0, 19, -17, 0]).fill(0xffffff);
      s.mask = m;
      face.addChild(m, s);
    } else {
      const q = label('?', 24, color, { font: FONTS.num, weight: '700' });
      q.anchor.set(0.5);
      face.addChild(q);
    }
  }
  pinInfo(uid: number) { return this.pins.get(uid); }
  pinAt(uid: number) { const p = this.pins.get(uid); return p ? { x: p.c.x, y: p.c.y } : null; }
  revealPin(uid: number, card: string) {
    const p = this.pins.get(uid);
    if (!p) return;
    p.card = card;
    this.drawPinFace(p.face, p.pi, card, p.echo);
    void this.tw.run(360, (k) => p.face.scale.set(1 + Math.sin(k * Math.PI) * 0.6));
  }
  async removePin(uid: number, mode: 'fire' | 'break') {
    const p = this.pins.get(uid);
    if (!p) return;
    this.pins.delete(uid);
    if (mode === 'fire') await this.tw.run(260, (k) => { p.c.scale.set(1 + k); p.c.alpha = 1 - k; });
    else await this.tw.run(300, (k) => { p.c.rotation = k * 2; p.c.scale.set(1 - k); p.c.alpha = 1 - k; });
    p.c.destroy({ children: true });
  }
  pinsFor(pi: PlayerIndex) { return [...this.pins.entries()].filter(([, p]) => p.pi === pi); }
  clearPins() { for (const p of this.pins.values()) p.c.destroy({ children: true }); this.pins.clear(); }
  describePin(uid: number) {
    const p = this.pins.get(uid);
    if (!p) return '';
    return p.card ? `${cardDef(p.card).name}${p.echo ? 'の残響' : ''}（${p.T}刻）` : `相手の予約（${p.T}刻）`;
  }
}
