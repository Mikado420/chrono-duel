import { CARDS, cardDef, type CardDef, type EchoEffect } from './cards';
import { RULES } from './rules';

export type PlayerIndex = 0 | 1;

export interface HandCard { uid: number; card: string }
export interface Unit {
  uid: number;
  card: string;
  atk: number;
  hp: number;
  maxHp: number;
  reload: number;
  /** Owner's clock value from which this unit may attack. */
  readyAt: number;
  taunt: boolean;
  pierce: boolean;
}
/**
 * A spell waiting on the clock. `echo` marks an echo (残響): a public, weaker repeat that does not use a
 * reservation slot and runs `echo` instead of the card's own effect.
 */
export interface Reservation { uid: number; card: string; T: number; revealed: boolean; echo?: EchoEffect }
export interface PlayerState {
  hp: number;
  time: number;
  deck: string[];
  hand: HandCard[];
  field: (Unit | null)[];
  resv: Reservation[];
}
export type EndReason = 'ko' | 'time';
export interface GameState {
  players: [PlayerState, PlayerState];
  /** Who acted last; breaks ties when clocks are equal. */
  last: PlayerIndex;
  /** Extra damage every hit on a base takes (0 before doom). */
  doom: number;
  over: null | { winner: PlayerIndex | -1; reason: EndReason };
  nextUid: number;
  actions: number;
}

/** `x` is the extra time paid for 充填 (charge) cards; omitted for every other card. */
export type Action =
  | { t: 'play'; hand: number; lane: number; x?: number }
  | { t: 'cast'; hand: number; x?: number }
  | { t: 'reserve'; hand: number; T: number }
  | { t: 'attack'; lane: number }
  | { t: 'draw' }
  | { t: 'wait' };

export type Target = { pi: PlayerIndex; lane: number } | null;
export type GameEvent =
  | { e: 'act'; pi: PlayerIndex; action: Action }
  | { e: 'time'; pi: PlayerIndex; from: number; to: number }
  | { e: 'bell'; pi: PlayerIndex; at: number }
  | { e: 'draw'; pi: PlayerIndex; uid: number; card: string }
  | { e: 'burn'; pi: PlayerIndex; card: string }
  | { e: 'deckout'; pi: PlayerIndex }
  | { e: 'summon'; pi: PlayerIndex; lane: number; unit: Unit; fromHand: number }
  | { e: 'cast'; pi: PlayerIndex; card: string; fromHand: number }
  | { e: 'reserve'; pi: PlayerIndex; uid: number; card: string; T: number; fromHand: number }
  | { e: 'trigger'; pi: PlayerIndex; uid: number; card: string; T: number; echo?: boolean }
  | { e: 'echo'; pi: PlayerIndex; uid: number; card: string; T: number }
  | { e: 'moveResv'; pi: PlayerIndex; uid: number; T: number }
  | { e: 'attack'; pi: PlayerIndex; lane: number; target: Target }
  | { e: 'dmgUnit'; pi: PlayerIndex; lane: number; amount: number; hp: number }
  | { e: 'dmgBase'; pi: PlayerIndex; amount: number; hp: number; doom: boolean }
  | { e: 'heal'; pi: PlayerIndex; amount: number; hp: number }
  | { e: 'destroy'; pi: PlayerIndex; lane: number; unit: Unit }
  | { e: 'stun'; pi: PlayerIndex; lane: number; readyAt: number }
  | { e: 'readyAll'; pi: PlayerIndex }
  | { e: 'buff'; pi: PlayerIndex; lane: number; atk: number; hp: number }
  | { e: 'clock'; pi: PlayerIndex; delta: number; to: number }
  | { e: 'reveal'; pi: PlayerIndex; uids: number[] }
  | { e: 'breakResv'; pi: PlayerIndex; uid: number; card: string }
  | { e: 'fizzle'; pi: PlayerIndex; card: string }
  | { e: 'doom'; level: number }
  | { e: 'end'; winner: PlayerIndex | -1; reason: EndReason };

export const other = (pi: PlayerIndex): PlayerIndex => (pi === 0 ? 1 : 0);

// ---------------------------------------------------------------- setup
export function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(decks: [string[], string[]], seed: number, first: PlayerIndex = 0): { state: GameState; events: GameEvent[] } {
  const rand = mulberry32(seed);
  const mk = (d: string[]): PlayerState => ({
    hp: RULES.BASE_HP, time: 0, deck: shuffle(d.slice(), rand), hand: [], field: Array(RULES.LANES).fill(null), resv: [],
  });
  const state: GameState = { players: [mk(decks[0]), mk(decks[1])], last: other(first), doom: 0, over: null, nextUid: 1, actions: 0 };
  const events: GameEvent[] = [];
  for (const pi of [0, 1] as PlayerIndex[]) for (let i = 0; i < RULES.START_HAND; i++) drawCard(state, pi, events);
  return { state, events };
}

// ---------------------------------------------------------------- queries
export function actor(s: GameState): PlayerIndex | -1 {
  if (s.over) return -1;
  const [a, b] = s.players;
  const E = RULES.END;
  if (a.time >= E && b.time >= E) return -1;
  if (a.time >= E) return 1;
  if (b.time >= E) return 0;
  if (a.time < b.time) return 0;
  if (b.time < a.time) return 1;
  return other(s.last);
}
export const worldTime = (s: GameState) => Math.min(s.players[0].time, s.players[1].time);
export const isReady = (s: GameState, pi: PlayerIndex, u: Unit) => u.readyAt <= s.players[pi].time;

/** Which enemy lane an attack from `lane` would hit, or null for the base. Taunt intercepts adjacent empty lanes. */
export function attackTarget(s: GameState, pi: PlayerIndex, lane: number): Target {
  const q = other(pi);
  const f = s.players[q].field;
  if (f[lane]) return { pi: q, lane };
  const adj = [lane - 1, lane + 1].filter((l) => l >= 0 && l < RULES.LANES && f[l]?.taunt);
  if (adj.length) {
    // prefer the sturdier taunt so the choice is deterministic
    adj.sort((x, y) => f[y]!.hp - f[x]!.hp || x - y);
    return { pi: q, lane: adj[0] };
  }
  return null;
}

/** Reservations that use a slot (echoes do not). */
export const resvCount = (p: PlayerState) => p.resv.reduce((n, r) => n + (r.echo ? 0 : 1), 0);

/** Whether 急襲 (rush) is active for `pi`: their clock is at least 2 behind. */
export const rushActive = (s: GameState, pi: PlayerIndex) => s.players[other(pi)].time - s.players[pi].time >= 2;
/** What a card costs `pi` right now, before any 充填 (charge). */
export function cardCost(s: GameState, pi: PlayerIndex, id: string): number {
  const d = cardDef(id);
  return d.rush && rushActive(s, pi) ? Math.max(1, d.cost - d.rush) : d.cost;
}

export function resvRange(s: GameState, pi: PlayerIndex, cost: number): [number, number] | null {
  const p = s.players[pi];
  const lo = p.time + cost + RULES.RESV_MIN_GAP;
  const hi = RULES.END;
  return lo <= hi ? [lo, hi] : null;
}

export function legalActions(s: GameState, pi: PlayerIndex): Action[] {
  if (actor(s) !== pi) return [];
  const p = s.players[pi];
  const out: Action[] = [];
  p.hand.forEach((h) => {
    const d = cardDef(h.card);
    const xs = d.charge ? Array.from({ length: d.charge + 1 }, (_, i) => i) : [undefined];
    if (d.kind === 'unit') {
      p.field.forEach((u, l) => { if (!u) for (const x of xs) out.push(x === undefined ? { t: 'play', hand: h.uid, lane: l } : { t: 'play', hand: h.uid, lane: l, x }); });
    } else {
      for (const x of xs) out.push(x === undefined ? { t: 'cast', hand: h.uid } : { t: 'cast', hand: h.uid, x });
      const r = resvCount(p) < RULES.MAX_RESV ? resvRange(s, pi, cardCost(s, pi, h.card)) : null;
      if (r) for (let T = r[0]; T <= r[1]; T++) out.push({ t: 'reserve', hand: h.uid, T });
    }
  });
  p.field.forEach((u, l) => { if (u && isReady(s, pi, u)) out.push({ t: 'attack', lane: l }); });
  if (p.deck.length) out.push({ t: 'draw' });
  out.push({ t: 'wait' });
  return out;
}

export function timeCost(s: GameState, pi: PlayerIndex, a: Action): number {
  switch (a.t) {
    case 'play': case 'cast': case 'reserve': {
      const h = s.players[pi].hand.find((x) => x.uid === a.hand);
      return h ? cardCost(s, pi, h.card) + (a.t !== 'reserve' ? a.x ?? 0 : 0) : 0;
    }
    case 'attack': return RULES.COST_ATTACK;
    case 'draw': return RULES.COST_DRAW;
    case 'wait': return RULES.COST_WAIT;
  }
}

// ---------------------------------------------------------------- primitives
function drawCard(s: GameState, pi: PlayerIndex, ev: GameEvent[]) {
  const p = s.players[pi];
  const card = p.deck.pop();
  if (!card) { ev.push({ e: 'deckout', pi }); return; }
  if (p.hand.length >= RULES.MAX_HAND) { ev.push({ e: 'burn', pi, card }); return; }
  const uid = s.nextUid++;
  p.hand.push({ uid, card });
  ev.push({ e: 'draw', pi, uid, card });
}

function advance(s: GameState, pi: PlayerIndex, n: number, ev: GameEvent[]) {
  const p = s.players[pi];
  const from = p.time;
  p.time += n;
  ev.push({ e: 'time', pi, from, to: p.time });
  for (const b of RULES.BELLS) {
    if (from < b && p.time >= b) {
      ev.push({ e: 'bell', pi, at: b });
      drawCard(s, pi, ev);
      p.field.forEach((u, l) => {
        if (u && cardDef(u.card).hook === 'bellGrow') { u.atk++; u.hp++; u.maxHp++; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); }
      });
    }
  }
}

function damageUnit(s: GameState, pi: PlayerIndex, lane: number, amount: number, ev: GameEvent[]) {
  const p = s.players[pi];
  const u = p.field[lane];
  if (!u || amount <= 0) return;
  u.hp -= amount;
  ev.push({ e: 'dmgUnit', pi, lane, amount, hp: u.hp });
}
/** Removes dead units after simultaneous damage. */
function reap(s: GameState, ev: GameEvent[]) {
  for (const pi of [0, 1] as PlayerIndex[]) {
    const p = s.players[pi];
    p.field.forEach((u, l) => {
      if (u && u.hp <= 0) {
        p.field[l] = null;
        ev.push({ e: 'destroy', pi, lane: l, unit: u });
        if (cardDef(u.card).hook === 'echoOnDeath') {
          const to = Math.max(0, p.time - 1);
          const delta = to - p.time;
          if (delta) { p.time = to; ev.push({ e: 'clock', pi, delta, to }); }
        }
      }
    });
  }
}
function damageBase(s: GameState, pi: PlayerIndex, amount: number, ev: GameEvent[]) {
  if (amount <= 0) return;
  const doom = s.doom > 0;
  const n = amount + s.doom;
  const p = s.players[pi];
  p.hp -= n;
  ev.push({ e: 'dmgBase', pi, amount: n, hp: p.hp, doom });
}
function topEnemy(s: GameState, qi: PlayerIndex): number {
  const f = s.players[qi].field;
  let best = -1;
  f.forEach((u, i) => {
    if (!u) return;
    const b = best >= 0 ? f[best]! : null;
    if (!b || u.atk > b.atk || (u.atk === b.atk && u.hp > b.hp)) best = i;
  });
  return best;
}
function shiftClock(s: GameState, pi: PlayerIndex, delta: number, ev: GameEvent[]) {
  const p = s.players[pi];
  p.time += delta;
  ev.push({ e: 'clock', pi, delta, to: p.time });
}

/** 残響: queue the card's echoes, `base` ticks being the moment it resolved. */
function scheduleEchoes(s: GameState, pi: PlayerIndex, d: CardDef, base: number, ev: GameEvent[]) {
  for (const e of d.echo ?? []) {
    if (s.players[pi].resv.filter((r) => r.echo).length >= RULES.MAX_ECHO) { ev.push({ e: 'fizzle', pi, card: d.id }); continue; }
    const uid = s.nextUid++;
    const T = base + e.delay;
    s.players[pi].resv.push({ uid, card: d.id, T, revealed: true, echo: e.effect });
    ev.push({ e: 'echo', pi, uid, card: d.id, T });
  }
}
function shot(s: GameState, qi: PlayerIndex, unitDmg: number, baseDmg: number, ev: GameEvent[]) {
  const l = topEnemy(s, qi);
  if (l < 0) damageBase(s, qi, baseDmg, ev);
  else { damageUnit(s, qi, l, unitDmg, ev); reap(s, ev); }
}
function storm(s: GameState, pi: PlayerIndex, qi: PlayerIndex, n: number, card: string, ev: GameEvent[]) {
  let any = false;
  for (let l = 0; l < RULES.LANES; l++) if (s.players[qi].field[l]) { damageUnit(s, qi, l, n, ev); any = true; }
  if (!any) ev.push({ e: 'fizzle', pi, card });
  reap(s, ev);
}
function breakNearest(s: GameState, qi: PlayerIndex, ev: GameEvent[]): boolean {
  const r = s.players[qi].resv;
  if (!r.length) return false;
  r.sort((a, b) => a.T - b.T);
  const x = r.shift()!;
  ev.push({ e: 'breakResv', pi: qi, uid: x.uid, card: x.card });
  return true;
}
function revealAll(s: GameState, qi: PlayerIndex, ev: GameEvent[]) {
  const r = s.players[qi].resv;
  r.forEach((x) => (x.revealed = true));
  ev.push({ e: 'reveal', pi: qi, uids: r.map((x) => x.uid) });
}
function heal(s: GameState, pi: PlayerIndex, n: number, ev: GameEvent[]) {
  const p = s.players[pi];
  p.hp = Math.min(RULES.BASE_HP, p.hp + n);
  ev.push({ e: 'heal', pi, amount: n, hp: p.hp });
}

/** The weaker repeat carried by an echo. */
function runEcho(s: GameState, pi: PlayerIndex, card: string, fx: EchoEffect, ev: GameEvent[]) {
  const qi = other(pi);
  const p = s.players[pi];
  switch (fx) {
    case 'ping1': damageBase(s, qi, 1, ev); break;
    case 'ping2': damageBase(s, qi, 2, ev); break;
    case 'shot1': shot(s, qi, 1, 1, ev); break;
    case 'heal2': heal(s, pi, 2, ev); break;
    case 'draw1': drawCard(s, pi, ev); break;
    case 'storm1': storm(s, pi, qi, 1, card, ev); break;
    case 'rally': {
      let any = false;
      p.field.forEach((u, l) => { if (u) { u.atk++; any = true; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); } });
      if (!any) ev.push({ e: 'fizzle', pi, card });
      break;
    }
    case 'image': {
      const lane = p.field.findIndex((u) => !u);
      if (lane < 0) { ev.push({ e: 'fizzle', pi, card }); break; }
      summonUnit(s, pi, 'e_image', lane, -1, 0, ev);
      break;
    }
  }
}

/** 共鳴: units that react whenever one of their owner's reservations or echoes fires. */
function resonate(s: GameState, pi: PlayerIndex, ev: GameEvent[]) {
  const p = s.players[pi];
  p.field.forEach((u, l) => {
    if (!u) return;
    switch (cardDef(u.card).hook) {
      case 'resonateAtk': u.atk++; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); break;
      case 'resonatePing': shot(s, other(pi), 1, 0, ev); break;
      case 'resonateRewind': if (p.time > 0) shiftClock(s, pi, -1, ev); break;
    }
  });
}

// ---------------------------------------------------------------- effects
function runSpell(s: GameState, pi: PlayerIndex, d: CardDef, boosted: boolean, ev: GameEvent[], x = 0) {
  const qi = other(pi);
  const p = s.players[pi];
  const b = boosted ? 1 : 0;
  switch (d.effect) {
    case 'arrow': {
      const l = topEnemy(s, qi);
      if (l < 0) damageBase(s, qi, 2 + b, ev);
      else { damageUnit(s, qi, l, 3 + b, ev); reap(s, ev); }
      break;
    }
    case 'cage': {
      const l = topEnemy(s, qi);
      if (l < 0) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      const u = s.players[qi].field[l]!;
      u.readyAt = Math.max(u.readyAt, s.players[qi].time) + (boosted ? 6 : 4);
      ev.push({ e: 'stun', pi: qi, lane: l, readyAt: u.readyAt });
      break;
    }
    case 'bolt': damageBase(s, qi, 4 + b, ev); break;
    case 'collapse': {
      let any = false;
      for (let l = 0; l < RULES.LANES; l++) if (s.players[qi].field[l]) { damageUnit(s, qi, l, 2 + b, ev); any = true; }
      if (!any) ev.push({ e: 'fizzle', pi, card: d.id });
      reap(s, ev);
      break;
    }
    case 'rewind': {
      const amt = boosted ? 4 : 3;
      p.hp = Math.min(RULES.BASE_HP, p.hp + amt);
      ev.push({ e: 'heal', pi, amount: amt, hp: p.hp });
      for (let i = 0; i < (boosted ? 2 : 1); i++) drawCard(s, pi, ev);
      break;
    }
    case 'haste': {
      p.field.forEach((u) => { if (u) u.readyAt = p.time; });
      ev.push({ e: 'readyAll', pi });
      p.field.forEach((u, l) => { if (u) { u.atk += boosted ? 2 : 1; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); } });
      break;
    }
    case 'insight': for (let i = 0; i < (boosted ? 3 : 2); i++) drawCard(s, pi, ev); break;
    case 'stop': shiftClock(s, qi, boosted ? 4 : 3, ev); break;
    // 第1弾
    case 'eShot': shot(s, qi, 2 + b, 1, ev); break;
    case 'ePray': heal(s, pi, boosted ? 3 : 2, ev); break;
    case 'eSlash': shot(s, qi, boosted ? 4 : 2 + x, boosted ? 2 : 1, ev); break;
    case 'ePeek': revealAll(s, qi, ev); for (let i = 0; i < (boosted ? 2 : 1); i++) drawCard(s, pi, ev); break;
    case 'eBreak': {
      let n = 0;
      for (let i = 0; i < (boosted ? 2 : 1); i++) if (breakNearest(s, qi, ev)) n++;
      if (!n) ev.push({ e: 'fizzle', pi, card: d.id });
      break;
    }
    case 'eDraw': for (let i = 0; i < (boosted ? 2 : 1); i++) drawCard(s, pi, ev); break;
    case 'eReverse': shiftClock(s, qi, boosted ? 3 : 2, ev); break;
    case 'eStorm': storm(s, pi, qi, boosted ? 2 : 1, d.id, ev); break;
    case 'eEternal': damageBase(s, qi, boosted ? 3 : 2, ev); break;
  }
}

function runUnitHook(s: GameState, pi: PlayerIndex, lane: number, ev: GameEvent[]) {
  const qi = other(pi);
  const u = s.players[pi].field[lane]!;
  switch (cardDef(u.card).hook) {
    case 'draw1': drawCard(s, pi, ev); break;
    case 'delayOpp1': shiftClock(s, qi, 1, ev); break;
    case 'revealResv': revealAll(s, qi, ev); break;
    case 'breakResv': breakNearest(s, qi, ev); break;
    case 'dawnBurst':
      for (let l = 0; l < RULES.LANES; l++) if (s.players[qi].field[l]) damageUnit(s, qi, l, 2, ev);
      reap(s, ev);
      break;
    case 'storm1': storm(s, pi, qi, 1, u.card, ev); break;
    case 'hasten2': {
      const w = worldTime(s);
      for (const r of s.players[pi].resv) {
        const T = Math.max(w, r.T - 2);
        if (T !== r.T) { r.T = T; ev.push({ e: 'moveResv', pi, uid: r.uid, T }); }
      }
      break;
    }
  }
}

/** Puts a unit on the board. `x` is the 充填 paid; `fromHand` is -1 for units made by effects. */
function summonUnit(s: GameState, pi: PlayerIndex, card: string, lane: number, fromHand: number, x: number, ev: GameEvent[]) {
  const p = s.players[pi];
  const d = cardDef(card);
  const kw = d.keywords ?? [];
  const unit: Unit = {
    uid: s.nextUid++, card, atk: d.atk! + x, hp: d.hp! + x, maxHp: d.hp! + x, reload: d.reload!,
    readyAt: p.time + (kw.includes('swift') ? 0 : 1), taunt: kw.includes('taunt') || (card === 'e_colossus' && x >= 2), pierce: kw.includes('pierce'),
  };
  p.field[lane] = unit;
  ev.push({ e: 'summon', pi, lane, unit: { ...unit }, fromHand });
  runUnitHook(s, pi, lane, ev);
  scheduleEchoes(s, pi, d, p.time, ev);
}

// ---------------------------------------------------------------- apply
function chargeOf(d: CardDef, x: number | undefined): number {
  if (!d.charge) { if (x) throw new Error('not a charge card'); return 0; }
  const v = x ?? 0;
  if (!Number.isInteger(v) || v < 0 || v > d.charge) throw new Error('bad charge');
  return v;
}
function takeHand(p: PlayerState, uid: number): { idx: number; card: string } {
  const idx = p.hand.findIndex((h) => h.uid === uid);
  if (idx < 0) throw new Error('card not in hand');
  const [h] = p.hand.splice(idx, 1);
  return { idx, card: h.card };
}

export function apply(s: GameState, a: Action): GameEvent[] {
  const pi = actor(s);
  if (pi === -1) throw new Error('game over');
  const ev: GameEvent[] = [{ e: 'act', pi, action: a }];
  const p = s.players[pi];
  const qi = other(pi);
  s.actions++;
  switch (a.t) {
    case 'play': {
      if (a.lane < 0 || a.lane >= RULES.LANES || p.field[a.lane]) throw new Error('lane occupied');
      const h = p.hand.find((q) => q.uid === a.hand);
      if (!h) throw new Error('card not in hand');
      const d = cardDef(h.card);
      if (d.kind !== 'unit') throw new Error('not a unit');
      const x = chargeOf(d, a.x);
      const cost = cardCost(s, pi, h.card) + x;
      const { idx, card } = takeHand(p, a.hand);
      advance(s, pi, cost, ev);
      summonUnit(s, pi, card, a.lane, idx, x, ev);
      break;
    }
    case 'cast': {
      const h = p.hand.find((q) => q.uid === a.hand);
      if (!h) throw new Error('card not in hand');
      const d = cardDef(h.card);
      if (d.kind !== 'spell') throw new Error('not a spell');
      const x = chargeOf(d, a.x);
      const cost = cardCost(s, pi, h.card) + x;
      const { idx, card } = takeHand(p, a.hand);
      advance(s, pi, cost, ev);
      ev.push({ e: 'cast', pi, card, fromHand: idx });
      runSpell(s, pi, d, false, ev, x);
      scheduleEchoes(s, pi, d, p.time, ev);
      break;
    }
    case 'reserve': {
      if (resvCount(p) >= RULES.MAX_RESV) throw new Error('too many reservations');
      const h = p.hand.find((x) => x.uid === a.hand);
      if (!h) throw new Error('card not in hand');
      const d = cardDef(h.card);
      if (d.kind !== 'spell') throw new Error('not a spell');
      const cost = cardCost(s, pi, h.card);
      const r = resvRange(s, pi, cost);
      if (!r || a.T < r[0] || a.T > r[1]) throw new Error('bad reservation time');
      const { idx, card } = takeHand(p, a.hand);
      advance(s, pi, cost, ev);
      const uid = s.nextUid++;
      p.resv.push({ uid, card, T: a.T, revealed: false });
      ev.push({ e: 'reserve', pi, uid, card, T: a.T, fromHand: idx });
      break;
    }
    case 'attack': {
      const u = p.field[a.lane];
      if (!u || !isReady(s, pi, u)) throw new Error('unit not ready');
      advance(s, pi, RULES.COST_ATTACK, ev);
      const t = attackTarget(s, pi, a.lane);
      ev.push({ e: 'attack', pi, lane: a.lane, target: t });
      if (!t) damageBase(s, qi, u.atk, ev);
      else {
        const v = s.players[qi].field[t.lane]!;
        const over = u.atk - v.hp;
        const back = v.atk;
        damageUnit(s, qi, t.lane, u.atk, ev);
        damageUnit(s, pi, a.lane, back, ev);
        if (u.pierce && over > 0) damageBase(s, qi, over, ev);
        reap(s, ev);
      }
      const still = p.field[a.lane];
      if (still && still.uid === u.uid) still.readyAt = p.time + u.reload;
      break;
    }
    case 'draw':
      if (!p.deck.length) throw new Error('deck empty');
      advance(s, pi, RULES.COST_DRAW, ev);
      drawCard(s, pi, ev);
      break;
    case 'wait':
      advance(s, pi, RULES.COST_WAIT, ev);
      break;
  }
  s.last = pi;
  settle(s, ev);
  return ev;
}

/** Fires reservations whose time has come, turns on doom, and checks for the end. */
function settle(s: GameState, ev: GameEvent[]) {
  for (let guard = 0; guard < 20; guard++) {
    if (checkKo(s, ev)) return;
    const w = worldTime(s);
    const lvl = w >= RULES.DOOM_AT ? 1 + Math.floor((w - RULES.DOOM_AT) / RULES.DOOM_STEP) : 0;
    if (lvl > s.doom) { s.doom = lvl; ev.push({ e: 'doom', level: lvl }); }
    const due: { pi: PlayerIndex; r: Reservation }[] = [];
    for (const pi of [0, 1] as PlayerIndex[]) {
      const p = s.players[pi];
      p.resv = p.resv.filter((r) => (r.T <= w ? (due.push({ pi, r }), false) : true));
    }
    if (!due.length) break;
    due.sort((a, b) => a.r.T - b.r.T || a.pi - b.pi);
    for (const { pi, r } of due) {
      if (r.echo) {
        ev.push({ e: 'trigger', pi, uid: r.uid, card: r.card, T: r.T, echo: true });
        runEcho(s, pi, r.card, r.echo, ev);
      } else {
        ev.push({ e: 'trigger', pi, uid: r.uid, card: r.card, T: r.T });
        const d = cardDef(r.card);
        runSpell(s, pi, d, true, ev);
        scheduleEchoes(s, pi, d, r.T, ev);
      }
      if (checkKo(s, ev)) return;
      resonate(s, pi, ev);
      if (checkKo(s, ev)) return;
    }
    // clock shifts from triggered spells can release more reservations; loop again
  }
  if (!s.over && actor(s) === -1) {
    const [a, b] = s.players;
    let winner: PlayerIndex | -1 = a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : -1;
    if (winner === -1) {
      const pow = (p: PlayerState) => p.field.reduce((n, u) => n + (u ? u.atk + u.hp : 0), 0);
      const d = pow(a) - pow(b);
      winner = d > 0 ? 0 : d < 0 ? 1 : -1;
    }
    s.over = { winner, reason: 'time' };
    ev.push({ e: 'end', winner, reason: 'time' });
  }
}
function checkKo(s: GameState, ev: GameEvent[]): boolean {
  if (s.over) return true;
  const [a, b] = s.players;
  if (a.hp > 0 && b.hp > 0) return false;
  const winner: PlayerIndex | -1 = a.hp <= 0 && b.hp <= 0 ? -1 : a.hp <= 0 ? 1 : 0;
  s.over = { winner, reason: 'ko' };
  ev.push({ e: 'end', winner, reason: 'ko' });
  return true;
}

export const clone = (s: GameState): GameState => structuredClone(s);
export { CARDS };
