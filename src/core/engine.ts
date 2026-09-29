import { CARDS, cardDef, type CardDef } from './cards';
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
export interface Reservation { uid: number; card: string; T: number; revealed: boolean }
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

export type Action =
  | { t: 'play'; hand: number; lane: number }
  | { t: 'cast'; hand: number }
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
  | { e: 'trigger'; pi: PlayerIndex; uid: number; card: string; T: number }
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
    if (d.kind === 'unit') {
      p.field.forEach((u, l) => { if (!u) out.push({ t: 'play', hand: h.uid, lane: l }); });
    } else {
      out.push({ t: 'cast', hand: h.uid });
      const r = p.resv.length < RULES.MAX_RESV ? resvRange(s, pi, d.cost) : null;
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
      return h ? cardDef(h.card).cost : 0;
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

// ---------------------------------------------------------------- effects
function runSpell(s: GameState, pi: PlayerIndex, d: CardDef, boosted: boolean, ev: GameEvent[]) {
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
  }
}

function runUnitHook(s: GameState, pi: PlayerIndex, lane: number, ev: GameEvent[]) {
  const qi = other(pi);
  const u = s.players[pi].field[lane]!;
  switch (cardDef(u.card).hook) {
    case 'draw1': drawCard(s, pi, ev); break;
    case 'delayOpp1': shiftClock(s, qi, 1, ev); break;
    case 'revealResv': {
      const r = s.players[qi].resv;
      r.forEach((x) => (x.revealed = true));
      ev.push({ e: 'reveal', pi: qi, uids: r.map((x) => x.uid) });
      break;
    }
    case 'breakResv': {
      const r = s.players[qi].resv;
      if (!r.length) break;
      r.sort((a, b) => a.T - b.T);
      const x = r.shift()!;
      ev.push({ e: 'breakResv', pi: qi, uid: x.uid, card: x.card });
      break;
    }
    case 'dawnBurst':
      for (let l = 0; l < RULES.LANES; l++) if (s.players[qi].field[l]) damageUnit(s, qi, l, 2, ev);
      reap(s, ev);
      break;
  }
}

// ---------------------------------------------------------------- apply
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
      if (p.field[a.lane]) throw new Error('lane occupied');
      const { idx, card } = takeHand(p, a.hand);
      const d = cardDef(card);
      if (d.kind !== 'unit') throw new Error('not a unit');
      advance(s, pi, d.cost, ev);
      const kw = d.keywords ?? [];
      const unit: Unit = {
        uid: s.nextUid++, card, atk: d.atk!, hp: d.hp!, maxHp: d.hp!, reload: d.reload!,
        readyAt: p.time + (kw.includes('swift') ? 0 : 1), taunt: kw.includes('taunt'), pierce: kw.includes('pierce'),
      };
      p.field[a.lane] = unit;
      ev.push({ e: 'summon', pi, lane: a.lane, unit: { ...unit }, fromHand: idx });
      runUnitHook(s, pi, a.lane, ev);
      break;
    }
    case 'cast': {
      const { idx, card } = takeHand(p, a.hand);
      const d = cardDef(card);
      advance(s, pi, d.cost, ev);
      ev.push({ e: 'cast', pi, card, fromHand: idx });
      runSpell(s, pi, d, false, ev);
      break;
    }
    case 'reserve': {
      if (p.resv.length >= RULES.MAX_RESV) throw new Error('too many reservations');
      const h = p.hand.find((x) => x.uid === a.hand);
      const d = cardDef(h!.card);
      const r = resvRange(s, pi, d.cost);
      if (!r || a.T < r[0] || a.T > r[1]) throw new Error('bad reservation time');
      const { idx, card } = takeHand(p, a.hand);
      advance(s, pi, d.cost, ev);
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
  for (let guard = 0; guard < 10; guard++) {
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
      ev.push({ e: 'trigger', pi, uid: r.uid, card: r.card, T: r.T });
      runSpell(s, pi, cardDef(r.card), true, ev);
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
