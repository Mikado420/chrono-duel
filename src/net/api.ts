/** Ranking server calls (same host as online play, over HTTPS). Every call fails soft: the game works offline. */
import type { RankRow } from '../server/leaderboard';
import type { MatchReport, StatsAgg } from '../server/stats';
import { serverUrl } from './config';
import { store } from '../ui/storage';
import { favCard, shownTitle } from '../ui/profile';
import { cleanBook, EMPTY_BOOK, type DeckBook } from '../meta/deckbook';
import { TRANSFER_KEYS, normalizeTransferCode } from '../server/transfer';

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

/** Like `post`, but keeps the status so the screen can say what went wrong (0: no server or no network). */
async function call<T>(path: string, body: unknown, ms = 15000): Promise<{ status: number; body: T | null }> {
  const base = httpBase();
  if (!base) return { status: 0, body: null };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    clearTimeout(t);
    return { status: res.status, body: (await res.json().catch(() => null)) as T | null };
  } catch { return { status: 0, body: null }; }
}

// ------------------------------------------------------------------ 引き継ぎコード
/** Uploads this device's save; the code works once, within 24 hours. */
export async function issueTransfer(): Promise<{ code: string; until: number } | { error: string }> {
  const save: Record<string, string> = {};
  store.account(); // makes sure the device has its id before it is moved
  for (const k of TRANSFER_KEYS) { try { const v = localStorage.getItem(k); if (v !== null) save[k] = v; } catch { /* storage blocked */ } }
  const r = await call<{ code: string; until: number }>('/api/transfer/issue', { save });
  if (r.status === 200 && r.body) return r.body;
  return { error: r.status === 0 ? 'サーバーにつながりません。通信を確かめてください' : r.status === 413 ? 'データが大きすぎて送れませんでした' : '発行できませんでした。時間をおいて試してください' };
}
/** Fetches the save behind a code and writes it over this device's (the caller reloads the page). */
export async function redeemTransfer(code: string): Promise<true | { error: string }> {
  const c = normalizeTransferCode(code);
  if (!c) return { error: 'コードは英数字8文字です（例：AB3D-7KQ9）' };
  const r = await call<{ save: Record<string, string> }>('/api/transfer/redeem', { code: c });
  if (r.status !== 200 || !r.body?.save) return { error: r.status === 0 ? 'サーバーにつながりません。通信を確かめてください' : r.status === 410 ? 'このコードは期限（24時間）が切れています' : 'このコードは見つかりません（使えるのは1回だけです）' };
  try {
    for (const k of TRANSFER_KEYS) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(r.body.save)) if ((TRANSFER_KEYS as readonly string[]).includes(k)) localStorage.setItem(k, v);
    for (const k of ['cd.liveGame', 'cd.online', 'cd.matchOutbox']) localStorage.removeItem(k);
  } catch { return { error: 'この端末に保存できませんでした（ブラウザの保存領域を確かめてください）' }; }
  return true;
}

interface SubmitRes { rating: number; games: number; wins: number; peak: number; accepted: string[]; refused: string[] }
/** Sends finished rated games; on success the server's numbers replace the local ones. Returns true if in sync. */
export async function syncRated(): Promise<boolean> {
  const r = store.rated, acc = store.account();
  const games = r.outbox.slice(0, 20);
  const res = await post<SubmitRes>('/api/rated', { id: acc.id, secret: acc.secret, name: store.settings.name, title: shownTitle()?.id ?? '', fav: favCard(), games });
  if (!res) return false;
  // a server that does not know the roster yet refuses rivals ('rv:'): keep those until it is updated
  const keep = new Set(r.outbox.filter((g) => g.ai.startsWith('rv:') && res.refused.includes(g.gid)).map((g) => g.gid));
  const done = new Set([...res.accepted, ...res.refused.filter((id) => !keep.has(id))]);
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

export interface RankingRes { season?: { id: number; name: string }; total: number; top: RankRow[]; me: (RankRow & { place: number }) | null }
export async function fetchRanking(): Promise<RankingRes | null> {
  const acc = store.account();
  return post<RankingRes>('/api/ranking', { id: acc.id, secret: acc.secret });
}

// ------------------------------------------------------------------ AIのデッキ帳
const BOOK = 'cd.deckBook';
let book: DeckBook = (() => { try { return cleanBook(JSON.parse(localStorage.getItem(BOOK) ?? 'null')); } catch { return EMPTY_BOOK; } })();
/** The rivals' deck book in use (the last one fetched, checked; empty = the built-in lists). */
export const deckBook = () => book;
/** Fetches the deck book (at start). Keeps the previous one when the server cannot be reached or sends an older one. */
export async function refreshDeckBook(): Promise<void> {
  const raw = await post<unknown>('/api/decks', {});
  if (!raw) return;
  const b = cleanBook(raw);
  if (b.version < book.version) return;
  book = b;
  try { localStorage.setItem(BOOK, JSON.stringify(b)); } catch { /* storage full or blocked */ }
}
