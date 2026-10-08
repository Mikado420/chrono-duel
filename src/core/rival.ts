/**
 * The rated opponents' brain (仕様書「対戦相手名簿」). Strength comes from the Lv only: how deep it reads, how noisy
 * its scores are and which mistakes it makes. Persona, the deck's plan and the name's quirks only choose between
 * moves that are about as good as the best one (within ε), so two rivals of the same Lv are equally strong.
 *
 * One move:
 *   1. candidates (some dropped by this move's mistake)   2. score them at the Lv's reading depth (+ plan bonus)
 *   3. forced moves: とどめ / 必ず守る / 大差            4. persona re-scores the moves within ε of the best
 *   5. quirks break ties                                  6. the battle scene waits a human-like time and plays it
 */
import {
  BASE_WEIGHTS, EXPERT_WEIGHTS, bestReply, breakBonus, chooseChoice, deepValue, determinize, evaluate, fogged,
  intentBonus, pruneReserves, rollout, type Weights,
} from './ai';
import { cardDef } from './cards';
import {
  actor, apply, attackTarget, clone, legalActions, other, resvRange, timeCost, worldTime,
  type Action, type GameState, type PlayerIndex, type PlayerState,
} from './engine';
import { guessDecks, guessWorld, likelyDeck, moreReserveTimes, observe, type Seen } from './infer';
import { planBonus, type PlanScale } from './plans';
import { RULES } from './rules';

export type Persona = 'attack' | 'guard' | 'schemer' | 'steady';

// ------------------------------------------------------------------ Lv
export type MissKind = 'attackMiss' | 'threatMiss' | 'resvShift' | 'holdBack' | 'misplace' | 'missLethal' | 'forgetDefend';
export interface LvParams {
  /** 0: the position after the move; 1: the opponent's attacks one move ahead; 2: rollouts. */
  read: 0 | 1 | 2;
  /** Probability of reading one level deeper on a move. */
  deeper: number;
  /** Rollout search (読み2): shortlist size, guessed worlds, depth. */
  search: { candidates: number; rollouts: number; depth: number };
  /** Uniform noise added to every score (±). */
  noise: number;
  /** 互角の幅: moves this close to the best are "as good". */
  eps: number;
  plan: PlanScale;
  /** Per-move probability of each mistake, in %. */
  miss: Record<MissKind, number>;
  /** Lv9+: guesses the opponent's deck from the cards seen (rollouts use it, and the plan's 相手別 rules). */
  infer?: boolean;
  /** Lv10: keeps the opponent's hidden reservations (their pins) with a guessed spell, tries more reservation times and reserves in its rollouts. */
  pins?: boolean;
}
const M = (attackMiss: number, threatMiss: number, resvShift: number, holdBack: number, misplace: number, missLethal: number, forgetDefend: number): Record<MissKind, number> =>
  ({ attackMiss, threatMiss, resvShift, holdBack, misplace, missLethal, forgetDefend });
const S = (candidates: number, rollouts: number, depth: number) => ({ candidates, rollouts, depth });
/**
 * Tuned with `npm run sim:rivals` so each Lv beats the one below about 62–66% (the 仕様書's starting values were
 * a little too close together: reading deeper buys less than the noise and mistakes cost).
 */
export const LV: Record<number, LvParams> = {
  1: { read: 0, deeper: 0, search: S(0, 0, 0), noise: 14, eps: 3.0, plan: 'half', miss: M(35, 0, 30, 15, 35, 50, 30) },
  2: { read: 0, deeper: 0, search: S(0, 0, 0), noise: 8, eps: 2.5, plan: 'half', miss: M(15, 0, 20, 10, 15, 25, 15) },
  3: { read: 0, deeper: 0.25, search: S(0, 0, 0), noise: 4, eps: 2.0, plan: 'basic', miss: M(10, 15, 15, 8, 8, 10, 8) },
  4: { read: 1, deeper: 0, search: S(0, 0, 0), noise: 1.5, eps: 1.5, plan: 'all', miss: M(6, 10, 10, 5, 4, 0, 0) },
  5: { read: 1, deeper: 0.5, search: S(4, 6, 20), noise: 0.5, eps: 1.5, plan: 'all', miss: M(4, 6, 6, 3, 2, 0, 0) },
  6: { read: 2, deeper: 0, search: S(5, 8, 24), noise: 0, eps: 1.2, plan: 'all', miss: M(2, 4, 4, 2, 1, 0, 0) },
  7: { read: 2, deeper: 0, search: S(6, 12, 30), noise: 0, eps: 1.0, plan: 'all', miss: M(1, 2, 2, 1, 0, 0, 0) },
  8: { read: 2, deeper: 0, search: S(8, 24, 30), noise: 0, eps: 0.8, plan: 'all', miss: M(0, 1, 1, 0, 0, 0, 0) },
  9: { read: 2, deeper: 0, search: S(10, 32, 30), noise: 0, eps: 0.6, plan: 'all', miss: M(0, 0, 0, 0, 0, 0, 0), infer: true },
  10: { read: 2, deeper: 0, search: S(12, 40, 30), noise: 0, eps: 0.5, plan: 'all', miss: M(0, 0, 0, 0, 0, 0, 0), infer: true, pins: true },
};
/** For balance tools: change a Lv's parameters. */
export function tuneLv(lv: number, p: Partial<LvParams>) { Object.assign(LV[lv], p); }

// ------------------------------------------------------------------ persona
/**
 * Multipliers on the evaluation's terms (堅実型 = 1). hpFoe / hpOwn split the base-hp difference. 攻め型 and 守り型 sit
 * halfway between the 仕様書's values and 1.0: at full strength they won 7–9% more than 堅実型 at Lv4 (the limit is ±3%).
 */
export interface PersonaW { hpFoe: number; hpOwn: number; danger: number; atk: number; body: number; open: number; taunt: number; ready: number; hand: number; resv: number; tempo: number }
export const PERSONA_W: Record<Persona, PersonaW> = {
  attack: { hpFoe: 1.15, hpOwn: 0.9, danger: 0.9, atk: 1.1, body: 0.9, open: 1.3, taunt: 0.75, ready: 1.25, hand: 0.9, resv: 0.9, tempo: 1.0 },
  guard: { hpFoe: 0.95, hpOwn: 1.2, danger: 1.3, atk: 0.9, body: 1.2, open: 0.8, taunt: 1.5, ready: 0.75, hand: 1.05, resv: 0.95, tempo: 0.9 },
  schemer: { hpFoe: 1.0, hpOwn: 1.0, danger: 1.0, atk: 0.9, body: 0.9, open: 0.9, taunt: 1.0, ready: 1.0, hand: 1.3, resv: 1.6, tempo: 1.5 },
  steady: { hpFoe: 1, hpOwn: 1, danger: 1, atk: 1, body: 1, open: 1, taunt: 1, ready: 1, hand: 1, resv: 1, tempo: 1 },
};
/** The evaluation with a persona's multipliers (same shape as ai.evaluate, which it equals for 堅実型 apart from `ready`). */
export function evaluatePersona(s: GameState, pi: PlayerIndex, P: PersonaW, W: Weights = BASE_WEIGHTS): number {
  if (s.over) return s.over.winner === pi ? 1000 : s.over.winner === -1 ? 0 : -1000;
  const me = s.players[pi], op = s.players[other(pi)];
  const late = 1 + worldTime(s) / RULES.END;
  let v = (me.hp * P.hpOwn - op.hp * P.hpFoe) * W.hp * late;
  if (me.hp <= 5) v -= (6 - me.hp) * W.danger * P.danger;
  if (op.hp <= 5) v += (6 - op.hp) * W.danger;
  const side = (p: PlayerState, sign: number, owner: PlayerIndex) => {
    p.field.forEach((u, l) => {
      if (!u) return;
      v += sign * (u.atk * W.atk * P.atk + Math.max(0, u.hp) * W.body * P.body + (u.taunt ? P.taunt : 0) + (u.pierce ? 1 : 0) + (3 - u.reload) * 0.3);
      if (u.readyAt <= p.time) v += sign * u.atk * 0.4 * P.ready;
      if (!attackTarget(s, owner, l)) v += sign * u.atk * W.open * P.open;
    });
    const hc = p.hand.length;
    v += sign * (Math.min(hc, 3) * W.hand + Math.max(0, hc - 3) * W.handExtra) * P.hand;
    v += sign * p.resv.filter((r) => !r.decoy).length * W.resv * P.resv;
  };
  side(me, 1, pi);
  side(op, -1, other(pi));
  v += (op.time - me.time) * W.tempo * P.tempo;
  return v;
}
/** What a persona likes among equally good moves (互角なら…). */
function personaPref(p: Persona, s: GameState, pi: PlayerIndex, a: Action): number {
  const me = s.players[pi], op = s.players[other(pi)];
  const card = 'hand' in a ? me.hand.find((h) => h.uid === a.hand)?.card : undefined;
  const d = card ? cardDef(card) : undefined;
  switch (p) {
    case 'attack':
      if (a.t === 'attack') return 0.6;
      if (a.t === 'draw') return me.hand.length >= 2 ? -0.6 : 0;
      if (a.t === 'play') return !op.field[a.lane] ? 0.4 : 0;
      if (a.t === 'reserve') { const r = resvRange(s, pi, timeCost(s, pi, a)); return r && a.T === r[0] ? 0.3 : 0; }
      return 0;
    case 'guard':
      if (a.t === 'play') return (op.field[a.lane] ? 0.5 : 0) + (d?.keywords?.includes('taunt') && a.lane === 1 ? 0.5 : 0);
      if (card && ['rewind', 'e_pray'].includes(card)) return me.hp <= 9 ? 0.6 : -0.3;
      if (a.t === 'attack') { const t = attackTarget(s, pi, a.lane); const u = me.field[a.lane]!; return t && op.field[t.lane]!.atk >= u.hp ? -0.4 : 0; }
      return 0;
    case 'schemer':
      if (a.t === 'reserve') return 0.6 + ([op.time + 1, RULES.DOOM_AT, ...RULES.BELLS.map((b) => b - 1)].includes(a.T) ? 0.4 : 0);
      if (card && ['stop', 'e_reverse', 'delayer'].includes(card)) return 0.4;
      if (card === 'e_break') return s.players[other(pi)].resv.length < 2 ? -0.5 : 0;
      return 0;
    default: return 0;
  }
}

// ------------------------------------------------------------------ quirks (癖)
export interface Quirks { lane: 0 | 1 | 2; resv: -1 | 0 | 1; draw: 2 | 1; tempo: 0.8 | 1 | 1.2 }
/** FNV-1a: the same name always gives the same quirks (the roster page uses the same formula). */
export function nameHash(name: string): number {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function quirksOf(name: string): Quirks {
  const h = nameHash(name);
  return {
    lane: (h % 3) as 0 | 1 | 2,
    resv: ([-1, 0, 1] as const)[(h >>> 4) % 3],
    draw: ([2, 1] as const)[(h >>> 8) % 2],
    tempo: ([0.8, 1, 1.2] as const)[(h >>> 12) % 3],
  };
}
function quirkPref(q: Quirks, s: GameState, pi: PlayerIndex, a: Action): number {
  if (a.t === 'play') return a.lane === q.lane ? 0.05 : 0;
  if (a.t === 'reserve') { const r = resvRange(s, pi, timeCost(s, pi, a)); if (!r) return 0; const want = Math.min(r[1], Math.max(r[0], s.players[other(pi)].time + 2 + q.resv)); return -Math.abs(a.T - want) * 0.01; }
  if (a.t === 'draw') return s.players[pi].hand.length <= q.draw ? 0.04 : -0.04;
  return 0;
}

// ------------------------------------------------------------------ the rival
export interface RivalCfg { name: string; lv: number; persona: Persona; deck: string; quirks: Quirks }
/** What a rival keeps between its moves in one game. */
export interface RivalMind {
  /** 調子 for this game (0.7–1.3): scales the noise and the mistakes. */
  form: number;
  lastMiss: MissKind | null;
  missRun: number;
  surrenderChecked: boolean;
  /** The opponent's cards seen so far (for the deck guess). */
  seen: Seen;
}
export const newMind = (rand: () => number = Math.random): RivalMind => ({ form: 0.7 + rand() * 0.6, lastMiss: null, missRun: 0, surrenderChecked: false, seen: {} });

/** How the move was found (the battle scene turns this into a thinking time). */
export type MoveKind = 'obvious' | 'normal' | 'torn' | 'key';
export interface RivalMove {
  action: Action;
  kind: MoveKind;
  /** A hand card the rival nearly played instead (for the hesitation). */
  alt?: number;
  /** Gives up this game (降参). */
  surrender?: boolean;
  /** For tools and tests. */
  why?: 'lethal' | 'defend' | 'ahead' | 'behind' | 'persona' | 'only';
  miss?: MissKind;
}

const isLegend = (s: GameState, pi: PlayerIndex, a: Action) => a.t === 'play' && cardDef(s.players[pi].hand.find((h) => h.uid === a.hand)?.card ?? 'scout').rarity === 'L';
const handOf = (a: Action) => ('hand' in a ? a.hand : undefined);

/** One mistake for this move (at most one; never the same kind three moves running). */
function rollMiss(p: LvParams, mind: RivalMind, rand: () => number): MissKind | null {
  for (const k of Object.keys(p.miss) as MissKind[]) {
    if (mind.lastMiss === k && mind.missRun >= 2) continue;
    if (rand() * 100 < p.miss[k] * mind.form) return k;
  }
  return null;
}
function noteMiss(mind: RivalMind, k: MissKind | null) {
  if (k && k === mind.lastMiss) mind.missRun++;
  else { mind.lastMiss = k; mind.missRun = k ? 1 : 0; }
}

/** とどめ: a run of our own moves (before the opponent acts) that ends the game in our favour. Returns its first move. */
export function findLethal(s: GameState, pi: PlayerIndex, depth = 3, budget = { n: 2500 }): Action | null {
  if (depth <= 0 || actor(s) !== pi || s.pending) return null;
  // attacks and spells first: they are what finishes a base, and the budget runs out on summons otherwise
  const order = { attack: 0, cast: 1, play: 2 } as Record<string, number>;
  const acts = legalActions(s, pi).filter((a) => a.t in order).sort((x, y) => order[x.t] - order[y.t]);
  for (const a of acts) {
    if (--budget.n < 0) return null;
    const c = clone(s);
    try { apply(c, a); } catch { continue; }
    if (c.over?.winner === pi) return a;
    if (!c.over && findLethal(c, pi, depth - 1, budget)) return a;
  }
  return null;
}
/** Damage the opponent can put on our base in its next run of moves (ready units into open lanes, revealed big spells). */
export function incoming(s: GameState, pi: PlayerIndex): number {
  const q = other(pi), me = s.players[pi], op = s.players[q];
  const soon = me.time + 1;
  let dmg = 0;
  op.field.forEach((u, l) => {
    if (!u || u.readyAt > soon) return;
    if (attackTarget(s, q, l) === null) dmg += u.atk + s.doom;
    else if (u.pierce) { const t = attackTarget(s, q, l)!; dmg += Math.max(0, u.atk - (me.field[t.lane]?.hp ?? 0)); }
  });
  for (const r of op.resv) {
    if (!r.revealed || r.echo || r.T > me.time + 3) continue;
    dmg += r.card === 'bolt' ? 5 : r.card === 'e_eternal' ? 3 : r.card === 'arrow' && !me.field.some(Boolean) ? 3 : 0;
  }
  return dmg;
}

/** The guessed world as the shortlist sees it: our hand is real, every draw is unknown (like `fogged`), the pins stay. */
function fogPins(w: GameState): GameState {
  for (const p of w.players) p.deck = p.deck.map(() => 'scout');
  return w;
}
/** Like ai.rollout, but either side may also reserve (at its earliest time or two ticks later): Lv10's 予約の先読み. */
export function rolloutWithReserves(s: GameState, pi: PlayerIndex, depth: number, rand: () => number): number {
  for (let i = 0; i < depth && !s.over; i++) {
    const q = actor(s);
    if (q === -1) break;
    if (s.pending) { apply(s, chooseChoice(s, q)); continue; }
    let best: Action = { t: 'wait' }, bv = -Infinity;
    for (const a of legalActions(s, q)) {
      let extra = 0;
      if (a.t === 'reserve') {
        const r = resvRange(s, q, timeCost(s, q, a));
        if (!r || (a.T !== r[0] && a.T !== r[0] + 2)) continue;
        extra = intentBonus(s, q, a);
      }
      const c = clone(s);
      apply(c, a);
      const v = evaluate(c, q, EXPERT_WEIGHTS) + extra + (rand() - 0.5) * 1.5;
      if (v > bv) { bv = v; best = a; }
    }
    apply(s, best);
  }
  return evaluate(s, pi, EXPERT_WEIGHTS);
}

interface Scored { a: Action; v: number; ahead?: number }

/** A generator so the battle scene can keep animating between rollouts. */
export function* rivalSteps(real: GameState, pi: PlayerIndex, cfg: RivalCfg, mind: RivalMind, rand: () => number = Math.random): Generator<void, RivalMove> {
  if (real.pending) return { action: chooseChoice(real, pi), kind: 'obvious', why: 'only' };
  const P = LV[Math.max(1, Math.min(10, cfg.lv))];
  const base = fogged(real, pi);
  const me = base.players[pi];
  observe((mind.seen ??= {}), real, pi);
  const guess = P.infer ? guessDecks(mind.seen) : null;
  const oppDeck = guess ? likelyDeck(guess) : null;
  let acts = pruneReserves(base, pi, legalActions(base, pi));
  if (P.pins) acts = moreReserveTimes(base, pi, legalActions(base, pi), acts);
  const miss = rollMiss(P, mind, rand);
  noteMiss(mind, miss);

  // ---- 3a. forced: とどめ (Lv1–3 may not look for it)
  if (miss !== 'missLethal') {
    const kill = findLethal(base, pi);
    if (kill) return { action: kill, kind: 'key', why: 'lethal' };
  }

  // ---- 1. mistakes that remove candidates
  if (miss === 'attackMiss') {
    const lanes = [...new Set(acts.filter((a) => a.t === 'attack').map((a) => (a as { lane: number }).lane))];
    if (lanes.length) { const l = lanes[Math.floor(rand() * lanes.length)]; acts = acts.filter((a) => !(a.t === 'attack' && a.lane === l)); }
  }
  if (miss === 'holdBack' && me.hand.length >= 3) {
    const top = [...me.hand].sort((x, y) => cardDef(y.card).cost - cardDef(x.card).cost)[0];
    const kept = acts.filter((a) => handOf(a) !== top.uid);
    if (kept.length) acts = kept;
  }
  if (!acts.length) acts = [{ t: 'wait' }];

  // ---- 2. score at the Lv's depth
  const read = (P.read + (rand() < P.deeper ? 1 : 0)) as 0 | 1 | 2;
  const threatLane = miss === 'threatMiss' ? Math.floor(rand() * RULES.LANES) : -1;
  const bonus = (a: Action) => intentBonus(base, pi, a) + breakBonus(real, pi, a) + planBonus(cfg.deck, P.plan, base, real, pi, a, oppDeck);
  const noise = () => (P.noise ? (rand() * 2 - 1) * P.noise * mind.form : 0);
  let scored: Scored[];
  if (read < 2) {
    scored = acts.map((a) => {
      const c = clone(base);
      apply(c, a);
      const v = read === 1 ? bestReply(c, pi, 0, threatLane) : evaluate(c, pi);
      return { a, v: v + bonus(a) + noise() };
    });
  } else {
    const search = P.search.candidates ? P.search : LV[7].search;
    // Lv10 reads its shortlist with the opponent's pins in place (their spells guessed)
    const pinBase = P.pins && guess ? fogPins(guessWorld(real, pi, guess, mind.seen, true, rand)) : base;
    const pre = acts.map((a) => { const c = clone(pinBase); try { apply(c, a); } catch { return { a, v: -1e9 }; } return { a, v: deepValue(c, pi, 2, 2) + bonus(a) }; }).sort((x, y) => y.v - x.v);
    const short = pre.slice(0, search.candidates);
    const worlds = Array.from({ length: search.rollouts }, () => (guess ? guessWorld(real, pi, guess, mind.seen, !!P.pins, rand) : determinize(real, pi, real.players[pi].deck.slice(), rand)));
    scored = [];
    for (const cand of short) {
      yield;
      let sum = 0, ahead = 0;
      for (const w of worlds) {
        const c = clone(w);
        try { apply(c, cand.a); } catch { sum -= 1000; continue; }
        const r = P.pins ? rolloutWithReserves(c, pi, search.depth, rand) : rollout(c, pi, search.depth, rand);
        sum += r;
        if (r > 0) ahead++;
      }
      scored.push({ a: cand.a, v: sum / Math.max(1, worlds.length) + cand.v * 0.25 + noise(), ahead: ahead / Math.max(1, worlds.length) });
    }
  }
  scored.sort((x, y) => y.v - x.v);
  const best = scored[0];
  const second = scored[1];
  const alt = second ? handOf(second.a) : undefined;
  const kindOf = (): MoveKind => (scored.length <= 1 || best.v - second.v >= 5 ? 'obvious' : best.v - second.v <= P.eps ? 'torn' : 'normal');
  const finish = (a: Action, why: RivalMove['why'], kind: MoveKind = kindOf()): RivalMove => {
    let action = a;
    // mistakes that change the chosen move a little
    if (miss === 'misplace' && action.t === 'play') {
      const empty = me.field.map((u, l) => (u ? -1 : l)).filter((l) => l >= 0);
      if (empty.length) action = { ...action, lane: empty[Math.floor(rand() * empty.length)] };
    }
    if (miss === 'resvShift' && action.t === 'reserve') {
      const r = resvRange(base, pi, timeCost(base, pi, action));
      if (r) { const d = (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 2)); action = { ...action, T: Math.max(r[0], Math.min(r[1], action.T + d)) }; }
    }
    return { action, kind: isLegend(base, pi, action) ? 'key' : kind, alt: alt !== handOf(action) ? alt : undefined, why, miss: miss ?? undefined };
  };
  if (scored.length === 1) return finish(best.a, 'only');

  // ---- 3b. forced: 必ず守る
  if (miss !== 'forgetDefend' && incoming(base, pi) >= me.hp) {
    const safe = scored.map((x) => { const c = clone(base); apply(c, x.a); return { ...x, in: c.over ? (c.over.winner === pi ? -99 : 99) : incoming(c, pi) - c.players[pi].hp }; })
      .sort((x, y) => x.in - y.in || y.v - x.v);
    // 降参: the opponent's finish is coming and nothing stops it
    if (safe[0].in >= 0 && worldTime(base) >= 12 && cfg.lv >= 4 && !mind.surrenderChecked) {
      mind.surrenderChecked = true;
      if (rand() < (cfg.lv >= 8 ? 0.5 : 0.25)) return { action: { t: 'wait' }, kind: 'key', surrender: true, why: 'defend' };
    }
    return finish(safe[0].a, 'defend', 'key');
  }

  // ---- 3c. forced: 大差
  const now = evaluate(base, pi);
  if (now >= 25) return finish(best.a, 'ahead');
  if (now <= -25 && read === 2 && cfg.lv >= 6) {
    const bet = [...scored].sort((x, y) => (y.ahead ?? 0) - (x.ahead ?? 0) || y.v - x.v)[0];
    return finish(bet.a, 'behind');
  }

  // ---- 4–5. persona and quirks among the moves within ε
  const close = scored.filter((x) => best.v - x.v <= P.eps);
  if (close.length === 1) return finish(best.a, 'persona');
  const PW = PERSONA_W[cfg.persona];
  const W = read === 2 ? EXPERT_WEIGHTS : BASE_WEIGHTS;
  let pick = close[0], pv = -Infinity;
  for (const x of close) {
    const c = clone(base);
    apply(c, x.a);
    const v = (cfg.persona === 'steady' ? x.v : evaluatePersona(c, pi, PW, W) - evaluatePersona(c, pi, PERSONA_W.steady, W) + x.v)
      + personaPref(cfg.persona, base, pi, x.a) + quirkPref(cfg.quirks, base, pi, x.a);
    if (v > pv) { pv = v; pick = x; }
  }
  return finish(pick.a, 'persona');
}

export function chooseRival(s: GameState, pi: PlayerIndex, cfg: RivalCfg, mind: RivalMind, rand: () => number = Math.random): RivalMove {
  const it = rivalSteps(s, pi, cfg, mind, rand);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
export async function chooseRivalAsync(s: GameState, pi: PlayerIndex, cfg: RivalCfg, mind: RivalMind, rand: () => number = Math.random): Promise<RivalMove> {
  const it = rivalSteps(s, pi, cfg, mind, rand);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise((res) => setTimeout(res, 0));
  }
}

// ------------------------------------------------------------------ thinking time (人間らしさ)
/**
 * How long a rival seems to think about a move, in ms (the AI's own thinking time counts towards it).
 * `streak`: it already moved just before (its clock is still behind); `first`: its first move of the game.
 */
export function thinkMs(m: RivalMove, cfg: RivalCfg, s: GameState, o: { streak: boolean; first: boolean }, rand: () => number = Math.random): number {
  const span = (a: number, b: number) => a + rand() * (b - a);
  let ms = m.kind === 'obvious' ? span(600, 1200) : m.kind === 'torn' ? span(2500, 5500) : span(1200, 2800);
  if (m.kind === 'key') ms = span(1200, 2800) + 1000;
  const lv = cfg.lv;
  if (lv <= 3) { ms *= 0.9; if (rand() < 0.05) ms += span(3000, 6000); }
  else if (lv >= 8) ms *= m.kind === 'obvious' ? 0.8 : m.kind === 'torn' ? 1.4 : 1;
  if (o.streak) ms *= 0.6;
  if (o.first) ms += 1500;
  const w = worldTime(s), low = Math.min(s.players[0].hp, s.players[1].hp);
  if (w < 8) ms *= 0.75;
  else if (w >= 32 || low <= 5) ms *= 1.25;
  ms *= cfg.quirks.tempo;
  return Math.min(9000, Math.round(ms));
}
