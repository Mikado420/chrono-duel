import { CARD_LIST, cardDef } from './cards';
import { RULES } from './rules';
import {
  actor, apply, attackTarget, clone, legalActions, other, worldTime,
  type Action, type GameState, type PlayerIndex, type PlayerState,
} from './engine';

/** easy/normal add noise to a greedy choice; hard looks one reply ahead; expert searches its own streak of moves and the opponent's. */
export type AiLevel = 'easy' | 'normal' | 'hard' | 'expert';
export const AI_LEVEL_NAMES: Record<AiLevel, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい', expert: '超つよい' };

/** Weights of the static evaluation. Each AI level can use its own set (超つよい uses tuned ones). */
export interface Weights { hp: number; danger: number; atk: number; body: number; open: number; hand: number; handExtra: number; resv: number; tempo: number; ready: number }
export const BASE_WEIGHTS: Weights = { hp: 1.5, danger: 1.5, atk: 1.1, body: 0.7, open: 0.7, hand: 1.4, handExtra: 0.6, resv: 1.8, tempo: 0.85, ready: 0 };
export const EXPERT_WEIGHTS: Weights = { ...BASE_WEIGHTS };
/** For balance tools only: try other weights for 超つよい. */
export function setExpertWeights(w: Partial<Weights>) { Object.assign(EXPERT_WEIGHTS, w); }

function unitValue(u: NonNullable<PlayerState['field'][number]>, W: Weights): number {
  return u.atk * W.atk + Math.max(0, u.hp) * W.body + (u.taunt ? 1 : 0) + (u.pierce ? 1 : 0) + (3 - u.reload) * 0.3;
}

/** Static evaluation from `pi`'s point of view. */
export function evaluate(s: GameState, pi: PlayerIndex, W: Weights = BASE_WEIGHTS): number {
  if (s.over) return s.over.winner === pi ? 1000 : s.over.winner === -1 ? 0 : -1000;
  const me = s.players[pi];
  const op = s.players[other(pi)];
  const late = 1 + worldTime(s) / RULES.END; // hp matters more as the clock runs out
  let v = (me.hp - op.hp) * W.hp * late;
  // being near death is worse than linear
  if (me.hp <= 5) v -= (6 - me.hp) * W.danger;
  if (op.hp <= 5) v += (6 - op.hp) * W.danger;
  const side = (p: PlayerState, sign: number, owner: PlayerIndex) => {
    p.field.forEach((u, l) => {
      if (!u) return;
      v += sign * unitValue(u, W);
      if (W.ready && u.readyAt <= p.time) v += sign * u.atk * W.ready;
      const t = attackTarget(s, owner, l);
      if (!t) v += sign * u.atk * W.open; // open lane = pressure on the base
    });
    const hc = p.hand.length;
    v += sign * (Math.min(hc, 3) * W.hand + Math.max(0, hc - 3) * W.handExtra);
    v += sign * p.resv.length * W.resv;
  };
  side(me, 1, pi);
  side(op, -1, other(pi));
  v += (op.time - me.time) * W.tempo;
  return v;
}

/** Hide what `pi` should not know: the opponent's unrevealed reservations and both deck orders. */
function fogged(s: GameState, pi: PlayerIndex): GameState {
  const c = clone(s);
  const op = c.players[other(pi)];
  op.resv = op.resv.filter((r) => r.revealed);
  for (const p of c.players) p.deck = p.deck.map(() => 'scout'); // unknown draws count as a weak card
  return c;
}

function pruneReserves(s: GameState, pi: PlayerIndex, acts: Action[]): Action[] {
  // keep a few representative times per card to limit the search
  const keep: Action[] = [];
  const byHand = new Map<number, number[]>();
  for (const a of acts) {
    if (a.t !== 'reserve') { keep.push(a); continue; }
    const arr = byHand.get(a.hand) ?? [];
    arr.push(a.T);
    byHand.set(a.hand, arr);
  }
  const opTime = s.players[other(pi)].time;
  for (const [hand, Ts] of byHand) {
    const pick = new Set<number>();
    const lo = Ts[0], hi = Ts[Ts.length - 1];
    for (const t of [lo, lo + 2, lo + 4, Math.max(lo, opTime + 3), Math.max(lo, RULES.DOOM_AT), hi]) if (t >= lo && t <= hi) pick.add(t);
    for (const T of pick) keep.push({ t: 'reserve', hand, T });
  }
  return keep;
}

/** Heuristic bonus for things the static evaluation cannot see (future value of a reservation). */
function intentBonus(s: GameState, pi: PlayerIndex, a: Action): number {
  if (a.t !== 'reserve') return 0;
  const h = s.players[pi].hand.find((x) => x.uid === a.hand)!;
  const d = cardDef(h.card);
  const op = s.players[other(pi)];
  const enemies = op.field.filter(Boolean).length;
  const wait = a.T - s.players[pi].time;
  let b = 0;
  switch (d.effect) {
    case 'bolt': b = 3.5 + (a.T >= RULES.DOOM_AT ? 1.5 : 0); break;
    case 'arrow': b = 2 + enemies * 0.8; break;
    case 'collapse': b = 1 + enemies * 1.5; break;
    case 'cage': b = 1.5 + enemies * 0.6; break;
    case 'stop': b = 4; break;
    case 'insight': b = 3; break;
    case 'rewind': b = s.players[pi].hp < 10 ? 3 : 1.5; break;
    case 'haste': b = 0; break;
    case 'eShot': b = 1.5 + enemies * 0.3; break;
    case 'ePray': b = s.players[pi].hp < 10 ? 2.5 : 1; break;
    case 'eSlash': b = 1.5 + enemies * 0.8; break;
    case 'ePeek': b = 2; break;
    case 'eBreak': b = 1.2 + op.resv.length * 1.5; break;
    case 'eDraw': b = 2.5; break;
    case 'eReverse': b = 3.5; break;
    case 'eStorm': b = 1 + enemies * 1.3; break;
    case 'eEternal': b = 3.5 + (a.T >= RULES.DOOM_AT ? 1.5 : 0); break;
  }
  return b - wait * 0.12;
}

function bestReply(s: GameState, pi: PlayerIndex, depth = 0): number {
  const q = actor(s);
  if (q === -1) return evaluate(s, pi);
  if (q === pi) {
    // still our move: assume we follow up with our best simple continuation
    if (depth > 0) return evaluate(s, pi);
    let best = -Infinity;
    for (const a of legalActions(s, pi)) {
      if (a.t === 'reserve') continue;
      const c = clone(s);
      apply(c, a);
      best = Math.max(best, bestReply(c, pi, depth + 1));
    }
    return best === -Infinity ? evaluate(s, pi) : best;
  }
  // opponent's cheapest known threats: attacks with ready units, or waiting
  let worst = Infinity;
  for (const a of legalActions(s, q)) {
    if (a.t !== 'attack' && a.t !== 'wait') continue;
    const c = clone(s);
    apply(c, a);
    worst = Math.min(worst, evaluate(c, pi));
  }
  return worst === Infinity ? evaluate(s, pi) : worst;
}

/**
 * Deeper search for 超つよい: follows its own consecutive moves (the lagging clock keeps acting) up to `mine`
 * plies, then lets the opponent answer with its known threats (attacks, drawing, waiting) for up to `theirs` plies.
 * The opponent's hand is never used, so the AI does not peek at hidden cards.
 */
function deepValue(s: GameState, pi: PlayerIndex, mine: number, theirs: number): number {
  const W = EXPERT_WEIGHTS;
  const q = actor(s);
  if (q === -1 || s.over) return evaluate(s, pi, W);
  if (q === pi) {
    if (mine <= 0) return evaluate(s, pi, W);
    let best = evaluate(s, pi, W) - 0.3; // standing pat is allowed but slightly worse than a useful move
    for (const a of legalActions(s, pi)) {
      if (a.t === 'reserve' || ('x' in a && a.x)) continue;
      const c = clone(s);
      apply(c, a);
      best = Math.max(best, deepValue(c, pi, mine - 1, theirs));
    }
    return best;
  }
  if (theirs <= 0) return evaluate(s, pi, W);
  let worst = Infinity;
  for (const a of legalActions(s, q)) {
    if (a.t !== 'attack' && a.t !== 'wait' && a.t !== 'draw') continue;
    const c = clone(s);
    apply(c, a);
    worst = Math.min(worst, deepValue(c, pi, Math.min(mine, 1), theirs - 1));
  }
  return worst === Infinity ? evaluate(s, pi, W) : worst;
}

/** Tunables of the 超つよい rollout search (the balance tools may change them). */
export const EXPERT_SEARCH = { candidates: 6, rollouts: 12, depth: 30 };

/**
 * One guess of the hidden information for `pi`: the opponent's hand and deck become random cards, our own deck
 * is our real remaining cards in a random order (we know our deck list but not its order).
 */
function determinize(s: GameState, pi: PlayerIndex, ownDeck: string[], rand: () => number): GameState {
  const c = clone(s);
  const op = c.players[other(pi)];
  const pool = CARD_LIST;
  op.hand = op.hand.map((h) => ({ uid: h.uid, card: pool[Math.floor(rand() * pool.length)].id }));
  op.deck = op.deck.map(() => pool[Math.floor(rand() * pool.length)].id);
  const mine = ownDeck.slice();
  for (let i = mine.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
  c.players[pi].deck = mine;
  return c;
}
/** Plays greedily (with a little noise) for up to `depth` actions and scores the result for `pi`. */
function rollout(s: GameState, pi: PlayerIndex, depth: number, rand: () => number): number {
  for (let i = 0; i < depth && !s.over; i++) {
    const q = actor(s);
    if (q === -1) break;
    let best: Action = { t: 'wait' }, bv = -Infinity;
    for (const a of legalActions(s, q)) {
      if (a.t === 'reserve') continue;
      const c = clone(s);
      apply(c, a);
      const v = evaluate(c, q, EXPERT_WEIGHTS) + (rand() - 0.5) * 1.5;
      if (v > bv) { bv = v; best = a; }
    }
    apply(s, best);
  }
  return evaluate(s, pi, EXPERT_WEIGHTS);
}

/** A generator so the UI can pause between candidates and keep animating while 超つよい thinks. */
function* expertSteps(s: GameState, pi: PlayerIndex, rand: () => number): Generator<void, Action> {
  const base = fogged(s, pi);
  const acts = pruneReserves(base, pi, legalActions(base, pi));
  // 1) shortlist with the deterministic search
  const scored = acts.map((a) => {
    const c = clone(base);
    apply(c, a);
    return { a, v: deepValue(c, pi, 2, 2) + intentBonus(base, pi, a) };
  }).sort((x, y) => y.v - x.v);
  const short = scored.slice(0, EXPERT_SEARCH.candidates);
  if (short.length <= 1) return short[0]?.a ?? { t: 'wait' };
  // 2) settle it by playing each candidate out against several guesses of the hidden cards
  const ownDeck = s.players[pi].deck.slice();
  const worlds = Array.from({ length: EXPERT_SEARCH.rollouts }, () => determinize(s, pi, ownDeck, rand));
  let best = short[0].a, bestV = -Infinity;
  for (const cand of short) {
    yield;
    let sum = 0;
    for (const w of worlds) {
      const c = clone(w);
      try { apply(c, cand.a); } catch { sum -= 1000; continue; }
      sum += rollout(c, pi, EXPERT_SEARCH.depth, rand);
    }
    // keep a little of the search score: it knows about reservations that rollouts do not play
    const v = sum / worlds.length + cand.v * 0.25;
    if (v > bestV) { bestV = v; best = cand.a; }
  }
  return best;
}

function chooseExpert(s: GameState, pi: PlayerIndex, rand: () => number): Action {
  const it = expertSteps(s, pi, rand);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** Same as chooseAction, but gives the browser a frame between 超つよい's candidates. */
export async function chooseActionAsync(s: GameState, pi: PlayerIndex, level: AiLevel, rand: () => number = Math.random): Promise<Action> {
  if (level !== 'expert') return chooseAction(s, pi, level, rand);
  const it = expertSteps(s, pi, rand);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise((res) => setTimeout(res, 0));
  }
}

export function chooseAction(s: GameState, pi: PlayerIndex, level: AiLevel, rand: () => number = Math.random): Action {
  if (level === 'expert') return chooseExpert(s, pi, rand);
  const base = fogged(s, pi);
  const acts = pruneReserves(base, pi, legalActions(base, pi));
  let best: Action = { t: 'wait' };
  let bestV = -Infinity;
  for (const a of acts) {
    const c = clone(base);
    apply(c, a);
    let v = level === 'hard' ? bestReply(c, pi) : evaluate(c, pi);
    v += intentBonus(base, pi, a);
    if (level === 'normal') v += (rand() - 0.5) * 4;
    if (level === 'easy') v += (rand() - 0.5) * 22;
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}
