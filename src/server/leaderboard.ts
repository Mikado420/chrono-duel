/**
 * Friends' ranking for rated play. Platform independent: the Cloudflare Durable Object and the local dev server both
 * drive this class over a tiny key-value store.
 *
 * The server never trusts a rating number from a client. Clients report finished games and the server replays the
 * same rating rules (src/meta/rating.ts). Games that are too short, too frequent or repeated are refused.
 */
import { CARDS } from '../core/cards';
import { cleanName } from '../core/net';
import { titleOpen } from '../meta/titles';
import { jstDay } from '../meta/ranks';
import { OPP_SPREAD, RATING_RESET, START_RATING, applyRatingReset, foeById, nextRating, rollSeason, seasonAt, tierOf, type SeasonResult, type SubmitReq } from '../meta/rating';
import type { PlayStats } from './stats';
import type { Transfer } from './transfer';
import type { Replays } from './replays';

export interface KV {
  get<T>(k: string): Promise<T | undefined>;
  put(k: string, v: unknown): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
  /** Up to `limit` entries under `prefix` whose keys sort after `after`, in key order (for large collections). */
  page?<T>(prefix: string, after: string | undefined, limit: number): Promise<[string, T][]>;
  delete?(k: string): Promise<void>;
}
export interface PlayerRec { id: string; key: string; name: string; rating: number; games: number; wins: number; peak: number; lastAt: number; lastGids: string[]; created: number; reset?: string; season?: number; sPeak?: number; sGames?: number; sWins?: number; seasons?: SeasonResult[]; title?: string; fav?: string }
/** `prev`: the place at the end of the previous day the ranking was looked at (null: was not ranked then). */
export interface RankRow { name: string; rating: number; tier: string; games: number; wins: number; peak: number; me?: boolean; title?: string; fav?: string; prev?: number | null }
/** Places by player id for one day (Japan time), kept to show how places moved since the day before. */
interface PlaceSnap { day: string; prev: Record<string, number>; cur: Record<string, number> }
/** The ranking's day, in Japan time (the players' day). */
export const rankDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** A rated game against the AI takes longer than this (it also stops scripted spamming). */
export const MIN_GAME_MS = 60_000;
export const MIN_ACTIONS = 5;

export type ApiResult = { status: number; body: unknown };
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const validId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(s);

export class Leaderboard {
  constructor(private kv: KV, private now: () => number) {}

  private async auth(id: unknown, secret: unknown, name?: unknown): Promise<PlayerRec | ApiResult> {
    if (!validId(id) || !validId(secret)) return bad(400, 'bad id');
    const key = await sha(`${id}:${secret}`);
    const rec = await this.kv.get<PlayerRec>(`p:${id}`);
    if (rec) {
      if (rec.key !== key) return bad(403, 'wrong key');
      const reset = applyRatingReset(rec);
      const day = jstDay(this.now()), was = rec.season;
      rollSeason(rec, day);
      if (reset || rec.season !== was) await this.kv.put(`p:${id}`, rec);
      return rec;
    }
    const fresh: PlayerRec = { id, key, name: cleanName(name), rating: START_RATING, games: 0, wins: 0, peak: START_RATING, lastAt: 0, lastGids: [], created: this.now(), reset: RATING_RESET, season: seasonAt(jstDay(this.now())).id, sPeak: START_RATING, sGames: 0, sWins: 0 };
    await this.kv.put(`p:${id}`, fresh);
    return fresh;
  }

  /** POST /api/rated: { id, secret, name, games: SubmitReq[] } → the authoritative record. */
  async submit(body: { id?: unknown; secret?: unknown; name?: unknown; games?: unknown; title?: unknown; fav?: unknown }): Promise<ApiResult> {
    const rec = await this.auth(body.id, body.secret, body.name);
    if ('status' in rec) return rec;
    if (body.name !== undefined) rec.name = cleanName(body.name);
    // what others see next to the name: a real title and a real card, or nothing
    if (body.title !== undefined) { if (typeof body.title === 'string' && titleOpen(body.title, jstDay(this.now()))) rec.title = body.title; else delete rec.title; }
    if (body.fav !== undefined) { if (typeof body.fav === 'string' && CARDS[body.fav] && !CARDS[body.fav].token) rec.fav = body.fav; else delete rec.fav; }
    const games = Array.isArray(body.games) ? (body.games as SubmitReq[]).slice(0, 20) : [];
    const accepted: string[] = [], refused: string[] = [];
    for (const g of games) {
      const wellFormed = g && typeof g.gid === 'string' && g.gid.length <= 64 && typeof g.ai === 'string' && !!foeById(g.ai) && [0, 0.5, 1].includes(g.score)
        && typeof g.actions === 'number' && typeof g.ms === 'number' && typeof g.at === 'number' && g.at <= this.now() + 60_000 && !rec.lastGids.includes(g.gid);
      // losses always count (quitting early must not dodge one); wins and draws need a real game, spaced out
      const ok = wellFormed && (g.score === 0 || (g.actions >= MIN_ACTIONS && g.ms >= MIN_GAME_MS && g.at - rec.lastAt >= MIN_GAME_MS));
      if (!ok) { if (g && typeof g.gid === 'string') refused.push(g.gid); continue; }
      // the opponent's shown rating must fit its level, so a client cannot invent a very strong opponent
      const base = foeById(g.ai)!.rating;
      const opp = typeof g.opp === 'number' && Math.abs(g.opp - base) <= OPP_SPREAD ? g.opp : base;
      rec.rating = nextRating(rec.rating, rec.games, opp, g.score);
      rec.games++;
      if (g.score === 1) rec.wins++;
      rec.sGames = (rec.sGames ?? 0) + 1;
      if (g.score === 1) rec.sWins = (rec.sWins ?? 0) + 1;
      rec.sPeak = Math.max(rec.sPeak ?? rec.rating, rec.rating);
      rec.peak = Math.max(rec.peak, rec.rating);
      rec.lastAt = g.at;
      rec.lastGids = [g.gid, ...rec.lastGids].slice(0, 50);
      accepted.push(g.gid);
    }
    await this.kv.put(`p:${rec.id}`, rec);
    return { status: 200, body: { rating: rec.rating, games: rec.games, wins: rec.wins, peak: rec.peak, name: rec.name, season: rec.season, accepted, refused } };
  }

  /** POST /api/ranking: { id?, secret? } → top players and the caller's place. */
  async ranking(body: { id?: unknown; secret?: unknown }, limit = 50): Promise<ApiResult> {
    // the ranking is per season: players who have not been back since the ranks were redrawn or a season turned are
    // shown as they will be when they return (and saved then)
    const today = jstDay(this.now()), season = seasonAt(today);
    const all = (await this.kv.list<PlayerRec>('p:')).filter((p) => p.games > 0);
    for (const p of all) { applyRatingReset(p); rollSeason(p, today); }
    const live = all.filter((p) => (p.sGames ?? 0) > 0);
    all.length = 0; all.push(...live);
    all.sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.created - b.created);
    // yesterday's places: the last places seen on an earlier day
    const day = rankDay(this.now());
    const cur: Record<string, number> = {};
    all.forEach((p, i) => { cur[p.id] = i + 1; });
    const old = await this.kv.get<PlaceSnap>('rk:snap');
    const snap: PlaceSnap = !old ? { day, prev: {}, cur } : old.day === day ? { ...old, cur } : { day, prev: old.cur, cur };
    await this.kv.put('rk:snap', snap);
    const row = (p: PlayerRec, me: boolean): RankRow => ({
      name: p.name, rating: p.rating, tier: tierOf(p.rating).tier.id, games: p.sGames ?? p.games, wins: p.sWins ?? p.wins, peak: p.peak,
      ...(p.title && titleOpen(p.title, today) ? { title: p.title } : {}), ...(p.fav ? { fav: p.fav } : {}), prev: snap.prev[p.id] ?? null, ...(me ? { me: true } : {}),
    });
    let meId: string | null = null;
    if (validId(body.id) && validId(body.secret)) {
      const rec = await this.kv.get<PlayerRec>(`p:${body.id}`);
      if (rec && rec.key === (await sha(`${body.id}:${body.secret}`))) meId = rec.id;
    }
    const top = all.slice(0, limit).map((p) => row(p, p.id === meId));
    const idx = meId ? all.findIndex((p) => p.id === meId) : -1;
    return { status: 200, body: { season: { id: season.id, name: season.name }, total: all.length, top, me: idx >= 0 ? { place: idx + 1, ...row(all[idx], true) } : null } };
  }
}

/** Routes /api/* requests to the leaderboard. Shared by the Worker and the dev server. */
export async function handleApi(lb: Leaderboard, path: string, method: string, body: unknown, stats?: PlayStats, more: { transfer?: Transfer; replays?: Replays } = {}): Promise<ApiResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (method !== 'POST') return bad(405, 'use POST');
  if (path === '/api/rated') return lb.submit(b);
  if (path === '/api/ranking') return lb.ranking(b);
  if (more.transfer && path === '/api/transfer/issue') return more.transfer.issue(b);
  if (more.transfer && path === '/api/transfer/redeem') return more.transfer.redeem(b);
  if (more.replays && path === '/api/replay/save') return more.replays.save(b);
  if (more.replays && path === '/api/replay/get') return more.replays.get(b);
  if (stats && path === '/api/match') return stats.record(b);
  if (stats && path === '/api/stats') return stats.summary(b);
  if (stats && path === '/api/logs') return stats.logs(b);
  if (stats && path === '/api/env') return stats.env.env(b);
  if (stats && path === '/api/env/lists') return stats.env.lists(b);
  if (stats && path === '/api/decks') return stats.env.book();
  if (stats && path === '/api/decks/publish') return stats.env.publish(b);
  return bad(404, 'not found');
}
