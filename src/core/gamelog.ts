/**
 * A full record of one game. The engine is deterministic, so the seed, the two decks, who started and every action
 * (both sides, in order) are enough to rebuild every moment of the game: `replay` does that. The server replays each
 * log before storing it, and the analysis tools (src/sim/logs.ts) replay them to measure anything later.
 */
import { CARDS } from './cards';
import { RULES } from './rules';
import { apply, createGame, legalActions, actor, type Action, type GameEvent, type GameState, type PlayerIndex } from './engine';
import { sameAction } from './net';

export interface GameLog {
  seed: number;
  first: PlayerIndex;
  /** Seat 0 and seat 1. For a game reported by a player, seat 0 is that player. */
  decks: [string[], string[]];
  actions: Action[];
}
/** Longest log the server accepts (a real game has 60–200 actions). */
export const MAX_LOG_ACTIONS = 800;

const isDeck = (d: unknown): d is string[] => Array.isArray(d) && d.length > 0 && d.length <= RULES.DECK_SIZE && d.every((c) => typeof c === 'string' && !!CARDS[c] && !CARDS[c].token);
/** Shape check only (cheap); `replay` checks that the actions were legal. */
export function isGameLog(x: unknown): x is GameLog {
  const l = x as GameLog;
  return !!l && typeof l === 'object' && Number.isInteger(l.seed) && (l.first === 0 || l.first === 1)
    && Array.isArray(l.decks) && l.decks.length === 2 && isDeck(l.decks[0]) && isDeck(l.decks[1])
    && Array.isArray(l.actions) && l.actions.length <= MAX_LOG_ACTIONS && l.actions.every((a) => !!a && typeof a === 'object' && typeof (a as Action).t === 'string');
}

/**
 * Rebuilds the game. Every action must be legal for whoever was to act, or the result is null. `each` is called
 * after every action with the state as it is then, the action, who took it and its events (for analysis).
 */
export function replay(log: GameLog, each?: (s: GameState, a: Action, pi: PlayerIndex, ev: GameEvent[]) => void): GameState | null {
  const { state } = createGame([log.decks[0], log.decks[1]], log.seed, log.first);
  for (const a of log.actions) {
    if (state.over) return null;
    const pi = actor(state);
    const legal = pi === -1 ? undefined : legalActions(state, pi).find((x) => sameAction(x, a));
    if (!legal) return null;
    let ev: GameEvent[];
    try { ev = apply(state, legal); } catch { return null; }
    each?.(state, legal, pi as PlayerIndex, ev);
  }
  return state;
}
