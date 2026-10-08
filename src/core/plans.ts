/**
 * 作戦ボーナス: what each deck is trying to do, as small additions to a candidate move's score (the same unit as
 * intentBonus). The first rule of a deck is its 基本. Rated rivals use these; how much depends on their Lv
 * (see PlanScale). The rules only read what the player could see too, plus the AI's own hand.
 */
import { cardDef, type CardDef } from './cards';
import { RULES } from './rules';
import { attackTarget, other, rushActive, timeCost, worldTime, type Action, type GameState, type PlayerIndex, type PlayerState } from './engine';
import { knownDecks } from './infer';

/** half: only the 基本 rule at half strength; basic: only the 基本 rule; all: every rule and the shared ones. */
export type PlanScale = 'half' | 'basic' | 'all';

/** Everything a rule may look at, computed once per candidate. */
export interface PlanCtx {
  s: GameState;
  /** The real state, for the public counts (how many reservations the opponent has: the pins are on the dial). */
  real: GameState;
  pi: PlayerIndex;
  a: Action;
  me: PlayerState;
  op: PlayerState;
  /** The card the move uses, if any. */
  card?: CardDef;
  cardId?: string;
  cost: number;
  /** Charge paid (充填). */
  x: number;
  reserve: boolean;
}

const has = (p: PlayerState, id: string) => p.field.some((u) => u?.card === id);
const units = (p: PlayerState) => p.field.filter((u): u is NonNullable<typeof u> => !!u);
const enemies = (x: PlanCtx) => units(x.op);
const maxAtk = (x: PlanCtx) => Math.max(0, ...enemies(x).map((u) => u.atk));
const topAtk = (x: PlanCtx) => enemies(x).sort((a, b) => b.atk - a.atk)[0];
const topHp = (x: PlanCtx) => enemies(x).sort((a, b) => b.hp - a.hp)[0];
const killable = (x: PlanCtx, dmg: number) => enemies(x).filter((u) => u.hp <= dmg).length;
const oppResv = (x: PlanCtx) => x.real.players[other(x.pi)].resv.filter((r) => !r.decoy).length;
const oppHidden = (x: PlanCtx) => x.real.players[other(x.pi)].resv.some((r) => !r.revealed && !r.echo);
const myPending = (x: PlanCtx) => x.me.resv.length;
const myEchoes = (x: PlanCtx) => x.me.resv.filter((r) => r.echo).length;
const hasTaunt = (p: PlayerState) => units(p).some((u) => u.taunt);
const isCard = (x: PlanCtx, ...ids: string[]) => !!x.cardId && ids.includes(x.cardId);
const heal = (x: PlanCtx) => isCard(x, 'rewind', 'e_pray');
const handCards = (x: PlanCtx) => x.me.hand.map((h) => h.card);
/** Next great bell (16, 32) at or after the clock, or null. */
const nextGreat = (t: number) => [16, 32].find((b) => b > t) ?? null;
const isEchoSpell = (id: string) => { const d = cardDef(id); return d.kind === 'spell' && (!!d.echo?.length || !!d.resvText); };
const bellUnits = (p: PlayerState) => units(p).filter((u) => !!cardDef(u.card).bell).length;
const notReadyAtk = (x: PlanCtx, min: number) => units(x.me).filter((u) => u.readyAt > x.me.time && u.atk >= min).length;
const openLanes = (x: PlanCtx) => x.me.field.filter((u, l) => u && attackTarget(x.s, x.pi, l) === null).length;
/** Lanes a summon from `a` would go to that face no enemy (so its attacks reach the base). */
const facesEmpty = (x: PlanCtx, lane: number) => !x.op.field[lane] && attackTarget(x.s, x.pi, lane) === null;
const exactSlash = (x: PlanCtx) => { const t = topAtk(x); return !!t && 1 + x.x >= t.hp && 1 + (x.x - 1) < t.hp; };
const burnLimit = (x: PlanCtx, limit: number, reserveLimit: number) =>
  isCard(x, 'bolt') && x.op.hp > (x.reserve ? reserveLimit : limit) && worldTime(x.s) < RULES.DOOM_AT ? -1.5 : 0;

type Rule = (x: PlanCtx) => number;
/** Board-clearing cards and the damage they deal to every enemy unit. */
const SWEEP: Record<string, number> = { collapse: 2, dragon: 2, e_storm: 1, e_atra: 1, g_quake: 2, g_gearstorm: 1, g_maze: 1 };
const sweepRule = (bonus: number, bad: number): Rule => (x) => {
  if (!x.cardId || !(x.cardId in SWEEP)) return 0;
  const n = killable(x, SWEEP[x.cardId] + (x.reserve ? 1 : 0));
  return n >= 2 ? bonus : bad;
};
const breakerRule: Rule = (x) => (isCard(x, 'breaker', 'e_break') && oppResv(x) === 0 ? -4 : 0);
const rushRule = (b: number): Rule => (x) => (x.card?.rush && x.a.t !== 'reserve' && rushActive(x.s, x.pi) ? b : 0);
const hasteRule = (big: number, bad: number, minUnits: (x: PlanCtx) => boolean): Rule => (x) => (isCard(x, 'haste') && !x.reserve ? (minUnits(x) ? big : bad) : 0);

export const PLANS: Record<string, Rule[]> = {
  oracle: [
    (x) => (x.reserve && x.card?.kind === 'spell' ? 1.0 : 0),
    (x) => (isCard(x, 'oracle') ? (oppHidden(x) ? 2 : -1) : 0),
    (x) => (isCard(x, 'stop', 'delayer') && bellPush(x) ? 1.0 : 0),
    breakerRule,
  ],
  p_titan: [
    (x) => (x.a.t === 'play' && x.card?.keywords?.includes('taunt') && !hasTaunt(x.me) ? 2 : 0),
    (x) => (isCard(x, 'e_colossus') && x.a.t === 'play' && !hasTaunt(x.me) ? (x.x === 3 ? 1.5 : -0.5) : 0),
    (x) => (isCard(x, 'e_pray') ? (x.me.hp <= 10 ? 1.5 : x.me.hp >= 13 ? -2 : 0) : 0),
    (x) => (isCard(x, 'titan') && x.op.time - x.me.time < 3 ? -2 : 0),
  ],
  balance: [
    sweepRule(2.5, -2),
    (x) => (isCard(x, 'cage') && maxAtk(x) >= 4 ? 1 : 0),
    (x) => (isCard(x, 'insight') && x.me.hand.length - 1 <= 2 ? 1 : 0),
  ],
  rush: [
    (x) => (x.a.t === 'play' && x.card!.cost <= 2 ? 1.5 : 0),
    hasteRule(3, -1, (x) => x.me.field.filter((u, l) => u && u.readyAt > x.me.time && attackTarget(x.s, x.pi, l) === null).length >= 2),
    (x) => burnLimit(x, 4, 5),
    (x) => (isCard(x, 'lancer') && x.a.t === 'play' && !!x.op.field[x.a.lane]?.taunt ? 1 : 0),
  ],
  titan: [
    (x) => (isCard(x, 'warden') && x.a.t === 'play' && x.a.lane === 1 ? 1.5 : 0),
    (x) => (isCard(x, 'rewind') && (x.me.hp <= 11 || x.me.hand.length - 1 <= 2) ? 1.5 : 0),
    (x) => (isCard(x, 'titan') && maxAtk(x) < 3 ? 2 : 0),
    breakerRule,
  ],
  g_quiet: [
    (x) => (isCard(x, 'g_silence', 'g_hush') ? (x.real.players[other(x.pi)].resv.length >= 2 ? 2 : x.real.players[other(x.pi)].resv.length === 0 ? -2 : 0) : 0),
    (x) => (isCard(x, 'g_erase') && x.real.players[other(x.pi)].resv.length >= 2 ? 3 : 0),
    (x) => (isCard(x, 'g_hammer') && (topHp(x)?.hp ?? 99) <= 4 ? 1.5 : 0),
    (x) => (isCard(x, 'g_mirror') && maxAtk(x) >= 4 ? 1.5 : 0),
  ],
  g_mid: [
    (x) => { if (x.a.t !== 'play' || !x.card?.bell) return 0; const b = nextGreat(x.me.time); return b !== null && b - x.me.time >= 4 && bellUnits(x.me) + 1 >= 2 ? 1.5 : 0; },
    (x) => (isCard(x, 'g_oiler') && notReadyAtk(x, 4) >= 1 ? 2 : 0),
    (x) => { if (!isCard(x, 'g_trap')) return 0; const t = topAtk(x); if (!t) return 0; const l = x.op.field.indexOf(t); return x.me.field[l] ? 1 : 0; },
    (x) => { if (!isCard(x, 'g_gearlord')) return 0; const b = nextGreat(x.me.time); return b !== null && b - x.me.time >= 6 ? 1.5 : 0; },
  ],
  p_balance: [
    sweepRule(2.5, -2),
    (x) => (isCard(x, 'e_slash') && x.a.t === 'cast' ? (exactSlash(x) ? 1.5 : 0) + (x.me.time + x.cost > x.op.time + 3 ? -2 : 0) : 0),
    (x) => (isCard(x, 'e_break') ? (x.reserve ? (oppResv(x) >= 2 ? 1.5 : 0) : oppResv(x) >= 1 ? 1.5 : 0) : 0),
    (x) => (isCard(x, 'e_guard') && x.a.t === 'play' && x.a.lane === 1 ? 0.5 : 0),
  ],
  charge: [
    (x) => { if (!x.card?.charge || x.reserve) return 0; const room = x.op.time + 2 - (x.me.time + x.cost - x.x); const best = Math.max(0, Math.min(x.card.charge, room)); return x.x === best ? 1.5 : x.x > best ? -1.5 : 0; },
    (x) => (isCard(x, 'e_colossus') && x.a.t === 'play' && !hasTaunt(x.me) && x.x === 3 ? 1.5 : 0),
    (x) => (isCard(x, 'e_slash') && x.a.t === 'cast' && exactSlash(x) ? 1.5 : 0),
    (x) => (heal(x) && x.me.hp <= 10 ? 1.5 : 0),
  ],
  antiv: [
    (x) => (isCard(x, 'e_break') && x.real.players[other(x.pi)].resv.length >= 1 ? 2 : 0),
    (x) => (isCard(x, 'e_peek') && oppHidden(x) ? 1.5 : 0),
    rushRule(1.5),
    (x) => { if (!isCard(x, 'e_reverse') || x.reserve) return 0; const after = x.op.time + 2 - (x.me.time + x.cost); return after >= 2 && handCards(x).some((c) => c !== 'e_reverse' && cardDef(c).rush) ? 1 : 0; },
  ],
  p_echo: [
    (x) => (x.a.t === 'play' && x.card?.hook?.startsWith('resonate') && handCards(x).some(isEchoSpell) ? 1.5 : 0),
    (x) => (isCard(x, 'e_storm', 'e_atra') && enemies(x).length >= 2 ? 2 : 0),
    (x) => (isCard(x, 'e_mage') && myPending(x) >= 2 ? 2 : 0),
    (x) => (isCard(x, 'e_eternal') && x.op.hp <= 8 ? 1.5 : 0),
  ],
  shadow: [
    (x) => (isCard(x, 'e_twin') && x.a.t === 'play' && x.me.field.filter((u, l) => !u && l !== (x.a as { lane: number }).lane).length >= 1 ? 1.5 : 0),
    hasteRule(3, -1.5, (x) => units(x.me).length >= 3),
    (x) => (isCard(x, 'e_reverse') && rushActive(x.s, x.pi) ? 1 : 0),
    (x) => { if (x.a.t !== 'attack' || x.me.field[x.a.lane]?.card !== 'ghost') return 0; return RULES.BELLS.some((b) => x.me.time >= b && x.me.time <= b + 1) ? 1 : 0; },
  ],
  p_rush: [
    rushRule(1.5),
    hasteRule(3, -1, (x) => openLanes(x) >= 2),
    (x) => burnLimit(x, 4, 5),
    (x) => (isCard(x, 'e_blade') && x.a.t === 'play' && x.x === 0 ? 0.8 : 0) + (x.a.t === 'draw' && x.op.time - x.me.time === 2 ? -1 : 0),
  ],
  g_bells: [
    (x) => { if (x.a.t !== 'play' || !x.card?.bell) return 0; const b = nextGreat(x.me.time); if (b === null) return 0; const d = b - x.me.time; return d >= 3 && d <= 6 && bellUnits(x.me) + 1 >= 2 ? 2 : 0; },
    (x) => { if (x.a.t !== 'draw' && x.card?.kind !== 'spell') return 0; const b = nextGreat(x.me.time); const c = timeCost(x.s, x.pi, x.a); return b !== null && x.me.time + c >= b && bellUnits(x.me) >= 2 ? 1 : 0; },
    (x) => (isCard(x, 'g_resonance') && bellUnits(x.me) >= 1 ? 2 : 0),
    (x) => (isCard(x, 'g_seres') ? 0.5 : 0),
  ],
  g_maze: [
    (x) => (x.a.t === 'move' && !!x.op.field[x.a.lane] && !x.me.field[x.a.to] && facesEmpty(x, x.a.to) ? 2 : 0),
    (x) => (isCard(x, 'g_flanker') && x.a.t === 'play' && facesEmpty(x, x.a.lane) ? 1.5 : 0),
    (x) => { if (x.a.t !== 'move' || !x.me.field[x.a.to]) return 0; return x.me.field[x.a.lane]?.card === 'g_flanker' && facesEmpty(x, x.a.to) ? 0 : -1; },
    (x) => (isCard(x, 'g_architect') && units(x.me).length >= 3 ? 1.5 : 0),
  ],
  control: [
    (x) => (isCard(x, 'e_peek') && oppHidden(x) ? 2 : 0),
    breakerRule,
    sweepRule(2.5, -1.5),
  ],
  burn: [
    (x) => { if (!isCard(x, 'bolt', 'e_eternal', 'arrow', 'e_shot')) return 0; return burnReach(x) >= x.op.hp && (isCard(x, 'bolt', 'e_eternal') || enemies(x).length === 0) ? 3 : 0; },
    (x) => (isCard(x, 'arrow', 'e_shot') && enemies(x).length === 0 ? 1.5 : 0),
    (x) => (x.a.t === 'play' && x.card?.keywords?.includes('taunt') && x.a.lane === 1 ? 0.5 : 0),
    (x) => (heal(x) && x.me.hp <= 9 ? 2 : 0),
  ],
  reso: [
    (x) => (x.a.t === 'play' && x.card?.hook?.startsWith('resonate') && !units(x.me).some((u) => cardDef(u.card).hook?.startsWith('resonate')) ? 2.5 : 0),
    (x) => (x.reserve && units(x.me).some((u) => cardDef(u.card).hook?.startsWith('resonate')) ? 1.5 : 0),
    (x) => (isCard(x, 'e_mage') && myPending(x) >= 2 ? 2 : 0),
  ],
  lock: [
    (x) => { const n = clockPush(x); return n && x.op.time + n - (x.me.time + x.cost) >= 3 ? 1.5 : 0; },
    (x) => { if (!isCard(x, 'cage')) return 0; const t = topAtk(x); return t && t.readyAt - x.op.time <= 2 ? 2 : 0; },
    (x) => (isCard(x, 'bolt') && x.reserve ? 1 : 0),
  ],
  verna: [
    (x) => { if (has(x.me, 'e_verna') || !handCards(x).includes('e_verna') || !x.cardId || !isEchoSpell(x.cardId)) return 0; return handCards(x).filter(isEchoSpell).length <= 1 ? -1.5 : 0; },
    (x) => (has(x.me, 'e_verna') && x.cardId && isEchoSpell(x.cardId) ? 2 : 0),
  ],
};

/** How far a move pushes the opponent's clock right now (0 for anything else or a reservation). */
function clockPush(x: PlanCtx): number {
  if (x.reserve || !x.cardId) return 0;
  return x.cardId === 'stop' ? 3 : x.cardId === 'e_reverse' ? 2 : x.cardId === 'delayer' ? 1 : 0;
}
/** 鐘を押し出す: the push carries the opponent's clock over a bell without ringing it (they lose that draw). */
function bellPush(x: PlanCtx): boolean {
  const n = clockPush(x);
  if (!n) return false;
  const t = x.op.time;
  return RULES.BELLS.some((b) => t < b && t + n >= b && b - t <= 3);
}
/** Damage the hand can put on the opponent's base (the burn deck's count). */
function burnReach(x: PlanCtx): number {
  const empty = enemies(x).length === 0;
  return handCards(x).reduce((n, c) => n + (c === 'bolt' ? 4 : c === 'e_eternal' ? 2 : (c === 'arrow' && empty) ? 2 : (c === 'e_shot' && empty) ? 1 : 0), 0)
    + x.me.resv.filter((r) => r.card === 'bolt').length * 5;
}

/** Rules every deck shares (used at the 'all' scale). */
const SHARED: Rule[] = [
  (x) => (bellPush(x) ? 1.5 : 0),
  (x) => (x.cardId && cardDef(x.cardId).echo?.length && myEchoes(x) >= RULES.MAX_ECHO ? -3 : 0),
  (x) => (x.a.t === 'play' && x.card?.keywords?.includes('taunt') && x.a.lane === 1 ? 0.8 : 0),
];

export function planCtx(s: GameState, real: GameState, pi: PlayerIndex, a: Action): PlanCtx {
  const me = s.players[pi], op = s.players[other(pi)];
  const hand = 'hand' in a ? me.hand.find((h) => h.uid === a.hand) : undefined;
  const cardId = hand?.card;
  return {
    s, real, pi, a, me, op, cardId, card: cardId ? cardDef(cardId) : undefined,
    cost: timeCost(s, pi, a), x: 'x' in a ? a.x ?? 0 : 0, reserve: a.t === 'reserve',
  };
}

// ------------------------------------------------------------------ 相手別 (Lv9+, once the opponent's deck is guessed)
const listOf = (id: string) => knownDecks().find((d) => d.id === id)?.cards ?? [];
const BEAT = new Set(['p_rush', 'antiv', 'rush', 'shadow', 'g_maze']);
const RESV_HEAVY = new Set(['verna', 'reso', 'lock', 'burn', 'oracle', 'g_quiet']);
const hasAny = (id: string, cards: string[]) => listOf(id).some((c) => cards.includes(c));
const breaks = (id: string) => hasAny(id, ['e_break', 'breaker', 'g_erase', 'g_silence', 'g_hush']);
const sweeps = (id: string) => hasAny(id, ['collapse', 'e_storm', 'dragon', 'e_atra', 'g_quake', 'g_gearstorm']);
const stacking = (x: PlanCtx) => x.reserve && x.me.resv.filter((r) => !r.echo && !r.decoy).length >= 1;
type Matchup = (x: PlanCtx, opp: string) => number;
const SPREAD: Matchup = (x, o) => (breaks(o) && stacking(x) ? -1.5 : 0);
export const MATCHUPS: Record<string, Matchup[]> = {
  control: [
    (x, o) => (BEAT.has(o) && x.cardId && x.cardId in SWEEP && enemies(x).length < 2 ? -1.5 : 0),
    (x, o) => (RESV_HEAVY.has(o) && isCard(x, 'e_break', 'breaker') ? 1.5 : 0),
  ],
  reso: [SPREAD],
  verna: [SPREAD],
  p_echo: [SPREAD],
  lock: [(x, o) => { const n = clockPush(x); return (BEAT.has(o) || o === 'p_rush') && n && x.op.time + n - (x.me.time + x.cost) >= 4 ? -1.5 : 0; }],
  shadow: [(x, o) => (sweeps(o) && x.a.t === 'play' && units(x.me).length >= 3 && !handCards(x).includes('haste') ? -1 : 0)],
  antiv: [(x, o) => (!RESV_HEAVY.has(o) && isCard(x, 'e_break') ? -2 : 0)],
  burn: [(x, o) => (BEAT.has(o) && heal(x) && x.me.hp <= 11 ? 1 : 0)],
  titan: [(x, o) => (BEAT.has(o) && x.a.t === 'play' && x.card?.keywords?.includes('taunt') ? 1 : 0)],
  p_titan: [(x, o) => (BEAT.has(o) && x.a.t === 'play' && x.card?.keywords?.includes('taunt') ? 1 : 0)],
  charge: [(x, o) => (BEAT.has(o) && x.a.t === 'play' && x.card?.keywords?.includes('taunt') ? 1 : 0)],
};

/** The deck's plan bonus for move `a` (0 for decks without a plan). `opp`: the opponent's guessed deck (Lv9+). */
export function planBonus(deck: string, scale: PlanScale, s: GameState, real: GameState, pi: PlayerIndex, a: Action, opp: string | null = null): number {
  const rules = PLANS[deck];
  if (!rules && scale !== 'all') return 0;
  const x = planCtx(s, real, pi, a);
  if (scale !== 'all') return rules ? rules[0](x) * (scale === 'half' ? 0.5 : 1) : 0;
  let v = 0;
  for (const r of rules ?? []) v += r(x);
  for (const r of SHARED) v += r(x);
  if (opp) for (const m of MATCHUPS[deck] ?? []) v += m(x, opp);
  return v;
}
