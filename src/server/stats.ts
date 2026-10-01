/**
 * Play statistics from real players. After every finished game the client reports its own side: the deck, the cards
 * it actually used and the result. The server keeps running totals per game version, so balance changes never mix
 * with older numbers, de-duplicated by an anonymous device id.
 *
 * Both players of an online game report their own side, so every human seat counts once.
 *
 * Full game records are kept too (src/core/gamelog.ts): games against the AI come with the client's report and are
 * replayed before they are stored; online games are handed over by the room that ran them. Only the admin token
 * reads them back (POST /api/logs, used by `npm run logs`).
 */
import type { AiLevel } from '../core/ai';
import { CARDS } from '../core/cards';
import { isGameLog, replay, type GameLog } from '../core/gamelog';
import type { PlayerIndex } from '../core/engine';
import type { ApiResult, KV, PlayerRec } from './leaderboard';

export type PlayMode = 'free' | 'rated' | 'online';
export interface MatchReport {
  gid: string;
  /** Anonymous device id (the same one the ranking uses). */
  id: string;
  /** Game version (src/version.ts). */
  v: string;
  mode: PlayMode;
  /** The AI level for free and rated play. */
  ai?: AiLevel;
  deck: string[];
  played: string[];
  score: 0 | 0.5 | 1;
  reason: string;
  actions: number;
  ms: number;
  /** The whole game (seat 0 = this player). Games against the AI only; the server replays it before keeping it. */
  log?: GameLog;
  /** Deck names, for reading the logs (the player's deck, the opponent's deck or name). */
  deckName?: string;
  foe?: string;
}

/** One stored game record (GET via POST /api/logs with the admin token). */
export interface StoredLog {
  gid: string;
  v: string;
  at: number;
  /** 'report': sent by a player after a game against the AI (seat 0 is that player). 'room': an online game, kept by the server. */
  src: 'report' | 'room';
  mode: PlayMode;
  ai?: AiLevel;
  /** The reporting device (report) — the same id the ranking uses. */
  id?: string;
  /** Seat names: online, the players' names; report, filled in from the ranking (if the device is ranked) when exported. */
  names?: [string, string];
  deckNames?: [string, string];
  /** Winner seat (−1 a draw) and how it ended. */
  winner: PlayerIndex | -1;
  reason: string;
  ms?: number;
  log: GameLog;
}
/** What an online room hands over when a game ends. */
export interface RoomLog { gid: string; v: string; at: number; names: [string, string]; winner: PlayerIndex | -1; reason: string; ms: number; log: GameLog }
/** [games with the card in the deck, points in those games, games where it was used, points in those games]. */
export type Cell = [number, number, number, number];
export interface StatsAgg {
  v: string;
  /** Per mode key (free-easy … free-expert, rated, online): [games, points]. */
  games: Record<string, [number, number]>;
  cards: Record<string, Record<string, Cell>>;
  updated: number;
}

const LEVELS: AiLevel[] = ['easy', 'normal', 'hard', 'expert'];
const MODES: PlayMode[] = ['free', 'rated', 'online'];
const REASONS = ['ko', 'time', 'surrender', 'timeout', 'disconnect'];
/** Games shorter than this say nothing about the cards (an early surrender). */
export const MIN_REPORT_ACTIONS = 5;
/** Stored game records are kept under this prefix, ordered by version and time. */
export const LOG_PREFIX = 'glog:';
const logKey = (v: string, at: number, gid: string) => `${LOG_PREFIX}${v}:${String(Math.max(0, Math.floor(at))).padStart(14, '0')}:${gid}`;
const shortText = (x: unknown, n = 40) => (typeof x === 'string' ? x.slice(0, n) : undefined);
const sameCards = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const isCard = (c: unknown): c is string => typeof c === 'string' && !!CARDS[c] && !CARDS[c].token;
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });
export const modeKey = (r: Pick<MatchReport, 'mode' | 'ai'>) => (r.mode === 'free' ? `free-${r.ai}` : r.mode);

export class PlayStats {
  /** `adminToken`: the secret that unlocks /api/logs (unset = the logs cannot be read through the API). */
  constructor(private kv: KV, private now: () => number, private adminToken?: string) {}

  /** POST /api/match: one finished game. Refusals are quiet: the client just drops the report. */
  async record(body: Partial<MatchReport>): Promise<ApiResult> {
    const r = body;
    if (typeof r.gid !== 'string' || r.gid.length > 64 || typeof r.id !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(r.id)) return bad(400, 'bad id');
    if (typeof r.v !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.v)) return bad(400, 'bad version');
    if (!MODES.includes(r.mode as PlayMode) || (r.mode !== 'online' && !LEVELS.includes(r.ai as AiLevel))) return bad(400, 'bad mode');
    if (![0, 0.5, 1].includes(r.score as number) || !REASONS.includes(r.reason as string)) return bad(400, 'bad result');
    if (!Array.isArray(r.deck) || r.deck.length > 20 || !r.deck.every(isCard)) return bad(400, 'bad deck');
    if (!Array.isArray(r.played) || r.played.length > 40 || !r.played.every(isCard)) return bad(400, 'bad cards');
    if (typeof r.actions !== 'number' || r.actions < MIN_REPORT_ACTIONS) return { status: 200, body: { ok: false, why: 'short' } };

    // one report per game and device
    const seenKey = `sdev:${r.id}`;
    const seen = (await this.kv.get<string[]>(seenKey)) ?? [];
    if (seen.includes(r.gid)) return { status: 200, body: { ok: true, dup: true } };
    await this.kv.put(seenKey, [r.gid, ...seen].slice(0, 100));

    const key = `sagg:${r.v}`;
    const agg = (await this.kv.get<StatsAgg>(key)) ?? { v: r.v, games: {}, cards: {}, updated: 0 };
    const mk = modeKey(r as MatchReport);
    const g = (agg.games[mk] ??= [0, 0]);
    g[0]++; g[1] += r.score!;
    const cell = (c: string) => ((agg.cards[c] ??= {})[mk] ??= [0, 0, 0, 0]);
    for (const c of new Set(r.deck)) { const x = cell(c); x[0]++; x[1] += r.score!; }
    for (const c of new Set(r.played)) { const x = cell(c); x[2]++; x[3] += r.score!; }
    agg.updated = this.now();
    await this.kv.put(key, agg);
    const versions = (await this.kv.get<string[]>('sver')) ?? [];
    if (!versions.includes(r.v)) await this.kv.put('sver', [...versions, r.v]);
    const logged = r.mode !== 'online' && r.log !== undefined ? await this.keepReport(r as MatchReport) : false;
    return { status: 200, body: { ok: true, logged } };
  }

  /**
   * Keeps the full record of a game against the AI, if it holds up: the actions must replay legally from the seed,
   * seat 0 must be the reported deck, and the replay must end the way the report says (a game that was given up
   * simply stops early).
   */
  private async keepReport(r: MatchReport): Promise<boolean> {
    if (!isGameLog(r.log) || !sameCards(r.log.decks[0], r.deck)) return false;
    const end = replay(r.log);
    if (!end) return false;
    const winner: PlayerIndex | -1 = r.score === 1 ? 0 : r.score === 0 ? 1 : -1;
    if (r.reason === 'ko' || r.reason === 'time') { if (!end.over || end.over.reason !== r.reason || end.over.winner !== winner) return false; }
    else if (end.over || winner !== 1) return false;
    const at = this.now();
    const rec: StoredLog = {
      gid: r.gid, v: r.v, at, src: 'report', mode: r.mode, ...(r.ai ? { ai: r.ai } : {}), id: r.id,
      deckNames: [shortText(r.deckName) ?? '', shortText(r.foe) ?? ''], winner, reason: r.reason, ms: r.ms,
      log: { seed: r.log.seed, first: r.log.first, decks: [r.log.decks[0].slice(), r.log.decks[1].slice()], actions: r.log.actions },
    };
    await this.kv.put(logKey(r.v, at, r.gid), rec);
    return true;
  }

  /** An online game, straight from the room (trusted: the room ran it). */
  async keepRoom(r: RoomLog): Promise<void> {
    const rec: StoredLog = { gid: r.gid, v: r.v, at: r.at, src: 'room', mode: 'online', names: r.names, winner: r.winner, reason: r.reason, ms: r.ms, log: r.log };
    await this.kv.put(logKey(r.v, r.at, r.gid), rec);
  }

  /**
   * POST /api/logs: { token, v?, after?, limit? } → { items, next }. Admin only. Pages through one version's game
   * records, oldest first; pass `next` back as `after` until it is null. Ranked players' names are filled in.
   */
  async logs(body: { token?: unknown; v?: unknown; after?: unknown; limit?: unknown }): Promise<ApiResult> {
    if (!this.adminToken || body.token !== this.adminToken) return bad(403, 'forbidden');
    if (!this.kv.page) return bad(501, 'paging not supported');
    const versions = (await this.kv.get<string[]>('sver')) ?? [];
    const v = typeof body.v === 'string' ? body.v : [...versions].sort(cmpVersion).pop();
    if (!v) return { status: 200, body: { v: null, items: [], next: null } };
    const limit = Math.max(1, Math.min(200, typeof body.limit === 'number' ? Math.floor(body.limit) : 100));
    const prefix = `${LOG_PREFIX}${v}:`;
    const after = typeof body.after === 'string' && body.after.startsWith(prefix) ? body.after : undefined;
    const page = await this.kv.page<StoredLog>(prefix, after, limit);
    const names = new Map<string, string>();
    for (const [, rec] of page) if (rec.src === 'report' && rec.id && !names.has(rec.id)) names.set(rec.id, (await this.kv.get<PlayerRec>(`p:${rec.id}`))?.name ?? '');
    const items = page.map(([, rec]) => (rec.src === 'report' && rec.id ? { ...rec, names: [names.get(rec.id) ?? '', rec.deckNames?.[1] ?? ''] as [string, string] } : rec));
    return { status: 200, body: { v, items, next: page.length === limit ? page[page.length - 1][0] : null } };
  }

  /** POST /api/stats: { v? } → the totals for that version (the newest one by default) and the list of versions. */
  async summary(body: { v?: unknown }): Promise<ApiResult> {
    const versions = (await this.kv.get<string[]>('sver')) ?? [];
    const newest = [...versions].sort(cmpVersion).pop() ?? null;
    const v = typeof body.v === 'string' && versions.includes(body.v) ? body.v : newest;
    const agg = v ? (await this.kv.get<StatsAgg>(`sagg:${v}`)) ?? null : null;
    return { status: 200, body: { versions: [...versions].sort(cmpVersion).reverse(), agg } };
  }
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export interface CardImpact {
  id: string;
  /** Games in which the card was used, over all modes. */
  used: number;
  /** Win % when used. */
  winUsed: number;
  /**
   * Win % when used minus the same players' overall win % in the same modes (weighted by games). This removes the
   * effect of the mode (an easy AI is beaten most of the time whatever the deck) and is the number to compare.
   */
  lift: number;
  /** Games with the card in the deck. */
  inDeck: number;
}
/** Per-card numbers from a version's totals, most used first. */
export function impacts(agg: StatsAgg): CardImpact[] {
  const out: CardImpact[] = [];
  for (const [id, byMode] of Object.entries(agg.cards)) {
    let used = 0, pts = 0, expected = 0, inDeck = 0;
    for (const [mk, [dg, , ug, uw]] of Object.entries(byMode)) {
      const [g, w] = agg.games[mk] ?? [0, 0];
      const base = g ? w / g : 0.5;
      used += ug; pts += uw; expected += ug * base; inDeck += dg;
    }
    out.push({ id, used, winUsed: used ? (100 * pts) / used : 0, lift: used ? (100 * (pts - expected)) / used : 0, inDeck });
  }
  return out.sort((a, b) => b.used - a.used);
}
