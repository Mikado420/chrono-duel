/**
 * The parts of the play statistics a page may use without the server (the strategy wiki): the stored shapes and the
 * per-card numbers. Kept apart from stats.ts so the wiki does not pull in the server (and with it the rated roster).
 */
import type { GameLog } from '../core/gamelog';
import type { PlayerIndex } from '../core/engine';
import type { AiLevel } from '../core/ai';

export type PlayMode = 'free' | 'rated' | 'online';
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
  /** Set when the record did not check out against its report (it is kept anyway). */
  problem?: string;
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
