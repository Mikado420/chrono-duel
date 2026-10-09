import { Container, FederatedPointerEvent, Graphics, Sprite, Texture, type Ticker } from 'pixi.js';
import { AI_LEVEL_NAMES, chooseAction, chooseActionAsync, chooseActionSpecAsync, type AiLevel, type AiSpec } from '../core/ai';
import { chooseRivalAsync, newMind, thinkMs, type RivalCfg, type RivalMind } from '../core/rival';
import { KEYWORD_HELP, cardDef, keywordsOf } from '../core/cards';
import {
  actor, apply, attackTarget, canShift, cardCost, createGame, isReady, legalActions, other, resvCount, resvRange,
  type Action, type GameEvent, type GameState, type PlayerIndex, type Target,
} from '../core/engine';
import type { GameLog } from '../core/gamelog';
import { HIDDEN, NET, type NetLink, type NetResult, type ServerMsg } from '../core/net';
import { RULES } from '../core/rules';
import { FeatTracker, type Feat } from '../core/feats';
import { audio } from './audio';
import { haptics } from './haptics';
import { Dial } from './dial';
import { MAT_ART, MAT_VIEW } from './lookArt';
import { Embers, Ripple, Steam } from './lookFx';
import { isArtMat, loadFlatMat, loadMat } from './looks';
import type { Fx } from './fx';
import { COLORS, FONTS } from './theme';
import { ease, type Tweener } from './tween';
import { Button, label } from './ui';
import { HandCardView, Hud, UnitView, UNIT_H, UNIT_W, makeBack, makeFace } from './views';

export interface BattleConfig {
  myDeck: string[];
  myDeckName: string;
  /** Id of the stored deck played (for its looks and the match history). */
  myDeckId?: string;
  aiDeck: string[];
  aiDeckName: string;
  level: AiLevel;
  /** Rated play: the opponent's exact strength (may sit between or above the levels). Defaults to `level`. */
  aiSpec?: AiSpec;
  seed?: number;
  /** Rated play: the rival of the roster playing the opponent's side (its Lv, persona, deck plan and quirks). */
  rival?: RivalCfg;
  /** Version of the rival's list (AIのデッキ帳; 1 = the built-in list). */
  aiDeckV?: number;
  /** Rated game (surrendering or leaving counts as a loss). The opponent is shown only by `foeName`. */
  rated?: boolean;
  /** Name shown for the opponent instead of "AI" (rated play). */
  foeName?: string;
  /** Online match: the opponent is a person and the server owns the game state. */
  net?: NetLink;
  /** Games against the AI: called after every action with the record so far (kept in case the app is closed mid-game). */
  onProgress?: (log: GameLog, myActions: number) => void;
  /** Looks: your card back and clock face, and the back of the opponent's cards. */
  /** Card backs, clock face and playmats (yours and the opponent's); `still` turns the ambient motion off. */
  looks?: { back: string; dial: string; foeBack?: string; mat?: string; foeMat?: string; still?: boolean };
  /** While a unit is held, show what the attack will do (設定「攻撃の前に結果を見せる」). */
  attackPreview?: boolean;
  /** Who moves first, when it was decided before the battle (the VS screen shows it). */
  first?: PlayerIndex;
}
export interface BattleResult { winner: PlayerIndex | -1; reason: 'ko' | 'time' | 'surrender' | 'timeout' | 'disconnect'; myHp: number; foeHp: number; actions: number; myActions: number; stats: { spells: number; summons: number; reserves: number; attacks: number };
  /** Every card the player used (summoned, cast or reserved) this game, for the play statistics. */
  played: string[];
  /** 勝ち方 of a won game (see core/feats.ts). */
  feats?: Feat[];
  /** The full game record (games against the AI; online games are recorded by the server). */
  log?: GameLog }

const LANE_X = [150, 360, 570];
/** Vertical layout in design units. Tall phones get extra height, which is shared out by `applyLayout`. */
const L = { front: 647, youHud: 922, hand: 1128, bar: 1112 };
const ROW_Y: Record<PlayerIndex, number> = { 1: 522, 0: 772 };
/** Your deck pile, between your counters and the draw button. */
const DECK_POS = { x: 396, y: 922 };
const FOE_HAND_POS = { x: 640, y: 40 };

type Mode =
  | { k: 'idle' }
  | { k: 'lane'; uid: number }
  | { k: 'resv'; uid: number; T: number }
  | { k: 'attack'; lane: number }
  /** 充填: choosing how much extra time to pay. `lane` is set for units. */
  | { k: 'charge'; uid: number; x: number; lane: number | null }
  /** 転移: choosing which empty lane next to it a unit moves to (also offered from the attack bar). */
  | { k: 'shift'; lane: number };

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
  private logBtn: Container;
  private busy = true;
  private mode: Mode = { k: 'idle' };
  private drag: { view: HandCardView; sx: number; sy: number; moved: boolean; ox: number; oy: number } | null = null;
  private unitDrag: { lane: number; sx: number; sy: number; moved: boolean } | null = null;
  /** The current press started on the background itself (not on a card, unit or button). */
  private bgDown = false;
  private flyFrom: { x: number; y: number } | null = null;
  private toastC = new Container();
  private modal: Container | null = null;
  private actionBar = new Container();
  private destroyed_ = false;
  private vignette = new Graphics();
  // ---- playmats: yours under your half, the opponent's (still, dimmed, turned round) under theirs
  private matLayer = new Container();
  private myMat = new Container();
  private myMatMask = new Graphics();
  private foeMat = new Container();
  private foeMatMask = new Graphics();
  private matTicks: ((ms: number) => void)[] = [];
  private matT = 0;
  // ---- online play
  private inbox: ServerMsg[] = [];
  private pumping = false;
  private ready = false;
  private netResult: NetResult | null = null;
  private finished = false;
  private unsubs: (() => void)[] = [];
  private timerC = new Container();
  private timerBg = new Graphics();
  private timerTxt = label('', 20, COLORS.ivory, { weight: '700', align: 'center' });
  private timerEnd: number | null = null;
  private foeAway: number | null = null;
  private linkDown = false;
  private timerShown = '';
  /** Actions the player took (rewards need a real match, not an instant surrender). */
  private myActs = 0;
  private stats = { spells: 0, summons: 0, reserves: 0, attacks: 0 };
  private played = new Set<string>();
  private log: GameLog | null = null;
  /** How the game is being won (勝ち方の称号). */
  private feats = new FeatTracker();

  private get foe(): string { return this.cfg.net?.watch?.names[1] ?? this.cfg.net?.foeName ?? this.cfg.foeName ?? 'AI'; }
  /** Looking on at someone else's game: nothing can be played and seat 0 goes by its own name. */
  private get watching() { return !!this.cfg.net?.watch; }
  private get me(): string { return this.cfg.net?.watch?.names[0] ?? 'あなた'; }
  private deckPile = new Container();
  private deckPileTxt = label('', 15, COLORS.ivory, { font: FONTS.num, weight: '700', align: 'center' });
  // ---- attack preview: chevrons to the real target, a ring on it and the outcome
  private aim: { lane: number; finger: { x: number; y: number } | null } | null = null;
  private aimT = 0;
  private aimRing = new Graphics();
  private aimPanel = new Container();
  private watchChip = new Container();
  /** Online and rated games run a move timer (45s, then an automatic wait; three in a row forfeits). */
  private get timed() { return !!this.cfg.net || !!this.cfg.rated; }
  private strikes = 0;

  constructor(private tw: Tweener, private fx: Fx, private ticker: Ticker, private cfg: BattleConfig, private onEnd: (r: BattleResult) => void, private onMenu: () => void, private onLog: (text: string, side: PlayerIndex | -1) => void = () => {}, private onLogToggle: () => void = () => {}) {
    super();
    this.dial = new Dial(tw, cfg.looks?.dial, !cfg.looks?.still);
    this.matLayer.addChild(this.foeMat, this.foeMatMask, this.myMat, this.myMatMask);
    this.foeMat.mask = this.foeMatMask; this.myMat.mask = this.myMatMask;
    if (isArtMat(cfg.looks?.mat)) void this.loadMyMat(cfg.looks.mat);
    if (isArtMat(cfg.looks?.foeMat)) void this.loadFoeMat(cfg.looks.foeMat);
    this.huds = [new Hud(0, cfg.net?.watch?.names[0] ?? 'あなた'), new Hud(1, cfg.net?.watch ? cfg.net.watch.names[1] : cfg.net ? cfg.net.foeName : cfg.foeName ?? `AI（${AI_LEVEL_NAMES[cfg.level]}）・ ${cfg.aiDeckName}`)];
    this.huds[1].x = 16; this.huds[1].y = 44;
    this.huds[0].x = 16;
    this.drawBtn = new Button('ドロー', 124, 66, 'plain', `${RULES.COST_DRAW}刻`, () => this.tryAction({ t: 'draw' }));
    this.waitBtn = new Button('待機', 124, 66, 'plain', `${RULES.COST_WAIT}刻`, () => this.tryAction({ t: 'wait' }));
    this.drawBtn.x = 510;
    this.waitBtn.x = 648;
    this.menuBtn = this.makeMenuButton();
    this.logBtn = this.makeLogButton();
    this.board.addChild(this.slotG, this.laneHi);
    this.applyLayout(0);
    for (let i = 0; i < 3; i++) { const b = makeBack(cfg.looks?.back); b.scale.set(0.13); b.x = -i * 1.5; b.y = -i * 2.5; this.deckPile.addChild(b); }
    this.deckPileTxt.anchor.set(0.5); this.deckPileTxt.y = 44;
    this.deckPile.addChild(this.deckPileTxt);
    this.deckPile.eventMode = 'none';
    if (cfg.net?.watch) {
      const t = label(`観戦中 ・ ${cfg.net.watch.names[0]} 対 ${cfg.net.watch.names[1]}`, 18, COLORS.brass, { weight: '700', align: 'center' });
      t.anchor.set(0.5);
      const w = t.width + 36;
      this.watchChip.addChild(new Graphics().roundRect(-w / 2, -18, w, 36, 18).fill({ color: COLORS.ink, alpha: 0.88 }).roundRect(-w / 2, -18, w, 36, 18).stroke({ color: COLORS.brassDeep, width: 2 }), t);
      this.watchChip.x = 360; this.watchChip.y = 76;
      this.drawBtn.visible = false; this.waitBtn.visible = false;
    }
    this.addChild(this.matLayer, this.vignette, this.board, this.dial, this.units, this.aimRing, this.huds[0], this.huds[1], this.foeHandLayer, this.deckPile, this.drawBtn, this.waitBtn, this.menuBtn, this.logBtn, this.handLayer, this.arrowG, this.aimPanel, this.actionBar, this.overlay, this.watchChip, this.toastC);
    this.eventMode = 'static';
    this.hitArea = { contains: () => true };
    this.on('globalpointermove', (e) => this.onMove(e));
    this.on('pointerup', (e) => this.onUp(e));
    this.on('pointerupoutside', (e) => this.onUp(e));
    // A tap reaches the background even when it started on a card, a unit or a button (Pixi dispatches pointertap
    // to the common ancestor). Only taps that also *started* on the background count, or the tap that ends a drop
    // or a button press would cancel the choice it just opened (e.g. the 充填 bar).
    this.on('pointerdowncapture', () => { this.bgDown = false; });
    this.on('pointerdown', () => { this.bgDown = true; });
    this.on('pointertap', (e) => { if (!this.bgDown) return; this.bgDown = false; this.onBackgroundTap(e); });
    this.timerTxt.anchor.set(0.5);
    this.timerC.addChild(this.timerBg, this.timerTxt);
    this.timerC.x = 360; this.timerC.y = 26; this.timerC.visible = false;
    this.addChild(this.timerC);
    ticker.add(this.tickFn);
    if (cfg.net) {
      const net = cfg.net;
      this.unsubs.push(net.subscribe((m) => this.onNet(m)), net.onStatus((st) => { this.linkDown = st !== 'open'; if (st === 'open') this.toast('再接続しました'); this.drawTimer(true); }));
      void this.startOnline(net);
    } else void this.start();
  }

  private tickFn = (t: Ticker) => {
    this.dial.tick(t.deltaMS);
    if (this.matTicks.length) { this.matT += t.deltaMS / 1000; for (const f of this.matTicks) f(t.deltaMS); }
    if (this.aim) { this.aimT += t.deltaMS / 1000; this.paintAim(); }
    for (const v of this.unitViews.values()) v.tick(t.deltaMS);
    this.huds[0].tick(t.deltaMS); this.huds[1].tick(t.deltaMS);
    if (this.timed) {
      // the clock stops while the game is paused (menu, log, rotated phone)
      if (this.timerEnd !== null && this.tw.speed === 0) this.timerEnd += t.deltaMS;
      if (!this.cfg.net) this.checkTimeout();
      this.drawTimer(false);
    }
  };

  override destroy() {
    this.destroyed_ = true;
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
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

  /** Opens the action log (a slide-in panel on phones; on wide screens it is always beside the board). */
  private makeLogButton() {
    const c = new Container();
    const g = new Graphics().circle(0, 0, 26).fill({ color: COLORS.ink2, alpha: 0.9 }).circle(0, 0, 26).stroke({ color: COLORS.brassDeep, width: 2 });
    // a scroll with lines
    g.roundRect(-11, -13, 22, 26, 4).stroke({ color: COLORS.ivory, width: 2 });
    for (const y of [-6, 0, 6]) g.moveTo(-6, y).lineTo(6, y).stroke({ color: COLORS.ivory, width: 2 });
    c.addChild(g);
    c.x = 626; c.y = 40;
    c.eventMode = 'static'; c.cursor = 'pointer';
    c.on('pointertap', (e) => { e.stopPropagation(); audio.play('select'); this.onLogToggle(); });
    return c;
  }

  /** Spread the lower half of the board over any extra height a tall screen offers. */
  applyLayout(extra: number) {
    const e = Math.max(0, Math.min(extra, 320));
    L.front = 647 + e * 0.12; ROW_Y[0] = 772 + e * 0.24; L.youHud = 922 + e * 0.42; L.hand = 1128 + e * 0.8; L.bar = 1112 + e * 0.8; DECK_POS.y = L.youHud - 6;
    this.deckPile.x = DECK_POS.x; this.deckPile.y = DECK_POS.y;
    this.huds[0].y = L.youHud; this.drawBtn.y = L.youHud; this.waitBtn.y = L.youHud;
    this.actionBar.y = L.bar;
    this.toastC.y = L.front;
    this.layoutMats(e);
    this.buildBoard();
    if (this.s) this.syncAll(false);
  }

  /** Your mat starts at the front line and covers the rest of the board (scaled up to fill tall screens). */
  private layoutMats(extra: number) {
    const top = L.front - 4, bottom = 1280 + extra;
    const h = bottom - top;
    const s = Math.max(720 / MAT_VIEW.w, h / MAT_VIEW.h);
    this.myMat.scale.set(s);
    this.myMat.x = (720 - MAT_VIEW.w * s) / 2; this.myMat.y = top - MAT_VIEW.y * s;
    this.myMatMask.clear().rect(-200, top, 1120, bottom - top + 40).fill(0xffffff);
    // the opponent's, upside down, from their front line up to the clock
    const fs = 720 / MAT_VIEW.w;
    this.foeMat.scale.set(fs); this.foeMat.rotation = Math.PI;
    this.foeMat.x = 720; this.foeMat.y = L.front + 4 + MAT_VIEW.y * fs;
    this.foeMatMask.clear().rect(-200, 392, 1120, L.front - 392).fill(0xffffff);
  }
  private async loadMyMat(id: string) {
    const cv = await loadMat(id).catch(() => null);
    if (!cv || this.destroyed_) return;
    const m = MAT_ART[id];
    const still = !!this.cfg.looks?.still;
    const full = (c: HTMLCanvasElement) => { const sp = new Sprite(Texture.from(c)); sp.x = MAT_VIEW.x; sp.y = MAT_VIEW.y; sp.width = MAT_VIEW.w; sp.height = MAT_VIEW.h; return sp; };
    const C = this.myMat;
    C.addChild(full(cv.under));
    cv.spins.forEach((c, i) => {
      const l = m.spins![i];
      const sp = new Sprite(Texture.from(c)); sp.anchor.set(0.5); sp.x = l.cx; sp.y = l.cy; sp.width = sp.height = l.r * 2;
      C.addChild(sp);
      if (!still) this.matTicks.push((ms) => { sp.rotation += l.speed * ms / 1000; });
    });
    if (cv.drift) {
      const sp = full(cv.drift); C.addChild(sp);
      if (!still) this.matTicks.push(() => { sp.x = MAT_VIEW.x + Math.sin(this.matT / 9) * 10; sp.y = MAT_VIEW.y + Math.cos(this.matT / 11) * 6; });
    }
    if (cv.glow && m.glow) {
      const g = m.glow, sp = full(cv.glow); C.addChild(sp); sp.alpha = g.max;
      if (!still) this.matTicks.push(() => { const k = 0.5 + 0.5 * Math.sin((this.matT / g.period) * Math.PI * 2) * (0.7 + 0.3 * Math.sin(this.matT * 7.3)); sp.alpha = g.min + (g.max - g.min) * k; });
    }
    if (!still && m.fx) {
      const add = (o: Container & { tick(ms: number): void }) => { C.addChild(o); this.matTicks.push((ms) => o.tick(ms)); };
      if (m.fx.embers) add(new Embers(() => ({ x: Math.random() * 390, y: 700 + Math.random() * 80 }), 4, 1.3, undefined, 30));
      if (m.fx.ripple) add(new Ripple(m.fx.ripple.x, m.fx.ripple.y));
      if (m.fx.steam) add(new Steam(m.fx.steam, 24));
    }
    C.addChild(full(cv.over));
    C.alpha = 0;
    void this.tw.run(400, (k) => { C.alpha = k; });
  }
  private async loadFoeMat(id: string) {
    const cv = await loadFlatMat(id).catch(() => null);
    if (!cv || this.destroyed_) return;
    const sp = new Sprite(Texture.from(cv)); sp.x = MAT_VIEW.x; sp.y = MAT_VIEW.y; sp.width = MAT_VIEW.w; sp.height = MAT_VIEW.h;
    this.foeMat.addChild(sp);
    this.foeMat.alpha = 0;
    void this.tw.run(400, (k) => { this.foeMat.alpha = k * 0.55; });
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
    const first = this.cfg.first ?? ((Math.random() < 0.5 ? 0 : 1) as PlayerIndex);
    const { state } = createGame([this.cfg.myDeck, this.cfg.aiDeck], seed, first);
    this.s = state;
    this.log = { seed, first, decks: [this.cfg.myDeck.slice(), this.cfg.aiDeck.slice()], actions: [] };
    this.syncAll(false);
    await this.dealIntro(first);
    this.ready = true; // lets the move timer show
    await this.loop();
  }

  /** Opening hand animation and the "who starts" banner. */
  private async dealIntro(first: PlayerIndex) {
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
    await this.fx.banner(first === 0 ? `${this.me}が先手` : `${this.foe}が先手`, '時計が遅れている方が行動します', first === 0 ? COLORS.you : COLORS.foe, 360, 640);
  }

  // ------------------------------------------------------------------ turn loop
  private checkTimeout() {
    if (this.timerEnd === null || this.busy || this.finished || actor(this.s) !== 0 || performance.now() < this.timerEnd) return;
    this.timerEnd = null;
    this.strikes++;
    if (this.strikes >= NET.MAX_AFK) { this.surrender('timeout'); return; }
    this.toast('時間切れ：待機しました');
    void this.tryAction({ t: 'wait' }, true);
  }

  private async loop() {
    while (!this.destroyed_ && !this.s.over) {
      const a = actor(this.s);
      if (a === 1) {
        this.busy = true;
        if (this.cfg.rated) this.setTimer(NET.TURN_MS);
        this.refreshControls();
        // a person takes a moment to decide; rated opponents do too (the AI's own thinking counts towards it)
        let pause = this.cfg.rated ? 700 + Math.random() * 1900 : 420;
        const t0 = performance.now();
        let act: Action;
        let hesitate = false;
        if (this.cfg.rival) {
          const rv = this.cfg.rival;
          const mv = await chooseRivalAsync(this.s, 1, rv, (this.mind ??= newMind()));
          if (this.destroyed_) return;
          if (mv.surrender) { await this.tw.wait(1200); if (!this.destroyed_) this.foeSurrender(); return; }
          act = mv.action;
          pause = thinkMs(mv, rv, this.s, { streak: this.aiStreak, first: !this.aiMoved });
          // 迷いの演出: a card is lifted from the hand and put back before the one played
          hesitate = mv.kind === 'torn' && mv.alt !== undefined && Math.random() < 0.3;
        } else act = this.cfg.aiSpec ? await chooseActionSpecAsync(this.s, 1, this.cfg.aiSpec) : await chooseActionAsync(this.s, 1, this.cfg.level);
        if (this.destroyed_) return;
        const left = Math.max(0, pause - (performance.now() - t0));
        if (hesitate && left > 900) { await this.tw.wait(left - 900); if (this.destroyed_) return; await this.liftFoeCard(); }
        else await this.tw.wait(left);
        if (this.destroyed_) return;
        this.aiMoved = true;
        this.aiStreak = true;
        const ev = apply(this.s, act);
        this.log?.actions.push(act);
        if (this.log) this.cfg.onProgress?.(this.log, this.myActs);
        await this.play(ev);
      } else if (a === 0) {
        this.aiStreak = false;
        this.busy = false;
        if (this.s.pending && !this.watching) { this.refreshControls(); this.showChoice(); return; }
        if (this.cfg.rated) this.setTimer(NET.TURN_MS);
        this.refreshControls();
        return;
      } else break;
    }
    if (this.s.over && !this.destroyed_) await this.finish();
  }

  private async tryAction(a: Action, auto = false) {
    if (this.busy || actor(this.s) !== 0) { audio.play('deny'); return; }
    if (!auto) this.strikes = 0;
    if (this.cfg.rated) this.timerEnd = null;
    this.setMode({ k: 'idle' });
    this.closeModal();
    this.busy = true;
    this.refreshControls();
    if (this.cfg.net) {
      // the server decides; the answer arrives as an `events` message and is played by `pump`
      this.cfg.net.send({ t: 'act', n: this.s.actions, a });
      return;
    }
    const ev = apply(this.s, a);
    this.log?.actions.push(a);
    if (this.log) this.cfg.onProgress?.(this.log, this.myActs + 1);
    await this.play(ev);
    await this.loop();
  }

  private async finish() {
    if (this.finished) return;
    this.finished = true;
    this.busy = true;
    this.refreshControls();
    const o = this.netResult ?? this.s.over!;
    await this.tw.wait(500);
    if (this.destroyed_) return;
    this.onEnd({ winner: o.winner, reason: o.reason, myHp: this.s.players[0].hp, foeHp: this.s.players[1].hp, actions: this.s.actions, myActions: this.myActs, stats: { ...this.stats }, played: [...this.played], feats: this.feats.result(this.s), ...(this.log ? { log: this.log } : {}) });
  }
  // ------------------------------------------------------------------ online play
  private async startOnline(net: NetLink) {
    const g = net.init;
    this.s = g.state;
    this.setFoe(g.foe, true);
    this.setTimer(g.left);
    this.syncAll(false);
    if (g.result) { this.netResult = g.result; this.ready = true; await this.finish(); return; } // rejoined a match that already ended
    this.busy = true;
    this.refreshControls();
    if (g.fresh) await this.dealIntro(g.first);
    if (this.destroyed_) return;
    this.ready = true;
    this.busy = this.watching || actor(this.s) !== 0;
    this.refreshControls();
    void this.pump();
  }

  private onNet(m: ServerMsg) {
    switch (m.t) {
      case 'events': case 'over': this.inbox.push(m); void this.pump(); break;
      case 'game': if (!m.fresh) { this.inbox.push(m); void this.pump(); } break;
      case 'timer': this.setTimer(m.left); break;
      case 'foe': this.setFoe(m.foe, false); break;
      case 'error':
        this.toast(m.msg);
        if (!this.pumping && !this.inbox.length && !this.finished) { this.flyFrom = null; this.busy = this.watching || actor(this.s) !== 0; this.syncAll(false); }
        break;
      default: break;
    }
  }

  /** Plays what the server sends, one message at a time, and hands control back when it is our move. */
  private async pump() {
    if (this.pumping || !this.ready || this.destroyed_) return;
    this.pumping = true;
    try {
      while (this.inbox.length && !this.destroyed_) {
        const m = this.inbox.shift()!;
        if (m.t === 'events') {
          if (m.auto) { this.drag = null; this.unitDrag = null; this.closeModal(); if (this.mode.k !== 'idle') this.setMode({ k: 'idle' }); }
          this.busy = true;
          this.refreshControls();
          this.s = m.state;
          this.setTimer(m.left);
          if (m.auto) { const who = m.events[0]?.e === 'act' ? m.events[0].pi : 0; this.toast(who === 0 ? (this.watching ? `${this.me}が時間切れ` : '時間切れ：待機しました') : `${this.foe}が時間切れ`); }
          await this.play(m.events);
        } else if (m.t === 'game') {
          this.s = m.state;
          this.setTimer(m.left);
          this.setFoe(m.foe, true);
          this.syncAll(false);
        } else if (m.t === 'over') this.netResult = m.result;
      }
      if (this.netResult) await this.finish();
      else if (!this.destroyed_) { this.busy = this.watching || actor(this.s) !== 0; this.refreshControls(); }
    } finally { this.pumping = false; }
  }

  private setTimer(left: number | null) { this.timerEnd = left === null ? null : performance.now() + left; this.drawTimer(true); }
  private setFoe(p: { online: boolean; left: number | null } | null, silent: boolean) {
    const away = p && !p.online ? performance.now() + (p.left ?? 0) : null;
    if (!silent && away !== null && this.foeAway === null) this.toast(`${this.foe}の接続が切れました。戻るのを待ちます`);
    if (!silent && away === null && this.foeAway !== null && p) this.toast(`${this.foe}が戻りました`);
    this.foeAway = away;
    this.drawTimer(true);
  }
  /** The chip at the top: whose time is running, or why it is not. */
  private drawTimer(force: boolean) {
    let text = '', color: number = COLORS.ivory;
    if (this.finished || this.netResult || !this.ready || !this.s) text = '';
    else if (this.linkDown) { text = '接続を再試行中…'; color = COLORS.brass; }
    else if (this.foeAway !== null) { text = `${this.foe}の再接続を待っています ${Math.max(0, Math.ceil((this.foeAway - performance.now()) / 1000))}秒`; color = COLORS.brass; }
    else if (this.timerEnd !== null) {
      const sec = Math.max(0, Math.ceil((this.timerEnd - performance.now()) / 1000));
      const mine = actor(this.s) === 0;
      text = `${mine ? this.me : this.foe}　残り ${sec} 秒`;
      color = sec <= 10 ? COLORS.doom : mine ? COLORS.you : COLORS.foe;
    }
    if (!force && text === this.timerShown) return;
    this.timerShown = text;
    this.timerC.visible = text !== '';
    if (!text) return;
    this.timerTxt.text = text;
    this.timerTxt.style.fill = color;
    const w = this.timerTxt.width + 40, h = this.timerTxt.height + 12;
    this.timerBg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: COLORS.ink, alpha: 0.85 }).roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ color, width: 2, alpha: 0.9 });
  }

  /** Test hook (only exposed with #debug in the URL). */
  /**
   * A choice the rules ask of the player (星読みの占者: a card from the top 3; 忘却の砂: the card to throw away;
   * 記憶の司書ミレア: the spell to use again). The panel cannot be closed: the game waits for the answer.
   */
  private showChoice() {
    const pd = this.s.pending;
    if (!pd || pd.pi !== 0) return;
    const hand = this.s.players[0].hand;
    const cards = pd.options.map((o) => (typeof o === 'number' ? hand.find((h) => h.uid === o)?.card ?? HIDDEN : o));
    const title = pd.kind === 'seer' ? '手札に加えるカードを1枚選ぶ' : pd.kind === 'discard' ? `${this.foe}の忘却の砂：捨てるカードを1枚選ぶ` : 'もう一度使う呪文を1枚選ぶ';
    const sub = pd.kind === 'seer' ? '残りは山札の下に置かれます' : pd.kind === 'discard' ? '選んだカードは捨て札になります' : 'コストを払わずに使います';
    audio.play('select');
    this.closeModal();
    const c = new Container();
    c.addChild(new Graphics().rect(-400, -400, 1520, 2080).fill({ color: 0x03070a, alpha: 0.82 }));
    (c.children[0] as Graphics).eventMode = 'static';
    const t = label(title, 30, COLORS.ivory, { font: FONTS.display, weight: '700', align: 'center', wrap: 640 });
    t.anchor.set(0.5); t.x = 360; t.y = 330;
    const st = label(sub, 20, COLORS.mute, { align: 'center' });
    st.anchor.set(0.5); st.x = 360; st.y = 378;
    c.addChild(t, st);
    const n = cards.length, sc = n <= 3 ? 0.58 : n <= 5 ? 0.4 : 0.3;
    const w = 340 * sc + 16, cols = Math.min(n, Math.floor(680 / w)), rows = Math.ceil(n / cols);
    cards.forEach((card, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const f = card === HIDDEN ? makeBack(this.cfg.looks?.back) : makeFace(card);
      f.scale.set(sc);
      f.x = 360 + (col - (inRow - 1) / 2) * w; f.y = 420 + 476 * sc / 2 + row * (476 * sc + 18);
      f.eventMode = 'static'; f.cursor = 'pointer';
      f.on('pointertap', (e) => { e.stopPropagation(); this.closeModal(); audio.play('summon'); void this.tryAction({ t: 'choose', i }); });
      c.addChild(f);
    });
    void rows;
    this.overlay.addChild(c);
    this.modal = c;
    c.alpha = 0;
    void this.tw.to(c, { alpha: 1 }, 160);
    this.dial.setStatus('選んでください', title, 'you');
  }
  private mind: RivalMind | null = null;
  private aiMoved = false;
  private aiStreak = false;
  /** 迷いの演出: one of the opponent's cards rises a little and goes back. */
  private async liftFoeCard() {
    const n = this.foeHandLayer.children.length;
    if (!n) { await this.tw.wait(900); return; }
    const c = this.foeHandLayer.children[Math.floor(Math.random() * n)];
    const y = c.y;
    await this.tw.to(c, { y: y + 26 }, 180);
    await this.tw.wait(400);
    await this.tw.to(c, { y }, 180);
    await this.tw.wait(140);
  }
  /** A rated rival gives up (降参): the player wins. */
  private foeSurrender() {
    if (this.s.over || this.finished) return;
    this.finished = true;
    this.busy = true;
    this.timerEnd = null;
    this.toast(`${this.foe}が降参しました`);
    this.onEnd({ winner: 0, reason: 'surrender', myHp: this.s.players[0].hp, foeHp: this.s.players[1].hp, actions: this.s.actions, myActions: this.myActs, stats: { ...this.stats }, played: [...this.played], feats: this.feats.result(this.s), ...(this.log ? { log: this.log } : {}) });
  }
  debug() { return { s: this.s, busy: this.busy, mode: this.mode.k, use: (uid: number, lane: number | null) => this.use(uid, lane), act: (a: Action) => this.tryAction(a), auto: () => (this.cfg.net ? legalActions(this.s, 0).filter((x) => x.t !== 'wait' && x.t !== 'draw')[0] ?? { t: 'wait' } : chooseAction(this.s, 0, 'normal')), finished: this.finished, hand: () => [...this.handViews].map(([uid, v]) => ({ uid, card: v.card, x: v.x, y: v.y })), lanes: { x: [...LANE_X], y: ROW_Y[0] }, redraw: () => this.syncAll(false), giveUp: () => this.surrender('surrender') }; }
  surrender(reason: 'surrender' | 'timeout' = 'surrender') {
    if (this.cfg.net) { this.cfg.net.send({ t: 'surrender' }); return; }
    if (this.s.over || this.finished) return;
    this.finished = true;
    this.busy = true;
    this.timerEnd = null;
    this.onEnd({ winner: 1, reason, myHp: this.s.players[0].hp, foeHp: this.s.players[1].hp, actions: this.s.actions, myActions: this.myActs, stats: { ...this.stats }, played: [...this.played], feats: this.feats.result(this.s), ...(this.log ? { log: this.log } : {}) });
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
      const selected = (this.mode.k === 'lane' || this.mode.k === 'resv' || this.mode.k === 'charge') && this.mode.uid === h.uid;
      v.homeX = p.x; v.homeY = p.y - (selected ? 46 : 0); v.homeR = selected ? 0 : p.r; v.homeS = selected ? 0.66 : 0.6;
      v.highlight(selected);
      const c = cardCost(this.s, 0, h.card);
      v.setCost(c !== cardDef(h.card).cost ? c : null);
      this.handLayer.setChildIndex(v, Math.min(i, this.handLayer.children.length - 1));
      if (this.drag?.view === v) return;
      if (animate) { void this.tw.to(v, { x: v.homeX, y: v.homeY, rotation: v.homeR }, 260); void this.tw.to(v.scale, { x: v.homeS, y: v.homeS }, 260); }
      else { v.x = v.homeX; v.y = v.homeY; v.rotation = v.homeR; v.scale.set(v.homeS); }
    });
  }
  private layoutFoeHand() {
    const n = this.s.players[1].hand.length;
    while (this.foeHandLayer.children.length < n) { const b = makeBack(this.cfg.looks?.foeBack); b.scale.set(0.14); this.foeHandLayer.addChild(b); }
    while (this.foeHandLayer.children.length > n) this.foeHandLayer.removeChildAt(this.foeHandLayer.children.length - 1).destroy();
    this.foeHandLayer.children.forEach((c, i) => {
      const off = i - (n - 1) / 2;
      c.x = FOE_HAND_POS.x - 140 + off * 18; c.y = FOE_HAND_POS.y + Math.abs(off) * 1.5; c.rotation = off * 0.08;
    });
  }
  private addHandView(uid: number, card: string) {
    const v = new HandCardView(uid, card, this.cfg.looks?.back);
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
      this.huds[pi].setInfo(p.deck.length, pi === 1 ? p.hand.length : null, resvCount(p), p.resv.length - resvCount(p));
      void this.dial.setHand(pi, p.time, false);
      // pins
      const want = new Set(p.resv.map((r) => r.uid));
      for (const [uid] of this.dial.pinsFor(pi)) if (!want.has(uid)) void this.dial.removePin(uid, 'fire');
      for (const r of p.resv) {
        const info = this.dial.pinInfo(r.uid);
        const show = (pi === 0 || r.revealed) && r.card !== HIDDEN ? r.card : null;
        if (!info) this.dial.addPin(r.uid, pi, r.T, show, !!r.echo).on('pointertap', (e) => { e.stopPropagation(); this.onPinTap(r.uid); });
        else {
          if (show && !info.card) this.dial.revealPin(r.uid, show);
          if (info.T !== r.T) void this.dial.movePin(r.uid, r.T);
        }
      }
    }
    for (const [uid, v] of this.unitViews) if (!alive.has(uid)) { v.destroy({ children: true }); this.unitViews.delete(uid); }
    // hand
    const hand = new Set(s.players[0].hand.map((h) => h.uid));
    for (const [uid, v] of this.handViews) if (!hand.has(uid)) { v.destroy({ children: true }); this.handViews.delete(uid); }
    for (const h of s.players[0].hand) if (!this.handViews.has(h.uid)) this.addHandView(h.uid, h.card);
    this.layoutHand(animate);
    this.layoutFoeHand();
    this.deckPile.visible = s.players[0].deck.length > 0;
    this.deckPileTxt.text = String(s.players[0].deck.length);
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
    const choosing = !!this.s.pending && this.s.pending.pi === 0;
    const mine = !this.watching && !this.busy && actor(this.s) === 0 && !this.s.over && !choosing;
    this.drawBtn.enabled = mine && this.s.players[0].deck.length > 0;
    this.waitBtn.enabled = mine;
    // a pending choice always has its panel (if something closed it, it comes back)
    if (choosing && !this.busy && !this.watching && !this.modal) queueMicrotask(() => this.showChoice());
    const who = this.s.over ? -1 : actor(this.s);
    this.huds[0].setActive(who === 0); this.huds[1].setActive(who === 1);
    const [y, f] = this.s.players;
    if (this.s.over) this.dial.setStatus('決着', '', 'neutral');
    else if (actor(this.s) === 1) this.dial.setStatus(`${this.foe}の番`, `${this.foe} ${f.time}刻 ・ ${this.me} ${y.time}刻`, 'foe');
    else if (this.watching) this.dial.setStatus(`${this.me}の番`, `${this.me} ${y.time}刻 ・ ${this.foe} ${f.time}刻`, 'you');
    else if (this.mode.k === 'idle' && !this.drag && !this.unitDrag) this.dial.setStatus('あなたの番', this.clockLine(), 'you');
    for (const v of this.handViews.values()) v.alpha = mine || this.busy ? 1 : 0.8;
  }
  private clockLine() {
    const [y, f] = this.s.players;
    const lead = f.time - y.time;
    if (lead > 0) return `あなた ${y.time}刻 ・ ${this.foe} ${f.time}刻（あと${lead}刻は連続で動ける）`;
    return `あなた ${y.time}刻 ・ ${this.foe} ${f.time}刻（同刻）`;
  }
  /** Preview of where your hand lands if you spend `cost`. */
  private forecast(cost: number) {
    const [y, f] = this.s.players;
    const t = y.time + cost;
    this.dial.showGhost(Math.min(t, RULES.END));
    const next = t < f.time ? 'まだあなたの番' : t === f.time ? `同刻 → ${this.foe}の番` : `${this.foe}の番（${this.foe}が${t - f.time}刻先行を取り返すまで）`;
    this.dial.setStatus(`${cost}刻 使う`, `使用後 ${t}刻 → ${next}`, 'you');
  }
  private clearForecast() { this.dial.showGhost(null); this.refreshControls(); }

  // ------------------------------------------------------------------ input
  private setMode(m: Mode) {
    const prev = this.mode;
    this.mode = m;
    if (prev.k === 'attack' || prev.k === 'shift') this.viewAt(0, prev.lane)?.select(false);
    this.clearAim();
    this.laneHi.clear();
    this.dial.showCursor(null);
    this.actionBar.removeChildren().forEach((c) => c.destroy({ children: true }));
    // tuck the hand away while a choice is pending so the action bar has room
    const tuck = m.k !== 'idle';
    void this.tw.to(this.handLayer, { y: tuck ? 190 : 0, alpha: tuck ? 0.55 : 1 }, 220);
    if (m.k === 'idle') { this.clearForecast(); this.layoutHand(); return; }
    if (m.k === 'lane') {
      const h = this.s.players[0].hand.find((x) => x.uid === m.uid)!;
      this.forecast(cardCost(this.s, 0, h.card));
      this.showLaneHi(this.emptyLanes());
      this.bar([['やめる', 'plain', () => this.setMode({ k: 'idle' })]], '召喚するレーンをタップ');
    }
    if (m.k === 'resv') {
      const h = this.s.players[0].hand.find((x) => x.uid === m.uid)!;
      const d = cardDef(h.card);
      this.forecast(cardCost(this.s, 0, d.id));
      this.dial.showCursor(m.T, true);
      this.bar([
        ['−', 'plain', () => this.nudgeResv(-1)],
        ['やめる', 'plain', () => this.setMode({ k: 'idle' })],
        [`${m.T}刻に予約`, 'primary', () => this.tryAction({ t: 'reserve', hand: m.uid, T: m.T })],
        ['＋', 'plain', () => this.nudgeResv(1)],
      ], '時計をタップ／ドラッグして発動時刻を選ぶ');
    }
    if (m.k === 'charge') {
      const h = this.s.players[0].hand.find((x) => x.uid === m.uid)!;
      const d = cardDef(h.card);
      const cost = cardCost(this.s, 0, h.card) + m.x;
      this.forecast(cost);
      if (m.lane !== null) this.showLaneHi([m.lane], COLORS.you);
      const act: Action = d.kind === 'unit' ? { t: 'play', hand: m.uid, lane: m.lane!, x: m.x } : { t: 'cast', hand: m.uid, x: m.x };
      const nudge = (k: number) => { const x = Math.max(0, Math.min(d.charge!, m.x + k)); if (x !== m.x) { audio.play('tick'); this.setMode({ ...m, x }); } };
      this.bar([
        ['−', 'plain', () => nudge(-1)],
        ['やめる', 'plain', () => { this.flyFrom = null; this.setMode({ k: 'idle' }); }],
        [`${d.kind === 'unit' ? '召喚' : '使う'}（${cost}刻）`, 'primary', () => void this.tryAction(act)],
        ['＋', 'plain', () => nudge(1)],
      ], this.chargeHint(h.card, m.x));
    }
    if (m.k === 'attack') {
      const v = this.viewAt(0, m.lane);
      v?.select(true);
      this.forecast(RULES.COST_ATTACK);
      this.drawAttackArrow(m.lane, null);
      this.aimStatus(m.lane, false);
      const mv = this.moveLanes(m.lane);
      this.showLaneHi(mv, COLORS.you);
      this.bar([
        ['やめる', 'plain', () => this.setMode({ k: 'idle' })],
        ...this.moveButtons(m.lane, mv, true),
        [`攻撃する`, 'primary', () => this.tryAction({ t: 'attack', lane: m.lane })],
        ...this.moveButtons(m.lane, mv, false),
      ], this.attackPreview(m.lane));
    }
    if (m.k === 'shift') {
      this.viewAt(0, m.lane)?.select(true);
      this.forecast(RULES.COST_MOVE);
      const mv = this.moveLanes(m.lane);
      this.showLaneHi(mv, COLORS.you);
      this.bar([...this.moveButtons(m.lane, mv, true), ['やめる', 'plain', () => this.setMode({ k: 'idle' })], ...this.moveButtons(m.lane, mv, false)], `転移：隣の空いたレーンへ移る（${RULES.COST_MOVE}刻）`);
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
    const r = resvRange(this.s, 0, cardCost(this.s, 0, h.card))!;
    const T = Math.max(r[0], Math.min(r[1], this.mode.T + d));
    this.setMode({ k: 'resv', uid: this.mode.uid, T });
  }
  private unitReady(lane: number) { const u = this.s.players[0].field[lane]; return !!u && isReady(this.s, 0, u); }
  /** 転移: the empty lanes next to the player's unit in `lane` it can move to right now. */
  private moveLanes(lane: number): number[] {
    const p = this.s.players[0], u = p.field[lane];
    if (!u || !canShift(this.s, 0, u) || this.busy || actor(this.s) !== 0) return [];
    return [lane - 1, lane + 1].filter((l) => l >= 0 && l < RULES.LANES && !p.field[l]);
  }
  private moveButtons(lane: number, lanes: number[], left: boolean): [string, 'plain' | 'primary', () => void][] {
    const to = left ? lane - 1 : lane + 1;
    return lanes.includes(to) ? [[left ? '← 転移' : '転移 →', 'plain', () => void this.tryAction({ t: 'move', lane, to })]] : [];
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
    if (this.modal || this.watching || v.card === HIDDEN) return;
    const p = this.local(e);
    this.drag = { view: v, sx: p.x, sy: p.y, moved: false, ox: v.x - p.x, oy: v.y - p.y };
  }
  private onUnitDown(v: UnitView, e: FederatedPointerEvent) {
    e.stopPropagation();
    audio.unlock();
    if (this.modal) return;
    const lane = LANE_X.findIndex((x) => Math.abs(x - v.x) < 2);
    if (!this.watching && v.owner === 0 && !this.busy && actor(this.s) === 0 && (v.ready || this.moveLanes(lane).length)) {
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
        this.forecast(cardCost(this.s, 0, def.id));
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
          const r = resvCount(this.s.players[0]) < RULES.MAX_RESV ? resvRange(this.s, 0, cardCost(this.s, 0, def.id)) : null;
          if (this.dial.hit(p.x, p.y)) {
            const T = this.dial.tFromPoint(p.x, p.y);
            this.dial.showCursor(r ? Math.max(r[0], Math.min(r[1], T)) : T, !!r);
            this.dial.setStatus('予約', r ? `離すと ${Math.max(r[0], Math.min(r[1], T))}刻に予約（${cardCost(this.s, 0, def.id)}刻）` : '予約できません（上限か時刻が足りない）', 'you');
          } else {
            this.dial.showCursor(null);
            if (p.y < L.youHud - 30) this.dial.setStatus('今すぐ使う', `離すと発動（${cardCost(this.s, 0, def.id)}刻）・時計に重ねると予約`, 'you');
            else this.forecast(cardCost(this.s, 0, def.id));
          }
        }
      }
      return;
    }
    if (this.unitDrag) {
      const u = this.unitDrag;
      const ready = this.unitReady(u.lane);
      if (!u.moved && Math.hypot(p.x - u.sx, p.y - u.sy) > 16) { u.moved = true; this.setMode(ready ? { k: 'attack', lane: u.lane } : { k: 'shift', lane: u.lane }); }
      if (u.moved) {
        const l = this.laneAt(p.x, p.y), mv = this.moveLanes(u.lane);
        if (mv.includes(l)) { this.clearAim(); this.showLaneHi([l], COLORS.you); this.dial.setStatus('離すと転移', `隣のレーンへ（${RULES.COST_MOVE}刻）`, 'you'); }
        else {
          this.showLaneHi(mv, COLORS.brass);
          if (ready) { this.drawAttackArrow(u.lane, p); this.aimStatus(u.lane, true, p.y < L.front); }
        }
      }
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
        if (l >= 0 && !this.s.players[0].field[l]) { this.flyFrom = { x: d.view.x, y: d.view.y }; this.use(d.view.uid, l); return; }
      } else {
        const r = resvCount(this.s.players[0]) < RULES.MAX_RESV ? resvRange(this.s, 0, cardCost(this.s, 0, def.id)) : null;
        if (this.dial.hit(p.x, p.y)) {
          if (r) { const T = Math.max(r[0], Math.min(r[1], this.dial.tFromPoint(p.x, p.y))); this.flyFrom = { x: d.view.x, y: d.view.y }; void this.tryAction({ t: 'reserve', hand: d.view.uid, T }); return; }
          audio.play('deny');
          this.toast(resvCount(this.s.players[0]) >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約するには時間が足りません');
        } else if (p.y < L.youHud - 30) {
          if (def.reserveOnly) { audio.play('deny'); this.toast('予約専用：時計に重ねて予約してください'); }
          else { this.flyFrom = { x: d.view.x, y: d.view.y }; this.use(d.view.uid, null); return; }
        }
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
      const ready = this.unitReady(u.lane);
      if (!u.moved) {
        if (!ready) { this.setMode({ k: 'shift', lane: u.lane }); return; }
        if (this.mode.k === 'attack' && this.mode.lane === u.lane) void this.tryAction({ t: 'attack', lane: u.lane });
        else this.setMode({ k: 'attack', lane: u.lane });
        return;
      }
      const l = this.laneAt(p.x, p.y);
      if (this.moveLanes(u.lane).includes(l)) void this.tryAction({ t: 'move', lane: u.lane, to: l });
      else if (ready && p.y < L.front) void this.tryAction({ t: 'attack', lane: u.lane });
      else this.setMode({ k: 'idle' });
    }
  }
  private onBackgroundTap(e: FederatedPointerEvent) {
    audio.unlock();
    if (this.modal) return;
    const p = this.local(e);
    if (this.mode.k === 'lane') {
      const l = this.laneAt(p.x, p.y);
      if (l >= 0 && !this.s.players[0].field[l]) { const uid = this.mode.uid; this.flyFrom = this.handPos(uid); this.use(uid, l); }
      return;
    }
    if (this.mode.k === 'charge') { if (Math.abs(p.y - L.bar) < 70) return; this.setMode({ k: 'idle' }); return; }
    if (this.mode.k === 'attack' || this.mode.k === 'shift') {
      const from = this.mode.lane, l = this.laneAt(p.x, p.y);
      if (this.moveLanes(from).includes(l)) { void this.tryAction({ t: 'move', lane: from, to: l }); return; }
      if (this.mode.k === 'shift' && Math.abs(p.y - L.bar) < 70) return;
    }
    if (this.mode.k === 'resv') { if (this.dial.hit(p.x, p.y)) this.pickResvAt(p.x, p.y); return; }
    if (this.mode.k === 'attack' && Math.abs(p.y - L.bar) < 70) return;
    if (this.mode.k !== 'idle') this.setMode({ k: 'idle' });
  }
  private pickResvAt(x: number, y: number) {
    if (this.mode.k !== 'resv') return;
    const h = this.s.players[0].hand.find((q) => q.uid === (this.mode as { uid: number }).uid)!;
    const r = resvRange(this.s, 0, cardCost(this.s, 0, h.card))!;
    const T = Math.max(r[0], Math.min(r[1], this.dial.tFromPoint(x, y)));
    if (T !== this.mode.T) { audio.play('tick'); this.setMode({ k: 'resv', uid: this.mode.uid, T }); }
  }
  private onPinTap(uid: number) {
    const info = this.dial.pinInfo(uid);
    if (!info) return;
    if (info.card && info.echo) this.inspectCard(info.card, [`${info.pi === 0 ? this.me : this.foe}の残響：両者の時計が${info.T}刻に達すると、弱い効果がもう一度起きる`]);
    else if (info.card) this.inspectCard(info.card, [`${info.pi === 0 ? this.me : this.foe}の予約：両者の時計が${info.T}刻に達すると発動`]);
    else this.toast(`${info.pi === 0 ? this.me : this.foe}の予約：${info.T}刻に発動（中身は不明）`);
  }
  /** Use a card right away. 充填 cards first ask how much extra time to pay. */
  private use(uid: number, lane: number | null) {
    const h = this.s.players[0].hand.find((x) => x.uid === uid);
    if (!h) return;
    if (this.s.pending?.pi === 0) { this.showChoice(); return; } // answer the choice first
    const d = cardDef(h.card);
    this.flyFrom ??= this.handPos(uid);
    if (d.charge) { this.setMode({ k: 'charge', uid, x: 0, lane }); return; }
    if (d.reserveOnly) { this.startResv(uid); return; }
    void this.tryAction(d.kind === 'unit' ? { t: 'play', hand: uid, lane: lane! } : { t: 'cast', hand: uid });
  }
  /** 予約専用 cards (and the 予約する button): choose the time on the clock. */
  private startResv(uid: number) {
    const h = this.s.players[0].hand.find((x) => x.uid === uid);
    if (!h) return;
    const r = resvCount(this.s.players[0]) < RULES.MAX_RESV ? resvRange(this.s, 0, cardCost(this.s, 0, h.card)) : null;
    if (!r) { audio.play('deny'); this.toast(resvCount(this.s.players[0]) >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約するには時間が足りません'); this.flyFrom = null; return; }
    this.flyFrom = null;
    this.setMode({ k: 'resv', uid, T: Math.min(r[1], r[0] + 2) });
  }
  private chargeHint(card: string, x: number): string {
    const d = cardDef(card);
    const head = `充填 ${x}/${d.charge}`;
    if (d.kind === 'unit') return `${head}：攻撃${d.atk! + x}・体力${d.hp! + x}${card === 'e_colossus' && x >= 3 ? '・挑発' : ''}`;
    if (d.effect === 'eSlash') return `${head}：敵ユニットに${1 + x}ダメージ`;
    return head;
  }
  private handPos(uid: number) { const v = this.handViews.get(uid); return v ? { x: v.x, y: v.y } : null; }

  private attackPreview(lane: number): string {
    const u = this.s.players[0].field[lane]!;
    const t = attackTarget(this.s, 0, lane);
    const doom = this.s.doom;
    if (!t) return `${this.foe}の拠点に${u.atk + doom}ダメージ${doom ? '（終焉+' + doom + '）' : ''}（1刻）`;
    const v = this.s.players[1].field[t.lane]!;
    const kill = u.atk >= v.hp, die = v.atk >= u.hp;
    const over = u.pierce && u.atk > v.hp ? `・貫通${u.atk - v.hp + doom}` : '';
    return `${cardDef(v.card).name}と交戦：${kill ? '撃破' : `残り体力${v.hp - u.atk}`}／こちら${die ? '破壊' : `残り${u.hp - v.atk}`}${over}${t.lane !== lane ? '（挑発に阻まれる）' : ''}`;
  }
  private targetPoint(t: Target): { x: number; y: number } {
    if (!t) return { x: this.huds[1].center.x + 40, y: this.huds[1].center.y + 10 };
    return { x: LANE_X[t.lane], y: ROW_Y[t.pi] };
  }
  /** What an attack from `lane` does, with the same numbers the engine uses (hooks that change the damage included). */
  private attackOutcome(lane: number) {
    const s = this.s, me = s.players[0], u = me.field[lane]!;
    const t = attackTarget(s, 0, lane);
    const hk = cardDef(u.card).hook;
    let atk = u.atk + (hk === 'formation' ? me.field.filter((x) => x && x !== u).length : 0);
    if (!t) {
      const dmg = atk + (hk === 'flank' ? 2 : 0) + s.doom;
      const hp = s.players[1].hp;
      return { base: true as const, name: '拠点', before: hp, after: Math.max(0, hp - dmg), dmg, doom: s.doom };
    }
    const v = s.players[1].field[t.lane]!;
    if (hk === 'tauntBreaker' && v.taunt) atk += 3;
    const over = u.pierce && atk > v.hp ? atk - v.hp + s.doom : 0;
    return { base: false as const, name: cardDef(v.card).name, before: v.hp, after: Math.max(0, v.hp - atk), myBefore: u.hp, myAfter: Math.max(0, u.hp - v.atk), pierce: over, blocked: t.lane !== lane, targetLane: t.lane };
  }
  /** The line on the clock while a unit is chosen: what happens when you let go (or tap again). */
  private aimStatus(lane: number, held: boolean, inRange = true) {
    const o = this.attackOutcome(lane);
    const t = this.s.players[0].time;
    this.dial.setStatus(held ? (inRange ? '離すと攻撃' : '上へ引いて攻撃') : 'もう一度タップで攻撃', `${o.name}へ ・ ${RULES.COST_ATTACK}刻（あなた ${t}→${t + RULES.COST_ATTACK}刻）`, 'you');
  }
  private drawAttackArrow(lane: number, finger: { x: number; y: number } | null) {
    const fresh = !this.aim || this.aim.lane !== lane;
    this.aim = { lane, finger };
    if (fresh) { this.aimT = 0; this.showAimPanel(lane); }
    this.paintAim();
  }
  private clearAim() {
    this.aim = null;
    this.arrowG.clear();
    this.aimRing.clear();
    this.aimPanel.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const v of this.unitViews.values()) if (v.owner === 1) v.alpha = 1;
  }
  /**
   * Chevrons from the unit to the target the rules pick (the lane in front, or what a taunt draws in, or the base),
   * moving towards it, and a pulsing ring on the target. Redrawn every frame while the aim is up.
   */
  private paintAim() {
    const aim = this.aim;
    if (!aim || !this.s.players[0].field[aim.lane]) { this.arrowG.clear(); this.aimRing.clear(); return; }
    const t = attackTarget(this.s, 0, aim.lane);
    const from = { x: LANE_X[aim.lane], y: ROW_Y[0] - UNIT_H / 2 + 6 };
    const end = this.targetPoint(t);
    const to = t ? { x: end.x, y: end.y + UNIT_H / 2 - 6 } : { x: end.x + 10, y: end.y + 40 };
    const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - (t && t.lane === aim.lane ? 0 : 70);
    const g = this.arrowG.clear();
    const at = (k: number) => ({ x: (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * mx + k * k * to.x, y: (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * my + k * k * to.y });
    const len = Math.hypot(to.x - from.x, to.y - from.y) + Math.abs(my - Math.min(from.y, to.y));
    const n = Math.max(3, Math.round(len / 34));
    const phase = (this.aimT * 1.6) % 1;
    for (let i = 0; i < n; i++) {
      const k = (i + phase) / n;
      if (k <= 0.02 || k >= 0.98) continue;
      const p = at(k), q = at(Math.min(1, k + 0.02));
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      const w = 15, back = 11;
      const alpha = 0.35 + 0.65 * Math.sin(k * Math.PI);
      const px = (dx: number, dy: number) => [p.x + Math.cos(a) * dx - Math.sin(a) * dy, p.y + Math.sin(a) * dx + Math.cos(a) * dy];
      const [x1, y1] = px(-back, -w), [x2, y2] = px(0, 0), [x3, y3] = px(-back, w);
      g.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).stroke({ color: 0x2a1d07, width: 9, alpha: alpha * 0.5, cap: 'round', join: 'round' });
      g.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).stroke({ color: 0xf4d692, width: 5, alpha, cap: 'round', join: 'round' });
    }
    // the ring on the target
    const pulse = 0.55 + 0.45 * Math.sin(this.aimT * 6);
    const r = this.aimRing.clear();
    if (t) {
      const x = LANE_X[t.lane], y = ROW_Y[1];
      r.roundRect(x - UNIT_W / 2 - 9, y - UNIT_H / 2 - 9, UNIT_W + 18, UNIT_H + 18, 22).stroke({ color: 0xf4d692, width: 5, alpha: pulse });
      r.roundRect(x - UNIT_W / 2 - 16, y - UNIT_H / 2 - 16, UNIT_W + 32, UNIT_H + 32, 28).stroke({ color: 0xf4d692, width: 3, alpha: pulse * 0.35 });
      for (const v of this.unitViews.values()) if (v.owner === 1) v.alpha = Math.abs(v.x - x) < 2 ? 1 : 0.5;
    } else {
      const c = this.huds[1].center;
      r.circle(c.x, c.y, 44).stroke({ color: 0xf4d692, width: 5, alpha: pulse }).circle(c.x, c.y, 54).stroke({ color: 0xf4d692, width: 3, alpha: pulse * 0.35 });
      for (const v of this.unitViews.values()) if (v.owner === 1) v.alpha = 0.5;
    }
  }
  /** The outcome card next to the target: its health before and after, and whether the attacker survives the blow back. */
  private showAimPanel(lane: number) {
    const c = this.aimPanel;
    c.removeChildren().forEach((x) => x.destroy({ children: true }));
    if (this.cfg.attackPreview === false) return;
    const o = this.attackOutcome(lane);
    const rows: [string, string, number][] = [];
    const u = this.s.players[0].field[lane]!;
    if (o.base) {
      rows.push([`${this.foe}の拠点`, `${o.before} → ${o.after}`, o.after === 0 ? COLORS.doom : 0xf4d692]);
      if (o.doom) rows.push(['終焉の刻', `+${o.doom}`, COLORS.doom]);
      if (o.after === 0) rows.push(['', 'この一撃で勝利', 0xf4d692]);
    } else {
      rows.push([o.name, o.after === 0 ? '撃破' : `${o.before} → ${o.after}`, o.after === 0 ? 0xf4d692 : 0xffd9c9]);
      rows.push([cardDef(u.card).name, o.myAfter === 0 ? '反撃で倒れる' : o.myAfter === o.myBefore ? '無傷' : `${o.myBefore} → ${o.myAfter}`, o.myAfter === 0 ? 0xff8f7f : 0x9ff0dc]);
      if (o.pierce) rows.push(['貫通', `拠点に${o.pierce}`, 0xf4d692]);
      if (o.blocked) rows.push(['', '挑発に引き寄せられる', COLORS.brass]);
    }
    const W = 250, pad = 14, lh = 34;
    const H = 40 + rows.length * lh + 30;
    const bg = new Graphics().roundRect(0, 0, W, H, 14).fill({ color: COLORS.ink, alpha: 0.96 }).roundRect(0, 0, W, H, 14).stroke({ color: COLORS.brassDeep, width: 2 });
    const head = label('この攻撃の結果', 17, COLORS.brass, { weight: '700' }); head.x = pad; head.y = 10;
    c.addChild(bg, head);
    rows.forEach(([a, b, col], i) => {
      const y = 42 + i * lh;
      if (a) { const l = label(a, 17, COLORS.ivory, {}); l.x = pad; l.y = y; if (l.width > 120) l.scale.set(120 / l.width); c.addChild(l); }
      const r = label(b, a ? 19 : 17, col, { weight: '700', font: /\d/.test(b) && !/[ぁ-ん]/.test(b) ? FONTS.num : FONTS.body }); r.anchor.set(1, 0); r.x = W - pad; r.y = y - 1;
      c.addChild(r);
    });
    const hint = label('横へ外すとやめる', 14, COLORS.mute, {}); hint.x = pad; hint.y = H - 26;
    c.addChild(hint);
    // beside the target, on the side with more room
    const t = attackTarget(this.s, 0, lane);
    if (t) {
      const x = LANE_X[t.lane];
      c.x = x < 360 ? x + UNIT_W / 2 + 14 : x - UNIT_W / 2 - 14 - W;
      c.y = Math.max(130, ROW_Y[1] - H / 2);
    } else { c.x = 160; c.y = 110; }
    c.alpha = 0;
    void this.tw.to(c, { alpha: 1 }, 140);
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
  /** One line per keyword on the card, so new mechanics explain themselves. */
  private keywordNotes(card: string): string[] {
    return keywordsOf(cardDef(card)).filter((k) => KEYWORD_HELP[k]).map((k) => `${k}：${KEYWORD_HELP[k]}`);
  }
  private inspectHand(v: HandCardView) {
    const d = cardDef(v.card);
    const mine = !this.busy && actor(this.s) === 0;
    this.forecast(cardCost(this.s, 0, d.id));
    const kn = this.keywordNotes(v.card);
    const rushNote = d.rush && cardCost(this.s, 0, v.card) !== d.cost ? [`急襲が有効：いまは${cardCost(this.s, 0, v.card)}刻で使えます`] : [];
    if (!mine) { this.inspectCard(v.card, [...kn, `${this.foe}の番の間は見るだけです`]); return; }
    if (d.kind === 'unit') {
      const empty = this.emptyLanes();
      this.inspectCard(v.card, [...rushNote, ...kn, empty.length ? 'ドラッグしてレーンに置いても召喚できます' : '空いているレーンがありません'], [
        ['閉じる', 'plain', () => { this.closeModal(); this.clearForecast(); }],
        [`召喚する（${cardCost(this.s, 0, d.id)}刻）`, 'primary', () => {
          this.closeModal();
          if (empty.length === 1) { this.flyFrom = this.handPos(v.uid); this.use(v.uid, empty[0]); }
          else this.setMode({ k: 'lane', uid: v.uid });
        }, !empty.length],
      ]);
    } else {
      const r = resvCount(this.s.players[0]) < RULES.MAX_RESV ? resvRange(this.s, 0, cardCost(this.s, 0, d.id)) : null;
      if (d.reserveOnly) {
        const why = r ? 'ドラッグして時計に重ねても予約できます' : resvCount(this.s.players[0]) >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約できる時刻が残っていません';
        this.inspectCard(v.card, [...rushNote, ...kn, why], [
          ['閉じる', 'plain', () => { this.closeModal(); this.clearForecast(); }],
          ['予約する', 'primary', () => { this.closeModal(); this.setMode({ k: 'resv', uid: v.uid, T: Math.min(r![1], r![0] + 2) }); }, !r],
        ]);
        return;
      }
      const note = r ? 'ドラッグして盤面で離すと使用、時計に重ねると予約' : resvCount(this.s.players[0]) >= RULES.MAX_RESV ? `予約は${RULES.MAX_RESV}枚までです` : '予約できる時刻が残っていません';
      this.inspectCard(v.card, [...rushNote, ...kn, note], [
        ['閉じる', 'plain', () => { this.closeModal(); this.clearForecast(); }],
        [`予約する`, 'plain', () => { this.closeModal(); this.setMode({ k: 'resv', uid: v.uid, T: Math.min(r![1], r![0] + 2) }); }, !r],
        [`今すぐ使う（${cardCost(this.s, 0, d.id)}刻）`, 'primary', () => { this.closeModal(); this.flyFrom = this.handPos(v.uid); this.use(v.uid, null); }],
      ]);
    }
  }
  private inspectUnit(v: UnitView) {
    const pi = v.owner;
    const u = this.s.players[pi].field.find((x) => x?.uid === v.uid);
    if (!u) return;
    const left = u.readyAt - this.s.players[pi].time;
    this.inspectCard(u.card, [
      ...this.keywordNotes(u.card).filter((n) => !n.startsWith('急襲') && !n.startsWith('充填')),
      `現在 攻撃${u.atk} ・ 体力${u.hp}/${u.maxHp}`,
      left <= 0 ? '攻撃できます' : `あと${left}刻で攻撃可能（${u.readyAt}刻）`,
      ...(pi === 0 && canShift(this.s, 0, u) ? [this.moveLanes(this.s.players[0].field.indexOf(u)).length ? 'タップかドラッグで隣の空いたレーンへ転移できます（1刻）' : '隣のレーンが空いていないので転移できません'] : []),
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
      this.feats.see(e);
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
    const s = faceDown ? makeBack(this.cfg.looks?.foeBack) : makeFace(card);
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
    const nm = (pi: PlayerIndex) => (pi === 0 ? this.me : this.foe);
    const cn = (id: string) => (id === HIDDEN ? '伏せたカード' : `「${cardDef(id).name}」`);
    switch (e.e) {
      case 'summon': return this.onLog(`${nm(e.pi)}：${cn(e.unit.card)}を召喚`, e.pi);
      case 'cast': return this.onLog(`${nm(e.pi)}：${cn(e.card)}を使用`, e.pi);
      case 'reserve': return this.onLog(e.pi === 0 && e.card !== HIDDEN ? `${this.me}：${cn(e.card)}を${e.T}刻に予約` : `${nm(e.pi)}：${e.T}刻に予約`, e.pi);
      case 'trigger': return this.onLog(e.echo ? `${e.T}刻 ${nm(e.pi)}の${cn(e.card)}が残響` : `${e.T}刻 ${nm(e.pi)}の予約${cn(e.card)}が発動`, e.pi);
      case 'echo': return this.onLog(`${nm(e.pi)}：${cn(e.card)}の残響が${e.T}刻に響く`, e.pi);
      case 'attack': { const u = this.s.players[e.pi].field[e.lane]; return this.onLog(`${nm(e.pi)}：${u ? cn(u.card) : 'ユニット'}が${e.target ? '攻撃' : '拠点を攻撃'}`, e.pi); }
      case 'dmgBase': return this.onLog(`${nm(e.pi)}の拠点に${e.amount}ダメージ（残り${Math.max(0, e.hp)}）`, other(e.pi));
      case 'destroy': return this.onLog(`${nm(e.pi)}の${cn(e.unit.card)}が破壊された`, other(e.pi));
      case 'heal': return this.onLog(`${nm(e.pi)}の拠点が${e.amount}回復`, e.pi);
      case 'clock': return this.onLog(`${nm(e.pi)}の時計が${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}刻`, -1);
      case 'bell': return this.onLog(`${nm(e.pi)}：${e.at}刻の鐘`, e.pi);
      case 'move': { const u = this.s.players[e.pi].field[e.to]; return this.onLog(`${nm(e.pi)}：${u ? cn(u.card) : 'ユニット'}が${e.to < e.from ? '左' : '右'}のレーンへ転移`, e.pi); }
      case 'doom': return this.onLog(`終焉の刻：ユニットが拠点に与えるダメージ+${e.level}`, -1);
      case 'unsummon': return this.onLog(`${nm(e.pi)}の${cn(e.unit.card)}が手札に戻された${e.uid < 0 ? '（手札が一杯で失われた）' : ''}`, other(e.pi));
      case 'discard': return this.onLog(`${nm(e.pi)}：${cn(e.card)}を捨てた`, e.pi);
      case 'fetch': return this.onLog(`${nm(e.pi)}：${e.pi === 0 && e.card !== HIDDEN ? cn(e.card) : 'カード'}を手札に加えた`, e.pi);
      case 'stealResv': return this.onLog(`${nm(other(e.pi))}が${nm(e.pi)}の予約${cn(e.card)}を奪った`, other(e.pi));
      case 'breakResv': return this.onLog(`${nm(e.pi)}の予約${e.card === HIDDEN ? '' : cn(e.card)}が破棄された`, other(e.pi));
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
        if (e.pi === 0 && !this.watching) {
          if (a.t !== 'wait' && a.t !== 'draw') haptics.tap();
          this.myActs++;
          if (a.t === 'play') this.stats.summons++;
          else if (a.t === 'cast') this.stats.spells++;
          else if (a.t === 'reserve') this.stats.reserves++;
          else if (a.t === 'attack') this.stats.attacks++;
        }
        if (e.pi === 0 && (a.t === 'play' || a.t === 'cast' || a.t === 'reserve')) {
          const v = this.handViews.get(a.hand);
          const card = v?.card ?? this.s.players[0].hand.find((h) => h.uid === a.hand)?.card;
          if (card && card !== HIDDEN && !this.watching) this.played.add(card);
          if (v) { this.flyFrom ??= { x: v.x, y: v.y }; v.destroy({ children: true }); this.handViews.delete(a.hand); this.layoutHand(); }
        }
        if (e.pi === 1 && (a.t === 'play' || a.t === 'cast' || a.t === 'reserve')) {
          const b = this.foeHandLayer.children[this.foeHandLayer.children.length - 1];
          this.flyFrom = b ? { x: b.x, y: b.y } : FOE_HAND_POS;
          b?.destroy();
        }
        if (a.t === 'draw' || a.t === 'wait') {
          const who = e.pi === 0 ? this.me : this.foe;
          void fx.floatText(this.dial.handTip(e.pi).x, this.dial.handTip(e.pi).y + 40, a.t === 'draw' ? 'ドロー' : '待機', e.pi === 0 ? COLORS.you : COLORS.foe, 24, 30, 700);
          if (e.pi === 1) this.dial.setStatus(`${this.foe}：${a.t === 'draw' ? 'ドロー' : '待機'}`, `${who}の時計が進む`, 'foe');
        }
        break;
      }
      case 'time': {
        this.dial.showGhost(null);
        await this.dial.setHand(e.pi, e.to, true, () => audio.play('tick'));
        if (e.pi === 1) this.dial.setStatus(`${this.foe}の番`, `${this.foe} ${e.to}刻 ・ ${this.me} ${this.s.players[0].time}刻`, 'foe');
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
          this.deckPileTxt.text = String(this.s.players[0].deck.length);
          this.deckPile.visible = this.s.players[0].deck.length > 0;
          this.layoutHand();
          await tw.wait(160);
        } else {
          const b = makeBack(this.cfg.looks?.foeBack); b.scale.set(0.14);
          this.foeHandLayer.addChild(b);
          b.x = 40; b.y = 110;
          const n = this.foeHandLayer.children.length;
          await tw.to(b, { x: FOE_HAND_POS.x - 140 + ((n - 1) / 2) * 18, y: FOE_HAND_POS.y }, 240);
        }
        this.huds[e.pi].setInfo(this.s.players[e.pi].deck.length, e.pi === 1 ? this.foeHandLayer.children.length : null, this.s.players[e.pi].resv.length);
        break;
      }
      case 'burn': this.toast(`${e.pi === 0 ? this.me : this.foe}：手札が一杯で${e.card === HIDDEN ? 'カード' : `「${cardDef(e.card).name}」`}を失った`); await tw.wait(500); break;
      case 'deckout': this.toast(`${e.pi === 0 ? this.me : this.foe}：山札がありません`); await tw.wait(400); break;
      case 'move': {
        const v = this.viewAt(e.pi, e.from);
        audio.play('select');
        if (v) await tw.to(v, { x: LANE_X[e.to] }, 260, ease.outBack);
        break;
      }
      case 'summon': {
        const to = { x: LANE_X[e.lane], y: ROW_Y[e.pi] };
        if ((e.pi === 1 || this.watching) && e.fromHand >= 0) {
          const s = await this.present(e.unit.card, this.flyFrom ?? (e.pi === 1 ? FOE_HAND_POS : { x: 360, y: L.hand }), true);
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
        const s = e.pi === 1 ? await this.present(e.card, this.flyFrom ?? FOE_HAND_POS, true) : await this.present(e.card, this.flyFrom ?? { x: 360, y: L.hand }, this.watching);
        void fx.burst(360, 600, 0xc9a8ff, 30, 320, { shape: 'spark', grav: 0, life: 0.6 });
        await Promise.all([tw.to(s, { alpha: 0 }, 260), tw.to(s.scale, { x: 0.9, y: 0.9 }, 260)]);
        s.destroy();
        this.flyFrom = null;
        break;
      }
      case 'reserve': {
        audio.play('reserve');
        const pinTo = this.dial.pinPoint(e.T, e.pi);
        const known = e.pi === 0 && e.card !== HIDDEN;
        const s = known ? makeFace(e.card) : makeBack(e.pi === 0 ? this.cfg.looks?.back : this.cfg.looks?.foeBack);
        await this.fly(s, this.flyFrom ?? (e.pi === 0 ? { x: 360, y: L.hand } : FOE_HAND_POS), pinTo, known ? 0.5 : 0.14, 0.08, 420, 0.5);
        s.destroy();
        this.dial.addPin(e.uid, e.pi, e.T, known ? e.card : null).on('pointertap', (ev) => { ev.stopPropagation(); this.onPinTap(e.uid); });
        void fx.ring(pinTo.x, pinTo.y, e.pi === 0 ? COLORS.you : COLORS.foe, 6, 60, 400, 4);
        if (e.pi === 1 || this.watching) this.dial.setStatus(`${e.pi === 0 ? this.me : this.foe}が予約した`, `${e.T}刻に何かが起きる`, e.pi === 0 ? 'you' : 'foe');
        this.flyFrom = null;
        await tw.wait(e.pi === 1 ? 600 : 150);
        break;
      }
      case 'echo': {
        const pin = this.dial.addPin(e.uid, e.pi, e.T, e.card, true);
        pin.on('pointertap', (ev) => { ev.stopPropagation(); this.onPinTap(e.uid); });
        const at = this.dial.pinAt(e.uid)!;
        audio.play('echo');
        void fx.ring(at.x, at.y, e.pi === 0 ? COLORS.you : COLORS.foe, 4, 46, 520, 3);
        void fx.floatText(at.x, at.y - 18, '残響', 0x8ff0e0, 20, 26, 700);
        await tw.wait(220);
        break;
      }
      case 'moveResv': {
        const at = this.dial.pinAt(e.uid);
        if (at) void fx.ring(at.x, at.y, 0x8ff0e0, 4, 40, 400, 3);
        audio.play('clock');
        await this.dial.movePin(e.uid, e.T);
        break;
      }
      case 'trigger': {
        const at = this.dial.pinAt(e.uid) ?? this.dial.point(e.T, this.dial.R + 46);
        if (e.echo) {
          // echoes are frequent and public: a quick ripple instead of the full reservation reveal
          audio.play('echo');
          void this.dial.removePin(e.uid, 'fire');
          for (let i = 0; i < 3; i++) void fx.ring(at.x, at.y, 0x8ff0e0, 6, 70 + i * 40, 520 + i * 120, 4);
          const s = makeFace(e.card); s.alpha = 0.85;
          await this.fly(s, at, { x: 360, y: 560 }, 0.08, 0.42, 240);
          void fx.floatText(360, 430, '残響', 0x8ff0e0, 34, 30, 700);
          await tw.wait(260);
          await Promise.all([tw.to(s, { alpha: 0 }, 180), tw.to(s.scale, { x: 0.5, y: 0.5 }, 180)]);
          s.destroy();
          break;
        }
        audio.play('reveal');
        void fx.ring(at.x, at.y, COLORS.brass, 6, 110, 600, 8);
        void this.dial.removePin(e.uid, 'fire');
        await fx.banner('予約発動', `${e.pi === 0 ? this.me : this.foe}の予約 ・ ${e.T}刻`, e.pi === 0 ? COLORS.you : COLORS.foe, 360, 640);
        const s = makeBack(e.pi === 0 ? this.cfg.looks?.back : this.cfg.looks?.foeBack); s.scale.set(0.1);
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
        if (!this.watching && (e.amount >= 4 || e.hp <= 0)) haptics.big('hit');
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
        this.toast(e.uids.length ? `${e.pi === 0 ? this.me : this.foe}の予約を${e.uids.length}枚公開` : '公開する予約はなかった');
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
      case 'unsummon': {
        // the unit lifts off the board and goes back to its owner's hand
        const v = this.unitViews.get(e.unit.uid);
        audio.play('select');
        if (v) {
          const to = e.pi === 0 ? { x: 360, y: L.hand } : FOE_HAND_POS;
          void fx.ring(v.x, v.y, 0x8ff0e0, 10, 90, 420, 5);
          await Promise.all([tw.to(v, { x: to.x, y: to.y, alpha: 0 }, 420, ease.inCubic), tw.to(v.scale, { x: 0.3, y: 0.3 }, 420)]);
          v.destroy({ children: true });
          this.unitViews.delete(e.unit.uid);
        }
        this.toast(`「${cardDef(e.unit.card).name}」が手札に戻った${e.uid < 0 ? '（手札が一杯で失われた）' : ''}`);
        await tw.wait(250);
        break;
      }
      case 'discard': {
        const s2 = await this.present(e.card, e.pi === 0 ? this.handPos(e.uid) ?? { x: 360, y: L.hand } : FOE_HAND_POS, e.pi === 1);
        audio.play('destroy');
        await Promise.all([tw.to(s2, { alpha: 0 }, 300), tw.to(s2, { y: s2.y + 60 }, 300)]);
        s2.destroy();
        if (e.pi === 1) this.foeHandLayer.children[this.foeHandLayer.children.length - 1]?.destroy();
        break;
      }
      case 'fetch': {
        audio.play('draw');
        if (e.pi === 0 && e.card !== HIDDEN) {
          const v = this.addHandView(e.uid, e.card);
          v.x = 360; v.y = 600; v.scale.set(0.3);
          this.toast(`「${cardDef(e.card).name}」を手札に加えた`);
          this.layoutHand();
          await tw.wait(300);
        } else {
          const b = makeBack(this.cfg.looks?.foeBack); b.scale.set(0.14);
          this.foeHandLayer.addChild(b);
          b.x = 360; b.y = 300;
          const n = this.foeHandLayer.children.length;
          await tw.to(b, { x: FOE_HAND_POS.x - 140 + ((n - 1) / 2) * 18, y: FOE_HAND_POS.y }, 260);
        }
        break;
      }
      case 'stealResv': {
        // the pin crosses to the other side of the clock
        const at = this.dial.pinAt(e.uid);
        audio.play('clock');
        if (at) void fx.ring(at.x, at.y, COLORS.brass, 6, 70, 500, 5);
        await this.dial.removePin(e.uid, 'break');
        const to = other(e.pi);
        this.dial.addPin(e.uid, to, e.T, e.card, false).on('pointertap', (ev) => { ev.stopPropagation(); this.onPinTap(e.uid); });
        this.toast(`${to === 0 ? this.me : this.foe}が予約「${cardDef(e.card).name}」を奪った`);
        await tw.wait(400);
        break;
      }
      case 'doom': {
        audio.play('doom');
        this.dial.setDoom(e.level);
        void fx.flash(COLORS.doom, 0.3, 700);
        await fx.banner(e.level === 1 ? '終焉の刻' : `終焉 ${e.level}段階`, `ユニットが拠点に与えるダメージ +${e.level}`, COLORS.doom, 360, 640);
        break;
      }
      case 'end': {
        audio.play(e.winner === 0 || this.watching ? 'win' : 'lose');
        if (!this.watching) haptics.big(e.winner === 0 ? 'win' : 'lose');
        break;
      }
    }
  }
}

