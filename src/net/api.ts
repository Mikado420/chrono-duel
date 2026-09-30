/** Ranking server calls (same host as online play, over HTTPS). Every call fails soft: the game works offline. */
import type { RankRow } from '../server/leaderboard';
import { serverUrl } from './config';
import { store } from '../ui/storage';

const httpBase = () => serverUrl()?.replace(/^ws/, 'http') ?? null;
export const rankingAvailable = () => httpBase() !== null;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const base = httpBase();
  if (!base) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

interface SubmitRes { rating: number; games: number; wins: number; peak: number; accepted: string[]; refused: string[] }
/** Sends finished rated games; on success the server's numbers replace the local ones. Returns true if in sync. */
export async function syncRated(): Promise<boolean> {
  const r = store.rated, acc = store.account();
  const games = r.outbox.slice(0, 20);
  const res = await post<SubmitRes>('/api/rated', { id: acc.id, secret: acc.secret, name: store.settings.name, games });
  if (!res) return false;
  const done = new Set([...res.accepted, ...res.refused]);
  r.outbox = r.outbox.filter((g) => !done.has(g.gid));
  // the server is authoritative once everything has been delivered
  if (!r.outbox.length) { r.rating = res.rating; r.games = res.games; r.wins = res.wins; r.peak = Math.max(r.peak, res.peak); }
  store.saveRated();
  return r.outbox.length === 0;
}

export interface RankingRes { total: number; top: RankRow[]; me: (RankRow & { place: number }) | null }
export async function fetchRanking(): Promise<RankingRes | null> {
  const acc = store.account();
  return post<RankingRes>('/api/ranking', { id: acc.id, secret: acc.secret });
}
