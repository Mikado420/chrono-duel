import { Container, FederatedPointerEvent, Graphics, type Sprite, type Ticker } from 'pixi.js';
import { chooseAction, type AiLevel } from '../core/ai';
import { cardDef } from '../core/cards';
import {
  actor, apply, attackTarget, createGame, other, resvRange,
  type Action, type GameEvent, type GameState, type PlayerIndex, type Target,
} from '../core/engine';
import { RULES } from '../core/rules';
import { audio } from './audio';
import { Dial } from './dial';
import type { Fx } from './fx';
import { COLORS } from './theme';
import { ease, type Tweener } from './tween';
import { Button, label } from './ui';
import { HandCardView, Hud, UnitView, UNIT_H, UNIT_W, makeBack, makeFace } from './views';

export interface BattleConfig {
  myDeck: string[];
  myDeckName: string;
  aiDeck: string[];
  aiDeckName: string;
  level: AiLevel;
  seed?: number;
}
export interface BattleResult { winner: PlayerIndex | -1; reason: 'ko' | 'time' | 'surrender'; myHp: number; foeHp: number; actions: number }

const LANE_X = [150, 360, 570];
/** Vertical layout in design units. Tall phones get extra height, which is shared out by `applyLayout`. */
const L = { front: 647, youHud: 922, hand: 1128, bar: 1112 };
const ROW_Y: Record<PlayerIndex, number> = { 1: 522, 0: 772 };
const DECK_POS = { x: 58, y: 1040 };
const FOE_HAND_POS = { x: 640, y: 40 };

type Mode =
  | { k: 'idle' }
  | { k: 'lane'; uid: number }
  | { k: 'resv'; uid: number; T: number }
  | { k: 'attack'; lane: number };

/** The match screen: board, hands, clock, and the event-driven animation player. */
export class BattleScene extends Container {
  private s!: GameState;
  private dial: Dial;
  private board = new Container();
  private slotG = new Graphics();
  private units = new Container();
  private handLayer = new Container();
  private foeHandLayer = new Container();
  private overlay = new Container();
  private arrowG = new Graphics();
  private huds: [Hud, Hud];
  private unitViews = new Map<number, UnitView>();
  private handViews = new Map<number, HandCardView>();
  private drawBtn: Button;
  private waitBtn: Button;
  private menuBtn: Container;
  private busy = true;
  private mode: Mode = { k: 'idle' };
  private drag: { view: HandCardView; sx: number; sy: number; moved: boolean; ox: number; oy: number } | null = null;
  private unitDrag: { lane: number; sx: number; sy: number; moved: boolean } | null = null;
  private flyFrom: { x: number; y: number } | null = null;
  private toastC = new Container();
  private modal: Container | null = null;
  private actionBar = new Container();
  private destroyed_ = false;
  private vignette = new Graphics();

  constructor(private tw: Tweener, private fx: Fx, private ticker: Ticker, private cfg: BattleConfig, private onEnd: (r: BattleResult) => void, private onMenu: () => void, private onLog: (text: string, side: PlayerIndex | -1) => void = () => {}) {
    super();
    this.dial = new Dial(tw);
    this.huds = [new Hud(0, 'あなた'), new Hud(1, `AI ・ ${cfg.aiDeckName}`)];
    this.huds[1].x = 16; this.huds[1].y = 44;
    this.huds[0].x = 16;
    this.drawBtn = new Button('ドロー', 124, 66, 'plain', `${RULES.COST_DRAW}刻`, () => this.tryAction({ t: 'draw' }));
    this.waitBtn = new Button('待機', 124, 66, 'plain', `${RULES.COST_WAIT}刻`, () => this.tryAction({ t: 'wait' }));
    this.drawBtn.x = 510;
    this.waitBtn.x = 648;
    this.menuBtn = this.makeMenuButton();
    this.board.addChild(this.slotG, this.laneHi);
    this.applyLayout(0);
    this.addChild(this.vignette, this.board, this.dial, this.units, this.huds[0], this.huds[1], this.foeHandLayer, this.drawBtn, this.waitBtn, this.menuBtn, this.handLayer, this.arrowG, this.actionBar, this.overlay, this.toastC);
    this.eventMode = 'static';
    this.hitArea = { contains: () => true };
    this.on('globalpointermove', (e) => this.onMove(e));
    this.on('pointerup', (e) => this.onUp(e));
    this.on('pointerupoutside', (e) => this.onUp(e));
    this.on('pointertap', (e) => this.onBackgroundTap(e));
    ticker.add(this.tickFn);
    void this.start();
  }

  private tickFn = (t: Ticker) => {
    this.dial.tick(t.deltaMS);
    for (const v of this.unitViews.values()) v.tick(t.deltaMS);
    this.huds[0].tick(t.deltaMS); this.huds[1].tick(t.deltaMS);
  };

  override destroy() {
    this.destroyed_ = true;
    this.ticker.remove(this.tickFn);
    super.destroy({ children: true });
  }

  // ------------------------------------------------------------------ setup
  private makeMenuButton() {
    const c = new Container();
    const g = new Graphics().circle(0, 0, 26).fill({ color: COLORS.ink2, alpha: 0.9 }).circle(0, 0, 26).stroke({ color: COLORS.brassDeep, width: 2 });
    for (const y of [-8, 0, 8]) g.roundRect(-11, y - 1.5, 22, 3, 1.5).fill(COLORS.ivory);
    c.addChild(g);
    c.x = 686; c.y = 40;
    c.eventMode = 'static'; c.cursor = 'pointer';
    c.on('pointertap', (e) => { e.stopPropagation(); audio.play('select'); this.onMenu(); });
    return c;
  }

  /** Spread the lower half of the board over any extra height a tall screen offers. */
  applyLayout(extra: number) {
    const e = Math.max(0, Math.min(extra, 320));
    L.front = 647 + e * 0.12; ROW_Y[0] = 772 + e * 0.24; L.youHud = 922 + e * 0.42; L.hand = 1128 + e * 0.8; L.bar = 1112 + e * 0.8; DECK_POS.y = 1040 + e * 0.7;
    this.huds[0].y = L.youHud; this.drawBtn.y = L.youHud; this.waitBtn.y = L.youHud;
    this.buildBoard();
    if (this.s) this.syncAll(false);
  }

  private buildBoard() {
    const g = this.slotG.clear();
    for (const pi of [0, 1] as PlayerIndex[]) {
      for (const x of LANE_X) {
        const y = ROW_Y[pi];
        g.roundRect(x - UNIT_W / 2 - 4, y - UNIT_H / 2 - 4, UNIT_W + 8, UNIT_H + 8, 18).fill({ color: COLORS.ink2, alpha: 0.55 });
        g.roundRect(x - UNIT_W / 2 - 4, y - UNIT_H / 2 - 4, UNIT_W + 8, UNIT_H + 8, 18).stroke({ color: pi === 0 ? COLORS.youDeep : COLORS.foeDeep, width: 2, alpha: 0.7 });
      }
    }
    // front line
    g.moveTo(24, L.front).lineTo(696, L.front).stroke({ color: COLORS.brassDeep, width: 2, alpha: 0.7 });
    for (let x = 40; x < 690; x += 28) g.circle(x, L.front, 2).fill({ color: COLORS.brass, alpha: 0.7 });
  }
  private laneHi = new Graphics();
  private showLaneHi(lanes: number[], color: number = COLORS.brass) {
    const g = this.laneHi.clear();
    for (const l of lanes) {
      g.roundRect(LANE_X[l] - UNIT_W / 2 - 8, ROW_Y[0] - UNIT_H / 2 - 8, UNIT_W + 16, UNIT_H + 16, 20).fill({ color, alpha: 0.14 });
      g.roundRect(LANE_X[l] - UNIT_W / 2 - 8, ROW_Y[0] - UNIT_H / 2 - 8, UNIT_W + 16, UNIT_H + 16, 20).stroke({ color, width: 4 });
    }
  }

  private async start() {
    const seed = this.cfg.seed ?? Math.floor(Math.random() * 1e9);
    const first = (Math.random() < 0.5 ? 0 : 1) as PlayerIndex;
    const { state } = createGame([this.cfg.myDeck, this.cfg.aiDeck], seed, first);
    this.s = state;
    this.syncAll(false);
    // deal animation for the opening hand
    for (const v of this.handViews.values()) { v.alpha = 0; }
    await this.tw.wait(200);
    let i = 0;
    for (const v of this.handViews.values()) {
      v.x = DECK_POS.x; v.y = DECK_POS.y; v.alpha = 1; v.scale.set(0.2);
      void this.tw.to(v, { x: v.homeX, y: v.homeY, rotation: v.homeR }, 420, ease.outCubic);
      void this.tw.to(v.scale, { x: v.homeS, y: v.homeS }, 420, ease.outBack);
      audio.play('draw');
      await this.tw.wait(110 + i++ * 10);
    }
    await this.tw.wait(350);
    await this.fx.banner(first === 0 ? 'あなたが先手' : 'AIが先手', '時計が遅れている方が行動します', first === 0 ? COLORS.you : COLORS.foe, 360, 640);
    await this.loop();
  }

  // ------------------------------------------------------------------ turn loop
  private async loop() {
    while (!this.destroyed_ && !this.s.over) {
      const a = actor(this.s);
      if (a === 1) {
        this.busy = true;
        this.refreshControls();
        await this.tw.wait(420);
        const act = chooseAction(this.s, 1, this.cfg.level);
        const ev = apply(this.s, act);
        await this.play(ev);
      } else if (a === 0) {
        this.busy = false;
        this.refreshControls();
        return;
      } else break;
    }
    if (this.s.over && !this.destroyed_) await this.finish();
  }

  private async tryAction(a: Action) {
    if (this.busy || actor(this.s) !== 0) { audio.play('deny'); return; }
    this.setMode({ k: 'idle' });
    this.closeModal();
    this.busy = true;
    this.refreshControls();
    const ev = apply(this.s, a);
    await this.play(ev);
    await this.loop();
  }

  private async finish() {
    this.busy = true;
    this.refreshControls();
    const o = this.s.over!;
    await this.tw.wait(500);
    this.onEnd({ winner: o.winner, reason: o.reason, myHp: this.s.players[0].hp, foeHp: this.s.players[1].hp, actions: this.s.actions });
  }
  /** Test hook (only exposed with #debug in the URL). */
  debug() { return { s: this.s, busy: this.busy, mode: this.mode.k, act: (a: Action) => this.tryAction(a), auto: () => chooseAction(this.s, 0, 'normal') }; }
  surrender() {
    if (this.s.over) return;
    this.busy = true;
    this.onEnd({ winner: 1, reason: 'surrender', myHp: this.s.players[0].hp, foeHp: this.s.players[1].hp, actions: this.s.actions });
  }

  // ------------------------------------------------------------------ sync
  private handLayout(n: number) {
    const sp = n <= 1 ? 0 : Math.min(150, 540 / (n - 1));
    const x0 = 360 - ((n - 1) * sp) / 2;
    return (i: number) => {
      const off = i - (n - 1) / 2;
      return { x: x0 + i * sp, y: L.hand + Math.abs(off) * Math.abs(off) * 3.2, r: off * 0.045 };
    };
  }
  private layoutHand(animate = true) {
    const hand = this.s.players[0].hand.filter((h) => this.handViews.has(h.uid));
    const pos = this.handLayout(hand.length);
    hand.forEach((h, i) => {
      const v = this.handViews.get(h.uid)!;
      const p = pos(i);
      const selected = (this.mode.k === 'lane' || this.mode.k === 'resv') && this.mode.uid === h.uid;
      v.homeX = p.x; v.homeY = p.y - (selected ? 46 : 0); v.homeR = selected ? 0 : p.r; v.homeS = selected ? 0.66 : 0.6;
      v.highlight(selected);
      this.handLayer.setChildIndex(v, Math.min(i, this.handLayer.children.length - 1));
      if (this.drag?.view === v) return;
      if (animate) { void this.tw.to(v, { x: v.homeX, y: v.homeY, rotation: v.homeR }, 260); void this.tw.to(v.scale, { x: v.homeS, y: v.homeS }, 260); }
      else { v.x = v.homeX; v.y = v.homeY; v.rotation = v.homeR; v.scale.set(v.homeS); }
    });
  }
  private layoutFoeHand() {
    const n = this.s.players[1].hand.length;
    while (this.foeHandLayer.children.length < n) { const b = makeBack(); b.scale.set(0.14); this.foeHandLayer.addChild(b); }
    while (this.foeHandLayer.children.length > n) this.foeHandLayer.removeChildAt(this.foeHandLayer.children.length - 1).destroy();
    this.foeHandLayer.children.forEach((c, i) => {
      const off = i - (n - 1) / 2;
      c.x = FOE_HAND_POS.x - 70 + off * 18 - 40; c.y = FOE_HAND_POS.y + Math.abs(off) * 1.5; c.rotation = off * 0.08;
    });
  }
  private addHandView(uid: number, card: string) {
    const v = new HandCardView(uid, card);
    v.on('pointerdown', (e) => this.onCardDown(v, e));
    this.handViews.set(uid, v);
    this.handLayer.addChild(v);
    return v;
  }
  private addUnitView(pi: PlayerIndex, lane: number) {
    const u = this.s.players[pi].field[lane]!;
    const v = new UnitView(u, pi);
    v.x = LANE_X[lane]; v.y = ROW_Y[pi];
    v.on('pointerdown', (e) => this.onUnitDown(v, e));
    this.unitViews.set(u.uid, v);
    this.units.addChild(v);
    return v;
  }
  private viewAt(pi: PlayerIndex, lane: number): UnitView | undefined {
    const u = this.s.players[pi].field[lane];
    if (u) return this.unitViews.get(u.uid);
    for (const v of this.unitViews.values()) if (v.owner === pi && Math.abs(v.x - LANE_X[lane]) < 2) return v;
    return undefined;
  }

  /** Reconcile every view with the true game state (safety net after animations). */
  private syncAll(animate = true) {
    const s = this.s;
    const alive = new Set<number>();
    for (const pi of [0, 1] as PlayerIndex[]) {
      const p = s.players[pi];
      p.field.forEach((u, l) => {
        if (!u) return;
        alive.add(u.uid);
        let v = this.unitViews.get(u.uid);
        if (!v) v = this.addUnitView(pi, l);
        v.x = LANE_X[l]; v.y = ROW_Y[pi]; v.alpha = 1; v.scale.set(1); v.rotation = 0;
        v.setStats(u.atk, u.hp, u.maxHp);
        v.setReady(u.readyAt, p.time, u.reload);
      });
      this.huds[pi].setHp(p.hp);
      this.huds[pi].setInfo(p.deck.length, pi === 1 ? p.hand.length : null, p.resv.length);
      void this.dial.setHand(pi, p.time, false);
      // pins
      const want = new Set(p.resv.map((r) => r.uid));
      for (const [uid] of this.dial.pinsFor(pi)) if (!want.has(uid)) void this.dial.removePin(uid, 'fire');
      for (const r of p.resv) {
        const info = this.dial.pinInfo(r.uid);
        const show = pi === 0 || r.revealed ? r.card : null;
        if (!info) this.dial.addPin(r.uid, pi, r.T, show).on('pointertap', (e) => { e.stopPropagation(); this.onPinTap(r.uid); });
        else if (show && !info.card) this.dial.revealPin(r.uid, show);
      }
    }
    for (const [uid, v] of this.unitViews) if (!alive.has(uid)) { v.destroy({ children: true }); this.unitViews.delete(uid); }
    // hand
    const hand = new Set(s.players[0].hand.map((h) => h.uid));
    for (const [uid, v] of this.handViews) if (!hand.has(uid)) { v.destroy({ children: true }); this.handViews.delete(uid); }
    for (const h of s.players[0].hand) if (!this.handViews.has(h.uid)) this.addHandView(h.uid, h.card);
    this.layoutHand(animate);
    this.layoutFoeHand();
    this.dial.setDoom(s.doom);
    this.drawVignette();
    this.refreshControls();
  }

  private drawVignette() {
    const lv = this.s.doom;
    const g = this.vignette.clear();
    if (!lv) return;
    for (let i = 0; i < 6; i++) g.rect(-400 + i * 12, -400 + i * 12, 1520 - i * 24, 2080 - i * 24).stroke({ color: COLORS.doom, width: 24, alpha: 0.05 * lv });
  }

  private refreshControls() {
    if (!this.s) return;
    const mine = !this.busy && actor(this.s) === 0 && !this.s.over;
    this.drawBtn.enabled = mine && this.s.players[0].deck.length > 0;
    this.waitBtn.enabled = mine;
    const who = this.s.over ? -1 : actor(this.s);
    this.huds[0].setActive(who === 0); this.huds[1].setActive(who === 1);
    const [y, f] = this.s.players;
    if (this.s.over) this.dial.setStatus('決着', '', 'neutral');
    else if (actor(this.s) === 1) this.dial.setStatus('AIの番', `AI ${f.time}刻 ・ あなた ${y.time}刻`, 'foe');
    else if (this.mode.k === 'idle' && !this.drag) this.dial.setStatus('あなたの番', this.clockLine(), 'you');
    for (const v of this.handViews.values()) v.alpha = mine || this.busy ? 1 : 0.8;
  }
  private clockLine() {
    const [y, f] = this.s.players;
    const lead = f.time - y.time;
    if (lead > 0) return `あなた ${y.time}刻 ・ AI ${f.time}刻（あと${lead}刻は連続で動ける）`;
    return `あなた ${y.time}刻 ・ AI ${f.time}刻（同刻）`;
  }
  /** Preview of where your hand lands if you spend `cost`. */
  private forecast(cost: number) {
    const [y, f] = this.s.players;
    const t = y.time + cost;
    this.dial.showGhost(Math.min(t, RULES.END));
    const next = t < f.time ? 'まだあなたの番' : t === f.time ? '同刻 → AIの番' : `AIの番（AIが${t - f.time}刻先行を取り返すまで）`;
    this.dial.setStatus(`${cost}刻 使う`, `使用後 ${t}刻 → ${next}`, 'you');
  }
  private clearForecast() { this.dial.showGhost(null); this.refreshControls(); }

  // ------------------------------------------------------------------ input
  private setMode(m: Mode) {
    const prev = this.mode;
    this.mode = m;
    if (prev.k === 'attack') this.viewAt(0, prev.lane)?.select(false);
    this.arrowG.clear();
    this.laneHi.clear();
    this.dial.showCursor(null);
    this.actionBar.removeChildren().forEach((c) => c.destroy({ children: true }));
    // tuck the hand away while a choice is pending so the action bar has room
    const tuck = m.k !== 'idle';
    void this.tw.to(this.handLayer, { y: tuck ? 190 : 0, alpha: tuck ? 0.55 : 1 }, 220);
    if (m.k === 'idle') { this.clearForecast(); this.layoutHand(); return; }
    if (m.k === 'lane') {
      const h = this.s.players[0].hand.find((x) => x.uid === m.uid)!;
      this.forecast(cardDef(h.card).cost);
      this.showLaneHi(this.emptyLanes());
      this.bar([['やめる', 'plain', () => this.setMode({ k: 'idle' })]], '召喚するレーンをタップ');
    }
    if (m.k === 'resv') {
      const h = this.s.players[0].hand.find((x) => x.uid === m.uid)!;
      const d = cardDef(h.card);
      this.forecast(d.cost);
      this.dial.showCursor(m.T, true);
      this.bar([
        ['−', 'plain', () => this.nudgeResv(-1)],
        ['やめる', 'plain', () => this.setMode({ k: 'idle' })],
        [`${m.T}刻に予約`, 'primary', () => this.tryAction({ t: 'reserve', hand: m.uid, T: m.T })],
        ['＋', 'plain', () => this.nudgeResv(1)],
      ], '時計をタップ／ドラッグして発動時刻を選ぶ');
    }
    if (m.k === 'attack') {
      const v = this.viewAt(0, m.lane);
      v?.select(true);
      this.forecast(RULES.COST_ATTACK);
      this.drawAttackArrow(m.lane, null);
      this.bar([['やめる', 'plain', () => this.setMode({ k: 'idle' })], [`攻撃する`, 'primary', () => this.tryAction({ t: 'attack', lane: m.lane })]], this.attackPreview(m.lane));
    }
    this.layoutHand();
  }
  private bar(btns: [string, 'plain' | 'primary', () => void][], hint: string) {
    const c = this.actionBar;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    const bg = new Graphics().roundRect(-340, -58, 680, 116, 22).fill({ color: COLORS.ink, alpha: 0.92 }).roundRect(-340, -58, 680, 116, 22).stroke({ color: COLORS.brassDeep, width: 2 });
    const t = label(hint, 18, COLORS.ivory, { align: 'center' });
    t.anchor.set(0.5); t.y = -32;
    c.addChild(bg, t);
    const widths = btns.map(([s]) => (s.length <= 1 ? 64 : Math.max(130, 36 + s.length * 21)));
    const total = widths.reduce((a, b) => a + b, 0) + (btns.length - 1) * 14;
    let x = -total / 2;
    btns.forEach(([s, tone, fn], i) => {
      const b = new Button(s, widths[i], 54, tone, undefined, fn);
      b.x = x + widths[i] / 2; b.y = 18;
      x += widths[i] + 14;
      c.addChild(b);
    });
    c.x = 360; c.y = L.bar;
  }
  private nudgeResv(d: number) {
    if (this.mode.k !== 'resv') return;
    const h = this.s.players[0].hand.find((x) => x.uid === (this.mode as { uid: number }).uid)!;
    const r = resvRange(this.s, 0, cardDef(h.card).cost)!;
    const T = Math.max(r[0], Math.min(r[1], this.mode.T + d));
    this.setMode({ k: 'resv', uid: this.mode.uid, T });
  }
  private emptyLanes() { return this.s.players[0].field.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0); }
  private laneAt(x: number, y: number): number {
    if (Math.abs(y - ROW_Y[0]) > UNIT_H / 2 + 30) return -1;
    let best = -1, bd = 1e9;
    LANE_X.forEach((lx, i) => { const d = Math.abs(x - lx); if (d < bd && d < UNIT_W / 2 + 20) { bd = d; best = i; } });
    return best;
  }
  private local(e: FederatedPointerEvent) { return this.toLocal(e.global); }

  private onCardDown(v: HandCardView, e: FederatedPointerEvent) {
    e.stopPropagation();
    audio.unlock();
    if (this.modal) return;
    const p = this.local(e);
    this.drag = { view: v, sx: p.x, sy: p.y, moved: false, ox: v.x - p.x, oy: v.y - p.y };
  }
  private onUnitDown(v: UnitView, e: FederatedPointerEvent) {
    e.stopPropagation();
    audio.unlock();
    if (this.modal) return;
    const lane = LANE_X.findIndex((x) => Math.abs(x - v.x) < 2);
    if (v.owner === 0 && v.ready && !this.busy && actor(this.s) === 0) {
      const p = this.local(e);
      this.unitDrag = { lane, sx: p.x, sy: p.y, moved: false };
    } else {
      this.unitDrag = null;
      this.inspectUnit(v);
    }
  }
  private onMove(e: FederatedPointerEvent) {
    const p = this.local(e);
    if (this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 14) {
        if (this.busy || actor(this.s) !== 0) { this.drag = null; return; }
        d.moved = true;
        this.setMode({ k: 'idle' });
        this.handLayer.setChildIndex(d.view, this.handLayer.children.length - 1);
        void this.tw.to(d.view.scale, { x: 0.5, y: 0.5 }, 120);
        d.view.rotation = 0;
        const def = cardDef(d.view.card);
        this.forecast(def.cost);
        if (def.kind === 'unit') this.showLaneHi(this.emptyLanes());
      }
      if (d.moved) {
        d.view.x = p.x + d.ox * 0.4; d.view.y = p.y + d.oy * 0.4;
        const def = cardDef(d.view.card);
        if (def.kind === 'unit') {
          const l = this.laneAt(p.x, p.y);
          this.showLaneHi(this.emptyLanes(), COLORS.brass);
          if (l >= 0 && !this.s.players[0].field[l]) this.showLaneHi([l], COLORS.you);
        } else {
          const r = this.s.players[0].resv.length < RULES.MAX_RESV ? resvRange(this.s, 0, def.cost) : null;
          if (this.dial.hit(p.x, p.y)) {
            const T = this.dial.tFromPoint(p.x, p.y);
            this.dial.showCursor(r ? Math.max(r[0], Math.min(r[1], T)) : T, !!r);
            this.dial.setStatus('予約', r ? `離すと ${Math.max(r[0], Math.min(r[1], T))}刻に予約（${def.cost}刻）` : '予約できません（上限か時刻が足りない）', 'you');
          } else {
            this.dial.showCursor(null);
            if (p.y < L.youHud - 30) this.dial.setStatus('今すぐ使う', `離すと発動（${def.cost}刻）・時計に重ねると予約`, 'you');
            else this.forecast(def.cost);
          }
        }
      }
      return;
    }
    if (this.unitDrag) {
      const u = this.unitDrag;
      if (!u.moved && Math.hypot(p.x - u.sx, p.y - u.sy) > 16) { u.moved = true; this.setMode({ k: 'attack', lane: u.lane }); }
      if (u.moved) this.drawAttackArrow(u.lane, p);
      return;
    }
    if (this.mode.k === 'resv' && e.buttons && this.dial.hit(p.x, p.y)) this.pickResvAt(p.x, p.y);
  }
  private onUp(e: FederatedPointerEvent) {
    const p = this.local(e);
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (!d.moved) { this.inspectHand(d.view); return; }
      const def = cardDef(d.view.card);
      if (def.kind === 'unit') {
        const l = this.laneAt(p.x, p.y);
        if (l >= 0 && !this.s.players[0].field[l]) { this.flyFrom = { x: d.view.x, y: d.view.y }; void this.tryAction({ t: 'play', hand: d.view.uid, lane: l }); return; }
      } else {
        const r = this.s.players[0].resv.length < RULES.MAX_RESV ? resvRange(this.s, 0, def.cost) : null;
        if (this.dial.hit(p.x, p.y)) {
          if (r) { const T = Math.max(r[0], Math.min(r[1], this.dial.tFromPoint(p.x, p.y))); this.flyFrom = { x: d.view.x, y: d.view.y }; void this.tryAction({ t: 'reserve', hand: d.view.uid, T }); return; }
          audio.play('deny');
          this.toast(this.s.players[0].resv.length >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約するには時間が足りません');
        } else if (p.y < L.youHud - 30) { this.flyFrom = { x: d.view.x, y: d.view.y }; void this.tryAction({ t: 'cast', hand: d.view.uid }); return; }
      }
      this.dial.showCursor(null);
      this.laneHi.clear();
      this.clearForecast();
      this.layoutHand();
      return;
    }
    if (this.unitDrag) {
      const u = this.unitDrag;
      this.unitDrag = null;
      if (!u.moved) {
        if (this.mode.k === 'attack' && this.mode.lane === u.lane) void this.tryAction({ t: 'attack', lane: u.lane });
        else this.setMode({ k: 'attack', lane: u.lane });
        return;
      }
      if (p.y < L.front) void this.tryAction({ t: 'attack', lane: u.lane });
      else this.setMode({ k: 'idle' });
    }
  }
  private onBackgroundTap(e: FederatedPointerEvent) {
    audio.unlock();
    if (this.modal) return;
    const p = this.local(e);
    if (this.mode.k === 'lane') {
      const l = this.laneAt(p.x, p.y);
      if (l >= 0 && !this.s.players[0].field[l]) { const uid = this.mode.uid; this.flyFrom = this.handPos(uid); void this.tryAction({ t: 'play', hand: uid, lane: l }); }
      return;
    }
    if (this.mode.k === 'resv') { if (this.dial.hit(p.x, p.y)) this.pickResvAt(p.x, p.y); return; }
    if (this.mode.k === 'attack' && Math.abs(p.y - L.bar) < 70) return;
    if (this.mode.k !== 'idle') this.setMode({ k: 'idle' });
  }
  private pickResvAt(x: number, y: number) {
    if (this.mode.k !== 'resv') return;
    const h = this.s.players[0].hand.find((q) => q.uid === (this.mode as { uid: number }).uid)!;
    const r = resvRange(this.s, 0, cardDef(h.card).cost)!;
    const T = Math.max(r[0], Math.min(r[1], this.dial.tFromPoint(x, y)));
    if (T !== this.mode.T) { audio.play('tick'); this.setMode({ k: 'resv', uid: this.mode.uid, T }); }
  }
  private onPinTap(uid: number) {
    const info = this.dial.pinInfo(uid);
    if (!info) return;
    if (info.card) this.inspectCard(info.card, [`${info.pi === 0 ? 'あなた' : 'AI'}の予約：両者の時計が${info.T}刻に達すると発動`]);
    else this.toast(`AIの予約：${info.T}刻に発動（中身は不明）`);
  }
  private handPos(uid: number) { const v = this.handViews.get(uid); return v ? { x: v.x, y: v.y } : null; }

  private attackPreview(lane: number): string {
    const u = this.s.players[0].field[lane]!;
    const t = attackTarget(this.s, 0, lane);
    const doom = this.s.doom;
    if (!t) return `AIの拠点に${u.atk + doom}ダメージ${doom ? '（終焉+' + doom + '）' : ''}（1刻）`;
    const v = this.s.players[1].field[t.lane]!;
    const kill = u.atk >= v.hp, die = v.atk >= u.hp;
    const over = u.pierce && u.atk > v.hp ? `・貫通${u.atk - v.hp + doom}` : '';
    return `${cardDef(v.card).name}と交戦：${kill ? '撃破' : `残り体力${v.hp - u.atk}`}／こちら${die ? '破壊' : `残り${u.hp - v.atk}`}${over}${t.lane !== lane ? '（挑発に阻まれる）' : ''}`;
  }
  private targetPoint(t: Target): { x: number; y: number } {
    if (!t) return { x: this.huds[1].center.x + 40, y: this.huds[1].center.y + 10 };
    return { x: LANE_X[t.lane], y: ROW_Y[t.pi] };
  }
  private drawAttackArrow(lane: number, finger: { x: number; y: number } | null) {
    const from = { x: LANE_X[lane], y: ROW_Y[0] - UNIT_H / 2 };
    const to = finger ?? this.targetPoint(attackTarget(this.s, 0, lane));
    const g = this.arrowG.clear();
    const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - 80;
    g.moveTo(from.x, from.y).quadraticCurveTo(mx, my, to.x, to.y).stroke({ color: COLORS.foe, width: 10, alpha: 0.35 });
    g.moveTo(from.x, from.y).quadraticCurveTo(mx, my, to.x, to.y).stroke({ color: 0xffd9c9, width: 3, alpha: 0.95 });
    const a = Math.atan2(to.y - my, to.x - mx);
    g.poly([to.x + Math.cos(a) * 16, to.y + Math.sin(a) * 16, to.x + Math.cos(a + 2.4) * 18, to.y + Math.sin(a + 2.4) * 18, to.x + Math.cos(a - 2.4) * 18, to.y + Math.sin(a - 2.4) * 18]).fill(0xffd9c9);
    if (!finger) g.circle(to.x, to.y, 30).stroke({ color: COLORS.foe, width: 3, alpha: 0.8 });
  }

  // ------------------------------------------------------------------ modals
  private closeModal() { if (this.modal) { this.modal.destroy({ children: true }); this.modal = null; } }
  private openModal(build: (c: Container) => void) {
    this.closeModal();
    const c = new Container();
    const dim = new Graphics().rect(-400, -400, 1520, 2080).fill({ color: 0x03070a, alpha: 0.78 });
    dim.eventMode = 'static';
    dim.on('pointertap', (e) => { e.stopPropagation(); this.closeModal(); this.clearForecast(); });
    c.addChild(dim);
    build(c);
    this.overlay.addChild(c);
    this.modal = c;
    c.alpha = 0;
    void this.tw.to(c, { alpha: 1 }, 160);
  }
  private inspectCard(card: string, notes: string[], buttons: [string, 'plain' | 'primary', () => void, boolean?][] = []) {
    audio.play('select');
    this.openModal((c) => {
      const f = makeFace(card);
      f.x = 360; f.y = 520; f.scale.set(0.85);
      c.addChild(f);
      void this.tw.to(f.scale, { x: 1.05, y: 1.05 }, 240, ease.outBack);
      let y = 800;
      for (const n of notes) {
        const t = label(n, 20, COLORS.ivory, { align: 'center', wrap: 600 });
        t.anchor.set(0.5, 0); t.x = 360; t.y = y;
        c.addChild(t);
        y += t.height + 8;
      }
      const bws = buttons.map(([s]) => Math.max(150, 40 + s.length * 22));
      const gap = 14;
      const total = bws.reduce((a, b) => a + b, 0) + (buttons.length - 1) * gap;
      let bx = 360 - total / 2;
      buttons.forEach(([s, tone, fn, dis], i) => {
        const b = new Button(s, bws[i], 70, tone, undefined, fn);
        b.x = bx + bws[i] / 2; b.y = Math.max(y + 50, 930);
        bx += bws[i] + gap;
        if (dis) b.enabled = false;
        c.addChild(b);
      });
    });
  }
  private inspectHand(v: HandCardView) {
    const d = cardDef(v.card);
    const mine = !this.busy && actor(this.s) === 0;
    this.forecast(d.cost);
    if (!mine) { this.inspectCard(v.card, ['AIの番の間は見るだけです']); return; }
    if (d.kind === 'unit') {
      const empty = this.emptyLanes();
      this.inspectCard(v.card, [empty.length ? 'ドラッグしてレーンに置いても召喚できます' : '空いているレーンがありません'], [
        ['閉じる', 'plain', () => { this.closeModal(); this.clearForecast(); }],
        [`召喚する（${d.cost}刻）`, 'primary', () => {
          this.closeModal();
          if (empty.length === 1) { this.flyFrom = this.handPos(v.uid); void this.tryAction({ t: 'play', hand: v.uid, lane: empty[0] }); }
          else this.setMode({ k: 'lane', uid: v.uid });
        }, !empty.length],
      ]);
    } else {
      const r = this.s.players[0].resv.length < RULES.MAX_RESV ? resvRange(this.s, 0, d.cost) : null;
      const note = r ? 'ドラッグして盤面で離すと使用、時計に重ねると予約' : this.s.players[0].resv.length >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約できる時刻が残っていません';
      this.inspectCard(v.card, [note], [
        ['閉じる', 'plain', () => { this.closeModal(); this.clearForecast(); }],
        [`予約する`, 'plain', () => { this.closeModal(); this.setMode({ k: 'resv', uid: v.uid, T: Math.min(r![1], r![0] + 2) }); }, !r],
        [`今すぐ使う（${d.cost}刻）`, 'primary', () => { this.closeModal(); this.flyFrom = this.handPos(v.uid); void this.tryAction({ t: 'cast', hand: v.uid }); }],
      ]);
    }
  }
  private inspectUnit(v: UnitView) {
    const pi = v.owner;
    const u = this.s.players[pi].field.find((x) => x?.uid === v.uid);
    if (!u) return;
    const left = u.readyAt - this.s.players[pi].time;
    this.inspectCard(u.card, [
      `現在 攻撃${u.atk} ・ 体力${u.hp}/${u.maxHp}`,
      left <= 0 ? '攻撃できます' : `あと${left}刻で攻撃可能（${u.readyAt}刻）`,
    ]);
  }
  private toast(msg: string) {
    const c = this.toastC;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    const t = label(msg, 20, COLORS.ivory, { align: 'center', wrap: 560 });
    t.anchor.set(0.5);
    const w = t.width + 48, h = t.height + 26;
    const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: COLORS.ink, alpha: 0.95 }).roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ color: COLORS.brass, width: 2 });
    c.addChild(bg, t);
    c.x = 360; c.y = L.front; c.alpha = 0;
    void (async () => { await this.tw.to(c, { alpha: 1 }, 150); await this.tw.wait(1600); await this.tw.to(c, { alpha: 0 }, 250); })();
  }

  // ------------------------------------------------------------------ animation player
  private async play(events: GameEvent[]) {
    for (const e of events) {
      if (this.destroyed_) return;
      try { await this.animate(e); } catch (err) { console.error('animation failed', e.e, err); }
    }
    this.flyFrom = null;
    if (!this.destroyed_) this.syncAll();
  }

  private async fly(sprite: Sprite, from: { x: number; y: number }, to: { x: number; y: number }, s0: number, s1: number, dur = 380, rot = 0) {
    sprite.x = from.x; sprite.y = from.y; sprite.scale.set(s0);
    this.overlay.addChild(sprite);
    await Promise.all([
      this.tw.run(dur, (k) => { sprite.x = from.x + (to.x - from.x) * k; sprite.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60; sprite.rotation = rot * (1 - k); }, ease.inOutCubic),
      this.tw.to(sprite.scale, { x: s1, y: s1 }, dur, ease.inOutCubic),
    ]);
  }
  /** Show a card big in the middle for a moment (opponent plays, spells). */
  private async present(card: string, from: { x: number; y: number }, faceDown = false) {
    const s = faceDown ? makeBack() : makeFace(card);
    await this.fly(s, from, { x: 360, y: 600 }, 0.2, 0.72, 320);
    if (faceDown) {
      await this.tw.run(140, (k) => s.scale.x = 0.72 * (1 - k));
      s.texture = makeFace(card).texture;
      await this.tw.run(160, (k) => s.scale.x = 0.72 * k);
    }
    void this.fx.ring(360, 600, COLORS.brass, 60, 280, 500, 8);
    await this.tw.wait(this.s && from.y < 200 ? 650 : 280);
    return s;
  }

  private logEvent(e: GameEvent) {
    const nm = (pi: PlayerIndex) => (pi === 0 ? 'あなた' : 'AI');
    const cn = (id: string) => `「${cardDef(id).name}」`;
    switch (e.e) {
      case 'summon': return this.onLog(`${nm(e.pi)}：${cn(e.unit.card)}を召喚`, e.pi);
      case 'cast': return this.onLog(`${nm(e.pi)}：${cn(e.card)}を使用`, e.pi);
      case 'reserve': return this.onLog(e.pi === 0 ? `あなた：${cn(e.card)}を${e.T}刻に予約` : `AI：${e.T}刻に予約`, e.pi);
      case 'trigger': return this.onLog(`${e.T}刻 ${nm(e.pi)}の予約${cn(e.card)}が発動`, e.pi);
      case 'attack': { const u = this.s.players[e.pi].field[e.lane]; return this.onLog(`${nm(e.pi)}：${u ? cn(u.card) : 'ユニット'}が${e.target ? '攻撃' : '拠点を攻撃'}`, e.pi); }
      case 'dmgBase': return this.onLog(`${nm(e.pi)}の拠点に${e.amount}ダメージ（残り${Math.max(0, e.hp)}）`, other(e.pi));
      case 'destroy': return this.onLog(`${nm(e.pi)}の${cn(e.unit.card)}が破壊された`, other(e.pi));
      case 'heal': return this.onLog(`${nm(e.pi)}の拠点が${e.amount}回復`, e.pi);
      case 'clock': return this.onLog(`${nm(e.pi)}の時計が${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}刻`, -1);
      case 'bell': return this.onLog(`${nm(e.pi)}：${e.at}刻の鐘`, e.pi);
      case 'doom': return this.onLog(`終焉の刻：拠点へのダメージ+${e.level}`, -1);
      case 'act': if (e.action.t === 'draw' || e.action.t === 'wait') this.onLog(`${nm(e.pi)}：${e.action.t === 'draw' ? 'ドロー' : '待機'}`, e.pi); return;
      default: return;
    }
  }

  private async animate(e: GameEvent) {
    this.logEvent(e);
    const tw = this.tw, fx = this.fx;
    switch (e.e) {
      case 'act': {
        const a = e.action;
        if (e.pi === 0 && (a.t === 'play' || a.t === 'cast' || a.t === 'reserve')) {
          const v = this.handViews.get(a.hand);
          if (v) { this.flyFrom ??= { x: v.x, y: v.y }; v.destroy({ children: true }); this.handViews.delete(a.hand); this.layoutHand(); }
        }
        if (e.pi === 1 && (a.t === 'play' || a.t === 'cast' || a.t === 'reserve')) {
          const b = this.foeHandLayer.children[this.foeHandLayer.children.length - 1];
          this.flyFrom = b ? { x: b.x, y: b.y } : FOE_HAND_POS;
          b?.destroy();
        }
        if (a.t === 'draw' || a.t === 'wait') {
          const who = e.pi === 0 ? 'あなた' : 'AI';
          void fx.floatText(this.dial.handTip(e.pi).x, this.dial.handTip(e.pi).y + 40, a.t === 'draw' ? 'ドロー' : '待機', e.pi === 0 ? COLORS.you : COLORS.foe, 24, 30, 700);
          if (e.pi === 1) this.dial.setStatus(`AI：${a.t === 'draw' ? 'ドロー' : '待機'}`, `${who}の時計が進む`, 'foe');
        }
        break;
      }
      case 'time': {
        this.dial.showGhost(null);
        await this.dial.setHand(e.pi, e.to, true, () => audio.play('tick'));
        if (e.pi === 1) this.dial.setStatus('AIの番', `AI ${e.to}刻 ・ あなた ${this.s.players[0].time}刻`, 'foe');
        break;
      }
      case 'clock': {
        audio.play('clock');
        const tip = this.dial.handTip(e.pi);
        void fx.ring(tip.x, tip.y, 0x9fd4ff, 10, 80, 500, 5);
        await this.dial.setHand(e.pi, e.to, true);
        const t2 = this.dial.handTip(e.pi);
        await fx.floatText(t2.x, t2.y - 20, `${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}刻`, 0x9fd4ff, 30, 50, 700);
        break;
      }
      case 'bell': {
        audio.play('bell');
        const p = this.dial.point(e.at, this.dial.R - 40);
        void fx.ring(p.x, p.y, COLORS.brass, 8, 120, 700, 6);
        void fx.floatText(p.x, p.y - 20, '鐘', COLORS.brass, 30, 40, 800);
        await tw.wait(200);
        break;
      }
      case 'draw': {
        audio.play('draw');
        if (e.pi === 0) {
          const v = this.addHandView(e.uid, e.card);
          v.x = DECK_POS.x; v.y = DECK_POS.y; v.scale.set(0.2); v.rotation = -0.4;
          this.layoutHand();
          await tw.wait(160);
        } else {
          const b = makeBack(); b.scale.set(0.14);
          this.foeHandLayer.addChild(b);
          b.x = 40; b.y = 110;
          const n = this.foeHandLayer.children.length;
          await tw.to(b, { x: FOE_HAND_POS.x - 110 + ((n - 1) / 2) * 18, y: FOE_HAND_POS.y }, 240);
        }
        this.huds[e.pi].setInfo(this.s.players[e.pi].deck.length, e.pi === 1 ? this.foeHandLayer.children.length : null, this.s.players[e.pi].resv.length);
        break;
      }
      case 'burn': this.toast(`${e.pi === 0 ? 'あなた' : 'AI'}：手札が一杯で「${cardDef(e.card).name}」を失った`); await tw.wait(500); break;
      case 'deckout': this.toast(`${e.pi === 0 ? 'あなた' : 'AI'}：山札がありません`); await tw.wait(400); break;
      case 'summon': {
        const to = { x: LANE_X[e.lane], y: ROW_Y[e.pi] };
        if (e.pi === 1) {
          const s = await this.present(e.unit.card, this.flyFrom ?? FOE_HAND_POS, true);
          await this.fly(s, { x: s.x, y: s.y }, to, s.scale.x, 0.52, 260);
          s.destroy();
        } else if (this.flyFrom) {
          const s = makeFace(e.unit.card);
          await this.fly(s, this.flyFrom, to, 0.5, 0.52, 240);
          s.destroy();
        }
        const v = new UnitView(e.unit, e.pi);
        v.x = to.x; v.y = to.y;
        v.on('pointerdown', (ev) => this.onUnitDown(v, ev));
        this.unitViews.set(e.unit.uid, v);
        this.units.addChild(v);
        v.setReady(e.unit.readyAt, this.s.players[e.pi].time, e.unit.reload);
        v.scale.set(1.25); v.alpha = 0.4;
        audio.play('summon');
        await Promise.all([tw.to(v.scale, { x: 1, y: 1 }, 220, ease.inCubic), tw.to(v, { alpha: 1 }, 160)]);
        void fx.shake(5, 180);
        void fx.ring(to.x, to.y + 80, e.pi === 0 ? COLORS.you : COLORS.foe, 20, 150, 450, 6);
        fx.burst(to.x, to.y + 100, COLORS.brass, 16, 200, { size: 3, grav: 200, life: 0.5 });
        this.flyFrom = null;
        await tw.wait(120);
        break;
      }
      case 'cast': {
        audio.play('cast');
        const s = e.pi === 1 ? await this.present(e.card, this.flyFrom ?? FOE_HAND_POS, true) : await this.present(e.card, this.flyFrom ?? { x: 360, y: L.hand });
        void fx.burst(360, 600, 0xc9a8ff, 30, 320, { shape: 'spark', grav: 0, life: 0.6 });
        await Promise.all([tw.to(s, { alpha: 0 }, 260), tw.to(s.scale, { x: 0.9, y: 0.9 }, 260)]);
        s.destroy();
        this.flyFrom = null;
        break;
      }
      case 'reserve': {
        audio.play('reserve');
        const pinTo = this.dial.pinPoint(e.T, e.pi);
        const s = e.pi === 0 ? makeFace(e.card) : makeBack();
        await this.fly(s, this.flyFrom ?? (e.pi === 0 ? { x: 360, y: L.hand } : FOE_HAND_POS), pinTo, e.pi === 0 ? 0.5 : 0.14, 0.08, 420, 0.5);
        s.destroy();
        this.dial.addPin(e.uid, e.pi, e.T, e.pi === 0 ? e.card : null).on('pointertap', (ev) => { ev.stopPropagation(); this.onPinTap(e.uid); });
        void fx.ring(pinTo.x, pinTo.y, e.pi === 0 ? COLORS.you : COLORS.foe, 6, 60, 400, 4);
        if (e.pi === 1) this.dial.setStatus('AIが予約した', `${e.T}刻に何かが起きる`, 'foe');
        this.flyFrom = null;
        await tw.wait(e.pi === 1 ? 600 : 150);
        break;
      }
      case 'trigger': {
        const at = this.dial.pinAt(e.uid) ?? this.dial.point(e.T, this.dial.R + 46);
        audio.play('reveal');
        void fx.ring(at.x, at.y, COLORS.brass, 6, 110, 600, 8);
        void this.dial.removePin(e.uid, 'fire');
        await fx.banner('予約発動', `${e.pi === 0 ? 'あなた' : 'AI'}の予約 ・ ${e.T}刻`, e.pi === 0 ? COLORS.you : COLORS.foe, 360, 640);
        const s = makeBack(); s.scale.set(0.1);
        await this.fly(s, at, { x: 360, y: 600 }, 0.1, 0.72, 300);
        await tw.run(140, (k) => s.scale.x = 0.72 * (1 - k));
        s.texture = makeFace(e.card).texture;
        await tw.run(180, (k) => s.scale.x = 0.72 * k, ease.outBack);
        void fx.ring(360, 600, COLORS.brass, 60, 320, 600, 10);
        fx.burst(360, 600, COLORS.brass, 40, 380, { shape: 'spark', grav: 0, life: 0.8 });
        await tw.wait(650);
        await Promise.all([tw.to(s, { alpha: 0 }, 220), tw.to(s.scale, { x: 0.9, y: 0.9 }, 220)]);
        s.destroy();
        break;
      }
      case 'attack': {
        const v = this.viewAt(e.pi, e.lane);
        if (!v) break;
        v.select(false);
        this.arrowG.clear();
        const to = this.targetPoint(e.target);
        const ox = v.x, oy = v.y;
        const dx = to.x - ox, dy = to.y - oy;
        this.units.setChildIndex(v, this.units.children.length - 1);
        await tw.run(140, (k) => { v.y = oy - (e.pi === 0 ? 1 : -1) * 18 * k; v.rotation = (e.pi === 0 ? -1 : 1) * 0.04 * k; }, ease.outCubic);
        await tw.run(150, (k) => { v.x = ox + dx * 0.72 * k; v.y = oy + dy * 0.72 * k; }, ease.inCubic);
        audio.play(e.target ? 'hit' : 'base');
        fx.burst(ox + dx * 0.8, oy + dy * 0.8, 0xffd29a, 22, 360, { shape: 'spark', grav: 100, life: 0.45 });
        void fx.shake(e.target ? 8 : 14, 240);
        await tw.run(220, (k) => { v.x = ox + dx * 0.72 * (1 - k); v.y = oy + dy * 0.72 * (1 - k); v.rotation *= 1 - k; }, ease.outCubic);
        v.x = ox; v.y = oy; v.rotation = 0;
        break;
      }
      case 'dmgUnit': {
        const v = this.viewAt(e.pi, e.lane);
        if (!v) break;
        v.setStats(v.atk, e.hp);
        void v.flash(tw, 0xff4a2a);
        void fx.floatText(v.x, v.y - 30, `-${e.amount}`, 0xff8f6b, 46);
        await tw.run(200, (k) => { v.x = LANE_X[e.lane] + Math.sin(k * 30) * 6 * (1 - k); });
        v.x = LANE_X[e.lane];
        break;
      }
      case 'dmgBase': {
        const h = this.huds[e.pi];
        h.setHp(e.hp);
        audio.play(e.amount >= 4 ? 'heavyHit' : 'base');
        const c = h.center;
        void fx.floatText(c.x + 60, c.y + (e.pi === 1 ? 40 : -30), `-${e.amount}`, e.doom ? COLORS.doom : 0xff8f6b, 56, 60);
        if (e.doom) void fx.floatText(c.x + 150, c.y + (e.pi === 1 ? 60 : -10), `終焉+${this.s.doom}`, COLORS.doom, 22, 40, 900);
        fx.burst(c.x, c.y, e.pi === 0 ? COLORS.you : COLORS.foe, 26, 300, { shape: 'shard', life: 0.7 });
        void fx.flash(e.pi === 0 ? 0xff2200 : 0xffaa55, e.pi === 0 ? 0.22 : 0.12, 280);
        void fx.shake(8 + e.amount * 2, 320);
        await h.hit(tw);
        break;
      }
      case 'heal': {
        this.huds[e.pi].setHp(e.hp);
        audio.play('heal');
        const c = this.huds[e.pi].center;
        fx.burst(c.x, c.y, COLORS.heal, 18, 160, { grav: -200, life: 0.8 });
        await fx.floatText(c.x + 60, c.y - 10, `+${e.amount}`, COLORS.heal, 48, 50, 700);
        break;
      }
      case 'destroy': {
        const v = this.unitViews.get(e.unit.uid) ?? this.viewAt(e.pi, e.lane);
        if (!v) break;
        audio.play('destroy');
        fx.burst(v.x, v.y, e.pi === 0 ? COLORS.you : COLORS.foe, 34, 420, { shape: 'shard', grav: 500, life: 0.9, size: 6 });
        fx.burst(v.x, v.y, 0xffffff, 12, 200, { life: 0.5 });
        this.unitViews.delete(e.unit.uid);
        await Promise.all([tw.to(v, { alpha: 0, rotation: (Math.random() - 0.5) * 0.6 }, 300), tw.to(v.scale, { x: 0.6, y: 0.6 }, 300)]);
        v.destroy({ children: true });
        break;
      }
      case 'stun': {
        const v = this.viewAt(e.pi, e.lane);
        if (!v) break;
        const u = this.s.players[e.pi].field[e.lane];
        if (u) v.setReady(e.readyAt, this.s.players[e.pi].time, u.reload);
        audio.play('clock');
        void fx.ring(v.x, v.y, 0x9fd4ff, 30, 150, 500, 8);
        await fx.floatText(v.x, v.y - 40, `停滞 → ${e.readyAt}刻`, 0x9fd4ff, 26, 40, 800);
        break;
      }
      case 'readyAll': {
        for (const [l, u] of this.s.players[e.pi].field.entries()) {
          const v = u ? this.viewAt(e.pi, l) : undefined;
          if (v && u) { v.setReady(u.readyAt, this.s.players[e.pi].time, u.reload); void fx.ring(v.x, v.y, COLORS.you, 20, 130, 400, 5); }
        }
        await tw.wait(250);
        break;
      }
      case 'buff': {
        const v = this.viewAt(e.pi, e.lane);
        if (!v) break;
        v.setStats(e.atk, e.hp);
        void v.flash(tw, COLORS.brass);
        await fx.floatText(v.x, v.y - 20, '強化', COLORS.brass, 26, 40, 600);
        break;
      }
      case 'reveal': {
        audio.play('reveal');
        const p = this.s.players[e.pi];
        for (const uid of e.uids) { const r = p.resv.find((x) => x.uid === uid); if (r) this.dial.revealPin(uid, r.card); }
        this.toast(e.uids.length ? `AIの予約を${e.uids.length}枚公開` : '公開する予約はなかった');
        await tw.wait(500);
        break;
      }
      case 'breakResv': {
        const at = this.dial.pinAt(e.uid);
        audio.play('destroy');
        if (at) fx.burst(at.x, at.y, COLORS.foe, 20, 220, { shape: 'shard' });
        await this.dial.removePin(e.uid, 'break');
        this.toast(`予約「${e.pi === 0 ? cardDef(e.card).name : cardDef(e.card).name}」を破棄`);
        break;
      }
      case 'fizzle': this.toast(`${cardDef(e.card).name}：対象がいない`); await tw.wait(300); break;
      case 'doom': {
        audio.play('doom');
        this.dial.setDoom(e.level);
        void fx.flash(COLORS.doom, 0.3, 700);
        await fx.banner(e.level === 1 ? '終焉の刻' : `終焉 ${e.level}段階`, `拠点へのダメージ +${e.level}`, COLORS.doom, 360, 640);
        break;
      }
      case 'end': {
        audio.play(e.winner === 0 ? 'win' : 'lose');
        break;
      }
    }
  }
}

