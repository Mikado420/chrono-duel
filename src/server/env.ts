/**
 * 環境の集計 (仕様書「デッキ構築の学習」の「まとめる」): what players play at each rating band and how it does,
 * how each version of the rivals' lists does, the distinct lists players use (for finding new decks and 型), and the
 * deck book the game loads. Everything is added to as reports arrive, split by day (JST), so a day or a week can be read.
 *
 * Strength is measured as result − expected result from the rating gap: rated opponents are AI of a known rating,
 * so a raw win rate mostly says which Lv a deck happened to meet.
 */
import { BLUEPRINTS, classify } from '../meta/blueprints';
import { cleanBook, EMPTY_BOOK, type DeckBook } from '../meta/deckbook';
import { expected, tierOf } from '../meta/rating';
import { rivalById } from '../meta/roster';
import type { GameLog } from '../core/gamelog';
import type { PlayerIndex } from '../core/engine';
import type { ApiResult, KV } from './leaderboard';

/** What a rated report adds to MatchReport (all optional: older clients do not send them). */
export interface RatedInfo {
  /** The rival's id ('rv:' + name). */
  rival?: string;
  rivalLv?: number;
  /** The archetype the rival played and the version of its list. */
  rivalDeck?: string;
  rivalDeckV?: number;
  /** The player's rating when the game started. */
  rating?: number;
}
/** [games, points, expected points] plus the (shortened) device ids that played it that day. */
export interface EnvCell { g: number; s: number; e: number; ids: string[] }
export interface DeckListRec { cards: string[]; g: number; s: number; e: number; ids: string[]; first: string; last: string; arche: string | null }

const DAY_MS = 86_400_000;
/** The day in Japan (JST, UTC+9) as YYYYMMDD. */
export const jstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, '');
/** A short fingerprint of a device id (enough to count players; the id itself is not kept here). */
const shortId = (id: string) => { let h = 2166136261; for (const ch of id) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const MAX_IDS = 400;
/** Distinct lists kept at most (the least recently played go first). */
export const MAX_LISTS = 2000;
const sig = (cards: string[]) => [...cards].sort().join(',');
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });
const addCell = (c: EnvCell | undefined, s: number, e: number, id: string): EnvCell => {
  const x = c ?? { g: 0, s: 0, e: 0, ids: [] };
  x.g++; x.s += s; x.e += e;
  const sid = shortId(id);
  if (!x.ids.includes(sid) && x.ids.length < MAX_IDS) x.ids.push(sid);
  return x;
};

export class EnvStats {
  constructor(private kv: KV, private now: () => number, private adminToken?: string) {}

  /**
   * One rated game (already checked as a report by PlayStats). Adds it to the band's table, the rival list's
   * record and the list registry. A report with missing or wrong rated fields is skipped quietly.
   */
  async rated(r: { id: string; deck: string[]; score: 0 | 0.5 | 1 } & RatedInfo): Promise<boolean> {
    const rv = typeof r.rival === 'string' ? rivalById(r.rival) : undefined;
    if (!rv || r.rivalLv !== rv.lv) return false;
    if (typeof r.rating !== 'number' || !Number.isFinite(r.rating) || r.rating < 100 || r.rating > 5000) return false;
    if (typeof r.rivalDeck !== 'string' || ![rv.deck, rv.sub, 'balance'].includes(r.rivalDeck)) return false;
    const v = Number.isInteger(r.rivalDeckV) && r.rivalDeckV! >= 1 && r.rivalDeckV! <= 100_000 ? r.rivalDeckV! : 1;
    if (r.deck.length !== 20) return false;
    const day = jstDay(this.now());
    const band = tierOf(r.rating).tier.id;
    const exp = expected(r.rating, rv.rating);
    const arche = classify(r.deck) ?? 'other';
    // 1) the band's table: what players play and how it does
    const bk = `env:${day}:${band}`;
    const table = (await this.kv.get<Record<string, EnvCell>>(bk)) ?? {};
    table[arche] = addCell(table[arche], r.score, exp, r.id);
    await this.kv.put(bk, table);
    // 2) the rival's list: result and expectation from the rival's side
    const rk = `envr:${day}`;
    const rivals = (await this.kv.get<Record<string, EnvCell>>(rk)) ?? {};
    const lk = `${r.rivalDeck}@${v}`;
    rivals[lk] = addCell(rivals[lk], 1 - r.score, 1 - exp, r.id);
    await this.kv.put(rk, rivals);
    // 3) the list registry
    await this.noteList(r.deck, r.score, exp, r.id, day, arche === 'other' ? null : arche);
    return true;
  }

  private async noteList(cards: string[], s: number, e: number, id: string, day: string, arche: string | null) {
    const k = sig(cards);
    const rec = (await this.kv.get<DeckListRec>(`dl:${k}`)) ?? { cards: [...cards].sort(), g: 0, s: 0, e: 0, ids: [], first: day, last: day, arche };
    rec.g++; rec.s += s; rec.e += e; rec.last = day; rec.arche = arche;
    const sid = shortId(id);
    if (!rec.ids.includes(sid) && rec.ids.length < 60) rec.ids.push(sid);
    await this.kv.put(`dl:${k}`, rec);
    const idx = (await this.kv.get<Record<string, string>>('dlidx')) ?? {};
    idx[k] = day;
    const keys = Object.keys(idx);
    if (keys.length > MAX_LISTS) {
      // the registry only forgets the index entry; a forgotten list starts over if it comes back
      for (const old of keys.sort((a, b) => idx[a].localeCompare(idx[b])).slice(0, keys.length - MAX_LISTS)) delete idx[old];
    }
    await this.kv.put('dlidx', idx);
  }

  /** An online game between two people: archetype against archetype, from the first archetype's side. */
  async friend(log: GameLog, winner: PlayerIndex | -1): Promise<void> {
    const a = classify(log.decks[0]) ?? 'other', b = classify(log.decks[1]) ?? 'other';
    const [x, y, sx] = a <= b ? [a, b, winner === 0 ? 1 : winner === -1 ? 0.5 : 0] : [b, a, winner === 1 ? 1 : winner === -1 ? 0.5 : 0];
    const k = `envf:${jstDay(this.now())}`;
    const t = (await this.kv.get<Record<string, [number, number]>>(k)) ?? {};
    const c = (t[`${x}|${y}`] ??= [0, 0]);
    c[0]++; c[1] += sx;
    await this.kv.put(k, t);
  }

  /**
   * POST /api/env { days? } → the last `days` days (1–14, default 7) added up: per band and archetype
   * { games, players, score, expected }, per rival list the same from the rival's side, and friend matchups.
   * Public: nothing in it points at a player.
   */
  async env(body: { days?: unknown }): Promise<ApiResult> {
    const n = Math.max(1, Math.min(14, typeof body.days === 'number' ? Math.floor(body.days) : 7));
    const days = Array.from({ length: n }, (_, i) => jstDay(this.now() - i * DAY_MS));
    const bands: Record<string, Record<string, { games: number; players: number; score: number; expected: number }>> = {};
    const rivals: Record<string, { games: number; players: number; score: number; expected: number }> = {};
    const friends: Record<string, [number, number]> = {};
    const merge = (into: Record<string, { games: number; players: number; score: number; expected: number }>, from: Record<string, EnvCell>, ids: Map<string, Set<string>>, pre: string) => {
      for (const [k, c] of Object.entries(from)) {
        const x = (into[k] ??= { games: 0, players: 0, score: 0, expected: 0 });
        x.games += c.g; x.score += c.s; x.expected += c.e;
        const set = ids.get(pre + k) ?? new Set<string>();
        for (const i of c.ids) set.add(i);
        ids.set(pre + k, set);
        x.players = set.size;
      }
    };
    const ids = new Map<string, Set<string>>();
    for (const d of days) {
      for (const t of ['novice', 'keeper', 'smith', 'master', 'sage', 'eternal']) {
        const tab = await this.kv.get<Record<string, EnvCell>>(`env:${d}:${t}`);
        if (tab) merge((bands[t] ??= {}), tab, ids, t + ':');
      }
      const rv = await this.kv.get<Record<string, EnvCell>>(`envr:${d}`);
      if (rv) merge(rivals, rv, ids, 'rv:');
      const f = await this.kv.get<Record<string, [number, number]>>(`envf:${d}`);
      if (f) for (const [k, [g, s]] of Object.entries(f)) { const x = (friends[k] ??= [0, 0]); x[0] += g; x[1] += s; }
    }
    return { status: 200, body: { days: [days[days.length - 1], days[0]], bands, rivals, friends } };
  }

  /** POST /api/env/lists { token, min? } → the distinct lists played by at least `min` players (default 3). Admin only. */
  async lists(body: { token?: unknown; min?: unknown }): Promise<ApiResult> {
    if (!this.adminToken || body.token !== this.adminToken) return bad(403, 'forbidden');
    const min = Math.max(1, typeof body.min === 'number' ? Math.floor(body.min) : 3);
    const idx = (await this.kv.get<Record<string, string>>('dlidx')) ?? {};
    const out: (Omit<DeckListRec, 'ids'> & { players: number })[] = [];
    for (const k of Object.keys(idx)) {
      const r = await this.kv.get<DeckListRec>(`dl:${k}`);
      if (r && r.ids.length >= min) { const { ids, ...rest } = r; out.push({ ...rest, players: ids.length }); }
    }
    return { status: 200, body: { lists: out.sort((a, b) => b.g - a.g) } };
  }

  /** POST /api/decks → the current deck book (empty until the daily tools publish one). */
  async book(): Promise<ApiResult> {
    return { status: 200, body: (await this.kv.get<DeckBook>('book')) ?? EMPTY_BOOK };
  }

  /**
   * POST /api/decks/publish { token, book } → stores a new deck book. Admin only. Every list must pass its 設計図
   * (a book with a failing list is refused whole), the version must go up, and the previous book is kept as book:prev.
   */
  async publish(body: { token?: unknown; book?: unknown }): Promise<ApiResult> {
    if (!this.adminToken || body.token !== this.adminToken) return bad(403, 'forbidden');
    const raw = body.book as DeckBook | undefined;
    const clean = cleanBook(raw);
    const sent = raw && typeof raw === 'object' && raw.decks && typeof raw.decks === 'object' ? Object.keys(raw.decks) : [];
    const kept = Object.keys(clean.decks);
    if (!raw || !sent.length || kept.length !== sent.length || sent.some((id) => !BLUEPRINTS[id])) return bad(400, `refused: ${sent.filter((id) => !kept.includes(id)).join(', ') || 'no lists'}`);
    if (sent.some((id) => raw.decks[id].trial && !clean.decks[id].trial)) return bad(400, 'refused: a trial list fails its checks');
    const cur = (await this.kv.get<DeckBook>('book')) ?? EMPTY_BOOK;
    if (clean.version <= cur.version) return bad(409, `version must be above ${cur.version}`);
    await this.kv.put('book:prev', cur);
    await this.kv.put('book', { ...clean, at: this.now() });
    return { status: 200, body: { ok: true, version: clean.version } };
  }
}
