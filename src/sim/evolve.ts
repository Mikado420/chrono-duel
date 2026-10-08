/**
 * 毎日の改良と発見 (仕様書「デッキ構築の学習」): candidate lists for an archetype, paired simulations against the
 * players' deck mix, the play-pattern check against the 設計図, and grouping players' lists into new decks and 型.
 * Pure (no network): src/sim/daily.ts feeds it the server's tables and publishes the result.
 */
import { chooseAction, type AiLevel } from '../core/ai';
import { CARD_LIST, cardDef } from '../core/cards';
import { actor, apply, createGame, mulberry32, worldTime, type PlayerIndex } from '../core/engine';
import { RULES } from '../core/rules';
import { BLUEPRINTS, ROLE_CARDS, SAME_GROUP, checkList, checkPlay, classify, originList, shared, sizeRole, type PlayProfile } from '../meta/blueprints';

// ------------------------------------------------------------------ candidates
/** The roles a card plays (its size for units, and its function roles). */
export function cardRoles(id: string): string[] {
  const out = Object.entries(ROLE_CARDS).filter(([, ids]) => ids.includes(id)).map(([k]) => k);
  const s = sizeRole(id);
  if (s) out.push(s);
  return out;
}
const collectible = () => CARD_LIST.filter((c) => !c.token).map((c) => c.id);
const maxCopies = (id: string) => (cardDef(id).rarity === 'L' ? RULES.MAX_LEGEND_COPIES : RULES.MAX_COPIES);
/** Cards of `cards` that are not part of the archetype's core (one entry per copy that may go). */
export function flexCards(arche: string, cards: string[]): string[] {
  const left = { ...BLUEPRINTS[arche].core };
  const out: string[] = [];
  for (const c of cards) { if ((left[c] ?? 0) > 0) left[c]--; else out.push(c); }
  return out;
}
/** Every list one card away from `cards` that keeps the swapped card's role and passes the 設計図. */
export function oneSwaps(arche: string, cards: string[]): string[][] {
  const pool = collectible();
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const out1 of new Set(flexCards(arche, cards))) {
    const roles = cardRoles(out1);
    for (const in1 of pool) {
      if (in1 === out1 || !cardRoles(in1).some((r) => roles.includes(r))) continue;
      const next = cards.slice();
      next[next.indexOf(out1)] = in1;
      if (next.filter((c) => c === in1).length > maxCopies(in1)) continue;
      const key = [...next].sort().join();
      if (seen.has(key) || checkList(arche, next).length) continue;
      seen.add(key);
      out.push(next);
    }
  }
  return out;
}
/**
 * Up to `n` candidates: one-card swaps, plus two-card swaps (a swap on top of another) when there is room. The day's
 * seed picks which ones, so different days try different ideas.
 */
export function candidates(arche: string, cards: string[], n: number, seed: number): string[][] {
  const r = mulberry32(seed);
  const shuffle = <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const ones = shuffle(oneSwaps(arche, cards));
  const out = ones.slice(0, Math.ceil(n * 0.7));
  for (const a of ones.slice(0, 6)) {
    if (out.length >= n) break;
    for (const b of shuffle(oneSwaps(arche, a)).slice(0, 3)) {
      if (out.length >= n) break;
      if (RULES.DECK_SIZE - shared(cards, b) === 2 && !checkList(arche, b).length) out.push(b);
    }
  }
  return out.slice(0, n);
}

// ------------------------------------------------------------------ simulation
export interface Opp { id: string; cards: string[]; w: number }
export interface GameOut { score: number; end: number; ko: boolean; dmg20: number; atk: number; resv: number; cast: number; hpEnd: number }
/** One game: `cards` against `opp`, seat and first player from the seed, both sides at `level`. */
export function playOne(cards: string[], opp: string[], seed: number, level: AiLevel = 'hard'): GameOut {
  const me = (seed % 2) as PlayerIndex;
  const { state } = createGame(me === 0 ? [cards, opp] : [opp, cards], seed, ((seed >> 1) % 2) as PlayerIndex);
  const rand = mulberry32(seed * 7 + 1);
  const o: GameOut = { score: 0, end: 0, ko: false, dmg20: 0, atk: 0, resv: 0, cast: 0, hpEnd: 0 };
  let d20: number | null = null;
  for (let k = 0; !state.over && k < 500; k++) {
    const pi = actor(state);
    if (pi === -1) break;
    for (const e of apply(state, chooseAction(state, pi, level, rand))) {
      if (!('pi' in e) || e.pi !== me) continue;
      if (e.e === 'attack') o.atk++;
      else if (e.e === 'reserve') o.resv++;
      else if (e.e === 'cast') o.cast++;
    }
    if (d20 === null && worldTime(state) >= 20) d20 = RULES.BASE_HP - state.players[1 - me].hp;
  }
  const w = state.over?.winner ?? -1;
  o.score = w === me ? 1 : w === -1 ? 0.5 : 0;
  o.ko = w === me && state.over?.reason === 'ko';
  o.dmg20 = d20 ?? RULES.BASE_HP - state.players[1 - me].hp;
  o.end = Math.min(RULES.END, worldTime(state));
  o.hpEnd = state.players[me].hp;
  return o;
}
/** The opponents of game i: drawn by weight with the game's own seed, so two lists face the same games. */
function oppFor(opps: Opp[], seed: number): Opp {
  const sum = opps.reduce((a, o) => a + o.w, 0);
  let x = mulberry32(seed * 13 + 5)() * sum;
  for (const o of opps) { if (x < o.w) return o; x -= o.w; }
  return opps[opps.length - 1];
}
export interface Paired { n: number; base: number; cand: number; diff: number; se: number }
/** `n` games each for `base` and `cand` on the same seeds and opponents: the score difference and its standard error. */
export function paired(base: string[], cand: string[], opps: Opp[], n: number, seed0: number, level: AiLevel = 'hard'): Paired {
  let sb = 0, sc = 0;
  const ds: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    const o = oppFor(opps, seed);
    const b = playOne(base, o.cards, seed, level).score, c = playOne(cand, o.cards, seed, level).score;
    sb += b; sc += c; ds.push(c - b);
  }
  const mean = ds.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, base: sb / n, cand: sc / n, diff: mean, se: sd / Math.sqrt(n) };
}
/** The play numbers of a list as the 設計図 measured them: against every archetype's first list, at 'hard'. */
export function playProfile(cards: string[], n: number, seed0: number, self: string): PlayProfile & { cast: number } {
  const opps = Object.keys(BLUEPRINTS).filter((id) => id !== self).map((id) => originList(id)!).filter((c) => c && c.every((x) => { try { cardDef(x); return true; } catch { return false; } }));
  let end = 0, koW = 0, wins = 0, dmg = 0, atk = 0, resv = 0, cast = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const o = playOne(cards, opps[i % opps.length], seed0 + i * 104729);
    end += o.end; dmg += o.dmg20; atk += o.atk; resv += o.resv; cast += o.cast; hp += o.hpEnd;
    if (o.score === 1) { wins++; if (o.ko) koW++; }
  }
  const r1 = (x: number) => Math.round((x / n) * 10) / 10;
  return { end: r1(end), koShare: wins ? Math.round((100 * koW) / wins) : 0, dmg20: r1(dmg), atk: r1(atk), resv: r1(resv), cast: r1(cast), hpEnd: r1(hp) };
}

export interface Pick { cards: string[]; diff: number; se: number; play: PlayProfile & { cast: number }; why: string }
/**
 * The day's improvement for one book entry, or null. `mode` 'hi' (Lv8–10): the best list that wins at least 2 points
 * more with the lower end of its 95% range above 0. 'lo' (Lv1–7): a list as strong as the current one (within ±2
 * points) that uses a card the current list does not — new, not stronger. Both must keep the 設計図's play pattern.
 */
export function improve(arche: string, cur: string[], opps: Opp[], mode: 'hi' | 'lo', o: { candidates: number; screen: number; confirm: number; profile: number; seed: number; log?: (s: string) => void }): Pick | null {
  const log = o.log ?? (() => {});
  const cands = candidates(arche, cur, o.candidates, o.seed);
  log(`${arche} ${mode}: ${cands.length} candidates`);
  const screened = cands.map((c) => ({ c, p: paired(cur, c, opps, o.screen, o.seed) }));
  const order = mode === 'hi'
    ? screened.filter((x) => x.p.diff > 0).sort((a, b) => b.p.diff - a.p.diff)
    : screened.filter((x) => Math.abs(x.p.diff) <= 0.04).sort((a, b) => Math.abs(a.p.diff) - Math.abs(b.p.diff));
  for (const x of order.slice(0, 3)) {
    const p = paired(cur, x.c, opps, o.confirm, o.seed + 1_000_003);
    const ok = mode === 'hi' ? p.diff >= 0.02 && p.diff - 1.96 * p.se > 0 : Math.abs(p.diff) <= 0.02;
    log(`  ${diffText(cur, x.c)}: ${(p.diff * 100).toFixed(1)}±${(p.se * 196).toFixed(1)} ${ok ? 'ok' : 'no'}`);
    if (!ok) continue;
    const play = playProfile(x.c, o.profile, o.seed + 2_000_003, arche);
    const bad = checkPlay(arche, play);
    if (bad.length) { log(`  play: ${bad.join(', ')}`); continue; }
    return { cards: x.c, diff: p.diff, se: p.se, play, why: diffText(cur, x.c) };
  }
  return null;
}
/** "A → B" for the cards that changed. */
export function diffText(a: string[], b: string[]): string {
  const left = [...a], add: string[] = [];
  for (const c of b) { const i = left.indexOf(c); if (i >= 0) left.splice(i, 1); else add.push(c); }
  const nm = (id: string) => { try { return cardDef(id).name; } catch { return id; } };
  return `${left.map(nm).join('・')} → ${add.map(nm).join('・')}`;
}

// ------------------------------------------------------------------ discovery
export interface ListRow { cards: string[]; g: number; s: number; e: number; first: string; last: string; arche: string | null; players: number }
export interface Group { center: string[]; lists: ListRow[]; players: number; games: number; first: string; last: string; score: number }
/** Greedy grouping: each list joins the first group whose center it shares at least 12 cards with (most played first). */
export function group(rows: ListRow[]): Group[] {
  const gs: Group[] = [];
  for (const r of [...rows].sort((a, b) => b.g - a.g)) {
    const g = gs.find((x) => shared(x.center, r.cards) >= SAME_GROUP);
    if (g) { g.lists.push(r); g.games += r.g; g.players += r.players; g.score += r.s - r.e; if (r.first < g.first) g.first = r.first; if (r.last > g.last) g.last = r.last; }
    else gs.push({ center: r.cards, lists: [r], players: r.players, games: r.g, first: r.first, last: r.last, score: r.s - r.e });
  }
  return gs;
}
const dayGap = (a: string, b: string) => (Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86_400_000;
export interface NewDeck { core: Record<string, number>; flex: string[]; center: string[]; players: number; games: number; days: number; strength: number; name: string }
/**
 * New decks: groups of 未分類 lists used by 15+ players over 100+ games and 3+ days. Core = cards in 80%+ of the
 * group's lists, flex = 30–80%. Players are summed over lists (an upper bound: one player may use two lists).
 */
export function findNewDecks(rows: ListRow[], min = { players: 15, games: 100, days: 3 }): NewDeck[] {
  return group(rows.filter((r) => !r.arche)).filter((g) => g.players >= min.players && g.games >= min.games && dayGap(g.first, g.last) + 1 >= min.days).map((g) => {
    const n = g.lists.length;
    const has = (c: string, k: number) => g.lists.filter((l) => l.cards.filter((x) => x === c).length >= k).length / n;
    const core: Record<string, number> = {};
    const flex: string[] = [];
    for (const c of new Set(g.lists.flatMap((l) => l.cards))) {
      for (let k = 2; k >= 1; k--) {
        const f = has(c, k);
        if (f >= 0.8) { core[c] = Math.max(core[c] ?? 0, k); break; }
        if (k === 1 && f >= 0.3) flex.push(c);
      }
    }
    const nm = (id: string) => { try { return cardDef(id).name; } catch { return id; } };
    const top = Object.keys(core).sort((a, b) => cardDef(b).cost - cardDef(a).cost).slice(0, 2).map(nm);
    return { core, flex, center: g.center, players: g.players, games: g.games, days: dayGap(g.first, g.last) + 1, strength: g.score / g.games, name: `${top.join('・')}軸` };
  });
}
export interface Variant { arche: string; cards: string[]; differs: string[]; players: number; games: number; strength: number }
/** 型: within an archetype, groups of lists 3+ cards away from its first list, each used by 8+ players over 50+ games. */
export function findVariants(rows: ListRow[], min = { players: 8, games: 50 }): Variant[] {
  const out: Variant[] = [];
  for (const arche of Object.keys(BLUEPRINTS)) {
    const o = originList(arche);
    if (!o) continue;
    const mine = rows.filter((r) => r.arche === arche && RULES.DECK_SIZE - shared(o, r.cards) >= 3);
    // a 型 is tighter than an archetype: lists sharing 17 of 20 cards
    const gs: Group[] = [];
    for (const r of [...mine].sort((a, b) => b.g - a.g)) {
      const g = gs.find((x) => shared(x.center, r.cards) >= 17);
      if (g) { g.lists.push(r); g.games += r.g; g.players += r.players; g.score += r.s - r.e; }
      else gs.push({ center: r.cards, lists: [r], players: r.players, games: r.g, first: r.first, last: r.last, score: r.s - r.e });
    }
    for (const g of gs) if (g.players >= min.players && g.games >= min.games) {
      out.push({ arche, cards: g.center, differs: diffText(o, g.center).split(' → '), players: g.players, games: g.games, strength: g.score / g.games });
    }
  }
  return out;
}
export { classify };
