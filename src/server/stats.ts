/**
 * Play statistics from real players. After every finished game the client reports its own side: the deck, the cards
 * it actually used and the result. The server keeps running totals per game version, so balance changes never mix
 * with older numbers. Only totals are stored (no per-game log), keyed by an anonymous device id for de-duplication.
 *
 * Both players of an online game report their own side, so every human seat counts once.
 */
import type { AiLevel } from '../core/ai';
import { CARDS } from '../core/cards';
import type { ApiResult, KV } from './leaderboard';

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
}
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
const isCard = (c: unknown): c is string => typeof c === 'string' && !!CARDS[c] && !CARDS[c].token;
const bad = (status: number, error: string): ApiResult => ({ status, body: { error } });
export const modeKey = (r: Pick<MatchReport, 'mode' | 'ai'>) => (r.mode === 'free' ? `free-${r.ai}` : r.mode);

export class PlayStats {
  constructor(private kv: KV, private now: () => number) {}

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
    return { status: 200, body: { ok: true } };
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
