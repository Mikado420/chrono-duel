/**
 * 環境Tier（実戦）: the deck types' strength in real games, worked out every day by the daily tools from the server's
 * environment tables (src/server/env.ts) and published for the strategy wiki (POST /api/wiki).
 *
 * Every game counts for the deck type of each side: the players' lists (classified to the nearest known list), the
 * rated rivals' lists and both sides of online games.
 * - People: the win rate against the rivals of their rank (the same Lv for everyone there) is compared with the win rate
 *   of all the decks played in that rank. Ratings are not used here: a player's rating already holds the strength of the
 *   deck that earned it, so it would cancel the very thing measured.
 * - Rivals: result − expected result (from the rating gap), against the average of all rival decks.
 * - Online games: against 50%.
 * The sum is shrunk towards 0 by a few games, so a type with little data stays near the middle. Then the share of the
 * games people play with the type in the upper ranks (刻聖 and up) is added: the strongest players all choosing a deck
 * says it is strong even when no other deck is left there to compare it with.
 *
 * Nothing here may point at a person: only deck ids, deck types and counts (the rivals' names never reach it).
 */
import { ROSTER_DECKS, canonDeck } from '../sim/rosterDecks';
import type { StatsAgg } from '../server/statsCore';

export type TierMark = 'S' | 'A' | 'B' | 'C';
export const TIER_MARKS: TierMark[] = ['S', 'A', 'B', 'C'];
/** Games needed before a type gets a mark (fewer: 集計中). */
export const TIER_MIN_GAMES = 20;
/** Games the strength is shrunk by (perf = (score − expected) / (games + this)). */
export const TIER_SHRINK = 30;
/** Games a rank's own average is leaned towards the average of all people by. */
export const BAND_LEAN = 100;
/** Points added per 100% of the upper ranks' games (刻聖 and up) played with a type. */
export const USE_K = 10;
/** The upper ranks whose choices count, and the games they need before they do. */
export const UPPER_BANDS = ['sei', 'shin', 'shin2', 'shin3', 'shin4', 'shin5'];
export const USE_MIN_GAMES = 30;
/** Lower bounds of S, A and B in points (C is the rest). */
export const TIER_CUTS: [number, number, number] = [4, 1.5, -1.5];

/** The deck types in the order of the roster (アグロ → ループ・コンボ). */
export const DECK_TYPES: string[] = [...new Set(ROSTER_DECKS.map((d) => d.type))];
/** Archetypes from before the roster (the starter decks and older lists players still bring) and the type they belong to. */
const OLD_TYPE: Record<string, string> = {
  rush: '秒針 アグロ', p_rush: '急襲 アグロ', antiv: '急襲 アグロ', shadow: '影法師 アグロ',
  lock: '牢獄 コントロール', burn: '籠城 バーン', control: '破約 コントロール',
  balance: '槍兵 ビート', p_balance: '槍兵 ビート', oracle: '予約狩り ビート',
  titan: '巨像 コントロール', p_titan: '巨像 コントロール', charge: '充填 ビート',
  verna: 'ヴェルナ ループ', reso: '共鳴 コンボ', p_echo: '共鳴 コンボ',
};
const TYPE_OF = new Map(ROSTER_DECKS.map((d) => [d.id, d.type]));
/** The deck type of a deck id (a roster build, an old id or an older archetype), or null when it has none. */
export function deckType(id: string): string | null {
  const c = canonDeck(id);
  return TYPE_OF.get(c) ?? OLD_TYPE[c] ?? null;
}
/** The roster build of a deck id, or null (older archetypes have no build). */
export const deckBuild = (id: string): string | null => (TYPE_OF.has(canonDeck(id)) ? canonDeck(id) : null);

/** What POST /api/env returns (the parts used here). */
export interface EnvCellLite { games: number; players: number; score: number; expected: number }
export interface EnvTables { days: [string, string]; bands: Record<string, Record<string, EnvCellLite>>; rivals: Record<string, EnvCellLite>; friends: Record<string, [number, number]> }

/** [games, score, expected]. */
export type Rec3 = [number, number, number];
export interface TierRow {
  type: string;
  /** null while the type has fewer than TIER_MIN_GAMES games. */
  tier: TierMark | null;
  /** The mark in the snapshot before (undefined: no snapshot before; null: it had no mark). */
  was?: TierMark | null;
  /** All games, played by people (rated and online) and by the rivals: [games, score, expected] (expected with the side's average added). */
  all: Rec3;
  human: Rec3;
  ai: Rec3;
  /** People who played the type (added over the ranks, so one person may count twice). */
  players: number;
  /** Strength in points: (score − expected) / (games + TIER_SHRINK) × 100, plus USE_K × the upper ranks' share. */
  perf: number;
  /** % of the people's games in the upper ranks (刻聖 and up) played with the type (0 while they have too few). */
  use?: number;
  /** Per roster build of the type: [games, score, expected]. */
  builds: Record<string, Rec3>;
}
export interface TierSnapshot {
  v: 1;
  /** The day it was worked out (YYYY-MM-DD, Japan time). */
  date: string;
  /** The days it covers (YYYYMMDD, from the environment tables). */
  days: [string, string];
  /** The date of the snapshot the `was` marks come from. */
  prevDate?: string;
  rows: TierRow[];
  /** Per rank id: games people played with each type (rated play). */
  bands: Record<string, Record<string, number>>;
  /** Per card: [% of the players' rated and online games with it in the deck, those games] (the card ranking's daily part). */
  cards?: Record<string, [number, number]>;
}

/** The modes whose decks say what people choose to play (not free play against an easy AI). */
const CHOICE_MODES = ['rated', 'online'];
/** How often each card is in the players' decks, from the newest version's play statistics. */
export function cardAdoption(agg: StatsAgg | null | undefined): Record<string, [number, number]> {
  if (!agg) return {};
  const games = CHOICE_MODES.reduce((a, m) => a + (agg.games[m]?.[0] ?? 0), 0);
  if (!games) return {};
  const out: Record<string, [number, number]> = {};
  for (const [id, byMode] of Object.entries(agg.cards)) {
    const n = CHOICE_MODES.reduce((a, m) => a + (byMode[m]?.[0] ?? 0), 0);
    out[id] = [Math.round((1000 * n) / games) / 10, games];
  }
  return out;
}

const add = (r: Rec3, g: number, s: number, e: number) => { r[0] += g; r[1] += s; r[2] += e; };
export const perfOf = (r: Rec3) => (100 * (r[1] - r[2])) / (r[0] + TIER_SHRINK);
export function markOf(games: number, perf: number): TierMark | null {
  if (games < TIER_MIN_GAMES) return null;
  return perf >= TIER_CUTS[0] ? 'S' : perf >= TIER_CUTS[1] ? 'A' : perf >= TIER_CUTS[2] ? 'B' : 'C';
}

/** Works out today's tier list from the environment tables; `prev` (the last published snapshot of another day) gives the arrows. */
export function computeTier(env: EnvTables, date: string, prev?: TierSnapshot | null): TierSnapshot {
  // each side's average result − expected per game (people, rivals), taken off every game of that side
  const avg = (cells: { games: number; score: number; expected: number }[]) => {
    const g = cells.reduce((a, c) => a + c.games, 0);
    return g ? cells.reduce((a, c) => a + c.score - c.expected, 0) / g : 0;
  };
  const known = <T extends { games: number }>(o: Record<string, T>) => Object.entries(o).filter(([id, c]) => deckType(id.replace(/@\d+$/, '')) && c.games).map(([, c]) => c);
  // people: each rank's win rate (leaning on all people's for a small rank)
  const win = (cs: { games: number; score: number }[]) => [cs.reduce((a, c) => a + c.score, 0), cs.reduce((a, c) => a + c.games, 0)];
  const [sAll, gAll] = win(Object.values(env.bands ?? {}).flatMap((t) => known(t)));
  const winAll = gAll ? sAll / gAll : 0.5;
  const winBand: Record<string, number> = {};
  for (const [band, tab] of Object.entries(env.bands ?? {})) { const [sb, gb] = win(known(tab)); winBand[band] = (sb + BAND_LEAN * winAll) / (gb + BAND_LEAN); }
  const aAi = avg(known(env.rivals ?? {}));
  const rows = new Map<string, TierRow>();
  const row = (type: string) => {
    let r = rows.get(type);
    if (!r) { r = { type, tier: null, all: [0, 0, 0], human: [0, 0, 0], ai: [0, 0, 0], players: 0, perf: 0, builds: {} }; rows.set(type, r); }
    return r;
  };
  const build = (r: TierRow, id: string, g: number, s: number, e: number) => { const b = deckBuild(id); if (b) add((r.builds[b] ??= [0, 0, 0]), g, s, e); };
  const bands: Record<string, Record<string, number>> = {};
  for (const [band, tab] of Object.entries(env.bands ?? {})) {
    for (const [id, c] of Object.entries(tab)) {
      const t = deckType(id);
      if (!t || !c.games) continue;
      const r = row(t), e = winBand[band] * c.games;
      add(r.all, c.games, c.score, e); add(r.human, c.games, c.score, e); build(r, id, c.games, c.score, e);
      r.players += c.players;
      (bands[band] ??= {})[t] = (bands[band][t] ?? 0) + c.games;
    }
  }
  for (const [key, c] of Object.entries(env.rivals ?? {})) {
    const id = key.replace(/@\d+$/, '');
    const t = deckType(id);
    if (!t || !c.games) continue;
    const r = row(t), e = c.expected + aAi * c.games;
    add(r.all, c.games, c.score, e); add(r.ai, c.games, c.score, e); build(r, id, c.games, c.score, e);
  }
  for (const [key, [g, sx]] of Object.entries(env.friends ?? {})) {
    const [x, y] = key.split('|');
    const tx = deckType(x), ty = deckType(y);
    if (tx) { const r = row(tx); add(r.all, g, sx, g / 2); add(r.human, g, sx, g / 2); build(r, x, g, sx, g / 2); }
    if (ty) { const r = row(ty); add(r.all, g, g - sx, g / 2); add(r.human, g, g - sx, g / 2); build(r, y, g, g - sx, g / 2); }
  }
  const was = new Map((prev?.rows ?? []).map((r) => [r.type, r.tier]));
  const out = DECK_TYPES.map((t) => row(t));
  const upper = UPPER_BANDS.reduce((a, b) => a + Object.values(bands[b] ?? {}).reduce((x, y) => x + y, 0), 0);
  for (const r of out) {
    r.use = upper >= USE_MIN_GAMES ? Math.round((1000 * UPPER_BANDS.reduce((a, b) => a + (bands[b]?.[r.type] ?? 0), 0)) / upper) / 10 : 0;
    r.perf = Math.round((perfOf(r.all) + (USE_K * r.use) / 100) * 10) / 10;
    r.tier = markOf(r.all[0], r.perf);
    if (prev) r.was = was.get(r.type) ?? null;
    for (const k of [r.all, r.human, r.ai, ...Object.values(r.builds)]) { k[1] = Math.round(k[1] * 100) / 100; k[2] = Math.round(k[2] * 100) / 100; }
  }
  const rank = (m: TierMark | null) => (m ? TIER_MARKS.indexOf(m) : 9);
  out.sort((a, b) => rank(a.tier) - rank(b.tier) || b.perf - a.perf || b.all[0] - a.all[0]);
  return { v: 1, date, days: env.days, prevDate: prev?.date, rows: out, bands };
}

/** A snapshot as it may be stored and shown (anything malformed is refused: null). */
export function cleanTier(x: unknown): TierSnapshot | null {
  const t = x as TierSnapshot;
  if (!t || typeof t !== 'object' || t.v !== 1 || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return null;
  if (!Array.isArray(t.rows) || t.rows.length > 60 || !Array.isArray(t.days)) return null;
  const rec = (r: unknown) => Array.isArray(r) && r.length === 3 && r.every((n) => typeof n === 'number' && Number.isFinite(n));
  for (const r of t.rows) {
    if (!r || typeof r.type !== 'string' || r.type.length > 40 || !DECK_TYPES.includes(r.type)) return null;
    if (r.tier !== null && !TIER_MARKS.includes(r.tier)) return null;
    if (r.was !== undefined && r.was !== null && !TIER_MARKS.includes(r.was)) return null;
    if (!rec(r.all) || !rec(r.human) || !rec(r.ai) || typeof r.perf !== 'number' || typeof r.players !== 'number' || (r.use !== undefined && typeof r.use !== 'number')) return null;
    if (!r.builds || typeof r.builds !== 'object' || Object.entries(r.builds).some(([k, v]) => !deckBuild(k) || !rec(v))) return null;
  }
  if (!t.bands || typeof t.bands !== 'object' || JSON.stringify(t.bands).length > 20_000) return null;
  if (t.cards !== undefined && (!t.cards || typeof t.cards !== 'object' || Object.keys(t.cards).length > 400
    || Object.entries(t.cards).some(([k, v]) => k.length > 40 || !Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))))) return null;
  return t;
}
