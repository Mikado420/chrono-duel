import { CARDS, cardDef, type BellEffect, type CardDef, type EchoEffect } from './cards';
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
  /** 転移: may move to the next empty lane for 1 tick. */
  shift?: boolean;
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
  /** 転移: the unit in `lane` moves to the empty lane `to` next to it. */
  | { t: 'move'; lane: number; to: number }
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
  | { e: 'move'; pi: PlayerIndex; from: number; to: number }
  /** Two of a player's units trade lanes (第2弾 切り替えレバー). */
  | { e: 'swap'; pi: PlayerIndex; a: number; b: number }
  /** A player's units all shift one lane to the right, the last one wrapping to the first (第2弾 配線し直し). */
  | { e: 'rotate'; pi: PlayerIndex }
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
  p.field.forEach((u, l) => { if (u && canShift(s, pi, u)) for (const to of [l - 1, l + 1]) if (to >= 0 && to < RULES.LANES && !p.field[to]) out.push({ t: 'move', lane: l, to }); });
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
    case 'move': return RULES.COST_MOVE;
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
      if (RULES.BELL_RING_AT.includes(b)) {
        // 時計塔の機関士: one more card per ringing bell, each
        for (const u of p.field) if (u && cardDef(u.card).hook === 'bellDraw') drawCard(s, pi, ev);
        ringBells(s, pi, ev);
      }
    }
  }
}

/** 鐘鳴: one unit's bell effect. */
function runBell(s: GameState, pi: PlayerIndex, lane: number, fx: BellEffect, ev: GameEvent[]) {
  const u = s.players[pi].field[lane]!;
  switch (fx) {
    case 'grow': u.atk++; u.hp++; u.maxHp++; ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp }); break;
    case 'shot2': shot(s, other(pi), 2, 0, ev); break;
    case 'draw1': drawCard(s, pi, ev); break;
    case 'ready': u.readyAt = Math.min(u.readyAt, s.players[pi].time); ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp }); break;
    // 第2弾
    case 'shot1': shot(s, other(pi), 1, 0, ev); break;
    case 'heal2': heal(s, pi, 2, ev); break;
    case 'hp2': u.hp += 2; u.maxHp += 2; ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp }); break;
    case 'storm1': storm(s, pi, other(pi), 1, u.card, ev); break;
    case 'blessAll': fortify(s, pi, 1, 0, ev); heal(s, pi, 2, ev); break;
    case 'blessOthers': s.players[pi].field.forEach((x, l) => { if (x && l !== lane && cardDef(x.card).bell) { x.hp += 2; x.maxHp += 2; ev.push({ e: 'buff', pi, lane: l, atk: x.atk, hp: x.hp }); } }); break;
    case 'gearShift': {
      const p = s.players[pi];
      for (let l = RULES.LANES - 2; l >= 0; l--) if (p.field[l] && !p.field[l + 1]) { p.field[l + 1] = p.field[l]; p.field[l] = null; ev.push({ e: 'move', pi, from: l, to: l + 1 }); onShifted(s, pi, l + 1, ev); }
      readyAll(s, pi, ev);
      break;
    }
    case 'oppClock1': shiftClock(s, other(pi), 1, ev); break;
  }
}
/** Every 鐘鳴 unit of `pi` rings once, left to right. */
function ringBells(s: GameState, pi: PlayerIndex, ev: GameEvent[]) {
  const p = s.players[pi];
  const ringers = p.field.map((u) => (u && cardDef(u.card).bell ? u.uid : -1)).filter((x) => x >= 0);
  for (const uid of ringers) {
    const lane = p.field.findIndex((u) => u?.uid === uid);
    if (lane >= 0) runBell(s, pi, lane, cardDef(p.field[lane]!.card).bell!, ev); // gone if an earlier ring killed it
  }
}
/** 転移 is the unit's own keyword or comes from 迷宮の設計者 on its side. */
export function canShift(s: GameState, pi: PlayerIndex, u: Unit): boolean {
  return !!u.shift || s.players[pi].field.some((x) => x && cardDef(x.card).hook === 'shiftAura');
}
/** What a unit does after moving (転移). */
function onShifted(s: GameState, pi: PlayerIndex, lane: number, ev: GameEvent[]) {
  const u = s.players[pi].field[lane];
  if (!u) return;
  switch (cardDef(u.card).hook) {
    case 'shiftGrow': u.atk++; ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp }); break;
    case 'shiftPing': damageBase(s, other(pi), 1, ev); break;
    case 'shiftHaste': u.readyAt -= 1; ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp }); break;
  }
}
function readyAll(s: GameState, pi: PlayerIndex, ev: GameEvent[]) {
  const p = s.players[pi];
  p.field.forEach((u) => { if (u) u.readyAt = Math.min(u.readyAt, p.time); });
  ev.push({ e: 'readyAll', pi });
}
function fortify(s: GameState, pi: PlayerIndex, hp: number, atk: number, ev: GameEvent[]) {
  s.players[pi].field.forEach((u, l) => { if (u) { u.hp += hp; u.maxHp += hp; u.atk += atk; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); } });
}
/** Lane of `pi`'s unit with the highest (or lowest) attack, or -1. */
function pickUnit(s: GameState, pi: PlayerIndex, by: 'atkHi' | 'atkLo' | 'hpHi'): number {
  const f = s.players[pi].field;
  let best = -1;
  f.forEach((u, i) => {
    if (!u) return;
    const b = best >= 0 ? f[best]! : null;
    const better = !b || (by === 'atkHi' ? u.atk > b.atk || (u.atk === b.atk && u.hp > b.hp) : by === 'atkLo' ? u.atk < b.atk || (u.atk === b.atk && u.hp < b.hp) : u.hp > b.hp || (u.hp === b.hp && u.atk > b.atk));
    if (better) best = i;
  });
  return best;
}
function delayUnit(s: GameState, qi: PlayerIndex, lane: number, n: number, ev: GameEvent[]) {
  const u = s.players[qi].field[lane]!;
  u.readyAt = Math.max(u.readyAt, s.players[qi].time) + n;
  ev.push({ e: 'stun', pi: qi, lane, readyAt: u.readyAt });
}
/** Pushes reservations of `qi` later (echoes only, or every one). */
function delayResv(s: GameState, qi: PlayerIndex, n: number, echoesOnly: boolean, ev: GameEvent[]) {
  for (const r of s.players[qi].resv) if (!echoesOnly || r.echo) { r.T += n; ev.push({ e: 'moveResv', pi: qi, uid: r.uid, T: r.T }); }
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
/** Damage to a base. 終焉 (doom) only adds to hits from units: spells and echoes that ignore the board deal their printed amount. */
function damageBase(s: GameState, pi: PlayerIndex, amount: number, ev: GameEvent[], byUnit = false) {
  if (amount <= 0) return;
  const doom = byUnit && s.doom > 0;
  const n = amount + (byUnit ? s.doom : 0);
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
function breakLatest(s: GameState, qi: PlayerIndex, ev: GameEvent[]): boolean {
  const r = s.players[qi].resv;
  if (!r.length) return false;
  r.sort((a, b) => a.T - b.T);
  const x = r.pop()!;
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
    case 'heal3': heal(s, pi, 3, ev); break;
    case 'draw1': drawCard(s, pi, ev); break;
    case 'storm1': storm(s, pi, qi, 1, card, ev); break;
    case 'overdrive': readyAll(s, pi, ev); fortify(s, pi, 1, 1, ev); break;
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
      u.readyAt = Math.max(u.readyAt, s.players[qi].time) + (boosted ? 8 : 6);
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
    case 'ePray': heal(s, pi, boosted ? 4 : 3, ev); break;
    case 'eSlash': shot(s, qi, boosted ? 3 : 1 + x, boosted ? 2 : 1, ev); break;
    case 'ePeek': revealAll(s, qi, ev); for (let i = 0; i < (boosted ? 2 : 1); i++) drawCard(s, pi, ev); break;
    case 'eBreak': {
      let n = 0;
      // shows the opponent's hand of reservations first, then cuts the latest one (the big finisher is usually last)
      if (s.players[qi].resv.some((r) => !r.revealed)) revealAll(s, qi, ev);
      for (let i = 0; i < (boosted ? 2 : 1); i++) if (breakLatest(s, qi, ev)) n++;
      if (!n) ev.push({ e: 'fizzle', pi, card: d.id });
      break;
    }
    case 'eDraw': for (let i = 0; i < (boosted ? 2 : 1); i++) drawCard(s, pi, ev); break;
    case 'eReverse': shiftClock(s, qi, boosted ? 3 : 2, ev); break;
    case 'eStorm': storm(s, pi, qi, boosted ? 2 : 1, d.id, ev); break;
    case 'eEternal': damageBase(s, qi, boosted ? 3 : 2, ev); break;
    // ---- 第2弾
    case 'gSpanner': {
      const l = pickUnit(s, qi, 'atkLo');
      if (l < 0) damageBase(s, qi, 1, ev); else { damageUnit(s, qi, l, 2 + b, ev); reap(s, ev); }
      break;
    }
    case 'gReroute': case 'gTune': {
      const l = pickUnit(s, pi, 'atkHi');
      if (l < 0) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      const u = p.field[l]!;
      u.shift = true;
      if (d.effect === 'gReroute') { u.readyAt = Math.min(u.readyAt, p.time); u.atk += 2 + b; }
      else { u.atk += 2 + b; u.hp += 1; u.maxHp += 1; }
      ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp });
      break;
    }
    case 'gTrap': {
      const l = topEnemy(s, qi);
      if (l < 0) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      const f = s.players[qi].field, target = f[l]!;
      damageUnit(s, qi, l, 2 + b, ev); reap(s, ev);
      const to = [l + 1, l - 1].find((x) => x >= 0 && x < RULES.LANES && !f[x]);
      if (f[l] === target && to !== undefined) { f[to] = target; f[l] = null; ev.push({ e: 'move', pi: qi, from: l, to }); }
      break;
    }
    case 'gBlueprint': {
      for (let i = 0; i < 1 + b; i++) drawCard(s, pi, ev);
      const theme = p.hand.some((h) => { const c = cardDef(h.card); return !!c.bell || (c.keywords ?? []).includes('shift'); });
      if (theme) drawCard(s, pi, ev);
      break;
    }
    case 'gFortify': fortify(s, pi, 2 + b, 0, ev); break;
    case 'gHammer': {
      const l = pickUnit(s, qi, 'hpHi');
      if (l < 0) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      damageUnit(s, qi, l, 4, ev); reap(s, ev);
      break;
    }
    case 'gHush': {
      const any = s.players[qi].resv.some((r) => r.echo);
      delayResv(s, qi, 3 + b, true, ev); drawCard(s, pi, ev);
      if (any) drawCard(s, pi, ev);
      break;
    }
    case 'gRally': fortify(s, pi, 1 + b, 1, ev); break;
    case 'gRing': {
      for (let i = 0; i < 1 + b; i++) drawCard(s, pi, ev);
      let best = -1;
      p.field.forEach((u, l) => { if (u && cardDef(u.card).bell && (best < 0 || u.atk > p.field[best]!.atk)) best = l; });
      if (best >= 0) runBell(s, pi, best, cardDef(p.field[best]!.card).bell!, ev);
      break;
    }
    case 'gSilence': delayResv(s, qi, boosted ? 6 : 4, false, ev); drawCard(s, pi, ev); break;
    case 'gMaze': {
      const f = s.players[qi].field;
      storm(s, pi, qi, 1, d.id, ev);
      for (let l = RULES.LANES - 2; l >= 0; l--) if (f[l] && !f[l + 1]) { f[l + 1] = f[l]; f[l] = null; ev.push({ e: 'move', pi: qi, from: l, to: l + 1 }); }
      f.forEach((u, l) => { if (u) delayUnit(s, qi, l, 2 + b, ev); });
      break;
    }
    case 'gGearstorm': {
      const shifters = p.field.filter((u) => u && canShift(s, pi, u)).length;
      storm(s, pi, qi, 1 + Math.min(2, shifters) + b, d.id, ev);
      break;
    }
    case 'gMirror': {
      const l = topEnemy(s, qi), lane = p.field.findIndex((u) => !u);
      if (l < 0 || lane < 0) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      const src = s.players[qi].field[l]!;
      summonUnit(s, pi, 'g_doll', lane, -1, 0, ev);
      const u = p.field[lane]!;
      u.atk = src.atk + b; u.hp = u.maxHp = Math.max(1, src.hp);
      ev.push({ e: 'buff', pi, lane, atk: u.atk, hp: u.hp });
      break;
    }
    case 'gLever': {
      const hi = pickUnit(s, pi, 'atkHi'), lo = pickUnit(s, pi, 'atkLo');
      if (hi < 0 || lo < 0 || hi === lo) { ev.push({ e: 'fizzle', pi, card: d.id }); break; }
      [p.field[hi], p.field[lo]] = [p.field[lo], p.field[hi]];
      ev.push({ e: 'swap', pi, a: hi, b: lo });
      for (const l of [hi, lo]) { const u = p.field[l]!; u.readyAt = Math.min(u.readyAt, p.time); u.atk += 1 + b; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); }
      break;
    }
    case 'gRewire': {
      const f = s.players[qi].field;
      if (f.some(Boolean)) { const last = f[RULES.LANES - 1]; for (let l = RULES.LANES - 1; l > 0; l--) f[l] = f[l - 1]; f[0] = last; ev.push({ e: 'rotate', pi: qi }); }
      storm(s, pi, qi, 1, d.id, ev);
      readyAll(s, pi, ev);
      if (boosted) fortify(s, pi, 0, 1, ev);
      break;
    }
    case 'gQuake': storm(s, pi, qi, 2 + b, d.id, ev); p.field.forEach((u, l) => { if (u && cardDef(u.card).bell) { u.hp++; u.maxHp++; ev.push({ e: 'buff', pi, lane: l, atk: u.atk, hp: u.hp }); } }); break;
    case 'gErase': {
      const gone = s.players[qi].resv;
      s.players[qi].resv = [];
      for (const x of gone) ev.push({ e: 'breakResv', pi: qi, uid: x.uid, card: x.card });
      for (let i = 0; i < Math.max(1, Math.min(gone.length, 2 + b)); i++) drawCard(s, pi, ev);
      break;
    }
    case 'gOverdrive': readyAll(s, pi, ev); fortify(s, pi, 1, 1 + b, ev); break;
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
    // 第2弾
    case 'readyAlly': {
      const f = s.players[pi].field;
      let best = -1;
      f.forEach((x, l) => { if (x && l !== lane && (best < 0 || x.atk > f[best]!.atk)) best = l; });
      if (best >= 0) { f[best]!.readyAt = Math.min(f[best]!.readyAt, s.players[pi].time); ev.push({ e: 'buff', pi, lane: best, atk: f[best]!.atk, hp: f[best]!.hp }); }
      break;
    }
    case 'stunTop3': { const l = topEnemy(s, qi); if (l >= 0) delayUnit(s, qi, l, 3, ev); break; }
    case 'ringAll': ringBells(s, pi, ev); break;
    case 'dolls': for (let l = 0; l < RULES.LANES; l++) if (!s.players[pi].field[l]) summonUnit(s, pi, 'g_doll', l, -1, 0, ev); break;
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
    readyAt: p.time + (kw.includes('swift') ? 0 : 1), taunt: kw.includes('taunt') || (card === 'e_colossus' && x >= 3), pierce: kw.includes('pierce'), ...(kw.includes('shift') ? { shift: true } : {}),
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
      if (!t) damageBase(s, qi, u.atk + (cardDef(u.card).hook === 'flank' ? 2 : 0), ev, true);
      else {
        const v = s.players[qi].field[t.lane]!;
        const over = u.atk - v.hp;
        const back = v.atk;
        damageUnit(s, qi, t.lane, u.atk, ev);
        damageUnit(s, pi, a.lane, back, ev);
        if (u.pierce && over > 0) damageBase(s, qi, over, ev, true);
        reap(s, ev);
      }
      const still = p.field[a.lane];
      if (still && still.uid === u.uid) still.readyAt = p.time + u.reload;
      break;
    }
    case 'move': {
      const u = p.field[a.lane];
      if (!u || !canShift(s, pi, u)) throw new Error('unit cannot move');
      if (Math.abs(a.to - a.lane) !== 1 || a.to < 0 || a.to >= RULES.LANES || p.field[a.to]) throw new Error('lane not free');
      advance(s, pi, RULES.COST_MOVE, ev);
      // the clock may have rung a bell that changed the board; the move still needs its unit and an empty lane
      if (p.field[a.lane] === u && !p.field[a.to]) {
        p.field[a.to] = u; p.field[a.lane] = null;
        ev.push({ e: 'move', pi, from: a.lane, to: a.to });
        onShifted(s, pi, a.to, ev);
      }
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
