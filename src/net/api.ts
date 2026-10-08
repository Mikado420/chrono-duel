/** Ranking server calls (same host as online play, over HTTPS). Every call fails soft: the game works offline. */
import type { RankRow } from '../server/leaderboard';
import type { MatchReport, StatsAgg } from '../server/stats';
import { serverUrl } from './config';
import { store } from '../ui/storage';
import { favCard, shownTitle } from '../ui/profile';

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
  const res = await post<SubmitRes>('/api/rated', { id: acc.id, secret: acc.secret, name: store.settings.name, title: shownTitle()?.id ?? '', fav: favCard(), games });
  if (!res) return false;
  const done = new Set([...res.accepted, ...res.refused]);
  r.outbox = r.outbox.filter((g) => !done.has(g.gid));
  // the server is authoritative once everything has been delivered
  if (!r.outbox.length) { r.rating = res.rating; r.games = res.games; r.wins = res.wins; r.peak = Math.max(r.peak, res.peak); }
  store.saveRated();
  return r.outbox.length === 0;
}

// ------------------------------------------------------------------ play statistics
const OUTBOX = 'cd.matchOutbox';
function readOutbox(): MatchReport[] { try { return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]') as MatchReport[]; } catch { return []; } }
function writeOutbox(l: MatchReport[]) {
  try { localStorage.setItem(OUTBOX, JSON.stringify(l.slice(-30))); }
  catch {
    // storage full: keep the totals, drop the bulky game records
    try { localStorage.setItem(OUTBOX, JSON.stringify(l.slice(-30).map((m) => { const c = { ...m }; delete c.log; return c; }))); } catch { /* blocked */ }
  }
}
/**
 * The game against the AI being played right now, as a report that would count it as abandoned. Updated after every
 * action and cleared when the game ends; if the app is closed mid-game, the next start sends it (so no game is lost).
 */
const LIVE = 'cd.liveGame';
export function saveLiveGame(r: MatchReport | null) { try { if (r) localStorage.setItem(LIVE, JSON.stringify(r)); else localStorage.removeItem(LIVE); } catch { /* storage full or blocked */ } }
export function takeLiveGame(): MatchReport | null {
  try { const t = localStorage.getItem(LIVE); localStorage.removeItem(LIVE); return t ? (JSON.parse(t) as MatchReport) : null; } catch { return null; }
}
/** Queues one finished game for the play statistics and sends everything waiting. Fails soft (kept for next time). */
export async function reportMatch(r?: MatchReport): Promise<void> {
  const box = readOutbox();
  if (r) { box.push(r); writeOutbox(box); }
  if (!httpBase()) return;
  const left: MatchReport[] = [];
  for (const m of box) {
    // no answer: keep it for later. Any answer from the server (even a refusal) means it is handled.
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      await fetch(httpBase() + '/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m), signal: ctl.signal });
      clearTimeout(t);
    } catch { left.push(m); }
  }
  writeOutbox(left);
}
export interface StatsRes { versions: string[]; agg: StatsAgg | null }
export const fetchStats = (v?: string) => post<StatsRes>('/api/stats', v ? { v } : {});

export interface RankingRes { total: number; top: RankRow[]; me: (RankRow & { place: number }) | null }
export async function fetchRanking(): Promise<RankingRes | null> {
  const acc = store.account();
  return post<RankingRes>('/api/ranking', { id: acc.id, secret: acc.secret });
}
