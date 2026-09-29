import { cardDef } from './cards';
import { RULES } from './rules';
import {
  actor, apply, attackTarget, clone, legalActions, other, worldTime,
  type Action, type GameState, type PlayerIndex, type PlayerState,
} from './engine';

export type AiLevel = 'normal' | 'hard';

function unitValue(u: NonNullable<PlayerState['field'][number]>): number {
  return u.atk * 1.1 + Math.max(0, u.hp) * 0.7 + (u.taunt ? 1 : 0) + (u.pierce ? 1 : 0) + (3 - u.reload) * 0.3;
}

/** Static evaluation from `pi`'s point of view. */
export function evaluate(s: GameState, pi: PlayerIndex): number {
  if (s.over) return s.over.winner === pi ? 1000 : s.over.winner === -1 ? 0 : -1000;
  const me = s.players[pi];
  const op = s.players[other(pi)];
  const late = 1 + worldTime(s) / RULES.END; // hp matters more as the clock runs out
  let v = (me.hp - op.hp) * 1.5 * late;
  // being near death is worse than linear
  if (me.hp <= 5) v -= (6 - me.hp) * 1.5;
  if (op.hp <= 5) v += (6 - op.hp) * 1.5;
  const side = (p: PlayerState, q: PlayerState, sign: number, owner: PlayerIndex) => {
    p.field.forEach((u, l) => {
      if (!u) return;
      v += sign * unitValue(u);
      const t = attackTarget(s, owner, l);
      if (!t) v += sign * u.atk * 0.7; // open lane = pressure on the base
    });
    const hc = p.hand.length;
    v += sign * (Math.min(hc, 3) * 1.4 + Math.max(0, hc - 3) * 0.6);
    v += sign * p.resv.length * 1.8;
    void q;
  };
  side(me, op, 1, pi);
  side(op, me, -1, other(pi));
  v += (op.time - me.time) * 0.85;
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

export function chooseAction(s: GameState, pi: PlayerIndex, level: AiLevel, rand: () => number = Math.random): Action {
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
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}
