/**
 * The parts of the play statistics a page may use without the server (the strategy wiki): the stored shapes and the
 * per-card numbers. Kept apart from stats.ts so the wiki does not pull in the server (and with it the rated roster).
 */
import type { GameLog } from '../core/gamelog';
import type { PlayerIndex } from '../core/engine';

export type PlayMode = 'free' | 'rated' | 'online';
/** One stored game record (GET via POST /api/logs with the admin token). */
export interface StoredLog {
  gid: string;
  v: string;
  at: number;
  /** 'report': sent by a player after a game against the AI (seat 0 is that player). 'room': an online game, kept by the server. */
  src: 'report' | 'room';
  mode: PlayMode;
  /** The AI's Lv (games against the AI). */
  lv?: number;
  /** Records from before 0.23 name the AI's strength with an older word instead (see lvText). */
  ai?: string;
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
  /** Set when the record did not check out against its report (it is kept anyway). */
  problem?: string;
}

/** [games with the card in the deck, points in those games, games where it was used, points in those games]. */
export type Cell = [number, number, number, number];
export interface StatsAgg {
  v: string;
  /** Per mode key (free-lv1 … free-lv10, rated, online; older versions free-easy … free-expert): [games, points]. */
  games: Record<string, [number, number]>;
  cards: Record<string, Record<string, Cell>>;
  updated: number;
}

/**
 * The Lv range an older record's word stood for. Free play mapped Lv1–2, 3–4, 5–6 and 7–10 to the four words; rated
 * play (a rival's Lv) mapped Lv1, 2–3, 4–5 and 6+ to them.
 */
const OLD_WORDS: Record<string, { free: [number, number]; rated: [number, number] }> = {
  easy: { free: [1, 2], rated: [1, 1] }, normal: { free: [3, 4], rated: [2, 3] }, hard: { free: [5, 6], rated: [4, 5] }, expert: { free: [7, 10], rated: [6, 12] },
};
/** The AI's strength of a record as text: "Lv5", or a range for older records ("Lv5〜6"). */
export function lvText(r: { mode?: string; lv?: number; ai?: string }): string {
  if (r.lv) return `Lv${r.lv}`;
  const w = r.ai ? OLD_WORDS[r.ai] : undefined;
  if (!w) return '';
  const [a, b] = r.mode === 'rated' ? w.rated : w.free;
  return a === b ? `Lv${a}` : `Lv${a}〜${b}`;
}
/** A mode key of the totals as text: フリー（Lv5）, フリー（Lv5〜6） for an older key, レート戦, フレンド対戦. */
export function modeText(key: string): string {
  if (key === 'rated') return 'レート戦';
  if (key === 'online') return 'フレンド対戦';
  const m = key.match(/^free-(?:lv(\d+)|(\w+))$/);
  if (!m) return key;
  return `フリー（${m[1] ? `Lv${m[1]}` : lvText({ mode: 'free', ai: m[2] }) || m[2]}）`;
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
