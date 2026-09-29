import { Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { cardDef } from '../core/cards';
import type { PlayerIndex, Unit } from '../core/engine';
import { RULES } from '../core/rules';
import { cardArt, cardBack, cardFace } from './cardArt';
import { COLORS, FONTS } from './theme';
import { ease, type Tweener } from './tween';
import { label } from './ui';

const tex = new Map<string, Texture>();
export function faceTex(id: string) { let t = tex.get('f:' + id); if (!t) { t = Texture.from(cardFace(id)); tex.set('f:' + id, t); } return t; }
export function backTex() { let t = tex.get('back'); if (!t) { t = Texture.from(cardBack()); tex.set('back', t); } return t; }
function artTex(id: string) { let t = tex.get('a:' + id); if (!t) { t = Texture.from(cardArt(id, 300, 220)); tex.set('a:' + id, t); } return t; }

export const UNIT_W = 176, UNIT_H = 214;

function gem(color: number) {
  return new Graphics().poly([0, -22, 22, 0, 0, 22, -22, 0]).fill(color).poly([0, -22, 22, 0, 0, 22, -22, 0]).stroke({ color: 0xffffff, width: 2, alpha: 0.55 }).poly([0, -22, 22, 0, 0, 0, -22, 0]).fill({ color: 0xffffff, alpha: 0.12 });
}

/** A unit standing in a lane. */
export class UnitView extends Container {
  readonly uid: number;
  readonly card: string;
  readonly owner: PlayerIndex;
  private frame = new Graphics();
  private sel = new Graphics();
  private readyG = new Graphics();
  private readyTxt: Text;
  private atkTxt: Text;
  private hpTxt: Text;
  private stunG = new Graphics();
  private flashG = new Graphics();
  private pulse = 0;
  private isReady = false;
  atk: number;
  hp: number;
  private maxHp: number;

  constructor(u: Unit, owner: PlayerIndex) {
    super();
    this.uid = u.uid; this.card = u.card; this.owner = owner;
    this.atk = u.atk; this.hp = u.hp; this.maxHp = u.maxHp;
    const d = cardDef(u.card);
    const W = UNIT_W, H = UNIT_H;
    const col = owner === 0 ? COLORS.you : COLORS.foe;
    const shadow = new Graphics().roundRect(-W / 2 + 6, -H / 2 + 10, W, H, 16).fill({ color: 0x000000, alpha: 0.45 });
    this.frame.roundRect(-W / 2, -H / 2, W, H, 16).fill(COLORS.ink2);
    if (u.taunt) this.frame.roundRect(-W / 2 - 7, -H / 2 - 7, W + 14, H + 14, 20).stroke({ color: COLORS.brass, width: 5 });
    this.frame.roundRect(-W / 2, -H / 2, W, H, 16).stroke({ color: col, width: 3 });
    const art = new Sprite(artTex(u.card));
    art.anchor.set(0.5, 0);
    art.width = W - 12; art.height = 124;
    art.y = -H / 2 + 6;
    const artMask = new Graphics().roundRect(-W / 2 + 6, -H / 2 + 6, W - 12, 124, 11).fill(0xffffff);
    art.mask = artMask;
    const name = label(d.name, 18, COLORS.ivory, { font: FONTS.display, weight: '700', align: 'center' });
    name.anchor.set(0.5); name.y = H / 2 - 70;
    if (name.width > W - 16) name.scale.set((W - 16) / name.width);
    const kw = [u.taunt ? '挑発' : '', u.pierce ? '貫通' : ''].filter(Boolean).join('・');
    const kwTxt = label(kw, 13, COLORS.brass, { weight: '700', align: 'center' });
    kwTxt.anchor.set(0.5); kwTxt.y = H / 2 - 48;
    const ag = gem(COLORS.atk); ag.x = -W / 2 + 26; ag.y = H / 2 - 22;
    const hg = gem(COLORS.youDeep); hg.x = W / 2 - 26; hg.y = H / 2 - 22;
    hg.clear().poly([0, -22, 22, 0, 0, 22, -22, 0]).fill(0x2f8f5f).poly([0, -22, 22, 0, 0, 22, -22, 0]).stroke({ color: 0xffffff, width: 2, alpha: 0.55 });
    this.atkTxt = label(String(u.atk), 26, 0xffffff, { font: FONTS.num, weight: '700', align: 'center' });
    this.hpTxt = label(String(u.hp), 26, 0xffffff, { font: FONTS.num, weight: '700', align: 'center' });
    for (const [t, g] of [[this.atkTxt, ag], [this.hpTxt, hg]] as const) { t.anchor.set(0.5); t.x = g.x; t.y = g.y + 1; }
    // reload dial sits between the gems
    const rl = label(`間隔${u.reload}`, 13, COLORS.mute, { align: 'center' });
    rl.anchor.set(0.5); rl.y = H / 2 - 22;
    this.readyTxt = label('', 15, COLORS.ivory, { font: FONTS.num, weight: '700', align: 'center' });
    this.readyTxt.anchor.set(0.5);
    this.readyG.x = W / 2 - 24; this.readyG.y = -H / 2 + 24;
    this.readyTxt.x = this.readyG.x; this.readyTxt.y = this.readyG.y + 1;
    this.addChild(shadow, this.sel, this.frame, artMask, art, this.stunG, name, kwTxt, ag, hg, this.atkTxt, this.hpTxt, rl, this.readyG, this.readyTxt, this.flashG);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  setStats(atk: number, hp: number, maxHp?: number) {
    this.atk = atk; this.hp = hp; if (maxHp) this.maxHp = maxHp;
    this.atkTxt.text = String(atk);
    this.hpTxt.text = String(Math.max(0, hp));
    this.hpTxt.style.fill = hp < this.maxHp ? 0xffb3a3 : 0xffffff;
  }
  /** Ready state as seen on the owner's clock. */
  setReady(readyAt: number, ownerTime: number, reload: number) {
    const left = readyAt - ownerTime;
    this.isReady = left <= 0;
    const g = this.readyG.clear();
    if (this.isReady) {
      g.circle(0, 0, 17).fill({ color: this.owner === 0 ? COLORS.you : COLORS.foe, alpha: 0.95 });
      // crossed blades = can attack
      g.moveTo(-8, 8).lineTo(8, -8).stroke({ color: COLORS.ink, width: 3, cap: 'round' });
      g.moveTo(8, 8).lineTo(-8, -8).stroke({ color: COLORS.ink, width: 3, cap: 'round' });
      g.moveTo(-9, 3).lineTo(-3, 9).stroke({ color: COLORS.ink, width: 2 }).moveTo(9, 3).lineTo(3, 9).stroke({ color: COLORS.ink, width: 2 });
      this.readyTxt.text = '';
    } else {
      g.circle(0, 0, 17).fill(COLORS.ink).circle(0, 0, 17).stroke({ color: COLORS.mute, width: 2 });
      const frac = Math.min(1, left / Math.max(1, reload + 1));
      g.moveTo(0, 0).arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac).lineTo(0, 0).fill({ color: COLORS.mute, alpha: 0.35 });
      this.readyTxt.text = String(left);
      this.readyTxt.style.fill = COLORS.ivory;
    }
    this.stunG.clear();
    if (left > reload + 1) {
      this.stunG.roundRect(-UNIT_W / 2 + 6, -UNIT_H / 2 + 6, UNIT_W - 12, 124, 11).fill({ color: 0x6fb6ff, alpha: 0.28 });
      for (let i = -3; i <= 3; i++) this.stunG.moveTo(i * 26 - 20, -UNIT_H / 2 + 8).lineTo(i * 26 + 20, -UNIT_H / 2 + 128).stroke({ color: 0xbfe3ff, width: 2, alpha: 0.5 });
    }
  }
  get ready() { return this.isReady; }
  select(on: boolean) {
    this.sel.clear();
    if (on) this.sel.roundRect(-UNIT_W / 2 - 10, -UNIT_H / 2 - 10, UNIT_W + 20, UNIT_H + 20, 22).stroke({ color: COLORS.brass, width: 4 });
  }
  tick(ms: number) {
    this.pulse += ms / 1000;
    if (this.isReady && this.owner === 0) this.readyG.scale.set(1 + Math.sin(this.pulse * 5) * 0.08);
    else this.readyG.scale.set(1);
  }
  async flash(tw: Tweener, color: number) {
    this.flashG.clear().roundRect(-UNIT_W / 2, -UNIT_H / 2, UNIT_W, UNIT_H, 16).fill(color);
    this.flashG.alpha = 0.7; this.flashG.blendMode = 'add';
    await tw.to(this.flashG, { alpha: 0 }, 280);
  }
}

/** A card in the player's hand. */
export class HandCardView extends Container {
  readonly uid: number;
  readonly card: string;
  private sprite: Sprite;
  private glow = new Graphics();
  homeX = 0; homeY = 0; homeR = 0; homeS = 0.5;
  constructor(uid: number, card: string) {
    super();
    this.uid = uid; this.card = card;
    this.sprite = new Sprite(faceTex(card));
    this.sprite.anchor.set(0.5);
    this.glow.roundRect(-176, -244, 352, 488, 28).stroke({ color: COLORS.brass, width: 8 });
    this.glow.visible = false;
    this.addChild(this.glow, this.sprite);
    this.scale.set(0.5);
    this.eventMode = 'static';
    this.cursor = 'grab';
  }
  highlight(on: boolean) { this.glow.visible = on; }
}

/** Card back used for the opponent's hand and for flights. */
export function makeBack(): Sprite {
  const s = new Sprite(backTex());
  s.anchor.set(0.5);
  return s;
}
export function makeFace(id: string): Sprite {
  const s = new Sprite(faceTex(id));
  s.anchor.set(0.5);
  return s;
}

/** Health, deck and hand counters for one side. */
export class Hud extends Container {
  private hpTxt: Text;
  private bar = new Graphics();
  private info: Text;
  private hp: number = RULES.BASE_HP;
  readonly medal = new Container();
  private glow = new Graphics();
  private glowT = 0;
  private active = false;
  constructor(private pi: PlayerIndex, name: string) {
    super();
    const col = pi === 0 ? COLORS.you : COLORS.foe;
    const m = new Graphics();
    m.circle(0, 0, 34).fill(COLORS.ink2).circle(0, 0, 34).stroke({ color: col, width: 3 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; m.moveTo(Math.cos(a) * 26, Math.sin(a) * 26).lineTo(Math.cos(a) * 31, Math.sin(a) * 31).stroke({ color: col, width: 2, alpha: 0.7 }); }
    this.hpTxt = label(String(this.hp), 30, 0xffffff, { font: FONTS.num, weight: '700', align: 'center' });
    this.hpTxt.anchor.set(0.5);
    this.medal.addChild(m, this.hpTxt);
    this.medal.x = 44;
    this.glow.x = 44;
    const nm = label(name, 20, col, { font: FONTS.display, weight: '700' });
    nm.x = 92; nm.y = -30;
    this.info = label('', 15, COLORS.mute, {});
    this.info.x = 92; this.info.y = 12;
    this.addChild(this.glow, this.bar, this.medal, nm, this.info);
    this.drawBar();
  }
  private drawBar() {
    const g = this.bar.clear();
    const n = RULES.BASE_HP, w = 10, gap = 3;
    for (let i = 0; i < n; i++) {
      const on = i < this.hp;
      g.roundRect(92 + i * (w + gap), -2, w, 10, 2).fill({ color: on ? (this.pi === 0 ? COLORS.you : COLORS.foe) : COLORS.ink3, alpha: on ? 0.95 : 1 });
    }
  }
  /** Pulsing halo on the side whose clock is behind (the one acting). */
  setActive(on: boolean) { this.active = on; if (!on) this.glow.clear(); }
  tick(ms: number) {
    if (!this.active) return;
    this.glowT += ms / 1000;
    const a = 0.35 + 0.25 * Math.sin(this.glowT * 4);
    const col = this.pi === 0 ? COLORS.you : COLORS.foe;
    this.glow.clear().circle(0, 0, 44).stroke({ color: col, width: 6, alpha: a }).circle(0, 0, 52).stroke({ color: col, width: 3, alpha: a * 0.4 });
  }
  setHp(hp: number) { this.hp = hp; this.hpTxt.text = String(Math.max(0, hp)); this.hpTxt.style.fill = hp <= 5 ? 0xff8f7a : 0xffffff; this.drawBar(); }
  setInfo(deck: number, hand: number | null, resv: number) {
    this.info.text = `山札 ${deck}` + (hand !== null ? `　手札 ${hand}` : '') + `　予約 ${resv}/${RULES.MAX_RESV}`;
  }
  get center() { return { x: this.x + this.medal.x, y: this.y }; }
  async hit(tw: Tweener) {
    await tw.run(260, (k) => { this.medal.scale.set(1 + Math.sin(k * Math.PI) * 0.25); this.medal.rotation = Math.sin(k * Math.PI * 4) * 0.15 * (1 - k); }, ease.outCubic);
  }
}
